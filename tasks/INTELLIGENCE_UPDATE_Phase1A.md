You are working directly in the Lancee repository.

PHASE 0 HAS ALREADY BEEN COMPLETED.

Connected Intelligence has been extracted into:

src/components/intelligence/
  ConnectedIntelligencePage.tsx
  connected-intelligence.css

Do NOT undo that work or move Intelligence back into App.tsx.

==================================================
GOAL
==================================================

Build the BACKEND FOUNDATION for the next Connected Intelligence UX.

This phase introduces:

1. persistent Connected Intelligence inspection/activity records;
2. instrumentation of EXISTING intelligence processing;
3. summary/activity APIs;
4. a clean Connected Intelligence contract for Hermes / Workspace AI;
5. removal of legacy Decision Intelligence language from normal AI behaviour.

This phase does NOT redesign the Intelligence frontend.

The existing Intelligence page should continue looking and behaving essentially as it does now.

Phase 1B will handle:
- Lancee mascot/avatar UI
- Lancee Activity timeline
- simplified finding cards
- human-first evidence drawer
- new Intelligence briefing
- mobile redesign

STOP before implementing those.

==================================================
1. AUDIT BEFORE CHANGING ANYTHING
==================================================

Inspect the ACTUAL current repository first.

At minimum inspect:

- server/index.mjs
- server/lancee-mcp.mjs
- Connected Intelligence services/helpers
- workspace_events implementation
- connected_opportunities schema/persistence
- client_attention_load implementation
- project_meeting_load implementation
- communication feature calculation
- meeting feature calculation
- mail ingestion/intelligence hooks
- calendar ingestion/intelligence hooks
- src/lib/api*
- src/components/intelligence/ConnectedIntelligencePage.tsx
- current evidence-chain implementation
- Hermes / Workspace Chat integration
- server/agent-runtime.mjs if still applicable
- server/ai.mjs if relevant
- MCP capability registry
- conversation/context generation
- migrations/schema helpers
- existing Connected Intelligence verification scripts
- AGENT.md
- relevant docs

Search the entire repository for:

connected-intelligence
connected_opportunities
workspace_events
client_attention
meeting_load
opportunity
finding
evidence
decision.list
Decision Intelligence
decision intelligence
decision review
outcome-review
structured decision
Hermes
workspace context
MCP

Before modifying code, understand and briefly document the CURRENT path:

workspace activity
→ feature calculation
→ detector
→ opportunity persistence
→ API
→ frontend

Also determine how Hermes currently receives intelligence-related tools/context.

Do NOT create duplicate architecture if an equivalent service/helper already exists.

==================================================
2. PRESERVE THE CURRENT INTELLIGENCE ENGINE
==================================================

The existing Connected Intelligence implementation already works.

Preserve:

- workspace_events
- connected_people
- communication_messages
- communication_thread_links
- connected_opportunities
- meeting features
- communication features
- client attention load
- project meeting load
- current detector thresholds
- opportunity deduplication
- evidence references
- workspace scoping
- existing Intelligence APIs
- current frontend behaviour

DO NOT rewrite the detector system.

DO NOT change detector thresholds as part of this phase.

DO NOT replace deterministic evidence with AI-generated reasoning.

We are adding OBSERVABILITY around the existing engine.

==================================================
3. ADD CONNECTED INSPECTION PERSISTENCE
==================================================

Introduce a persistent inspection/activity model following existing Lancee DB conventions.

Preferred concept:

connected_inspections

Adapt exact schema/naming to the repository if necessary.

It should approximately support:

id
workspace_id

inspection_type
source_type

client_id nullable
project_id nullable

status

records_inspected
signals_found

summary

related_opportunity_id nullable

metadata JSONB

started_at
completed_at

created_at / updated_at only if consistent with current schema conventions.

Useful statuses:

inspecting
all_clear
signal_found
opportunity_created
failed

Initial inspection types should support at least:

mail
calendar
client
project
cross_source

Design this so future sources can be added without schema churn:

tasks
time entries
invoices
approvals
quotes
Zoom transcripts
etc.

All persistence MUST be workspace scoped.

Use appropriate indexes.

Follow existing migration/schema patterns.

==================================================
4. INSPECTIONS REPRESENT REAL WORK ONLY
==================================================

This is critical.

DO NOT create fake activity simply to make Lancee appear busy.

An inspection record must correspond to real Connected Intelligence processing.

If Lancee did not inspect something, the activity system must not claim that it did.

Examples:

GOOD:

Mail processing actually evaluates 29 messages:
→ persist a mail inspection.

