# Durable workspace foundation

lancee persists identity, workspace membership, MCP grant state, MCP service
activation, API keys, Idea notes, payment state, n8n delivery state, and
mutation-idempotency records in SQLite.

## Storage

The default database is:

```text
.runtime/lancee.sqlite
```

`.runtime/` is ignored by Git and restricted to the server operator. The
application enforces mode `0600` on the database at startup and enables:

- foreign-key enforcement;
- write-ahead logging;
- full synchronous durability;
- a five-second busy timeout;
- strict SQLite tables.

Set `DATABASE_PATH` to an absolute path or a path relative to the project root
when the database belongs on a separately backed-up volume.

## Schema

| Table | Responsibility |
| --- | --- |
| `users` | Durable identity, display name, email, and scrypt password material |
| `workspaces` | Stable workspace identity and name |
| `workspace_members` | Owner/collaborator membership boundary |
| `mcp_access` | Workspace-scoped bearer request and approval state |
| `mcp_service_state` | Workspace-scoped service activation |
| `api_keys` | Masked key metadata, SHA-256 secret hash, scopes, use and revocation timestamps |
| `idempotency_requests` | Mutation request hash and replayable non-secret response |
| `payment_connections` | Workspace provider status and non-secret credential fingerprint |
| `invoices` | Durable invoice snapshot with immutable provider reference |
| `payment_links` | Idempotent provider initialization and hosted checkout state |
| `payment_events` | Deduplicated normalized webhook outcomes |
| `n8n_connections` | Workspace URL/methods and AES-GCM encrypted signing secret |
| `n8n_deliveries` | Durable outbound/inbound status, correlation, and retry lineage |
| `n8n_nonces` | Workspace-scoped inbound replay protection |
| `idea_notes` | Workspace/board-scoped content with optimistic versions |

The configured administrator is an initial bootstrap identity. On startup,
lancee upserts that identity and ensures an owner membership in
`WORKSPACE_ID`. Authentication and authorization then resolve the user and
membership from the database rather than constructing a hardcoded response.
The environment remains the current password-rotation source until account
management and collaborator invitations are implemented.

Sessions issued before this migration remain valid: the server resolves their
email subject to the new database membership. Newly issued sessions contain
stable user and workspace IDs.

## Idempotent mutations

Durable workspace mutations require:

```http
Idempotency-Key: <8-128 characters>
```

The server scopes the key to the workspace and route, hashes the normalized
request, and stores the response for 24 hours.

- Repeating the same route, key, and payload replays the original logical
  response and sets `Idempotency-Replayed: true`.
- Reusing the key with a different payload returns `409`.
- Omitting or malforming the key returns `400`.
- API-key creation stores only non-secret response data. Its one-time secret is
  deterministically reconstructed for an idempotent retry from the server
  signing secret, workspace, idempotency key, and persisted creation timestamp.

Current idempotent routes:

```text
POST   /api/mcp/access-request
POST   /api/mcp/access/revoke
POST   /api/mcp/services/:serviceId
POST   /api/api-keys
DELETE /api/api-keys/:keyId
POST   /api/ideas/notes
PATCH  /api/ideas/notes/:noteId
POST   /api/n8n/config
POST   /api/n8n/disconnect
POST   /api/n8n/deliveries
POST   /api/n8n/deliveries/:deliveryId/retry
POST   /api/n8n/inbound-self-test
```

Paystack payment-link initialization also requires a stable idempotency key
and retains its request hash alongside the provider state because the external
provider call has a longer, provider-specific recovery lifecycle.

Idea-note edits add optimistic concurrency to idempotency: the request includes
`expectedVersion`, and a stale edit returns `409` with the current server note
for an explicit user decision. See [`OFFLINE_PWA.md`](OFFLINE_PWA.md).

## API keys

API keys are created and managed through authenticated workspace sessions:

```text
GET    /api/api-keys
POST   /api/api-keys
DELETE /api/api-keys/:keyId
```

Creation returns the full `lnc_live_...` value only as the logical creation
response. Lists return a masked identifier. The database stores a SHA-256 hash
of the high-entropy secret, never the secret itself. Revocation is a soft
revocation so audit timestamps remain available.

Supported scopes:

| Scope | Route |
| --- | --- |
| `workspace:read` | `GET /api/v1/workspace` |
| `mcp:read` | `GET /api/v1/mcp/access` |

Each successful bearer-authenticated request updates `last_used_at`. Missing
scopes return `403`; unknown or revoked keys return `401`.

## MCP persistence

Bearer lifecycle state is stored in `mcp_access`. Service choices are stored in
`mcp_service_state`. Revoking access resets the grant to `available` and
deactivates every service for that workspace.

The MCP gateway catalog and tool invocation transport are still placeholders.
This milestone makes the local authorization and selection state durable; it
does not claim that gateway discovery or tool execution is live.

## Verification

Run:

```bash
pnpm build
pnpm lint
pnpm verify:durability
pnpm verify:offline
```

The durability verifier starts lancee twice against a temporary database and
checks:

- database-backed login and owner membership;
- required idempotency keys, successful replay, and payload-conflict handling;
- MCP access and service state after restart;
- API-key hashing, masking, scoping, and `last_used_at`;
- absence of the full secret from the database;
- database mode `0600`;
- API-key persistence and post-restart use;
- revocation enforcement.

The verifier binds a temporary loopback port and removes its temporary database
after completion.

## Operational note

Node.js 22 currently labels `node:sqlite` experimental, so it emits a startup
warning. The persisted file is standard SQLite. Keep the verified Node.js
baseline pinned and run the durability verifier when upgrading Node.
