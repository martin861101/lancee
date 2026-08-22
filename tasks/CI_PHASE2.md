You are implementing Phase 2 of Lancee Connected Intelligence.

Repository:
martin861101/lancee

Working branch:
feature/workspace-pulse-home

Model recommendation:
GPT-5.6 Sol — High reasoning

IMPORTANT:
Work from the CURRENT branch.

Phase 1 Connected Intelligence has already been implemented and verified.

Do not rebuild or replace working Lancee functionality.

========================================================
CONTEXT
========================================================

Lancee already has a WORKING Mail feature.

A real business mailbox hosted externally (including Xneelo-hosted
business email) is already connected and functioning inside Lancee.

The existing Mail UI currently provides functionality including:

- Inbox
- Messages
- Search
- Refresh/sync
- Automation rules
- Mail settings
- Existing mail account connection

Therefore:

DO NOT BUILD A MAIL CONNECTOR.
DO NOT ADD GMAIL-SPECIFIC ARCHITECTURE.
DO NOT REPLACE IMAP/SMTP OR EXISTING MAIL TRANSPORT.
DO NOT REFACTOR WORKING MAIL WITHOUT NECESSITY.

The existing Lancee Mail implementation is an AUTHORITATIVE DATA SOURCE
for Connected Intelligence.

Your task is to instrument and connect the existing Mail system to the
Connected Intelligence architecture.

========================================================
PRODUCT DIRECTION
========================================================

Lancee Connected Intelligence:

"Your work knows more than you think."

Phase 1 established:

Calendar
    ↓
Project / Client
    ↓
workspace_events
    ↓
Meeting Features
    ↓
project_meeting_load
    ↓
Evidence-backed Opportunity

Phase 2 adds the second major source:

Existing Lancee Mail
    ↓
Communication observations
    ↓
Person / Client / Project relationships
    ↓
workspace_events
    ↓
Communication Features
    ↓
        + Calendar Features
    ↓
Client Attention Intelligence
    ↓
Evidence-backed Opportunity

This should become Lancee's FIRST genuinely cross-source Connected
Intelligence detector.

========================================================
ARCHITECTURAL PRINCIPLE
========================================================

DO NOT directly couple Mail to Calendar.

Both should resolve against shared Lancee business entities.

Conceptually:

MAIL ───────────────┐
                    │
                 PERSON
                    │
                  CLIENT
                    │
                 PROJECT
                    │
CALENDAR ───────────┘
                    │
             ACTIVITY LEDGER
                    │
          CONNECTED INTELLIGENCE

Eventually other sources such as Drive, WhatsApp, Tasks, Invoices,
Payments and Time will connect through the same entities.

========================================================
STAGE A — AUDIT FIRST
========================================================

BEFORE EDITING ANYTHING, inspect the current branch.

At minimum inspect:

- AGENT.md
- server/connected-intelligence.mjs
- server/workspace-events.mjs
- server/signal-engine.mjs
- server/database.mjs
- server/index.mjs
- server/lancee-mcp.mjs
- existing Mail backend modules
- existing IMAP/mail connector
- existing SMTP/send implementation
- Mail API routes
- Mail UI/components
- Mail automation implementation
- Clients implementation
- client/contact database structures
- Projects implementation
- Calendar implementation from Phase 1
- scripts/verify-connected-intelligence.mjs
- scripts/verify-signals.mjs
- docs/CONNECTED_INTELLIGENCE.md

Determine:

1. How the existing working Mail connector retrieves messages.
2. Whether messages are persisted or fetched from provider on demand.
3. How folders are represented.
4. How message IDs are represented.
5. Whether Message-ID headers are available.
6. Whether thread/conversation identity exists.
7. How inbound/outbound direction is determined.
8. How sending currently works.
9. Where a successful inbound sync becomes authoritative.
10. Where a successful outbound send becomes authoritative.
11. Whether existing communication.received /
   communication.sent workspace events already exist.
12. Whether client email/contact relationships already exist.
13. Whether Mail currently supports linking messages to projects.
14. Whether a reusable Person/Contact entity already exists.
15. How Calendar attendee identity is currently represented.
16. How Signal Engine currently consumes communication.
17. Exact files that should change.
18. Schema impact.
19. Risks to the existing working Mail system.

PRINT THIS AUDIT BEFORE IMPLEMENTATION.

Then continue unless you discover a major architectural conflict.

========================================================
RULE #1 — PRESERVE MAIL
========================================================

