# OpenConnector integration gateway

OpenConnector is Lancee's optional execution gateway for third-party SaaS
actions. Lancee remains responsible for user intent, planning, workspace and
role authorization, approval, automation orchestration, and durable audit.
OpenConnector owns provider credential storage, OAuth state and token exchange,
token refresh, provider schemas, and provider API execution.

This integration targets OpenConnector `1.3.5` at commit
`e298b5aa13e899a3e77d519e7c9ee3104e1fc5d1` (inspected 2026-08-08). Its HTTP
contracts are `/v1/providers`, `/v1/apps`, `/v1/actions/search`,
`/v1/actions/:actionId`, and `POST /v1/actions/:actionId`. OAuth starts through
the admin endpoint `POST /api/oauth/authorizations`; OpenConnector completes
the flow at `/oauth/callback`.

## Architecture

```text
                         LANCEE

                    User / Connections UI
                              |
                              v
                    Lancee AI / Automations
                              |
                              v
                         Lancee MCP
                              |
             +----------------+----------------+
             |                                 |
             v                                 v
       Native capabilities             IntegrationGateway
       web, browser, files,                    |
       documents, data, code                   v
                                      OpenConnector adapter
                                               |
                                               v
                                          OpenConnector
                                               |
                         +---------------------+------------------+
                         v                     v                  v
                     Google                Microsoft           Slack / GitHub
```

OpenConnector is not registered as a second Lancee MCP server. The existing
`/mcp` endpoint and capability registry expose four bounded discovery/execution
tools. Native Lancee tools remain available when the feature flag is off or the
gateway is unavailable.

## Existing architecture reused

- `server/capabilities/registry.mjs` supplies schemas, role policy, risk,
  approval, timeout, concurrency control, normalized results, and MCP audit.
- `server/lancee-mcp.mjs` and `server/lancee-mcp-protocol.mjs` remain the only
  Lancee MCP runtime and transport.
- `server/database.mjs` remains the PostgreSQL/SQLite persistence adapter and
  supplies explicit workspace filtering plus PostgreSQL row-level security.
- Existing Express session authentication, origin validation, owner checks,
  and idempotent mutations protect the management API.
- The existing Connections page and visual system render provider state.
- The existing agent planner discovers the `integration` namespace when a task
  references email or a supported connected application.

## Responsibility boundary

Lancee stores only non-secret association data: its connection id, workspace,
user, provider, an opaque OpenConnector connection alias/id, safe display name,
status, scopes, and timestamps. OAuth access tokens, refresh tokens, API keys,
OAuth client secrets, and raw credential records stay in OpenConnector.

Every execution validates this chain on the server:

```text
authenticated user -> workspace membership -> Lancee connection row
  -> provider/action match -> role and integration permission
  -> approval (autonomous calls) -> OpenConnector action
```

The caller cannot submit a URL, HTTP method, or credential to the integration
execution tool. It submits only a catalog action id, a Lancee connection id,
and input matching the action contract. Lancee describes the action before
execution; OpenConnector performs authoritative JSON-schema and provider-scope
validation.

## Deployment and configuration

`docker-compose.yml` runs `ghcr.io/oomol-lab/open-connector:v1.3.5` on the
private Compose network. No OpenConnector port is published. Its persistent
SQLite data is stored in the `openconnector_data` volume. Lancee proxies only
the required public callback:

```text
GET /openconnector/oauth/callback -> openconnector:3000/oauth/callback
```

Configure these Lancee variables:

| Variable | Purpose |
| --- | --- |
| `OPENCONNECTOR_ENABLED` | Feature flag; must be `true` to register gateway tools and UI providers. |
| `OPENCONNECTOR_URL` | Internal gateway origin; Compose uses `http://openconnector:3000`. |
| `OPENCONNECTOR_TIMEOUT_MS` | Per-request timeout, clamped to 500–30,000 ms. |
| `OPENCONNECTOR_RUNTIME_TOKEN` | Bearer token for `/v1/*` discovery and execution. |
| `OPENCONNECTOR_ADMIN_TOKEN` | Bearer token used only for OAuth start and disconnect. |
| `OPENCONNECTOR_ENCRYPTION_KEY` | OpenConnector credential encryption key. Required for production operation. |
| `OPENCONNECTOR_ALLOWED_ACTIONS` | Optional OpenConnector action allowlist. |
| `OPENCONNECTOR_BLOCKED_ACTIONS` | Optional OpenConnector action denylist. |

Use independent, high-entropy values for the encryption, runtime, and admin
tokens. Never expose them through `VITE_*` variables. The Compose service
disables OpenConnector's generic provider proxy surface.

Set OpenConnector's public origin to `${PUBLIC_ORIGIN}/openconnector`. Register
this callback in each self-hosted provider OAuth application:

```text
${PUBLIC_ORIGIN}/openconnector/oauth/callback
```

Self-hosted OpenConnector requires operator-provided OAuth apps and client
configuration. Configure those clients through the private OpenConnector admin
console/API before a Lancee user selects **Connect**.

## Connections and OAuth

`POST /api/openconnector/connections/:provider/connect` is owner-only and
origin-protected. Lancee creates an opaque random alias, persists the workspace
association as `connecting`, then asks OpenConnector for an authorization URL.
OpenConnector stores and consumes its own random OAuth state. The browser opens
the provider URL in a popup and Lancee polls safe connection summaries.

Because only Lancee knows the alias-to-workspace mapping, an alias supplied by
an AI or another workspace cannot select a connection. Disconnect is owner-only
and removes the upstream credential before deleting Lancee metadata.

Connection states are `available`, `connecting`, `connected`, `expired`,
`error`, and `disabled`. The UI shows account label, scopes, dates, and state;
it never receives the upstream alias or any credential field.

