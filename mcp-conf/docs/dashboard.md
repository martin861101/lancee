# MCP Control-Plane Dashboard

## Purpose

The dashboard provides an operator-facing control plane for the MCP capability
grid. It is available at the gateway root:

```text
https://mcp.hygridtech.co.za/
```

The UI distinguishes persistent catalog definitions from runtime worker leases:

- **Configured services** describe intended endpoints, environment, tags, and
  enabled state.
- **Live services** are workers actively renewing a registry lease. Creating a
  service definition does not claim that a worker is online.
- **Tools** describe typed capabilities and can be assigned to a configured or
  currently live service. Creating a tool definition does not install code or
  add that tool to the worker's MCP `tools/list` response.
- **Skills** combine instructions with references to tools and services.

Catalog definitions are control-plane metadata. Workers remain responsible for
serving and executing their actual MCP tools.

To make a new tool callable, implement it with the worker's MCP SDK, install its
runtime dependencies in the worker image, deploy/restart the worker, verify it
appears in `tools/list`, and then create or update the matching dashboard
definition. Skills do not require that deployment cycle because they are
instruction documents composed from already executable tools.

## Authentication and routing

The HTML, CSS, and JavaScript shell at `/` and `/assets/*` contains no catalog
data and is intentionally loadable before authentication. The login form keeps
the supplied `PUBLIC_API_TOKEN` in browser `sessionStorage`, so it is discarded
when the tab session ends.

Dashboard assets use versioned URLs and `Cache-Control: no-cache` revalidation
so reverse-proxy or Cloudflare caches cannot leave operators on stale client
logic after a deployment.

Every data request uses:

```http
Authorization: Bearer <PUBLIC_API_TOKEN>
```

Traefik applies ForwardAuth to `/api/control/*`. Missing or invalid credentials
receive `401`. A content security policy permits only same-origin scripts,
assets, and API connections.

Public route ownership is:

| Path | Purpose | Authentication |
| --- | --- | --- |
| `/` and `/assets/*` | Dashboard shell | No data access |
| `/api/control/v1/*` | Dashboard control API | Public API bearer token |
| `/registry/v1/*` | Live service discovery | Public API bearer token |
| `/services/{id}/mcp` | Worker MCP transport | Public API bearer token |

Nginx Proxy Manager should proxy the entire hostname to the Traefik host port
`8089`. No NPM custom location is needed because Traefik owns path routing.

## Control API

Base URL:

```text
/api/control/v1
```

Routes:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/summary` | Counts, live leases, enabled total, and recent activity |
| `GET` | `/runtime-tools` | Compare catalog entries with live worker `tools/list` output |
| `GET`, `POST` | `/services` | List or create service definitions |
| `PUT`, `DELETE` | `/services/{id}` | Update or delete a service definition |
| `GET`, `POST` | `/tools` | List or create tool definitions |
| `PUT`, `DELETE` | `/tools/{id}` | Update or delete a tool definition |
| `GET`, `POST` | `/skills` | List or create skill definitions |
| `PUT`, `DELETE` | `/skills/{id}` | Update or delete a skill definition |
| `POST` | `/integrations/plans` | Validate tools/skills and create an expiring installation plan |
| `GET` | `/integrations/plans/{plan_id}` | Retrieve a non-expired installation plan |

IDs are stable lowercase slugs. A tool may reference only an existing
configured service or a currently live service. A skill may reference only
known tools and configured/live services. Deletion returns `409` while another
object still references the target.

## Persistence

Catalog documents and the latest 100 activity events are stored in Redis under
the `mcp:catalog:*` namespace. Redis append-only persistence writes them to the
existing `registry_data` volume. `docker compose down` preserves the data;
`docker compose down --volumes` deletes it.

Integration plans use separate TTL keys under `mcp:integration-plan:*`. They
expire automatically and are not permanent catalog records.

## Dashboard functions

- Bearer-token login and explicit sign-out
- Overview metrics and live worker visibility
- Create, edit, pause, search, filter, and delete catalog objects
- JSON Schema editor for tool inputs
- Live `tools/list` verification badges: `runtime verified` or `catalog only`
- Tool/service composition for skills
- Skill instruction documents up to 100,000 characters
- Relationship-aware delete protection
- Recent audit activity
- JSON export for each catalog collection
- Dynamic tool/skill selector with dependency expansion
- TypeScript or Python integration plans and local CLI handoff
- Responsive desktop and mobile layouts

## Integration builder

The **Integrate** view lists only enabled tools assigned to a service and skills
whose required tools are installable. A created plan contains the resolved tool
schemas, selected skill instructions, service ownership at plan time, the fixed
public gateway, and an expiry timestamp.

The browser offers a command or a JSON download but never receives authority to
edit an application repository. `mcp-grid integrate` performs that local step,
prompts for an existing or new file, previews a diff, and maintains one managed
block. See [`dynamic-integrations.md`](dynamic-integrations.md).

Validation responses contain only field locations, messages, and error types.
Rejected values—especially skill instructions—are not echoed back to the
browser or included in persisted error data.

## Production boundary

The dashboard currently shares the local static bearer authentication adapter.
For multi-user or production administration, replace it with OIDC, add
role-based write permissions, move secrets to a managed store, and export audit
events to durable observability storage.