Calendar intelligence actually evaluates meeting activity:
→ persist a calendar inspection.

Cross-source detector compares communication + meetings:
→ persist appropriate cross-source inspection.

BAD:

Create random:
"Lancee checked your projects"

when no project intelligence operation occurred.

Connected Intelligence activity must be auditable.

==================================================
5. DO NOT CREATE AN EVENT FIREHOSE
==================================================

An inspection is a LOGICAL intelligence operation, not every database read.

Do NOT create:

311 mail inspection rows for 311 messages.

Prefer something such as:

mail inspection
records_inspected = 29

metadata:
{
  messages: 29,
  threads: 8,
  peopleResolved: 5,
  clientsMatched: 3,
  projectsCompared: 2
}

ONLY store counts that were actually observed.

Do not invent values merely to populate metadata.

Group related processing sensibly.

==================================================
6. INSPECTION LIFECYCLE
==================================================

Introduce/reuse a small service/helper abstraction so instrumentation is not scattered SQL.

Conceptually:

startInspection(...)

completeInspection(...)

failInspection(...)

or an equivalent implementation consistent with the codebase.

Flow:

start inspection
      ↓
existing feature calculation
      ↓
existing detector
      ↓
        ┌─────────────────────────────┐
        │                             │
   no finding                    signal/finding
        │                             │
        ↓                             ↓
    all_clear              opportunity persistence
                                      ↓
                              opportunity_created
        │                             │
        └────────── complete ─────────┘

If processing fails:

status = failed

Do not allow inspection persistence failures to corrupt core business data.

Use transactions where appropriate.

==================================================
7. LINK INSPECTIONS TO OPPORTUNITIES
==================================================

Where an existing detector creates/reuses a connected_opportunity, associate the inspection with that opportunity when practical.

Do NOT create duplicate opportunities just because an inspection ran again.

Respect existing deduplication behaviour.

An inspection records:

"What Lancee checked."

An opportunity records:

"What Lancee found worth surfacing."

These are different concepts.

==================================================
8. CONNECTED INTELLIGENCE SUMMARY API
==================================================

Add a workspace-scoped summary endpoint.

Preferred route:

GET /api/connected-intelligence/summary

Adapt to existing route conventions if necessary.

Return factual data useful to both frontend and Hermes.

Example shape:

{
  "findings": 4,
  "clientsInspected": 15,
  "messagesInspected": 311,
  "meetingsInspected": 207,
  "recentInspections": 12,
  "status": "attention_needed"
}

DO NOT blindly implement these exact fields if the existing data cannot support them accurately.

Every count must have a clear deterministic source.

Useful summary status concept:

attention_needed
all_clear
insufficient_activity

Important distinction:

0 findings + inspections exist
→ all_clear

0 findings + insufficient/no inspection history
→ insufficient_activity

These MUST NOT be treated as the same state.

==================================================
9. CONNECTED INTELLIGENCE ACTIVITY API
==================================================

Add:

GET /api/connected-intelligence/activity

and, if useful:

GET /api/connected-intelligence/activity/:id

Support sensible pagination/limit behaviour consistent with existing APIs.

Return semantic activity data.

Example:

{
  "id": "...",
  "type": "mail",
  "status": "all_clear",
  "title": "Checked recent communication",
  "summary": "Reviewed recent communication across active clients.",
  "counts": {
    "messages": 29,
    "threads": 8
  },
  "clientId": null,
  "projectId": null,
  "opportunityId": null,
  "character": "mail",
  "startedAt": "...",
  "completedAt": "..."
}

Do NOT expose:

- raw email bodies
- secrets
- unnecessary internal IDs
- database implementation details
- raw MCP payloads

Character/state keys may be returned semantically for Phase 1B:

mail
calendar
investigate
insight
connected
all-clear

Do not implement the avatar UI yet.

==================================================
10. HERMES / WORKSPACE AI AUDIT
==================================================

The old Decision Intelligence system is still leaking into AI responses.

Example of BAD current behaviour:

"Hello. The current Decision Intelligence overview indicates that there are no structured decisions recorded, as the `decision.list` result is empty. Additionally, the zero count for decision reviews confirms that the outcome-review queue is currently empty."

This MUST stop.

Audit exactly where this comes from.

Search:

decision.list
structured decisions
decision review
decision reviews
outcome-review
Decision Intelligence
decision intelligence
decision history
decision tools
old MCP tool descriptions
Hermes system prompts
Workspace AI context
workspace summaries
tool registries
capability descriptions

Determine whether Hermes is receiving:

