# Lancee Decision Intelligence Phase 2

Phase 2 closes the loop between a recorded decision and the evidence needed to
review it:

```text
Decision + expected reaction
  → scheduled outcome review
  → due workspace notification
  → measured outcome
  → structural comparison
  → Hermes semantic reality check
  → Lancee confidence calculation
  → optional human correction
```

This Phase 2 layer remains bounded and human-controlled. The later, separately
versioned learning, pattern, prediction, warning, and causal-assessment
boundaries are documented in
[`DECISION_INTELLIGENCE_PHASE3.md`](DECISION_INTELLIGENCE_PHASE3.md).

## Outcome observation and review

An expected reaction can include a future `reviewDueAt`, or an authorized user
can schedule the recorded metric later with `schedule_decision_review`.
`decision-outcome-observation-v1` accepts only future dates within 730 days and
allows one active review per workspace, decision, and metric.

The existing scheduler claims due `scheduled` rows, changes them to `due`, and
creates one `decision.outcome_review_due` workspace notification. Repeated
scheduler runs cannot notify the same row again. Recording a non-pending metric
completes the matching review, records `outcome.observation_completed`, and
marks the decision reviewed. A pending measurement preserves the open review
and does not prematurely declare the decision reviewed.

## Human semantic correction

Hermes' assessment remains machine interpretation, not authority. An authorized
user can confirm, correct, or reject a semantic comparison. Every review is
append-only in `decision_comparison_reviews`; the original
`decision_comparisons` row, measured values, structural score, evidence
confidence, and Hermes provenance are never overwritten.

Reads expose both:

- `machineAssessment`: the retained Hermes/unavailable assessment;
- `humanReview`: the latest explicit review;
- effective `comparable`, contextual similarity, factors, explanation, and
  comparison confidence;
- `assessmentSource`: `structural`, `hermes`, or `human_review`.

For a human correction, Lancee—not Hermes—recalculates effective confidence with
the existing `comparison-confidence-v1` weights. Confirmation and rejection are
also explicit records. Cross-workspace comparison IDs return not found.

## Agent and workspace-assistant integration

Decision requests are routed to a bounded Decision Intelligence tool set rather
than the generic first-page MCP catalog. The direct workspace assistant receives
workspace-scoped summaries of at most ten recent decisions and ten open outcome
reviews, then uses decision tools for the authoritative detail. Generic, file,
and PDF requests keep their existing narrow tool routing.

The constrained Lancee planner discovers the `decision` capability namespace
for decision, outcome, comparison, lesson, strategy, recommendation, and
priority requests. Native Hermes instructions require the same Lancee records,
keep confidence dimensions separate, respect human corrections, and prohibit
invented evidence, causal claims, predictions, or creating a decision merely to
answer a hypothetical question.

The MCP additions are:

- `schedule_decision_review` — approved internal write;
- `list_decision_reviews` — workspace-scoped read;
- `get_decision_comparison` — machine and effective assessment read;
- `review_decision_comparison` — approved append-only human review.

Existing create/outcome tools remain approval-controlled, and all results retain
the canonical result-contract, audit, authentication, and workspace-isolation
boundaries.

## Schema

`decision_observation_reviews` stores the workspace, decision, expected metric,
scheduler, due time, lifecycle status, notification time, and completion time.
It has a unique workspace/decision/metric constraint and indexes for due claims
and workspace reads.

`decision_comparison_reviews` stores append-only reviewer identity, action,
effective semantic fields, Lancee-calculated confidence, confidence-model
version, and review-policy version. It references the original comparison and
is indexed by workspace/comparison/creation time.

## PostgreSQL verification

The migration and behavior were verified on the deployment's real
`agent-app-db-1` PostgreSQL 16.14 server through host port `5433`. The verifier
created a guarded `lancee_decision_verify_*` database, inspected all Phase 1 and
Phase 2 tables, checks, indexes, and foreign keys, exercised two-workspace
isolation, automatic observation scheduling, semantic assessment, append-only
human correction, and final confidence, then dropped the temporary database.
No production workspace or application database was modified.

The verification also exposed and fixed two real compatibility issues:

- Decision reads now sequence queries when they may share a PostgreSQL
  transaction client, avoiding concurrent-query deprecation and future pg 9
  incompatibility.
- MCP result normalization now receives distinct observation-review objects, so
  its cycle guard does not remove the top-level review collection.

Run the local suites with:

```bash
npm run verify:decision-phase2
npm run verify:dynamics
npm run verify:decision-semantic
npm run verify:mcp-contracts
npm run verify:capabilities
npm run verify:agent
npm run verify:codex-connector
npm run lint
npm run build
```

Run `verify:dynamics-postgres` only against a dedicated database satisfying the
guard in `scripts/verify-decision-postgresql.mjs`.
