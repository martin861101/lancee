# Building and Installing MCP Tools

## The important distinction

A dashboard tool entry is catalog metadata. It describes a name, owning service,
input schema, tags, and enabled state. It does not install a package or create an
MCP handler.

A callable tool exists only when a live worker:

1. registers the tool handler with its MCP SDK;
2. contains every pinned runtime dependency in its image;
3. is deployed and healthy;
4. registers a live lease with the orchestrator; and
5. returns the tool from MCP `tools/list`.

The dashboard compares catalog definitions with live `tools/list` responses:

- `runtime verified` means the owning live worker advertises the exact tool ID;
- `catalog only` means the entry has no matching executable tool and agents must
  not assume it is callable.

Skills are different. They are instruction documents that compose existing
tools and may be created entirely in the UI.

## Add a tool to an existing worker

For the browser/document worker:

1. Register a handler in `automation_worker/src/tools.js`.
2. Validate every argument with Zod and enforce payload/time/concurrency limits.
3. Add an exact dependency version to `automation_worker/package.json` when
   required, then update `package-lock.json`.
4. Add focused tests under `automation_worker/test/`.
5. Add the matching catalog definition to
   `automation_worker/scripts/seed-catalog.js`.
6. Run `npm test`.
7. Rebuild and deploy:

   ```bash
   PUBLIC_GATEWAY_URL=https://mcp.hygridtech.co.za \
     docker compose up --build --detach --wait browser-worker traefik
   ```

8. Verify the executable ID appears in `tools/list`, then reconcile metadata:

   ```bash
   set -a
   . ./.env
   set +a
   cd automation_worker
   MCP_GATEWAY_URL=http://localhost:8089 npm run seed
   ```

9. Confirm the dashboard badge says `runtime verified`.

## Create a separate worker

Use a separate worker when dependencies, security boundaries, scaling, or
secrets differ materially. A production worker needs:

- a stable service ID matching its private Docker hostname;
- stateless Streamable HTTP at `/mcp`;
- `/healthz` and registration-aware `/readyz` endpoints;
- registration, heartbeat, retry/backoff, and deregistration;
- a service-scoped registry token;
- a Traefik route under `/services/{service-id}` with ForwardAuth;
- a non-root, read-only container with resource limits;
- unit tests and an end-to-end `tools/list` plus `tools/call` check;
- a catalog seeder that is safe to run repeatedly.

Do not install dependencies at runtime inside a running container. Images must
be reproducible, reviewable, scanned, and replaceable.

## Safe UI installation model

An unrestricted UI action that runs `npm install`, `pip install`, shell text, or
arbitrary Docker commands is remote code execution and is not suitable for this
internet-facing control plane.

The production design for UI installation is an approved package registry:

1. An administrator publishes a reviewed package manifest containing a pinned
   image digest, service ID, tool schemas, required secret names, resource
   limits, health check, migrations, and catalog definitions.
2. CI builds, tests, signs, and scans the image.
3. The UI may request enable/upgrade/disable only for an approved manifest.
4. A separate deployment controller with a narrow allow-list reconciles that
   desired state. The web application never receives a general Docker socket or
   shell.
5. The dashboard displays `available`, `deploying`, `healthy`, `failed`, and
   `runtime verified`, with an immutable audit event for every transition.
6. Rollback selects a previously approved image digest; it does not rebuild on
   the production host.

The current dashboard implements the runtime-verification portion. An install
button should be added only together with the signed manifest registry and
narrow deployment controller.

## Basebox and Hermes integration

Basebox already supports a Custom MCP connector. Configure it with:

```text
URL: https://mcp.hygridtech.co.za/services/browser-worker/mcp
Bearer token: PUBLIC_API_TOKEN from /home/apps/mcp/.env
```

This lets Basebox test and persist the MCP connection. Basebox's current MCP
server exposes connection discovery/health metadata; it does not proxy the
connected server's operations.

Hermes in Basebox is currently an OpenAI-compatible chat backend configured by
`HERMES_API_URL` and `HERMES_API_KEY`. Making Hermes actively use this grid
requires an orchestration loop in Basebox:

1. discover enabled MCP servers and fetch their `tools/list` schemas;
2. send approved schemas in the Hermes chat request;
3. validate each Hermes tool call against its source schema and policy;
4. invoke `tools/call` using the encrypted per-connection bearer token;
5. return bounded tool results to Hermes until it produces a final answer;
6. enforce call-count, timeout, payload, approval, and audit limits.

Before implementing that loop, verify the deployed Hermes gateway's exact
tool-calling request/response format. Do not assume every OpenAI-compatible
gateway supports tool calls identically.
