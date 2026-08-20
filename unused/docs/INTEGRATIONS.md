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
card using the non-sensitive `drive.file` scope, Google Picker, and the
configured OAuth callback. The canonical path is `/oauth/callback`; existing
deployments may use `/api/google-drive/oauth/callback` or
`/api/integrations/google/callback` as compatibility aliases. Only files and
folders explicitly selected by the user are listed in lancee. The authenticated document workspace edits
Google Docs, Markdown, and DOCX files in place, previews PDFs and images, and
uses Drive version checks to prevent stale saves. Paystack opens a workspace
credential form, and n8n opens its signed webhook configuration. Generic
connection toggles cannot manufacture a connected state.

MCP is a local protocol surface over these Lancee-owned services. It is not a
second integration backend and it does not discover external MCP servers.
Provider connections remain application-managed and can register approved
tools with Lancee's local capability registry.

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
https://lancee.hookitupservices.com/api/hooks/n8n/wsp_primary
```

An n8n HTTP Request node can call the callback with either GET or POST. Both
directions sign the timestamp, one-use nonce, method, exact path/query, and
body hash through `X-Lancee-Signature`.

The implementation sends real outbound requests with HTTPS/exact-origin/public
DNS validation, redirect denial, and a bounded timeout. Inbound requests have a
five-minute timestamp window and persisted nonce replay protection. Every
attempt records status, duration, correlation, and retry lineage. The shared
secret is AES-256-GCM encrypted at rest. See [`N8N.md`](N8N.md).

## Lancee MCP

MCP is included as a platform capability for every workspace. It is served by
the Lancee application itself at `POST /mcp`; there is no server URL, gateway
key, external catalog, or per-service activation to configure.

An MCP client completes Lancee's device-code approval flow and presents a token
with `mcp:invoke`:

```http
POST /mcp
Authorization: Bearer lnc_codex_...
Content-Type: application/json
```

The token resolves the user and workspace. `tools/list` returns only the local
Lancee registry, and `tools/call` invokes the same services used by dashboard
and automation flows. The browser-facing `/api/mcp/*` routes are UI adapters
over that registry; they do not make server-to-server MCP calls.

### Credential boundary

- Lancee stores device-token hashes, never the returned plaintext token.
- Tool arguments cannot choose a workspace or supply provider credentials.
- Provider credentials remain in the Lancee vault and are used only by the
  application-owned integration adapter.
- The frontend receives tool names, descriptions, schemas, risk annotations,
  and normalized results only.
- Browser and document artifacts remain behind authenticated Lancee routes.

The protocol, tools, and security boundaries are documented in
[`LANCEE_MCP.md`](LANCEE_MCP.md).

Durable storage and mutation replay behavior are documented in
[`DURABLE_FOUNDATION.md`](DURABLE_FOUNDATION.md).

## Deployment

- Public URL: `https://lancee.hookitupservices.com`
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
