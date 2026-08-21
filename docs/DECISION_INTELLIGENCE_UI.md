# Lancee Decision Intelligence UI

## Purpose

The authenticated **Intelligence** workspace turns Lancee's persisted Decision
Intelligence into a user-facing evidence experience. It answers what Lancee has
learned, what supports that learning, what it estimates, what requires
attention, and where the decision record came from.

The route is `/dashboard/intelligence`. It is a first-class Business navigation
destination and remains separate from Analytics:

- Analytics describes operating activity and system performance.
- Intelligence explains what Lancee has learned from recorded decisions and
  measured outcomes.

## Architecture retained

The UI does not calculate intelligence and does not introduce another learning
engine. The authoritative flow remains:

```text
Workspace activity
  → workspace events and deterministic signals
  → Decision Dynamics
  → Decision Learning
  → persisted decisions, outcomes, patterns, predictions, and warnings
  → Intelligence UI
  → human inspection and Ask Lancee
```

Hermes remains an explanation and contextual-assessment boundary. It does not
generate patterns, predictions, warnings, evidence, confidence values, or
causal claims for the page.

## Capability map

| UI requirement | Existing source reused | Capability used |
| --- | --- | --- |
| Decision Explorer | `decisions`, vectors, expected reactions, observation reviews | `list_decisions`, `get_decision` |
| Measured results | outcomes, metrics, expected-versus-actual, confounders, causal assessment | `get_decision_outcome` |
| Evidence drill-down | `decision_evidence` | `get_decision_evidence` |
| Learned patterns | `decision_patterns` | `list_decision_patterns` |
| Predictions | `decision_predictions` | `list_decision_predictions` |
| Warning lifecycle | `decision_warnings` | `list_decision_warnings`, `review_decision_warning` |
| Outcome review state | `decision_observation_reviews` | `list_decision_reviews` |
| Manual refresh | existing bounded deterministic learning cycle | `refresh_decision_intelligence` |
| Ask Lancee | persisted agent runtime and decision capability routing | existing workspace assistant |
| Exact overview, map, timeline | aggregates of existing tables and `workspace_events` | `get_decision_intelligence_overview` |

The overview capability is the only backend gap added for this experience. It
is read-only, permission-checked, workspace-scoped, bounded to 24 recent
intelligence events, and does not run the learning cycle. It reports exact
counts, real object-category relationships, implementation thresholds, the
active learning model when one exists, and persisted timeline events.

## Page behavior

### Learning overview

The hero and metric cards use authoritative aggregate counts. A zero pattern,
prediction, warning, or review count is never generalized into an empty
decision ledger. The ledger count comes only from `decisions`.

Learning Progress reports discrete recorded facts:

- decisions recorded;
- measured outcome metrics;
- active reliable patterns.

It does not display a fabricated universal AI-learning percentage. The early
workspace explanation uses the actual `minimumPatternSamples` policy value.

### Intelligence map and timeline

The map contains only object types present in the workspace's persisted
decisions, patterns, predictions, or active warnings. Each node exposes exact
decision, measured-outcome, pattern, prediction, and warning counts. Selecting
a node opens its source counts and can filter the Decision Explorer.

The timeline reads only persisted `decision.*` and `outcome.*` workspace events.
No event or timestamp is manufactured.

### Patterns, predictions, and warnings

Pattern cards retain sample size, measured mean change, pattern confidence, and
evidence confidence. Their drawer also keeps causal confidence separate.

Prediction cards state that the value is an estimate, include the 95 percent
sampling interval, source sample, prediction confidence, status, model version,
and measured error when available.

Warning cards retain severity, status, confidence, expected direction,
historical estimate, range, policy version, and supporting decisions. The UI
states the persisted `causalClaim: false` boundary. Acknowledge and dismiss use
the existing warning review operation; measured outcomes continue to resolve
warnings in the existing backend.

### Decision detail and provenance

The shared side drawer lazy-loads one decision's full record, vector, expected
reactions, measured outcome, metric changes, evidence, causal assessment, and
related prediction. Pattern, prediction, and warning drawers link back to their
persisted source decision IDs.

The explorer loads 25 recent decisions initially and can increase the bounded
query to 100. Search and filters operate on the loaded ledger slice. This avoids
loading the entire history on page entry.

### Ask Lancee

Suggested and free-form questions open the existing workspace assistant with
the question prefilled. That assistant already routes decision questions to
the current workspace-scoped capabilities and retains the rule that empty
secondary collections do not prove an empty ledger.

## Empty and failure states

The page distinguishes:

- no structured decisions;
- decisions without measured outcomes;
- measured outcomes below the pattern threshold;
- patterns without qualifying predictions;
- no warning matching the selected warning lifecycle state;
- a populated decision ledger with empty downstream collections;
- unavailable Decision Intelligence reads;
- a failed manual refresh while existing persisted intelligence remains shown;
- unavailable Hermes, which does not prevent deterministic intelligence from
  loading.

## Data and schema changes

There are no table or migration changes. Existing workspace foreign keys,
uniqueness boundaries, model versions, evidence provenance, and tenant
isolation remain unchanged.

## Verification

Run:

```bash
npm run verify:decision-ui
npm run verify:decision-phase3
npm run verify:decision-phase2
npm run verify:dynamics
npm run verify:decision-semantic
npm run verify:signals
npm run verify:mcp
npm run verify:mcp-contracts
npm run verify:capabilities
npm run verify:agent
npm run verify:codex-connector
npm run lint
npm run build
```

The UI-specific verifier covers the new-workspace lifecycle, ledger-only state,
insufficient measured sample, learned pattern, active/measured prediction,
active/acknowledged/dismissed/resolved warning, evidence provenance, category
and timeline relationships, multiple workspaces, strict isolation,
Hermes-unavailable degradation, refresh-failure messaging, and populated-ledger
empty-downstream semantics.
