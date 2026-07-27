# MCP Capability Grid Implementation Plan

Status: runtime foundation, control plane, and optional TooS REST façade implemented; production integrations remain
Last updated: 2026-07-20

## 1. Outcome

Build a small, secure platform in which containerized MCP workers register themselves, clients discover healthy services, and all external MCP traffic passes through a single authenticated gateway.

The repository now contains a runnable Compose stack, authenticated MCP gateway,
lease-based service registry, worker template, clients, and a persistent
control-plane dashboard for service, tool, and skill definitions, plus an
authenticated REST adapter for applications that do not host an MCP client.

## 2. Architecture decisions

### 2.1 Separate the control plane from the data plane

- **Traefik is the data plane.** It terminates TLS, authenticates external requests, applies routing and rate limits, and forwards MCP traffic to workers.
- **The registry is the control plane.** It accepts registrations and heartbeats and returns healthy service descriptors. A bounded `/api/v1` adapter can translate ordinary HTTP calls to MCP for non-MCP applications.
- **Workers own capabilities.** Each worker serves its live MCP tool schema and executes its own tools.
- **Clients discover through the registry and invoke through Traefik.** MCP-native clients call workers directly; ordinary HTTP clients use the authenticated TooS adapter. Public responses never expose private Docker addresses.

Direct MCP remains the lowest-overhead path. The optional adapter trades one
extra hop for much simpler integration and can be split out for independent
scaling if it becomes a bottleneck (ADR 0004).

### 2.2 Use current MCP transport semantics

- Use MCP **Streamable HTTP**, not the legacy HTTP+SSE transport.
- Give every worker one MCP endpoint, `/mcp`, supporting the protocol's required HTTP methods.
- Use the official MCP client for native initialization, `tools/list`, and
  `tools/call`. Use only the documented `/api/v1` façade when a normal REST
  integration is required.
- Pin the MCP Python SDK to a tested major/minor range and upgrade deliberately.
- Validate request origins and require authentication at the public boundary.

### 2.3 Keep discovery metadata small and authoritative

The registry stores reachability and deployment metadata, not the canonical tool schema:

```json
{
  "service_id": "backup-worker",
  "display_name": "System Backup Service",
  "internal_mcp_url": "http://backup-worker:8000/mcp",
  "public_mcp_url": "https://api.homelab.local/services/backup-worker/mcp",
  "health_url": "http://backup-worker:8000/healthz",
  "revision": "git-sha-or-image-digest",
  "lease_id": "opaque-registry-issued-id",
  "last_seen": "2026-07-15T02:40:00Z"
}
```

The registry derives health from lease expiry; workers may not submit their own `status`. A later optimization may cache tool summaries with a short TTL, but clients must be able to refresh schemas from the worker.

