# lancee Platform Notes

## Architecture

The platform is intentionally split into two layers:

1. `src/App.tsx` owns presentation, navigation, local view state, feedback, and
   user interactions.
2. `src/lib/mockApi.ts` owns remaining placeholder contracts and seeded domain
   data while routing durable authentication, MCP state, and API-key actions to
   Express.
3. `src/lib/offlineStore.ts` and `src/lib/ideasRepository.ts` own the
   workspace-partitioned IndexedDB snapshots, queued Idea mutations, reconnect
   sync, and conflict resolution.
4. `server/database.mjs` owns the SQLite schema and workspace-scoped durable
   repositories.

The UI never depends on a specific database or authentication vendor. Production services can replace the mock methods incrementally as long as they retain the exported TypeScript shapes.

## Backend replacement map

| Placeholder method | Suggested production action |
| --- | --- |
| `auth.session` | Implemented: restore the signed `HttpOnly` session |
| `auth.signIn` | Implemented: verify the scrypt password and issue a secure session |
| `auth.signOut` | Implemented: expire the session cookie |
| `automations.list` | `GET /v1/automations` |
| `automations.create` | `POST /v1/automations` |
| `automations.toggle` | `PATCH /v1/automations/:id/status` |
| `runs.list` | `GET /v1/runs` |
| `runs.dispatch` | `POST /v1/runs` |
| Idea quick-note reads | Implemented: `GET /api/ideas/notes?boardId=...` |
| Idea quick-note creates | Implemented: idempotent `POST /api/ideas/notes` |
| Idea quick-note edits | Implemented: versioned `PATCH /api/ideas/notes/:id` |
| `money.paystackStatus` | Implemented: `GET /api/money/paystack/status` |
| `money.invoices` | Implemented: `GET /api/money/invoices` |
| `money.createPaystackPaymentLink` | Implemented: `POST /api/money/paystack/payment-links` |
| Paystack reconciliation | Implemented: `POST /api/webhooks/paystack` |
| `integrations.list` | `GET /v1/integrations` |
| `integrations.toggle` | Start OAuth connection or revoke an existing grant |
| `n8n.configure` | Implemented: persist URL/methods and AES-GCM encrypted secret |
| `n8n.trigger` | Implemented: signed, timeout-bounded GET/POST with durable attempts |
| `n8n.retry` | Implemented: linked manual retry with stable correlation ID |
| n8n inbound callback | Implemented: timestamped HMAC and persisted nonce replay protection |
| `mcp.requestAccess` | Implemented: idempotent workspace-scoped bearer request |
| `mcp.sync` | Discover runtime capabilities from `https://mcp.hygridtech.co.za/api/v1/capabilities` |
| `mcp.toggleService` | Implemented: persist workspace service activation |
| `mcp.invoke` | Call `POST /api/v1/tools/{tool_id}/call` from the backend |
| `mcp.revokeAccess` | Implemented: idempotently revoke the grant and deactivate services |
| `apiKeys.list` | Implemented: `GET /api/api-keys` with masked values only |
| `apiKeys.create` | Implemented: `POST /api/api-keys`; return the secret once |
| `apiKeys.revoke` | Implemented: `DELETE /api/api-keys/:keyId` |

## Authentication

The public landing page renders before login. The client bootstraps
`GET /api/auth/session` before showing protected content. The current
administrator is verified on the Express backend with a scrypt password hash,
then receives a signed, expiring, `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
Login rate limiting and origin checks are enabled.

Firebase is deferred until self-service identity features are needed. At that
point, Firebase should authenticate identity while lancee continues to own
workspace membership, roles, grants, and the application session.

See [`AUTH_AND_NOTIFICATIONS.md`](AUTH_AND_NOTIFICATIONS.md).

When the API is unreachable, the client may restore only the last display
identity and previously cached Idea quick notes. The identity snapshot is not a
session credential, and explicit sign-out clears all lancee IndexedDB stores.

## API-key behavior

Created keys have two separate values:

- A masked prefix retained for future display.
- A full secret shown only in the creation dialog.

The backend hashes high-entropy secrets at rest, lists masked values only,
scopes keys to a workspace and explicit permissions, records last-used
timestamps, and retains revocation timestamps. The creation response is the
only logical response containing the full value; an idempotent retry can replay
that same response without storing the plaintext secret.

## Integration grants

Standard integration cards still toggle an in-memory connection state. n8n and
MCP have dedicated typed flows:

- n8n supports signed GET and POST tests in both directions. Its outbound DNS webhook is deliberately entered manually in the platform.
- MCP is included in every workspace. Bearer requests and selected-service
  activation are durable; catalog discovery and tool invocation remain
  placeholders pending the live DNS-gateway transport.
- MCP credentials and predefined provider keys stay on the server. The browser receives service metadata and normalized results only.
- The MCP source and operational configuration remain in `/home/apps/mcp`; lancee does not edit that repository.

See [`INTEGRATIONS.md`](INTEGRATIONS.md) for the route and security details.
See [`DURABLE_FOUNDATION.md`](DURABLE_FOUNDATION.md) for the schema and
idempotency contract.
See [`PAYSTACK.md`](PAYSTACK.md) for payment initialization and webhook
reconciliation.
See [`N8N.md`](N8N.md) for the canonical signature and delivery lifecycle.

## Offline boundary

The production service worker caches the static application shell and never
caches `/api/` traffic. IndexedDB is used separately for the last workspace
identity, Idea-note snapshots, and an idempotent create/edit queue. Server
versions provide optimistic conflict detection; the user chooses whether to
restore the server note or intentionally resubmit the local value.

Payments, credentials, grants, integration configuration, and provider
deliveries are excluded from the queue. See
[`OFFLINE_PWA.md`](OFFLINE_PWA.md).

## UX states covered

- Initial data skeletons
- Disabled and loading actions
- Success toasts
- Active, paused, draft, running, completed, and failed states
- Empty API-key state
- One-time credential reveal
- Desktop, tablet, and mobile navigation
- Command palette and escape-key dismissal
- Reduced-motion preference
- Offline shell and cached Idea-board state
- Queued, synced, and explicit conflict-resolution states