The Mail feature already works.

Instrument it at the NARROWEST AUTHORITATIVE SERVER-SIDE POINT.

Do not:

- change how users connect their mailbox unless required
- replace IMAP
- replace SMTP
- introduce Gmail APIs
- introduce Microsoft APIs
- duplicate mailbox syncing
- duplicate message storage unnecessarily
- alter automation rules unnecessarily
- redesign Mail UI
- break existing folders/search/send/reply behaviour

Connected Intelligence must consume Mail.

Mail must not be rebuilt around Connected Intelligence.

========================================================
PHASE 2A — CANONICAL COMMUNICATION OBSERVATION
========================================================

Create/reuse the smallest provider-neutral representation required for
intelligence.

Connected Intelligence should not care whether a message originated
from:

- Xneelo
- generic IMAP
- Gmail
- Microsoft
- another future provider

It cares that it is a communication observation.

Conceptually:

CommunicationMessage {
    workspaceId

    sourceAccountId
    sourceType
    externalMessageId
    externalThreadId?

    direction:
        inbound | outbound

    from
    to
    cc?

    subject

    occurredAt

    personIds?
    clientId?
    projectId?

    provenance
}

Use existing structures if they already satisfy this requirement.

DO NOT create a duplicate mail_messages table simply because this
conceptual structure is shown here.

First reuse what exists.

========================================================
MESSAGE CONTENT
========================================================

For Phase 2 we primarily need METADATA.

At minimum:

- sender
- recipients
- timestamp
- direction
- subject
- message identity
- thread/conversation identity if available

DO NOT copy/store full message bodies into Connected Intelligence
merely because they exist.

Existing Mail may continue storing/accessing bodies according to its
current architecture.

Connected Intelligence should reference authoritative messages.

Semantic body analysis comes later.

========================================================
PHASE 2B — PERSON / CONTACT IDENTITY
========================================================

IMPORTANT ARCHITECTURAL CHANGE:

Before mapping:

email → client

determine whether Lancee already has a reusable Person/Contact entity.

The ideal model is:

email address
     ↓
PERSON / CONTACT
     ↓
CLIENT

because the same person may later appear in:

- Mail
- Calendar attendees
- Drive sharing
- WhatsApp
- Quotes
- Projects
- meetings

Example:

john@acme.co.za
      ↓
John Smith
      ↓
works_at
      ↓
Acme Ltd

Then:

Mail message ──────► John Smith
Calendar attendee ─► John Smith

This creates a shared identity across sources.

========================================================
DO NOT OVERBUILD CONTACTS
========================================================

If a suitable contact/person model ALREADY exists:

REUSE IT.

If it does not exist:

implement the smallest canonical identity mechanism necessary.

Do not build a giant CRM/contact-management subsystem.

At minimum, identity should support:

- workspace
- canonical email address
- optional display name
- optional client relationship
- provenance/source
- timestamps

Email matching must be case-normalised.

Identity resolution must remain workspace scoped.

========================================================
IDENTITY RESOLUTION PRIORITY
========================================================

Use deterministic resolution.

Priority:

1. explicit existing relationship
2. exact canonical email match to existing contact/person
3. exact canonical client/contact email match
4. previously confirmed relationship
5. unresolved

Do NOT use fuzzy names as authoritative identity.

Do NOT ask an LLM to decide who somebody is.

If ambiguous:

UNRESOLVED

Do not guess.

========================================================
CALENDAR IDENTITY
========================================================

Inspect Phase 1 Calendar attendee handling.

If Calendar attendee email addresses are available, design the new
Person/Contact identity layer so Calendar can reuse it.

DO NOT unnecessarily rewrite Phase 1 Calendar now.

If a tiny safe change allows:

Calendar attendee email
        ↓
same Person
        ↑
Mail sender

implement it.

Otherwise document the exact Phase 2.1 follow-up required.

The objective is:

MAIL and CALENDAR should eventually recognise the SAME PERSON.

========================================================
PHASE 2C — CLIENT RESOLUTION
========================================================

Once Person/Contact identity is resolved:

Person
   ↓
Client

Use existing Lancee client relationships.

Never allow:

Workspace A message
      ↓
Workspace B client

All queries MUST be workspace scoped.

If the contact cannot be safely assigned to a client:

leave clientId null.

========================================================
PHASE 2D — PROJECT LINKING
========================================================

Project relationships must be conservative.

