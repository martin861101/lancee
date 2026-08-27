AGENT TASK — SOL VERIFICATION REVIEW
Lancee Hermes → Automation Contract

MODE: REVIEW ONLY
DO NOT MODIFY FILES.
DO NOT FIX ISSUES.
DO NOT CREATE IMPLEMENTATION CODE.
DO NOT COMMIT ANYTHING.

==================================================
CONTEXT
==================================================

A checkpoint commit was created immediately BEFORE Muse Spark 1.2 began implementing the Hermes → Automation Contract.

Therefore:

HEAD = pre-Muse baseline
Working tree = Muse implementation

Review ALL uncommitted changes against HEAD, including untracked files.

Start with:

git status --short
git diff --stat
git diff
git ls-files --others --exclude-standard

Do not trust the Muse completion report as proof.

Inspect the actual implementation and surrounding architecture.

The purpose of this review is to determine whether Muse genuinely implemented the requested architecture safely and end-to-end, or merely made the expected tests/paths appear to work.

==================================================
ORIGINAL ACCEPTANCE SCENARIO
==================================================

This exact natural-language request is the primary acceptance test:

"Create a workflow automation that triggers when a new email arrives from mschoeman3@gmail.com and it's a request to create a website or develop a platform. If those conditions are met create a project linked to Hookitup client with a note of the requirement and a task list."

The intended flow is:

Natural language
→ Hermes understands request
→ workflow plan
→ validation
→ approval
→ persisted automation
→ matching mail event
→ deterministic sender condition
→ semantic project-request classification
→ resolve Hookitup client
→ create project
→ capture requirement/note
→ generate meaningful task LIST
→ create tasks
→ canonical result chaining
→ idempotent execution

The implementation must not falsely report an existing capability as unavailable.

==================================================
MUSE CLAIMS
==================================================

Muse claims it changed only:

- server/workflow-builder.mjs
- server/database.mjs
- server/capabilities/registry.mjs
- server/agents/hermes-agent-provider.mjs
- scripts/verify-lancee-capabilities.mjs

Muse claims:

1. WORKFLOW_CAPABILITIES is now the single authoritative workflow capability catalogue.

2. CORE_TOOL_CATALOG and MCP create_workflow capability enum derive from it.

3. Added:
   - clients.resolve
   - projects.add_note
   - tasks.create_many

4. clients.find_or_create was promoted to coreAutomation:true.

5. mail.received supports deterministic sender/recipient/subject/body conditions.

6. Existing mail-automation.mjs functionality is reused.

7. ai.extract_project_request semantically determines whether an email is a project request.

8. Semantic confidence thresholds prevent mutations when classification is unsafe.

9. Workflow validation now checks capabilities, references, schemas, triggers and bounded mutations.

10. Result chaining uses structured $ref references.

11. Canonical result contract remains:
    list → data.results[N].id
    single → data.resource.id

12. Failed Hermes runs are included in immediate conversation history so follow-ups such as:
    "why?"
    "that's wrong"
    "try again"
    refer to the failed workflow operation.

13. Email idempotency prevents duplicate projects/notes/tasks.

14. The full Hookitup target scenario works.

Your job is to VERIFY OR DISPROVE these claims.

==================================================
REVIEW PRINCIPLE
==================================================

Be adversarial.

Do not ask:

"Does the implementation roughly look reasonable?"

Ask:

"Under what real conditions does this break?"

Look for:

- contract drift
- hidden duplicate catalogues
- dead/unreachable capabilities
- validation/runtime disagreement
- fake end-to-end tests
- tests that bypass production paths
- authorization regressions
- cross-workspace access
- unsafe AI execution
- malformed model output
- reference-path bugs
- race conditions
- duplicate creation
- partial execution
- transactional inconsistencies
- weak failure recovery
- weakened tests
- hard-coded assumptions
- capability exposure without execution
- execution without capability exposure

==================================================
1 — DIFF INTEGRITY
==================================================

Determine exactly what Muse changed.

Check:

git diff HEAD
git diff --check
git status --short

Identify any unrelated modifications.

Check whether Muse accidentally modified behaviour outside the automation scope.

Look for generated files, temporary files or hidden test artifacts.

==================================================
2 — SINGLE SOURCE OF TRUTH
==================================================

Verify the claimed capability architecture.

Trace:

WORKFLOW_CAPABILITIES
        ↓
CORE_TOOL_CATALOG
        ↓
MCP create_workflow schema
        ↓
validation
        ↓
runtime execution

Confirm that the relevant capability definitions are genuinely derived rather than duplicated.

Specifically verify:

projects.create

was previously available in Core but unavailable through workflow MCP and that this mismatch is now structurally prevented.

Search the repository for additional hard-coded workflow tool lists/enums.

A passing regression assertion alone is insufficient if another runtime path maintains its own list.

==================================================
3 — CAPABILITY REACHABILITY
==================================================

For each:

