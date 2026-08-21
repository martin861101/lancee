# Lancee Decision Intelligence Phase 3

Phase 3 completes the previously deferred Decision Intelligence boundaries:

```text
Measured workspace decisions
  → deterministic pattern detection
  → empirical outcome prediction
  → evidence-backed proactive warning
  → measured prediction error
  → human-labelled weight calibration
```

It also adds a bounded causal-assessment record. The implementation is
workspace-scoped, versioned, deterministic, and evidence constrained. Hermes
may explain persisted results, but it does not detect patterns, calculate
predictions, adjust weights, issue warnings, or calculate causal estimates.

## Autonomous cycle

The existing scheduler runs a bounded Decision Intelligence cycle at most once
every five minutes for up to 20 workspaces per pass. A user with decision-write
permission can also request an approved refresh through
`refresh_decision_intelligence`.

Each workspace is processed independently. A failure is returned for that
workspace and does not stop or contaminate another workspace. The cycle:

1. calibrates structural weights when enough human labels exist;
2. refreshes measured-outcome patterns;
3. creates or refreshes predictions for unmeasured expected metrics;
4. creates a warning only when qualifying history contradicts the expectation.

## Adaptive structural weights

Only the latest explicit human review for each comparison is training data.
Calibration requires at least eight reviewed comparisons, including at least
two comparable and two non-comparable labels. Each structural field receives a
Laplace-smoothed discrimination score. Its base weight may move by no more than
20 percent before all weights are normalized back to one.

Every accepted model stores its parameters, sample counts, class balance,
training-data hash, base model version, and immutable derived model version.
The prior active model is marked `superseded`. If the threshold is not met,
Lancee continues to use the frozen base weights. Hermes output and measured
outcome values are never training labels for this calibration.

## Patterns and predictions

Patterns use exact Decision Vector dimensions—object, action, target, intent—
plus metric key. Only measured outcomes with a finite percentage change are
eligible. At least three observations are required.

The detector records sample size, positive/negative/neutral counts,
evidence-weighted mean change, standard deviation, dominant direction, source
decision IDs, detector version, and three separate confidence dimensions:
evidence, causal, and pattern. Pattern confidence combines bounded sample
coverage, directional consistency, and evidence confidence. Causal confidence
is stored but does not increase pattern confidence.

A prediction is an empirical estimate from a qualifying pattern. It retains
the mean percentage change, direction, 95 percent sampling interval, sample
size, source decision IDs, confidence, and model version. When the real outcome
is recorded, Lancee stores the actual direction, actual change, and absolute
prediction error. Predictions are not facts and are never presented without
their interval and provenance.

## Proactive warnings

A warning is created only when:

- an active decision has an unmeasured expected metric;
- a matching pattern has enough evidence;
- prediction confidence is at least `0.65`; and
- the empirical direction contradicts the recorded expected direction.

The warning stores the pattern, prediction, source decisions, interval,
expected direction, policy version, and an explicit `causalClaim: false` flag.
A workspace/decision/metric/type/version uniqueness boundary prevents duplicate
warnings and duplicate notifications. Users can acknowledge or dismiss an
active warning. Recording the outcome resolves it automatically.

## Causal assessment boundary

Every measured outcome receives one of two explicit assessments:

- `observational_pre_post` / `association_only`: the before/after change is an
  association and does not establish a counterfactual;
- `controlled_before_after` / `controlled_estimate`: Lancee calculates the
  treatment change minus control change when both control measurements are
  supplied.

The controlled estimate records parallel-trends, comparable-window, and
unrecorded-confounder assumptions. Its inference confidence is bounded by the
lower of evidence and causal confidence, a design factor, and the strongest
known confounder. It is still not proof of causality. Lancee does not infer a
control group, invent missing observations, or upgrade an association into a
causal claim.

## Persistence and tools

Phase 3 adds:

- `decision_learning_models`;
- `decision_patterns`;
- `decision_predictions`;
- `decision_warnings`;
- `decision_causal_assessments`.

All five tables include `workspace_id`, database checks, uniqueness boundaries,
foreign keys, and workspace-first indexes. The MCP/capability surface adds:

- `refresh_decision_intelligence`;
- `list_decision_patterns`;
- `list_decision_predictions`;
- `list_decision_warnings`;
- `review_decision_warning`;
- `get_decision_causal_assessment`;
- `get_decision_learning_model`.

Refresh and warning review retain the existing approval boundary. Reads retain
authentication, permission, canonical result-contract, and tenant isolation.
The workspace assistant and native Hermes agent are instructed to use only
persisted records and keep all confidence dimensions distinct.

## Query scope and empty results

`list_decisions` / `decision.list` is the authoritative entry point for
questions about the inputs used to make decisions. Its records include the
original decision language, rationale, intent, normalized Decision Vector, and
expected reactions. An explicit decision ID can then be used to read its
attached evidence.

`list_decision_reviews` / `decision.list-reviews` queries only the outcome-
review queue. Its result includes a deterministic scope and empty-result
meaning. Zero matching reviews means only that no outcome review matches the
query; it cannot establish whether decisions, evidence, or business inputs
exist. The same non-generalization rule applies to empty warning, prediction,
and pattern collections. Both the direct assistant and constrained agent route
decision-input inquiries to the decision ledger before response synthesis.

## PostgreSQL verification

The migration and behavior were verified on the deployment's
`agent-app-db-1` PostgreSQL 16 server through host port `5433`. The verifier
created a guarded `lancee_decision_verify_phase3_*` database, inspected all
Phase 1–3 tables, checks, indexes, and foreign keys, and exercised patterns,
predictions, warnings, controlled estimates, deterministic comparisons, and
two-workspace isolation. A trap dropped the temporary database. No production
workspace or application data was read, changed, or deleted.

The real server exposed one compatibility issue not visible in the in-memory
adapter: PostgreSQL could not infer the type of a nullable measured prediction
parameter. The completion query now uses a portable explicit `REAL` cast. The
corrected query passes both SQLite and PostgreSQL verification.

Run the local verification with:

```bash
npm run verify:decision-phase3
npm run verify:decision-phase2
npm run verify:dynamics
npm run verify:mcp-contracts
npm run verify:capabilities
npm run verify:agent
npm run verify:codex-connector
npm run lint
npm run build
```

Run `verify:dynamics-postgres` only against an isolated database whose name
matches the guard in `scripts/verify-decision-postgresql.mjs`.

## Deliberate limits

Phase 3 does not add reinforcement learning, unconstrained model retraining,
LLM-generated patterns, invented evidence, cross-workspace learning, automatic
business actions, or causal proof. New outcome measurements can change the
next versioned pattern and prediction, while structural weights change only
from sufficient explicit human comparison labels.
