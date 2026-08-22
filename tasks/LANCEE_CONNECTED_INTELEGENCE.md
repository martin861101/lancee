You are implementing the first production slice of Lancee Connected Intelligence.

Repository:
martin861101/lancee

IMPORTANT:
Do not redesign Lancee from scratch.
Do not create a second event bus, activity ledger, intelligence database, graph system, or duplicate signal engine.

The repository ALREADY contains important intelligence infrastructure.

Before changing code, inspect at minimum:

- AGENT.md
- server/database.mjs
- server/workspace-events.mjs
- server/signal-engine.mjs
- server/decision-dynamics.mjs
- server/decision-learning.mjs
- server/decision-semantic-assessor.mjs
- server/decision-taxonomy.mjs
- server/lancee-mcp.mjs
- server/workspace-builder.mjs
- current Calendar implementation
- current Projects implementation
- current Clients implementation
- current Mail implementation
- invoice/payment implementation
- relevant API routes
- existing verification scripts
- lancee_ai/SIGNAL_ENGINE.md

FIRST TASK: AUDIT

Before implementing anything, determine:

1. How Calendar events are currently stored/fetched.
2. Whether Calendar records currently support project/client relationships.
3. Where Calendar CRUD occurs server-side.
4. Whether Calendar currently emits workspace events.
5. How projects and clients are persisted and referenced.
6. How mail is currently ingested.
7. Which existing project/client/invoice/payment actions already emit
   workspace events.
8. How workspace events enter the Signal Engine.
9. Which parts of Decision Dynamics can be reused for Connected Intelligence.
10. Which existing "decision intelligence" names are internal implementation
    names that can safely remain for now versus user-facing terminology.

Do not perform a broad rename of Decision Intelligence in this phase.

========================================================
PRODUCT DIRECTION
========================================================

Lancee is evolving from "Decision Intelligence" toward:

CONNECTED INTELLIGENCE

Product idea:

"Your work knows more than you think."

Calendar, mail, projects, clients, tasks, files, invoices, payments,
time and future integrations are not isolated features.

They are sources of observations about how work happens.

Lancee connects those observations and finds useful relationships,
patterns, risks and opportunities.

The target pipeline is conceptually:

WORKSPACE SOURCES
    ↓
WORKSPACE EVENTS / ACTIVITY LEDGER
    ↓
ENTITY + RELATIONSHIP CONTEXT
    ↓
DERIVED FEATURES
    ↓
DETECTORS
    ↓
EVIDENCE / CONFIDENCE GATE
    ↓
OPPORTUNITY
    ↓
PULSE / UI
    ↓
HERMES ACTION
    ↓
OUTCOME
    ↓
LEARNING

The repository already implements portions of this pipeline.

EXTEND THEM.
DO NOT DUPLICATE THEM.

========================================================
PHASE 1 IMPLEMENTATION
CALENDAR → PROJECT → CLIENT → ACTIVITY LEDGER
========================================================

The goal of this phase is NOT to build the entire Connected
Intelligence engine.

The goal is to make Calendar a trustworthy intelligence source.

A meeting/calendar event should be capable of being related to:

- workspace
- project
- client
- participants
- source/integration
- start/end timestamps
- duration
- status

Prefer using existing project/client identifiers and patterns.

If the current Calendar schema lacks project_id/client_id, add them
using the repository's existing migration/database conventions.

Relationships must be workspace scoped.

Never allow a project/client from another workspace to be linked.

Where practical, validate that a linked project/client exists.

========================================================
WORKSPACE EVENTS
========================================================

Reuse:

server/workspace-events.mjs

Do NOT introduce a competing canonical-event implementation.

The existing taxonomy already contains:

meeting.created
meeting.completed

Use these.

Determine whether meeting.updated is necessary.

If Calendar editing requires representing meaningful changes and the
taxonomy currently cannot represent them safely, add:

meeting.updated

Do so centrally in the existing taxonomy.

When an authoritative Calendar operation occurs, record the
corresponding workspace event.

Example conceptual event:

eventType: meeting.created
entityType: meeting
entityId: <calendar event id>
clientId: <linked client or null>
projectId: <linked project or null>
participantRefs: [...]
sourceChannel: calendar
sourceIdentifier: <provider/source identifier>
payload:
{
    title,
    startAt,
    endAt,
    durationMinutes,
    meetingType,
    source
}

Follow existing recordWorkspaceEvent conventions.

Do not store authentication tokens, credentials or unnecessary
private provider payloads in workspace_events.

Preserve the sanitisation/provenance guarantees already implemented
by workspace-events.mjs.

========================================================
MEETING COMPLETION
========================================================

We need meeting.completed because duration is useful Connected
Intelligence evidence.

Determine the safest mechanism given the existing architecture.

Do NOT introduce a heavy scheduler just for this task if one already
exists elsewhere.

A completed meeting event must be idempotent.

The same calendar event must not generate repeated
meeting.completed observations.

Persist or derive sufficient information to guarantee this.

========================================================
DERIVED MEETING FEATURES
========================================================

Implement a small deterministic feature layer for meetings.

Do NOT use Hermes/LLMs for arithmetic.

At minimum derive or make queryable:

meeting_duration_minutes

Per project:

meeting_count
meeting_minutes_total
meeting_minutes_average

Per client:

meeting_count
meeting_minutes_total

Where existing data architecture makes it sensible, also expose:

meeting_minutes_per_project
meeting_minutes_per_client

Do not prematurely build a giant generic feature store.

Prefer a small reusable service/query layer that can later be
expanded.

Suggested module naming is acceptable, but inspect conventions first:

server/connected-intelligence/
server/intelligence/
server/features/

Choose whichever best matches the repository.

========================================================
FIRST CONNECTED INTELLIGENCE DETECTOR
========================================================

