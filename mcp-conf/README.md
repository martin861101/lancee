# MCP Capability Grid

A runnable local foundation for discovering and invoking containerized MCP workers through an authenticated gateway.

## What is implemented

- Traefik gateway with ForwardAuth, path routing, security headers, rate limits, and bounded access logs.
- Local bearer-token ForwardAuth adapter designed to be replaced by OIDC in production.
- FastAPI registry with service-scoped authentication, validated registration, Redis TTL leases, heartbeat/deregistration, and public discovery responses.
- Authenticated Tools-as-a-Service REST façade for live capability discovery,
  skill retrieval, and tool calls from any HTTP-capable server application.
- Responsive control-plane dashboard with Redis-backed service, tool, and skill catalogs, relationship validation, protected CRUD APIs, and audit activity.
- Catalog-driven integration builder with expiring plans and an idempotent local
  installer for TypeScript and Python applications.
- Stateless MCP Streamable HTTP worker with supervised registration, heartbeat retry/backoff, health/readiness endpoints, and origin checks.
- Example `echo` and `add` MCP tools.
- Production browser/document worker with ten executable Playwright,
  Puppeteer, web-audit, extraction, and modern PDF tools.
- Three lightweight core services for deterministic text processing, bounded
  CSV/JSON conversion, hashing, Base64, and UUID generation.
- Read-only Astryx design-system worker with component, hook, reference,
  template, theme, and cross-domain search tools pinned to Astryx `0.1.7`.
- Authenticated expiring artifacts plus seven browser skills and three core
  utility skills.
- Installable Python and TypeScript clients supporting both simple REST calls
  and native MCP sessions.
- Unit, contract, lifecycle, and Compose validation paths.

## Quick start

1. Create local secrets:

   ```bash
   cp .env.example .env
   openssl rand -hex 32
   openssl rand -hex 32
   ```

   Put the two different generated values into `PUBLIC_API_TOKEN` and `WORKER_REGISTRATION_TOKEN` in `.env`.

2. Validate and start the stack:

   ```bash
   docker compose config --quiet
   docker compose up --build --detach --wait
   ```

   Seed or reconcile all catalog definitions:

   ```bash
   set -a
   . ./.env
   set +a
   MCP_API_TOKEN="$PUBLIC_API_TOKEN" make seed
   ```

3. Discover healthy services:

   ```bash
   set -a
   . ./.env
   set +a
   curl --fail --header "Authorization: Bearer $PUBLIC_API_TOKEN" \
     http://localhost:8089/registry/v1/services
   ```

4. Inspect tools with the Python client:

   ```bash
   python -m venv .venv
   .venv/bin/pip install ./clients/python
   MCP_API_TOKEN="$PUBLIC_API_TOKEN" .venv/bin/mcp-grid --service example-worker
   ```

5. Call a tool from any server-side application with normal HTTP:

   ```bash
   curl --fail \
     --header "Authorization: Bearer $PUBLIC_API_TOKEN" \
     --header "Content-Type: application/json" \
     --data '{"left":20,"right":22}' \
     http://localhost:8089/api/v1/services/example-worker/tools/add/call
   ```

   The response includes `data: 42.0` plus the original MCP result. No MCP SDK
   or copied bridge script is required.

6. Open the dashboard:

   ```text
   http://localhost:8089/
   ```

   Sign in with the `PUBLIC_API_TOKEN` value. In the hosted deployment, use
   `https://mcp.hygridtech.co.za/`. Skill instructions support documents up to
   100,000 characters, and validation errors identify the exact field.

7. Build a dynamic application integration:

   Choose **Integrate**, select tools or skills, and copy the generated
   `mcp-grid integrate` command. The CLI prompts to update an existing file or
   create a new one, shows the diff, and generates calls through the universal
   `/api/v1/tools/{tool_id}/call` route.

   A generated, verified Python example for the complete Astryx UI Research
   skill is available at [`examples/astryx_integration.py`](examples/astryx_integration.py).

Stop the stack with `docker compose down`. Add `--volumes` only when intentionally deleting registry data.

When publishing through a reverse proxy, set `PUBLIC_GATEWAY_URL` to the public
HTTPS origin and add the public hostname to the worker's
`WORKER_ALLOWED_HOSTS`. Keep DNS-rebinding protection enabled; requests with
unlisted `Host` headers are intentionally rejected.

## Documentation

- [`PLAN.md`](PLAN.md): implementation roadmap, acceptance criteria, and remaining production work.
- [`MCP.md`](MCP.md): MCP endpoint and client usage.
- [`docs/architecture.md`](docs/architecture.md): component responsibilities and request flows.
- [`docs/registry-api.md`](docs/registry-api.md): registry contract.
- [`docs/toos-api.md`](docs/toos-api.md): universal HTTP API, client packages,
  invocation responses, and copy-paste integration blocks.
- [`docs/worker-guide.md`](docs/worker-guide.md): creating and operating workers.
- [`docs/operations.md`](docs/operations.md): deployment, validation, recovery, and OIDC migration.
- [`docs/threat-model.md`](docs/threat-model.md): trust boundaries, risks, and controls.
- [`docs/dashboard.md`](docs/dashboard.md): control-plane UI, catalog semantics, API routes, and operations.
- [`docs/dynamic-integrations.md`](docs/dynamic-integrations.md): catalog
  selector, expiring plans, local installer, generated interfaces, and safety
  boundary.
- [`docs/browser-document-worker.md`](docs/browser-document-worker.md): executable browser/PDF tools, safeguards, deployment, and extension workflow.
- [`docs/core-services.md`](docs/core-services.md): text, structured-data, and
  utility services with their tools and usage examples.
- [`docs/astryx-worker.md`](docs/astryx-worker.md): Astryx MCP tools, deployment,
  security boundary, catalog seeding, and invocation examples.
- [`docs/tool-development.md`](docs/tool-development.md): build/install lifecycle, runtime verification, safe UI installer design, and Basebox/Hermes integration.
- [`usecase.md`](usecase.md): seamless React integration using a tiny `api/mcp.js` helper, a token-safe bridge, and directly renderable temporary artifact links.
- [`agent_basebox.md`](agent_basebox.md): handoff prompt for correcting Basebox's MCP Streamable HTTP client headers.

The older `REG-DISC.md`, `registry_service.md`, `docker_conf.md`, and `TooS_examples.md` files are retained as historical design notes. `PLAN.md` and the `docs/` directory are authoritative.

## Production boundary

The included authentication service is a local-development static bearer validator. Before internet or multi-user exposure, replace it with an OIDC-aware ForwardAuth provider, enable TLS, move secrets to a managed secret store, restrict Docker socket access through a socket proxy, and deploy metrics/log collection described in the operations guide.
