
## Ambient Intelligence and Signal Engine

Lancee Decision Intelligence should not depend on users manually telling the
assistant what to remember.

Normal authorised workspace activity becomes the input.

Sources may include:

- Lancee projects
- tasks
- files
- quotes
- invoices
- payments
- client interactions
- AI conversations
- email
- WhatsApp
- meetings
- connected business systems

The ingestion architecture is:

WORKSPACE ACTIVITY
        ↓
ACTIVITY LEDGER
        ↓
SIGNAL ENGINE
        ↓
DECISION CANDIDATE
        ↓
CONFIDENCE GATE
        ↓
DECISION DYNAMICS
        ↓
OUTCOME TRACKING
        ↓
EVIDENCE ENGINE
        ↓
WORKSPACE MEMORY

The system must distinguish between:

FACT
DECISION CANDIDATE
INTERPRETATION
CAUSAL CLAIM
NOISE

Facts may generally be captured automatically when they originate from an
authoritative Lancee or connected system.

AI-derived interpretations must retain their provenance and confidence.

Causal claims must never be promoted to facts merely because an LLM considers
them plausible.

2. Decision Candidate Schema

Add a layer before decisions.

CREATE TABLE decision_candidates (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,

    source_event_id UUID,
    source_type TEXT NOT NULL,
    source_id TEXT,

    object_type TEXT,
    object_id TEXT,

    action_type TEXT,
    target_type TEXT,
    source_state TEXT,
    destination_state TEXT,

    intent_type TEXT,
    expected_metric TEXT,
    expected_direction TEXT,

    candidate_text TEXT NOT NULL,
    rationale_text TEXT,

    detection_method TEXT NOT NULL,
    detection_confidence NUMERIC(5,4) NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

Recommended statuses:

pending
auto_promoted
confirmed
edited
rejected
expired

The important distinction is:

decision_candidate != decision

A candidate is what Lancee thinks may have happened.

A decision is something the system has enough evidence to treat as part of Decision Intelligence.


---

3. Signal Detection Service

async function processWorkspaceEvent(event, context) {
  // 1. The Activity Ledger event is already authoritative.
  // Never reinterpret the underlying factual event.

  if (!isIntelligenceRelevant(event)) {
    return { classification: 'noise' }
  }

  // 2. Extract deterministic signals first.
  const deterministicSignals = detectStructuredSignals(event)

  if (deterministicSignals.isDecision) {
    return createDecisionCandidate({
      workspaceId: context.workspace.id,
      sourceEventId: event.id,
      detectionMethod: 'structured',
      detectionConfidence: deterministicSignals.confidence,
      ...deterministicSignals.vector,
    })
  }

  // 3. Only send potentially meaningful events to semantic classification.
  if (!shouldRequestSemanticClassification(event)) {
    return { classification: 'activity_only' }
  }

  return classifyDecisionSignal(event, context)
}

Do not send every Activity Ledger event to Hermes.

That's important for cost, latency and noise.


---

4. Cheap Signal Filter

Before Hermes gets involved:

const DECISION_SIGNAL_PATTERNS = [
  /\bwe decided\b/i,
  /\bwe agreed\b/i,
  /\bagreed\b/i,
  /\bapproved\b/i,
  /\bgo ahead\b/i,
  /\blet'?s use\b/i,
  /\blet'?s change\b/i,
  /\bwe(?:'ll| will) use\b/i,
  /\bwe(?:'ll| will) change\b/i,
  /\bfrom next month\b/i,
  /\bstarting next\b/i,
  /\bsee if\b/i,
  /\btest whether\b/i,
]

function hasDecisionLanguage(text = '') {
  return DECISION_SIGNAL_PATTERNS.some(pattern => pattern.test(text))
}

Don't treat this as the actual classifier.

It's only:

Should Hermes inspect this?
YES / NO


---

5. Hermes Semantic Classification Contract

When a signal is worth inspecting, give Hermes a bounded classification task, rather than asking it to "remember" the conversation.

{
  "task": "classify_workspace_signal",

  "event": {
    "type": "message.received",
    "text": "Agreed. Let's use the 2024 bumper on the Mini Van XT from September and see if sales improve."
  },

  "known_context": {
    "project": "Mini Van XT",
    "client": null
  },

  "allowed_classifications": [
    "decision_candidate",
    "fact",
    "hypothesis",
    "discussion",
    "noise"
  ]
}

Expected structured response:

{
  "classification": "decision_candidate",

  "confidence": 0.94,

  "decision": {
    "object_type": "product",
    "object_reference": "Mini Van XT",

    "action_type": "reuse_component",
    "target_type": "bumper",

    "source_state": "2024_generation",
    "destination_state": "current_product",

    "intent_type": "increase_sales",

    "expected_metric": "monthly_sales",
    "expected_direction": "increase",

    "effective_from": "2026-09"
  },

  "evidence": {
    "supporting_text": "Agreed. Let's use the 2024 bumper...",
    "reason": "Explicit agreement followed by an implementation instruction and measurable intended outcome."
  }
}

Hermes should return structured interpretation.

Lancee decides what happens to it.


---

6. Confidence Gate

Do not hard-code this all over the application.

Create one policy:

const DECISION_CAPTURE_POLICY = {
  autoPromoteThreshold: 0.90,
  reviewThreshold: 0.65,
}

function decisionCandidateAction(candidate) {
  if (candidate.detectionConfidence >=
      DECISION_CAPTURE_POLICY.autoPromoteThreshold) {
    return 'auto_promote'
  }

  if (candidate.detectionConfidence >=
      DECISION_CAPTURE_POLICY.reviewThreshold) {
    return 'request_review'
  }

  return 'activity_only'
}

Conceptually:

0.90 – 1.00
HIGH CONFIDENCE
→ automatically create decision
→ show transparently to user

0.65 – 0.89
MEDIUM CONFIDENCE
→ create candidate
→ ask user to confirm

0.00 – 0.64
LOW CONFIDENCE
→ retain source event
→ don't pollute Decision Memory

The exact thresholds should be configurable/versioned rather than considered permanent.


---

7. Human Review Feedback

This is important.

async function reviewDecisionCandidate({
  candidateId,
  action,
  corrections,
  context,
}) {
  const candidate = await getDecisionCandidate(
    candidateId,
    context.workspace.id,
  )

  switch (action) {
    case 'confirm':
      return promoteCandidate(candidate, context)

    case 'edit':
      return promoteCandidate(
        applyCorrections(candidate, corrections),
        context,
      )

    case 'reject':
      return rejectCandidate(candidate, context)

    default:
      throw new Error('Unsupported candidate review action')
  }
}

And retain the classification result:

{
  "machine_classification": "decision_candidate",
  "machine_confidence": 0.78,

  "human_classification": "not_a_decision",

  "review_result": "rejected"
}

Do not delete rejected candidates from the intelligence/audit history.

That information can eventually help evaluate and improve detection accuracy.


---

8. Structured Event + Language Fusion

This should be one of Lancee's strongest mechanisms.

Example:

EMAIL

"The client thinks we're too expensive.
Drop it to R42k and let's see if they accept."

              +

LANCEE EVENT

quote.amount_changed
R50,000 → R42,000

              ↓

       SIGNAL FUSION

              ↓

DECISION

object:
quote

action:
reduce_price

previous_state:
R50,000

new_state:
R42,000

change:
-16%

reason:
client price objection

intent:
increase deal conversion

Implementation interface:

async function enrichEventWithContext(event, context) {
  const relatedEvents = await findRelatedWorkspaceEvents({
    workspaceId: context.workspace.id,
    entityType: event.entity_type,
    entityId: event.entity_id,
    around: event.occurred_at,
    limit: 10,
  })

  return {
    event,
    relatedEvents,
  }
}

This lets Lancee combine hard system facts with human rationale.


---

9. Provenance Requirements

Every promoted decision should answer:

> Why does Lancee believe this?



Store:

{
  "decision_id": "dec_123",

  "provenance": [
    {
      "type": "email",
      "id": "msg_981",
      "relation": "decision_language"
    },
    {
      "type": "quote",
      "id": "quote_231",
      "relation": "state_change"
    },
    {
      "type": "workspace_event",
      "id": "evt_771",
      "relation": "observed_action"
    }
  ]
}

This eventually powers a UI such as:

WHY LANCEE KNOWS THIS

Decision
Reduce quote from R50,000 to R42,000

Evidence
✓ Client email
✓ Quote revision
✓ Workspace activity

Interpretation confidence
94%

[Correct] [Edit] [Not a decision]


---

10. Add These Events to the Activity Ledger

Extend the event taxonomy:

communication.received
communication.sent

meeting.created
meeting.completed

project.created
project.updated
project.completed

task.created
task.completed

file.created
file.uploaded
file.updated

quote.created
quote.updated
quote.approved
quote.rejected

invoice.created
invoice.sent
invoice.paid
invoice.overdue

payment.received

client.created
client.updated

ai.prompted
ai.responded

decision_candidate.detected
decision_candidate.confirmed
decision_candidate.rejected

decision.created
decision.updated
decision.reviewed

outcome.observation_started
outcome.observation_completed
outcome.recorded


---

11. Important Privacy / Connection Boundary

Put this directly into the architecture:

### Connected Communication Boundary

Lancee may only analyse communications made available through an explicitly
authorised workspace connection.

A connected channel does not imply unrestricted organisational surveillance.

Every ingested communication must retain:

- workspace ownership
- connection identity
- source channel
- source identifier
- timestamp
- related participant/entity references where permitted

Decision Intelligence must respect the permissions of the originating
connection and Lancee workspace.

Hermes is a processing/orchestration component.

Lancee remains authoritative for workspace intelligence records.

Hermes must not independently convert private communication into authoritative
workspace facts outside Lancee's ingestion and evidence policies.

That will matter considerably when Lancee eventually becomes multi-tenant.


---

12. Updated Architecture

This is now the architecture I'd use:

EMAIL   WHATSAPP   MEETINGS   FILES   PROJECTS   MONEY
   │        │          │         │        │         │
   └────────┴──────────┴─────────┴────────┴─────────┘
                         │
                         ▼
                 ACTIVITY LEDGER
                 "What happened?"
                         │
                         ▼
                   SIGNAL ENGINE
                 "Does it matter?"
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
           NOISE              DECISION CANDIDATE
                                         │
                                  Confidence Gate
                                         │
                           ┌─────────────┼────────────┐
                           ▼             ▼            ▼
                         HIGH          MEDIUM         LOW
                           │             │             │
                       Promote       Ask user       Ignore
                           │             │
                           └──────┬──────┘
                                  ▼
                             DECISION
                                  │
                                  ▼
                         DECISION VECTOR
                    Object + Action + State
                                  │
                                  ▼
                         OUTCOME TRACKING
                                  │
                                  ▼
                          EVIDENCE ENGINE
                                  │
                                  ▼
                       DECISION COMPARISON
                                  │
                         Structural Match
                                  │
                                  ▼
                     Hermes Reality Check
                                  │
                                  ▼
                         WORKSPACE MEMORY
                                  │
                                  ▼
                               LANCEE
                       "What did we learn?"

This should be inserted before the Decision Dynamics sections in the architecture doc, because it answers the missing question: where do decisions come from in the first place?

And for the implementation agent, I'd add Signal Engine as Phase 1A, before the existing Activity Ledger → Decision → Vector → Outcome → Comparison slice. That way we aren't building Decision Dynamics around manually entered test data and then having to retrofit passive ingestion afterward.