Implement ONE detector:

PROJECT MEETING LOAD

Purpose:

Identify projects where meeting/coordination load is unusually high
relative to the user's historical project behaviour.

Do NOT use an arbitrary universal rule such as:

"more than five hours is bad."

The detector should prefer workspace-specific history.

Example:

current project's meeting minutes
        vs
historical comparable/completed projects

Initially a deterministic statistical implementation is sufficient.

Possible measures:

- historical median
- percentile
- deviation from baseline
- minimum sample count

Keep the implementation explainable.

If insufficient historical data exists, return:

insufficient_evidence

rather than manufacturing an opportunity.

========================================================
EVIDENCE FIRST
========================================================

Every detector result must be able to explain WHY.

Conceptual result:

{
  detector: "project_meeting_load",
  subjectType: "project",
  subjectId: "...",

  status: "opportunity" | "normal" | "insufficient_evidence",

  observed: {
      meetingMinutes: 390
  },

  baseline: {
      sampleSize: 14,
      medianMeetingMinutes: 210
  },

  comparison: {
      differenceMinutes: 180,
      differencePercent: 85.7
  },

  confidence: 0.xx,

  evidence: [
      meeting/workspace-event references
  ]
}

Do not let an LLM fabricate this structure.

The numbers must originate from Lancee's authoritative data.

========================================================
OPPORTUNITY MODEL
========================================================

Before creating a large new opportunity subsystem, inspect whether
existing Decision Dynamics objects/tables can be safely generalized.

Do NOT force opportunities into "decisions" if their semantics are
wrong.

If an opportunity requires a new persistence model, keep v1 small.

Potential fields:

id
workspace_id
detector_key
subject_type
subject_id
project_id
client_id
title
summary
confidence
status
evidence_json
metrics_json
first_detected_at
last_detected_at
created_at
updated_at

Statuses can initially be:

active
dismissed
resolved
expired

Detector execution must be idempotent.

Repeated processing of the same underlying condition should update
an existing active opportunity rather than spam duplicates.

========================================================
IMPORTANT TERMINOLOGY
========================================================

User-facing concept:

Connected Intelligence

Primary output:

Opportunity / Insight

Do not blindly rename database tables/functions named "decision_*".

Existing Decision Dynamics may remain an internal subsystem while
the architecture evolves.

Avoid a dangerous repo-wide rename in this phase.

========================================================
MAIL
========================================================

DO NOT implement full Mail → Project intelligence in this phase.

However, inspect it and document exactly how Phase 2 should connect:

communication.received
communication.sent

to:

client
project
conversation/thread

Identify what already exists and what is missing.

Do not break the current mail implementation.

========================================================
HERMES
========================================================

Hermes is NOT the source of truth for Connected Intelligence.

Lancee authoritative records + deterministic algorithms establish
facts, metrics and evidence.

Hermes may later:

- explain an opportunity naturally
- reason over bounded evidence
- propose an action
- execute an approved action

Do not send every meeting/calendar event to Hermes.

Do not add unnecessary AI calls in this phase.

========================================================
UI
========================================================

Do not redesign the entire dashboard.

Make only the UI changes required to:

1. allow a Calendar event to select/link a Project
2. optionally derive/show the associated Client
3. preserve existing Calendar UX
4. expose enough debugging/verification information to prove the
   relationship is persisted

If an existing Insights/Intelligence/Pulse UI is clearly suitable,
a minimal project-meeting-load opportunity may be surfaced there.

Otherwise leave presentation for a later phase and expose the result
through the appropriate authenticated API/service.

========================================================
TESTING / VERIFICATION
========================================================

Follow existing verification-script conventions.

Add focused verification for:

1. calendar event can link to project
2. linked project belongs to same workspace
3. client relationship is correct
4. meeting.created is emitted once
5. meeting.completed is idempotent
6. meeting duration is correct
7. project meeting aggregates are correct
8. client meeting aggregates are correct
9. detector handles insufficient history
10. detector identifies a clearly abnormal meeting-load case
11. detector evidence references real records
12. cross-workspace data cannot contaminate aggregates
13. existing Signal Engine behaviour still works
14. existing Decision Dynamics verification still passes

Run the existing relevant verification suites as regression tests.

========================================================
DO NOT
========================================================

- Do not rewrite Lancee.
- Do not replace workspace-events.mjs.
- Do not create another Activity Ledger.
- Do not create a Neo4j dependency.
- Do not introduce a graph database.
- Do not send all workspace data to an LLM.
- Do not implement ML.
- Do not implement speculative correlation discovery yet.
- Do not rename every decision_* table/module.
- Do not redesign Hermes.
- Do not rewrite Calendar unnecessarily.
- Do not break existing APIs.
- Do not create fake/demo intelligence in production paths.
- Do not fabricate opportunities when evidence is insufficient.

========================================================
DELIVERABLE
========================================================

Work in two stages.

STAGE A — AUDIT

Before editing, output a concise implementation map containing:

- exact Calendar files
- exact Calendar DB structures
- Calendar API routes
- Project/Client relationship structures
- workspace-event integration points
- Signal Engine entry point
- existing intelligence components to reuse
- missing pieces
- files you intend to modify/create
- migration impact
- risks

Then continue to Stage B unless you discover a major architectural
conflict.

STAGE B — IMPLEMENT

Implement the smallest production-quality vertical slice:

Calendar
   ↓
Project
   ↓
Client
   ↓
Workspace Event
   ↓
Meeting Features
   ↓
Project Meeting Load Detector
   ↓
Evidence-backed Opportunity

After implementation:

- run tests/verification
- fix regressions caused by your changes
- report exact files changed
- report schema changes
- report API changes
- show one example detector result
- clearly identify what remains for Phase 2

Do not claim success unless the verification passes.
