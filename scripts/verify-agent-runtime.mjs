import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAgentRuntime, AgentRuntimeError } from '../server/agent-runtime.mjs'
import { openDatabase } from '../server/database.mjs'

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'lancee-agent-runtime-'))
const databasePath = join(temporaryDirectory, 'runtime.sqlite')
let database

const definitions = new Map([
  ['test.read', { riskLevel: 'read', requiresApproval: false, estimatedCost: 0.1 }],
  ['test.flaky', { riskLevel: 'read', requiresApproval: false, estimatedCost: 0.2 }],
  ['test.cost', { riskLevel: 'read', requiresApproval: false, estimatedCost: 0 }],
  ['test.write', { riskLevel: 'internal-write', requiresApproval: true, estimatedCost: 0.5 }],
])
const invocations = []
const attempts = new Map()
const registry = {
  has: (id) => definitions.has(id),
  get: (id) => definitions.get(id) || null,
  async invokeNormalized(id, input, context, invocation) {
    invocations.push({ id, input, context, invocation })
    const key = `${invocation.runId}:${id}`
    const attempt = (attempts.get(key) || 0) + 1
    attempts.set(key, attempt)
    if (id === 'test.flaky' && attempt < 3) {
      return {
        success: false,
        error: { code: 'RATE_LIMITED', message: 'retry later', retryable: true },
        metadata: { cost: 0.2 },
      }
    }
    return {
      success: true,
      data: { id, input, attempt },
      artifacts: [],
      warnings: [],
      error: null,
      metadata: { tool: id, cost: id === 'test.cost' ? 1 : definitions.get(id).estimatedCost },
    }
  },
}

function planner({ objective }) {
  if (objective === 'chain-approve') {
    return {
      steps: [
        { toolId: 'test.read', arguments: { source: 'verified-result' } },
        {
          toolId: 'test.write',
          arguments: {
            source: { $lanceeResult: { step: 1, path: 'data.input.source' } },
          },
        },
      ],
    }
  }
  if (objective === 'invalid-forward-reference') {
    return {
      steps: [{
        toolId: 'test.read',
        arguments: { source: { $lanceeResult: { step: 1, path: 'data.input' } } },
      }],
    }
  }
  if (objective === 'missing-result-reference') {
    return {
      steps: [
        { toolId: 'test.read', arguments: { source: 'verified-result' } },
        {
          toolId: 'test.read',
          arguments: { source: { $lanceeResult: { step: 1, path: 'data.missing.value' } } },
        },
      ],
    }
  }
  if (objective === 'retry') return { steps: [{ toolId: 'test.flaky', arguments: { value: 1 } }] }
  if (objective === 'runtime-budget') return { steps: [{ toolId: 'test.flaky', arguments: { value: 2 } }] }
  if (objective === 'cost-budget') return { steps: [{ toolId: 'test.cost', arguments: {} }] }
  if (objective === 'loop') {
    return { steps: [
      { toolId: 'test.read', arguments: { repeated: true } },
      { toolId: 'test.read', arguments: { repeated: true } },
    ] }
  }
  if (objective === 'tool-budget') {
    return { steps: [
      { toolId: 'test.read', arguments: { sequence: 1 } },
      { toolId: 'test.read', arguments: { sequence: 2 } },
    ] }
  }
  if (objective === 'token-budget') {
    return { steps: [{ toolId: 'test.read', arguments: {} }], usage: { tokens: 101 } }
  }
  if (['approve', 'deny', 'expire', 'cancel'].includes(objective)) {
    return { steps: [{ toolId: 'test.write', arguments: { objective, exact: true } }] }
  }
  return JSON.stringify({
    steps: [{ toolId: 'test.read', arguments: { objective } }],
    finalOutput: `finished:${objective}`,
    usage: { tokens: 12, cost: 0.01 },
  })
}

async function pendingApproval(runtime, context, objective, clock, budget = {}) {
  const run = await runtime.start({ context, objective, title: objective, budget })
  assert.equal(run.status, 'waiting_approval')
  const approval = (await database.listAgentApprovals(context.workspace.id, { runId: run.id }))[0]
  assert(approval)
  assert.equal(approval.status, 'pending')
  assert.equal(run.pendingAction.argumentsHash, approval.argumentsHash)
  return { run, approval, clock }
}

