# SOL Final Core Contract Review

VERDICT: **PASS WITH HARDENING BACKLOG**

TARGET SCENARIO: **Working**

MANUAL TESTING GATE: **READY**

The previous cross-user approval takeover is no longer reproducible. The target works, with zero current P0 and zero current P1.

## P0

None.

## P1

None.

## P2

### Failed mail claims cannot retry — STILL REPRODUCIBLE

`server/database.mjs:6476` permanently retains failed claims. A probe confirmed the first claim succeeded and retry after `status: failed` returned `null`.

### Concurrent project idempotency fails on SQLite — STILL REPRODUCIBLE

`server/database.mjs:7859` enters nested transactions. Two concurrent identical writes produced one success and one `ERR_SQLITE_ERROR: cannot start a transaction within a transaction`.

### Approval consumption and persistence use separate transactions — STILL REPRODUCIBLE

Grant consumption occurs at `server/workflow-builder.mjs:621`; workflow persistence starts separately at line 637.

### Duplicate client-email ambiguity — STILL REPRODUCIBLE

`server/database.mjs:7488` selects the first email match. A probe created two matching clients and resolution silently selected one.

### Capability verifier remains weakened — STILL REPRODUCIBLE

Broad count ranges and conditional checks remain in `scripts/verify-lancee-capabilities.mjs:118`.

### Advertised Core tools remain nonfunctional — STILL REPRODUCIBLE

`projects.update_status` and `projects.create_draft_invoice` remain advertised but throw `CORE_EXECUTION_UNAVAILABLE` in `server/core.mjs:244`.

### Static `$ref` compatibility omits some lower/numeric bounds — STILL REPRODUCIBLE

`schemaTypesCompatible` at `server/workflow-builder.mjs:136` does not compare `minItems`, `minLength`, `minimum`, or `maximum`.

## P3

### Concurrent task loser reports `created:true` — STILL REPRODUCIBLE

Two concurrent calls returned the same ID, both with `created:true`; see `server/database.mjs:7761`.

### Preview hard-codes Hookitup — STILL REPRODUCIBLE

`previewWorkflow` at `server/workflow-builder.mjs:303` emits Hookitup-specific prose.

### No single durable exact-target end-to-end acceptance test — STILL REPRODUCIBLE

Exact Hermes approval/persistence and exact downstream Hookitup execution are tested separately.

### Supplementary Hermes workflow verifier is untracked

`package.json` references `scripts/verify-hermes-workflow-approval.mjs`, but that script is currently untracked. The two-user ownership regression itself is tracked elsewhere.

## TERRA 2C CLAIMS

1. Approval list is user-owned — VERIFIED
2. Direct get enforces ownership — VERIFIED
3. Cross-user approve rejected — VERIFIED
4. Cross-user deny rejected — VERIFIED
5. Cross-user activation rejected — VERIFIED
6. Activation independently verifies ownership — VERIFIED
7. Cross-workspace protection preserved — VERIFIED
8. Legitimate owner approval succeeds — VERIFIED
9. Hermes handoff remains functional — VERIFIED
10. Target scenario remains working — VERIFIED
11. Durable two-user regression exists and is tracked — VERIFIED

The tracked regression is in `scripts/verify-workflow-builder.mjs:280`. It uses distinct database-authenticated users in the same workspace, known IDs, the MCP protocol server, and covers list/get/approve/deny/activation plus Alice's success.

## APPROVAL OWNERSHIP MATRIX

| Operation | Outcome |
|---|---|
| Alice list | Sees her approval |
| Alice get | SUCCESS |
| Alice approve | SUCCESS |
| Alice deny, separate proposal | SUCCESS |
| Alice activate | SUCCESS |
| Bob list Alice | Empty |
| Bob direct-get Alice | REJECTED |
| Bob approve Alice | REJECTED |
| Bob deny Alice | REJECTED |
| Bob activate Alice while pending | REJECTED |
| Bob activate after Alice approved | REJECTED — `MCP_WORKFLOW_APPROVAL_INVALID` |
| Charlie cross-workspace | List empty; get/decide/activation rejected |

Bob's attacks left the approval usable by Alice, with no automation or mail rule persisted before Alice's activation.

## SECURITY ATTACK MATRIX

| Attack | Outcome |
|---|---|
| No grant | REJECT |
| Caller `approved:true` | REJECT — `MCP_INVALID_ARGUMENTS` |
| Caller-generated hash | REJECT — `MCP_APPROVAL_REQUIRED` |
| Wrong proposal/grant | REJECT |
| Modified definition | REJECT; activation loads the persisted step definition |
| Cross-user | REJECT |
| Cross-workspace | REJECT |
| Consumed grant replay | REJECT |
| Grant reused for another workflow | REJECT |
| Denied approval reused | REJECT |
| Concurrent activation | EXACTLY ONE success |
| Legitimate activation | SUCCESS |

Ownership is authoritative:

`approval -> persisted step -> persisted run -> run.user_id`

The database compares that identity with authenticated `context.user.id` in `server/database.mjs:4826`. Activation repeats the user-owned lookup and consumption in `server/workflow-builder.mjs:598`. Caller-supplied `userId`, `ownerId`, `approvedBy`, or `runId` cannot establish authority.

