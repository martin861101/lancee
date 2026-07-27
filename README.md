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
  deliverables, and a lightweight new-project flow.
- **Ideas** — a visual canvas with durable, versioned quick notes that remain
  readable and editable offline, plus briefs, references, palettes, tasks, and
  optional AI-assisted grouping.
- **Automations** — plain-language routines for repetitive work, schedules,
  connected tools, and activity history.
- **Connections** — design, communication, storage, payment, n8n, and managed
  MCP services.
- **Money** — durable ZAR invoices, real Paystack hosted payment links and
  verified webhook reconciliation; Stripe and PayPal remain previews.
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

MCP is a platform feature, not an integration users install. Every workspace can
browse the service catalog immediately. A user requests bearer access once,
then activates only the approved services an automation may use.

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
the local SQLite database.

See [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) and
[`mcp-conf/MCP.md`](mcp-conf/MCP.md).

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
Verified inbound events are durably accepted; dispatch into a persisted
automation engine remains later work. See [`docs/N8N.md`](docs/N8N.md).

## Paystack payments

Paystack is the first depth-first payment provider. When
`PAYSTACK_SECRET_KEY` is configured server-side, Money can create a durable ZAR
invoice and hosted checkout link. The link is returned for explicit review and
sharing; lancee sends nothing automatically. A raw-body HMAC-SHA512 webhook
verifies reference, amount, and currency before marking the invoice paid.

Stripe and PayPal remain labelled previews. Configuration, live boundaries,
webhook setup, and deterministic verification are in
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

Implemented server actions:

- `GET /api/health`
- `GET /api/auth/session`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/ideas/notes`
- `POST /api/ideas/notes`
- `PATCH /api/ideas/notes/:noteId`
- `GET /api/mcp/access`
- `POST /api/mcp/access-request`
- `POST /api/mcp/access/revoke`
- `GET /api/mcp/services`
- `POST /api/mcp/services/:serviceId`
- `GET /api/api-keys`
- `POST /api/api-keys`
- `DELETE /api/api-keys/:keyId`
- `GET /api/v1/workspace` with a scoped API key
- `GET /api/v1/mcp/access` with a scoped API key
- `GET /api/money/paystack/status`
- `GET /api/money/invoices`
- `POST /api/money/paystack/payment-links`
- `POST /api/webhooks/paystack`
- `GET /api/n8n/config`
- `POST /api/n8n/config`
- `POST /api/n8n/disconnect`
- `GET /api/n8n/deliveries`
- `POST /api/n8n/deliveries`
- `POST /api/n8n/deliveries/:deliveryId/retry`
- `GET|POST /api/hooks/n8n/:workspaceId`
- `GET /api/notifications/status`
- `POST /api/notifications/test`

Projects, broader visual-board records, automation execution, Stripe/PayPal,
standard connections, MCP catalog discovery, and MCP tool execution remain
asynchronous placeholders. Idea quick notes, Paystack, and n8n use real server
flows.
Authentication identities, workspace memberships, MCP grants/service
activation, API keys, Idea notes, Paystack invoices/payment links/events, n8n
configuration/deliveries/nonces, and idempotency records are durable.
Automation types, run references, mock methods, UI identifiers, and styles
consistently use `Automation` naming.

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
node --check server/index.mjs
node --check server/database.mjs
node --check server/notifications.mjs
node --check server/paystack.mjs
node --check server/n8n.mjs
node --check public/sw.js
```

The lint command currently reports warnings only inside the retained
`react-templates/` reference projects; the lancee application builds without
errors.

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
