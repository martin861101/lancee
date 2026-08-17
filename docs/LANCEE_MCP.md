# Lancee MCP

Lancee exposes exactly one MCP server from the same application and repository
as the rest of the platform:

```text
POST /mcp
```

It does not discover, proxy, configure, or start other MCP servers. Web,
browser, document, visual, artifact, job, and provider operations are local
Lancee modules or workers behind the same authorization and audit boundary.

## Runtime layout

| Component | Responsibility |
| --- | --- |
| [`server/lancee-mcp-protocol.mjs`](../server/lancee-mcp-protocol.mjs) | MCP JSON-RPC initialization, discovery, bounded batches, calls, and protocol errors |
| [`server/lancee-mcp.mjs`](../server/lancee-mcp.mjs) | Public tool bindings, authenticated context, and compatibility mapping |
| [`server/capabilities/`](../server/capabilities) | Typed registry plus platform, web, browser, visual, file, document, integration, artifact, job, and approval adapters |
| [`server/agent-runtime.mjs`](../server/agent-runtime.mjs) | Persisted planner/executor, budgets, retries, cancellation, and approval gates |
| [`server/execution-worker.mjs`](../server/execution-worker.mjs) | Database-authoritative leased job execution and recovery |
| [`server/browser-worker.mjs`](../server/browser-worker.mjs) | Isolated Playwright read, research, screenshot, and PDF execution |

The runtime builds `tools/list` from the same immutable input schemas that the
registry validates. There is no separate static production catalog that can
drift from invocation behavior.

## Public tool catalog

The base catalog contains 40 tools. When `OPENCONNECTOR_ENABLED=true`, four
dynamic gateway tools are added; provider actions themselves are never
registered as permanent MCP tools.

### External integration gateway

| Tool | Purpose |
| --- | --- |
| `integrations_search` | Return a small ranked set of external actions. |
| `integrations_describe` | Inspect one action's live schema, scopes, connection state, and risk. |
| `integrations_connections` | List safe connections for the authorized workspace. |
| `integrations_execute` | Execute one action through an owned connection and the approval boundary. |

See [`integrations/openconnector.md`](integrations/openconnector.md) for the
adapter, OAuth, deployment, security, and error contracts.

### Lancee workspace and workflows

| Tool | Purpose |
| --- | --- |
| `run_workflow` | Queue an active Core or Edge workflow. |
| `create_workflow` | Create a bounded prompt-backed Core or Edge workflow. |
| `query_dashboard` | Read an approved workspace resource without raw SQL. |
| `create_client` | Create or complete a workspace client. |
| `create_project` | Create a project for an existing or new client. |
| `set_project_status` | Move a project to a supported status. |
| `request_connector` | Persist a request for a managed integration. |
| `delete_workspace_resource` | Delete a supported resource with owner confirmation. |
| `get_workflow_status` | Read workflow or run state and recent activity. |
| `search_workflows` | Filter workflows by text, status, and execution mode. |
| `schedule_job` | Persist a one-shot or repeating workflow schedule. |
| `get_logs` | Read bounded persisted workflow-run events. |

### Files, documents, and artifacts

| Tool | Purpose |
| --- | --- |
| `create_file` | Store bounded text, Markdown, or JSON in Files. |
| `read_file` | Read bounded supported file content. |
| `search_files` | Search workspace file metadata/content safely. |
| `get_file_metadata` | Read one file's workspace-scoped metadata. |
| `create_pdf` | Render approved Markdown as a styled, print-ready PDF and register its artifact. |
| `create_document` | Create PDF, DOCX, HTML, or Markdown output. |
| `merge_documents` | Deterministically merge compatible documents. |
| `list_artifacts` | List bounded artifact metadata. |
| `get_artifact` | Read artifact metadata, links, and optional bounded content. |
| `register_artifact` | Register an existing workspace file as an artifact. |

### Web, browser, and visual capabilities

| Tool | Purpose |
| --- | --- |
| `web_search` | Return bounded public source titles, URLs, and snippets. |
| `access_webpage` | Fetch a bounded public web page. |
| `extract_web_content` | Extract sanitized readable content from a public page. |
| `crawl_website` | Crawl a bounded set of same-site public pages. |
| `browser_read` | Read a public page through isolated Playwright. |
| `browser_snapshot` | Return a bounded accessibility/content snapshot. |
| `browser_screenshot` | Capture a screenshot and register it as an artifact. |
| `browser_pdf` | Render a public page as an A4 PDF and register it as an artifact. |
| `browser_research` | Search the public web and read up to five resulting sources as bounded rendered evidence. |
| `analyze_visual` | Inspect image dimensions, format, and bounded statistics. |
| `extract_visual_palette` | Return a bounded representative colour palette. |

Browser navigation remains deliberately read-only: click, type, upload, download,
credentialed browsing, and arbitrary browser script execution are not exposed.
`browser_screenshot` and `browser_pdf` write only their generated artifact to the
authorized Lancee workspace, require approval, and cannot write to the browsed site.

### Runtime controls, approvals, and integrations

| Tool | Purpose |
| --- | --- |
| `get_job_status` | Read one durable job and its event stream. |
| `list_jobs` | List bounded jobs in the current workspace. |
| `cancel_job` | Cancel a queued or running job. |
| `list_approvals` | List agent approvals in the current workspace. |
| `get_approval` | Read one approval and its bound step/run details. |
| `decide_approval` | Approve or deny a pending agent action. |
| `execute_python` | Run bounded Python only when explicitly enabled. |
| `execute_javascript` | Run bounded JavaScript only when explicitly enabled. |
| `call_external_api` | Call a public HTTPS API with bounded input/output. |