### 2.4 Define one versioned registry contract

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/v1/services/register` | Idempotently create or replace a service lease. |
| `PUT` | `/v1/services/{service_id}/heartbeat` | Renew a lease using its credential or lease ID. |
| `DELETE` | `/v1/services/{service_id}` | Gracefully deregister the current lease. |
| `GET` | `/v1/services` | Return healthy public service descriptors. |
| `GET` | `/v1/services/{service_id}` | Return one healthy descriptor or `404`. |
| `GET` | `/healthz` | Process liveness. |
| `GET` | `/readyz` | Dependency readiness, including Redis. |

Rules:

- `service_id` is a unique lowercase DNS-style slug.
- Registration validates URL schemes, host allowlists, payload size, and duplicate ownership.
- Registration and heartbeat requests are authenticated on the internal network.
- Workers heartbeat every 20 seconds with timeout, retry, exponential backoff, and jitter.
- A 60-second lease expiry removes a worker from discovery.
- Redis is the production store so expiry is atomic and multiple registry replicas are possible. An in-memory store is allowed only for tests/local development.

### 2.5 Use a resilient worker lifecycle

The worker template will:

1. Start its MCP and health endpoints.
2. Register only after it is ready to accept traffic.
3. Run a supervised heartbeat task using the SDK-supported application lifespan mechanism.
4. Re-register after a missing/expired lease.
5. Attempt deregistration during graceful shutdown.
6. Continue serving existing traffic during a brief registry outage while reporting degraded readiness.

All network calls require explicit connect/read timeouts. Background-task exceptions must be logged and restarted rather than silently terminating registration.

### 2.6 Establish a security boundary

- Only Traefik publishes host ports; workers, Redis, and the registry remain on internal Docker networks unless an administrative discovery endpoint is intentionally exposed.
- Use TLS and an external ForwardAuth/OIDC service at the gateway. A static bearer-token validator may be used for an explicitly labeled local MVP, but is not the long-term authorization design.
- Use scoped identities so discovery, registration, and tool execution are separate permissions.
- Never put tokens, passwords, or password hashes in Compose labels or committed `.env` files; use Docker secrets or an external secret store.
- Mount the Docker socket read-only for the MVP and plan migration to a restricted socket proxy.
- Set `providers.docker.exposedByDefault=false` and explicitly label public routes.
- Add rate limits, request/body limits, audit events, and per-tool authorization for destructive capabilities.
- Treat service URLs as untrusted input to prevent registry-driven SSRF.

## 3. Target repository layout

```text
.
├── README.md
├── PLAN.md
├── docker-compose.yml
├── .env.example
├── orchestrator/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── src/registry/
│   │   ├── api.py
│   │   ├── config.py
│   │   ├── models.py
│   │   ├── repository.py
│   │   └── security.py
│   └── tests/
├── worker_template/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── src/worker/
│   │   ├── server.py
│   │   ├── lifecycle.py
│   │   └── config.py
│   └── tests/
├── clients/
│   ├── python/
│   └── typescript/
├── auth/
└── docs/
    ├── architecture.md
    ├── registry-api.md
    ├── worker-guide.md
    ├── operations.md
    └── threat-model.md