- obsolete MCP tools
- obsolete tool descriptions
- obsolete system/context instructions
- legacy workspace summaries
- legacy Decision Intelligence capability definitions
- or a combination

Fix the SOURCE.

DO NOT solve this by applying brittle string replacement to the final model response.

==================================================
11. CONNECTED INTELLIGENCE BECOMES THE CURRENT AI CONTRACT
==================================================

Workspace AI/Hermes must understand that the current Lancee intelligence product is:

CONNECTED INTELLIGENCE.

Conceptually:

Connected Intelligence observes workspace signals.

Examples currently supported may include:

communication
meetings
clients
projects
relationships

It performs:

inspections
feature calculations
cross-source comparisons
deterministic detectors

It can produce:

activity
findings/opportunities
evidence

Hermes does NOT need to explain those internal mechanics unless asked.

==================================================
12. CRITICAL STATE DISTINCTION
==================================================

Hermes must understand:

NO FINDINGS
≠
NO DATA

NO LEGACY DECISIONS
≠
CONNECTED INTELLIGENCE IS EMPTY

Implement a deterministic state distinction based on actual data.

STATE A — FINDINGS EXIST

Example conversational answer:

"Lancee has noticed 3 things that may be worth your attention."

Then summarise factual findings.

STATE B — INSPECTIONS EXIST, NO FINDINGS

Example:

"Lancee has been checking your recent workspace activity, but nothing unusual currently needs your attention."

Only mention sources that were actually inspected.

STATE C — INSUFFICIENT ACTIVITY

Example:

"There isn't enough recent workspace activity yet for Lancee to identify meaningful patterns."

Do NOT say:

"Everything looks normal"

if Lancee has not inspected enough information to support that statement.

==================================================
13. HERMES MUST SPEAK LIKE LANCEE, NOT A DEBUGGER
==================================================

Normal users should never need to understand Lancee's internal tools.

In ordinary conversation, Hermes must NOT expose:

decision.list
MCP method names
tool identifiers
detector identifiers
database tables
raw percentile calculations
raw thresholds
workspace event IDs
internal queue terminology

BAD:

"`decision.list` returned []"

BAD:

"`client_attention_load` exceeded the 75th percentile detector threshold."

GOOD:

"Nothing unusual needs your attention right now."

GOOD:

"This client has been requiring considerably more coordination than is typical in your workspace."

GOOD:

"I've noticed higher communication and meeting activity around this client recently."

Technical details MAY be shown if the user explicitly asks:

- how the detector works
- technical evidence
- debug information
- calculation details

Do not remove legitimate technical observability.

Simply keep it out of normal conversational UX.

==================================================
14. HERMES MUST NOT INVENT ACTIVITY
==================================================

Hermes may explain Connected Intelligence facts.

It must NOT invent:

- inspections
- findings
- clients inspected
- meetings reviewed
- emails reviewed
- causes
- patterns
- comparisons

If structured data does not establish something, do not claim it.

Example:

Evidence establishes unusually high coordination.

GOOD:

"This client is requiring more coordination than usual."

POSSIBLE EXPLANATION:

"This can sometimes happen because of changing requirements, additional support or project complexity."

BAD:

"This client has scope creep."

Evidence and interpretation must remain separate.

==================================================
15. MCP / AGENT CAPABILITY
==================================================

Where consistent with the current Lancee MCP architecture, expose/reuse Connected Intelligence capabilities so Hermes can answer questions such as:

"Has Lancee noticed anything?"

"Is there anything I should look at?"

"What have you been checking?"

"Why did you flag this client?"

"Is everything looking normal?"

"What did you find today?"

Prefer structured tools around concepts such as:

get intelligence summary
list findings
list recent inspections/activity
get finding evidence

Exact tool names should follow existing MCP naming conventions.

Do NOT create duplicate business logic inside MCP.

MCP tools should be thin wrappers around the same Connected Intelligence services/APIs used elsewhere.

==================================================
16. LEGACY DECISION INTELLIGENCE
==================================================

Do NOT blindly delete legacy Decision Intelligence code.

First determine whether it is still required for:

- historical data
- compatibility
- migrations
- other features
- old tests
- documentation

Where legacy storage/tools must remain, they may remain internally.

But they must NOT be presented to Hermes as the CURRENT Intelligence product.

If an obsolete tool is no longer used anywhere and is safe to remove, document the reasoning before removing it.

Prefer deprecation over destructive deletion when uncertain.

==================================================
17. FRONTEND — MINIMAL CHANGES ONLY
==================================================

Phase 1A is backend/integration focused.

Update:

src/lib/api*

with typed clients for the new summary/activity endpoints if appropriate.