clients.resolve
projects.create
projects.add_note
tasks.create_many

trace the complete path:

Hermes/MCP
→ workflow definition
→ validation
→ persisted definition
→ runtime
→ database/service
→ canonical output

Confirm none are catalogue-only capabilities.

Confirm their declared input/output schemas match actual runtime output.

==================================================
4 — AUTHORIZATION / TENANT ISOLATION
==================================================

This is high priority.

Verify every new operation remains workspace-scoped.

Attempt to identify whether crafted:

clientId
projectId
$ref
query
sourceKey

values could access or mutate another workspace.

Particularly inspect:

clients.resolve
projects.add_note
tasks.create_many

Verify ownership before mutation.

Verify Hermes cannot provide arbitrary IDs belonging to another tenant.

Verify capability registry permissions and workflow runtime authorization agree.

Do not accept "the UI normally supplies a workspace ID" as security.

==================================================
5 — CLIENT RESOLUTION
==================================================

Review resolveWorkflowClient.

Verify behaviour for:

exact ID
exact email
exact name
case differences
substring
multiple substring matches
zero matches
malformed identifiers
client belonging to another workspace

"Hookitup" should resolve only when unambiguous.

Ambiguous resolution must NEVER silently select the first client.

Check whether exact-name collisions are possible and handled.

==================================================
6 — SEMANTIC CONDITION SAFETY
==================================================

Inspect ai.extract_project_request.

Verify:

sender matching is deterministic.

AI is used only for semantic classification.

Test/inspect:

obvious website request
obvious platform request
unrelated email
ambiguous request
empty body
malformed extraction
AI timeout
AI provider error
invalid JSON
confidence just below threshold
confidence exactly threshold
confidence above threshold

Confirm mutations cannot execute if extraction fails.

Confirm model output cannot inject:

tool names
$refs
arbitrary steps
workspace IDs
capabilities
code

into the workflow runtime.

Check whether confidence thresholds are applied consistently during real execution, not only preview/planning.

==================================================
7 — TASK LIST REQUIREMENT
==================================================

This deserves special attention.

The original request explicitly requires:

"a task list"

Muse admits ai.extract_project_request currently returns a singular:

task

and the normalized example sends an array containing that one task into tasks.create_many.

Determine whether the target workflow genuinely produces a useful MULTI-TASK breakdown.

If the normal target scenario creates only one task, the original acceptance requirement is NOT fully satisfied.

Do not excuse this because the method is named tasks.create_many.

Determine the smallest architecturally correct remediation.

Preferred conceptual output should be something like:

tasks: [
  {...},
  {...},
  {...}
]

derived from the actual requirement.

Do not recommend hard-coded generic website tasks unless unavoidable.

==================================================
8 — RESULT CHAINING
==================================================

Verify actual runtime chaining.

Required chain:

clients.resolve
      ↓ client id

projects.create
      ↓ project id

projects.add_note
      ↓

tasks.create_many

Inspect $ref resolution.

Test/reason about:

valid previous-step reference
future-step reference
unknown step
unknown output field
array index
nested field
malicious path
__proto__
constructor
prototype
null output
failed previous step

Ensure references are validated before execution.

Ensure IDs are consumed from structured results, never parsed from prose.

==================================================
9 — RESULT CONTRACT
==================================================

Verify:

LIST:
data.results[N].id

SINGLE:
data.resource.id

Check whether new workflow capabilities actually produce output compatible with this contract.

Search for legacy/hybrid shapes such as:

data.files
data.projects
data.clients

where the same normalized result also exposes data.results.

Ensure Muse did not solve one path while leaving Hermes vulnerable elsewhere in this workflow.

==================================================
10 — IDEMPOTENCY
==================================================

Inspect:

mail event claim
project sourceKey
project note deterministic ID
task sourceKey

Test/reason about duplicate delivery.

More importantly, inspect concurrency.

What happens if the same email is processed simultaneously by two workers?

Check:

project duplication
note duplication
task duplication

Muse states projects.add_note uses a deterministic comment ID rather than a dedicated unique source_key constraint.

Determine whether this is race-safe with the actual database implementation.

If it relies on:

check → insert

without an atomic uniqueness guarantee, flag it.

Distinguish:

sequential idempotency

from:

concurrent idempotency.

==================================================
11 — PARTIAL EXECUTION
==================================================

Consider:

client resolves
project creates
note fails
tasks create

or:

project creates
task #1 creates
task #2 fails

Determine what state remains.

Check whether workflow execution provides:

atomicity where appropriate
retry safety
step-level idempotency
useful failure logs

A retry must not create duplicate resources.

Do not necessarily demand one giant DB transaction if durable step execution is intentional; assess the actual architecture.

==================================================
12 — TRIGGER CONTRACT
==================================================

Muse claims mail.received is implemented and schedule is designed/validated but not executed.

Verify this.

A workflow contract should not normally accept:

trigger.type = schedule

