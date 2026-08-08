# Phase 3 implementation

Phase 3 turns the platform automation and client-review paths into durable
backend workflows. It also documents the Redis deployment used by the Core
worker and the safety boundary around the workspace assistant.

## Automation execution

There are two execution modes:

- **Core** runs inside lancee. A saved automation declares the tools it may
  use. Read tools are workspace-scoped; mutating tools require an explicit
  permission on that automation.
- **Edge** dispatches to the configured n8n bridge. It cannot run until the
  workspace has a valid n8n connection, so an Edge test without n8n is a real
  rejected request rather than a simulated success.

Core's available tools are:

| Tool | Type | Effect |
| --- | --- | --- |
| `workspace.summary` | read | Counts workspace projects, clients, invoices, and drafts |
| `projects.list` | read | Reads workspace projects |
| `clients.list` | read | Reads workspace clients |
| `invoices.list` | read | Reads workspace invoices |
| `projects.update_status` | mutation | Changes a real project status |
| `projects.create_draft_invoice` | mutation | Creates or returns the project draft invoice |

Core runs are stored in `automation_runs`. Each plan, step start, step result,
and failure is stored in `automation_run_events` with bounded input/output
data. The run log is available through:

```text
GET /api/automations/runs/:runId/logs
```

The run status endpoint includes the same events for authenticated workspace
members:

```text
GET /api/automations/runs/:runId
```

The queue key is `${REDIS_QUEUE_PREFIX}:core:automation:jobs`, with the default
`lancee:core:automation:jobs`. The host setup uses the Redis system service;
Compose uses the `redis:7.4-alpine` service. The application invokes Redis
through the server-side `redis-cli` bridge, so Docker installs `redis-tools` in
the runtime image. If Redis is unavailable, a Core run falls back to an
in-process worker and the health response reports `core.redis: false`.

Check the runtime state with:

```bash
redis-cli ping
curl http://127.0.0.1:5177/api/health
```

For Compose:

```bash
POSTGRES_PASSWORD='use-a-long-secret' docker compose up -d --build
```

For the private n8n Edge overlay, also set `N8N_IMAGE`,
`N8N_REDIS_PASSWORD`, and `N8N_ENCRYPTION_KEY`:

```bash
docker compose -f docker-compose.yml -f docker-compose.edge.yml up -d --build
```

## Client approval workflow

Project creation performs all three initial writes in the idempotent database
transaction:

1. create the project;
2. create its job card; and
3. create a client-linked draft invoice with project details.

The workspace can then call:

```text
POST /api/projects/:projectId/approvals
GET  /api/projects/:projectId/approvals
```

The first route creates a 14-day, hashed approval token and sends an email when
SMTP is enabled. The email includes the project attachments and links to:

```text
GET  /approval/:token
POST /api/public/approvals/:token/comment
POST /api/public/approvals/:token/approve
GET  /api/public/approvals/:token/files/:fileId
```

The public page exposes only token-scoped project data. A comment is persisted
in `project_comments`, creates a `workspace_notifications` entry, and moves
the job card to `client_review`. Approval moves the job card to `approved`,
marks the project ready, and changes its draft invoice to
`ready_for_review`.

Workspace users can edit and send the draft invoice through:

```text
GET   /api/draft-invoices
PATCH /api/draft-invoices/:id
POST  /api/draft-invoices/:id/send
GET   /api/notifications
```

Sending requires at least R1.00, records an invoice notification, creates a
signed mock payment URL, marks the job card `done`, and moves the project to
the completed `Ready` lane with progress at 100. The payment page is:

```text
GET  /pay/:id?sig=...
POST /api/public/draft-invoices/:id/pay?sig=...
```

It intentionally reports mock payment mode until the existing Paystack flow is
selected for production payment processing.

## Services and AI boundary

The authenticated **Services** page is a UI for the local Lancee MCP registry.
It shows the always-active application-owned service and records tool
invocations. No external MCP gateway or service activation is involved.

The floating workspace assistant calls `POST /api/ai/chat`. The backend builds
the context from workspace-scoped projects, clients, invoices, draft invoices,
and automations, removes provider credentials, and persists the conversation.
It does not give the model arbitrary database access or permission to claim a
mutation completed.

The optional structured data action endpoint is:

```text
POST /api/ai/actions
```

Allowed read actions are `describe_table`, `list_tables`, `list_schemas`,
`query`, and `connect_db`. `query` is restricted to approved workspace readers;
it is not a raw SQL passthrough. An `execute` request returns
`409 AI_APPROVAL_REQUIRED` and must be reviewed by a human before any future
implementation can perform it.

## Database migration

The SQLite-to-PostgreSQL migration includes the Phase 3 tables in dependency
order: `automation_run_events`, `job_cards`, `draft_invoices`,
`client_approvals`, `project_comments`, and `workspace_notifications`.

Run the existing migration command with a PostgreSQL connection configured:

```bash
pnpm migrate:postgres
```

## Verification

The deterministic integration verifier exercises actual effects, not just a
completed status:

```bash
pnpm lint
pnpm build
pnpm verify:core-edge
```

`verify:core-edge` checks encrypted token storage, Core Redis execution,
persisted step logs, project status mutation, project-created draft invoices,
public client comments and approval, invoice sending, the mock payment page,
project completion, and Edge rejection without n8n.