## Authentication and workspace context

The MCP route requires a Lancee device token with the `mcp:invoke` scope:

```http
POST /mcp
Authorization: Bearer lnc_codex_...
Content-Type: application/json
```

The device flow issues a token only after a signed-in user approves the shown
code and scopes. Lancee stores only token hashes. The token resolves the user,
workspace, and membership on the server; tool arguments cannot select or
override a workspace or user.

`MCP_SERVER_TOKEN`, `MCP_GATEWAY_URL`, `MCP_API_TOKEN`, Basebox credentials,
external MCP discovery, and per-workspace server activation are unsupported.

## Protocol surface

The local endpoint supports:

- `initialize`;
- `ping`;
- `tools/list`;
- `tools/call`;
- `notifications/initialized` and `notifications/cancelled`; and
- JSON-RPC batches of at most 64 messages.

Tool failures are returned as MCP tool results with `isError: true` and stable
`MCP_*` error codes. Unknown methods and invalid JSON-RPC parameters use
protocol errors.

## Capability contract and result boundary

Every internal capability declares:

- a stable ID and semantic version;
- JSON input and output schemas;
- provider and availability state;
- permissions and role policy;
- risk and autonomous-approval policy;
- timeout, estimated cost, concurrency limit, and async support; and
- search/discovery tags.

The registry validates input before execution and output after execution. Its
internal normalized envelope is:

```json
{
  "success": true,
  "data": {},
  "artifacts": [],
  "warnings": [],
  "error": null,
  "metadata": {}
}
```

MCP compatibility mapping exposes the capability data as `structuredContent`
while retaining stable public tool names.

## Authorization and approvals

- Read capabilities are available to valid workspace members.
- Viewers cannot mutate workspace state.
- Collaborators may perform allowed internal writes.
- External, destructive, and administrative actions require an owner.
- Direct MCP calls remain explicit client requests and still pass role,
  schema, rate, concurrency, and resource authorization.
- An autonomous agent cannot execute a capability marked `requiresApproval`
  without a persisted approval for that exact run, step, tool, and canonical
  argument hash.
- Agent approvals expire after 15 minutes by default, are consumed atomically
  before invocation, and cannot be replayed or reused with different arguments.

## Network and browser safety

Outbound web and integration calls:

- accept only supported HTTP methods and production HTTPS;
- reject embedded credentials, sensitive forwarded headers, compression, and
  oversized bodies;
- resolve DNS, reject private/special IPv4 and IPv6 ranges, pin the validated
  address, and revalidate every redirect;
- bound request count, redirect count, response bytes, content, and time; and
- mark remote text as untrusted data that cannot authorize another action.

The production Docker image is based on the pinned Playwright runtime. Browser
work is delegated from the Express process to a JSON-lines child running as
the unprivileged `pwuser`. JavaScript, downloads, service workers, browser
permissions, and uncontrolled subrequests are blocked. Every browser GET is
refetched through the validated network layer.

## Durable agent, jobs, and artifacts

Agent threads, runs, steps, approvals, and sequenced events are stored in the
same PostgreSQL/SQLite persistence layer as Lancee. Plans are validated JSON
sequences, and runs enforce hard step, tool-call, runtime, cost, token, retry,
and repeated-call budgets. Cancel and resume operations are workspace/user
scoped.

Long-running work uses database rows as the source of truth. Workers claim
jobs atomically with a lease, heartbeat it, recover expired leases, retry only
bounded retryable failures with exponential backoff, and append durable events.
Redis may accelerate wake-ups but cannot become the job ledger.

Artifacts store workspace ownership, source/run relationships, size, MIME
type, SHA-256 integrity, storage reference, metadata, lifecycle timestamps, and
links to other workspace subjects. Inline reads are bounded.

## Audit and limits

One registry boundary records duration, status, request/user/run origin,
provider, risk, canonical input hash, returned artifact IDs, and stable error
code. It never writes raw credentials or unrestricted tool input to the MCP
audit message.

The V1 limits include 120 registry calls per workspace/user/minute, per-tool
concurrency limits, capability timeouts, a 1,000-job active queue ceiling per
workspace, bounded protocol batches, and adapter-specific byte/item limits.

## Verification

Run the focused implementation checks:

```bash
pnpm verify:mcp
pnpm verify:capabilities
pnpm verify:documents
pnpm verify:runtime-persistence
pnpm verify:agent-runtime
pnpm verify:workers-artifacts
pnpm verify:codex-connector
```

Or run the consolidated suite:

```bash
pnpm verify:platform
```

The tests cover base-tool schema parity, feature-gated integration tools,
protocol behavior, device authorization,
roles and approvals, normalization, auditing, rate/concurrency limits, SSRF
variants, document and artifact integrity, job recovery/retry/cancellation,
agent budgets/loops/restart isolation, SQLite/PostgreSQL-compatible persistence,
and the authenticated HTTP connector path.

The source suite uses an injected browser worker because no Chromium binary is
required on a developer host. After building the production image, perform one
real `browser_screenshot` smoke against a public HTTPS page to verify Chromium,
font, sandbox, and `pwuser` execution in that deployment.

See [`LANCEE_AGENT_RUNTIME.md`](LANCEE_AGENT_RUNTIME.md) for agent APIs and
operations, and
[`LANCEE_RUNTIME_MCP_INTEGRATIONS.md`](LANCEE_RUNTIME_MCP_INTEGRATIONS.md)
for the architecture decision and post-V1 expansion boundary.
