IMPORTANT ARCHITECTURE UPDATE — LANCEE DECISION INTELLIGENCE

In addition to the current Hermes session/memory isolation work, prepare the
architecture for Lancee's primary differentiating feature:

LANCEE DECISION INTELLIGENCE

Do not abandon or restart the current task. Incorporate this into the
workspace-memory architecture you are already implementing.

============================================================
CORE IDEA
============================================================

Each Lancee workspace should develop its own persistent business intelligence
over time.

Example:

User:
"Lancee, what do you think about merging Product A and Product B so we can
sell the old stock?"

Lancee:

"I wouldn't recommend it. You tried a similar strategy two months ago after
losing the Meridian deal. It moved only 14% of the old stock and reduced
margin on Product A by 11%.

A Product-B-only promotion performed better last quarter."

The important feature is NOT simply remembering conversations.

Lancee should eventually understand:

- what decisions were made
- why they were made
- what evidence existed
- what outcome was expected
- what actually happened
- whether the decision worked
- what was learned
- whether a current proposal resembles a previous decision

============================================================
1. WORKSPACE = PERSISTENT BUSINESS BRAIN
============================================================

Implement/retain the architecture:

Lancee Workspace
        ↓
Persistent Hermes workspace profile/memory
        ↓
    ┌───────────────┐
    │ Business      │
    │ Intelligence  │
    └───────────────┘
        ↓
Individual Hermes sessions
        ↓
Individual Lancee conversations

Each workspace gets ONE isolated persistent Hermes identity/profile.

Conceptually:

lancee_ws_<workspaceId>

This profile persists for the lifetime of the workspace.

NEVER use Hermes' existing/default/personal profile.

NEVER fall back to the default profile if workspace profile resolution fails.

FAIL CLOSED.

============================================================
2. TWO DIFFERENT TYPES OF MEMORY
============================================================

Keep these concepts separate.

A) CONVERSATION CONTEXT

Example:

"We are currently discussing Lancee Power."
"The document I just generated is lancee-power-pricing.pdf."

This belongs primarily to the active Hermes session.

B) BUSINESS INTELLIGENCE

Example:

"Acme normally pays late."
"We discounted Acme because recurring work was expected."
"The bundle promotion in June failed."
"Sarah normally approves artwork."

This may persist across conversations within the SAME workspace.

A new conversation should NOT inherit random conversation chatter.

It MAY benefit from relevant workspace business intelligence.

============================================================
3. DO NOT MAKE HERMES MEMORY THE ONLY SOURCE OF TRUTH
============================================================

Hermes persistent memory can assist retrieval/reasoning.

However, strategically important business intelligence should eventually
be represented as structured Lancee data.

Prepare for entities equivalent to:

Decision
- id
- workspaceId
- clientId?
- projectId?
- title
- description
- rationale
- expectedOutcome
- actualOutcome
- status
- confidence
- decidedAt
- reviewedAt?
- source references
- createdBy

Do NOT necessarily create this entire schema during the current task if it
would substantially expand scope.

However:

Design the current memory/profile/session architecture so Decision
Intelligence can be added cleanly without another major refactor.

============================================================
4. PROVENANCE IS ESSENTIAL
============================================================

Lancee must eventually be able to explain WHY it remembers something.

Decision Intelligence must support evidence/source references.

Example:

Recommendation:
DON'T MERGE PRODUCTS

Evidence:

Decision — 18 June
Product A + C bundle

Outcome:
14% inventory reduction

Margin impact:
-11%

Context:
Introduced after Meridian deal was lost

Lancee must NOT invent historical business facts merely because Hermes
memory vaguely recalls something.

Where possible, intelligence should link back to authoritative Lancee
records such as:

conversation
email
project
task
invoice
file
client
payment
activity
decision
automation

============================================================
5. INTELLIGENCE LOOP
============================================================

Design toward:

BUSINESS ACTIVITY
      ↓
Conversation / Email / Project / Invoice / Task / File
      ↓
Potential insight/decision detected
      ↓
Structured business intelligence
      ↓
Outcome observed later
      ↓
Decision evaluated
      ↓
Lesson learned
      ↓
Future recommendation

Conceptually:

DECISION
   ↓
WHY?
   ↓
EXPECTED OUTCOME
   ↓
WHAT ACTUALLY HAPPENED?
   ↓
LESSON
   ↓
FUTURE DECISION

============================================================
6. DECISION COMPARISON
============================================================

The future system should support:

Current proposal
      ↓
search relevant historical decisions
      ↓
compare circumstances
      ↓
compare outcomes
      ↓
generate recommendation

Example:

"Should we discount this client?"

Lancee could eventually answer:

"Possibly, but change the terms.

Your last two discounted projects for similar clients exceeded the revision
allowance and had lower effective margins.

I'd recommend a 50% deposit and two-revision limit."

This should be based on actual workspace evidence, not generic AI advice.

============================================================
7. CURRENT TASK PRIORITY
============================================================

DO NOT allow this addition to derail the current production-blocking fix.

Priority remains:

1. Workspace isolation
2. Hermes profile isolation
3. Conversation/session continuity
4. Artifact continuity
5. Lancee Files integration
6. Tenant security
7. Regression tests

Decision Intelligence architecture is SECONDARY during this task.

Implement foundations where they naturally belong.

Do not build an enormous analytics subsystem right now.

============================================================
8. IMPORTANT PROFILE MODEL
============================================================

Target:

Hermes
│
├── existing/default profile
│      └── NEVER USED BY LANCEE
│
├── lancee_ws_A
│      ├── persistent workspace memory
│      ├── conversation/session A1
│      ├── conversation/session A2
│      └── scheduled agent runs
│
├── lancee_ws_B
│      ├── persistent workspace memory
│      ├── conversation/session B1
│      └── scheduled agent runs
│
└── lancee_ws_C
       └── ...

Workspace A must NEVER access memory from B/C/default.

============================================================
9. SCHEDULED INTELLIGENCE
============================================================

Keep the architecture compatible with future Hermes scheduled runs.

Example:

Decision made:
"Discount Acme because recurring work is expected."

90 days later:

Hermes scheduled review
        ↓
Lancee MCP
        ↓
Check:
- additional Acme projects
- revenue
- margin
- payment behaviour
        ↓
Decision outcome updated
        ↓
Business lesson stored

This enables Lancee to learn whether business decisions actually worked.

Scheduled runs MUST execute under the correct workspace Hermes profile and
Lancee authorization context.

============================================================
10. PRODUCT PRINCIPLE
============================================================

The goal is NOT:

"AI that remembers chat."

The goal is:

"AI that understands how this business makes decisions and learns from
what happened afterwards."

Think of the persistent workspace profile as the business brain.

Hermes provides reasoning/memory/orchestration.

Lancee provides authoritative business records.

Lancee MCP connects them.

Structured Decision Intelligence provides durable, auditable learning.

============================================================
11. CURRENT IMPLEMENTATION REPORT

In the final report for the current task, add a section:

DECISION INTELLIGENCE READINESS

Explain:

- how workspace persistent memory now works
- how conversations remain independently scoped
- how future decisions can be stored
- how provenance/source references can be retained
- how historical decisions can be retrieved
- how scheduled outcome reviews could work
- what needs to be implemented later
- whether any current architecture would block this feature

Do not claim Decision Intelligence is implemented unless it actually is.

The immediate objective is to make the architecture READY for it while
fixing the current Hermes isolation/session issue.
