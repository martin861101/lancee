# Lancee Decision Intelligence — Semantic Reality Check

## Flow and authority boundary

```text
Lancee structural comparison
  → bounded evidence pack
  → Hermes contextual interpretation
  → Lancee validation and final confidence
```

Only candidates at or above `structural-similarity-v1`'s configured threshold
enter this flow, with at most five candidates per comparison. Lancee performs
candidate retrieval, structural scoring, evidence-confidence selection,
recency scoring, response validation, final confidence calculation, and
persistence. Hermes only interprets whether the supplied contexts are
realistically comparable.

Hermes cannot recalculate or change metrics, outcomes, evidence confidence,
causal confidence, or Decision Vectors. Its prompt prohibits invented evidence,
missing-fact inference, causal claims, and instructions embedded in business
text. The integration calls the explicitly configured Hermes completion
endpoint; it does not route this assessment through another configured AI
provider.

## Evidence pack

`decision-evidence-pack-v1` contains the new and historical decisions, original
decision language, rationale, intent, Decision Vectors, expected reactions,
measured outcomes, evidence, known confounders, and relevant object/client/
project/conversation context. Workspace and actor authorization fields are not
sent. Inputs are loaded only through trusted workspace-scoped queries.

The serialized pack is capped at 19,000 characters. Per decision it includes at
most two evidence items, two confounders, two measured metrics, and two expected
reactions. Long text fields are clipped to fixed limits. Every bounded
collection includes its total count and a
truncation flag so Hermes can see when the source contains more records than the
pack carries.

## Hermes contract

`hermes-decision-assessment-v1` must return JSON with:

```json
{
  "comparable": true,
  "contextual_similarity": 0.87,
  "shared_factors": ["same intervention"],
  "material_differences": ["different market period"],
  "explanation": "Comparable with a material timing difference."
}
```

Lancee requires `comparable` to be Boolean, contextual similarity to be within
`0..1`, no more than 20 bounded strings in either factor list, and a bounded
explanation. Invalid JSON or fields are treated as an unavailable semantic
assessment.

## Persistence and failure behavior

The structural comparison is written first with `semantic_status = pending`.
After a valid assessment Lancee stores contextual similarity, comparable status,
shared factors, material differences, explanation, Hermes model, evidence-pack
version, assessment version, and confidence-model version.

If Hermes is unconfigured, unreachable, invalid, or times out, the same row is
updated to `semantic_status = unavailable` with a bounded error code. Structural
similarity, evidence confidence, recency relevance, the structural-only
comparison confidence, underlying outcome, and provenance remain available.
Hermes failure never removes the candidate.

Final confidence remains `comparison-confidence-v1`:

```text
structural_similarity × 0.35
+ contextual_similarity × 0.30
+ evidence_confidence × 0.25
+ recency_relevance × 0.10
```

Unavailable contextual similarity contributes zero. Causal confidence remains
separate and never contributes to comparison confidence.

## PostgreSQL verification

The current Compose deployment uses `agent-app-db-1`, PostgreSQL 16.14,
database `lancee_app`, on the internal `db:5432` endpoint (host port `5433`).
Verification created a guarded `lancee_decision_verify_*` database on that same
server, bootstrapped the schema, exercised deterministic and semantic
comparisons in two isolated workspaces, inspected columns/checks/indexes/foreign
keys, and simulated upgrading an existing Phase 1 comparison row before dropping
the database. The production database retained 70 public
tables, no verifier workspaces, and no verification databases.

Run the guarded verifier only with a dedicated database:

```bash
PGDATABASE=lancee_decision_verify_<suffix> \
DECISION_PG_VERIFY_DATABASE=lancee_decision_verify_<suffix> \
npm run verify:dynamics-postgres
```

The script rejects `DATABASE_URL`, mismatched names, and database names outside
the `lancee_decision_verify_*` pattern.

## Verification

```bash
npm run verify:decision-semantic
npm run verify:dynamics
npm run verify:ai
npm run verify:mcp-contracts
npm run verify:dynamics-postgres
npm run lint
npm run build
```

Scheduled outcome observation/review and explicit user correction are now
implemented in [`DECISION_INTELLIGENCE_PHASE2.md`](DECISION_INTELLIGENCE_PHASE2.md).
The bounded autonomous-learning, adaptive-weight, warning, prediction, pattern,
and causal-assessment layers are implemented in
[`DECISION_INTELLIGENCE_PHASE3.md`](DECISION_INTELLIGENCE_PHASE3.md).
