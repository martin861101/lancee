You are implementing Lancee Decision Dynamics Phase 1 in the current Lancee repository.

GOAL

Create the smallest production-quality vertical slice that proves:

Activity Ledger
→ Decision
→ Decision Vector
→ Outcome
→ Comparison Candidate

Do not continue into autonomous learning or pattern detection.

============================================================
CORE ARCHITECTURAL RULES
============================================================

1. Lancee owns authoritative:
   - business records
   - evidence
   - decisions
   - metrics
   - outcomes
   - comparison history

2. Hermes is used for:
   - understanding natural language
   - interpreting decision context
   - later semantic reality checking
   - reasoning over evidence

3. Hermes must NOT:
   - calculate authoritative business metrics
   - invent missing measurements
   - infer causality purely from correlation
   - overwrite measured evidence
   - become the database for Decision Intelligence

4. Every Decision Intelligence record is workspace-scoped.

5. Workspace identity must come from trusted Lancee authentication context.

6. Preserve the existing Lancee MCP authentication, permissions,
   approval and canonical-result architecture.

7. Do NOT introduce:
   - graph database
   - event-sourcing rewrite
   - new queue infrastructure
   - autonomous agents
   - reinforcement learning
   - self-adjusting weights
   - new vector database
   - broad embeddings of every event

============================================================
CORE CONCEPT
============================================================

Treat a meaningful business decision as a state transition:

OBJECT
+
ACTION
+
PRIOR STATE
+
INTENT
        ↓
NEW STATE
        ↓
OBSERVED REACTION
        ↓
OUTCOME
        ↓
EVIDENCE
        ↓
LESSON

The “physics” analogy is an abstraction.

Business activity does not obey physical laws.

The useful model is:

Object + Action + Prior State
→ New State
→ Reaction
→ Outcome

============================================================
IMPLEMENT A. WORKSPACE ACTIVITY LEDGER
============================================================

Create an append-oriented:

workspace_events

Suggested fields:

id
workspace_id
actor_id
event_type
entity_type
entity_id
client_id
project_id
conversation_id
payload
importance
occurred_at
processed_at

Create ONE central service:

recordWorkspaceEvent(...)

Do not scatter direct event inserts throughout unrelated services.

Instrument only a small representative set initially.

Examples:

project.created
project.completed
file.created
file.uploaded
message.sent
message.received
invoice.sent
invoice.paid
ai.prompted
decision.created
decision.reviewed

Events are FACTS.

Events are not memories or decisions by themselves.

============================================================
IMPLEMENT B. DECISIONS
============================================================

Create a structured decision entity.

Suggested fields:

id
workspace_id
actor_id

object_type
object_id

client_id
project_id
conversation_id

title
decision_text
rationale
intent

decided_at
status

created_at
updated_at

A decision must preserve provenance.

Example:

Decision:
Use previous-generation bumper on 2026 Polo Vivo.

Rationale:
Test whether styling can maintain or increase demand.

============================================================
IMPLEMENT C. DECISION VECTOR
============================================================

Create:

decision_vectors

Suggested fields:

decision_id
workspace_id

object_type
action_type
target_type

source_state
destination_state

intent_type
expected_direction

vector_version

created_at

Example:

{
  "object_type": "product",
  "action_type": "reuse_component",
  "target_type": "bumper",
  "source_state": "previous_generation",
  "destination_state": "current_generation",
  "intent_type": "increase_sales",
  "expected_direction": "positive"
}

Stage 1 structural comparison must use these normalized fields.

Do NOT use an LLM for initial structural similarity.

============================================================
IMPLEMENT D. EXPECTED REACTION
============================================================

A decision should optionally record what the business expects to happen.

Example:

metric:
avg_monthly_sales

direction:
increase

expected_change:
optional

confidence:
0.60

This allows Lancee to later compare:

EXPECTED
vs
ACTUAL

Prediction errors are valuable learning events.

============================================================
IMPLEMENT E. DECISION METRICS
============================================================

Create:

decision_metrics

