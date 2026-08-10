# Getting started with lancee

This guide takes a new lancee installation from a clean checkout to a verified
local or production deployment. It also covers the first workspace sign-in,
SMTP notifications, the n8n webhook bridge, the built-in Lancee MCP, PWA
installation, and the bounded offline Idea-note workflow.

Production platform: [https://lancee.hookitupservices.com](https://lancee.hookitupservices.com)

## Choose a path

- **Platform user:** open the production platform, select **Sign in**, then
  continue at [First workspace setup](#first-workspace-setup).
- **Developer or server operator:** complete the installation and environment
  steps below before signing in.
- **UI contributor:** use the Vite-only workflow in
  [Frontend-only development](#frontend-only-development). Authentication and
  server endpoints are unavailable in that mode.

## What is live today

The public landing page and authenticated product use the Express backend.
Users, invitations, projects, visual boards, automations, analytics,
connections, API keys, Paystack, n8n, Google Drive, MCP, SMTP, and optional AI
all use real server flows. Unsupported providers are saved as connection
requests rather than being toggled into a simulated connected state. The
production shell and Idea quick-note cache/queue support bounded offline use.

## Prerequisites

| Requirement | Verified baseline | Purpose |
| --- | --- | --- |
| Node.js | 22.x | Frontend build and backend runtime |
| pnpm | 11.x | Reproducible dependency installation |
| Git | Any maintained version | Source management and deployments |
| PM2 | Current server installation | Recommended production process manager |
| HTTPS reverse proxy | Nginx Proxy Manager or equivalent | TLS and public hostname |

Check the local toolchain:

```bash
node --version
pnpm --version
```

If `pnpm` is unavailable and Corepack is installed:

```bash
corepack enable
corepack prepare pnpm@11 --activate
```

## 1. Install the application

```bash
cd /home/apps/agent-app
pnpm install --frozen-lockfile
```

`pnpm-lock.yaml` is the source of truth. Use `--frozen-lockfile` on servers and
in CI so a deployment cannot silently change dependency versions.

## 2. Create the server environment

Create `.env` only if one does not already exist:

```bash
test -f .env || cp .env.example .env
chmod 600 .env
```

Open `.env` in your preferred editor. At minimum, set:

```dotenv
APP_ENV=production
PORT=5177
PUBLIC_ORIGIN=https://lancee.hookitupservices.com

ADMIN_NAME=Workspace Admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD_SALT=
ADMIN_PASSWORD_HASH=
SESSION_TTL_HOURS=12
WORKSPACE_ID=wsp_primary
WORKSPACE_NAME=Hookitup Solutions
DATABASE_PATH=.runtime/lancee.sqlite
```

Use the exact public scheme and hostname for `PUBLIC_ORIGIN`; do not add a
trailing slash.

Generate the administrator password material in an interactive terminal:

```bash
pnpm auth:hash
```

The password is hidden while you type and must contain at least 12 characters.
Copy the generated `ADMIN_PASSWORD_SALT` and `ADMIN_PASSWORD_HASH` values into
`.env`. The plaintext password must never be added to `.env`, source code,
documentation, shell history, or a support message.

The server creates `.runtime/session-secret` with restrictive permissions.
Preserve it across restarts because it validates sessions and reconstructs
idempotent API-key creation responses. Local development also creates
`.runtime/lancee.sqlite`; production should configure PostgreSQL. Both `.env`
and `.runtime/` are ignored by Git.

## 3. Run the complete platform locally

Build the frontend:

```bash
pnpm build
```

Start the Express backend and compiled frontend with local-safe session
settings:

```bash
APP_ENV=development PUBLIC_ORIGIN=http://localhost:5177 pnpm start
```

Open [http://localhost:5177](http://localhost:5177). The public landing page
should load before authentication.

If you browse through a different local hostname or IP address, replace
`PUBLIC_ORIGIN` with that browser origin exactly, including its scheme and port.

### Frontend-only development

For fast landing-page or component work:

```bash
pnpm dev
```

Vite listens on `0.0.0.0:5177`. This command does **not** start Express, so
login, SMTP, and MCP access endpoints will not work. Use the complete local
workflow above whenever backend behavior matters.

## 4. Verify the local installation

In a second terminal:

```bash
curl -fsS http://127.0.0.1:5177/api/health
```

Expected response:

```json
{"ok":true,"service":"lancee-agents-platform"}
```

Confirm that unauthenticated workspace access is blocked:

```bash
curl -i http://127.0.0.1:5177/api/auth/session
```

An HTTP `401` response with `No active session` is the expected secure result.
Then verify the browser flow:

1. Load the landing page.
2. Select **Sign in**.
3. Enter the configured administrator email and password.
4. Confirm that the **Home** workspace opens.
5. Sign out and confirm that protected workspace content is no longer
   available.

## First workspace setup

After signing in:

1. Review **Home** for projects, upcoming work, outstanding invoices, and
   recent activity.
2. Open **Work** and create a sample client project.
3. Open **Ideas** to capture references, colours, notes, and early directions
   on the project canvas.
4. Open **Automations** and describe one repetitive task in plain language.
5. Open **Connections** to connect Google Drive, inspect Paystack status,
   configure n8n, and request managed service access.
6. Open **Money** to review invoice status and create a draft invoice.
7. Open **Settings** to review the workspace profile, authentication, and
   travel preferences.

Project, canvas, automation, connection, membership, payment, and run data are
durable. Demo projects and automations are seeded only when
`SEED_DEMO_DATA=true`.

## Install and verify offline Ideas

PWA registration is enabled in the production build. After deploying:

1. Load lancee once over HTTPS and sign in.
2. Open **Ideas**, add a quick note, and wait for its `v1` synced label.
3. Install lancee from the browser's install/application control.
4. Disconnect the network and reopen the installed app.
5. Confirm the last viewed Idea notes load and add another note.
6. Reconnect. The queued label should become a server version automatically.

Only the shell, last display identity, and Idea quick notes are available
offline. Payment links, credentials, grants, n8n actions, and other
consequential mutations deliberately require the server.

To verify conflict handling, load the same synced note on two clients, edit it
on the first, then submit the stale edit on the second. The second client must
show the server value and require **Use server** or **Keep mine**.

See [`OFFLINE_PWA.md`](OFFLINE_PWA.md) for storage, security, queue, and
service-worker details.

## Configure Paystack

Start in test mode:

```dotenv
PAYSTACK_SECRET_KEY=sk_test_replace_me
PAYSTACK_BASE_URL=https://api.paystack.co
PAYSTACK_CALLBACK_URL=https://lancee.hookitupservices.com/?payment=paystack
```

Configure this webhook in Paystack:

```text
https://lancee.hookitupservices.com/api/webhooks/paystack
```

Restart lancee, open **Money**, and confirm Paystack reports **test mode**.
Creating a payment link initializes a hosted checkout but does not send it or
charge the client. Use `sk_live_...` only after test initialization and webhook
reconciliation pass. See [`PAYSTACK.md`](PAYSTACK.md).

## Configure SMTP notifications

SMTP is optional and disabled by default. Add the provider values to `.env`:

```dotenv
SMTP_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM_NAME=lancee
SMTP_FROM_EMAIL=notifications@example.com
SMTP_REPLY_TO=support@example.com
SMTP_TEST_TO=operator@example.com
```

Use these common transport combinations:

| Provider mode | `SMTP_PORT` | `SMTP_SECURE` |
| --- | ---: | --- |
| STARTTLS | `587` | `false` |
| Implicit TLS | `465` | `true` |

`SMTP_USER` and `SMTP_PASSWORD` may both remain empty only when the SMTP relay
explicitly allows unauthenticated delivery from this server. `SMTP_TEST_TO`
falls back to `ADMIN_EMAIL` when empty.

Restart the application after changing `.env`, sign in, and use the
notification test action in the platform. Never put SMTP credentials in
frontend variables or commit them to Git.

## Configure the n8n integration

The intended production n8n DNS is:

```text
https://n8n.hygridtech.co.za
```

In n8n, create and activate a workflow with a production Webhook node. Then in
lancee:

1. Open **Connections**.
2. Select **Configure** on the **n8n** card.
3. Enter the production webhook URL, for example
   `https://n8n.hygridtech.co.za/webhook/lancee`.
4. Enter a strong shared signing secret.
5. Use the GET and POST controls to review both outbound and inbound flows.
6. Copy the generated lancee callback into an n8n HTTP Request node.
7. Select **Connect n8n**.

The contract supports both directions:

| Direction | Methods | Purpose |
| --- | --- | --- |
| lancee → n8n | GET, POST | Send signed events or manual triggers to a workflow |
| n8n → lancee | GET, POST | Submit a signed, durably recorded workspace event |

Requests use `X-Lancee-Signature`, `X-Lancee-Timestamp`, and a one-use
`X-Lancee-Nonce`. Server defaults are:

```dotenv
N8N_BASE_URL=https://n8n.hygridtech.co.za
N8N_SIGNING_SECRET=
N8N_TIMEOUT_MS=10000
```

Configuration is workspace-scoped and the secret is AES-256-GCM encrypted.
Outbound tests send real timeout-bounded requests. Inbound callbacks validate
the exact method/path/body signature, enforce a five-minute timestamp window,
and consume each nonce once. Attempts and retries are durable. Verified inbound
events are recorded but are not yet dispatched into a persisted automation
engine. See [`N8N.md`](N8N.md).

## Use the built-in Lancee MCP

MCP is included with every lancee workspace. A user does not configure a server
URL, bearer token, or individual service API keys in the browser.

The application serves the only MCP endpoint on its normal origin:

```text
https://lancee.hookitupservices.com/mcp
```

No MCP gateway, remote-server, or bearer-secret environment variables are
required. To connect an agent client:

1. Request a Lancee device code with the `mcp:invoke` scope.
2. Sign in to Lancee and approve the displayed code and scope.
3. Exchange the device code for the one-time displayed token.
4. Connect to `POST /mcp` with `Authorization: Bearer lnc_codex_...`.

The endpoint advertises 40 local tools. The floating dashboard assistant uses
the same registry through persisted agent runs, including budgets, result
chaining, cancellation, and expiring one-use approvals.

For the dashboard path:

1. Sign in and open **Connections**.
2. Open **Lancee MCP**.
3. Review the always-active local tool catalog.
4. Use **Test tool** to review an invocation result.

There is no external MCP gateway, Basebox MCP connection, or service activation
state. Provider keys belong in Lancee's application vault and are never MCP
tool arguments. See [`LANCEE_MCP.md`](LANCEE_MCP.md) for the protocol,
[`LANCEE_AGENT_RUNTIME.md`](LANCEE_AGENT_RUNTIME.md) for the dashboard agent,
and [`DURABLE_FOUNDATION.md`](DURABLE_FOUNDATION.md) for persistence.

## Production deployment

Before starting, confirm:

- `PUBLIC_ORIGIN=https://lancee.hookitupservices.com`
- `APP_ENV=production`
- the administrator salt and hash are populated
- `.env` permissions are `600`
- DNS points to the reverse proxy
- the proxy has a valid TLS certificate
- TCP port `5177` is not publicly exposed unless intentionally firewalled

Build and reload the authoritative Compose application:

```bash
docker compose up -d --build app
docker compose ps
curl --fail http://127.0.0.1:5177/api/health
```

This image includes the pinned Playwright/Chromium runtime. Express remains the
single Lancee application and MCP endpoint; browser-read work runs as the
unprivileged `pwuser` child in the same container. A deliberate non-Docker PM2
deployment must install a matching Chromium runtime and configure
`LANCEE_BROWSER_EXECUTABLE`; otherwise browser capabilities will report
unavailable. `nexus-agents-platform` remains the legacy PM2 process name.

Configure the reverse proxy with:

| Setting | Value |
| --- | --- |
| Public hostname | `lancee.hookitupservices.com` |
| Forward scheme | `http` |
| Forward host | The lancee application server, currently `192.168.1.66` |
| Forward port | `5177` |
| TLS | Enabled |
| Force HTTPS | Enabled |
| WebSocket support | Enabled |

The browser must reach lancee through HTTPS in production because the session
cookie is marked `Secure`.

### Production verification

```bash
curl -fsS https://lancee.hookitupservices.com/api/health
curl -I https://lancee.hookitupservices.com
docker compose logs --tail=50 app
```

Also verify in a private browser window:

1. HTTPS loads without a certificate warning.
2. The landing page is visible before sign-in.
3. Invalid credentials fail without identifying which field was wrong.
4. Valid credentials open the workspace.
5. Refreshing the page preserves the session.
6. Sign-out clears the session.
7. An approved `browser_screenshot` of a public HTTPS page creates a PNG
   artifact; private/loopback URLs remain blocked.
8. A dashboard agent run can pause for approval, resume, and still be inspected
   from `GET /api/agent/runs/:runId`.

## Updating an existing deployment

After reviewing and merging the desired source changes:

```bash
cd /home/apps/agent-app
docker compose up -d --build app
curl -fsS https://lancee.hookitupservices.com/api/health
```

Do not overwrite an existing `.env` during an update.

## Backend verification

Run these checks before a production handoff:

```bash
pnpm build
pnpm lint
pnpm verify:durability
pnpm verify:paystack
pnpm verify:n8n
pnpm verify:offline
pnpm verify:mcp
pnpm verify:capabilities
pnpm verify:documents
pnpm verify:runtime-persistence
pnpm verify:agent-runtime
pnpm verify:workers-artifacts
pnpm verify:codex-connector
node --check server/database.mjs
node --check server/index.mjs
node --check server/agent-runtime.mjs
node --check server/execution-worker.mjs
node --check server/browser-worker.mjs
node --check server/notifications.mjs
node --check server/paystack.mjs
node --check server/n8n.mjs
node --check public/sw.js
```

Implemented backend routes:

| Method | Route | Authentication |
| --- | --- | --- |
| GET | `/api/health` | Public |
| GET | `/api/auth/session` | Session response |
| POST | `/api/auth/login` | Public, origin checked, rate limited |
| POST | `/api/auth/logout` | Session mutation, origin checked |
| GET | `/api/ideas/notes?boardId=...` | Required |
| POST | `/api/ideas/notes` | Required |
| PATCH | `/api/ideas/notes/:noteId` | Required |
| GET | `/api/mcp/access` | Required |
| GET | `/api/mcp/services` | Required |
| POST | `/api/mcp/invoke` | Required, explicit dashboard approval |
| POST | `/mcp` | Device token with `mcp:invoke` |
| GET | `/api/money/paystack/status` | Required |
| GET | `/api/money/invoices` | Required |
| POST | `/api/money/paystack/payment-links` | Required |
| POST | `/api/webhooks/paystack` | Paystack signature |
| GET | `/api/n8n/config` | Required |
| POST | `/api/n8n/config` | Required |
| POST | `/api/n8n/disconnect` | Required |
| GET | `/api/n8n/deliveries` | Required |
| POST | `/api/n8n/deliveries` | Required |
| POST | `/api/n8n/deliveries/:deliveryId/retry` | Required |
| POST | `/api/n8n/inbound-self-test` | Required |
| GET/POST | `/api/hooks/n8n/:workspaceId` | Timestamped signature + nonce |
| GET | `/api/api-keys` | Required |
| POST | `/api/api-keys` | Required |
| DELETE | `/api/api-keys/:keyId` | Required |
| GET | `/api/v1/workspace` | `workspace:read` API key |
| GET | `/api/v1/mcp/access` | `mcp:read` API key |
| GET | `/api/notifications/status` | Required |
| POST | `/api/notifications/test` | Required |

## Security defaults

- Authentication uses a first-party signed session, not Firebase.
- User identity and owner/collaborator membership resolve from PostgreSQL in
  production or SQLite in local development.
- Password verification uses Node.js `scrypt`; no plaintext password is stored.
- Production cookies are `HttpOnly`, `Secure`, and `SameSite=Lax`.
- Sessions expire after `SESSION_TTL_HOURS`.
- Five failed login attempts from one address trigger a 15-minute lockout.
- Mutating requests reject an `Origin` that differs from `PUBLIC_ORIGIN`.
- Durable workspace mutations require a scoped, replay-protected
  `Idempotency-Key`.
- API-key secrets are hashed at rest, scoped, shown only on creation, and soft
  revoked with audit timestamps.
- MCP and SMTP secrets remain in the server environment. An n8n secret entered
  through the authenticated setup flow is encrypted before persistence.
- Paystack secrets remain server-side; webhooks use raw-body HMAC-SHA512
  verification before reference, amount, and currency reconciliation.
- The service worker never caches API responses. IndexedDB contains only the
  last display identity, Idea-note snapshots, and queued Idea create/edit
  mutations, and explicit sign-out clears it.
- Idea edits use server versions and require an explicit decision after a
  conflict; high-impact mutations are never queued offline.
- The server sets content security, clickjacking, MIME-sniffing, referrer, and
  browser permissions headers.

Firebase can be introduced later for multi-user identity. Its ID tokens should
be verified by this backend and exchanged for a workspace session; provider and
automation secrets should remain server-side.

## Environment reference

| Variable | Required | Description |
| --- | --- | --- |
| `APP_ENV` | Yes | Use `production` behind HTTPS; `development` for local HTTP |
| `PORT` | Yes | Express listener; standard lancee value is `5177` |
| `PUBLIC_ORIGIN` | Yes | Exact browser origin allowed for state-changing requests |
| `ADMIN_NAME` | Recommended | Display name and initials for the initial administrator |
| `ADMIN_EMAIL` | Yes | Case-insensitive administrator sign-in email |
| `ADMIN_PASSWORD_SALT` | Yes | Output from `pnpm auth:hash` |
| `ADMIN_PASSWORD_HASH` | Yes | Output from `pnpm auth:hash` |
| `SESSION_TTL_HOURS` | Recommended | Signed-session lifetime; default is `12` |
| `WORKSPACE_ID` | Recommended | Stable id for the bootstrap workspace |
| `WORKSPACE_NAME` | Recommended | Initial display name for the bootstrap workspace |
| `DATABASE_URL` | Production | PostgreSQL connection string; takes precedence over SQLite |
| `DATABASE_PATH` | Local only | SQLite fallback; defaults to `.runtime/lancee.sqlite` |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Production alternative | Individual PostgreSQL connection values |
| `PGPOOL_MAX` | Recommended | Per-process PostgreSQL pool size; default `20` |
| `ALLOW_REGISTRATION` | Recommended | Enable public workspace registration; invitations remain available when false |
| `SEED_DEMO_DATA` | No | Seed sample projects/automations only when explicitly true |
| `SMTP_ENABLED` | No | Set to `true` only after SMTP is configured |
| `SMTP_HOST` | When SMTP is enabled | SMTP hostname |
| `SMTP_PORT` | When SMTP is enabled | Usually `587` or `465` |
| `SMTP_SECURE` | When SMTP is enabled | `true` for implicit TLS, otherwise `false` |
| `SMTP_USER` | Provider-dependent | SMTP account username |
| `SMTP_PASSWORD` | Provider-dependent | SMTP account password or app password |
| `SMTP_FROM_NAME` | Recommended | Sender display name |
| `SMTP_FROM_EMAIL` | When SMTP is enabled | Envelope sender address |
| `SMTP_REPLY_TO` | No | Optional reply address |
| `SMTP_TEST_TO` | No | Test recipient; defaults to `ADMIN_EMAIL` |
| `N8N_BASE_URL` | Recommended | DNS URL of the managed n8n instance |
| `N8N_SIGNING_SECRET` | Optional | Server-side bootstrap signing secret |
| `N8N_TIMEOUT_MS` | Recommended | Outbound timeout clamped to 250–30,000 ms |
| `PAYSTACK_SECRET_KEY` | For live Paystack flow | Server-only `sk_test_...` or `sk_live_...` key |
| `PAYSTACK_BASE_URL` | Recommended | Defaults to `https://api.paystack.co` |
| `PAYSTACK_CALLBACK_URL` | Recommended | Browser return URL after hosted checkout |
| `LANCEE_MCP_CODE_EXECUTION` | No | Enables owner-only bounded Python/JavaScript tools when exactly `true`; keep disabled unless required |
| `LANCEE_MCP_PYTHON_BIN` | With Python execution | Python executable; defaults to `python3` |
| `LANCEE_BROWSER_EXECUTABLE` | Non-Docker browser deployment | Optional explicit Chromium executable; the production image uses its pinned Playwright browser |
| `LANCEE_BROWSER_RUN_AS_USER` | Recommended in a root container | Unprivileged browser child user; the Docker image sets `pwuser` |

## Troubleshooting

| Symptom | Check | Resolution |
| --- | --- | --- |
| Port `5177` is already in use | `ss -ltnp \| rg ':5177'` | Stop the old process or use the intended PM2 instance |
| Landing page loads but login fails in development | Which start command is running | Use the complete Express workflow, not `pnpm dev` |
| Login always returns `401` | Email and generated hash | Match `ADMIN_EMAIL` exactly or run `pnpm auth:hash` again, update `.env`, and restart |
| Login returns `429` | Recent failed attempts | Wait 15 minutes before retrying |
| Login returns `403 Origin not allowed` | Browser address vs `PUBLIC_ORIGIN` | Make scheme, hostname, and port match exactly |
| Login succeeds but the cookie is not retained locally | `APP_ENV` | Use `APP_ENV=development` for local HTTP |
| SMTP test says it is not configured | SMTP status and `.env` | Enable SMTP and provide host, port, and from address; restart |
| SMTP provider rejects the message | PM2 logs and provider policy | Verify credentials, TLS mode, allowed sender, and relay permissions |
| MCP returns `401` | Device token and scope | Approve a current device code, exchange it once, and use a non-revoked token with `mcp:invoke` |
| Browser tool says unavailable | Runtime image/executable and child user | Use the production Docker image, or install the pinned browser and configure its executable; confirm `pwuser` exists in a root container |
| Agent run waits | Pending action and expiry | Approve or deny the displayed exact action; expired or already-consumed approvals cannot be replayed |
| Durable state is missing after restart | PostgreSQL connection values or local `DATABASE_PATH` | Confirm every process uses the same database and that the persistent volume/cluster is healthy |
| Mutation returns `400` | `Idempotency-Key` header | Supply a stable 8–128 character key and reuse it only for the same logical request |
| Mutation returns `409` | Reused idempotency key | Use the original payload or issue a new key for a new mutation |
| Paystack card says not configured | `PAYSTACK_SECRET_KEY` | Add a valid server-side test key and restart |
| Paystack webhook returns `401` | Raw body and `x-paystack-signature` | Confirm the dashboard uses the exact webhook URL and no proxy rewrites the body |
| Signed webhook does not mark paid | Reference, amount, currency, and provider status | Confirm all values exactly match the stored invoice |
| n8n URL is rejected | Scheme, origin, and DNS | Use HTTPS on the exact `N8N_BASE_URL` origin with public DNS |
| n8n outbound attempt fails | Durable attempt error and target workflow | Confirm the production Webhook node is active, then use Retry |
| n8n callback returns `401` | Timestamp, nonce, canonical path/body, and HMAC | Sign the exact transmitted bytes and keep clocks within five minutes |
| n8n callback returns `409` | Nonce reuse | Generate a new random nonce for every request |
| Installed app has no offline shell | First production load and service-worker state | Load once online over HTTPS, then confirm the worker is active before disconnecting |
| An Ideas canvas is missing on another device | Canvas persistence scope | Excalidraw documents currently persist in IndexedDB per browser; board names alone are server-backed |
| Idea note stays queued after reconnect | Network and authenticated session | Sign in again if the session expired; the stable queued mutation will then retry |
| Idea note says `Needs review` | Server version shown on the card | Choose **Use server** or deliberately resubmit with **Keep mine** |
| Public URL returns `502` | PM2 status and listener | Confirm the process is online and listening on `0.0.0.0:5177` |
| UI appears stale after deployment | `dist/` and proxy cache | Run `pnpm build`, reload PM2, then hard-refresh the browser |

## Project map

| Path | Responsibility |
| --- | --- |
| [`src/App.tsx`](../src/App.tsx) | Landing page, authenticated workspace, and interaction flows |
| [`src/index.css`](../src/index.css) | Complete responsive visual system |
| [`src/lib/api.ts`](../src/lib/api.ts) | Typed browser client for the Express API |
| [`src/lib/offlineStore.ts`](../src/lib/offlineStore.ts) | IndexedDB identity, Idea snapshots, and queued mutations |
| [`src/lib/ideasRepository.ts`](../src/lib/ideasRepository.ts) | Idea API, reconnect sync, idempotent replay, and conflict resolution |
| [`public/sw.js`](../public/sw.js) | Static-only application-shell cache and sync handoff |
| [`public/manifest.webmanifest`](../public/manifest.webmanifest) | Installable application identity |
| [`server/index.mjs`](../server/index.mjs) | Express, authentication, sessions, MCP, API keys, and routing |
| [`server/database.mjs`](../server/database.mjs) | PostgreSQL pool/transactions, SQLite fallback, and repositories |
| [`server/ai.mjs`](../server/ai.mjs) | OpenAI, Anthropic, and Gemini transports |
| [`server/lancee-mcp-protocol.mjs`](../server/lancee-mcp-protocol.mjs) | Local MCP JSON-RPC and invocation transport |
| [`server/capabilities/`](../server/capabilities) | Typed 40-tool base capability registry plus four feature-gated OpenConnector tools |
| [`server/integrations/`](../server/integrations) | OpenConnector adapter and workspace-scoped IntegrationGateway service |
| [`server/agent-runtime.mjs`](../server/agent-runtime.mjs) | Persisted planner/executor, budgets, result references, approvals, and cancellation |
| [`server/execution-worker.mjs`](../server/execution-worker.mjs) | Durable leased jobs, retries, events, cancellation, and recovery |
| [`server/browser-worker.mjs`](../server/browser-worker.mjs) | Isolated Playwright read/snapshot/screenshot worker |
| [`server/paystack.mjs`](../server/paystack.mjs) | Paystack authentication, initialization, timeout, and signature verification |
| [`server/n8n.mjs`](../server/n8n.mjs) | URL policy, encryption, canonical signatures, DNS checks, and outbound delivery |
| [`server/notifications.mjs`](../server/notifications.mjs) | SMTP transport and notification delivery |
| [`scripts/hash-password.mjs`](../scripts/hash-password.mjs) | Interactive scrypt credential generator |
| [`scripts/verify-durable-foundation.mjs`](../scripts/verify-durable-foundation.mjs) | Restart, hashing, scoping, idempotency, and revocation verification |
| [`scripts/verify-paystack-flow.mjs`](../scripts/verify-paystack-flow.mjs) | Mocked Paystack initialization and webhook reconciliation verification |
| [`scripts/verify-n8n-bridge.mjs`](../scripts/verify-n8n-bridge.mjs) | Signed GET/POST, replay, retry, encryption, and restart verification |
| [`scripts/verify-offline-sync.mjs`](../scripts/verify-offline-sync.mjs) | PWA boundary, durable notes, idempotency, conflicts, and restart verification |
| [`.env.example`](../.env.example) | Safe environment template |
| [`ecosystem.config.cjs`](../ecosystem.config.cjs) | PM2 process definition |
| [`AUTH_AND_NOTIFICATIONS.md`](AUTH_AND_NOTIFICATIONS.md) | Authentication and SMTP details |
| [`INTEGRATIONS.md`](INTEGRATIONS.md) | n8n and MCP integration contracts |
| [`OFFLINE_PWA.md`](OFFLINE_PWA.md) | PWA cache, IndexedDB queue, and conflict contract |
| [`PLATFORM.md`](PLATFORM.md) | Architecture and implementation notes |

## Production readiness checklist

- [ ] Dependencies install with `pnpm install --frozen-lockfile`.
- [ ] `pnpm build` succeeds.
- [ ] `pnpm verify:durability` succeeds.
- [ ] `pnpm verify:paystack` succeeds.
- [ ] `pnpm verify:n8n` succeeds.
- [ ] `pnpm verify:offline` succeeds.
- [ ] Server syntax checks succeed.
- [ ] `.env` exists, is excluded from Git, and has mode `600`.
- [ ] No plaintext administrator password is stored.
- [ ] `PUBLIC_ORIGIN` matches the HTTPS production origin.
- [ ] The health route responds through the public hostname.
- [ ] Administrator sign-in, refresh, and sign-out work.
- [ ] SMTP test delivery succeeds, or SMTP remains explicitly disabled.
- [ ] MCP access mode is intentionally manual or automatic.
- [ ] Paystack remains in test mode until initialization and webhook checks pass.
- [ ] `.runtime/lancee.sqlite` is on the intended persistent, backed-up volume.
- [ ] n8n outbound GET/POST and an externally signed inbound callback pass.
- [ ] The installed shell opens offline and queued Idea notes sync on reconnect.
- [ ] PM2 restarts the service and the reverse proxy remains healthy.
