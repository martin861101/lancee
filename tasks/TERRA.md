AGENT TASK — TERRA REMEDIATION PASS 2A
Lancee Hermes → Automation Contract
SECURITY + CORRECTNESS RELEASE BLOCKERS

ROLE
Targeted implementation/remediation agent.

Sol has completed a second adversarial review after the previous Terra remediation.

Current verdict:

VERDICT: FAIL
TARGET SCENARIO: Partially Working

Important progress:

The v1 production architecture now reaches:

Hermes
→ MCP
→ workflow planner
→ validation
→ preview
→ persistence
→ mail trigger
→ semantic classification
→ client resolution
→ project creation
→ project note
→ MULTIPLE tasks

Do NOT redesign this path.

The remaining release blockers are concentrated around:

1. MCP approval security — P0
2. Legacy Core current-role authorization — P0
3. Definition/runtime schema validation drift — P1
4. Cross-workflow idempotency collisions — P1

Fix ONLY these four areas in this pass, plus durable tests required to prove them.

Do not attempt broad cleanup.

==================================================
STARTING INSTRUCTIONS
==================================================

Inspect the current working tree and surrounding architecture.

Do not trust summaries without verifying the code.

Start with:

git status --short
git diff --stat HEAD
git diff HEAD
git diff --check HEAD

Preserve the existing successful v1 workflow architecture.

Do NOT reset Muse/Terra changes.

Do NOT commit.

==================================================
PRIMARY ACCEPTANCE SCENARIO
==================================================

The target remains:

"Create a workflow automation that triggers when a new email arrives from mschoeman3@gmail.com and it's a request to create a website or develop a platform. If those conditions are met create a project linked to Hookitup client with a note of the requirement and a task list."

The functional path now substantially exists.

This remediation must ensure that path is:

AUTHORIZED
APPROVED
VALIDATED
IDEMPOTENT

Do not regress:

- Hermes MCP workflow proposal
- workflow planning
- semantic classification
- Hookitup resolution
- project creation
- project note creation
- multi-task extraction
- canonical result chaining
- mail.received matching

==================================================
BLOCKER 1 — P0
SERVER-ISSUED APPROVAL ONLY
==================================================

SOL FINDING:

Approval can currently be bypassed through the real MCP boundary.

Relevant areas:

server/capabilities/registry.mjs
server/lancee-mcp-protocol.mjs
server/lancee-mcp.mjs

The registry currently enforces approval only when:

invocation.autonomous === true

MCP protocol calls omit this.

A caller can therefore invoke activation and persist a workflow without genuine human approval.

Additionally:

definition hash equality is NOT sufficient proof of approval.

A model/caller capable of supplying:

definition
+
matching hash

has merely proved that the values correspond.

It has NOT proved a human approved them.

THIS IS P0.

==================================================
REQUIRED APPROVAL MODEL
==================================================

Workflow activation must require a SERVER-ISSUED approval grant.

Conceptually:

Hermes proposes workflow
        ↓
server validates definition
        ↓
server calculates definition hash
        ↓
proposal persisted server-side
        ↓
user sees preview
        ↓
user explicitly approves
        ↓
SERVER records/issues approval grant
        ↓
activation request
        ↓
server verifies grant:
   - exists
   - approved
   - correct workspace
   - correct user/actor where applicable
   - correct proposal
   - exact definition hash
   - not revoked
   - not expired if expiry exists
   - not already consumed if single-use
        ↓
workflow persisted/activated

MCP MUST NOT be able to manufacture this approval state.

==================================================
IMPORTANT APPROVAL CONSTRAINTS
==================================================

Do NOT trust:

{
  "approved": true
}

from MCP/model input.

Do NOT trust:

{
  "approval": {
    "approved": true
  }
}

Do NOT treat:

definitionHash === suppliedHash

as approval.

Do NOT rely on:

autonomous === true

as the only condition under which approval is checked.

If a capability requires approval, approval must be enforced regardless of whether the invocation originated from:

Hermes
MCP
internal agent
Core
future connector
other caller

Approval requirements belong to the capability/security boundary, not caller convention.

