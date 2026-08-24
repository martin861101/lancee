# Connected Intelligence

This document describes the production Connected Intelligence path across
Calendar and Mail: shared Person/Client/Project identity → workspace events →
deterministic features → evidence-backed coordination opportunities.

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

Existing Mail (IMAP/SMTP)
    ↓
metadata-only communication observation
    ↓
shared Person → Client → confirmed Project
    ↓
workspace_events (communication.received / communication.sent)
    ↓
communication features + meeting features
    ↓
client_attention_load → connected_opportunities
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
| `GET` | `/api/connected-intelligence/summary` | Read workspace record counts and authoritative Client → Project record relationships |

Calendar creation requires the existing `Idempotency-Key` mutation header.

## Mail as an authoritative source

The working Lancee Mail feature remains unchanged at its transport boundary:
`server/mail.mjs` reads live folders/messages through IMAP and sends through
SMTP. Connected Intelligence does not add a connector, provider API, mailbox
copy, or body store.

Instrumentation occurs at two narrow authoritative points:

- after a new Inbox message has been fetched successfully and before the IMAP
  sync cursor advances: `communication.received`
- after SMTP accepts an outbound message: `communication.sent`

`communication_messages` stores only the provider-neutral metadata needed for
intelligence: workspace, source mailbox, message/thread identity, direction,
addresses, subject, timestamp, resolved entity IDs, folder/UID fallback
provenance, and the canonical workspace-event ID. Bodies, attachment content,
credentials, tokens, and raw provider payloads are not copied.

Message identity uses the provider `Message-ID`. If it is absent, the scoped
folder/UID pair is the fallback. A unique workspace/source-account/message key
claims the observation before its workspace event is written, so repeated IMAP
polling emits one event. SMTP message IDs receive the same treatment.

Reliable `References`/`In-Reply-To` headers identify a reply thread. Otherwise
the message ID is its standalone thread. Because arbitrary chronology is not a
reliable conversation model for all providers, response-time features are
deferred.

## Person and client identity

`connected_people` is the smallest shared identity layer. It stores a
workspace-scoped, case-normalized email, optional display name, optional client
relationship, provenance, and timestamps. Mail participants and Calendar
attendee emails resolve through the same table and therefore produce the same
Person ID inside one workspace.

Resolution is deterministic:

1. retain an existing explicit Person relationship
2. match an existing Person by exact canonical email
3. for a new Person, link only when exactly one workspace Client has that exact
   email
4. otherwise leave the Person and communication client unresolved

Names and domains are never fuzzy-matched. Duplicate client-email matches are
ambiguous. Every lookup includes `workspace_id`; the same email in another
workspace creates a different Person and cannot inherit a client relationship.

Calendar continues storing its original bounded attendee strings for display,
but meeting workspace events now reference the shared Person IDs. No Calendar
UI redesign was required.

## Project relationships

Project assignment is confirmation-only. The authenticated Mail reader exposes
a small project selector for an already observed message. Confirmation creates
one workspace/source-account/thread link with the confirming user and
`manual_confirmation` provenance. Existing and subsequent observations in that
thread inherit the confirmed project and its client. Prior thread events are
updated to carry the same confirmed relationship.

Projects are validated in the authenticated workspace. Subject text, client
ownership, names, and AI output never infer a project. A message not yet seen by
the authoritative Inbox ingestion path cannot be linked from the reader.

## Communication features

Only metadata rows joined to a real `communication.received` or
`communication.sent` workspace event enter features.

Per project and client the service calculates message count, inbound/outbound
counts, distinct thread count, participant count, distinct UTC communication
days, average messages per thread, related-project count, and evidence-event
IDs. Per Person it calculates message count, thread count, and last
communication timestamp. Response-time metrics are not emitted because a
provider-neutral reliable reply chronology is not yet guaranteed.

## Client attention detector

Detector key: `client_attention_load`

Policy version: `client-attention-load-v1`

For one client, the detector combines:

- Mail message percentile
- Mail thread percentile
- completed Calendar meeting-minute percentile

Each percentile is calculated against other clients in the same workspace that
have at least one observed message or completed meeting. The transparent
`attention_index` is the arithmetic mean of the three percentile ranks.

- fewer than three comparison clients: `insufficient_evidence`
- attention index at or below 0.75: `normal`
- attention index above 0.75 with observed activity: `opportunity`

Confidence grows deterministically with comparison sample size and receives a
small cross-source increase when both Mail and Calendar evidence exist. The
detector reports raw observed values, medians, percentile components, sample
IDs, confidence, and authoritative event references. It makes no profitability,
waste, or client-value claim.

