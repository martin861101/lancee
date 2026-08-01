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
- **Clients** — a sidebar-accessible client directory with search, contact
  details, status controls, project counts, confirmed deletion, and a focused
  client workspace.
- **Projects** — a searchable, filterable table of every client project with
  status badges, due and created dates, ownership, pagination, quick actions,
  Drive relationships, deliverables, and authenticated project attachments.
  Selecting a project opens its full Kanban workspace with stage controls,
  persistent drag-and-drop status movement, progress, deadline, owner, files,
  external links, and Drive resources.
- **Ideas** — an MIT-licensed Excalidraw workspace for freehand drawing,
  shapes, arrows, text, images, embeddable content, reusable libraries, export,
  and keyboard/touch editing. Named boards remain attached to the lancee
  workspace and each canvas is restored locally between sessions.
- **Files** — an expandable Google Drive folder tree with persistent links to
  clients and projects, plus a lancee document library. Upload PDF, DOC/DOCX,
  Markdown, text, and image files to lancee, Drive, or both; edit supported
  documents in-app, sync local files to Drive later, and remove local workspace
  copies with a visible, confirmation-protected action. The page uses its own
  vertical scroll region so long file lists remain usable on desktop and mobile.
- **Automations** — plain-language routines for repetitive work, schedules,
  connected tools, activity history, and confirmed deletion.
- **Connections** — independent backend-managed Google Drive OAuth with
  non-sensitive per-file access through Google Picker, encrypted workspace
  Paystack credentials, signed n8n webhooks, and a separate MCP gateway limited
  to browser automation and utility tools. Requests for additional business
  systems are persisted without pretending an unsupported provider is
  connected.
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

## Visual system

The public landing page and authenticated dashboard share a dark navy visual
system with a subtle monochrome grain texture, translucent glass surfaces, cool
blue actions, and offset shadows. The landing narrative alternates that dark
atmosphere with calm off-white feature bands. The grain follows the low-opacity
soft-light overlay used by the Gold Dune page background without introducing
gold or brown color into the navy palette. In the dashboard, it begins after
the navigation sidebar so navigation stays clear while page content retains
depth and contrast.

The landing page uses native document scrolling so its hero and calls to action
remain reliable across desktop and mobile browsers. Its desktop navigation
stays visible as a translucent glass bar while scrolling. Hero lines and
section headings use one-time GSAP reveals; the product summary, workspace
marquee, progress display, and footer credit use lightweight ambient CSS
motion. The connection showcase includes locally rendered brand marks for
popular email, calendar, storage, communication, meeting, and payment tools.
All motion is disabled when the visitor requests reduced motion. See
[`docs/LANDING_MOTION.md`](docs/LANDING_MOTION.md) for configuration and
maintenance notes.

## Authentication

The current production build uses first-party server sessions rather than
Firebase:

