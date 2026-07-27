# ADR 0001: Separate control and data planes

Status: accepted

Traefik routes and authenticates MCP traffic. The registry stores leases and returns public descriptors but never proxies tool calls. This prevents the registry from becoming an execution bottleneck and keeps MCP semantics at the worker.
