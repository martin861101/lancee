# lancee

<p align="center">
  <a href="https://lancee.hookitupservices.com">
    <img src="docs/assets/lancee-readme-header.svg" alt="lancee — a calm operating workspace for client work" width="1200">
  </a>
</p>

<p align="center">
  <a href="https://lancee.hookitupservices.com"><img src="https://img.shields.io/website?url=https%3A%2F%2Flancee.hookitupservices.com&style=flat-square&label=live%20platform" alt="Live platform status"></a>
  <a href="https://github.com/martin861101/lancee"><img src="https://img.shields.io/github/stars/martin861101/lancee?style=flat-square&logo=github&label=stars" alt="GitHub stars"></a>
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=101828" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 6">
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite 8">
  <img src="https://img.shields.io/badge/Express-5-111827?style=flat-square&logo=express&logoColor=white" alt="Express 5">
</p>

<p align="center">
  <a href="LANCEE_WORKSPACE.md">Investor overview</a> ·
  <a href="docs/GETTING_STARTED.md">Get started</a> ·
  <a href="docs/PRODUCT_VISION.md">Product vision</a> ·
  <a href="docs/PLATFORM.md">Platform architecture</a> ·
  <a href="docs/AUTH_AND_NOTIFICATIONS.md">Security model</a>
</p>

> A calm, portable operating workspace for freelancers and small business
> owners — bringing client work, ideas, automations, connected tools, invoices,
> and payments into one focused place.

Built with React, TypeScript, Vite, and a small Express backend. AI is optional
and appears only where it removes meaningful effort from an existing workflow.

Lancee’s built-in MCP includes isolated Playwright research, screenshots, and
approved public-page PDF artifacts. Browser interaction, credentials, uploads,
downloads, and arbitrary page scripts remain unavailable to MCP clients.
In the workspace chat, PDF, report, presentation, and executive-brief requests
are planned as `pdf.create` actions and pause for confirmation. Approved files
appear as downloadable chat attachments and in **Files**. Assistant Markdown is
rendered as formatted content, and PDFs use a colored, print-ready report theme.
PDFs and images open inside Files through authenticated in-app previews, with a
download action retained as a fallback for every local file type.

## Why lancee

| Focus | Flow | Craft | Control |
| --- | --- | --- | --- |
| Clients, projects, deadlines, and invoices in one workspace | Native automations, mail, Drive, n8n, and MCP connections | Offline idea boards, document workspaces, and optional storefronts | Server-side sessions, approvals, encrypted secrets, and durable audit trails |

## Start here

