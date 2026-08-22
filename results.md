Implemented Phase 2 Connected Intelligence on `feature/workspace-pulse-home`.

Key outcomes:

- Existing IMAP/SMTP Mail transport preserved.
- Inbound sync and accepted outbound sends now emit idempotent communication events.
- Added workspace-scoped Person identity shared by Mail and Calendar.
- Added conservative Client resolution and confirmed thread→Project linking.
- Added deterministic communication features.
- Added cross-source `client_attention_load`.
- Reused `workspace_events` and `connected_opportunities`.

Schema changes:

- `connected_people`
- `communication_messages` — metadata only; no bodies or credentials
- `communication_thread_links`

API changes:

- `GET /api/connected-intelligence/communication-features`
- `GET /api/connected-intelligence/clients/:id/attention-load`
- `POST /api/mail/messages/project-link`
- Opened Mail messages now include their resolved relationship.

The Mail reader received a small project selector for observed threads. Inbox, search, folders, refresh, reply, SMTP, IMAP, and automation behavior were not redesigned.

Identity and relationships:

- Emails are case-normalized and workspace scoped.
- Exact Person and Client email matches only.
- Ambiguous Client matches remain unresolved.
- Projects require explicit confirmation.
- Confirmed thread relationships are inherited by subsequent messages.
- Subject text and AI are never used to infer projects.

Detector calculation:

- Compares the client’s message, thread, and completed meeting-minute percentiles.
- Uses other sufficiently observed clients in the workspace.
- Requires at least three comparison clients.
- `attention_index` is the mean of the three percentile ranks.
- Opportunities require an index above `0.75`.
- Active opportunities deduplicate and resolve when normalized.

Fixture example:

```text
detector: client_attention_load
status: opportunity
messages: 8
threads: 6
meetings: 4
meeting minutes: 630
comparison clients: 3
attention index: 1
confidence: 0.725
```

Phase 1 review confirmed `Ready` is the repository’s completed project state. Zero-meeting Ready projects remain in the baseline, with incomplete Calendar coverage documented as a confidence limitation.

Verification:

| Check | Result |
| --- | --- |
| Connected Intelligence | PASS |
| Signal Engine | PASS |
| Decision Dynamics | PASS |
| Decision Phase 2 | PASS |
| Decision Phase 3 | PASS |
| MCP | PASS |
| Mail connector | PASS |
| Mail automation | PASS |
| Production build | PASS |
| TypeScript | PASS |
| Lint | PASS, existing warnings only |
| `git diff --check` | PASS |
| Failed | None |
| Not run | None required |
| Environment blocked | None |

Changed files:

- [server/connected-intelligence.mjs](/home/apps/agent-app/server/connected-intelligence.mjs)
- [server/database.mjs](/home/apps/agent-app/server/database.mjs)
- [server/index.mjs](/home/apps/agent-app/server/index.mjs)
- [server/mail.mjs](/home/apps/agent-app/server/mail.mjs)
- [scripts/verify-connected-intelligence.mjs](/home/apps/agent-app/scripts/verify-connected-intelligence.mjs)
- [src/lib/api.ts](/home/apps/agent-app/src/lib/api.ts)
- [MessagesPage.tsx](/home/apps/agent-app/src/components/dashboard/MessagesPage.tsx)
- [messages-page.css](/home/apps/agent-app/src/components/dashboard/messages-page.css)
- [docs/CONNECTED_INTELLIGENCE.md](/home/apps/agent-app/docs/CONNECTED_INTELLIGENCE.md)
- [README.md](/home/apps/agent-app/README.md)
- [changelog_20260822_174909.md](/home/apps/agent-app/changelog_20260822_174909.md)

Known limitations include no historical mailbox backfill, conservative standalone threads when reply headers are absent, and deferred response-time and semantic body analysis.

Phase 3 recommendation is documented: connect authoritative Time, Invoice, Payment, and Revenue evidence before making client value or profitability claims.
