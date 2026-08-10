# lancee Legal & Business Infrastructure — Discovery and Implementation Report

Scope note: the earlier legal prompt, quarantined at
[`../junk/docs/LEGAL.md`](../junk/docs/LEGAL.md), is truncated and ends at
**Section 2 — Canonical Business Identity**. The intro references subscription billing, invoice
identity, revenue classification, and compliance administration, but no
concrete requirements for those sections exist in the file. This task
implements the two specified deliverables (Section 1 report, Section 2
canonical identity) and documents the rest as follow-ups.

## Platform Survey

| Area | Finding |
| --- | --- |
| Framework / package manager | React 19 + TypeScript + Vite client (`src/`), Express backend in plain `.mjs` (`server/`). `pnpm` lockfile, `npm` scripts. |
| Frontend structure | `src/App.tsx` (auth + landing + policy pages), `src/components/` (dashboard, work, money, workflows, annotations, storefront), `src/lib/` (api, theme, ideasRepository, offlineStore, pwa). |
| Backend structure | `server/index.mjs` (Express app, all routes), `database.mjs` (SQLite/PostgreSQL query layer), feature modules (`paystack.mjs`, `n8n.mjs`, `ai.mjs`, `core.mjs`, `mail.mjs`, `notifications.mjs`, `google-drive.mjs`, `lancee-mcp-protocol.mjs`, `lancee-mcp.mjs`, `vault.mjs`, `redis.mjs`, `codex-app-server.mjs`). |
| Database / migrations | `server/database.mjs` schema via `CREATE TABLE IF NOT EXISTS`; no versioned migration system; `scripts/migrate-sqlite-to-postgres.mjs` for the SQLite→PostgreSQL move. |
| Authentication / authorization | Cookie sessions, scrypt password hashing, rate limiting, workspace membership + invitations, API keys with permissions, device-code auth for Codex. |
| Workspace model | Single primary workspace (`WORKSPACE_ID=wsp_primary`) with owner/collaborator/viewer roles and invites. |
| Subscription / payments | Paystack (server-side) for draft invoices; Stripe/PayPal/Paystack referenced in the refund policy. No subscription-billing engine yet. |
| Legal pages | `TermsPage`, `PrivacyPage`, `RefundPage` in `src/App.tsx` (state-based `policyView`, no router); linked from the landing footer. |
| Footer / checkout | Landing footer (`LandingPage`) + three policy footers; storefront has its own checkout/footer. |
| Invoice / receipt | `draft_invoices`, `invoices` tables, `invoiceNumber`, amount in minor units, Paystack payment links/webhooks. |
| Webhooks | Paystack webhooks, n8n webhooks, Google OAuth callback, public invoice pay endpoint. |
| Email service | `server/notifications.mjs` (SMTP via env) — branded templates; `server/mail.mjs` (per-account mail connector for Messages). |
| Events / audit / jobs | `createWorkspaceNotification` (in-app), Redis-backed queue with in-process fallback, `job_cards`. No standalone audit-log table. |
| Admin configuration | Environment-based (`ADMIN_*`, `WORKSPACE_*`); no admin UI. |
| Env validation | None centralized; values read ad hoc with `process.env.X || default` in `server/index.mjs`. |
| Test framework | `scripts/verify-*.mjs` (node) for server flows, Vitest in the storefront, `npm run verify:platform`. |
| Integrations to keep unchanged | Mail connector, Paystack, n8n, Google Drive, local Lancee MCP, AI providers, Codex app server, storefront (Saleor), remotion assets. |

## Implementation Checklist

**Existing and reusable**
- Terms/Privacy/Refund pages, landing footer, policy styling (`policy-page`, `landing-footer`).
- SMTP notification pipeline (`server/notifications.mjs`) and branded email shell.
- Paystack draft-invoice flow, webhook, and callback infrastructure.
- Env-driven configuration pattern (`process.env` in `server/index.mjs`, `.env.example`).

**Missing**
- Central, typed business-identity configuration (no single source of truth).
- Legal pages/footers exposing the operating legal entity (Hookitup Pty (Ltd)).
- Documented placeholders for unknown company details (registration, VAT, address, contact emails).

**Partially implemented**
- Email branding (added this task for the footer; templates existed).
- Legal disclosure text (pages exist; company identity was hardcoded/missing).

**External / manual configuration required**
- Company registration number, VAT number, registered address, support/legal/POI emails, VAT registration status — must be set via env by the operator (not invented per the quarantined legal prompt's rule 7).
- Legal review of the Terms/Privacy/Refund copy by the operator's counsel.
- Subscription-billing engine, invoice identity/revenue classification, POPIA compliance administration, and legal-document hosting — not specified in the quarantined legal prompt, tracked as follow-ups.

**Implemented during this task**
- `shared/business.mjs` + `shared/business.d.mts` — canonical typed business identity (`BusinessIdentity` interface), validated env loader, documented defaults/placeholders.
- `src/lib/business.ts` — client typed config (`BUSINESS_IDENTITY`) wired to `VITE_*` env.
- `server/business.mjs` — server mirror reading the same env keys from `process.env`.
- `src/App.tsx` — `PolicyFooter` renders legal entity, registration numbers, and support email on Terms/Privacy/Refund; landing footer now uses the canonical identity.
- `server/notifications.mjs` — email footers now use `businessIdentity` (platform name + legal style).
- `.env.example` — documented `*_/VITE_*` identity variables with defaults.
