# Lancee agent runtime

The Lancee dashboard agent is a persisted planner/executor over the same local
capability registry exposed at `/mcp`. It is not a second MCP client or server,
and it cannot select a workspace, bypass a role policy, or access database
credentials.

## Execution flow

```text
authenticated objective
        ↓
capability discovery + constrained JSON plan
        ↓
plan/reference validation
        ↓
execute one normalized capability at a time
        ↓
persist result → resolve later-step inputs → continue
        ↓
pause for an exact approval when required
        ↓
summarize only persisted real results
```

The provider sees a bounded capability manifest selected for the objective. It
must return a non-empty JSON `steps` array and cannot add workspace IDs,
credentials, arbitrary code execution, or approval steps. The server validates
the tool IDs and reference graph before execution; each capability validates
its input and output schemas at the registry boundary.

## Passing results between steps

A later step may consume a real earlier result using a structured reference:

```json
{
  "steps": [
    {
      "toolId": "web.search",
      "arguments": { "query": "Lancee company website", "limit": 5 }
    },
    {
      "toolId": "browser.screenshot",
      "arguments": {
        "url": {
          "$lanceeResult": {
            "step": 1,
            "path": "data.results.0.url"
          }
        }
      }
    }
  ]
}
```

Step numbers are one-based and may point only backward. Paths are bounded,
own-property-only, and reject prototype-related segments. Resolution happens
before the target capability is invoked. The resolved arguments—not the
placeholder—are persisted and hashed, so an approval is bound to the exact
value that will execute. Missing or forward references fail the run rather
than inviting the model to invent a value.

## Durable state

| Table | Responsibility |
| --- | --- |
| `agent_threads` | Workspace/user conversation identity and archive state |
| `agent_runs` | Objective, validated plan, status, budgets, usage, results, pending action, and final output |
| `agent_steps` | Ordered resolved invocation input/hash, risk, result, status, and error |
| `agent_approvals` | Exact tool/argument binding, expiry, decision, and one-use consumption |
| `agent_run_events` | Monotonic run event stream for audit and diagnosis |

Run statuses are `planned`, `queued`, `running`, `waiting_approval`,
`completed`, `failed`, `cancelled`, and `budget_exceeded`. A restart does not
erase a run. The authenticated user can read it and explicitly resume a safe
incomplete run from persisted steps/results.

## Budgets and loop controls

Client-provided budgets can only lower or select values within server caps.

| Control | Default | Hard maximum |
| --- | ---: | ---: |
| Steps | 20 | 100 |
| Tool calls, including retries | 40 | 200 |
| Runtime | 120 seconds | 10 minutes |
| Estimated/returned cost units | 10 | 100 |
| Planner, tool, and response tokens | 100,000 | 1,000,000 |
| Identical resolved calls | 2 | 10 |
| Retries per step | 2 | 5 |
| Retry base delay | 100 ms | 30 seconds |

Only normalized retryable errors use deterministic exponential backoff.
Approval-gated calls are not retried automatically. Runtime, cost, token,
tool-call, plan-size, and repeated-call exhaustion terminate with a stable
budget error.

## Approval semantics

Capabilities marked `requiresApproval` cause the run to enter
`waiting_approval` before invocation. The approval records:

- workspace, run, and step IDs;
- capability ID and risk level;
- SHA-256 hash of canonical resolved arguments;
- requester, expiry, decision, reason, and consumer timestamps.

The default approval lifetime is 15 minutes. Approval or denial is atomic and
allowed only while pending. An approved record is atomically consumed before
invocation and cannot be replayed, used by another step, or used after its
arguments change. Denial and expiry stop the run.

If a process dies after consuming an approval but before persisting the tool
result, Lancee does not silently replay that consequential action. The run
fails closed and must be reconciled from the tool/audit state.

## HTTP API

All routes require the normal authenticated session. Mutation routes also
require the allowed `Origin` and an `Idempotency-Key` header of 8–128
characters.

| Method and route | Purpose |
| --- | --- |
| `POST /api/agent/runs` | Start a run, optionally continuing an active thread. |
| `GET /api/agent/runs` | List up to 100 runs for the signed-in user/workspace. |
| `GET /api/agent/runs/:runId` | Read a run with steps, approvals, and events. |
| `POST /api/agent/runs/:runId/resume` | Resume an incomplete persisted run. |
| `POST /api/agent/runs/:runId/approvals/:approvalId` | Approve or deny, then continue. |
| `POST /api/agent/runs/:runId/cancel` | Cancel the run and active/pending steps. |

Start request:

```http
POST /api/agent/runs
Content-Type: application/json
Idempotency-Key: agent-research-0001

{
  "objective": "Research Company X, capture its colours, and create a PDF.",
  "threadId": null,
  "budget": {
    "maxSteps": 8,
    "maxToolCalls": 12,
    "maxRuntimeMs": 90000
  }
}
```

The response includes assistant `content`, an optional `proposedAction`, and a
compact run record. A waiting action includes `agentRunId` and `approvalId` for
the dashboard card.

Decision request:

```http
POST /api/agent/runs/arun_.../approvals/aapr_...
Content-Type: application/json
Idempotency-Key: agent-approval-0001

{
  "decision": "approved",
  "reason": "The report destination and content are correct."
}
```

Use `decision: "denied"` to stop the action. The API never accepts an argument
replacement in the decision request.

## Cancellation and concurrency

Only one in-process executor promise is active for a workspace/run pair.
Cancellation aborts the registry signal, marks unfinished steps cancelled, and
prevents subsequent plan work. Each registry capability also has its own
timeout and concurrency ceiling, and the workspace/user rate limiter applies
to agent calls exactly as it does to MCP calls.

## Long-running jobs and artifacts

Capabilities that need durable asynchronous work use
[`server/execution-worker.mjs`](../server/execution-worker.mjs). Job rows,
attempts, leases, heartbeats, output, errors, and events remain authoritative in
the database; optional delivery mechanisms are accelerators only.

Generated files and screenshots are registered in `artifacts` with SHA-256
integrity and linked to their agent run where available. The final responder
receives normalized results and artifact metadata, treats them as untrusted,
and may mention only actions and sources present in those real results.

## Dashboard behavior

[`WorkspaceChat.tsx`](../src/components/dashboard/WorkspaceChat.tsx) retains the
thread ID, starts persisted runs, renders the next approval, and sends
approve/deny decisions through the agent API. The earlier single-tool proposal
path remains available only as a compatibility fallback.

## Verification

```bash
pnpm verify:agent-runtime
pnpm verify:runtime-persistence
pnpm verify:workers-artifacts
pnpm verify:capabilities
pnpm verify:codex-connector
```

The agent verifier covers successful plans, real result chaining, invalid and
forward references, budgets, deterministic retries, identical-call blocking,
approval/hash mismatch, denial, expiry, replay, cancellation, restart
persistence, and cross-workspace isolation.

For the full local catalog, browser isolation, network policy, and production
smoke requirements, see [`LANCEE_MCP.md`](LANCEE_MCP.md).
