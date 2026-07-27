# Tools as a Service API

The TooS façade lets any HTTP-capable server application discover and invoke
the grid without embedding MCP session logic or copying integration scripts.
It is additive: MCP-aware clients may still connect directly to worker URLs.

Public base URL:

```text
http://localhost:8089/api/v1
```

Every public request requires `Authorization: Bearer <PUBLIC_API_TOKEN>`.
Keep this credential in server-side environment variables or a secret store;
never expose it through browser JavaScript or a public build variable.

## Call from JavaScript

This block can live directly in a Node.js, Next.js server action, API route,
worker, or other server-side application:

```js
const gateway = process.env.MCP_GATEWAY_URL ?? "http://localhost:8089";

const response = await fetch(
  `${gateway}/api/v1/services/example-worker/tools/add/call`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MCP_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ left: 20, right: 22 }),
  },
);
if (!response.ok) throw new Error(`TooS call failed: ${response.status}`);
const { data } = await response.json(); // 42
```

For a reusable typed client:

```bash
cd /home/apps/mcp/clients/typescript && npm install && npm run build
cd /path/to/your/server-app
npm install /home/apps/mcp/clients/typescript
```

```ts
import { TooSClient } from "mcp-grid-client";

const tools = new TooSClient(process.env.MCP_GATEWAY_URL!, process.env.MCP_API_TOKEN!);
const capabilities = await tools.capabilities();
const transformed = await tools.invoke<string>("transform_text", {
  text: "Dynamic Routing",
  operation: "kebab",
});
console.log(transformed.data); // dynamic-routing
```

## Call from Python

```bash
python -m venv .venv
.venv/bin/pip install /home/apps/mcp/clients/python
```

```python
import asyncio
import os
from mcp_grid_client import TooSClient

async def main():
    tools = TooSClient(os.environ["MCP_GATEWAY_URL"], os.environ["MCP_API_TOKEN"])
    capabilities = await tools.capabilities()
    result = await tools.invoke(
        "transform_text", {"text": "Dynamic Routing", "operation": "kebab"}
    )
    print(result["data"])

asyncio.run(main())
```

## API routes

### `GET /api/v1/capabilities`

Queries every live worker concurrently and returns:

- live service descriptors with `available` or `unreachable` status;
- actual runtime tool names, descriptions, and input schemas;
- matching catalog IDs and tags when definitions have been seeded;
- all enabled skill definitions and their tool/service relationships.

One unreachable worker does not fail the whole response.

### `POST /api/v1/services/{service_id}/tools/{tool_name}/call`

Calls any tool on a live service. The JSON request body is passed directly as
the tool arguments, so no protocol envelope is needed:

```bash
curl --fail \
  --header "Authorization: Bearer $MCP_API_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"url":"https://example.com","required_selector":"h1"}' \
  "$MCP_GATEWAY_URL/api/v1/services/browser-worker/tools/website_smoke_test/call"
```

### `POST /api/v1/tools/{catalog_tool_id}/call`

Resolves an enabled catalog tool to its assigned live service, then invokes it.
This is the shortest stable route when the catalog has been seeded:

```bash
curl --fail \
  --header "Authorization: Bearer $MCP_API_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"url":"https://example.com"}' \
  "$MCP_GATEWAY_URL/api/v1/tools/seo_metadata_audit/call"
```

A disabled tool or service is never invoked. Missing live leases return `503`.
Use this route for application integrations because the catalog resolves worker
ownership dynamically. The service-specific route remains useful for runtime
inspection, unseeded tools, and explicit native-service behavior.

### `GET /api/v1/skills` and `GET /api/v1/skills/{skill_id}`

Returns enabled workflow instructions for applications that bind tools to an
agent or present approved procedures to a user.

## Dynamic installer

The dashboard's **Integrate** view creates a validated, expiring plan from a
selection of tools and skills. Run the returned `mcp-grid integrate` command to
inject an idempotent TypeScript or Python client module into a local project.
Generated code uses `TooSClient.invoke(toolId, arguments)` and therefore never
embeds a worker endpoint. See
[`dynamic-integrations.md`](dynamic-integrations.md) for the full workflow.

The supporting authenticated control routes are:

- `POST /api/control/v1/integrations/plans`
- `GET /api/control/v1/integrations/plans/{plan_id}`

## Invocation response

```json
{
  "service_id": "example-worker",
  "tool": "add",
  "is_error": false,
  "data": 42.0,
  "result": {
    "content": [{"type": "text", "text": "42.0"}],
    "structuredContent": {"result": 42.0},
    "isError": false
  }
}
```

`data` is the convenient normalized value. `result` preserves the complete MCP
result for applications that need content blocks, structured content, or tool
error details. Transport, timeout, and invalid upstream responses use normal
HTTP `502`/`504` errors and every response carries `X-Request-ID`.

## Operational notes

- The façade calls only internal URLs from validated live registrations; callers
  cannot supply arbitrary upstream URLs.
- `REGISTRY_TOOL_CALL_TIMEOUT_SECONDS` controls the upstream timeout and defaults
  to 120 seconds.
- Native MCP remains the preferred path for hosts that already support it.
- Browser artifact URLs still require authentication. Proxy them through the
  application's authenticated backend when they must be embedded in HTML.
