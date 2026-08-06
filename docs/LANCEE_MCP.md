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
| `query_dashboard` | Read approved workspace resources through the database adapter without raw SQL. |
| `create_client` | Create or complete a client record. |
| `create_project` | Create a project for an existing or new client. |
| `set_project_status` | Move a project to a supported dashboard status. |
| `create_file` | Save a text, Markdown, or JSON file in the Files library. |
| `web_search` | Search the public web for bounded source titles, URLs, and snippets. |
| `create_pdf` | Generate a text report as a valid PDF and save it in Files. |
| `request_connector` | Add a pending connector card to Connections. |
| `configure_mcp_service` | Activate or deactivate a live service discovered by the approved MCP gateway. |
| `delete_workspace_resource` | Owner-only permanent deletion for an automation or workspace file. |
| `get_workflow_status` | Read a workflow or run and recent activity. |
| `search_workflows` | Filter workflows by text, status, and execution mode. |
| `execute_python` | Run Python only when explicit server-side execution is enabled. |
| `execute_javascript` | Run JavaScript only when explicit server-side execution is enabled. |
| `schedule_job` | Persist a one-shot or repeating workflow run. |
| `get_logs` | Read persisted workflow run events. |
| `call_external_api` | Call a public HTTPS API with bounded request/response limits. |

`create_workflow` accepts an optional `prompt_template`. The template can be a
reusable natural-language instruction or a JSON plan containing up to 12
permission-checked Core steps. It activates the new workflow by default so an
approved assistant request is immediately runnable. Pass `activate: false` only
when the user asks for a draft. `run_workflow` uses the saved template when no
run-specific `instruction` is supplied.
Core runs reuse Lancee's permission-checked automation planner and Redis queue;
Edge runs reuse the signed n8n delivery path.

## Dashboard assistant path

The authenticated dashboard assistant receives these tools as native function
declarations from `/api/ai/chat`. OpenAI-compatible providers (including
Hermes), Anthropic, and Gemini responses are parsed through their structured
tool-call fields. Plain-text/XML tool tags are not used. Explicit requests to
create, generate, make, save, or write a file are narrowed to the built-in
`create_file` declaration so tool-heavy providers reliably return the intended
proposal. The model only proposes one call; the browser scrolls the new result
into view and displays the tool name, bounded argument summary, and
low/medium/high risk before it can invoke `/api/mcp/invoke`. The user can
**Confirm** or **Deny** each request. Destructive tools use a distinct
**Approve high-risk action** control and still enforce workspace-owner authority
on the server. Built-in calls route directly to the same runtime used by the
Codex connector. External catalog tools route to the configured Hygrid gateway,
while Basebox tools use its authenticated MCP Streamable HTTP transport. Only
live, workspace-activated external services are exposed to the assistant.

A request combining research with PDF output is deliberately split into two
approved calls. `web_search` submits a bounded query to the configured public
search endpoint (DuckDuckGo HTML by default). After it succeeds, the browser
returns its structured result to `/api/ai/chat` as explicitly untrusted data.
The assistant may then propose `create_pdf`; it cannot write the file until the
user confirms that second card. This avoids scraping Google result pages with
`extract_table_data` and prevents a read-only search result from silently
authorizing a Files mutation.

Successful actions emit a dashboard refresh event so automations, runs,
connection requests, integrations, and Files update without treating the AI's
proposal as completed work.

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
- `query_dashboard` is the PostgreSQL access boundary for the assistant. It
  uses the existing workspace-filtered database methods and a fixed resource
  allowlist; it never accepts SQL, connection strings, schema names, or a
  workspace id. The same tool works with the local SQLite development fallback.
- File creation accepts only UTF-8 text, Markdown, or valid JSON up to 512 KB.
  File names cannot contain path separators or null characters.
- Public search is fixed to a server-configured endpoint, uses a 15-second
  timeout, accepts no user-selected URL, and bounds responses to 1 MB and 20
  results. Result text remains untrusted during continuation.
- PDF creation accepts up to 200 KB of text, generates the document locally
  without executing HTML or remote content, and stores it as
  `application/pdf` in the workspace Files library.
- Connector requests are persisted in `integration_requests` and displayed as
  pending cards in Connections. They are never marked connected and never
  synthesize provider credentials.
- MCP service changes require an approved gateway grant, a live discovered
  service, explicit tool confirmation, and a workspace owner.
- `delete_workspace_resource` requires owner authority and the literal
  `confirmation: "DELETE"` in addition to the per-call approval UI.
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
- Destructive built-in tools (`execute_python`, `execute_javascript`,
  `call_external_api`, `configure_mcp_service`, and
  `delete_workspace_resource`) require workspace-owner authority. External MCP
  tools without trustworthy risk annotations are treated as high risk and are
  also owner-only.
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

This verifier covers the full 19-tool catalog, natural-language file routing,
the two-approval research-to-PDF chain, assistant proposal and approval, file
and PDF creation, connector persistence,
dashboard queries, saved prompt fallback,
active workflow creation, Core execution, persisted logs, durable scheduling,
code execution, and blocked private API targets.
