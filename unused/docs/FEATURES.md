# lancee — Platform Features

A calm, portable operating workspace for freelancers and small business owners —
bringing client work, ideas, automations, connected tools, invoices, and
payments into one focused place.

This document lists every included feature of the platform, organised by product
area.

---

## Table of contents

1. [Authentication & security](#authentication--security)
2. [Landing page](#landing-page)
3. [Dashboard overview (Home)](#dashboard-overview-home)
4. [Clients](#clients)
5. [Work / Projects (Kanban)](#work--projects-kanban)
6. [Project review & artwork annotations](#project-review--artwork-annotations)
7. [Ideas (Excalidraw canvas)](#ideas-excalidraw-canvas)
8. [Files & document library](#files--document-library)
9. [Messages (mail)](#messages-mail)
10. [Money (invoices & payments)](#money-invoices--payments)
11. [Storefront](#storefront)
12. [Automations](#automations)
13. [Runs / Results](#runs--results)
14. [Workflows (recipe templates)](#workflows-recipe-templates)
15. [Connections / Integrations](#connections--integrations)
16. [n8n integration](#n8n-integration)
17. [Services (Lancee MCP)](#services-lancee-mcp)
18. [PDF Studio](#pdf-studio)
19. [Workspace AI assistant](#workspace-ai-assistant)
20. [Analytics](#analytics)
21. [Team & roles](#team--roles)
22. [API keys](#api-keys)
23. [Notifications](#notifications)
24. [Settings](#settings)
25. [Command palette & navigation](#command-palette--navigation)
26. [PWA & offline support](#pwa--offline-support)
27. [Platform backend](#platform-backend)

---

## Authentication & security

- First-party server sessions (no Firebase dependency).
- Initial administrator configured via `ADMIN_EMAIL`.
- Passwords hashed with Node.js `scrypt` — only salt and hash are stored.
- Signed `HttpOnly`, `Secure`, `SameSite=Lax` session cookie.
- Public `/signin` and `/signup` routes.
- Signup collects account details first, then sends a 24-hour email
  confirmation link; the workspace is created only after the link is used to
  choose a password.
- Login rate-limited to five failed attempts per 15-minute window.
- Request-origin validation on all mutating requests.
- Registration controlled by `ALLOW_REGISTRATION` (enabled by default).
- Email confirmation requires SMTP notification settings.
- Owner-issued seven-day invitation links; tokens stored as hashes.
- Multi-role team access: owner, collaborator, and viewer roles.
- Server-side sessions, approvals, encrypted secrets, and durable audit trails.

## Landing page

- Freelancer-focused product narrative with workflow explanations and
  connection highlights.
- Connection showcase with locally rendered brand marks for Gmail, Calendar,
  Drive, Slack, Zoom, Stripe, PayPal, and Paystack.
- Security posture section and sign-in calls to action.
- Dark navy visual system with monochrome grain, glass surfaces, and offset
  shadows; calm off-white feature bands.
- Desktop glass navigation, GSAP hero reveals, ambient CSS motion, and
  reduced-motion support.
- Public Terms, Privacy, and Refund pages.

## Dashboard overview (Home)

- Snapshot analytics: open projects, due-soon projects, total clients,
  outstanding amount, pending invoices, and invoices due this week.
- Recent project/deadline overview and outstanding invoice summary.
- Useful automations list with one-click dispatch.
- Recent activity and run status.
- Quick-task entry point with prompt-based automation dispatch.
- Command palette for keyboard navigation and quick actions.

## Clients

- Sidebar-accessible client directory with search.
- Contact details, company, and status controls (active / archived).
- Project counts per client.
- Create, edit, and confirmed-delete clients.
- Focused per-client workspace view.
- Client selection flows into project creation and Drive file relationships.

## Work / Projects (Kanban)

- Searchable, filterable project table with status badges, due dates, created
  dates, ownership, pagination, and quick actions.
- Status lanes: In progress, In review, Waiting on client, Ready.
- Persistent drag-and-drop status movement between lanes.
- Project creation with name, client, scope, due date, and attached files.
- Per-project Kanban workspace with tabs:
  - **Board** — assignable custom buckets and task cards.
  - **Details** — progress, deadline, owner, and status editing.
  - **Files** — authenticated project attachments with upload and download.
  - **Links** — external project links with labels.
  - **Review** — client review session and draft invoice workflow.
- Drive relationships on projects (folder and file resource links).
- Project deliverable tracking.
- Creating a project immediately creates a job card and a draft invoice.
- Project review workflow (see next section).

## Project review & artwork annotations

- **Send to client** creates a signed, expiring tokenized review URL
  (`/review/:reviewId?token=…`) and emails only the link when SMTP is
  configured.
- Artwork is fetched from PostgreSQL only after the client presents the token.
- Annotorious-based rectangle and polygon annotation on image attachments.
- Client annotations support comments, priority, category, and submission.
- Designer review panel with filters (priority, category, status).
- Annotation lifecycle statuses: open, in-progress, resolved, rejected.
- Designer can update annotation metadata and delete annotations.
- Approval changes the draft invoice to `ready_for_review`.
- Review sessions and annotations persisted in `review_sessions` and
  `review_annotations` tables (PostgreSQL / SQLite).
- Client-facing submission states and a comment/approval response flow.

## Ideas (Excalidraw canvas)

- MIT-licensed Excalidraw workspace for freehand drawing, shapes, arrows, text,
  images, embeddable content, and reusable libraries.
- Keyboard and touch editing, export to image.
- Named boards attached to the lancee workspace.
- Bundled Excalidraw libraries load into every canvas.
- Canvas PDFs can be downloaded and saved directly into the workspace Files
  library.
- Full document and imported assets stored in IndexedDB under a
  workspace-and-board-specific key — offline editing supported.
- Board names managed through the authenticated lancee API.
- Canvas documents are browser-local (not shared across devices).

## Files & document library

- Expandable Google Drive folder tree with persistent links to clients and
  projects.
- lancee document library.
- Upload PDF, DOC/DOCX, Markdown, text, and image files to lancee, Drive, or
  both.
- In-app editing of supported documents (rich-text and Markdown).
- Later sync of local files to Drive.
- Remove local workspace copies with a visible, confirmation-protected action.
- Google Picker-based, non-sensitive per-file Drive access.
- Drive resources linkable to clients and projects.
- Download URLs and authenticated content access.
- The page uses its own vertical scroll region for long file lists on desktop
  and mobile.
- Cloud link records for Drive, Dropbox, OneDrive, Box, and other providers.

## Messages (mail)

- Workspace mail app from the dashboard sidebar and the **Mail** connection
  card.
- Automatic provider discovery for Gmail/Google Workspace, Microsoft
  365/Outlook, Yahoo, iCloud, Fastmail, and Zoho (from the address or MX
  records).
- Guided manual IMAP/SMTP setup with host, port, TLS mode, username, and app
  password fields.
- Provider detection explanations and connection instructions.
- Live folders, server-side search, and message reading.
- Sanitized message content rendering.
- Compose, reply, CC, BCC, and send.
- Automatic polling every 60 seconds.
- Mailbox passwords encrypted with `ENCRYPTION_MASTER_KEY`, never returned to
  the browser.
- Credentials tested against both incoming and outgoing servers before saving.
- Private-network mail hosts rejected by default.
- Mail automation rules matching sender, recipient, subject, and body/subject
  keywords with all/any semantics.
- Each rule match dispatches an active native Core automation once per message
  and rule; Edge/n8n rules are rejected.

## Money (invoices & payments)

- Durable ZAR invoices with statuses: initializing, pending, paid, failed.
- Invoice creation with client, project, description, amount, due date, and
  custom fields.
- Billing document templates and offline drafts.
- Paystack integration with real hosted payment links.
- Verified, duplicate-safe webhook reconciliation.
- Raw-body HMAC-SHA512 verification checking reference, amount, currency, and
  workspace.
- Workspace-scoped webhook URLs.
- Paid-total, outstanding, and upcoming payment summaries.
- Draft invoice flow that becomes `ready_for_review` on client approval, then
  `sent` when dispatched.
- Credentials AES-256-GCM encrypted; optional `PAYSTACK_SECRET_KEY`
  server-environment fallback.
- Test and live mode support.

## Storefront

- Optional client storefront with five selectable styles:
  - **Black & White**
  - **Blue Splash**
  - **Gold Dune**
  - **Red Tech**
  - **Flowish**
- Copied source templates stored in the repo.
- In-dashboard scroll-through preview with an always-visible play/pause
  control.
- Workspace-scoped opt-in.
- Guided custom-domain setup: enter a domain, copy displayed DNS records
  (CNAME and TXT), and verify with **Check DNS connection**.
- Domain status tracking (pending / verified).
- Storefront remains previewable while disabled, so users can decide before
  enabling.
- Preview video rendered with Remotion and streamed with byte-range support.
- Full commerce checkout flow (hero → product grid → scroll → checkout).

## Automations

- Plain-language routines for repetitive work.
- Native **Core** automations running through the platform's own execution
  layer.
- **Edge** automations backed by n8n (require an active n8n connection).
- Schedule and connected-tool support.
- Core tools (each must be enabled per automation): `workspace.summary`,
  `projects.list`, `clients.list`, `invoices.list`,
  `projects.update_status`, and `projects.create_draft_invoice`.
- Create, pause/resume, run, and confirmed-delete automations.
- Model selection and optional tool enablement on creation.
- Runs persisted in `automation_runs`, queued in Redis, executed by a
  permission-checked tool runner, and written to `automation_run_events`.
- Redis in-process fallback keeps local development usable.
- Mail-triggered automations from Messages rules.
- Status display (active / paused / draft) and success-rate tracking.

## Runs / Results

- Dedicated **Results** screen for automation execution history.
- Newest run opens automatically after dispatch.
- Each completed step shown as a readable outcome card.
- Full returned data and execution log available on demand.
- Real execution log served from `GET /api/automations/runs/:runId/logs` (not
  simulated).
- Run statuses: running, completed, failed, with error codes and durations.
- Edge callbacks persist `output` / `result` / `summary` as `run.completed` or
  `run.failed` events.
- Assistant reports a concise outcome summary after an approved run.

## Workflows (recipe templates)

- Workflow-template directory with recipe cards for common use cases.
- Applying a template creates an active, persisted Core automation.
- Templates support scheduling and connected-tool configurations.
- Workflow runs reuse the Core/Edge engine and Redis queue.

## Connections / Integrations

The Connections page manages all third-party and platform integrations:

- **Mail** — workspace mailbox connection (see Messages).
- **Google Drive** — independent backend-managed OAuth with Google Picker.
- **Paystack** — encrypted workspace payment credentials.
- **n8n** — signed webhook connection with bidirectional test.
- **Lancee MCP** — the application-owned workspace tool surface.
- **AI integration** — provider-backed workspace AI with approvals.
- Integration catalog with toggles and connection status.
- Connection cards for Automation, Communication, Design, Payments, and Storage
  categories.
- Persisted integration requests for unsupported providers (requested, planned,
  declined) — never fake "connected" toggles.
- OAuth token storage (provider, token type, expiry).
- Per-integration enable/disable.

## n8n integration

- User-configured, durable integration.
- Accepts a webhook on the allowlisted n8n origin.
- Sends real signed `GET` and `POST` deliveries.
- Inbound callbacks verify canonical method/path/body signature, five-minute
  timestamp, and one-use nonce.
- Shared secret AES-256-GCM encrypted at rest.
- Delivery attempts persist success, failure, response status, duration,
  correlation ID, and retry lineage.
- Dispatching an automation creates a durable run, sends a signed
  `lancee.automation.run` event, and completes only after a signed
  `lancee.automation.result` callback.
- Provider tokens rehydrated only in memory; never written to the delivery
  ledger.
- Test panel for both directions and methods.
- Delivery history, retry of failed deliveries, and disconnect.
- Optional queue-mode Edge deployment with Redis and n8n worker overlay.

## Services (Lancee MCP)

- MCP is a built-in platform feature available to every workspace.
- One always-active built-in **Lancee** service.
- `POST /mcp` is served by the Lancee application on its normal origin.
- Local tool schemas and calls use the same runtime as dashboard automations.
- External clients use approved device tokens with `mcp:invoke` scope.
- No external MCP catalog, server activation, Basebox bridge, or gateway token.
- **Approve & run** control before invoking any tool.
- Every invocation is workspace-scoped and audited at the Lancee boundary.

## PDF Studio

- Local PDF document generator.
- Inputs: title, subtitle, author, content, theme, accent color, footer, and
  page format (e.g. A4).
- Produces a PDF file with an authenticated download link.
- Powered through the local Lancee `create_pdf` tool.

## Workspace AI assistant

- Floating dashboard assistant.
- Server-built, workspace-scoped data snapshot and typed tool definitions.
- Provider credentials and unrestricted SQL never reach the browser.
- Native provider function calls (Gemini, OpenAI, Anthropic, or Hermes) to
  propose tools.
- Read-only AI data actions: `describe_table`, `list_tables`, `list_schemas`,
  `query`, and `connect_db`.
- `execute` returns an approval-required response and does not run.
- Explicit approval before invoking tools; typing workflow requests become
  typed approval requests.
- Supports creating and activating workflows from natural language.
- Hermes fallback provider support.
- AI is optional and appears only where it removes meaningful effort.

## Analytics

- Dashboard metrics: open projects, due-soon projects, total clients,
  outstanding amount, pending invoices, and invoices due this week.
- Served from real API analytics endpoints.

## Team & roles

- Team member directory with status.
- Roles: owner, collaborator, viewer.
- Editable team roles.
- Remove team members.
- Invite members by email with name and role; invitations create membership
  only after acceptance.
- Member name and initials surface across the workspace.

## API keys

- Create API keys with a name.
- Permission scopes: `workspace:read`, `mcp:read`.
- Prefix-based display, created and last-used timestamps.
- Revoke keys.
- Full secret shown once at creation.

## Notifications

- Workspace notifications with kinds, titles, bodies, and entity references.
- Client approval notifications surfaced separately (`approval.*` kinds).
- Read/unread tracking.
- Notification bell in the dashboard.
- Server-side SMTP notification settings for email delivery.

## Settings

- **Profile** — name and workspace display settings.
- **General** — workspace name, logo, email, timezone, travel mode/location,
  and storefront enablement.
- **Dev** — database and connection status checks.
- Profile menu and logout.
- Separate settings from technical Dev Tools.

## Command palette & navigation

- Keyboard-triggered command palette (Cmd/Ctrl+K).
- Jump to any page and create automations quickly.
- Full sidebar navigation: Overview, Clients, Work, Ideas, Automations,
  Workflows, Storefront, Results, Connections, Services, Money, Analytics,
  Files, Messages, Team, API, Settings.
- Mobile-responsive sidebar with collapsible menu.

## PWA & offline support

- Installable progressive web app.
- Service worker caches the application shell and static assets.
- All API requests and streaming media/range requests explicitly bypassed.
- Offline Ideas editing via IndexedDB.
- Payments, API-key operations, MCP access, n8n configuration/delivery, and
  other high-impact mutations remain online-only.
- Exact cache, queue, security, and conflict boundaries documented.

## Platform backend

- Real Express APIs for every durable flow (no mock layer).
- Authentication, registration, and invitations.
- Projects, project links, boards, and project files.
- Visual idea boards and offline notes.
- Automations, runs, run events, and logs.
- Analytics.
- Team membership.
- Cloud links.
- Google Drive.
- API keys.
- Paystack.
- n8n.
- Local Lancee MCP protocol and tool runtime.
- SMTP and mail sync.
- AI completions.
- PostgreSQL in production with SQLite single-process development fallback.
- Redis queueing with `REDIS_QUEUE_PREFIX` and visible `/api/health` state.
- Optional demo seeding via `SEED_DEMO_DATA=true`.
- Deployment via Docker Compose (app, db, Redis, n8n edge overlay) or PM2.