It is acceptable to prepare types/interfaces needed by Phase 1B.

DO NOT yet implement:

- new Intelligence briefing
- Lancee Activity tab
- mascot images
- simplified finding cards
- redesigned evidence drawer
- new animations
- visual redesign

ConnectedIntelligencePage should remain visually equivalent to the Phase 0 version.

Do not move it back into App.tsx.

==================================================
18. SECURITY / TENANT ISOLATION
==================================================

All Connected Intelligence data MUST remain workspace scoped.

Never trust:

workspaceId
userId

provided by Hermes/model-generated arguments if Lancee authentication already establishes them.

Use authenticated Lancee context.

Verify that one workspace cannot:

- retrieve another workspace's inspections
- retrieve another workspace's summary
- retrieve another workspace's activity
- retrieve another workspace's findings/evidence

Do not expose message bodies or unrelated personal data through summary/activity endpoints.

==================================================
19. PERFORMANCE
==================================================

Inspection instrumentation must remain lightweight.

Avoid:

- N+1 queries
- huge metadata payloads
- storing duplicate raw event data
- recomputing entire workspace history for every request
- synchronous AI calls merely to create activity descriptions

Activity descriptions should preferably use deterministic templates.

No LLM is required to write:

"Checked recent communication."

Connected Intelligence activity should remain fast and inexpensive.

==================================================
20. VERIFICATION
==================================================

Add focused verification for at least:

A. Inspection with no opportunity

Real intelligence processing occurs.
Inspection persists.
status = all_clear.
No fake opportunity is created.

B. Inspection producing opportunity

Inspection persists.
Existing detector produces/reuses opportunity.
Inspection links correctly.
Existing deduplication remains intact.

C. Insufficient activity

Summary correctly distinguishes insufficient_activity from all_clear.

D. Workspace isolation

Workspace A cannot retrieve Workspace B inspection/activity/summary data.

E. Existing intelligence

Current opportunity endpoints still work.
Current evidence chain still resolves.
Current detector behaviour remains unchanged.

F. Hermes — findings exist

Workspace AI receives current Connected Intelligence data and can describe findings naturally.

G. Hermes — inspections but no findings

Workspace AI can correctly communicate:

"Nothing unusual currently needs your attention."

without referring to legacy Decision Intelligence.

H. Hermes — insufficient data

Workspace AI communicates that there is not enough recent activity.

It must NOT falsely claim everything is normal.

I. Internal terminology

Normal Workspace AI responses do not expose:

decision.list
outcome-review
structured decisions
detector IDs
raw MCP names

unless explicitly requested for technical/debug information.

J. Existing systems

Verify no regression to:

- authentication
- workspace switching
- mail
- calendar
- Connected Intelligence
- Hermes Workspace Chat
- Lancee MCP
- build/typecheck
- existing relevant verification scripts

Run git diff --check.

==================================================
21. DOCUMENTATION
==================================================

Add/update concise technical documentation explaining:

Connected Intelligence:

workspace signals
      ↓
inspection
      ↓
feature calculation
      ↓
detector
      ↓
      ├── no finding → all_clear
      │
      └── finding → connected_opportunity
                       ↓
                    evidence

Explain clearly:

connected_inspections
= what Lancee checked

connected_opportunities
= what Lancee found worth surfacing

workspace_events
= authoritative observed event/evidence layer where currently applicable

Also document the three summary states:

attention_needed
all_clear
insufficient_activity

Document any legacy Decision Intelligence capability intentionally retained and why.

==================================================
22. CHANGELOG
==================================================

Follow the repository's existing changelog convention.

Record:

- inspection persistence
- instrumentation points
- APIs added
- Hermes/Connected Intelligence contract changes
- legacy behaviour deprecated
- verification performed

Do not claim functionality that was not implemented.

==================================================
FINAL REPORT
==================================================

When complete, report:

1. Current architecture discovered during audit.
2. Files created.
3. Files modified.
4. Schema/migration changes.
5. Existing intelligence paths instrumented.
6. New endpoints.
7. MCP/Hermes changes.
8. Legacy Decision Intelligence behaviour retained/removed/deprecated.
9. How no-findings vs insufficient-activity is determined.
10. Verification results.
11. Any existing issues discovered but intentionally not changed.
12. Anything Phase 1B needs to know.

IMPORTANT:

DO NOT CONTINUE INTO PHASE 1B.

STOP after the backend inspection/activity foundation and Hermes Connected Intelligence contract are implemented and verified.

Phase 1B will implement the human-facing Intelligence redesign and Lancee avatars.