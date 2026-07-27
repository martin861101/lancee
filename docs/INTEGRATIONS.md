# lancee Integrations

The product calls these **Connections** in the user interface. They bring a
freelancer's existing tools into the context of clients, projects, ideas,
automations, and invoices.

## Payments and invoicing

Stripe, PayPal, and Paystack appear in **Connections** and **Money**:

- **Stripe** — intended for card and bank payments, hosted links, invoice
  reconciliation, and verified webhooks.
- **PayPal** — intended for PayPal checkout and supported card payments for
  international clients.
- **Paystack** — intended for region-friendly card and bank payments across
  African markets.

Paystack now has a real server-side ZAR flow: a configured workspace can create
a durable invoice and hosted checkout link, then reconcile `charge.success`
through a verified webhook. The link is reviewed and shared explicitly; lancee
does not send or directly charge the client. Stripe and PayPal remain clearly
marked previews.

The Paystack implementation keeps its key server-side, persists a
workspace-scoped connection fingerprint, initializes idempotently, protects
immutable provider references, verifies raw-body webhook signatures, matches
amount/currency/reference, and requires explicit review before sharing.
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

MCP is included as a platform capability for every workspace. It is not an
integration a user installs or disconnects. The UI requires no MCP URL or API
key entry.

### Bearer access lifecycle

Every new workspace starts with MCP in `available` state and can browse the
service catalog. The user selects **Request bearer access**:

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
`mcp_service_state` rows and survive process restarts. Self-service signup
still requires account verification and invitation flows.

### Discovery

```http
GET /api/v1/capabilities
Authorization: Bearer <server-side token>
```

The platform exposes only live, runtime-verified services. The placeholder
catalog models the currently documented workers:

- `browser-worker` — ten browser, audit, extraction, screenshot, and document tools.
- `text-worker` — text transformation, statistics, and replacement.
- `data-worker` — bounded CSV/JSON conversion and field selection.
- `utility-worker` — hashes, Base64, and UUID generation.

After bearer approval, users activate only the services they want and can run a
representative test tool. Browser automation tests use `website_smoke_test`.
Service activation is durable. Capability discovery and representative tool
results remain placeholders until the gateway transport is connected.

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
