# lancee Integrations

The product calls these **Connections** in the user interface. They bring a
freelancer's existing tools into the context of clients, projects, ideas,
automations, and invoices.

## Application-managed connections

Business-system integrations are implemented by the lancee application and
its server-side APIs. The Connections page can persist a request for an
unsupported system through `POST /api/integration-requests`; each request is
scoped to the current workspace, records its category and optional workflow
details, and uses the normal idempotent mutation boundary.

This keeps long-lived business credentials, webhooks, and data access in the
application backend. Google Drive starts OAuth directly from its Connections
card using the non-sensitive `drive.file` scope and the configured
`/oauth/callback`; Paystack opens a workspace credential form; and n8n opens
its signed webhook configuration. Generic connection toggles cannot
manufacture a connected state.

MCP remains a separate automation-tool gateway. By default the server returns
only `Browser` and `Utilities` categories from the live MCP catalog. Override
that allowlist explicitly with `MCP_ALLOWED_CATEGORIES`; do not use MCP as a
substitute for durable business-system connections.

## Payments and invoicing

Paystack is the implemented payment connection in **Connections** and
**Money**. It supports region-friendly card and bank payments through hosted
checkout.

Paystack now has a real server-side ZAR flow: a configured workspace can create
a durable invoice and hosted checkout link, then reconcile `charge.success`
through a verified webhook. The link is reviewed and shared explicitly; lancee
does not send or directly charge the client. Unsupported payment providers are
not shown as connectable cards; use the connection-request form to record a
needed provider.

The Connections page accepts a workspace Paystack secret key from an owner.
The backend validates its mode, encrypts it with AES-256-GCM, persists only the
ciphertext and a non-secret fingerprint, and returns a workspace-scoped webhook
URL. `PAYSTACK_SECRET_KEY` is retained as an optional environment fallback.

The Paystack implementation initializes idempotently, protects immutable
provider references, verifies raw-body webhook signatures with the matching
workspace key, matches workspace/amount/currency/reference, and requires
explicit review before sharing.
Partial payments, refunds, disputes, tax, and multi-currency remain future
work. See [`PAYSTACK.md`](PAYSTACK.md).

## n8n

The n8n integration is a bidirectional signed webhook bridge.

### lancee to n8n

The operator manually enters the production webhook DNS URL in the platform:

```text
https://n8n.hygridtech.co.za/webhook/lancee
```

lancee can send either:

- `GET` with query parameters for lightweight triggers.
- `POST` with a JSON event payload.

### n8n to lancee

The UI generates the callback:

```text
https://agents.hygridtech.co.za/api/hooks/n8n/wsp_primary
```

An n8n HTTP Request node can call the callback with either GET or POST. Both
directions sign the timestamp, one-use nonce, method, exact path/query, and
body hash through `X-Lancee-Signature`.

The implementation sends real outbound requests with HTTPS/exact-origin/public
DNS validation, redirect denial, and a bounded timeout. Inbound requests have a
five-minute timestamp window and persisted nonce replay protection. Every
attempt records status, duration, correlation, and retry lineage. The shared
secret is AES-256-GCM encrypted at rest. See [`N8N.md`](N8N.md).

## MCP Service Grid

The MCP server implementation and documentation live in:

```text
/home/apps/mcp
```

lancee reaches it through the configured DNS gateway:

```text
https://mcp.hygridtech.co.za
```

MCP is included as a platform capability for every workspace. It is not a
business integration a user installs or disconnects. The UI requires no MCP
URL or API key entry, and the default category allowlist exposes only browser
automation and utility services.

### Bearer access lifecycle

Every new workspace starts with MCP in `available` state. When the gateway is
configured, the workspace can load its live service catalog and select
**Request bearer access**:

```http
POST /api/mcp/access-request
Cookie: lancee_session=<HttpOnly session>
```

The application backend owns `MCP_API_TOKEN` and performs all MCP calls
server-to-server:

- If the bearer token is configured, the request is approved
  immediately.
- If it is not configured, the request remains pending for a future workspace
  approval workflow.
- Approved users can activate or deactivate services.
- Revoking bearer access disables services but never removes MCP from the
  workspace.

`GET /api/mcp/access` returns status and non-secret gateway metadata.
`POST /api/mcp/access/revoke` revokes the workspace grant. Bearer state and
per-service activation are stored in workspace-scoped `mcp_access` and
`mcp_service_state` rows and survive process restarts. Workspace invitations
use a separate expiring-token flow.

### Discovery

```http
GET /api/v1/capabilities
Authorization: Bearer <server-side token>
```

The platform exposes only services and tools returned by the gateway's live
capability response. The browser receives the runtime input schemas and builds
bounded representative arguments for manual tests. After bearer approval,
users activate only the services they want. Activation is durable, and test
results come from the real gateway tool call rather than a local simulation.

### Tool invocation

Production application calls should use the stable catalog route:

```http
POST /api/v1/tools/{tool_id}/call
Authorization: Bearer <server-side token>
Content-Type: application/json
```

The MCP registry resolves the active worker. Disabled services/tools cannot be invoked, and a missing live lease returns `503`.

### Credential boundary

- `PUBLIC_API_TOKEN` never enters the browser bundle.
- Bearer request responses never contain a token or token hint.
- Provider API keys referenced by MCP tools remain in the server-side secret store.
- The frontend receives names, descriptions, tool schemas, activation state, and normalized invocation results only.
- Browser artifacts must be proxied by an authenticated backend before embedding.

Durable storage and mutation replay behavior are documented in
[`DURABLE_FOUNDATION.md`](DURABLE_FOUNDATION.md).

## Deployment

- Public URL: `https://agents.hygridtech.co.za`
- Application listener: `0.0.0.0:5177`
- PM2 process: `nexus-agents-platform`
- TLS and reverse proxy: Nginx Proxy Manager
- Upstream: `http://192.168.1.66:5177`

Useful commands:

```bash
pnpm build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 describe nexus-agents-platform
```
