# Hermes integration

## Implementation progress

### Task 1 — audit completed

The existing WorkspaceChat path was:

```text
WorkspaceChat
  -> POST /api/agent/runs
  -> Lancee agent-runtime planner
  -> completeChat()
  -> Lancee capability registry
  -> Lancee MCP capability implementations
```

Simple bounded AI operations use the same `completeChat()` function through
`POST /api/ai/complete`, `/api/ai/chat`, and several server-side builders.
OpenAI, Anthropic, Gemini, and Hermes completion behavior must remain intact.

The repository already has the required Lancee business boundary:

- `server/lancee-mcp.mjs` exposes the tool contracts and workspace-scoped
  invocation layer.
- `server/lancee-mcp-protocol.mjs` exposes the Streamable HTTP-compatible MCP
  route.
- `server/capabilities/registry.mjs` validates schemas, permissions, risk,
  approvals, rate limits, concurrency, timeouts, and audit events.
- `agent_threads.external_thread_id` can persist a provider-owned session id.
- `agent_runs`, `agent_steps`, approvals, and run events persist the legacy
  Lancee runtime state.
- Authentication middleware creates the trusted `{ user, workspace,
  membership, permissions }` context; model arguments do not establish it.

The initial refactor will preserve the Lancee runtime as a fallback provider,
keep `completeChat()` for completions, and put WorkspaceChat behind a provider
gateway. Hermes requests will use the native agent API only when Hermes is
configured and will never receive browser credentials or database secrets.

## Target path

```text
WorkspaceChat
  -> Lancee Agent Gateway
  -> Hermes Agent Runtime (native runs/sessions API)
  -> Hermes-configured Lancee MCP server
  -> Lancee capability registry
  -> Lancee services/database
```

When Hermes is unavailable or explicitly disabled, the gateway uses the
existing Lancee provider so current workspace functionality remains usable.

### Task 2 — provider boundary completed

Workspace agent routes now call `server/agents/agent-provider.mjs` instead of
calling `server/agent-runtime.mjs` directly. The gateway selects `hermes` or
`lancee` with `AGENT_PROVIDER`, keeps `lancee` as the default fallback, and
records provider selection in the existing `agent_threads.provider` field.

The new provider files are:

- `server/agents/agent-provider.mjs` — configuration, trusted-context checks,
  fallback policy, status, and provider dispatch.
- `server/agents/hermes-agent-provider.mjs` — Hermes native agent adapter.
- `server/agents/lancee-agent-provider.mjs` — adapter around the unchanged
  Lancee planner/executor.

`/api/ai/complete`, `/api/ai/chat`, builders, and all other bounded AI flows
still use `completeChat()` and the existing completion-provider configuration.
`/api/ai/status` retains its completion status and now includes nested
`completion` and `agent` status; `/api/agent/status` exposes agent status only.

The runtime split is controlled by `AGENT_PROVIDER`,
`AGENT_FALLBACK_PROVIDER`, and `AGENT_FALLBACK_ENABLED`. Hermes is selected
automatically when its endpoint and either `HERMES_API_KEY` or
`HERMES_PROFILE_API_KEYS_JSON` are configured. Every Hermes request is routed to
the authenticated workspace's named profile; a missing workspace profile fails
closed and never falls back to Hermes' default or personal profile. Availability,
timeout, endpoint, or malformed-response failures may still use the configured
Lancee provider fallback without exposing prompts or provider secrets in logs.

### Task 3 — native Hermes runtime completed

`server/agents/hermes-agent-provider.mjs` now uses Hermes’ native runtime
surface:

- `POST /api/sessions` and `GET /api/sessions/{id}` before every native run.
  A session endpoint that is unavailable or rejects the request prevents the
  Hermes run; the adapter never continues with an unverified session.
- `POST /v1/runs` with the bounded user message, a minimal trusted instruction
  block, the persisted external session id, and explicit history reconstructed
  from the scoped Lancee agent runs and artifacts.
- `GET /v1/runs/{id}` polling as the authoritative completion state.
- `GET /v1/runs/{id}/events` SSE for safe tool/approval progress metadata.
- `POST /v1/runs/{id}/approval` for UI approval decisions and
  `POST /v1/runs/{id}/stop` for cancellation.

`agent_threads.external_thread_id` stores the provider-owned Hermes session id
for a Lancee conversation. The database lookup always includes workspace and
authenticated user; an explicit missing thread is a 404 and is never replaced
with the latest/default thread. Hermes run ids, profile id, session id, and
session creation/resume state are stored in `agent_runs.usage`; local run events
store only bounded metadata.

The workspace profile id is `lancee_ws_<workspaceId>`. By default the adapter
uses `HERMES_ENDPOINT_URL/p/<profileId>`; deployments with a different exposed
route must set `HERMES_PROFILE_ENDPOINT_TEMPLATE` using `{profileId}` (or
`{profile}`/`{workspaceId}`). `HERMES_PROFILE_API_KEYS_JSON` maps named profile
ids to their server-side Hermes keys. If that map is omitted, `HERMES_API_KEY`
is treated as the configured key for the named profile route, never as a
default-profile route.

