# Connected Intelligence

This document describes the first production Connected Intelligence slice:
Calendar → Project → Client → workspace event → meeting features → project
meeting-load opportunity.

Lancee remains the source of truth. Hermes is not used to create durations,
aggregates, detector metrics, confidence, or evidence.

## Architecture

```text
Calendar event
    ↓
calendar_events (workspace-scoped authoritative record)
    ↓
workspace_events (meeting.created / meeting.completed)
    ↓
deterministic meeting features
    ↓
project_meeting_load detector
    ↓
connected_opportunities
```

The implementation reuses `server/workspace-events.mjs`; there is no second
event bus, activity ledger, Signal Engine, graph store, or AI ingestion path.
Existing `decision_*` tables and services remain internal Decision Dynamics
components and were not renamed.

## Calendar records

`calendar_events` stores:

- workspace and creator
- optional project and client relationships
- title and calendar kind (`meeting` or `deadline`)
- start and end timestamps
- deterministic duration derived from those timestamps
- status (`scheduled`, `completed`, or `cancelled`)
- participant references
- source and source identifier
- canonical creation/completion workspace-event IDs
- completion and audit timestamps

All reads and writes include `workspace_id`. A linked project must be found in
the authenticated workspace. When the project has a client, that client is
derived from `projects.client_id`; a mismatched client is rejected. A standalone
client link is also checked within the authenticated workspace.

The Dairy UI now reads and creates server records. Selecting a project derives
and displays its client. Persisted project/client names and IDs return with the
calendar event so the relationship can be inspected in the calendar and
upcoming-meeting list.

Browser-only entries from the former `lancee:dairy:<workspaceId>` local-storage
key are not imported because the server cannot treat browser tenant identifiers
as authoritative. New entries use the server API.

## Workspace events and completion

Creating a meeting records one `meeting.created` event with:

- `entity_type = meeting`
- the calendar event ID
- validated project/client IDs
- participant references
- `source_channel = calendar`
- title, start, end, duration, meeting type, and source in the sanitized payload

Meeting completion reuses the existing Lancee scheduler. Once per minute it
claims scheduled meetings whose `end_at` has passed and records one
`meeting.completed` event. The calendar status update, workspace-event insert,
and `completion_event_id` update are in one transaction. The conditional claim
and unique completion-event relationship make retries idempotent.

Authenticated calendar/feature reads also complete overdue meetings so data is
current after a scheduler interruption.

## Deterministic features

Only completed calendar meetings joined to a real `meeting.completed`
workspace event enter the feature layer.

The service exposes:

- `meeting_duration_minutes` for each meeting
- per-project meeting count, total minutes, and average minutes
- per-client meeting count, total minutes, and average minutes
- `meetingMinutesPerProject`
- `meetingMinutesPerClient`
- the completion workspace-event IDs used as evidence

Every query is workspace scoped. No cross-workspace row can enter an aggregate.

## Project meeting-load detector

Detector key: `project_meeting_load`

Policy version: `project-meeting-load-v1`

The detector compares the selected project's completed meeting minutes with all
other projects in the same workspace whose current status is `Ready` (the
repository's completed-project state).

- Fewer than three completed projects: `insufficient_evidence`
- At or below the workspace's completed-project 75th percentile: `normal`
- Above the 75th percentile: `opportunity`

The result includes the sample size, median, 75th percentile, absolute and
percentage difference, deterministic confidence, and real completion-event
references. It does not use a universal hours threshold.

An opportunity is stored in `connected_opportunities`, not in `decisions`.
The unique workspace/detector/subject key makes repeated detection update the
same record. Dismissed opportunities stay dismissed; a resolved condition can
become active again if it recurs.

## API

All routes require the authenticated workspace session.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/calendar/events` | List persisted workspace calendar events |
| `POST` | `/api/calendar/events` | Create an idempotent calendar event |
| `GET` | `/api/connected-intelligence/meeting-features` | Read deterministic meeting features and evidence |
| `GET` | `/api/connected-intelligence/projects/:id/meeting-load` | Evaluate one project without fabricating evidence |
| `GET` | `/api/connected-intelligence/opportunities` | List persisted opportunities; defaults to active |

Calendar creation requires the existing `Idempotency-Key` mutation header.

## Phase 2: mail connection map

Current mail behaviour:

- `server/mail.mjs` reads IMAP messages live and sends SMTP messages.
- `syncMailWorkspace` polls new Inbox UIDs and advances
  `mail_accounts.last_seen_uid`.
- Incoming messages can claim `mail_rule_events`, trigger a Core automation,
  and create a notification.
- Sent messages create a notification.
- Mail messages and conversations are not currently persisted as authoritative
  workspace entities.
- Mail send/sync does not currently record `communication.sent` or
  `communication.received` in `workspace_events`.

Phase 2 should:

1. Add a small workspace-scoped communication/conversation persistence model
   using provider message ID plus mailbox/folder/UID as idempotent provenance.
2. Record `communication.received` during successful Inbox ingestion and
   `communication.sent` after accepted SMTP send, using
   `recordWorkspaceEvent`.
3. Use `connection_id = mail`, `source_channel = email`, a stable provider
   message identifier, timestamp, and permitted participant references so the
   existing connected-communication authorization boundary remains active.
4. Resolve client candidates deterministically from exact participant email or
   verified domain matches. Ambiguous matches must remain unlinked.
5. Link a project only through explicit user association, an existing
   conversation/thread relationship, or another authoritative workspace
   relationship. Do not guess a project from message text.
6. Persist `conversation_id`/thread provenance so later events in the same
   provider thread can reuse confirmed client/project links.
7. Send only bounded decision-language candidates to the existing Signal
   Engine semantic stage; ordinary mail remains authoritative activity without
   an unnecessary Hermes call.

Phase 2 must not store mailbox passwords, OAuth tokens, full private provider
payloads, or unrelated attachment content in `workspace_events`.

## Verification

```bash
npm run verify:connected-intelligence
npm run verify:signals
npm run verify:dynamics
```

The focused verification covers tenant-scoped calendar relationships,
canonical creation/completion events, completion idempotence, duration and
aggregates, insufficient history, abnormal load, evidence provenance,
opportunity idempotence, cross-workspace isolation, and Signal Engine
compatibility.
