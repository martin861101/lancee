# Worker Guide

## Create a worker

Copy `worker_template` to a new directory, then change:

1. The `WORKER_SERVICE_ID` and display name.
2. Tool functions decorated with `@mcp.tool()` in `src/worker/server.py`.
3. The Compose service, service-scoped registry token mapping, route prefix, strip middleware, and backend port.
4. Tests for tool inputs, outputs, permissions, timeouts, and failure behavior.

The service ID must be a lowercase DNS-style slug and must equal the worker's Docker hostname. Internal endpoints are fixed at `/mcp` and `/healthz`.

## Shared worker profiles

Small deterministic services can reuse the template image without copying the
lifecycle implementation. Set `WORKER_TOOL_PROFILE` to `example`, `text`,
`data`, or `utility`; the worker registers only that profile's bounded tool set.
Profile implementations live in `src/worker/tools.py`. Use a dedicated worker
image instead when a service needs extra dependencies, credentials, network
permissions, or a different resource/security boundary.

## Lifecycle

`WorkerRegistrar` starts with the application lifespan, waits briefly for server startup, registers, heartbeats, and re-registers after lease loss. Network failures use exponential backoff with jitter. Graceful shutdown attempts deregistration.

`/healthz` indicates that the worker process is alive. `/readyz` returns `503` until the registry lease exists. A brief registry failure therefore removes the worker from new routing readiness without killing existing in-process work.

## Tool rules

- Use typed inputs and structured return values.
- Make descriptions precise enough for both humans and agents.
- Apply explicit timeouts to external calls.
- Retry only operations known to be safe and idempotent.
- Never accept arbitrary host paths, shell strings, or target URLs without allowlists.
- Add tool-specific authorization before introducing mutation or privileged access.
- Write logs to stdout/stderr and never return credentials in tool results.

## Configuration

All worker settings use the `WORKER_` prefix. Important values include
`SERVICE_ID`, `TOOL_PROFILE`, `ORCHESTRATOR_URL`, `REGISTRATION_TOKEN`,
`REVISION`, `HEARTBEAT_INTERVAL_SECONDS`, and `ALLOWED_ORIGINS`.