if the runtime cannot execute it.

Determine whether schedule is:

A. fully supported,
B. explicitly rejected,
C. misleadingly accepted but dead.

If C, flag it.

Check mail trigger matching against the existing mail-automation.mjs implementation.

Ensure Muse did not create competing trigger semantics.

==================================================
13 — CONVERSATIONAL RECOVERY
==================================================

Inspect Hermes conversation history changes.

Target sequence:

User:
Create workflow...

Lancee:
workflow creation fails

User:
"that's wrong"

Hermes should reason about the failed workflow attempt.

Verify failed run information is:

correct conversation
correct workspace
correct user
properly ordered
bounded in size
not leaking internal/sensitive data
not overriding newer successful context

Check whether unrelated workspace_notifications can still incorrectly dominate immediate context.

==================================================
14 — STRUCTURED ERRORS
==================================================

Verify errors such as:

AUTOMATION_ACTION_UNSUPPORTED

actually propagate through:

runtime
→ capability registry
→ MCP
→ Hermes

without being collapsed into a generic message.

Inspect whether normalizedError preservation is too broad.

Muse changed preservation for:

WORKFLOW*
EXTRACTION*
AUTOMATION*

Ensure this cannot accidentally expose internal implementation details or sensitive error content.

==================================================
15 — TEST QUALITY
==================================================

Muse reports:

npm run verify:workflow-builder
npm run verify:mcp
npm run verify:mcp-contracts
npm run verify:capabilities

and temporary tests:

/tmp/test_phase3_target.mjs
/tmp/test_regression.mjs

This is important:

Temporary /tmp tests DO NOT constitute durable repository regression coverage.

Determine which important assertions exist only in /tmp.

If important new behaviour lacks committed tests, flag it.

The implementation should leave permanent regression coverage for at minimum:

- capability catalogue drift
- projects.create MCP exposure
- semantic gating
- client ambiguity
- result chaining
- unsupported capability structured error
- idempotency
- conversational failure context
- full target scenario

==================================================
16 — TEST WEAKENING
==================================================

Muse changed:

scripts/verify-lancee-capabilities.mjs

Reported changes include:

- hard count assertions became flexible ranges
- web/browser checks became conditional

Inspect this carefully.

Determine WHY each assertion was changed.

Flag any test modification whose purpose is effectively:

"make the suite pass after implementation."

A test may be generalized when architecture genuinely requires it, but coverage must not be silently weakened.

Compare old vs new behaviour explicitly.

==================================================
17 — RUN VERIFICATION
==================================================

Run the relevant repository tests yourself.

At minimum attempt:

npm run verify:workflow-builder
npm run verify:mcp
npm run verify:mcp-contracts
npm run verify:capabilities

Also inspect package scripts for other relevant verification suites and run those where reasonable.

Do NOT rely on Muse's reported output.

Do not modify files to make tests pass.

If tests require unavailable external infrastructure, state that clearly.

==================================================
18 — EXACT TARGET SCENARIO
==================================================

Finally trace the exact target scenario from beginning to end.

Use:

sender:
mschoeman3@gmail.com

semantic request:
website/platform development

client:
Hookitup

Expected:

mail received
→ deterministic sender match
→ semantic classification passes
→ Hookitup resolves
→ project created
→ requirement captured
→ MULTIPLE meaningful tasks generated
→ tasks linked to project
→ duplicate processing does not duplicate resources

For every transition identify the actual function/module responsible.

If any transition is simulated only by a test fixture and cannot occur through the production path, flag it.

==================================================
SEVERITY
==================================================

Use:

P0 — security/data-loss/cross-tenant/release-critical architecture failure

P1 — target workflow broken, major correctness issue, unsafe execution, false success, significant missing requirement

P2 — reliability/maintainability/test coverage problem that should be fixed before considering the phase complete

P3 — minor cleanup or improvement

Do not manufacture findings to fill categories.

==================================================
OUTPUT FORMAT
==================================================

Start with:

VERDICT:
PASS
PASS WITH REMEDIATION
FAIL

Then:

TARGET SCENARIO:
Working / Partially Working / Not Working

Then provide findings ordered:

P0
P1
P2
P3

For EACH finding provide:

Severity
Title
File + line(s)
Evidence
Why it matters
Concrete remediation

Avoid vague recommendations.

Then provide:

MUSE CLAIMS VERIFIED

List each major claim and:

VERIFIED
PARTIAL
FALSE
NOT PROVABLE

Then:

TEST RESULTS

Include exact commands and pass/fail.

Then:

TARGET FLOW TRACE

NL
→ planner
→ validation
→ approval
→ persistence
→ mail
→ semantic gate
→ client
→ project
→ note
→ tasks

Identify production code responsible for every transition.

Then:

REMEDIATION ORDER

Give the smallest sensible ordered list for Terra.

IMPORTANT:

Do not implement the fixes.

We want a precise review that can be handed directly to another implementation agent.