Allowed authoritative sources:

1. existing explicit relationship
2. user manually links message/thread to project
3. previously confirmed thread → project relationship
4. existing deterministic Lancee relationship that is genuinely
   unambiguous

Do NOT automatically persist project linkage because:

- subject resembles project title
- message mentions project keywords
- sender belongs to client with multiple projects
- an LLM thinks the email is related

If the UI can safely support it, allow:

"Link to project"

Once a thread is CONFIRMED against a project, subsequent messages in
that same authoritative thread may inherit the relationship.

Preserve provenance showing why the relationship exists.

========================================================
PHASE 2E — WORKSPACE EVENTS
========================================================

REUSE:

server/workspace-events.mjs

Do not create another event system.

Use:

communication.received
communication.sent

An inbound message should produce conceptually:

{
    eventType: "communication.received",
    entityType: "email",
    entityId: <stable authoritative message identity>,

    clientId: <resolved or null>,
    projectId: <confirmed or null>,

    participantRefs: [...],

    sourceChannel: "email",
    sourceIdentifier: <message identity>,

    occurredAt: <actual message timestamp>,

    payload: {
        threadId,
        direction,
        subject
    }
}

Outbound:

communication.sent

Follow the EXISTING workspace-event schema exactly.

This example is conceptual.

========================================================
IDEMPOTENCY
========================================================

CRITICAL.

Mailbox refresh/sync may repeatedly encounter the same message.

That must NOT create:

communication.received
communication.received
communication.received

for one email.

Use stable authoritative message identity.

Ensure repeated refresh/sync is idempotent.

Same applies to outbound messages.

========================================================
PHASE 2F — COMMUNICATION FEATURES
========================================================

Extend the deterministic Connected Intelligence feature layer.

NO HERMES.
NO LLM.
NO ML.

PER PROJECT:

- message_count
- inbound_message_count
- outbound_message_count
- thread_count
- participant_count
- communication_days
- average_messages_per_thread

PER CLIENT:

- message_count
- inbound_message_count
- outbound_message_count
- thread_count
- communication_days
- number_of_related_projects

PER PERSON where useful:

- message_count
- thread_count
- last_communication_at

Do not implement features with no immediate intelligence value simply
because they are possible.

========================================================
RESPONSE TIME
========================================================

If thread/message chronology is reliable, calculate:

median_response_minutes
average_response_minutes
response_sample_size

Define response carefully:

Inbound external message
        ↓
NEXT outbound workspace/user message
IN THE SAME THREAD
        ↓
response duration

Do not pair arbitrary messages.

Do not use negative durations.

Do not count another inbound message as a response.

If thread identity is unreliable:

DEFER RESPONSE-TIME FEATURES.

Do not fake accuracy.

========================================================
PHASE 2G — CROSS-SOURCE CLIENT ATTENTION
========================================================

Now connect:

MAIL FEATURES
      +
CALENDAR FEATURES

This is the first major cross-source detector.

Per Client collect:

Mail:
- message count
- thread count
- communication days

Calendar:
- meeting count
- meeting minutes

Optional existing project context:
- active project count

Conceptually:

CLIENT
   │
   ├── 142 messages
   ├── 27 threads
   ├── 18 communication days
   ├── 11 meetings
   ├── 620 meeting minutes
   └── 2 active projects

The engine should compare this client against other sufficiently
observed clients in THIS WORKSPACE.

========================================================
DO NOT CREATE A FAKE MONEY SCORE
========================================================

At this phase we do NOT yet have enough outcome data to say:

"This client is unprofitable."

High attention may be completely justified.

Therefore initially calculate transparent coordination intensity.

Possible workspace-relative components:

message percentile
thread percentile
meeting-minute percentile

A transparent composite may be used.

For example:

attention_index =
    mean(
        message_percentile,
        thread_percentile,
        meeting_minutes_percentile
    )

But inspect the existing Phase 1 detector conventions first.

Use the most explainable implementation compatible with the codebase.

========================================================
DETECTOR
========================================================

Implement:

client_attention_load

Purpose:

Detect a client requiring unusually high coordination attention
relative to the user's other sufficiently observed clients.

Required characteristics:

- workspace-relative
- cross-source where data allows
- deterministic
- evidence-backed
- minimum comparison sample
- confidence score
- insufficient_evidence state
- deduplicated opportunity
- resolves when condition normalises

Example conceptual output:

