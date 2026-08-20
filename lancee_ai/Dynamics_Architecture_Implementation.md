# Lancee Decision Dynamics

## Architecture & Implementation Blueprint

**Core thesis:** Model every meaningful business decision as a state transition: an object in a known state receives an action, produces a measured reaction, and creates an outcome. Lancee compares structurally similar transitions first, then uses natural-language reasoning to decide whether the comparison is actually valid in context.

## 1. Product concept

Decision Dynamics is the analytical layer inside Workspace Decision Intelligence. It represents what changed, why, what was expected, what actually happened, and how strongly the evidence supports comparison with future decisions.

> The “physics” analogy is a design abstraction, not a claim that business behaviour follows physical laws. Use **Object + Action + Prior State → New State → Reaction → Outcome**. Hermes interprets meaning; deterministic Lancee services calculate evidence.

## 2. Core object model

- **Decision** — chosen action, actor, object and timing.
- **Decision Vector** — normalized object/action/target/source/intent representation.
- **Baseline State** — measured state before the action.
- **Expected Reaction** — predicted direction/magnitude/confidence.
- **Observed Reaction** — measured change after action.
- **Outcome** — successful / negative / neutral / mixed / inconclusive.
- **Evidence** — authoritative source records.
- **Confounders** — other factors that may explain the result.
- **Comparison** — scored relationship between decisions.
- **Lesson** — durable conclusion only when evidence is strong enough.

## 3. Two-stage comparison logic

```text
NEW DECISION
  ↓
DECISION VECTOR
  ↓
STRUCTURAL RETRIEVAL
  ↓
EVIDENCE FILTER
  ↓
SEMANTIC REALITY CHECK (Hermes)
  ↓
Comparable? yes → evidence pack
Comparable? no  → discard / downgrade
```

Stage 1 is deterministic. Stage 2 uses natural-language context only after a candidate passes a threshold.

## 4. Confidence dimensions

- `structural_similarity`
- `contextual_similarity`
- `evidence_confidence`
- `causal_confidence`
- `comparison_confidence`

Example starting formula:

```text
comparison_confidence =
  structural_similarity * 0.35
+ contextual_similarity * 0.30
+ evidence_confidence   * 0.25
+ recency_relevance     * 0.10
```

Causal confidence remains a separate gate.

## 5. Architecture

```text
Workspace → Activity Ledger → Signal Processor
        → Memory / Decisions / Outcomes
        → Decision Vectors
        → Structural + Entity/Metric Retrieval
        → Candidate Matches
        → Evidence Engine
        → Confidence Gate
        → Hermes Semantic Reality Check
        → Evidence Pack
        → Decision Recommendation
```

## 6. Implementation roadmap

1. Activity Ledger, decisions, evidence and outcomes.
2. Decision Vector taxonomy and structural normalization.
3. Deterministic outcome calculations and observation windows.
4. Candidate retrieval and structural scoring.
5. Hermes semantic reality check.
6. Evidence Pack.
7. Scheduled review loop.
8. Pattern detection only after enough evidence exists.

**Freeze the first vertical slice:** Activity Ledger → Decision → Decision Vector → Outcome → Comparison Candidate.

## 7. Accuracy rules

- Metrics remain deterministic and traceable.
- Correlation is not causation.
- Missing baseline/post data = inconclusive.
- Confounders lower causal confidence.
- Historical comparisons must expose shared factors and material differences.
- Users can reject misleading comparisons.
- Everything is workspace scoped and permission aware.

## Appendix A — Agent implementation prompt

```text
You are implementing Lancee Decision Dynamics Phase 1 in the current Lancee repository.

GOAL
Create the smallest production-quality vertical slice that proves:
Activity Ledger → Decision → Decision Vector → Outcome → Comparison Candidate.

ARCHITECTURAL RULES
1. Lancee owns authoritative business data, evidence, decisions, metrics and outcomes.
2. Hermes may interpret natural language and perform the later semantic reality check, but must not calculate authoritative metrics or invent causal claims.
3. Every record is workspace-scoped and must use server-derived workspace context.
4. Preserve the existing Lancee MCP capability/security boundary.
5. Do not introduce a graph database, queue, event-sourcing rewrite, new vector database or autonomous learning system in this phase.

IMPLEMENT
A. workspace_events append-only activity ledger with a central recordWorkspaceEvent() service.
B. decisions table/service with object_type, object_id, decision_text, rationale, intent, decided_at, status and provenance.
C. decision_vectors table/service with normalized action_type, target_type, source_state, destination_state, intent_type, expected_direction and vector_version.
D. decision_metrics with baseline and observed values/windows and deterministic absolute/percentage change calculations.
E. decision_outcomes with outcome_direction, outcome_class, evidence_confidence, causal_confidence and reviewed_at.
F. decision_evidence and decision_confounders relationships.
G. decision_comparisons containing structural_similarity, evidence_confidence, recency_relevance, comparison_confidence, shared_factors, material_differences and comparable status.

STRUCTURAL COMPARISON
Implement deterministic candidate scoring based on normalized fields. Keep weights centralized and versioned. Do not use an LLM for Stage 1. Return the top bounded candidates above a configurable threshold.

SEMANTIC STAGE
Create the interface/service contract for a later Hermes semantic reality check, but do not make it autonomous yet. It should accept a new decision plus a bounded candidate and return contextual_similarity, comparable, shared_factors and material_differences. Stub/mock it in tests if needed.

ACCURACY
- Never infer causality from before/after correlation alone.
- Keep causal_confidence separate from comparison_confidence.
- Missing baseline or observed data means inconclusive, not guessed.
- All calculated metrics must be deterministic and covered by tests.
- Persist provenance for every evidence source.

MCP
Add read-only MCP capabilities only if needed for the vertical slice, such as:
- create/list/get decision (writes require existing approval model)
- record/get outcome
- compare decision
- get decision evidence
Use the canonical MCP result contract already implemented: lists at data.results[] and singles at data.resource.

TESTS
Add tests for:
- workspace isolation
- event recording
- decision creation
- vector normalization
- deterministic metric calculations
- duplicate/similar decision candidates
- structural scoring
- low-evidence downgrade
- causal-confidence separation
- comparison result provenance
- MCP result composability if MCP tools are added

ACCEPTANCE EXAMPLE
Historical decision:
Use previous-generation bumper on 2026 Polo Vivo. Baseline avg sales 1420. Post avg sales 1221 over 4 months. Change -14.01%. Outcome negative. Causal confidence low.

New decision:
Use 2024 bumper on Mini Van XT to test whether sales increase.

Expected system behavior:
- normalize both decisions into comparable action/object/intent structures
- retrieve the historical decision as a candidate
- compute structural similarity deterministically
- expose the measured -14.01% outcome
- label causality as low/unknown rather than claiming the bumper caused the decline
- produce a bounded candidate payload ready for semantic reality checking

STOP when this vertical slice works end-to-end. Do not proceed to autonomous learning or pattern detection.

FINAL REPORT
Report schema changes, services added, scoring formula/version, tests, example comparison output, security/isolation results, and remaining Phase 2 work.
```
