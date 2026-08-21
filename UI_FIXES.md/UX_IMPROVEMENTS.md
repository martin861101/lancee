# TASK

Build/improve the user-facing Decision Intelligence experience in Lancee.

IMPORTANT:
This is NOT a greenfield implementation.

Lancee already contains a substantial Decision Intelligence system that has
evolved through multiple phases and may differ from earlier specifications.

DO NOT start coding immediately.

==========================================================
PHASE 0 — MANDATORY REPOSITORY AUDIT
==========================================================

Before changing ANYTHING, inspect the current repository thoroughly.

At minimum inspect:

- LANCEE_WORKSPACE.md
- docs/DECISION_INTELLIGENCE_PHASE3.md
- any Phase 1 / Phase 2 Decision Intelligence documentation
- decision-dynamics.mjs
- decision-learning.mjs
- decision-semantic-assessor.mjs
- decision-taxonomy.mjs
- signal-engine.mjs
- workspace-events.mjs
- Decision Intelligence migrations/schema
- existing API routes/services
- MCP/capability registry
- Hermes integration
- existing decision tools
- verification scripts
- src/components/dashboard/AnalyticsPage.tsx
- App.tsx
- existing dashboard/navigation components
- existing design system/components

Search the repository for:

decision
decision intelligence
decision_pattern
decision_prediction
decision_warning
decision_review
decision_learning
decision_dynamics
workspace_event
signal
outcome
evidence
causal
refresh_decision_intelligence
list_decision_patterns
list_decision_predictions
list_decision_warnings
list_decisions
Hermes

Do not assume documentation is perfectly current.

Compare documentation against the actual implementation.

CODE IS THE FINAL SOURCE OF TRUTH.

Before implementation, internally establish:

1. What already exists.
2. What is partially implemented.
3. What exists in backend but has no good UI.
4. What genuinely does not exist.
5. What would duplicate existing functionality.
6. What existing APIs/tools can be reused.
7. What bugs/workarounds have altered the implementation from earlier plans.

Do NOT replace working architecture merely because another design appears cleaner.

Prefer extension over replacement.

==========================================================
CRITICAL ARCHITECTURAL RULE
==========================================================

Lancee already has a Decision Intelligence engine.

DO NOT build a second intelligence engine.

The existing flow should remain authoritative.

Conceptually:

Workspace Activity
      ↓
Workspace Events / Existing Signals
      ↓
Decision Dynamics
      ↓
Decision Learning
      ↓
Persisted Decision Intelligence
      ↓
Decision Intelligence UI
      ↓
Human interpretation / Ask Lancee

Reuse the existing implementation wherever possible.

The new work should primarily expose the intelligence Lancee is already
producing in a useful, understandable and visually impressive interface.

==========================================================
EXISTING INTELLIGENCE BOUNDARY
==========================================================

Preserve the existing deterministic architecture.

The repository already contains concepts including:

- Decision Vector
- decisions
- evidence
- expected outcomes
- measured outcomes
- structural comparison
- decision reviews
- learning models
- patterns
- predictions
- warnings
- causal assessments
- confidence dimensions
- workspace isolation
- versioned models

Do not collapse these concepts into a generic AI-generated "insight".

Most importantly:

HERMES / LLMs MUST NOT BECOME THE DECISION ENGINE.

Preserve the existing boundary where deterministic application logic:

- detects patterns
- calculates predictions
- calculates confidence
- performs calibration
- creates warnings
- evaluates measured outcomes
- calculates causal estimates

Hermes may:

- explain persisted intelligence
- summarize it
- translate it into natural language
- answer questions about it
- help users understand why Lancee reached a conclusion

Hermes must NOT invent:

- patterns
- predictions
- evidence
- confidence values
- causal claims
- decision history

==========================================================
GOAL
==========================================================

Turn Decision Intelligence into one of Lancee's flagship features.

Currently the underlying system is significantly more sophisticated than what
a normal user can understand from simple counters or analytics.

The user should be able to open Decision Intelligence and immediately understand:

"What has Lancee learned about the way my business operates?"

This should NOT feel like another analytics dashboard.

Analytics answers:

"What happened?"

Decision Intelligence should answer:

"What has Lancee learned from what happened, and how can that help me make the
next decision?"

==========================================================
NAVIGATION
==========================================================

Inspect the current navigation implementation first.

If Decision Intelligence currently lives under Analytics or is difficult to
discover, promote it to an appropriate first-class workspace destination.