{
    detector: "client_attention_load",
    detectorVersion: 1,

    subjectType: "client",
    subjectId: "...",

    status: "opportunity",

    observed: {
        messageCount: 142,
        threadCount: 27,
        meetingCount: 11,
        meetingMinutes: 620
    },

    baseline: {
        sampleSize: 12,
        medianMessages: 48,
        medianThreads: 9,
        medianMeetingMinutes: 180
    },

    comparison: {
        messagePercentile: 0.92,
        threadPercentile: 0.89,
        meetingMinutesPercentile: 0.94,
        attentionIndex: 0.916
    },

    confidence: 0.xx,

    evidence: [...]
}

Do not blindly copy these numbers/formulas.

Use actual data.

========================================================
OPPORTUNITY LANGUAGE
========================================================

Correct:

"Acme currently requires substantially more coordination attention
than your typical client."

Good supporting evidence:

"142 messages across 27 threads and 10.3 meeting hours."

NOT:

"Acme is wasting your time."

NOT:

"Acme is unprofitable."

NOT:

"You should fire this client."

Financial value comes in a later phase.

========================================================
CONNECTED OPPORTUNITIES
========================================================

Reuse:

connected_opportunities

Do NOT create another opportunity table.

Identity should follow Phase 1 semantics:

detector_key:
client_attention_load

subject_type:
client

subject_id:
<client>

Repeated detector execution:

UPDATE existing active opportunity.

Do not create duplicates.

If condition normalises:

resolve it.

Respect existing dismissed/resolved behaviour.

========================================================
EVIDENCE
========================================================

Every opportunity must answer:

"Why did Lancee notice this?"

Evidence should trace back to authoritative:

communication.received
communication.sent
meeting.completed

and/or underlying authoritative message/calendar records where the
existing evidence architecture supports them.

Do not expose an unexplained score.

========================================================
EXISTING SIGNAL ENGINE
========================================================

Inspect how communication events currently feed:

server/signal-engine.mjs

Preserve compatibility.

Connected Intelligence and Signal Engine are related but do not need
to become one abstraction.

Do NOT replace Signal Engine.

========================================================
SEMANTIC EMAIL INTELLIGENCE — DEFER
========================================================

DO NOT implement yet:

- scope change detection
- revision request detection
- urgency classification
- sentiment
- complaint classification
- pricing objection
- approval extraction
- semantic project inference
- unrestricted email-body LLM analysis

But document an extension mechanism:

Authoritative Message
       ↓
Derived Semantic Signal
       ↓
Provenance
       ↓
Connected Intelligence

Future semantic signals must reference the original message and carry
their own confidence.

========================================================
MAIL UI
========================================================

PRESERVE THE EXISTING MAIL UI.

Only make small changes if required.

Potential useful addition when opening a message/thread:

Client:
Acme Ltd

Project:
Website Redesign

[Change project]

Relationship status:
Confirmed

Do not redesign Inbox.

Do not turn Mail into analytics.

========================================================
CALENDAR UI
========================================================

Do not redesign Calendar.

If Person identity can safely unify attendees with Mail contacts,
implement the backend relationship.

UI changes are unnecessary unless required for verification.

========================================================
PHASE 1 REVIEW
========================================================

While touching Connected Intelligence, inspect the Phase 1
project_meeting_load detector.

Specifically verify:

1. Whether project status "Ready" genuinely represents an appropriate
   historical/completed project baseline.

2. Whether projects with zero meetings are included when Calendar
   coverage may be incomplete.

Do NOT casually change behaviour.

If "Ready" is correct:
document it.

If incorrect:
use the actual existing project lifecycle semantics and update tests.

If Calendar coverage cannot yet be reliably determined:
document it as a confidence limitation.

========================================================
SECURITY / PRIVACY
========================================================

Treat Mail as sensitive.

Verify:

- strict workspace scoping
- no cross-workspace contacts
- no cross-workspace clients
- no cross-workspace projects
- no cross-workspace evidence retrieval
- credentials never enter workspace events
- IMAP passwords never enter intelligence storage
- SMTP credentials never enter intelligence storage
- OAuth tokens never enter intelligence storage
- full email bodies are not duplicated unnecessarily
- source identifiers cannot bypass workspace isolation
- evidence APIs require authenticated workspace context

========================================================
TESTS
========================================================

Extend the existing verification suite.

At minimum test:

MAIL