try {
  database = await openDatabase({
    databasePath,
    adminEmail: 'agent-runtime@example.test',
    adminName: 'Agent Runtime',
    adminPasswordSalt: 'runtime-salt',
    adminPasswordHash: 'runtime-hash',
    workspaceId: 'wsp_agent_runtime_a',
    workspaceName: 'Agent Runtime A',
  })
  const context = await database.getContextByEmail('agent-runtime@example.test')
  const timestamp = new Date().toISOString()
  await database.query(
    `INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
    ['wsp_agent_runtime_b', 'Agent Runtime B', timestamp, timestamp],
  )
  await database.query(
    `INSERT INTO users (id, email, name, password_salt, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    ['usr_agent_runtime_b', 'agent-runtime-b@example.test', 'Runtime B', 'salt-b', 'hash-b', timestamp, timestamp],
  )
  await database.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES ($1, $2, 'owner', $3)`,
    ['wsp_agent_runtime_b', 'usr_agent_runtime_b', timestamp],
  )
  const otherContext = await database.getContextByEmail('agent-runtime-b@example.test')

  let clock = Date.now()
  const delays = []
  const runtime = createAgentRuntime({
    database,
    planner,
    capabilityRegistry: registry,
    now: () => clock,
    sleep: async (delay) => { delays.push(delay); clock += delay },
    approvalTtlMs: 1_000,
  })

  const completed = await runtime.start({ context, objective: 'complete', title: 'complete' })
  assert.equal(completed.status, 'completed')
  assert.equal(completed.finalOutput, 'finished:complete')
  assert.equal(completed.plan.steps[0].toolId, 'test.read')
  assert.equal((await database.listAgentSteps(context.workspace.id, completed.id))[0].status, 'completed')
  assert((await database.listAgentRunEvents(context.workspace.id, completed.id)).some((item) => item.eventType === 'plan.validated'))

  const chainedCase = await pendingApproval(runtime, context, 'chain-approve', clock)
  const chainedSteps = await database.listAgentSteps(context.workspace.id, chainedCase.run.id)
  assert.equal(chainedSteps.length, 2)
  assert.deepEqual(chainedSteps[1].arguments, { source: 'verified-result' })
  assert.equal(chainedSteps[1].argumentsHash, chainedCase.approval.argumentsHash)
  await runtime.decideApproval({
    context,
    runId: chainedCase.run.id,
    approvalId: chainedCase.approval.id,
    decision: 'approved',
  })
  const chained = await runtime.resume({ context, runId: chainedCase.run.id })
  assert.equal(chained.status, 'completed')
  assert.deepEqual(
    invocations.find((item) => item.invocation.runId === chained.id && item.id === 'test.write').input,
    { source: 'verified-result' },
  )

  const invalidReference = await runtime.start({ context, objective: 'invalid-forward-reference' })
  assert.equal(invalidReference.status, 'failed')
  assert.equal(invalidReference.errorCode, 'INVALID_PLAN')

  const missingReference = await runtime.start({ context, objective: 'missing-result-reference' })
  assert.equal(missingReference.status, 'failed')
  assert.equal(missingReference.errorCode, 'RESULT_REFERENCE_UNAVAILABLE')

  const retried = await runtime.start({ context, objective: 'retry', budget: { maxRetries: 2, retryBaseMs: 7 } })
  assert.equal(retried.status, 'completed')
  assert.equal(retried.toolCalls, 3)
  assert.equal(retried.usage.retries, 2)
  assert.deepEqual(delays, [7, 14], 'retry backoff must be deterministic and injected')

  const runtimeBudget = await runtime.start({ context, objective: 'runtime-budget', budget: { maxRetries: 3, retryBaseMs: 7, maxRuntimeMs: 10 } })
  assert.equal(runtimeBudget.status, 'budget_exceeded')
  assert.equal(runtimeBudget.errorCode, 'RUNTIME_BUDGET_EXCEEDED')

  const costBudget = await runtime.start({ context, objective: 'cost-budget', budget: { maxCost: 0.5 } })
  assert.equal(costBudget.status, 'budget_exceeded')
  assert.equal(costBudget.errorCode, 'COST_BUDGET_EXCEEDED')

  const looped = await runtime.start({ context, objective: 'loop', budget: { maxIdenticalCalls: 1 } })
  assert.equal(looped.status, 'budget_exceeded')
  assert.equal(looped.errorCode, 'IDENTICAL_CALL_LOOP')

  const toolBudget = await runtime.start({ context, objective: 'tool-budget', budget: { maxToolCalls: 1 } })
  assert.equal(toolBudget.status, 'budget_exceeded')
  assert.equal(toolBudget.errorCode, 'TOOL_BUDGET_EXCEEDED')

  const tokenBudget = await runtime.start({ context, objective: 'token-budget', budget: { maxTokens: 100 } })
  assert.equal(tokenBudget.status, 'budget_exceeded')
  assert.equal(tokenBudget.errorCode, 'PLANNER_BUDGET_EXCEEDED')

  const approvedCase = await pendingApproval(runtime, context, 'approve', clock)
  assert.equal(
    await database.consumeAgentApproval({
      workspaceId: context.workspace.id,
      id: approvedCase.approval.id,
      toolId: approvedCase.approval.toolId,
      argumentsHash: 'wrong-hash',
      now: new Date(clock).toISOString(),
    }),
    null,
    'approval must be bound to the exact arguments',
  )
  await runtime.decideApproval({ context, runId: approvedCase.run.id, approvalId: approvedCase.approval.id, decision: 'approved' })
  const approved = await runtime.resume({ context, runId: approvedCase.run.id })
  assert.equal(approved.status, 'completed')
  const approvalInvocation = invocations.find((item) => item.invocation.runId === approved.id)
  assert.equal(approvalInvocation.invocation.autonomous, true)
  assert.equal(approvalInvocation.invocation.approval.approved, true)
  assert.equal(approvalInvocation.invocation.approval.argumentsHash, approvedCase.approval.argumentsHash)
  assert.equal(approvalInvocation.invocation.metadata.workspaceId, context.workspace.id)
  assert.equal(
    await database.consumeAgentApproval({
      workspaceId: context.workspace.id,
      id: approvedCase.approval.id,
      toolId: approvedCase.approval.toolId,
      argumentsHash: approvedCase.approval.argumentsHash,
      now: new Date(clock).toISOString(),
    }),
    null,
    'an approval cannot be replayed',
  )

  const deniedCase = await pendingApproval(runtime, context, 'deny', clock)
  await runtime.decideApproval({ context, runId: deniedCase.run.id, approvalId: deniedCase.approval.id, decision: 'denied', reason: 'not permitted' })
  const denied = await runtime.resume({ context, runId: deniedCase.run.id })
  assert.equal(denied.status, 'failed')
  assert.equal(denied.errorCode, 'APPROVAL_DENIED')
  assert.equal(invocations.some((item) => item.invocation.runId === denied.id), false)

  const expiredCase = await pendingApproval(runtime, context, 'expire', clock)
  clock += 1_001
  const expired = await runtime.resume({ context, runId: expiredCase.run.id })
  assert.equal(expired.status, 'failed')
  assert.equal(expired.errorCode, 'APPROVAL_EXPIRED')
  await assert.rejects(
    runtime.decideApproval({ context, runId: expiredCase.run.id, approvalId: expiredCase.approval.id, decision: 'approved' }),
    (error) => error instanceof AgentRuntimeError && error.code === 'APPROVAL_NOT_PENDING',
  )

  const cancelledCase = await pendingApproval(runtime, context, 'cancel', clock)
  const cancelled = await runtime.cancel({ context, runId: cancelledCase.run.id })
  assert.equal(cancelled.status, 'cancelled')
  assert.equal((await database.listAgentSteps(context.workspace.id, cancelled.id))[0].status, 'cancelled')
  assert.equal((await runtime.resume({ context, runId: cancelled.id })).status, 'cancelled')

  assert.equal(await database.getAgentRun(otherContext.workspace.id, completed.id), null)
  assert.equal((await database.listAgentRunEvents(otherContext.workspace.id, completed.id)).length, 0)
  await assert.rejects(
    runtime.resume({ context: otherContext, runId: completed.id }),
    (error) => error.code === 'RUN_NOT_FOUND',
  )

  await database.close()
  database = await openDatabase({
    databasePath,
    adminEmail: 'agent-runtime@example.test',
    adminName: 'Agent Runtime',
    adminPasswordSalt: 'runtime-salt',
    adminPasswordHash: 'runtime-hash',
    workspaceId: 'wsp_agent_runtime_a',
    workspaceName: 'Agent Runtime A',
  })
  const persisted = await database.getAgentRun(context.workspace.id, completed.id, context.user.id)
  assert.equal(persisted.status, 'completed')
  assert.equal(persisted.plan.steps[0].arguments.objective, 'complete')
  assert.equal((await database.listAgentSteps(context.workspace.id, completed.id)).length, 1)
  assert((await database.listAgentRunEvents(context.workspace.id, completed.id)).length >= 4)

  console.log('Agent runtime verification passed: completion, result chaining, budgets, loop protection, retry, approvals, cancellation, persistence, and workspace isolation.')
} finally {
  await database?.close()
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
