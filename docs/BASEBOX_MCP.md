# Basebox MCP integration

Basebox is connected as a standard authenticated MCP Streamable HTTP server:

```text
https://base-api.hygridtech.co.za/mcp
```

It is independent of the legacy Hygrid REST capability gateway. Basebox tools
are discovered through `initialize` and paginated `tools/list` JSON-RPC calls,
then invoked with `tools/call`.

## Configuration

Add the Basebox access key to the server-only `.env` file:

```dotenv
BASEBOX_MCP_URL=https://base-api.hygridtech.co.za/mcp
BASEBOX_MCP_ACCESS_KEY=replace-with-the-real-access-key
```

`MCP_ACCESS_KEY` and the older `BASEBOX_BEARER_KEY` are accepted as migration
aliases. `BASEBOX_MCP_ACCESS_KEY` is preferred. The key is read only by the
backend and is never returned by an API or included in a browser bundle.

Restart the application after changing the key:

```bash
docker compose up -d --build app
```

## Dashboard flow

1. Open **Services**.
2. Request MCP access if the workspace has not already been approved.
3. Select **Sync services**.
4. Confirm that Basebox says **live** and shows the discovered tools.
5. Activate Basebox. This explicit workspace switch controls whether the AI
   assistant can see and propose its tools.
6. Use **Test tool** when Basebox exposes a no-argument read tool, or ask the
   assistant for an action and approve the proposed call.

If the key is missing or rejected, Basebox stays visible as **Needs attention**
and cannot be activated. The platform does not substitute fallback/mock tools.

## Runtime behavior

- Authorization uses `Authorization: Bearer <access-key>` on every request.
- Initialization negotiates MCP protocol version `2025-11-25` and preserves
  any `Mcp-Session-Id` returned by the server.
- Subsequent requests send both `Mcp-Session-Id` and
  `MCP-Protocol-Version` when applicable.
- JSON and Server-Sent Event responses are supported.
- `tools/list` pagination is bounded to 25 pages and 1,000 tools.
- Individual MCP responses are bounded to 2 MB.
- Tool calls preserve `structuredContent`, text content, and MCP `isError`.
- Sessions are closed with a best-effort `DELETE` after discovery or a call.
- Workspace activation and every invocation are persisted by the existing MCP
  service-state and invocation audit tables.
- The assistant can only propose active, live tools and the browser still
  requires user confirmation before invocation.

## Verification

Run the deterministic transport suite:

```bash
npm run verify:basebox
```

After setting the real access key, verify authenticated production discovery:

```bash
npm run verify:basebox:live
```
