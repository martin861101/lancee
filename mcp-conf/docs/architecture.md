# Architecture

## Components

```mermaid
flowchart LR
    McpClient[MCP-aware agent] -->|Bearer token + MCP| Gateway[Traefik]
    HttpClient[Any server application] -->|Bearer token + JSON| Gateway
    Dashboard[Dashboard selector] -->|Create expiring plan| Gateway
    Installer[Local mcp-grid installer] -->|Fetch plan| Gateway
    Installer -->|Generate universal client| HttpClient
    Gateway -->|ForwardAuth check| Auth[Auth adapter / future OIDC]
    Gateway -->|/registry/*| Registry[Service registry]
    Gateway -->|/api/v1/*| Facade[TooS REST facade]
    Gateway -->|/services/{id}/mcp| Worker[MCP worker]
    Facade -->|MCP on private network| Worker
    Facade --> Registry
    Worker -->|register + heartbeat| Registry
    Registry --> Redis[(Redis leases)]
```

- Traefik is the only component with a published host port. It owns public authentication, routing, rate limits, and response headers.
- The registry remains the lease and catalog control plane. Its bounded TooS
  façade is an optional protocol adapter for ordinary HTTP applications; native
  MCP clients continue to call workers directly and avoid the extra hop.
- Redis provides atomic lease ownership and automatic expiry.
- Workers own MCP schemas and execution. They announce reachability to the registry and receive a lease.
- The dedicated `astryx-worker` imports Astryx's typed programmatic CLI API and
  exposes only read-only design-system discovery. It has no caller workspace or
  project mutation capability.
- Clients discover through the registry and speak MCP directly to workers through Traefik.

## Networks

`mcp_net` connects Traefik, auth, registry, and workers. `mcp_registry_net` is an internal-only network connecting the registry to Redis. Redis has no route from the gateway network and no published port.

## Startup flow

1. Redis becomes healthy.
2. The registry becomes ready after it can ping Redis.
3. The worker starts its health and MCP applications, registers, and begins heartbeats.
4. Worker readiness becomes healthy after a lease is obtained.
5. Traefik starts serving after auth, registry, and worker health gates pass.

## Invocation flow

1. The client calls `GET /registry/v1/services` through Traefik.
2. ForwardAuth validates the public bearer credential.
3. The registry returns public gateway URLs only.
4. An MCP-native client initializes at a selected worker URL and uses
   `tools/list` or `tools/call` directly.
5. Alternatively, a normal server application uses `/api/v1/capabilities` and
   `/api/v1/.../call`; the façade resolves the live lease and translates JSON
   HTTP to stateless MCP on the private network.
6. Traefik authenticates all public discovery, façade, and MCP requests.

## Dynamic integration flow

1. An operator selects catalog skills and tools in the dashboard.
2. The control plane validates the selection, expands skill dependencies, fixes
   the configured public gateway, and stores the plan in Redis with a TTL.
3. The local installer fetches or reads that plan, confines the target to the
   selected project, and previews a create/update diff.
4. The generated module invokes stable catalog tool IDs through
   `/api/v1/tools/{tool_id}/call`.
5. At runtime, the façade resolves each tool's current service and live lease,
   so worker ownership can change without regenerating application routes.

Architecture decisions are recorded in [`adr/`](adr/).