Suggested fields:

decision_id
workspace_id

metric_key
unit

baseline_value
baseline_window_start
baseline_window_end

observed_value
observation_window_start
observation_window_end

change_absolute
change_percent

created_at

All arithmetic MUST be deterministic.

For example:

baseline = 1420
observed = 1221

change =
1221 - 1420

percentage =
(change / baseline) * 100

Do not ask Hermes to calculate authoritative metrics.

Cover calculations with tests.

============================================================
IMPLEMENT F. OUTCOMES
============================================================

Create:

decision_outcomes

Suggested fields:

decision_id
workspace_id

outcome_direction
outcome_class

observed_reason

evidence_confidence
causal_confidence

reviewed_at

Example:

{
  "outcome_direction": "negative",
  "outcome_class": "sales_declined",
  "evidence_confidence": 0.91,
  "causal_confidence": 0.32
}

Important:

A measured sales decline may be HIGH confidence.

The assertion:

"The bumper caused the decline"

may simultaneously be LOW confidence.

These must remain separate concepts.

============================================================
IMPLEMENT G. DECISION EVIDENCE
============================================================

Create:

decision_evidence

Suggested fields:

id
workspace_id
decision_id

source_type
source_id

relation
summary
weight

created_at

Possible source types:

conversation
message
file
invoice
project
client
metric
meeting
proposal
event

Every important Decision Intelligence claim should be traceable.

============================================================
IMPLEMENT H. CONFOUNDERS
============================================================

Create:

decision_confounders

Suggested fields:

id
workspace_id
decision_id

factor_type
factor_value

significance
evidence_source_id

created_at

Examples:

price_increase
marketing_budget_change
inventory_shortage
competitor_launch
seasonality
interest_rate_change
distribution_change

Confounders must reduce causal confidence where appropriate.

============================================================
IMPLEMENT I. DECISION COMPARISONS
============================================================

Create:

decision_comparisons

Suggested fields:

id
workspace_id

decision_a_id
decision_b_id

structural_similarity
contextual_similarity

evidence_confidence
recency_relevance

comparison_confidence

comparable

shared_factors_json
material_differences_json

comparison_version
model_version

created_at

Stage 1 comparison must be deterministic.

============================================================
STRUCTURAL SIMILARITY
============================================================

Implement a bounded deterministic scoring service.

Conceptually compare:

object_type
action_type
target_type
source_state
destination_state
intent_type
expected_direction

Example starting weighting:

action_type         0.25
object_type         0.15
target_type         0.15
source_state        0.15
intent_type         0.20
expected_direction  0.10

Keep weights:

centralized
versioned
configurable

Do NOT scatter them throughout the codebase.

Return only a bounded number of top candidates.

Example:

Candidate A: 0.91
Candidate B: 0.73
Candidate C: 0.41

Use a configurable threshold.

============================================================
TWO-STAGE COMPARISON
============================================================

The architecture is:

NEW DECISION
        ↓
DECISION VECTOR
        ↓
STRUCTURAL RETRIEVAL
        ↓
EVIDENCE FILTER
        ↓
CONFIDENCE THRESHOLD
        ↓
SEMANTIC REALITY CHECK
        ↓
COMPARABLE?
   YES        NO
    ↓          ↓
Evidence    discard /
Pack        downgrade

Stage 1:
deterministic.

Stage 2:
Hermes.

============================================================
SEMANTIC REALITY CHECK
============================================================

Create the service/interface contract for Stage 2.

It accepts:

new decision
historical candidate
original decision language
rationale
constraints
relevant evidence
material business context

It returns something conceptually like:

{
  "contextual_similarity": 0.87,
  "comparable": true,

  "shared_factors": [
    "previous-generation component reused",
    "newer product modified",
    "sales performance is target outcome"
  ],

  "material_differences": [
    "different vehicle segment",
    "different customer demographic",
    "different market period"
  ]
}

Do not make this autonomous in Phase 1.

Implement the interface and mock/stub it in tests if required.

============================================================
CONFIDENCE MODEL
============================================================

