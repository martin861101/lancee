# PWA and offline Idea notes

lancee is installable as a progressive web app and provides a deliberately
narrow offline workflow for quick notes on the Ideas canvas.

## Supported offline boundary

| Capability | Offline behavior |
| --- | --- |
| Application shell | Cached after the first successful production load |
| Last workspace identity | Cached only to reopen the local shell |
| Idea quick-note reads | Last workspace/board snapshot is read from IndexedDB |
| Idea quick-note creates and edits | Optimistically stored, then queued in IndexedDB |
| Payments and payment links | Online only; never queued |
| API-key, MCP, n8n, and connection changes | Online only; never queued |
| API responses | Never stored by the service worker |

The cached identity is a display snapshot, not an authentication credential.
The signed session remains an `HttpOnly` cookie. Reconnect sync still requires
the server session to be valid; if it has expired, queued work stays local until
the user signs in again.

Explicit sign-out clears the cached identity, Idea snapshots, and queued
mutations from IndexedDB.

## Install behavior

`public/manifest.webmanifest` defines the standalone application identity,
colors, scope, and icon. `public/sw.js` installs only in production builds and:

- precaches the HTML shell and the hashed CSS/JavaScript assets discovered from
  the built page;
- uses a network-first navigation strategy with an offline shell fallback;
- caches same-origin static GET assets;
- bypasses every `/api/` request and every non-GET request;
- removes previous `lancee-shell-*` cache versions during activation.

PWA installation requires HTTPS in production (or localhost for development)
and one successful online load before the shell is available offline. Install
from the browser's application/install control.

## Durable Idea-note model

Quick notes are stored in the workspace-scoped `idea_notes` table:

| Field | Purpose |
| --- | --- |
| `id` | Client-generated UUID retained across retries |
| `workspace_id`, `board_id` | Cache and authorization boundary |
| `content` | Trimmed note text, limited to 500 characters |
| `version` | Monotonic optimistic-concurrency version |
| `created_by` | Authenticated creator |
| `created_at`, `updated_at` | Server timestamps |

Routes:

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/api/ideas/notes?boardId=...` | Authenticated workspace read |
| POST | `/api/ideas/notes` | Session + stable `Idempotency-Key` |
| PATCH | `/api/ideas/notes/:noteId` | Session + stable key + `expectedVersion` |

## Queue and reconnect behavior

The browser commits the local note and queue record to IndexedDB before trying
the network. Each mutation retains its body and idempotency key. A lost response
can therefore be retried without creating a second note or applying an edit
twice.

The queue flushes:

- immediately after a local write when online;
- on the browser `online` event;
- when an authenticated workspace is restored;
- after a supported Background Sync event asks an open lancee client to flush.

HTTP `5xx`, network failure, or expired authentication leaves the mutation
queued. A permanent client rejection is surfaced for review rather than
dropped silently.

## Conflict handling

Edits send the version they were based on. The server updates only when
`expectedVersion` equals the current row version. Otherwise it returns `409`
with the current server note.

The Ideas canvas then offers an explicit choice:

- **Use server** removes the queued mutation and restores the current server
  version.
- **Keep mine** issues a new mutation and idempotency key based on the returned
  server version.

This is deliberate last-writer resolution; the queue never overwrites a newer
server note automatically.

## Local-data note

IndexedDB data is scoped by workspace but is not encrypted by lancee. Use the
operating system's device encryption and account lock on shared or portable
devices. Do not use the Idea quick-note field for credentials or regulated
secrets.

The broader visual board, attachments, projects, and automations are not yet
offline domain records. This milestone provides the proven shell, queue, and
conflict contract that those records can adopt later.

## Verification

```bash
pnpm build
pnpm lint
pnpm verify:offline
node --check public/sw.js
```

The verifier checks the install manifest, service-worker API exclusion,
authenticated durable note creation, idempotent replay, version conflicts,
deliberate resolution, and process-restart persistence against a temporary
SQLite database.
