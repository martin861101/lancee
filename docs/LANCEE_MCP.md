# Lancee MCP

Lancee MCP is the stdio MCP bridge in
`plugins/lancee-ai/scripts/mcp-server.mjs`. It authenticates through the
existing device-code approval flow and calls the Lancee backend with a
workspace-scoped bearer token.

## Tools

| Tool | Purpose |
| --- | --- |
| `run_workflow` | Queue an active Core or Edge workflow. |
| `create_workflow` | Create an active workflow with bounded Core tools; pass `activate: false` for a draft. |
| `get_workflow_status` | Read a workflow or run and recent activity. |
| `search_workflows` | Filter workflows by text, status, and execution mode. |
| `execute_python` | Run Python only when explicit server-side execution is enabled. |
| `execute_javascript` | Run JavaScript only when explicit server-side execution is enabled. |
| `schedule_job` | Persist a one-shot or repeating workflow run. |
| `get_logs` | Read persisted workflow run events. |
| `call_external_api` | Call a public HTTPS API with bounded request/response limits. |

`create_workflow` activates the new workflow by default so an approved assistant
request is immediately runnable. Pass `activate: false` only when the user asks
for a draft.
Core runs reuse Lancee's permission-checked automation planner and Redis queue;
Edge runs reuse the signed n8n delivery path.

## Dashboard assistant path

The authenticated dashboard assistant receives these tools as native function
declarations from `/api/ai/chat`. OpenAI-compatible providers (including
Hermes), Anthropic, and Gemini responses are parsed through their structured
tool-call fields. Plain-text/XML tool tags are not used. The model only proposes
one call; the browser invokes `/api/mcp/invoke` after the user selects
**Approve & run**. Built-in calls route directly to the same runtime used by the
Codex connector. External catalog tools route to the configured Hygrid gateway,
while Basebox tools use its authenticated MCP Streamable HTTP transport. Only
live, workspace-activated external services are exposed to the assistant.

## Authentication

The plugin requests both `ai:invoke` and `mcp:invoke` during device
authorization. The UI displays both scopes for approval. The backend accepts
the individual scopes as well, so older AI-only clients continue to work, but
they cannot call the Lancee MCP routes until they reconnect with
`mcp:invoke`.

The MCP request endpoint is:

```http
POST /api/codex/lancee-mcp/{tool}
Authorization: Bearer lnc_codex_...
Content-Type: application/json
```

The endpoint derives the workspace from the hashed connector token. Tool
arguments never select a workspace id, and workflow/run ids are checked again
against that workspace before access.

## Safety boundaries

- Workflow creation validates names, descriptions, execution mode, and Core
  tool ids against the existing Core catalog. Every planned tool must be listed
  on the workflow, including read-only tools.
- Runs require an active workflow. Edge runs require a connected n8n
  integration.
- Logs and status queries are workspace-scoped and bounded in size.
- `call_external_api` blocks credentials in URLs, redirects, private/internal
  DNS targets, cookies, authorization headers, and oversized bodies/responses.
  Production calls require HTTPS.
- Python and JavaScript execution is enabled in the supplied environment with
  `LANCEE_MCP_CODE_EXECUTION=true`. Each request runs in a temporary directory
  with a stripped environment, bounded input/output, and a timeout. This is
  still a bounded subprocess rather than a complete OS sandbox: production
  deployments should move it to an isolated worker/container and set
  `LANCEE_MCP_PYTHON_BIN` to that worker's Python binary.
- `schedule_job` stores rows in `automation_schedules`. The web process restores
  interrupted claims on startup, polls for due rows, claims them transactionally
  so multiple instances do not run the same row, and records completed,
  recurring, or failed status. Recurring jobs schedule their next run after the
  current dispatch completes.

## Local configuration

The plugin defaults to the production origin. For a local server, set
`LANCEE_BASE_URL` and an isolated plugin data directory in the MCP environment:

```json
{
  "mcpServers": {
    "lancee": {
      "command": "node",
      "args": ["/absolute/path/to/agent-app/plugins/lancee-ai/scripts/mcp-server.mjs"],
      "env": {
        "LANCEE_BASE_URL": "http://127.0.0.1:3000",
        "PLUGIN_DATA": "/absolute/path/to/private/plugin-data"
      }
    }
  }
}
```

Run the focused integration check with:

```bash
npm run verify:codex-connector
```

This verifier covers all nine tools, assistant proposal and approval, active
workflow creation, Core execution, persisted logs, durable scheduling, code
execution, and blocked private API targets.