## MCP tools and dynamic discovery

When the feature flag is enabled, Lancee adds exactly four tools to its
existing MCP registry:

| Tool | Risk / approval | Purpose |
| --- | --- | --- |
| `integrations_search` | read | Search by intent, provider, connection state, and a maximum result count of 10. |
| `integrations_describe` | read | Return the current input/output schemas, scopes, permissions, connection state, and risk. |
| `integrations_connections` | read | Return safe connections for the authenticated workspace only. |
| `integrations_execute` | external action; approval required for autonomous use | Validate and execute one selected action through one selected connection. |

The base catalog remains 40 tools. Enabling OpenConnector makes it 44 tools;
the provider action catalog is never expanded into thousands of permanent MCP
tools. A typical agent sequence is:

```text
integrations_search("send email")
  -> integrations_connections()
  -> integrations_describe("gmail.send_email")
  -> approval
  -> integrations_execute(...)
```

## Permissions and risk

The existing registry requires `integrations:read` for discovery and
`integrations:invoke` for execution when a context declares capability
permissions. Existing role policy allows read discovery to members, blocks
writes for viewers, and restricts external actions to owners.

Optional provider permissions support hierarchical matching:

```text
integration.*
integration.gmail.*
integration.gmail.send_email
```

Action risk is normalized into Lancee's existing levels. Read/list/search/get
actions are `read`; create/send/update operations are `external-action`;
delete/revoke/remove operations are `destructive`; payment/transfer/refund
operations are `administrative`. The single MCP execution capability always
passes through Lancee's approval gate for autonomous runs.

## Reliability and errors

GET discovery calls retry transient gateway, rate-limit, and server failures
with bounded exponential backoff. Action calls retry only when classified as
read and always reuse an OpenConnector `Idempotency-Key`. Write, destructive,
financial, and administrative actions are not automatically retried.

Normalized public error codes include:

- `INTEGRATION_NOT_CONNECTED`
- `INTEGRATION_PERMISSION_DENIED`
- `INTEGRATION_SCOPE_REQUIRED`
- `INTEGRATION_RATE_LIMITED`
- `INTEGRATION_AUTH_EXPIRED`
- `INTEGRATION_PROVIDER_ERROR`
- `INTEGRATION_GATEWAY_UNAVAILABLE`
- `INTEGRATION_ACTION_NOT_FOUND`
- `INTEGRATION_INVALID_INPUT`

The `/api/health` response reports `healthy`, `degraded`, `unavailable`, or
`disabled` with latency. An unavailable gateway never changes the top-level
Lancee health result and cannot stop native capabilities.

## Audit and data model

`integration_connections` stores workspace/user/provider association metadata.
`integration_executions` records the execution id, workspace, user, provider,
connection, action, risk, status, duration, source, error code, and timestamp.
An audit row is created as `running` before provider execution and completed as
`completed` or `failed` afterward. Inputs, outputs, authorization headers, and
credentials are not stored in this table. The capability registry also records
its normal hashed-input MCP audit entry.

Both new tables use explicit `workspace_id` predicates, foreign keys with
cascading workspace deletion, and forced PostgreSQL row-level security. The
SQLite-to-PostgreSQL migration includes both tables.

## Lancee API

| Method and route | Purpose |
| --- | --- |
| `GET /api/openconnector/status` | Gateway status and latency. |
| `GET /api/openconnector/providers` | Bounded provider metadata for the Connections UI. |
| `GET /api/openconnector/connections` | Workspace-safe connection list and status refresh. |
| `POST /api/openconnector/connections/:provider/connect` | Start owner-authorized OAuth. |
| `DELETE /api/openconnector/connections/:connectionId` | Disconnect an owned provider account. |
| `GET /api/openconnector/actions/search` | Dynamic action search. |
| `GET /api/openconnector/actions/:actionId` | Current action description/schema. |
| `POST /api/openconnector/actions/:actionId/execute` | Confirmed owner execution path. |

## Adding providers

No Lancee code is required for another provider that already exists in the
OpenConnector catalog. Configure its OAuth app or credential in OpenConnector,
allow its actions in policy, and it appears in Lancee provider search. Add
provider-specific Lancee logic only when a business rule truly belongs in the
orchestration layer.

The initial validation set is Gmail, Outlook, GitHub, and Slack. Automated
tests use a mock provider and never send external messages.

## Verification and troubleshooting

Run:

```bash
npm run verify:openconnector
npm run verify:mcp
npm run verify:capabilities
npm run verify:runtime-persistence
npm run build
npm run lint
```

| Symptom | Check |
| --- | --- |
| Gateway is `disabled` | Set `OPENCONNECTOR_ENABLED=true` in the Lancee service. |
| Gateway is `unavailable` | Check the private URL, container health, runtime token, and Compose network. |
| OAuth client configuration required | Configure that provider's OAuth app in OpenConnector. |
| Provider callback mismatch | Register `${PUBLIC_ORIGIN}/openconnector/oauth/callback` exactly. |
| Connection remains `connecting` | Complete the popup, then refresh; inspect OpenConnector OAuth/run logs. |
| Action says scope required | Reconnect with the provider scopes declared by the action description. |
| Action is missing | Check OpenConnector allowed/blocked action policy and the pinned catalog version. |

## Production work remaining

- Generate and install the OpenConnector encryption, admin, and runtime tokens.
- Register OAuth applications and callback URLs for each chosen provider.
- Configure provider-specific OAuth client ids/secrets inside OpenConnector.
- Apply a production action allowlist and validate Gmail, Outlook, GitHub, and
  Slack against non-production accounts.
- Configure the reverse proxy to pass `/openconnector/oauth/callback` to
  Lancee; do not route any other OpenConnector path publicly.