1. inbound authoritative message is observed
2. outbound authoritative message is observed
3. repeated sync is idempotent
4. communication.received emits once
5. communication.sent emits once

IDENTITY

6. canonical email resolves same Person
7. email matching is case-insensitive
8. Person resolution is workspace scoped
9. Person → Client relationship resolves correctly
10. ambiguous identity remains unresolved
11. cross-workspace identity cannot leak

PROJECT

12. confirmed thread/project relationship persists
13. future messages inherit confirmed thread relationship
14. cross-workspace project cannot be linked
15. project is not guessed from subject text

FEATURES

16. message count correct
17. inbound count correct
18. outbound count correct
19. thread count correct
20. communication days correct
21. response pairing correct if implemented

CALENDAR CONNECTION

22. same email address from Calendar + Mail resolves to same Person
    if implemented in this phase
23. existing meeting aggregates still pass

ATTENTION DETECTOR

24. insufficient comparison history returns insufficient_evidence
25. normal client does not produce opportunity
26. intentionally abnormal client produces opportunity
27. detector uses communication evidence
28. detector uses calendar evidence where available
29. evidence references authoritative events
30. opportunity deduplicates
31. opportunity resolves when normalised

REGRESSION

32. project_meeting_load passes
33. Signal Engine verification passes
34. Decision Dynamics verification passes
35. MCP verification passes
36. existing Mail verification passes
37. npm run build passes
38. npm run lint passes
39. git diff --check passes

Clearly report:

PASS
FAIL
NOT RUN
ENVIRONMENT BLOCKED

Do not claim a test passed if it did not run.

========================================================
DOCUMENTATION
========================================================

Update:

docs/CONNECTED_INTELLIGENCE.md

Document:

- existing Mail as an authoritative Connected Intelligence source
- provider-neutral communication model
- Person/Contact identity model
- client resolution rules
- project relationship rules
- communication feature definitions
- Calendar/Mail identity relationship
- Client Attention detector
- evidence provenance
- privacy/security decisions
- limitations
- semantic signal extension point

========================================================
PHASE 3 — DO NOT IMPLEMENT
========================================================

Document the next intelligence connection only.

Once authoritative Time + Invoice + Payment + Revenue evidence is
available:

CLIENT ATTENTION
        +
DELIVERY TIME
        +
REVENUE
        +
PAYMENT BEHAVIOUR
        ↓
CLIENT VALUE / ATTENTION RELATIONSHIP

This eventually allows Lancee to discover things like:

"This client produces 24% of your revenue but consumes 41% of measured
coordination attention."

Or:

"This client generates less revenue than Client B while requiring
substantially more meetings, communication and delivery time."

Do NOT generate these claims yet.

========================================================
DO NOT
========================================================

- Do not build another Mail connector.
- Do not add Gmail just for Connected Intelligence.
- Do not replace Xneelo/IMAP integration.
- Do not replace SMTP.
- Do not redesign Mail.
- Do not create another Activity Ledger.
- Do not create another Signal Engine.
- Do not create another opportunity system.
- Do not introduce Neo4j.
- Do not introduce a graph database.
- Do not implement ML.
- Do not implement open-ended relationship discovery.
- Do not use Hermes for arithmetic.
- Do not use LLMs to link clients/projects.
- Do not semantically analyse email bodies yet.
- Do not store credentials in intelligence data.
- Do not duplicate full email bodies.
- Do not broadly rename decision_* code.
- Do not break Phase 1.
- Do not manufacture evidence.

========================================================
FINAL DELIVERABLE
========================================================

STAGE A:
Print audit and implementation map.

STAGE B:
Implement:

EXISTING LANCEE MAIL
        ↓
Authoritative Communication Observation
        ↓
Person / Contact
        ↓
Client
        ↓
Confirmed Project
        ↓
workspace_events
        ↓
Communication Features
        │
        ├─────────────┐
        │             │
        │       Meeting Features
        │             │
        └──────┬──────┘
               ↓
     client_attention_load
               ↓
       Evidence Gate
               ↓
 connected_opportunities

At completion report:

- exact files changed
- schema changes
- API changes
- UI changes
- how existing Mail was instrumented
- Person identity implementation
- client resolution rules
- project linking rules
- feature calculations
- attention detector calculation
- evidence strategy
- privacy/security decisions
- Phase 1 findings
- test results
- environment-blocked tests
- known limitations
- example real/fixture detector result
- Phase 3 recommendation

Do not claim completion unless relevant verification passes.
