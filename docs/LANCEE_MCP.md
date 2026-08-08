# Lancee MCP

Lancee exposes one MCP server from the same application and repository as the
rest of the platform:

```text
POST /mcp
```

[`server/lancee-mcp-protocol.mjs`](../server/lancee-mcp-protocol.mjs) owns MCP
JSON-RPC initialization, tool discovery, batch limits, calls, and error
results. [`server/lancee-mcp.mjs`](../server/lancee-mcp.mjs) owns the typed tool
contracts and delegates execution to Lancee's database, API, automation, PDF,
and worker boundaries.

Lancee does not proxy or discover other MCP servers. Web, browser, document,
and provider capabilities must be implemented as local Lancee adapters or
workers and registered in this tool surface.

## Tools

| Tool | Purpose |
| --- | --- |
| `run_workflow` | Queue an active Core or Edge workflow. |
| `create_workflow` | Create a bounded Core or Edge workflow; pass `activate: false` for a draft. |
| `query_dashboard` | Read approved workspace resources without exposing raw SQL. |
| `create_client` | Create or complete a client record. |
| `create_project` | Create a project for an existing or new client. |
| `set_project_status` | Move a project to a supported dashboard status. |
| `create_file` | Save a text, Markdown, or JSON file in the Files library. |
| `web_search` | Search the public web for bounded source titles, URLs, and snippets. |
| `create_pdf` | Generate a valid PDF and save it in Files. |
| `request_connector` | Add a pending connector request to Connections. |
| `delete_workspace_resource` | Permanently delete an automation or file with owner confirmation. |
| `get_workflow_status` | Read workflow/run state and recent activity. |
| `search_workflows` | Filter workflows by text, status, and execution mode. |
| `execute_python` | Run bounded Python only when server-side execution is enabled. |
| `execute_javascript` | Run bounded JavaScript only when server-side execution is enabled. |
| `schedule_job` | Persist a one-shot or repeating workflow run. |
| `get_logs` | Read persisted workflow-run events. |
| `call_external_api` | Call a public HTTPS API with bounded request/response limits. |

## Authentication and workspace context

The MCP route requires a Lancee device token with the `mcp:invoke` scope:

```http
POST /mcp
Authorization: Bearer lnc_codex_...
Content-Type: application/json
```

The existing device authorization endpoints issue the token only after a user
signs in and approves the displayed code and scopes. Lancee stores only token
hashes. The token resolves the user, workspace, and membership; tool arguments
cannot select or override a workspace.

`MCP_SERVER_TOKEN`, `MCP_GATEWAY_URL`, `MCP_API_TOKEN`, and Basebox credentials
are no longer supported. The former stdio proxy and external MCP Grid have been
removed.

## Protocol surface

The first local phase supports:

- `initialize`;
- `ping`;
- `tools/list`;
- `tools/call`;
- `notifications/initialized` and `notifications/cancelled`;
- JSON-RPC batches of at most 64 messages.

Tool failures are returned as MCP tool results with `isError: true` and a stable
Lancee error code. Unknown methods and invalid parameters use JSON-RPC errors.

## Dashboard assistant path

The authenticated dashboard assistant receives the same local tool definitions
as native AI-provider function declarations. The model can propose a tool call,
but the browser presents a risk-labelled confirmation before
`POST /api/mcp/invoke` executes it. High-risk tools enforce workspace-owner
authority on the server.

The dashboard API remains as a UI-oriented adapter; `/mcp` and the dashboard
both invoke the same `createLanceeMcpRuntime` instance.

## Safety boundaries

- All data reads and writes use workspace-filtered database methods; raw SQL,
  credentials, and workspace selectors are not tool inputs.
- File and PDF sizes, workflow plans, logs, schedules, HTTP bodies, subprocess
  output, and protocol batches are bounded.
- Public search and external API results are untrusted data and cannot approve
  a later mutation.
- External API calls reject redirects, credentials, sensitive headers, and
  private/internal network destinations; production requires HTTPS.
- Code execution is disabled unless `LANCEE_MCP_CODE_EXECUTION=true`. It is
  owner-only and should run in an isolated worker/container in production.
- `delete_workspace_resource` requires owner authority and the literal
  `confirmation: "DELETE"`.
- All workflow and run identifiers are rechecked against the authenticated
  workspace.

## Verification

Run:

```bash
pnpm verify:mcp
pnpm verify:codex-connector
```

The focused MCP verifier covers initialization, local schema discovery,
workspace-context propagation, calls, bounded batches, and error results. The
connector verifier exercises the HTTP `/mcp` route with an approved device
token and covers workflow execution, scheduling, logs, code controls, token
revocation, and hashed token storage.

The remaining capability and agent-runtime rollout is tracked in
[`LANCEE_RUNTIME_MCP_INTEGRATIONS.md`](../LANCEE_RUNTIME_MCP_INTEGRATIONS.md).