REST approval is also scoped before dispatch: `providerForRun` retrieves the run using the authenticated user in `server/agents/agent-provider.mjs:239`.

## TARGET FLOW TRACE

```text
User
-> POST /api/agent/runs                         server/index.mjs:4241
-> Hermes provider                             server/agents/hermes-agent-provider.mjs:942
-> authenticated MCP tools/call                server/lancee-mcp-protocol.mjs:49
-> workflow planner                            server/workflow-builder.mjs:322
-> definition/$ref validation                  server/workflow-builder.mjs:240
-> preview                                     server/workflow-builder.mjs:291
-> proposal step and approval persistence      server/workflow-builder.mjs:539
-> originating Hermes-run adoption             server/agents/hermes-agent-provider.mjs:787
-> user-owned approval enforcement             server/database.mjs:4826
-> decision/server-issued grant                server/database.mjs:4872
-> exact proposal activation                   server/workflow-builder.mjs:598
-> automation + mail-rule persistence          server/database.mjs:5890
-> /api/mail/sync                              server/index.mjs:9178
-> deterministic sender matching               server/mail-automation.mjs:69
-> Core execution                              server/core.mjs:187
-> semantic/confidence gate                    server/workflow-builder.mjs:479
-> Hookitup resolution                         server/database.mjs:7488
-> project                                     server/database.mjs:7859
-> requirement note                            server/database.mjs:7517
-> multiple tasks                              server/database.mjs:7536
```

The originating Hermes approval is not orphaned: `adoptWorkflowProposalApproval` moves the proposal step and approval onto the originating user-owned run and removes the temporary proposal run.

The `$ref` regression matrix passed:

- extraction tasks -> `tasks.create_many.tasks`: ACCEPT
- extraction summary -> tasks: REJECT
- project resource ID -> note projectId: ACCEPT
- project resource ID -> task projectId: ACCEPT
- tasks array -> projectId: REJECT
- unknown output: REJECT
- forward reference: REJECT

Wrong-sender, unrelated-message, and insufficient-confidence cases produced no target mutations.

Authorization checks passed for viewer project/task/workflow denial and owner success. The intended collaborator internal-write policy remains in `server/capabilities/index.mjs:114`; approval ownership remains stricter than workspace write authority.

## PREVIOUS FINDINGS STATUS

| Previous finding | Status |
|---|---|
| Cross-user approval takeover | RESOLVED |
| Cross-user approved-grant consumption | RESOLVED |
| Cross-workspace approval reuse | RESOLVED |
| Hermes approval orphan/handoff | RESOLVED |
| Invalid string -> `tasks[]` reference | RESOLVED |
| Approval replay/fabrication | RESOLVED |
| Viewer legacy project/task mutation | RESOLVED |
| Failed mail claim retry | STILL REPRODUCIBLE |
| Concurrent SQLite project failure | STILL REPRODUCIBLE |
| Approval/persistence transaction gap | STILL REPRODUCIBLE |
| Duplicate client email ambiguity | STILL REPRODUCIBLE |
| Weakened capability verifier | STILL REPRODUCIBLE |
| Advertised dead Core tools | STILL REPRODUCIBLE |
| Static compatibility bounds | STILL REPRODUCIBLE |
| Concurrent task `created:true` | STILL REPRODUCIBLE |
| Hookitup-specific preview | STILL REPRODUCIBLE |
| Single exact combined acceptance test | STILL REPRODUCIBLE |

## REPOSITORY REALITY AND SCOPE

`HEAD` to worktree contains 17 modified tracked files: 1,217 insertions and 206 deletions, plus six untracked files. This is not a clean Terra-2C-only commit boundary, so exact 2C authorship cannot be proven from Git.

The ownership-specific delta is appropriately focused:

- persisted run-user filters in approval get/list/decide/consume;
- authenticated user propagation at runtime, Hermes, REST response, and activation call sites;
- direct activation ownership validation;
- tracked two-user MCP regression coverage.

The broader workflow architecture changes cannot safely be attributed specifically to Terra 2C.

## TEST RESULTS

| Command | Outcome |
|---|---|
| `npm run verify:workflow-builder` | Sandbox: FAIL, localhost `EPERM`; rerun with bind permission: PASS |
| `npm run verify:mcp` | PASS |
| `npm run verify:mcp-contracts` | PASS |
| `npm run verify:capabilities` | PASS |
| `npm run verify:mail-automation` | PASS |
| `npm run verify:agent-runtime` | PASS |
| `npm run verify:hermes` | PASS |
| `npm run verify:hermes-workflow` | Sandbox: FAIL, localhost `EPERM`; rerun with bind permission: PASS |
| `git diff --check HEAD` | PASS, no output |

Supplementary probes also confirmed:

- Alice-approved grant cannot be consumed by Bob.
- Charlie cannot approve or deny across workspaces.
- Alice can activate after both attacks.
- Concurrent activation yields exactly one success.
- The listed P2/P3 concurrency, retry, and ambiguity behaviors remain reproducible.

## FINAL RECOMMENDATION

**READY FOR MANUAL PRODUCT TESTING**