Do not arbitrarily rewrite App.tsx or navigation architecture.

Follow existing application patterns.

Preferred user-facing label:

Intelligence

Possible sub-label/title:

Decision Intelligence

==========================================================
PAGE EXPERIENCE
==========================================================

Create a dedicated Decision Intelligence experience using Lancee's existing
visual language.

Do not create a generic enterprise BI dashboard.

The experience should feel:

- intelligent
- calm
- premium
- interactive
- evidence-based
- understandable by a non-technical business user

Use the existing Lancee theme/design system.

Avoid unnecessarily dark or overly technical screens.

==========================================================
1. INTELLIGENCE OVERVIEW
==========================================================

The top of the page should answer:

"What is Lancee learning?"

Potential overview metrics:

Decisions Observed
Patterns Learned
Active Predictions
Warnings / Risks
Measured Outcomes
Learning Confidence

IMPORTANT:

Do NOT simply bind arbitrary counts.

Determine which existing persisted entities accurately support each metric.

Do not imply:

0 patterns = Lancee has observed nothing.

The existing architecture distinguishes between:

- decision ledger
- patterns
- predictions
- warnings
- reviews

An empty downstream collection must not be generalized into "no intelligence".

Use the authoritative decision ledger where appropriate.

==========================================================
2. DECISION INTELLIGENCE MAP
==========================================================

Create an interactive visual representation of Lancee's learned business
knowledge.

This should be one of the hero elements of the page.

Possible visual structure:

                     BUSINESS
                        │
        ┌───────────────┼───────────────┐
        │               │               │
      CLIENTS         PROJECTS        FINANCE
        │               │               │
     patterns         patterns         patterns
        │               │               │
     outcomes         outcomes       predictions

The exact implementation must be driven by the data that actually exists.

Do NOT invent relationships just to make the graph look populated.

Possible nodes:

- decisions
- decision categories
- clients
- projects
- metrics
- outcomes
- patterns
- predictions
- warnings

Node size/weight may represent real quantities such as:

- observation count
- sample size
- evidence strength
- confidence

Connections should represent real persisted relationships.

Clicking a node should reveal supporting information.

Prefer an interactive graph/network/relationship map over a static chart if
the existing data can support it cleanly.

Do not add a massive visualization dependency if the same result can be
implemented cleanly with existing libraries/components.

==========================================================
3. LEARNED PATTERNS
==========================================================

Expose existing Decision Intelligence patterns.

Reuse existing pattern persistence/API/capabilities wherever possible.

Each pattern should be understandable to a normal business user.

Example presentation:

"Projects of this type have historically taken longer than expected."

Then expose supporting information such as:

Observed:
8 comparable decisions

Average measured change:
+14%

Pattern confidence:
72%

Evidence:
8 historical decisions

Do not hide provenance.

Allow the user to inspect the decisions supporting the pattern.

Do NOT have Hermes generate the pattern itself.

Hermes may generate a plain-language explanation of the persisted pattern.

==========================================================
4. PREDICTIONS
==========================================================

Expose existing predictions.

Predictions must preserve the existing evidence boundaries.

Where available show:

- expected direction
- estimated percentage change
- interval/range
- sample size
- confidence
- source decisions
- model/version information

Never present a prediction as a fact.

Use language such as:

"Based on 7 comparable decisions..."

rather than:

"This will happen."

==========================================================
5. WARNINGS
==========================================================

Expose proactive warnings prominently but calmly.

Warnings should explain:

- what Lancee detected
- why it matters
- what expectation it contradicts
- supporting history
- confidence
- relevant decision/project/client
- whether it is active/acknowledged/dismissed/resolved

Reuse the existing warning review/acknowledgement functionality.

Do not create a second notification state if the backend already manages it.

==========================================================
6. DECISION EXPLORER
==========================================================

Provide a way to inspect the actual Decision Ledger.

This is important because the ledger is the authoritative history of decisions,
not the review queue.

Users should be able to explore:

Decision
Context
Intent
Rationale
Expected outcome
Evidence
Measured outcome
Associated pattern/prediction/warning
Confidence where applicable

Potential filters:

- date
- client
- project
- decision type
- outcome state
- confidence
- category

Use existing APIs where possible.

Do not create a second decision storage model.

==========================================================
7. WHY DOES LANCEE THINK THIS?
==========================================================

Every meaningful intelligence item should provide an evidence/provenance path.