```

## 4. Delivery roadmap

### Phase 0 — Contract and test skeleton

Status: implemented.

Deliverables:

- Record the architecture decisions above in short ADRs.
- Define Pydantic request/response models and an OpenAPI contract for the registry.
- Define configuration names, defaults, validation, and `.env.example` without secrets.
- Add unit/integration test scaffolding and CI commands.

Acceptance criteria:

- The registry contract has one naming convention and no `/discover` versus `/discovery` ambiguity.
- Invalid service IDs, external/private-host violations, duplicate leases, and stale heartbeats have specified responses.
- SDK, Python, image, and infrastructure versions are pinned to tested ranges.

### Phase 1 — Runnable local foundation

Status: implemented and verified with Docker Compose.

Deliverables:

- Scaffold the registry and one harmless example worker.
- Add multi-stage, non-root Dockerfiles with locked dependencies.
- Correct Compose networking and ports:
  - define and consistently use `mcp_net`;
  - attach Traefik to the worker-facing network;
  - listen on container port `80` and publish `8089:80`, or listen/publish `8089:8089` consistently;
  - use registry port `8000` consistently;
  - declare explicit Traefik backend ports;
  - add health checks and readiness-gated dependencies.
- Add Redis with a persistent volume for the registry store.

Acceptance criteria:

- `docker compose config` succeeds.
- `docker compose up --build` reaches healthy state from a clean checkout.
- Only the gateway is externally reachable.
- The example worker answers MCP initialization and `tools/list` at its routed `/mcp` URL.

### Phase 2 — Registration and leases

Status: implemented and verified against Redis.

Deliverables:

- Implement authenticated register, heartbeat, deregister, list, and get operations.
- Implement Redis TTL-backed leases and atomic ownership checks.
- Add worker lifecycle registration, supervised heartbeat, retry/backoff/jitter, and graceful shutdown.
- Return public gateway URLs from discovery.

Acceptance criteria:

- Registration and heartbeat are idempotent for the current lease.
- A stopped worker disappears from discovery within 60 seconds.
- A restarted worker re-registers without manual cleanup.
- Registry restart does not lose active leases when Redis remains available.
- Spoofed lease updates and disallowed endpoint URLs are rejected.

### Phase 3 — Gateway and authorization

Status: local bearer ForwardAuth implemented; OIDC and TLS remain production work.

Deliverables:

- Configure Traefik routers, explicit service ports, path rewriting, TLS, security headers, and rate limits.
- Integrate a ForwardAuth/OIDC provider; document the local-only token fallback if retained.
- Protect registry administration separately from MCP invocation.
- Add origin validation and request-size limits compatible with Streamable HTTP.

Acceptance criteria:

- Missing, invalid, expired, and under-scoped credentials are rejected.
- Authenticated MCP streaming survives the gateway without buffering/session failures.
- Internal container addresses and credentials never appear in public discovery responses or logs.
- Destructive tools require a stronger scope than read-only tools.

### Phase 4 — Reusable clients and schema discovery

Status: Python and TypeScript clients plus live REST capability discovery and
invocation implemented; caching/circuit-breaking remains future work.

Deliverables:

- Build small Python and TypeScript clients that call `/v1/services`, connect with the official MCP SDK, initialize sessions, and retrieve tools.
- Define refresh behavior for service additions/removals and tool-list changes.
- Add bounded concurrency, timeouts, retries only for safe/idempotent operations, and circuit breaking.
- Provide a CLI/Inspector-based smoke-test workflow before building a dashboard.

Acceptance criteria:

- A client discovers a newly registered worker without redeployment.
- A removed worker is evicted without taking down unrelated tools.
- Tool names are namespaced by `service_id` to prevent collisions.
- Tool-call failures preserve MCP error details and correlation IDs.

### Phase 5 — Operations and pilot migration

Status: baseline container restrictions, health checks, bounded logs, documentation, and smoke tests implemented. External observability, alerting, backups, and pilot migrations remain.

Deliverables:

- Emit structured logs to stdout and collect them with the chosen log backend; do not use a shared writable log volume.
- Add metrics for registrations, lease expiry, request latency, tool errors, auth failures, and active MCP sessions.
- Add correlation IDs, audit records, dashboards, alerts, backups, and restore/runbook tests.
- Threat-model high-risk workers and implement egress/filesystem/resource restrictions.
- Migrate two low-risk, idempotent scripts before browser, cloud, firewall, or cluster-administration workers.

Acceptance criteria:

- Operators can identify a failed tool call across gateway, registry discovery, and worker logs.
- Alerts fire for registry unavailability, heartbeat loss, auth failure spikes, and tool error-rate thresholds.
- Restore and rollback procedures are tested.
- Each pilot has an owner, least-privilege permissions, resource limits, tool-level tests, and documented failure behavior.

## 5. Test strategy

- **Unit:** validation, lease transitions, URL allowlists, configuration, and worker retry behavior.
- **Contract:** OpenAPI request/response compatibility and MCP initialization/tool schemas.
- **Integration:** registry + Redis, worker lifecycle, and authenticated Traefik routing.
- **Failure:** worker crash, Redis restart, registry restart, gateway restart, network partition, stale lease, duplicate ID, and malformed MCP request.
- **Security:** auth bypass, scope enforcement, SSRF, origin spoofing, secret leakage, oversized payloads, and rate limiting.
- **End-to-end:** discover a worker, list tools, invoke a harmless tool, stop the worker, and verify expiry.

## 6. Remaining production gaps, in priority order

1. Replace the local static-token adapter with OIDC, scoped authorization, and TLS.
2. Move credentials from Compose environment variables to a managed secret store and proxy Docker socket access.
3. Export metrics, centralize structured logs, add dashboards/alerts, and retain audit events.
4. Test backup/restore, rollback, registry high availability, and sustained-load behavior.
5. Add live client refresh/circuit-breaking and per-tool authorization before onboarding privileged workers.
6. Migrate two low-risk idempotent pilot automations and document their ownership and failure modes.

Do not onboard privileged services such as firewall, Docker/Kubernetes administration, GitHub mutation, or cloud control until Phases 1–4 meet their acceptance criteria.

## 7. Reference baseline

- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [Official MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)
- [Traefik ForwardAuth middleware](https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/forwardauth/)
- [Traefik Docker provider](https://doc.traefik.io/traefik/reference/install-configuration/providers/docker/)
- [Docker Compose startup and health dependencies](https://docs.docker.com/compose/how-tos/startup-order/)
