# ADR 0004: Add an optional Tools-as-a-Service REST façade

## Status

Accepted, 2026-07-20.

This ADR supersedes ADR 0001 only for its absolute prohibition on registry-side
tool proxying. ADR 0001 remains in force for native MCP clients and routing.

## Decision

Expose authenticated `/api/v1` routes from the registry deployment for live
capability discovery, enabled skill retrieval, and stateless tool invocation.
The façade resolves only validated service leases and calls workers over the
private network. Direct MCP routing remains available and unchanged.

## Consequences

Ordinary server applications can use tools with standard JSON HTTP and no MCP
SDK. Catalog tool IDs provide stable logical names while service-qualified
routes allow immediate use of any live runtime tool. The façade adds one hop
and can become an execution bottleneck for REST consumers, so native MCP should
remain available and the adapter can be split into an independently scaled
service if traffic requires it.
