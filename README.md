# lancee

lancee is a portable operating workspace for freelancers and small business
owners. It keeps client work, ideas, lightweight automations, connected tools,
invoices, and payments in one calm place. AI is optional and appears only where
it removes meaningful effort from an existing workflow.

The application is built with React, TypeScript, Vite, and a small Express
backend.

Live platform: [https://agents.hygridtech.co.za](https://agents.hygridtech.co.za)

## Start here

For a new installation, local full-stack setup, first sign-in, integrations,
SMTP, production deployment, and troubleshooting, follow
[`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md).

## Product areas

- **Public landing page** — freelancer-focused product narrative, workflow
  explanation, connection highlights, security posture, and sign-in calls to
  action.
- **Home** — projects, deadlines, outstanding invoices, useful automations,
  recent activity, and one quick-task entry point.
- **Work** — travel-aware client and project tracking, deadlines, progress,
  deliverables, and authenticated project attachments with upload, download,
  integrity checking, and deletion.
- **Ideas** — a visual canvas with durable, versioned quick notes that remain
  readable and editable offline, plus briefs, references, palettes, tasks, and
  optional AI-assisted grouping.
- **Automations** — plain-language routines for repetitive work, schedules,
  connected tools, and activity history.
- **Connections** — independent backend-managed Google Drive OAuth with
  non-sensitive per-file access, encrypted workspace Paystack credentials,
  signed n8n webhooks, and a separate MCP gateway limited to browser automation
  and utility tools. Requests for additional business systems are persisted
  without pretending an unsupported provider is connected.
- **Codex Workspace** — an embedded Codex App Server connection with native
  OpenAI device login, isolated per-user auth state, sandboxed repository work,
  and streamed task output.
- **lancee AI for Codex** — a separate repo-local Codex plugin with a bundled
  MCP bridge and scoped access to the workspace AI provider.
- **Money** — durable ZAR invoices, real Paystack hosted payment links, and
  verified, duplicate-safe webhook reconciliation.
- **Settings** — workspace, authentication, and notification configuration
  surfaces.

See [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md) for the target user, product
principles, information architecture, role of AI, and delivery roadmap.

## Authentication

The current production build uses first-party server sessions rather than
Firebase:

- The initial administrator is configured with `ADMIN_EMAIL`.
- Passwords are verified with Node.js `scrypt`; only the salt and hash are kept.
- The browser receives a signed `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
- Session bootstrap, login, and logout use `/api/auth/*`.
- Login is rate-limited to five failed attempts per 15-minute window.
- Mutating requests validate the request origin.
- Production registration is controlled by `ALLOW_REGISTRATION`.
- Owners can issue seven-day invitation links. Tokens are stored as hashes,
  can be delivered through SMTP, and create membership only after acceptance.

This is the best fit for the current platform because n8n, SMTP, MCP bearer
grants, and provider secrets already require a trusted application backend.
Firebase can later be added as an identity provider; its ID token should be
verified on this backend and exchanged for the same workspace session model.

See [`docs/AUTH_AND_NOTIFICATIONS.md`](docs/AUTH_AND_NOTIFICATIONS.md) for the security
model and SMTP setup. The administrator password is never stored in source or
documentation.

Administrator access starts at
[https://agents.hygridtech.co.za](https://agents.hygridtech.co.za) using the
configured `ADMIN_EMAIL` and its corresponding password.

## Built-in MCP capability

MCP is a platform feature, not a business-system connection users install.
Every workspace can browse the permitted agent-tool catalog immediately. The
default `MCP_ALLOWED_CATEGORIES=Browser,Utilities` boundary keeps normal
provider connections in the application backend.

The browser never receives `MCP_API_TOKEN`. The backend boundary is configured
to connect to:

```text
https://mcp.hygridtech.co.za
```

Bearer access uses a persisted, workspace-scoped state machine:

```text
available → pending or approved → activated services
```

If `MCP_API_TOKEN` is configured server-side, a request is approved
automatically. Without it, the request remains pending for a future admin grant
workflow. Bearer status and per-service activation survive process restarts in
PostgreSQL (or the local SQLite development fallback). Catalog discovery and
tool invocation are live server-to-server calls; bearer tokens never enter the
browser.

See [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) and
[`mcp-conf/MCP.md`](mcp-conf/MCP.md).

## Embedded Codex Workspace

Open **Connections → Codex Workspace** to run Codex inside lancee. The backend
launches `codex app-server` over private JSONL stdio, starts the native OpenAI
device-code flow, and streams thread events to the authenticated browser over
SSE.

Each lancee workspace/user pair receives an isolated server-side `CODEX_HOME`.
Turns are limited to the fixed `CODEX_WORKSPACE_ROOT`, use workspace-write with
restricted read roots, disable tool network access, and never auto-approve
privilege escalation.

Configure local installations with:

```dotenv
CODEX_BINARY=codex
CODEX_WORKSPACE_ROOT=/absolute/path/to/project
```

The Docker image installs the pinned Codex CLI, and Compose mounts
`CODEX_WORKSPACE_PATH` at `/workspace`. See
[`docs/CODEX_APP_SERVER.md`](docs/CODEX_APP_SERVER.md) for connection steps,
architecture, endpoints, security boundaries, Docker setup, and verification.

## lancee AI for Codex

The repo-local [`plugins/lancee-ai`](plugins/lancee-ai) plugin lets Codex use
the AI provider configured for an approved lancee workspace. Its bundled MCP
server exposes `connect`, `ai_status`, and `complete`.

The **Connections** page includes a **lancee AI for Codex** card. Open it to
enter the eight-character code shown by the plugin, review and approve the
`ai:invoke` scope, check active device status, or disconnect every authorized
Codex device.

Authentication uses a ten-minute device code shown by Codex and an explicit
lancee approval screen. Successful exchange issues a one-time, thirty-day
`ai:invoke` token. Device codes and tokens are hashed in the database, the
provider key remains server-only, and the plugin stores its token only in the
Codex plugin data directory.

This source plugin does not modify a developer's personal Codex marketplace or
global configuration. Package the complete plugin directory into the intended
local or team marketplace. Set `LANCEE_BASE_URL` in the plugin MCP environment
only when connecting to an origin other than the production default.

See [`docs/CODEX_AI_CONNECTOR.md`](docs/CODEX_AI_CONNECTOR.md) for endpoint,
security, packaging, configuration, and verification details.

## n8n integration

n8n is a user-configured, durable integration. The UI accepts a webhook on the
allowlisted n8n origin and sends real signed `GET` and `POST` deliveries.
Inbound callbacks verify the same canonical method/path/body signature,
five-minute timestamp, and one-use nonce.

Default DNS:

```text
https://n8n.hygridtech.co.za
```

The shared secret is AES-256-GCM encrypted at rest. Attempts persist success,
failure, response status, duration, correlation ID, and retry lineage.
Dispatching a saved automation creates a durable run, sends a signed
`lancee.automation.run` event to n8n, and records completion or failure. See
[`docs/N8N.md`](docs/N8N.md).

## Paystack payments

Paystack is the first depth-first payment provider. A workspace owner can click
**Connect** and save its `sk_test_…` or `sk_live_…` key through the Connections
page. The key is AES-256-GCM encrypted and never returned to the browser.
`PAYSTACK_SECRET_KEY` remains an optional server-environment fallback. Each
workspace receives a scoped webhook URL; raw-body HMAC-SHA512 verification
checks reference, amount, currency, and workspace before marking an invoice
paid.

Unsupported payment providers are no longer shown as connectable previews.
Configuration, live boundaries, webhook setup, and deterministic verification are in
[`docs/PAYSTACK.md`](docs/PAYSTACK.md).

## PWA and offline Ideas

The production build is installable as a PWA. Its service worker caches the
application shell and static assets, but explicitly bypasses all API requests.
The last workspace identity and Idea quick-note snapshots are stored in
IndexedDB so an installed app can reopen a previously viewed board offline.

Quick-note creates and edits are recorded locally before network I/O and retain
stable idempotency keys. Reconnect flushes the queue. A stale version is never
overwritten automatically: the Ideas canvas shows the server version and asks
the user to choose **Use server** or **Keep mine**.

Payments, API-key operations, MCP access, n8n configuration/delivery, and other
high-impact mutations remain online-only. See
[`docs/OFFLINE_PWA.md`](docs/OFFLINE_PWA.md) for the exact cache, queue,
security, and conflict boundaries.

## Backend status

The browser client in [`src/lib/api.ts`](src/lib/api.ts) uses real Express APIs;
the former `mockApi` module and hard-coded MCP/service data have been removed.
Durable server flows cover authentication, registration and invitations,
projects and project links, visual idea boards and offline notes, automations
and run status, analytics, team membership, cloud links, Google Drive, API
keys, Paystack, n8n, MCP, SMTP, and AI.

Unsupported providers are handled through persisted connection requests rather
than fake connection toggles. Optional demo seeding is off unless
`SEED_DEMO_DATA=true`.

The improvement-plan review and sequencing rationale are documented in
[`docs/IMPROVEMENT_PLAN_REVIEW.md`](docs/IMPROVEMENT_PLAN_REVIEW.md).
The database schema, mutation contract, API-key scopes, and persistence checks
are documented in
[`docs/DURABLE_FOUNDATION.md`](docs/DURABLE_FOUNDATION.md).

## Environment

Copy the template and keep the real file server-only:

```bash
cp .env.example .env
chmod 600 .env
pnpm auth:hash
```

Add the generated password salt and hash to `.env`. Configure SMTP only when the
provider credentials are ready:

```dotenv
SMTP_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_NAME=lancee
SMTP_FROM_EMAIL=notifications@example.com
SMTP_REPLY_TO=
SMTP_TEST_TO=
```

`.env`, `.env.*`, and `.runtime/` are ignored. `.env.example` is intentionally
tracked.

Production should use PostgreSQL. Docker Compose requires a non-empty
`POSTGRES_PASSWORD` and keeps the database on the private Compose network:

```bash
POSTGRES_PASSWORD='replace-with-a-long-secret' docker compose up -d --build
```

To reset the Docker deployment to a completely fresh PostgreSQL database,
optionally create a dump first, then remove the Compose volume and restart:

```bash
mkdir -p .runtime/backups
docker compose exec -T db sh -lc \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > .runtime/backups/pre-reset.dump
docker compose down --volumes --remove-orphans
docker compose up -d --build
```

`docker compose down --volumes` permanently removes this Compose project's
PostgreSQL data. It does not remove source files or the optional local SQLite
fallback under `.runtime/`. Restore a custom-format backup with `pg_restore`
only after stopping the app so it cannot write during recovery.

See [`docs/SCALABILITY_AND_POSTGRESQL.md`](docs/SCALABILITY_AND_POSTGRESQL.md)
for connection-pool, transaction, migration, and rollout details. SQLite
remains a durable single-process development fallback through `DATABASE_PATH`.

## Development and verification

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Vite uses port `5177` and accepts `agents.hygridtech.co.za`. This is a
frontend-only workflow; use the
[complete local workflow](docs/GETTING_STARTED.md#3-run-the-complete-platform-locally)
when testing authentication or backend actions.

```bash
pnpm build
pnpm lint
pnpm verify:durability
pnpm verify:paystack
pnpm verify:n8n
pnpm verify:offline
pnpm verify:ai
pnpm verify:codex-connector
pnpm verify:google-drive
pnpm verify:workspace-flows
# With DATABASE_URL or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE:
pnpm verify:postgres
node --check server/index.mjs
node --check server/database.mjs
node --check server/notifications.mjs
node --check server/paystack.mjs
node --check server/n8n.mjs
node --check public/sw.js
```

The application lint and production build complete without errors or warnings.

## Production

```bash
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 describe nexus-agents-platform
```

The `nexus-agents-platform` PM2 process serves the compiled app and API on
`0.0.0.0:5177`. Nginx Proxy Manager terminates TLS for
`agents.hygridtech.co.za` and forwards to that listener.

More implementation notes are in [`docs/PLATFORM.md`](docs/PLATFORM.md).