Example interaction:

Pattern
   ↓
View Evidence
   ↓
Historical Decisions
   ↓
Measured Outcomes
   ↓
Confidence / Sample

The system should make it possible for a user to understand how an insight was
derived.

This is a core product differentiator.

Avoid black-box AI presentation.

==========================================================
8. LEARNING STATE
==========================================================

Show that Lancee improves as outcomes are measured.

Possible component:

Learning Progress

Decisions recorded       24
Measured outcomes        11
Comparable decisions      8
Learned patterns          3

Then explain:

"Lancee becomes more useful as decisions and their outcomes are recorded."

If the existing learning model exposes useful state, surface it.

Do not invent a fake universal "AI learning percentage".

Any percentage displayed must correspond to an actual defined metric.

==========================================================
9. EMPTY / EARLY WORKSPACE EXPERIENCE
==========================================================

This is extremely important.

A new workspace may legitimately have:

0 patterns
0 predictions
0 warnings

That must NOT make Decision Intelligence look broken.

Instead explain the learning lifecycle.

Example:

Lancee is observing how your workspace operates.

3 decisions recorded
1 outcome measured
0 reliable patterns yet

"We need more comparable measured outcomes before a reliable pattern can be
identified."

Where possible, use actual minimum thresholds from the implementation.

Do not hard-code fake progress.

==========================================================
10. ASK LANCEE
==========================================================

Integrate the existing assistant/Hermes architecture into Decision Intelligence.

Example questions:

"What have you learned about my projects?"

"Which decisions worked best?"

"Where do I usually underestimate work?"

"What patterns exist for this client?"

"Why are you warning me about this?"

"What evidence supports this prediction?"

"What changed in the last 90 days?"

The assistant must query existing Lancee capabilities/data.

Prefer existing capabilities such as:

list_decisions
list_decision_patterns
list_decision_predictions
list_decision_warnings
get_decision_causal_assessment
get_decision_learning_model

and other current equivalents discovered during the audit.

Do not rely on these exact names if the implementation has changed.

Use the actual current capability registry.

IMPORTANT:

Ask Lancee explains/querys persisted intelligence.

It does not create unsupported intelligence.

==========================================================
11. CONFIDENCE
==========================================================

Preserve the existing distinction between confidence dimensions.

Do not collapse:

- evidence confidence
- causal confidence
- pattern confidence
- prediction confidence

into a misleading universal "AI confidence".

The UI may simplify terminology for normal users, but the underlying meaning
must remain correct.

Use tooltips/help text where appropriate.

==========================================================
12. CAUSAL CLAIMS
==========================================================

Preserve Lancee's existing causal-assessment boundary.

Observational before/after changes must NOT be presented as proof that a
decision caused an outcome.

Controlled estimates must retain their assumptions and limitations.

Use language such as:

"Associated with"

instead of:

"Caused"

unless the underlying model explicitly permits stronger language.

==========================================================
13. INTELLIGENCE DETAIL DRAWER
==========================================================

Consider using a reusable side drawer/modal when a user selects:

- pattern
- prediction
- warning
- decision
- graph node

The drawer can show:

Summary
Evidence
Related decisions
Measured outcomes
Confidence
Timeline
Model/version
Ask Lancee

This avoids creating multiple disconnected detail pages.

Follow existing Lancee component conventions.

==========================================================
14. TIMELINE
==========================================================

If supported cleanly by existing data, add an Intelligence Timeline.

Example:

May 04
Decision recorded

May 21
Outcome measured

Jun 02
Pattern strengthened

Jun 18
Prediction created

Jul 03
Warning generated

Only implement events that can be derived from persisted timestamps/history.

Do not manufacture historical events.

==========================================================
BACKEND POLICY
==========================================================

Before adding ANY:

table
migration
endpoint
service
worker
scheduler
MCP tool
capability
event
signal

prove that the required functionality does not already exist.

If existing functionality is close but insufficient:

extend it minimally.

Do not create parallel concepts such as:

business_patterns
ai_insights
intelligence_events

if equivalent Decision Intelligence entities already exist.

==========================================================
DATABASE POLICY
==========================================================

Preserve:

workspace isolation
foreign keys
uniqueness boundaries
versioning
existing model provenance
existing evidence provenance

Never allow cross-workspace intelligence leakage.

Do not weaken existing database constraints for UI convenience.

==========================================================
BUG FIX POLICY
==========================================================