Active results upsert into the existing `connected_opportunities` table under
the client subject. Repeated runs update the same row, dismissed rows remain
dismissed, and a normal result resolves an active opportunity.

## Evidence, privacy, and Signal Engine

Communication evidence references canonical workspace events; Calendar
evidence references `meeting.completed`. Evidence reads and detector routes use
the authenticated workspace context. Stable source identifiers are hashed and
cannot select data outside that context.

Normal connected-communication authorization still requires the workspace's
active Mail account. The synthetic benchmark has one narrow exception: a
`connection_id = fixture` event is accepted only for a workspace carrying the
exact Connected Intelligence fixture marker. Event payloads contain only thread
identity, direction, and subject and pass through the existing sensitive-key
sanitizer. IMAP/SMTP secrets never enter Person, communication, event, feature,
evidence, or opportunity records.

Signal Engine compatibility is preserved: `communication.*` remains an
intelligence-relevant prefix. Ordinary metadata-only events are activity. The
existing bounded decision-language gate remains separate and is not replaced.

## Limitations and extension points

- IMAP coverage begins at the stored sync cursor; Phase 2 does not backfill the
  whole mailbox.
- Missing reply headers create standalone threads, so thread counts can be
  conservative and response-time metrics are deferred.
- Client resolution supports exact client/contact email only; unresolved and
  ambiguous identities require explicit future confirmation tooling.
- The Phase 1 `Ready` project state is the repository's completed lifecycle
  state and remains its historical baseline. Ready projects with zero meetings
  remain included, but Calendar has no coverage-start marker, so those zeroes
  are a documented confidence limitation.

Future semantic mail intelligence must follow:

```text
Authoritative Message metadata/body at source
    ↓
Derived Semantic Signal
    ↓
source message reference + model/version + confidence
    ↓
Connected Intelligence evidence gate
```

It must not overwrite authoritative identity or relationships. Scope changes,
sentiment, complaints, urgency, objections, approvals, body analysis, and
semantic project inference are not implemented in Phase 2.

Phase 3 should connect authoritative Time, Invoice, Payment, and Revenue
evidence to measured attention and delivery. Only then can Lancee evaluate a
client value/attention relationship; Phase 2 does not manufacture financial
claims.

## Phase 2 API

All routes require the authenticated workspace session.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/connected-intelligence/communication-features` | Read communication aggregates and evidence |
| `GET` | `/api/connected-intelligence/clients/:id/attention-load` | Evaluate client coordination attention |
| `GET` | `/api/connected-intelligence/summary` | Read workspace record counts and authoritative relationship map data |
| `POST` | `/api/mail/messages/project-link` | Confirm an observed thread/project relationship |

Opening an IMAP message also returns its optional resolved relationship.

## Verification

```bash
npm run verify:connected-intelligence
npm run verify:signals
npm run verify:dynamics
```

The focused verification covers Mail observation/event idempotence, canonical
Person identity, exact and ambiguous client resolution, tenant isolation,
Calendar/Mail identity reuse, confirmed thread/project inheritance,
communication and meeting aggregates, insufficient/normal/abnormal client
attention, cross-source evidence, opportunity deduplication/resolution, Phase 1
meeting load, and Signal Engine compatibility.

## Synthetic historical benchmark

The versioned benchmark described in
[`test-data/connected-intelligence/README.md`](../test-data/connected-intelligence/README.md)
imports `business-records.xlsx` into a dedicated `Connected Intelligence Test`
workspace. `business-records.v1.json` retains stable fixture references and
separate expected positive/negative results. The comparator never exposes those
expectations to either detector and never inserts expected opportunities.

Fixture reset is authorized by `workspace_fixture_markers`, not the workspace
name. The exact purpose, dataset, version, source hash, owner, and owner
membership must match before the importer deletes the resolved workspace ID.
The importer uses marker-authorized `fixture/import` communication observations
instead of creating a Mail account, keeping the IMAP/SMTP poller and all
external providers outside the fixture path.

Narrow authoritative tables retain source quote, time, payment, approval, and
change records that existing Lancee models could not represent. Historical
invoice/project/task columns preserve issue/start/end/due/value/provenance data.
They are ordinary workspace-scoped records and cascade only with their fixture
workspace. Future detectors may consume these records, but none are implemented
or changed by the fixture work.

```bash
npm run fixture:ci
npm run seed:ci -- --dry-run
npm run seed:ci
npm run benchmark:ci
npm run seed:ci -- --reset
npm run verify:ci-fixture
```