Keep separate:

structural_similarity
contextual_similarity
evidence_confidence
causal_confidence
comparison_confidence

Example initial composite:

comparison_confidence =

structural_similarity * 0.35
+
contextual_similarity * 0.30
+
evidence_confidence * 0.25
+
recency_relevance * 0.10

This formula must:

- live centrally
- be versioned
- be testable

Do not treat these exact weights as permanent.

Causal confidence remains separate.

============================================================
ACCURACY RULES
============================================================

These are hard requirements.

Never transform:

"sales declined after the bumper change"

into:

"the bumper caused sales to decline"

without sufficient causal evidence.

Correlation is not causation.

Missing baseline data:

→ INCONCLUSIVE

Missing post-decision measurement:

→ PENDING / INCONCLUSIVE

Conflicting evidence:

→ lower confidence

Significant confounders:

→ lower causal confidence

Do not invent missing values.

============================================================
ACCEPTANCE EXAMPLE
============================================================

Historical decision:

January 2026

Object:
2026 VW Polo Vivo

Action:
reuse_component

Target:
bumper

Source:
previous_generation

Intent:
increase_or_preserve_sales

Baseline average monthly sales:
1420

Observed average monthly sales:
1221

Observation window:
4 months

Calculated change:
-14.01%

Outcome:
negative

Evidence confidence:
high

Causal confidence:
low

--------------------------------------------

New decision:

August 2026

Object:
Mini Van XT

Action:
reuse_component

Target:
bumper

Source:
2024 generation

Intent:
increase_sales

Expected system behaviour:

1. Normalize both decisions.

2. Detect structural similarity.

3. Return the January decision as a candidate.

4. Surface the measured -14.01% result.

5. Do NOT claim the bumper caused the decline.

6. Produce a bounded comparison object suitable for
   the later Hermes semantic reality check.

============================================================
MCP
============================================================

Add Decision Dynamics MCP capabilities only where useful.

Examples:

list_decisions
get_decision
compare_decision
get_decision_evidence
get_decision_outcome

Mutation tools such as:

create_decision
record_outcome

must use Lancee's existing approval/security model.

Use the existing canonical MCP result contract:

LIST:
data.results[N].id

SINGLE:
data.resource.id

ERROR:
error.code
error.message

Do not create new result-envelope conventions.

============================================================
SECURITY
============================================================

All queries must be constrained using trusted:

context.workspace.id

Do not accept model-generated workspace IDs as authorization.

Cross-workspace IDs must return:

not found
or
access denied

Add explicit isolation tests.

============================================================
TESTS
============================================================

Add tests for:

workspace event recording

workspace isolation

decision creation

decision evidence provenance

vector normalization

deterministic baseline calculations

percentage change calculations

expected vs actual reaction

structural scoring

similar decision ranking

different decision rejection

low-evidence downgrade

confounder effect on causal confidence

comparison-confidence calculation

causal-confidence separation

comparison provenance

MCP result composability if MCP tools are introduced

============================================================
FIRST VERTICAL SLICE
============================================================

Freeze scope here:

Activity Ledger
        ↓
Decision
        ↓
Decision Vector
        ↓
Outcome
        ↓
Comparison Candidate

STOP THERE.

Do NOT implement yet:

autonomous pattern detection
self-adjusting weights
reinforcement learning
proactive decision warnings
organisation-wide causal models
graph databases
automatic long-term lessons
automatic memory consolidation

Those are later phases.

============================================================
FINAL REPORT
============================================================

When finished report:

1. Schema/migrations added
2. Services added
3. Event recording implementation
4. Decision Vector taxonomy
5. Structural scoring formula
6. Scoring version
7. Outcome calculations
8. Evidence/confounder model
9. Comparison output example
10. Workspace isolation results
11. Tests added
12. Test results
13. MCP tools added, if any
14. Remaining Phase 2 work

Do not mark Phase 1 complete until the bumper example can be represented,
measured, structurally compared and returned as a candidate without making
an unsupported causal claim.