==================================================
REUSE EXISTING APPROVAL INFRASTRUCTURE
==================================================

Before creating anything new, inspect Lancee for existing:

approval records
agent approvals
proposal persistence
pending actions
approval tokens/grants
workflow proposal state
capability approval mechanisms

Reuse authoritative infrastructure wherever possible.

Do NOT build an independent "workflow approval database" if Lancee already has an approval primitive capable of safely representing this.

The approval grant should preferably reference a server-side proposal ID rather than requiring the client to resend the entire trusted definition.

Example conceptual activation input:

{
  "proposalId": "...",
  "approvalGrantId": "..."
}

rather than:

{
  "definition": {...},
  "approved": true
}

Exact representation should follow existing Lancee architecture.

==================================================
TOCTOU / HASH REQUIREMENT
==================================================

Prevent:

approve definition A
        ↓
modify definition
        ↓
activate definition B

The server must bind approval to the exact canonical definition/hash.

Activation must load/verify the approved server-side proposal.

If the definition has changed, activation must fail and require new approval.

==================================================
APPROVAL TESTS
==================================================

Add durable protocol-level tests.

TEST A — unapproved activation

MCP caller:
propose workflow
→ attempt activation without human approval

EXPECTED:

DENIED

No automation persisted.
No mail rule persisted.

TEST B — fabricated approval

MCP caller sends:

approved:true

or equivalent caller-controlled approval data.

EXPECTED:

DENIED

TEST C — hash fabrication

Caller supplies definition and matching self-generated hash.

EXPECTED:

DENIED

TEST D — changed definition

Proposal A approved.

Caller modifies action/client/task/etc.

Attempts activation.

EXPECTED:

DENIED

TEST E — legitimate approval

proposal
→ server approval flow
→ activation

EXPECTED:

SUCCESS

Exactly approved definition persisted.

TEST F — replay

If approval is intended to be single-use:

reusing consumed grant must fail.

If existing Lancee semantics intentionally permit reuse, document why and prove it cannot authorize a different definition.

==================================================
BLOCKER 2 — P0
LEGACY CORE MUST RESPECT CURRENT ROLE
==================================================

SOL FINDING:

The new v1 workflow runtime correctly uses registry authorization.

However, legacy Core automation paths still manually execute mutations such as:

projects.create
tasks.create

before registry dispatch.

A current viewer was able to create a project.

This means:

automation created while collaborator
        ↓
user demoted to viewer
        ↓
legacy automation runs
        ↓
write still succeeds

THIS IS P0.

==================================================
REQUIRED AUTHORIZATION ARCHITECTURE
==================================================

Do NOT patch this with:

if (role === "viewer") throw ...

inside individual branches.

Eliminate the competing authorization path.

Preferred architecture:

Core automation step
        ↓
capability ID
        ↓
authoritative capability registry
        ↓
current workspace/user context
        ↓
permission policy
        ↓
risk policy
        ↓
runtime handler

The same capability should not have:

one secure v1 execution path
+
one insecure legacy execution path.

==================================================
LEGACY COMPATIBILITY
==================================================

Preserve legitimate legacy workflows.

The objective is not to delete legacy automation support.

Instead:

legacy workflow representation
        ↓
adapt to authoritative capability invocation
        ↓
registry authorization
        ↓
runtime

If a legacy tool cannot safely map to the registry, fail explicitly rather than silently executing an insecure manual branch.

==================================================
AUTHORIZATION TESTS
==================================================

Add durable tests for:

A.

Owner creates automation.
Owner remains owner.
Automation writes successfully.

B.

Collaborator creates/activates automation.
Collaborator remains authorized.
Automation behaves according to existing permission policy.

C.

Automation created while authorized.
Actor later demoted to viewer.
Automation attempts:

projects.create

EXPECTED:

DENIED
zero project mutation

D.

Same scenario for:

tasks.create

EXPECTED:

DENIED
zero task mutation

E.

If appropriate, test a read-only legacy capability as viewer.

EXPECTED:

allowed according to existing policy.

Do not special-case the tests.

Exercise the production Core execution path.

