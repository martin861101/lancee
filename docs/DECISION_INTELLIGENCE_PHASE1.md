# Lancee Decision Intelligence Phase 1

This frozen implementation covers the first slice:

```text
Session / Hermes / Lancee memory boundary
  → Workspace Activity Ledger
  → Signal Engine / Decision Candidate
  → Decision
  → Decision Vector
  → Outcome
  → Comparison Candidate
```

It does not implement autonomous pattern detection, memory consolidation,
self-adjusting weights, reinforcement learning, or proactive warnings. The
subsequent bounded semantic-comparison layer is documented separately in
[`DECISION_INTELLIGENCE_SEMANTIC.md`](DECISION_INTELLIGENCE_SEMANTIC.md).

## Three-state memory boundary

`server/memory-router.mjs` routes memory deterministically:

- temporary/current/ambiguous context → process-local Session memory;
- stable user response, communication, approval, and working preferences →
  `hermes_user_preferences`, scoped by authenticated user;
- events, decisions, evidence, outcomes, business facts, and organisational
  learning → the relevant authoritative Lancee domain service.

Generic business memory writes are rejected unless a matching Lancee domain
handler is supplied. Secret-like Hermes preference keys are rejected. Hermes
agent instructions explicitly prohibit placing workspace business records in
personal memory.

## Activity Ledger and Signal Engine

`recordWorkspaceEvent()` in `server/workspace-events.mjs` is the central ledger
writer. Workspace identity comes only from trusted context. The ledger retains
actor, entity relationships, payload, importance, occurrence/processing time,
and communication connection/channel/source provenance. Representative project
and file creation/upload flows now record ledger facts.

`server/signal-engine.mjs` implements:

- deterministic relevance and structured-event detection first;
- the documented cheap decision-language filter before semantic work;
- a bounded Hermes classification request/response contract, injected rather
  than run autonomously;
- capture policy `decision-capture-v1`: auto-promote at `0.90`, request review
  at `0.65`, and retain only source activity below `0.65`;
- retained confirmation, edit, rejection, machine confidence, human result,
  and promotion provenance.

Connected communications are accepted only from a connected integration owned
by the authenticated workspace. A connected channel does not grant access to
another workspace or unrelated communications.

## Decision Dynamics schema

The database bootstrap adds:

- `workspace_events`
- `decision_candidates`
- `decisions`
- `decision_vectors`
- `decision_expected_reactions`
- `decision_metrics`
- `decision_outcomes`
- `decision_evidence`
- `decision_confounders`
- `decision_comparisons`
- `hermes_user_preferences`

All Decision Intelligence tables are workspace-scoped, and every service query
includes the trusted `context.workspace.id`. Cross-workspace resource ids return
not found and cannot be attached as evidence.

## Vector taxonomy and deterministic scoring

Decision Vector normalization version: `decision-vector-v1`.

Structural scoring version: `structural-similarity-v1`. Exact normalized-field
matches use centralized weights:

| Field | Weight |
| --- | ---: |
| `action_type` | 0.25 |
| `object_type` | 0.15 |
| `target_type` | 0.15 |
| `source_state` | 0.10 |
| `destination_state` | 0.05 |
| `intent_type` | 0.20 |
| `expected_direction` | 0.10 |

The default threshold is `0.60`, retrieval is capped at 200 historical vectors,
and at most five candidates are returned. No LLM participates in Stage 1.

Comparison confidence version `comparison-confidence-v1` is:

```text
structural_similarity × 0.35
+ contextual_similarity × 0.30
+ evidence_confidence × 0.25
+ recency_relevance × 0.10
```

The frozen structural stage treats contextual similarity as zero until the
semantic reality check completes. Lancee remains authoritative for the final
versioned confidence calculation.

## Metrics, evidence, and causality

`calculateDecisionMetric()` deterministically stores absolute and percentage
change. Missing post-decision observation is `pending`; missing baseline is
`inconclusive`; no value is invented. Expected-versus-actual results are
`matched`, `missed`, `pending`, or `inconclusive`.

Contradictory evidence lowers evidence confidence under
`evidence-confidence-v1`. Significant confounders lower causal confidence under
`causal-confidence-v1`. Causal confidence is never included in structural or
comparison confidence and is never derived from correlation.

Acceptance example output is represented as:

```json
{
  "historical_decision": "2026 VW Polo Vivo bumper reuse",
  "structural_similarity": 0.70,
  "metric": {
    "baseline_value": 1420,
    "observed_value": 1221,
    "change_absolute": -199,
    "change_percent": -14.01
  },
  "outcome_direction": "negative",
  "evidence_confidence": 0.91,
  "causal_confidence": 0.32,
  "comparable": null,
  "semantic_stage": "pending"
}
```

The output states only that sales declined after the change. It does not claim
the bumper caused the decline.

## MCP capabilities

The Lancee MCP registry adds:

- `create_decision` (approved internal write)
- `list_decisions`
- `get_decision`
- `record_outcome` (approved internal write)
- `get_decision_outcome`
- `get_decision_evidence`
- `compare_decision`

Lists compose at `data.results[N].id`, single resources at `data.resource.id`,
and failures at `error.code` / `error.message`. The existing capability
permission, role, autonomous-approval, audit, and canonical-result layers remain
authoritative.

## Verification

Run:

```bash
npm run verify:memory
npm run verify:signals
npm run verify:dynamics
npm run verify:mcp-contracts
npm run verify:capabilities
npm run verify:codex-connector
npm run lint
npm run build
```

The dedicated suites cover memory boundaries, ledger recording, connection
authorization, signal gating and review, candidate promotion, vector
normalization, metric arithmetic, expected-versus-actual behavior, structural
ranking/rejection, low-evidence downgrade, confounder effects, causal separation,
comparison provenance, MCP composition, and workspace isolation.

## Phase 1 freeze

Phase 1 tables, indexes, constraints, foreign keys, deterministic arithmetic,
comparison behavior, and workspace isolation passed on PostgreSQL 16.14 in an
isolated temporary database on the same server used by the current Compose
deployment. No Phase 1 compatibility fix was required, the production database
was not migrated or written, and the temporary database was removed.
