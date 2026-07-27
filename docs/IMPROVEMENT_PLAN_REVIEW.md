# Improvement plan review

Reviewed on 2026-07-26 against the current source, product vision, platform
notes, integration contract, getting-started guide, and changelog history.

## Decision

The plan's main conclusion is correct: close the live-versus-placeholder gaps
before adding the proposed differentiating features. Durable workspace records,
real provider behavior, honest status reporting, and secure server boundaries
are prerequisites for the later product loops.

Two sequencing details required correction:

1. Paystack's normal API authentication uses a server-side secret key. The
   current single-workspace implementation should not be designed around an
   assumed OAuth flow. Multi-merchant onboarding can be selected later if the
   intended Paystack partner model is confirmed.
2. Offline mutation queuing should follow durable server records and stable
   mutation identifiers. Queueing writes against in-memory placeholder
   contracts would create conflict and replay behavior with no authoritative
   reconciliation target.

The revised order is therefore durable domain foundations, one real Paystack
flow, durable n8n delivery, and then offline/PWA behavior.

## Durable foundation completed

The first revised milestone was completed on 2026-07-26:

- SQLite-backed users, workspaces, and owner/collaborator memberships;
- stable user/workspace session claims with legacy-session migration;
- workspace-scoped MCP grants and service activation;
- hashed, scoped, one-time API-key creation with `last_used_at` and revocation;
- route/workspace-scoped idempotency records for durable mutations;
- automated restart, replay, hashing, permission, and revocation verification.

See [`DURABLE_FOUNDATION.md`](DURABLE_FOUNDATION.md).

## Paystack depth-first flow completed

The second revised milestone was completed on 2026-07-26:

- environment-backed Paystack test/live configuration with no browser secret;
- workspace-scoped connection status with a non-secret key fingerprint;
- durable ZAR invoices and hosted checkout links;
- idempotent transaction initialization and immutable provider references;
- raw-body HMAC-SHA512 webhook verification;
- exact reference, amount, currency, and success-state reconciliation;
- duplicate event handling and restart persistence;
- an explicit Money flow that creates a link without sending or charging.

See [`PAYSTACK.md`](PAYSTACK.md).

## Durable n8n bridge completed

The third revised milestone was completed on 2026-07-26:

- workspace-scoped URL/method configuration and AES-256-GCM encrypted secret;
- HTTPS, exact allowed origin, public-DNS, no-redirect, and timeout policy;
- canonical timestamp/nonce/method/path/body HMAC-SHA256 signatures;
- real outbound GET and POST delivery;
- real inbound GET and POST verification with one-use nonce storage;
- durable success/failure/accepted attempt history;
- linked manual retries with a stable correlation ID and five-attempt limit;
- disconnect credential removal and restart persistence.

Verified inbound events are recorded but not yet dispatched into a persisted
automation engine. See [`N8N.md`](N8N.md).

## Offline/PWA milestone completed

The fourth revised milestone was completed on 2026-07-26:

- production manifest and service-worker install support;
- static shell caching with an explicit `/api/` cache exclusion;
- last-workspace and per-board Idea-note snapshots in IndexedDB;
- durable, versioned, workspace-scoped Idea quick notes on the server;
- local create/edit persistence before network I/O;
- stable idempotency keys retained through reconnect and lost responses;
- foreground reconnect and supported Background Sync handoff;
- visible `409` conflict state with **Use server** and **Keep mine** choices;
- explicit exclusion of payments, credentials, grants, configuration, and
  provider deliveries from offline queuing;
- local data removal on explicit sign-out.

The wider visual canvas and future task/milestone records remain outside the
offline boundary until they have authoritative durable server models. See
[`OFFLINE_PWA.md`](OFFLINE_PWA.md).

## Change applied

The automation naming cleanup was safe to apply immediately and required no
external credentials or unresolved data-model decisions:

- `Agent` and `AgentStatus` became `Automation` and `AutomationStatus`.
- Run references now use `automationId` and `automationName`.
- `mockApi.agents` became `mockApi.automations`.
- Seed identifiers now use the `aut_` prefix.
- React state, handlers, component names, props, and CSS selectors now use
  automation terminology.
- The platform replacement map now specifies `/v1/automations` routes.

The public `agents.hygridtech.co.za` hostname and legacy PM2 process name were
intentionally left unchanged because they are deployment identifiers, not
domain-model terminology.

## Provider references

- Paystack authentication:
  <https://paystack.com/docs/api/authentication/>
- Paystack transaction initialization:
  <https://paystack.com/docs/api/transaction/>
- Paystack webhook verification:
  <https://paystack.com/docs/payments/webhooks/>