- The initial administrator is configured with `ADMIN_EMAIL`.
- Passwords are verified with Node.js `scrypt`; only the salt and hash are kept.
- The browser receives a signed `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
- Session bootstrap, login, and logout use `/api/auth/*`.
- Public authentication has dedicated `/signin` and `/signup` routes. Signup
  collects the account details first, sends a 24-hour email confirmation link,
  and only creates the workspace after the link is used at
  `/signup/confirm?token=…` to choose a password.
- Login is rate-limited to five failed attempts per 15-minute window.
- Mutating requests validate the request origin.
- Production registration is controlled by `ALLOW_REGISTRATION` and is enabled
  by default. Set `ALLOW_REGISTRATION=false` to disable signup; the base Docker
  Compose service explicitly enables it.
- Email confirmation requires the existing SMTP notification settings to be
  enabled and configured (`SMTP_ENABLED=true`, `SMTP_HOST`, `SMTP_PORT`, and
  `SMTP_FROM_EMAIL`).
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
Turns use a managed `lancee-workspace` permission profile limited to the fixed
`CODEX_WORKSPACE_ROOT`, minimal runtime reads, no tool network access, and no
automatic privilege escalation.

Configure local installations with:

```dotenv
CODEX_BINARY=codex
CODEX_WORKSPACE_ROOT=/absolute/path/to/project
```

The Docker image installs the pinned Codex CLI, the OS CA trust store, and the
Linux `bubblewrap` sandbox; Compose mounts `CODEX_WORKSPACE_PATH` at
`/workspace`. See
[`docs/CODEX_APP_SERVER.md`](docs/CODEX_APP_SERVER.md) for connection steps,
architecture, endpoints, security boundaries, Docker setup, and verification.

## Setup Agent and workspace operations

The conversational Setup Agent described in the onboarding documents is planned
as one workspace-scoped agent with setup and steady-state operations modes. The
implementation design covers the backend state machine, connector OAuth and
consent boundaries, asynchronous imports, knowledge ingestion, frontend
conversation/progress UI, approval gates, worker deployment, and verification:

[`docs/ONBOARDING_AGENT_IMPLEMENTATION.md`](docs/ONBOARDING_AGENT_IMPLEMENTATION.md)

The current platform foundation is ready for this work, but Gmail, Stripe,
GitHub, Slack, durable onboarding jobs, and the knowledge-base index still need
to be implemented. Existing Drive, Paystack, n8n, MCP, AI, authentication, and
workspace data boundaries should be reused as described in the design.

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
`lancee.automation.run` event to n8n, and completes it only after a signed
`lancee.automation.result` callback. Provider tokens are rehydrated only in
memory for the outbound request and are never written to the delivery ledger.
See
[`docs/N8N.md`](docs/N8N.md).

For a private queue-mode Edge deployment, pin `N8N_IMAGE`, set
`N8N_REDIS_PASSWORD` and `N8N_ENCRYPTION_KEY` in `.env`, then start the optional
Redis/n8n main/n8n worker overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.edge.yml up -d --build
```

The overlay exposes n8n only to the app's private Compose network and keeps the
worker/Redis network internal. Its n8n execution history is disabled by
default; workflows must still avoid logging the `auth` object.

## Core automations, Redis, and Phase 3 workflow

Built-in automations run through the platform's Core execution layer. A Core
run is persisted in `automation_runs`, queued in Redis at
`REDIS_QUEUE_PREFIX:core:automation:jobs`, executed by a permission-checked
tool runner, and written to `automation_run_events`. The Automations page reads
the execution log from `GET /api/automations/runs/:runId/logs`; it is not a
simulated completion indicator.

Core tools are bounded to workspace-scoped reads and explicit project actions:
`workspace.summary`, `projects.list`, `clients.list`, `invoices.list`,
`projects.update_status`, and `projects.create_draft_invoice`. Mutating tools
must be enabled on the saved automation before they can run. Edge automations
remain n8n-backed and are rejected until a valid n8n connection is active. If
Redis is temporarily unavailable, Core uses a visible in-process fallback so a
local development instance remains usable; `/api/health` reports the Redis
connection state.

Redis is installed as a system service for the current host and is also defined
in the base Compose file. The application uses `REDIS_URL` and
`REDIS_QUEUE_PREFIX`; the Edge overlay shares an authenticated Redis instance
with n8n. The production image includes `redis-tools`, which provides the
small server-side Redis bridge used by the Core worker.

Phase 3 also adds a project review workflow. Creating a project immediately
creates a job card and draft invoice. **Send to client** creates a signed,
expiring tokenized review URL (`/review/:reviewId?token=…`) and emails only the
link when SMTP is configured; artwork is fetched from PostgreSQL only after the
client presents the token. Image attachments in the Projects workspace open in
Annotorious for rectangle/polygon feedback, comments, priority, category, and
client submission. The designer can filter annotations and mark them open,
in-progress, resolved, or rejected. Approval still changes the draft invoice to
`ready_for_review`. See [`docs/ANNOTATION_REVIEW.md`](docs/ANNOTATION_REVIEW.md)
and [`docs/PHASE_3.md`](docs/PHASE_3.md) for the routes and operational details.

The **Services** page manages live, server-side MCP services. The floating
workspace assistant receives a server-built, workspace-scoped data snapshot;
provider credentials and unrestricted SQL never reach the browser. Read-only
AI data actions include `describe_table`, `list_tables`, `list_schemas`,
`query`, and `connect_db`. `execute` returns an approval-required response and
does not run.

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
The full Excalidraw document and its imported assets are stored in IndexedDB
under a workspace-and-board-specific persistence key, so a previously opened
canvas can be edited offline. Board names are still managed through the
authenticated lancee API. Canvas documents are currently browser-local rather
than shared across devices or collaborators.

Payments, API-key operations, MCP access, n8n configuration/delivery, and other
high-impact mutations remain online-only. See
[`docs/OFFLINE_PWA.md`](docs/OFFLINE_PWA.md) for the exact cache, queue,
security, and conflict boundaries.

See [`docs/IDEAS_CANVAS.md`](docs/IDEAS_CANVAS.md) for the editor feature set,
persistence boundary, licensing, and extension points.

## Dashboard update 31

The dashboard now separates everyday settings from technical Dev Tools, adds a
profile menu, a workflow-template directory, professional invoicing choices,
an n8n-focused automation experience, modern file action menus, and editable
team roles. Project workspaces have focused Board, Details, Files, and Links
sections plus assignable custom buckets. Bundled Excalidraw libraries load into
every idea canvas, and canvas PDFs can be downloaded and saved directly into
the workspace Files library.

Implementation details, persistence boundaries, and current provider behavior
are documented in
[`docs/DASHBOARD_UPDATE_31.md`](docs/DASHBOARD_UPDATE_31.md).

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

Client-first Work navigation, expandable Drive relationships, local document
storage, in-app editing, and upload/sync behavior are documented in
[`docs/CLIENT_FILE_WORKSPACES.md`](docs/CLIENT_FILE_WORKSPACES.md).

To use an exposed Hermes Agent, set `HERMES_API_URL` and the requested
`HERMESW_API_KEY` in the server environment. lancee uses Hermes’ OpenAI-compatible
chat endpoint and defaults to the `hermes-agent` model. See
[`docs/HERMES.md`](docs/HERMES.md).

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

Review sessions and annotations are persisted in PostgreSQL tables
`review_sessions` and `review_annotations`; the same schema also works with the
existing SQLite development fallback. See
[`docs/SCALABILITY_AND_POSTGRESQL.md`](docs/SCALABILITY_AND_POSTGRESQL.md) for
connection-pool, transaction, migration, and rollout details. SQLite remains a
durable single-process development fallback through `DATABASE_PATH`.

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
pnpm verify:client-files
# With DATABASE_URL or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE:
pnpm verify:postgres
node --check server/index.mjs
node --check server/database.mjs
node --check server/notifications.mjs
node --check server/paystack.mjs
node --check server/n8n.mjs
node --check public/sw.js
```

The application lint and production build complete without errors. Because the
full Ideas editor is lazy-loaded as an isolated route, Vite may report some of
its feature-complete chunks as larger than the default advisory threshold.

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
