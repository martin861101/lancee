# Astryx Design System Worker

## Purpose

`astryx-worker` exposes the machine-readable Astryx design-system catalog as a
stateless MCP service. It imports the typed `@astryxdesign/cli/api` surface
directly and does not execute `npx`, shell commands, or interactive CLI flows.

The worker pins `@astryxdesign/cli` and `@astryxdesign/core` to `0.1.7`. Keeping
the packages on the same version prevents component documentation and CLI
discovery behavior from drifting apart.

Public Streamable HTTP endpoint:

```text
https://mcp.hygridtech.co.za/services/astryx-worker/mcp
```

All public MCP and REST façade requests use the same bearer token as the rest
of the capability grid.

## Executable tools

| Tool | Function |
| --- | --- |
| `astryx_search` | Ranked search across components, hooks, documentation, and templates |
| `astryx_component` | Component lists, documentation, props, source, showcases, and related blocks |
| `astryx_hook` | Hook lists, documentation, and parameter details |
| `astryx_docs` | Design reference topic lists, topic content, and matching sections |
| `astryx_template` | Template lists, source inspection, and structural skeletons |
| `astryx_themes` | Bundled theme metadata and maintenance status |

Every successful tool call returns the Astryx typed `{type, data}` envelope as
JSON text. Astryx failures preserve their stable error `code` and any suggested
matches in an MCP error result.

The catalog seeder also installs the `astryx_ui_research` skill. It guides an
agent from broad search through component, hook, template, and reference
inspection before implementing an interface in its own workspace.

## Read-only boundary

The worker intentionally does not expose Astryx commands that mutate a project:

- `init`
- `swizzle`
- `upgrade`
- `theme build` or `theme add`
- template copying
- `doctor`

The service container cannot see a caller's repository. Tool handlers always
use the fixed `/app` package root and accept no filesystem path, shell string,
or write destination. Returned component and template source must be applied
and reviewed in the caller's own workspace.

The container runs as UID/GID `10001`, uses a read-only root filesystem and
temporary `/tmp`, drops all Linux capabilities, enables `no-new-privileges`,
and enforces host and origin allowlists. Its port is available only on
`mcp_net`; Traefik remains the public authenticated entry point.

The lockfile overrides the MCP SDK's transitive `@hono/node-server` dependency
to patched version `2.0.10`. The worker uses the SDK's Express Streamable HTTP
transport, but the override also removes the known Windows `serve-static`
path-traversal and WebSocket-handshake advisories from the production
dependency audit.

## Deployment

Configure `.env` as described in the main README, then build and start the
worker with its dependencies:

```bash
docker compose up --build --detach --wait astryx-worker traefik
```

The worker registers `http://astryx-worker:8000/mcp`, maintains its Redis-backed
lease through the orchestrator, and stays unready until registration succeeds.

Seed or reconcile the dashboard service, six tool definitions, and skill:

```bash
set -a
. ./.env
set +a
MCP_API_TOKEN="$PUBLIC_API_TOKEN" make seed
```

The seeder is idempotent. Existing matching entries are updated and missing
entries are created.

## REST invocation

Search for a suitable component through the Tools-as-a-Service façade:

```bash
curl --fail \
  --header "Authorization: Bearer $PUBLIC_API_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"query":"accessible data table","type":"component","limit":10}' \
  http://localhost:8089/api/v1/services/astryx-worker/tools/astryx_search/call
```

Inspect component properties:

```bash
curl --fail \
  --header "Authorization: Bearer $PUBLIC_API_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"name":"Button","view":"props","detail":"full","lang":"en"}' \
  http://localhost:8089/api/v1/services/astryx-worker/tools/astryx_component/call
```

Use `lang: "zh"` for Simplified Chinese documentation or `lang: "dense"` for
token-efficient agent output.

## Native MCP verification

```bash
curl --fail --silent \
  --header "Authorization: Bearer $PUBLIC_API_TOKEN" \
  --header 'Accept: application/json, text/event-stream' \
  --header 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  http://localhost:8089/services/astryx-worker/mcp
```

Operational checks:

```bash
docker compose ps astryx-worker
docker compose logs --tail=50 astryx-worker
```

## Development and upgrades

Run the focused local tests with:

```bash
npm --prefix astryx_mcp_worker test
```

The suite validates tool translation, structured Astryx errors, the registry
contract, configuration validation, and real searches against the installed
Astryx packages. `make test` additionally builds and executes the worker's
Docker test target.

When upgrading Astryx, update the CLI and core versions together, regenerate
`package-lock.json`, run the local and container tests, inspect any schema or
error-code changes, then rebuild and reseed the worker.