For a new installation, local full-stack setup, first sign-in, integrations,
SMTP, production deployment, and troubleshooting, follow
[`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md).

The standalone [lancee platform reference](public/lancee.html) tracks the
current product surfaces, API route families, `.env.example` configuration, and
PM2/reverse-proxy deployment shape. It is served at `/lancee.html` from the
active public assets.

The documented automation inventory is available in
[`docs/AUTOMATIONS.md`](docs/AUTOMATIONS.md).

The repository audit quarantine is documented in [`junk/README.md`](junk/README.md).

## Product areas

- **Public landing page** — freelancer-focused product narrative, workflow
  explanation, connection highlights, security posture, and sign-in calls to
  action.
- **Workspace switching** — select the workspace name at the top of the sidebar
  to open the account's workspace list, switch the active session, or create a
  new owner workspace. Workspace-scoped dashboard data reloads after every
  switch.
- **Home** — a scenic, weather-responsive workspace built around the local
  time, city, current conditions, and a short contextual summary. It includes
  glass weather and quick-action controls plus a compact dock for Today,
  upcoming work, active projects, and the AI assistant. See
  [`docs/WORKSPACE_PULSE.md`](docs/WORKSPACE_PULSE.md).
- **Clients** — a sidebar-accessible client directory with search, contact
  details, status controls, project counts, confirmed deletion, and a focused
  client workspace. Client records can be edited, branded with a logo, and
  reviewed through linked project and matching mailbox history.
- **Projects** — a searchable, filterable table of every client project with
  status badges, due and created dates, ownership, pagination, quick actions,
  Drive relationships, deliverables, and authenticated project attachments.
  Selecting a project opens its full Kanban workspace with stage controls,
  persistent drag-and-drop status movement, progress, deadline, owner, files,
  external links, Drive resources, persistent task checkboxes, and per-task
  notes in any project bucket. Project actions are grouped in a compact dropdown
  inside the project view so the workspace stays focused on delivery. Project
  work and client feedback are separate:
  the board stays focused on delivery stages, while **Reviews** contains durable
  multi-bucket review packages, item-level approval states, linked client
  comments, image previews, deadlines, and a permanent audit history. See
  [`docs/PROJECT_REVIEW_PACKAGES.md`](docs/PROJECT_REVIEW_PACKAGES.md).
- **Ideas** — an MIT-licensed Excalidraw workspace for freehand drawing,
  shapes, arrows, text, images, embeddable content, reusable libraries, export,
  and keyboard/touch editing. Named boards remain attached to the lancee
  workspace and each canvas is restored locally between sessions.
- **Files** — a reference-style dark file explorer with consistent SVG
  controls, practical search and action menus, responsive mobile layouts, and
  a lancee document library. Google Drive can be connected through a
  folder-only Picker: one selected folder becomes the workspace Drive root,
  its contents load automatically, nested folders are navigable, folders can be
  created in the active Drive location, and supported cloud files can be viewed
  or edited in-app and saved back to Drive. New Drive uploads and local-document
  syncs target that selected folder. Local workspace storage is always available;
  Dropbox, Google Drive, and Microsoft OneDrive controls appear only after their
  integrations are enabled. Dropbox and OneDrive are intentionally URL-backed
  destinations rather than provider browsers. The page keeps its own scroll
  region so long file lists remain usable on desktop and mobile.
- **Messages** — a workspace mail app with automatic provider discovery,
  guided manual IMAP/SMTP setup, folders, search, message reading, compose and
  reply. New incoming mail can trigger native Core automations by sender,
  recipient, subject, or body keyword; these rules never use n8n.
- **Dairy** — a lazy-loaded Calendar and Meetings workspace. Tapping any date
  opens a focused entry form while the persistent form remains available in the
  Calendar layout. Calendar displays project deadlines, persists entries on the
  server, validates project/client links inside the authenticated workspace, and
  derives meeting duration from start/end timestamps. Meetings link back to
  Calendar, Projects, Clients, and Files and load Zoom's embedded Meeting SDK
  only when a user joins. Configure `ZOOM_MEETING_SDK_KEY` and
  `ZOOM_MEETING_SDK_SECRET` on the server; see
  [`docs/DAIRY.md`](docs/DAIRY.md) and
  [`docs/CONNECTED_INTELLIGENCE.md`](docs/CONNECTED_INTELLIGENCE.md).
- **Automations & Workflows** — plain-language routines, schedules, connected
  tools, confirmed deletion, and ready-to-use workflow recipes in one place.
- **Connected Apps** — the full live OpenConnector provider catalog, categorized
  and searchable with incremental rendering, official provider icons, provider
  homepages, advertised auth methods, and owner-started OAuth for providers
  whose OAuth clients have been configured in OpenConnector. API-key and custom
  credentials remain in OpenConnector and are shown as awaiting provider setup.
  The page also includes independent backend-managed Google Drive OAuth with
  non-sensitive per-file access through Google Picker, encrypted workspace
  Paystack credentials, signed n8n webhooks, and the application-owned Lancee
  MCP tool surface. Its connection diagram shows the private path from AI and
  external research, through Lancee MCP and workspace tools, to PostgreSQL as
  the durable memory. Drive selections that were deleted or are no longer shared
  are skipped and pruned so one stale file cannot block the Files page. The
  owner can also connect WhatsApp with a Baileys QR scan; platform notifications
  are restricted to that verified owner number. Saved sessions restore on backend startup,
  transient socket closures reconnect automatically, and the UI exposes the
  current connection state. Requests for additional business systems are
  persisted without pretending an unsupported provider is connected. See
  [`docs/WHATSAPP_BAILEYS.md`](docs/WHATSAPP_BAILEYS.md) and
  [`docs/GOOGLE_OAUTH.md`](docs/GOOGLE_OAUTH.md) for provider callback setup.
- **Codex Workspace** — an embedded Codex App Server connection with native
  OpenAI device login, isolated per-user auth state, sandboxed repository work,
  and streamed task output.
- **Agent device access** — explicit device-code approval for scoped access to
  the workspace AI provider and the local Lancee MCP endpoint.
- **Money** — four brand-colour invoice styles rendered to A4 PDF with
  Playwright, optional bank-transfer details without provider setup, real
  Paystack hosted payment links, and verified duplicate-safe reconciliation.
  See [`docs/INVOICE_PDFS.md`](docs/INVOICE_PDFS.md).
- **Notifications** — workspace-scoped activity with unread indicators, a
  readable notification popover, current mail and automation events,
  navigation to related work, mark-as-read controls, and a confirmed clear-all
  action.
- **Preferences** — merged account and workspace settings, profile image
  controls, developer tools, and explicit logout controls.

See [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md) for the target user, product
principles, information architecture, role of AI, and delivery roadmap.

## Connected Intelligence

Connected Intelligence treats Calendar and the existing provider-neutral Mail
connector as authoritative workspace sources. Persisted meetings emit sanitized
`meeting.created` and idempotent `meeting.completed` records through the
existing workspace-event ledger. Successful Inbox ingestion and accepted SMTP
sends emit idempotent `communication.received` / `communication.sent` metadata
events without duplicating bodies or credentials. Exact workspace-scoped email
identity lets Mail participants and Calendar attendees resolve to the same
Person, then conservatively to a Client and confirmed thread/project link.

The `project_meeting_load` detector compares an active project's coordination
minutes with the median and 75th percentile of completed projects in the same
workspace. It returns `insufficient_evidence` below three historical projects
and stores one evidence-backed, idempotent opportunity only when the
workspace-specific baseline is exceeded. No LLM performs arithmetic or creates
evidence. The cross-source `client_attention_load` detector combines transparent
Mail message/thread percentiles with completed Calendar meeting-minute
percentiles, requires at least three observed comparison clients, and reuses
the same evidence-backed opportunity store. Architecture, schema, APIs,
detector policies, privacy limits, and deferred semantic extension points are
documented in
[`docs/CONNECTED_INTELLIGENCE.md`](docs/CONNECTED_INTELLIGENCE.md).

The reusable historical benchmark keeps its source workbook and generated
machine fixture in
[`test-data/connected-intelligence`](test-data/connected-intelligence/README.md).
It creates its own marker-protected synthetic workspace, uses canonical
Calendar/Mail events without external transport, and compares real detector
output with separate positive and negative ground truth.

The authenticated **Intelligence** destination now leads with Connected
Intelligence. It shows exact workspace counts, persisted opportunities, detector
baselines and confidence, exact evidence-event references, and an authoritative
Client → Project connection map across meetings, messages, time, invoices, and
payments. Decision Intelligence remains available from the same page as a
secondary history capability. Hermes receives read-only Connected Intelligence
tools for questions about unusual projects, client attention, and missed
relationships.

```bash
npm run seed:ci -- --dry-run
npm run seed:ci
npm run benchmark:ci
npm run seed:ci -- --reset
```

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
stays visible as a translucent glass bar with a soft backdrop blur while
scrolling, keeping the content behind it visible without sacrificing legibility.
Hero lines and section headings use one-time GSAP reveals; the product summary,
workspace marquee, progress display, and footer credit use lightweight ambient CSS
motion. The connection showcase includes locally rendered brand marks for
popular email, calendar, storage, communication, meeting, and payment tools.
All motion is disabled when the visitor requests reduced motion. See
[`docs/LANDING_MOTION.md`](docs/LANDING_MOTION.md) for configuration and
maintenance notes.

The authenticated Home page keeps the welcome, weather card, quick actions,
and four-card workspace dock in every theme. Dark and light retain their
original dashboard palettes, including their Home treatment. The optional
light-blue theme keeps `public/img/sunny.png` on Home only. Every other
authenticated page uses a restrained textured gradient from `#174d83` to
`#0f3a6e`, slightly lighter than the sidebar. Cards and containers use rounded
translucent navy glass with diffuse shadows, while primary actions retain the
brighter blue accent. Its sidebar and top navigation keep the navy treatment
with restrained texture. The original dark and light themes are not overridden,
and the public landing page always uses the original Lancee navy presentation
instead of inheriting a saved dashboard theme. The backend resolves the
session's public IP to a city,
country, and timezone, then requests current conditions for those coordinates.
A deterministic pulse renders immediately; `GET
/api/workspace/pulse` may replace its copy with a cached, schema-validated AI
summary generated through the bounded chat-completion path. Provider failures,
missing weather, and malformed AI output remain invisible to the user. See
[`docs/WORKSPACE_PULSE.md`](docs/WORKSPACE_PULSE.md) and
[`docs/FILES_CONTEXT_AND_STORAGE.md`](docs/FILES_CONTEXT_AND_STORAGE.md).

## Authentication

The current production build uses first-party server sessions rather than
Firebase:

- The initial workspace owner is configured with `ADMIN_EMAIL`.
- Platform administration is restricted to `martin@hookitupservices.com`; that
  account alone receives the **Admin** sidebar option and access to the global
  administration API.
- Passwords are verified with Node.js `scrypt`; only the salt and hash are kept.
- The browser receives a signed `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
- Session bootstrap, login, and logout use `/api/auth/*`.
- Public authentication has dedicated `/signin` and `/signup` routes. When
  enabled, signup collects the account details first, sends a 24-hour email
  confirmation link, and only creates the workspace after the link is used at
  `/signup/confirm?token=…` to choose a password.
- Login is rate-limited to five failed attempts per 15-minute window.
- Mutating requests validate the request origin.
- Production registration defaults to `ALLOW_REGISTRATION` and can then be
  enabled or disabled persistently from **Admin → Overview → Public signups**.
  Disabling public signups does not block existing users or invited members.
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

Initial workspace-owner access starts at
[https://lancee.hookitupservices.com](https://lancee.hookitupservices.com) using the
configured `ADMIN_EMAIL` and its corresponding password.

The platform admin dashboard provides global user and workspace directories,
API request/error analytics, recent agent/worker/automation logs, runtime
metrics, an Agent Performance snapshot with timing and run-context metrics, and
database health. See
[`docs/ADMIN_DASHBOARD.md`](docs/ADMIN_DASHBOARD.md) for its authorization,
data, and signup-control behavior.

## Adaptive Workspace Builder

New workspace owners are guided through a resumable ten-step setup that asks
about the business in plain language, recommends the smallest useful set of
modules, and prepares the approved setup. The base recommendation comes from a
deterministic profile engine; optional AI customization is offered only for
requirements the predefined profiles do not cover, and every AI workflow needs
explicit approval.

Generation persists the selected module manifest, prepares disconnected
integrations, creates inactive automation drafts, applies workspace identity and
timezone, and can add a clearly labelled sample client and project. Existing
workspaces are not forced through setup and can open **Platform → Workspace
builder** at any time. See
[`docs/WORKSPACE_BUILDER.md`](docs/WORKSPACE_BUILDER.md) for the state model,
security boundaries, API, and verification workflow.

## Built-in MCP capability

MCP is a platform feature, not a business-system connection users install.
Lancee has one MCP server: the `/mcp` route in this application. It lists and
invokes the local Lancee tool registry directly. There is no remote MCP Grid,
Basebox server, external MCP discovery, or separate MCP deployment.

The workspace assistant now creates a durable agent thread and run. Its plan,
steps, events, usage, results, and approval state survive a restart. When an
autonomous capability requires approval, the browser shows a risk-labelled
approval card and the server binds that one-use decision to the exact tool and
argument hash. The built-in Lancee tools are always available to an
authenticated workspace and execute with that user's workspace context.

The current catalog exposes 50 public tools across workspace operations, visual
inspection, files, documents, artifacts, jobs, approvals, integrations,
scheduling, logs, and Decision Intelligence. Workspace and role policy is
enforced before every call. Destructive deletion and external API calls are
additionally restricted to workspace owners.

OpenConnector is enabled by default in the Docker Compose deployment and can be
disabled with `OPENCONNECTOR_ENABLED=false`. When enabled, four
discovery-oriented integration tools
are added without expanding every provider action into the MCP catalog. Lancee
keeps orchestration, workspace policy, approvals, and audit ownership while
OpenConnector handles provider OAuth credentials, refresh, schemas, and
execution. The Connections page loads the complete provider catalog (up to
2,000 entries), preserves upstream categories with an `Other` fallback, and
uses each provider's upstream official `iconUrl`, homepage, and public OAuth
authorization/token metadata. See
[`docs/integrations/openconnector.md`](docs/integrations/openconnector.md).

See [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) and
[`docs/mcp-services.md`](docs/mcp-services.md).

### Local MCP server

The same app now serves an MCP endpoint at `/mcp` on the normal application
port (`5177` by default). The implementation is split between
[`server/lancee-mcp-protocol.mjs`](server/lancee-mcp-protocol.mjs), which owns
MCP JSON-RPC, [`server/lancee-mcp.mjs`](server/lancee-mcp.mjs), which owns the
workspace-scoped public tool contracts and authorization mapping, and
[`server/capabilities/`](server/capabilities), which owns typed local capability
contracts and adapters.

The registry dynamically maps the current 50-tool catalog to typed local
capabilities.
Native MCP responses use the canonical envelope below; raw
`/api/mcp/invoke` responses remain backward-compatible for the workspace UI.

```json
{
  "success": true,
  "ok": true,
  "data": {
    "results": [{ "id": "doc_…", "type": "file", "name": "notes.md" }],
    "total": 1
  },
  "artifacts": [],
  "warnings": [],
  "error": null,
  "metadata": { "contractVersion": "1.0" }
}
```

List results are always available at `data.results`; single-resource results
are available at `data.resource`. This makes a `search_files` result directly
usable as the `file_id` input to `read_file` while preserving safe single-resource
aliases such as `data.file` where existing callers need them. Failed calls return `ok: false`
with a bounded `{code, message, retryable}` error object.
Each contract records its provider, input/output schemas, permissions, role
policy, risk, approval policy, timeout, cost estimate, concurrency limit, and
tags. Calls return one normalized success/error envelope and emit one audit
record at the registry boundary.

The implementation audit, tool-by-tool chain map, and known unsupported domain
gaps are recorded in
[`docs/LANCEE_MCP_CONTRACT_AUDIT.json`](docs/LANCEE_MCP_CONTRACT_AUDIT.json).
The focused verification command is `npm run verify:mcp-contracts`.

Connect an MCP client to `https://lancee.hookitupservices.com/mcp` with
`Authorization: Bearer <lancee-device-token>`. The token must have the
`mcp:invoke` scope and supplies the user/workspace context. The route is served
by the app on port `5177` behind the existing HTTPS reverse proxy. Lancee no
longer accepts `MCP_SERVER_TOKEN`, `MCP_GATEWAY_URL`, `MCP_API_TOKEN`, or
Basebox MCP configuration.

The completed V1 architecture is recorded in
[`docs/LANCEE_RUNTIME_MCP_INTEGRATIONS.md`](docs/LANCEE_RUNTIME_MCP_INTEGRATIONS.md), with runtime operations in
[`docs/LANCEE_AGENT_RUNTIME.md`](docs/LANCEE_AGENT_RUNTIME.md).

## Storefront preview video

The Remotion composition lives in [`remotion/`](remotion/). Install its isolated
dependencies and render the preview into the dashboard's public assets with:

```bash
npm --prefix remotion install
npm --prefix remotion run render
```

The generated files are `public/storefront-preview*.mp4`. All styles share the
same hero → product grid → scroll → checkout flow; the selected style is
remembered per workspace in the dashboard. The copied source templates live in
[`storefront/templates`](storefront/templates). Video and byte-range requests
bypass the offline shell cache so browser playback controls receive valid MP4
range responses instead of cached partial responses.

## Dashboard tour video

The `DashboardTour` Remotion composition turns real dark-theme captures of all
17 dashboard routes into a labeled 1080p walkthrough. Render it with:

```bash
npm --prefix remotion run render:dashboard
```

The generated clip is `public/dashboard-tour.mp4`. See
[`docs/DASHBOARD_TOUR_VIDEO.md`](docs/DASHBOARD_TOUR_VIDEO.md) for the page
manifest, source-capture location, and refresh workflow.

The dashboard editor is available from **Storefront → Edit storefront/page**.
Use the left content-block palette to add sections, drag sections to reorder
them, and select a section to edit its text, logo, or products. **Basic page**
mode starts without a product block and does not show the commerce motion
preview; its editor palette also omits product sections.

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

## Agent device authorization

Agent clients use Lancee's device-code flow to request `ai:invoke`,
`mcp:invoke`, or both. Lancee no longer ships a second stdio MCP plugin; MCP
clients connect directly to the application-owned `/mcp` route.

The **Connections** page includes a **lancee AI for Codex** card. Open it to
enter the eight-character code shown by the client, review and approve the
requested `ai:invoke mcp:invoke` scopes, check active device status, or
disconnect every authorized Codex device.

Authentication uses a ten-minute device code shown by Codex and an explicit
lancee approval screen. Successful exchange issues a one-time, thirty-day
scoped token. Device codes and tokens are hashed in the database, provider
keys remain server-only. A client must keep the returned token in its own
protected credential store; Lancee stores only its hash.

See [`docs/CODEX_AI_CONNECTOR.md`](docs/CODEX_AI_CONNECTOR.md) for endpoint,
security, packaging, configuration, and verification details.

## Lancee MCP

The Lancee MCP bridge is the agent-facing surface for the platform itself. It
uses the same device approval flow as the AI connector, but requires the
separate `mcp:invoke` scope. Its 50 public tools expose workspace operations,
visual analysis, file/document/artifact operations, durable jobs, approvals,
workflow execution/status/logs/scheduling, bounded external API calls, and
Decision Intelligence operations.

The floating dashboard assistant uses the persisted planner/executor runtime
over that same registry. Runs are workspace/user scoped, budgeted, cancellable,
restart-resumable, and protected against retry loops. Approval, denial,
expiry, replay, and argument mismatch are handled server-side before a gated
step can execute.

Explicit file-writing prompts are routed directly to the built-in
`create_file` declaration instead of making the provider choose from the full
tool catalog. The assistant scrolls the resulting confirmation card into view;
the file is written to **Files** only after the user selects **Confirm**.

Research-to-PDF prompts use a bounded two-approval chain. Lancee first proposes
the read-only `web_search` tool, returns sourced titles, URLs, and snippets, and
then proposes `create_pdf` with a concise report. External result text is
treated as untrusted evidence and cannot authorize the PDF write. Each step can
be denied independently, and the resulting PDF is stored as a native Files
document.

The bridge is implemented directly by
[`server/lancee-mcp-protocol.mjs`](server/lancee-mcp-protocol.mjs) and
[`server/lancee-mcp.mjs`](server/lancee-mcp.mjs). Workflow runs reuse the
existing Core/Edge engine. Generic long-running work uses database-authoritative
jobs with leases, heartbeats, retries, recovery, cancellation, and durable
events; Redis is only an optional wake-up accelerator. See
[`docs/LANCEE_MCP.md`](docs/LANCEE_MCP.md) for the complete tool contract and

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

## Messages and mail connector

**Messages** is available from the dashboard sidebar and as the **Mail** card
under Connections. A workspace owner connects one shared mailbox. Common
Gmail/Google Workspace, Microsoft 365/Outlook, Yahoo, iCloud, Fastmail, and
Zoho settings are discovered from the address or its MX records. If discovery
does not identify a provider, the setup screen explains how to find and enter
the IMAP and SMTP hostnames, ports, TLS modes, username, and app password.

Mailbox passwords are encrypted with `ENCRYPTION_MASTER_KEY`, never returned to
the browser, and tested against both incoming and outgoing servers before the
connection is saved. Private network mail hosts are rejected by default. The
mail app supports live folders, server-side search, reading sanitized message
content, compose/reply, automatic polling every 60 seconds, and a small
confirmed project selector for authoritatively observed threads. Connected
Intelligence stores only bounded message metadata and canonical event
provenance; it does not copy message bodies or alter IMAP/SMTP transport.

Message automation rules can match sender, recipient, subject, and body/subject
keywords using all/any semantics. Each match dispatches an active native Core
automation once per message and rule. The built-in **Create a project from this
email** action resolves the sender to a workspace client by email, creates the
project/job card/draft invoice bundle, and uses the message id as an idempotency
key. Edge/n8n automations are rejected by both the UI and API. See
[`docs/AUTOMATIONS.md`](docs/AUTOMATIONS.md) and
[`docs/MAIL_CONNECTOR.md`](docs/MAIL_CONNECTOR.md) for setup, security, API,
rule-template fields, limits, and troubleshooting.

## Core automations, Redis, and Phase 3 workflow

Built-in automations run through the platform's Core execution layer. A Core
run is persisted in `automation_runs`, queued in Redis at
`REDIS_QUEUE_PREFIX:core:automation:jobs`, executed by a permission-checked
tool runner, and written to `automation_run_events`. The Automations page reads
the execution log from `GET /api/automations/runs/:runId/logs`; it is not a
simulated completion indicator.

The dashboard exposes these records in the **Results** navigation item. Core
step outputs render as outcome cards, and signed Edge callbacks persist
`output` (or `result`/`summary`) as a `run.completed` or `run.failed` event.
The assistant also reports a concise version of the returned outcome after an
approved run finishes.

Core tools are bounded to workspace-scoped reads and explicit project actions:
`workspace.summary`, `projects.list`, `clients.list`, `invoices.list`,
`projects.update_status`, `projects.create`, and `projects.create_draft_invoice`.
Every tool,
including reads, must be enabled on the saved automation before it can run.
The Workflows recipe cards now create active, persisted Core automations rather
than showing a selection-only toast. Edge automations
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

The **Services** page shows the always-active built-in Lancee service. The
floating workspace assistant receives a
server-built, workspace-scoped data snapshot and typed tool definitions;
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
application shell and static assets, but explicitly bypasses all API requests
and streaming media/range requests.
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

## Dashboard routing and resilience

Authenticated pages use durable browser routes. Home is available at
`/dashboard`; every other workspace area uses `/dashboard/<page>`, including
`/dashboard/clients`, `/dashboard/work`, `/dashboard/files`, and
`/dashboard/settings`. Direct links restore after sign-in, browser Back and
Forward update the active page, refreshes preserve the current view, and legacy
`?page=<page>` links are upgraded to their canonical route. Unknown dashboard
paths safely return to Home after session restoration. The Express production
server serves the application shell for these routes while keeping `/api/*`
404 responses as JSON.

The desktop sidebar can be collapsed and remembers that preference. On mobile,
navigation uses an accessible drawer and dismissible scrim without shifting the
page canvas. The top bar and content shell constrain long workspace/page labels
to prevent horizontal overflow.

Workspace startup is failure-tolerant: independent service requests settle
separately, successful data remains usable when an optional integration is
unavailable, stale async updates are ignored after session changes, and a
top-level recovery screen handles unexpected render or lazy-chunk failures.
The document title follows the active dashboard page for clearer tabs and
history navigation.

The implementation and verification record is in
[`changelogs/changelog_20260804_090222.md`](changelogs/changelog_20260804_090222.md).

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

Hermes has separate completion and agent-runtime paths. For WorkspaceChat’s
agent runtime, set `HERMES_ENDPOINT_URL` and the server-side named-profile key
configuration (`HERMES_API_KEY` for one named route or
`HERMES_PROFILE_API_KEYS_JSON` for multiple workspaces). Hermes is then
selected automatically unless `AGENT_PROVIDER=lancee` is set. Each workspace
uses the named profile `lancee_ws_<workspaceId>`; the adapter never uses
Hermes’ default/personal profile and fails closed when a workspace profile is
not configured. Set `HERMES_PROFILE_ENDPOINT_TEMPLATE` when the exposed
Hermes server does not use the default `/p/{profileId}` route. The agent
gateway verifies the native Hermes session before each run, sends explicit
persisted conversation history, restores the scoped WorkspaceChat conversation
after a reload, and exposes a file as saved only after its workspace-scoped
Lancee Files document is verified. Structured Hermes artifacts are canonicalized
to their `doc_…` storage document before WorkspaceChat renders a download; an
`art_…` record, metadata-only tool result, missing document, or cross-workspace
identifier is never treated as an openable file. Conversation history includes
bounded, per-turn live file metadata, and the approved `rename_file` MCP tool
renames the authoritative document and its linked artifact metadata. Run
`npm run verify:hermes` for the focused durability and continuity matrix.
Hermes preferences are scoped to both the
authenticated workspace and user. The existing Lancee runtime remains the
configured fallback, and provider health is available at `/api/agent/status`
and within `/api/ai/status`. Configure
`AGENT_FALLBACK_PROVIDER` and `AGENT_FALLBACK_ENABLED` as needed. See
[`docs/HERMES.md`](docs/HERMES.md).
When Hermes is selected, it remains the conversational chatmaster: Lancee
supplies authenticated workspace tools and business records without replacing
Hermes’ native personality, reasoning, skills, browser/screenshots, terminal,
files, memory, media tools, or subagent orchestration. Native Hermes
`MEDIA:` screenshots are imported from the profile’s cache into Lancee Files
and rendered through an authenticated document URL. Set `HERMES_MEDIA_ROOTS`
to comma-separated shared-volume roots when Hermes and Lancee do not see the
same profile cache; `HERMES_MEDIA_MAX_BYTES` defaults to 10 MB. Public web URLs
are preserved as URLs and are never mistaken for local filesystem paths.

Bounded summaries, classifications, builders, and other completion-only flows
continue to use `completeChat()`. To use Hermes for those completions, set
`AI_PROVIDER=hermes`, `AI_MODEL=hermes-agent`, `HERMES_ENDPOINT_URL`, and
`HERMES_API_KEY`; completion fallback behavior remains independent of
`AGENT_PROVIDER`.

The Hermes runtime implementation and verification records are in
[`docs/HERMES.md`](docs/HERMES.md) and
[`changelog_20260821_233151.md`](changelog_20260821_233151.md).

## Memory, Signal Engine, and Decision Dynamics

Lancee now enforces the basic three-state memory boundary: the current Session
holds temporary conversation/task context, Hermes memory holds only stable
personal preferences and working conventions scoped to the authenticated
workspace and user, and workspace business knowledge is persisted through
authoritative Lancee records. Ambiguous information stays in Session. Business
decisions, evidence, outcomes, and organisational learning are never stored as
Hermes preferences.

Decision Intelligence Phase 1A records authorized workspace activity in the
activity ledger, applies deterministic relevance and decision-language filters,
and creates auditable decision candidates behind a versioned confidence gate.
Connected communications require a workspace-owned active connection and retain
their source provenance. High-confidence complete candidates can promote into
the Phase 1 Decision Dynamics slice; medium-confidence candidates wait for
human review, while low-confidence interpretations leave the source event only.

Decision Dynamics persists normalized vectors, expected reactions, deterministic
baseline/observed metrics, evidence, confounders, outcomes, and bounded
structural comparisons. Metric arithmetic and all Phase 1 scoring are performed
by Lancee—not Hermes—and causal confidence remains separate from measured and
comparison confidence. Phase 1 is frozen after verification against Lancee's
deployed PostgreSQL 16 server in an isolated temporary database.

For structurally eligible candidates, Lancee now builds a capped, workspace-
scoped evidence pack and asks Hermes only whether the contexts are realistically
comparable. Lancee validates the five-field semantic response, retains authority
over all metrics and final confidence, and records an explicit unavailable state
when Hermes fails or times out. The MCP surface preserves the existing approved
decision/outcome writes and canonical read/list/compare results. See
[`docs/DECISION_INTELLIGENCE_PHASE1.md`](docs/DECISION_INTELLIGENCE_PHASE1.md)
and [`docs/DECISION_INTELLIGENCE_SEMANTIC.md`](docs/DECISION_INTELLIGENCE_SEMANTIC.md).

Decision Intelligence Phase 2 schedules evidence reviews for recorded expected
metrics, emits one workspace notification when a review becomes due, and closes
the review only when a measured outcome exists. Users can confirm, correct, or
reject Hermes' contextual assessment without overwriting its machine record;
Lancee recalculates the effective confidence with the frozen versioned model.
The workspace assistant, constrained planner, native Hermes agent, and MCP
surface now route decision, outcome, lesson, strategy, and priority requests to
these workspace-scoped records. See
[`docs/DECISION_INTELLIGENCE_PHASE2.md`](docs/DECISION_INTELLIGENCE_PHASE2.md).

Decision Intelligence Phase 3 completes the bounded learning loop. Lancee now
detects evidence-thresholded patterns from measured outcomes, produces
sample-backed empirical predictions with intervals, warns when qualifying
history contradicts a recorded expectation, and records prediction error when
the outcome arrives. Structural weights can adapt only from enough explicit
human comparison labels, with bounded movement and immutable model provenance.
Observational results remain associations; controlled before/after estimates
retain their assumptions and are never presented as causal proof. See
[`docs/DECISION_INTELLIGENCE_PHASE3.md`](docs/DECISION_INTELLIGENCE_PHASE3.md).

Decision-input questions are routed deterministically to the decision ledger,
which exposes the original language, rationale, intent, Decision Vector, and
expected reactions. Outcome reviews are treated only as a review queue: an
empty queue never implies that decisions, evidence, or business inputs are
absent.

The authenticated workspace preserves this system under the secondary
**Decision Intelligence history** capability at `/dashboard/intelligence`.
It presents the decision ledger, measured outcomes, patterns, predictions,
warnings, and evidence records without displacing the primary Connected
Intelligence experience. Patterns, predictions, warnings, and ledger records
retain their named confidence dimensions and open into the existing evidence
drawer.

The UI reads bounded list/detail tools and one read-only
`get_decision_intelligence_overview` capability. That overview aggregates the
existing workspace-scoped tables without recalculating intelligence. No new
Decision Intelligence table, migration, learning engine, notification state,
or Hermes authority was introduced. See
[`docs/DECISION_INTELLIGENCE_UI.md`](docs/DECISION_INTELLIGENCE_UI.md).

Business analytics now appears at the bottom of **Intelligence**, alongside the
Decision Intelligence experience. It retains live workspace metrics and refresh
but intentionally does not expose Cloud files or JSON export actions. Legacy
Analytics, Workflows, Services, Results, and Storefront dashboard URLs resolve
to their consolidated destinations. See [`docs/UI_FIXES.md`](docs/UI_FIXES.md).

The public landing page includes a Decision Intelligence section that explains
this flow in business language: remember the choice, measure what changed, and
compare past decisions with their context and evidence intact. Its atmospheric
midnight-blue background is shared by the workflow and final call-to-action
sections for a consistent landing-page rhythm across both themes.

Verify the foundation with:

```bash
npm run verify:memory
npm run verify:signals
npm run verify:dynamics
npm run verify:decision-semantic
npm run verify:decision-phase2
npm run verify:decision-phase3
npm run verify:decision-ui
npm run verify:ui-fixes
npm run verify:mcp-contracts
# Against a guarded lancee_decision_verify_* database only:
npm run verify:dynamics-postgres
```

AI providers are an internal deployment detail. The workspace assistant passes
the same validated Lancee tool definitions to any supported tool-capable
provider (Gemini, OpenAI, Anthropic, or Hermes). Customer-facing UI describes
the intended action in plain language and never requires users to understand
providers, MCP, or function-calling terminology.

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
MAIL_SYNC_INTERVAL_MS=60000
# Development only; production always blocks private/local mail hosts.
MAIL_ALLOW_PRIVATE_HOSTS=false
```

The notification SMTP settings above are separate from the workspace mailbox
configured inside **Messages**. The workspace mailbox uses its own encrypted
credential and requires `ENCRYPTION_MASTER_KEY` to be set.

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
`review_sessions` and `review_annotations`. Multi-deliverable review rounds use
`review_package_items`, with comments linked back to their review item and
project bucket; the same schema also works with the existing SQLite development
fallback. See
[`docs/SCALABILITY_AND_POSTGRESQL.md`](docs/SCALABILITY_AND_POSTGRESQL.md) for
connection-pool, transaction, migration, and rollout details. SQLite remains a
durable single-process development fallback through `DATABASE_PATH`.

## Development and verification

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
```

Vite uses port `5177` and accepts `lancee.hookitupservices.com`. This is a
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
pnpm verify:mcp
pnpm verify:mcp-contracts
pnpm verify:capabilities
pnpm verify:documents
pnpm verify:runtime-persistence
pnpm verify:agent-runtime
pnpm verify:agent
pnpm verify:connected-intelligence
pnpm verify:ci-fixture
pnpm verify:workers-artifacts
pnpm verify:codex-connector
pnpm verify:google-drive
pnpm verify:workspace-flows
pnpm verify:workspace-builder
pnpm verify:client-files
pnpm verify:project-reviews
pnpm verify:whatsapp
pnpm verify:platform
# With DATABASE_URL or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE:
pnpm verify:postgres
node --check server/index.mjs
node --check server/database.mjs
node --check server/notifications.mjs
node --check server/paystack.mjs
node --check server/n8n.mjs
node --check server/lancee-mcp-protocol.mjs
node --check server/lancee-mcp.mjs
node --check server/agent-runtime.mjs
node --check server/execution-worker.mjs
node --check server/browser-worker.mjs
node --check public/sw.js
npm --prefix remotion run render
```

The application lint and production build complete without errors. Because the
full Ideas editor is lazy-loaded as an isolated route, Vite may report some of
its feature-complete chunks as larger than the default advisory threshold.
The Files section is covered by the production typecheck and
`pnpm verify:client-files`.

## Production

```bash
docker compose up -d --build app
docker compose ps
curl --fail http://127.0.0.1:5177/api/health
```

The Compose `app` service is the authoritative production runtime and serves
the compiled app and API on `0.0.0.0:5177`. Nginx Proxy Manager terminates TLS
for `lancee.hookitupservices.com` and forwards to that listener. Do not run the PM2
entry and the Compose app simultaneously on the same port; use
`ecosystem.config.cjs` only for a deliberate non-Docker deployment.

The application image is based on the pinned Playwright runtime. The Express
process owns the Lancee API while browser-read work is launched as the
unprivileged `pwuser` child configured by `LANCEE_BROWSER_RUN_AS_USER`; no
second MCP server or browser sidecar is deployed.

More implementation notes are in [`docs/PLATFORM.md`](docs/PLATFORM.md).