==================================================
BLOCKER 3 — P1
UNIFY SCHEMA VALIDATION
==================================================

SOL FINDING:

Definition validation accepts:

tasks.create_many
tasks: []

because workflow-local validation ignores:

minItems

The registry/runtime later rejects it.

This can produce:

semantic gate passes
        ↓
project created
        ↓
note created
        ↓
tasks.create_many fails
        ↓
partial project remains

The definition should never have been approved.

==================================================
REQUIREMENT
==================================================

Definition-time validation and runtime validation must use the SAME schema semantics.

Do not maintain a weaker workflow-specific validator that only approximates the registry validator.

Reuse the authoritative schema validation implementation where possible.

At minimum correctly enforce:

type
required
enum
minLength
maxLength
minimum
maximum
minItems
maxItems
array item schemas
nested object schemas

But DO NOT manually duplicate all of these if an existing schema validator already implements them.

==================================================
VALIDATION INVARIANT
==================================================

If:

registry would reject the static structure of an action input

then:

workflow definition validation should reject it before approval/persistence.

Dynamic $ref values obviously cannot always be known at definition time.

For those:

validate reference compatibility against declared output/input schemas.

Then validate actual resolved values again at runtime.

Thus:

definition validation
        +
runtime validation

not:

definition OR runtime validation.

==================================================
TASK ARRAY REQUIREMENT
==================================================

tasks.create_many must enforce the existing intended bounds.

If the semantic extractor classifies the email as a project request, it must produce a meaningful non-empty bounded tasks[].

An empty array must not reach approval.

==================================================
VALIDATION TESTS
==================================================

Add durable tests:

tasks: []
→ definition rejected

tasks > maxItems
→ definition rejected

missing required task title
→ rejected

invalid nested task
→ rejected

valid bounded tasks[]
→ accepted

Also verify runtime still validates resolved values.

==================================================
BLOCKER 4 — P1
WORKFLOW-SCOPED IDEMPOTENCY
==================================================

SOL FINDING:

Current planner-generated source keys use values such as:

mail:{{event.messageId}}

Project/task uniqueness is workspace-global.

Therefore:

same email
        ↓
matches workflow A
        ↓
creates project A

same email
        ↓
matches workflow B
        ↓
workflow B sees A's source key
        ↓
reuses A's records

This can attach notes/tasks to the wrong workflow/client/project.

==================================================
REQUIRED KEY DESIGN
==================================================

Namespace idempotency keys by workflow/rule identity.

Conceptually:

workflow:<workflowId>:mail:<messageId>:project

workflow:<workflowId>:mail:<messageId>:note

workflow:<workflowId>:mail:<messageId>:task:<stableTaskIdentity>

The exact format may differ.

Use the stable persisted workflow/rule identity already available in the execution context.

Do not rely on mutable workflow names.

==================================================
REQUIREMENTS
==================================================

Same workflow + same email:

MUST remain idempotent.

Different workflow + same email:

MUST be independent.

Same workflow + different email:

MUST be independent.

Retries:

MUST reuse the resources created by the original attempt.

==================================================
IMPORTANT — EXISTING RESOURCE VERIFICATION
==================================================

When an idempotency collision finds an existing resource, verify it belongs to the expected parent/context.

For example:

existing task found by source key

must belong to:

expected projectId

Do not blindly return a task belonging to another project.

Likewise for project/client relationships where applicable.

If an existing keyed resource conflicts with the expected parent/context:

FAIL safely.

Do not silently reuse it.

==================================================
IDEMPOTENCY TEST MATRIX
==================================================

Add durable tests:

WORKFLOW A
EMAIL 1
→ project A
→ note A
→ tasks A

Repeat:

WORKFLOW A
EMAIL 1

EXPECTED:
same project/note/tasks
no duplicates

Then:

WORKFLOW B
EMAIL 1

EXPECTED:
new independent project/note/tasks

Then:

WORKFLOW A
EMAIL 2

EXPECTED:
new independent project/note/tasks

Also test task source-key lookup cannot reuse a task from another project.

==================================================
REAL MCP SECURITY TEST
==================================================

Sol identified that the existing "Hermes MCP" test directly invokes an in-process runtime and manually injects:

