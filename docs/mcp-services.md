# MCP service model

Lancee runs one MCP service: `lancee`.

It is built into the application, always active for authenticated workspaces,
and served at `POST /mcp`. The service exposes the tool contracts documented in
[`LANCEE_MCP.md`](LANCEE_MCP.md).

There is no MCP Grid, external MCP catalog, Basebox MCP connection, service
activation switch, generated MCP client, or separate MCP process. The Services
screen and dashboard assistant read the same local registry used by `/mcp`.

General capabilities such as web research, browser automation, file handling,
documents, and third-party providers are added as Lancee-owned adapters or
workers. They can expose a tool through the local registry, but they do not run
another MCP server.

## Runtime path

```text
MCP client
  → POST /mcp
  → device token (`mcp:invoke`)
  → Lancee MCP protocol adapter
  → local tool registry and policy
  → Lancee API/service/worker
  → audit/result
```

## Verification

```bash
pnpm verify:mcp
pnpm verify:codex-connector
```

See
[`LANCEE_RUNTIME_MCP_INTEGRATIONS.md`](LANCEE_RUNTIME_MCP_INTEGRATIONS.md)
for the phased integration plan.