`X-Hermes-Session-Key` is derived from the authenticated workspace, user,
profile, and conversation, and `X-Hermes-Session-Id` carries the exact native
session id. This keeps raw conversation memory isolated while the named
workspace profile remains the durable business identity. Workspace-level
business intelligence should be exchanged through authoritative Lancee records,
not by allowing unrelated chat transcript memory to bleed between conversations.
Hermes credentials remain server-only.

Stable Hermes preferences use the existing `hermes_user_preferences` table, but
their stored keys are namespaced by the authenticated workspace and user before
they are injected into a run. Older unscoped preference rows are retained but
never retrieved, so they cannot cross a workspace boundary. Conversation context
is never stored there: it is reconstructed only from the exact persisted agent
thread and its workspace-scoped runs and artifacts.

Hermes owns reasoning, planning, and its tool loop. Lancee owns business
authorization, tenant scoping, approvals surfaced to the UI, durable run
records, and MCP capability execution. A Hermes approval is represented as a
local `ha_...` approval id and is checked against the persisted run before a
decision is forwarded.

The complete native Hermes agent toolset available in the selected profile
remains available for general conversation, skills, web and image research,
browser automation and screenshots, terminal/code execution, files, memory,
session search, media tools, and subagent orchestration. Lancee MCP is an
additional business toolset for authenticated workspace data; general Hermes
requests are not routed through Lancee tools.

The current official Hermes API does not document per-request dynamic MCP
server credentials. Lancee MCP must therefore be configured on the Hermes
server with a workspace/profile-scoped Lancee credential; the model cannot
choose a workspace or user in tool arguments. Browser tokens, database
credentials, and the raw MCP credential are never sent in the agent prompt.

The server-side Hermes MCP configuration is conceptually:

```yaml
mcp_servers:
  lancee:
    url: https://lancee.example/mcp
    headers:
      Authorization: Bearer lnc_codex_<workspace-scoped-token>
```

The Lancee token must be issued with the `mcp:invoke` scope and must resolve
to the intended workspace/user. Do not put this token in `.env` files shipped
to browsers or in model-visible instructions. If a deployment cannot provide
one Hermes profile or credential per tenant boundary, the native Hermes MCP
path is unavailable for that deployment and the Lancee provider should be
selected instead.

The adapter supports Hermes native sessions, asynchronous runs, explicit
conversation history, status polling, progress events, approval responses,
stop, and scoped session headers without reducing the agent's native tool or
skill inventory. Recognized Hermes file/artifact results are checked against
the authenticated workspace, linked to the persisted run and conversation
through the existing artifact tables, and returned as Lancee Files
attachments. Native image and screenshot `MEDIA:` paths are imported only from
the active profile's `cache`/`images` directories or the comma-separated roots
in `HERMES_MEDIA_ROOTS`, are bounded by `HERMES_MEDIA_MAX_BYTES` (10 MB by
default), and are replaced with authenticated Lancee document URLs. A separate
Hermes container must expose those roots to Lancee through a shared volume.
Unverified local paths still never become downloads, while ordinary HTTP(S)
URLs—including URLs whose path contains `/app`, `/home`, or `/workspace`—remain
unchanged. The UI restores the selected conversation from workspace/user-scoped
browser storage and reloads its server-side run history; it does not select a
latest conversation implicitly.

Hermes features such as native session chat, forking, response chaining, skills
management, and cron/jobs are not routed by this adapter; scheduled or
business-critical work remains in Lancee's durable automation/job records.
Direct Hermes completion remains available through `completeChat()` when
configured as an `AI_PROVIDER`.

### Task 4 — security, verification, and documentation completed

The focused `verify:agent` command covers provider selection, trusted tenant
context rejection, named profile routing, native run format and authentication,
conversation history continuity, same-workspace conversation separation,
cross-workspace and cross-user separation, same-session restoration after a
provider reload, structured artifacts, native `MEDIA:` screenshot import,
public-URL preservation, file-save truthfulness, malformed responses,
unavailable sessions and timeouts, fallback, and run isolation. The existing
`verify:ai` command continues to cover OpenAI,
Anthropic, Gemini, and Hermes completion requests, while
`verify:codex-connector` covers device-issued MCP token scope and workspace
authorization. Completion behavior remains separately verified.

The implementation is also documented in the root README, `.env.example`,
this file, and the timestamped changelog for this change. The legacy Lancee
runtime remains available through `AGENT_PROVIDER=lancee` or the configured
fallback; no business capability implementations were duplicated in Hermes.

## Decision Intelligence readiness

The current foundation keeps the persistent business identity at the workspace
boundary while keeping raw chat context at the conversation boundary. Future
Decision records can use `workspace_id`, a stable Lancee record id, provenance
references to conversations/files/projects/clients/tasks/invoices, creator and
timestamps, confidence, expected outcome, actual outcome, and status. Existing
`agent_runs`, workspace documents, artifacts, and artifact links provide the
durable source references needed to attach those records without treating model
memory as the source of truth.

Historical decisions can later be retrieved by workspace and source reference,
and scheduled outcome reviews can run under the same workspace profile and
Lancee authorization context. A future activity → decision → outcome → lesson
loop is therefore compatible with the current isolation model. The structured
Decision schema, evaluation jobs, recommendations, and scheduled review UI are
not implemented by this change and remain the next product layer; nothing in
the current conversation/session or artifact mapping blocks them.