{
  autonomous: true,
  approval: {
    approved: true
  }
}

That test is not sufficient.

For approval tests in THIS pass, exercise the actual MCP protocol boundary:

tools/list
tools/call

through:

server/lancee-mcp-protocol.mjs

and the real MCP runtime entrypoint.

Mock only genuinely external dependencies where required.

Do NOT bypass the protocol code that previously contained the vulnerability.

==================================================
DO NOT FIX IN THIS PASS
==================================================

Unless required by one of the four blockers above, DO NOT implement:

- failed mail claim retry/leases
- generic workflow MCP error preservation
- duplicate client email ambiguity
- capability verification cleanup unrelated to the blockers
- P3 created:true concurrency reporting
- preview Hookitup hard-coding
- schedule trigger
- broad conversational recovery changes
- Report Studio
- Intelligence work
- connector work

Keep scope narrow.

==================================================
REGRESSION PROTECTION
==================================================

Do not regress the now-working pieces.

Verify:

1. Hermes discovers workflow proposal functionality.

2. Planner produces the target definition.

3. Semantic gate occurs before mutations.

4. Hookitup resolves.

5. Project creates.

6. Requirement note creates.

7. Multiple meaningful tasks create.

8. Canonical result chaining remains valid.

9. Same-workflow email replay remains idempotent.

10. Workflow execution respects CURRENT permissions.

==================================================
VERIFICATION COMMANDS
==================================================

Run existing relevant suites:

npm run verify:workflow-builder
npm run verify:mcp
npm run verify:mcp-contracts
npm run verify:capabilities
npm run verify:mail-automation
npm run verify:agent-runtime
npm run verify:hermes

Run all new durable tests.

Also:

git diff --check HEAD

If a test fails because of an unrelated pre-existing issue, document it.

Do NOT weaken tests to obtain green output.

==================================================
DELIVERABLE
==================================================

Return:

1. FILES CHANGED

2. P0 APPROVAL FIX

Explain:

- server-side approval representation
- how approval is created
- how activation verifies it
- why MCP/model input cannot fabricate it
- how hash/definition binding works
- replay behavior

3. P0 AUTHORIZATION FIX

Explain how legacy Core mutations now reach current-role authorization.

Show the production execution path.

4. VALIDATION FIX

Explain how definition and runtime validation now share schema semantics.

5. IDEMPOTENCY FIX

Show the new key structure.

Demonstrate:

same workflow + same message = reuse
different workflow + same message = independent

6. TARGET FLOW TRACE

Hermes
→ MCP
→ proposal
→ validation
→ preview
→ HUMAN APPROVAL
→ server-issued grant
→ activation
→ persistence
→ mail
→ semantic classification
→ client
→ project
→ note
→ tasks

7. SECURITY TEST RESULTS

Explicitly report:

unapproved MCP activation
fabricated approved:true
self-generated hash
modified approved definition
valid approval
viewer legacy projects.create
viewer legacy tasks.create

8. IDEMPOTENCY TEST RESULTS

Report the matrix requested above.

9. ALL TEST COMMANDS + RESULTS

10. REMAINING SOL FINDINGS

Keep the deferred findings visible for the next pass.

==================================================
STOP CONDITIONS
==================================================

STOP rather than redesigning unrelated systems if:

- secure approval requires replacing the entire agent runtime
- legacy authorization cannot safely route through the registry without a major compatibility migration
- workflow identity is unavailable at execution time and requires a substantial persistence redesign

In that case report:

BLOCKER
WHY
SMALLEST SAFE ARCHITECTURAL CHANGE

Do not paper over a security boundary merely to complete the task.

==================================================
FINAL RULE
==================================================

A green test suite is not sufficient.

Before declaring success, actively attempt to violate these invariants:

1. Can an MCP caller activate without a real human approval?

2. Can an MCP caller fabricate approval?

3. Can a demoted viewer cause a legacy automation to write?

4. Can an empty task list be approved?

5. Can two workflows processing the same email reuse each other's records?

If ANY answer is YES:

DO NOT mark the remediation complete.

Do not commit changes.