The repository may contain implementation differences caused by previous bug
fixes.

Do not "correct" working code back to an older documented design without
understanding why it changed.

When documentation and implementation differ:

1. inspect git/context where possible
2. inspect verification tests
3. determine current intended behavior
4. preserve verified behavior
5. update documentation only when appropriate

Regression prevention is more important than architectural neatness.

==========================================================
PERFORMANCE
==========================================================

Decision Intelligence may eventually contain substantial history.

Avoid loading the entire decision history on initial page render.

Use:

- summaries
- pagination
- lazy-loaded detail
- bounded queries
- existing indexed fields

where appropriate.

Do not run expensive intelligence recomputation every time the page loads.

Use persisted results.

Refresh only through the existing approved refresh mechanism if appropriate.

==========================================================
TESTING
==========================================================

Run all relevant existing verification suites.

At minimum inspect and run the applicable existing commands, including the
current equivalents of:

npm run verify:decision-phase3
npm run verify:decision-phase2
npm run verify:dynamics
npm run verify:mcp-contracts
npm run verify:capabilities
npm run verify:agent
npm run verify:codex-connector
npm run lint
npm run build

Do not blindly assume these commands still exist.

Inspect package.json first.

Fix regressions introduced by this work.

Do NOT "fix" unrelated failing tests unless required.

==========================================================
ADD UI-SPECIFIC VERIFICATION
==========================================================

Test at least these states:

1. brand-new workspace with no decisions
2. decisions but no measured outcomes
3. measured outcomes but insufficient pattern sample
4. workspace with learned patterns
5. workspace with predictions
6. workspace with active warning
7. acknowledged/dismissed warning
8. resolved warning
9. decision with supporting evidence
10. multiple workspaces belonging to same user
11. strict workspace isolation
12. unavailable Hermes
13. failed intelligence refresh
14. empty downstream collection while decision ledger contains data

The UI must degrade gracefully.

==========================================================
DO NOT
==========================================================

Do NOT:

- rebuild Decision Intelligence from scratch
- create a second learning engine
- make Hermes the source of truth
- generate fake insights
- generate fake confidence values
- infer causal relationships from correlation
- introduce cross-workspace learning
- remove existing approval boundaries
- weaken tenant isolation
- duplicate existing APIs
- duplicate existing tables
- rewrite stable backend modules unnecessarily
- perform large unrelated refactors
- replace working logic merely because it looks old
- make the UI look populated with fabricated demo intelligence

==========================================================
IMPLEMENTATION STRATEGY
==========================================================

Work incrementally.

STEP 1
Audit repository.

STEP 2
Create an internal capability map:

UI requirement
→ existing backend entity
→ existing API/service
→ existing capability/tool
→ missing gap

STEP 3
Implement the page shell/navigation using existing patterns.

STEP 4
Connect overview to existing persisted intelligence.

STEP 5
Implement Decision Explorer.

STEP 6
Implement Patterns / Predictions / Warnings.

STEP 7
Implement evidence/provenance drill-down.

STEP 8
Implement intelligence map using only real relationships.

STEP 9
Integrate Ask Lancee using existing assistant architecture.

STEP 10
Add loading/error/empty/early-learning states.

STEP 11
Run verification and regression testing.

STEP 12
Only then make small backend additions for gaps proven during implementation.

==========================================================
FINAL DELIVERABLE
==========================================================

Implement the feature, don't merely provide recommendations.

When complete provide a concise implementation report containing:

1. Repository findings
2. Existing functionality reused
3. Genuine gaps discovered
4. Files changed
5. Database changes, if any
6. API/capability changes, if any
7. UI components added
8. Existing bugs discovered
9. Bugs fixed
10. Verification commands run
11. Test results
12. Any remaining limitations

Explicitly call out anything you deliberately DID NOT change because the
existing Decision Intelligence architecture already handled it.

==========================================================
SUCCESS CRITERIA
==========================================================

The implementation succeeds when a normal Lancee user can open Intelligence
and understand:

"What has Lancee learned about my business?"

"What evidence does it have?"

"What patterns has it identified?"

"What does it predict?"

"What is it warning me about?"

"Why does Lancee think that?"

"How confident is the evidence?"

"What should I investigate next?"

without requiring the user to understand Decision Vectors, causal inference,
model calibration, statistical sampling or Lancee's internal architecture.

The sophistication should remain underneath.

The value should be obvious on top.