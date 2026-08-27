import { createHash, randomUUID } from 'node:crypto'

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'budget_exceeded'])
const RETRYABLE_CODES = new Set(['RATE_LIMITED', 'TIMEOUT', 'TEMPORARY_UNAVAILABLE', 'UNAVAILABLE'])
const DEFAULT_BUDGET = Object.freeze({
  maxSteps: 20,
  maxToolCalls: 40,
  maxRuntimeMs: 120_000,
  maxCost: 10,
  maxTokens: 100_000,
  maxIdenticalCalls: 2,
  maxRetries: 2,
  retryBaseMs: 100,
})
const MAXIMUM_BUDGET = Object.freeze({
  maxSteps: 100,
  maxToolCalls: 200,
  maxRuntimeMs: 10 * 60_000,
  maxCost: 100,
  maxTokens: 1_000_000,
  maxIdenticalCalls: 10,
  maxRetries: 5,
  retryBaseMs: 30_000,
})
const RESULT_REFERENCE_KEY = '$lanceeResult'
const FORBIDDEN_RESULT_PATHS = new Set(['__proto__', 'prototype', 'constructor'])

export class AgentRuntimeError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'AgentRuntimeError'
    this.code = code
    Object.assign(this, details)
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
}

function argumentHash(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}

function resultReference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const keys = Object.keys(value)
  if (keys.length !== 1 || keys[0] !== RESULT_REFERENCE_KEY) return undefined
  return value[RESULT_REFERENCE_KEY]
}

function validateResultReferences(value, currentSequence, location = 'arguments') {
  const reference = resultReference(value)
  if (reference !== undefined) {
    if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
      throw new AgentRuntimeError('INVALID_PLAN', `${location} has an invalid result reference.`)
    }
    const step = Number(reference.step)
    const path = String(reference.path ?? '')
    if (!Number.isInteger(step) || step < 1 || step >= currentSequence) {
      throw new AgentRuntimeError('INVALID_PLAN', `${location} must reference an earlier plan step.`)
    }
    if (
      path.length > 500 ||
      (path && !path.split('.').every((part) => /^[A-Za-z0-9_-]+$/.test(part) && !FORBIDDEN_RESULT_PATHS.has(part)))
    ) {
      throw new AgentRuntimeError('INVALID_PLAN', `${location} has an invalid result path.`)
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateResultReferences(item, currentSequence, `${location}[${index}]`))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      validateResultReferences(item, currentSequence, `${location}.${key}`)
    }
  }
}

function resolveResultReferences(value, results, currentSequence) {
  const reference = resultReference(value)
  if (reference !== undefined) {
    const step = Number(reference.step)
    if (!Number.isInteger(step) || step < 1 || step >= currentSequence) {
      throw new AgentRuntimeError('RESULT_REFERENCE_INVALID', 'A plan step referenced an invalid result sequence.')
    }
    let resolved = results[step - 1]
    if (resolved === undefined) {
      throw new AgentRuntimeError('RESULT_REFERENCE_UNAVAILABLE', `Result ${step} is unavailable.`)
    }
    const path = String(reference.path ?? '')
    for (const part of path ? path.split('.') : []) {
      if (FORBIDDEN_RESULT_PATHS.has(part) || resolved == null || !Object.hasOwn(Object(resolved), part)) {
        throw new AgentRuntimeError('RESULT_REFERENCE_UNAVAILABLE', `Result ${step}.${path} is unavailable.`)
      }
      resolved = resolved[part]
    }
    if (resolved === undefined) {
      throw new AgentRuntimeError('RESULT_REFERENCE_UNAVAILABLE', `Result ${step}.${path} is unavailable.`)
    }
    return canonical(resolved)
  }
  if (Array.isArray(value)) return value.map((item) => resolveResultReferences(item, results, currentSequence))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveResultReferences(item, results, currentSequence)]),
    )
  }
  return value
}

function boundedNumber(value, fallback, { integer = false, minimum = 0, maximum = Number.POSITIVE_INFINITY } = {}) {
  const resolved = Number(value)
  if (!Number.isFinite(resolved) || resolved < minimum) return fallback
  const bounded = Math.min(maximum, resolved)
  return integer ? Math.floor(bounded) : bounded
}

export function normalizeAgentBudget(input = {}) {
  return Object.freeze({
    maxSteps: boundedNumber(input.maxSteps, DEFAULT_BUDGET.maxSteps, { integer: true, minimum: 1, maximum: MAXIMUM_BUDGET.maxSteps }),
    maxToolCalls: boundedNumber(input.maxToolCalls, DEFAULT_BUDGET.maxToolCalls, { integer: true, minimum: 1, maximum: MAXIMUM_BUDGET.maxToolCalls }),
    maxRuntimeMs: boundedNumber(input.maxRuntimeMs, DEFAULT_BUDGET.maxRuntimeMs, { integer: true, minimum: 1, maximum: MAXIMUM_BUDGET.maxRuntimeMs }),
    maxCost: boundedNumber(input.maxCost, DEFAULT_BUDGET.maxCost, { maximum: MAXIMUM_BUDGET.maxCost }),
    maxTokens: boundedNumber(input.maxTokens, DEFAULT_BUDGET.maxTokens, { integer: true, maximum: MAXIMUM_BUDGET.maxTokens }),
    maxIdenticalCalls: boundedNumber(input.maxIdenticalCalls, DEFAULT_BUDGET.maxIdenticalCalls, { integer: true, minimum: 1, maximum: MAXIMUM_BUDGET.maxIdenticalCalls }),
    maxRetries: boundedNumber(input.maxRetries, DEFAULT_BUDGET.maxRetries, { integer: true, maximum: MAXIMUM_BUDGET.maxRetries }),
    retryBaseMs: boundedNumber(input.retryBaseMs, DEFAULT_BUDGET.retryBaseMs, { integer: true, maximum: MAXIMUM_BUDGET.retryBaseMs }),
  })
}

function parsePlannerOutput(output) {
  if (typeof output !== 'string') return output
  try {
    return JSON.parse(output)
  } catch {
    throw new AgentRuntimeError('INVALID_PLAN', 'The planner did not return valid JSON.')
  }
}

export function validateAgentPlan(rawPlan, registry, budget = DEFAULT_BUDGET) {
  const parsed = parsePlannerOutput(rawPlan)
  const steps = Array.isArray(parsed) ? parsed : parsed?.steps
  if (!Array.isArray(steps) || steps.length < 1) {
    throw new AgentRuntimeError('INVALID_PLAN', 'The planner must return a non-empty steps array.')
  }
  if (steps.length > budget.maxSteps) {
    throw new AgentRuntimeError('STEP_BUDGET_EXCEEDED', `The plan exceeds the ${budget.maxSteps} step budget.`)
  }
  const validated = steps.map((step, index) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      throw new AgentRuntimeError('INVALID_PLAN', `Plan step ${index + 1} must be an object.`)
    }
    const toolId = String(step.toolId || step.tool || '').trim()
    if (!toolId || !registry.has(toolId)) {
      throw new AgentRuntimeError('INVALID_PLAN', `Plan step ${index + 1} references an unknown capability.`)
    }
    const args = step.arguments ?? step.input ?? {}
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      throw new AgentRuntimeError('INVALID_PLAN', `Plan step ${index + 1} arguments must be an object.`)
    }
    validateResultReferences(args, index + 1, `Plan step ${index + 1} arguments`)
    const definition = registry.get(toolId)
    return Object.freeze({
      toolId,
      arguments: canonical(args),
      argumentsHash: argumentHash(args),
      riskLevel: definition?.riskLevel || 'read',
      requiresApproval: Boolean(definition?.requiresApproval),
      estimatedCost: boundedNumber(definition?.estimatedCost, 0),
    })
  })
  return Object.freeze({
    steps: Object.freeze(validated),
    finalOutput: typeof parsed?.finalOutput === 'string' ? parsed.finalOutput : null,
    usage: parsed?.usage && typeof parsed.usage === 'object' ? canonical(parsed.usage) : {},
  })
}

function trustedContext(context) {
  if (!context?.workspace?.id || !context?.user?.id) {
    throw new AgentRuntimeError('CONTEXT_UNAVAILABLE', 'Trusted server workspace and user context is required.')
  }
  return context
}

function usageFromPlan(plan) {
  const usage = plan.usage || {}
  return {
    tokens: boundedNumber(usage.tokens ?? usage.totalTokens, 0, { integer: true }),
    cost: boundedNumber(usage.cost, 0),
    runtimeMs: 0,
    retries: 0,
  }
}

function failureFromEnvelope(envelope) {
  const error = envelope?.error || {}
  return {
    code: String(error.code || 'CAPABILITY_FAILED'),
    message: String(error.message || 'The capability failed.'),
    retryable: Boolean(error.retryable) || RETRYABLE_CODES.has(error.code),
  }
}

function approvalExpiry(nowMs, ttlMs) {
  return new Date(nowMs + ttlMs).toISOString()
}

/**
 * Durable autonomous agent runner. `context` must be assembled by trusted server
 * authentication middleware; the runtime never accepts workspace/user ids apart
 * from that context.
 */
export function createAgentRuntime({
  database,
  planner,
  capabilityRegistry,
  registry = capabilityRegistry,
  now = () => Date.now(),
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  approvalTtlMs = 15 * 60_000,
  responder = null,
} = {}) {
  if (!database || typeof planner !== 'function' || !registry) {
    throw new TypeError('database, planner, and capabilityRegistry are required.')
  }

  const event = (workspaceId, runId, eventType, message, data = null, level = 'info') => (
    database.appendAgentRunEvent({ workspaceId, runId, eventType, message, data, level })
  )
  const activeRuns = new Map()

  async function failRun(workspaceId, runId, error, status = 'failed', expected = null) {
    const code = String(error?.code || 'AGENT_RUN_FAILED')
    const message = String(error?.message || 'The agent run failed.')
    await database.updateAgentRun(workspaceId, runId, {
      status,
      errorCode: code,
      errorMessage: message,
      pendingAction: null,
    }, expected)
    await event(workspaceId, runId, 'run.failed', message, { code, status }, 'error')
    return database.getAgentRun(workspaceId, runId)
  }

  async function executeRunInternal(contextInput, runId, signal) {
    const context = trustedContext(contextInput)
    const workspaceId = context.workspace.id
    const userId = context.user.id
    let run = await database.getAgentRun(workspaceId, runId, userId)
    if (!run) throw new AgentRuntimeError('RUN_NOT_FOUND', 'The agent run was not found in this workspace.')
    if (TERMINAL_STATUSES.has(run.status)) return run
    if (run.status === 'waiting_approval') return run
    if (run.status !== 'running') {
      run = await database.updateAgentRun(workspaceId, runId, { status: 'running' }, [run.status])
      if (!run) return database.getAgentRun(workspaceId, runId, userId)
    }

    const budget = normalizeAgentBudget(run.budget)
    const startedMs = Number.isFinite(Number(run.usage?.startedAtMs))
      ? Number(run.usage.startedAtMs)
      : Number.isFinite(Date.parse(run.startedAt)) ? Date.parse(run.startedAt) : now()
    const plan = validateAgentPlan(run.plan, registry, budget)
    const persistedSteps = await database.listAgentSteps(workspaceId, runId)
    const results = [...(Array.isArray(run.results) ? run.results : [])]
    const usage = { ...usageFromPlan(plan), ...(run.usage || {}) }
    usage.tokens = boundedNumber(usage.tokens, 0, { integer: true })
    usage.cost = boundedNumber(usage.cost, 0)
    usage.retries = boundedNumber(usage.retries, 0, { integer: true })
    const callCounts = new Map()
    for (const step of persistedSteps) {
      if (['running', 'completed', 'failed'].includes(step.status)) {
        const key = `${step.toolId}:${step.argumentsHash}`
        callCounts.set(key, (callCounts.get(key) || 0) + 1)
      }
    }

    for (let index = 0; index < plan.steps.length; index += 1) {
      const current = await database.getAgentRun(workspaceId, runId, userId)
      if (!current) throw new AgentRuntimeError('RUN_NOT_FOUND', 'The agent run was not found.')
      if (current.status === 'cancelled') return current
      const elapsed = Math.max(0, now() - startedMs)
      if (elapsed > budget.maxRuntimeMs) {
        return failRun(workspaceId, runId, new AgentRuntimeError('RUNTIME_BUDGET_EXCEEDED', 'The runtime budget was exceeded.'), 'budget_exceeded', ['running'])
      }
      if (usage.tokens > budget.maxTokens) {
        return failRun(workspaceId, runId, new AgentRuntimeError('TOKEN_BUDGET_EXCEEDED', 'The token budget was exceeded.'), 'budget_exceeded', ['running'])
      }

      const planned = plan.steps[index]
      let resolvedArguments
      try {
        resolvedArguments = resolveResultReferences(planned.arguments, results, index + 1)
      } catch (error) {
        return failRun(workspaceId, runId, error, 'failed', ['running'])
      }
      const resolvedArgumentsHash = argumentHash(resolvedArguments)
      let step = persistedSteps.find((candidate) => candidate.sequence === index + 1)
      if (!step) {
        step = await database.createAgentStep({
          workspaceId,
          runId,
          sequence: index + 1,
          toolId: planned.toolId,
          arguments: resolvedArguments,
          argumentsHash: resolvedArgumentsHash,
          riskLevel: planned.riskLevel,
        })
      }
      if (!step || step.toolId !== planned.toolId || step.argumentsHash !== resolvedArgumentsHash) {
        return failRun(workspaceId, runId, new AgentRuntimeError('PLAN_PERSISTENCE_MISMATCH', 'The persisted step does not match the validated plan.'), 'failed', ['running'])
      }
      if (step.status === 'completed') continue
      if (['failed', 'denied', 'cancelled'].includes(step.status)) {
        return failRun(workspaceId, runId, new AgentRuntimeError(step.errorCode || 'STEP_FAILED', step.errorMessage || 'A persisted step cannot be resumed.'), 'failed', ['running'])
      }

      let approvalProof = null
      if (planned.requiresApproval) {
        const approvals = await database.listAgentApprovals(workspaceId, { runId, limit: 200, userId })
        const approval = approvals.find((item) => item.stepId === step.id)
        if (!approval) {
          const requested = await database.requestAgentApproval({
            workspaceId,
            runId,
            stepId: step.id,
            toolId: step.toolId,
            argumentsHash: step.argumentsHash,
            riskLevel: step.riskLevel,
            expiresAt: approvalExpiry(now(), approvalTtlMs),
          })
          await database.updateAgentRun(workspaceId, runId, {
            status: 'waiting_approval',
            pendingAction: { approvalId: requested.id, stepId: step.id, toolId: step.toolId, argumentsHash: step.argumentsHash },
          }, ['running'])
          await event(workspaceId, runId, 'approval.requested', 'Human approval is required.', { approvalId: requested.id, stepId: step.id })
          return database.getAgentRun(workspaceId, runId, userId)
        }
        if (approval.status === 'pending') {
          if (Date.parse(approval.expiresAt) <= now()) {
            await database.expireAgentApprovals(workspaceId, new Date(now()).toISOString())
            await database.updateAgentStep(workspaceId, step.id, { status: 'failed', errorCode: 'APPROVAL_EXPIRED', errorMessage: 'The approval expired.' }, ['waiting_approval', 'pending'])
            return failRun(workspaceId, runId, new AgentRuntimeError('APPROVAL_EXPIRED', 'The approval expired.'), 'failed', ['running', 'waiting_approval'])
          }
          await database.updateAgentRun(workspaceId, runId, { status: 'waiting_approval' }, ['running'])
          return database.getAgentRun(workspaceId, runId, userId)
        }
        if (approval.status === 'denied') {
          await database.updateAgentStep(workspaceId, step.id, { status: 'denied', errorCode: 'APPROVAL_DENIED', errorMessage: 'The action was denied.' }, ['waiting_approval', 'pending'])
          return failRun(workspaceId, runId, new AgentRuntimeError('APPROVAL_DENIED', 'The action was denied.'), 'failed', ['running', 'waiting_approval'])
        }
        if (approval.status !== 'approved') {
          return failRun(workspaceId, runId, new AgentRuntimeError('APPROVAL_REPLAYED', 'The one-time approval is no longer valid.'), 'failed', ['running'])
        }
        const consumed = await database.consumeAgentApproval({
          workspaceId,
          id: approval.id,
          toolId: step.toolId,
          argumentsHash: step.argumentsHash,
          actorUserId: userId,
          now: new Date(now()).toISOString(),
        })
        if (!consumed) return failRun(workspaceId, runId, new AgentRuntimeError('APPROVAL_INVALID', 'The approval was expired, replayed, or did not match the arguments.'), 'failed', ['running'])
        approvalProof = { approved: true, serverIssued: true, id: consumed.id, stepId: step.id, argumentsHash: step.argumentsHash, consumedAt: consumed.consumedAt }
      }

      const callKey = `${planned.toolId}:${resolvedArgumentsHash}`
      const identical = (callCounts.get(callKey) || 0) + 1
      callCounts.set(callKey, identical)
      if (identical > budget.maxIdenticalCalls) {
        await database.updateAgentStep(workspaceId, step.id, { status: 'failed', errorCode: 'IDENTICAL_CALL_LOOP', errorMessage: 'Repeated identical tool call blocked.' }, ['pending', 'waiting_approval'])
        return failRun(workspaceId, runId, new AgentRuntimeError('IDENTICAL_CALL_LOOP', 'Repeated identical tool call blocked.'), 'budget_exceeded', ['running'])
      }

      let attempt = 0
      let envelope
      while (attempt <= budget.maxRetries) {
        run = await database.getAgentRun(workspaceId, runId, userId)
        if (run?.status === 'cancelled') {
          await database.updateAgentStep(workspaceId, step.id, { status: 'cancelled' }, ['pending', 'running', 'waiting_approval'])
          return run
        }
        if (Math.max(0, now() - startedMs) > budget.maxRuntimeMs) {
          await database.updateAgentStep(workspaceId, step.id, { status: 'failed', errorCode: 'RUNTIME_BUDGET_EXCEEDED', errorMessage: 'The runtime budget was exceeded.' }, ['pending', 'running', 'waiting_approval'])
          return failRun(workspaceId, runId, new AgentRuntimeError('RUNTIME_BUDGET_EXCEEDED', 'The runtime budget was exceeded.'), 'budget_exceeded', ['running'])
        }
        const estimatedCost = planned.estimatedCost
        if (run.toolCalls + 1 > budget.maxToolCalls || usage.cost + estimatedCost > budget.maxCost) {
          await database.updateAgentStep(workspaceId, step.id, { status: 'failed', errorCode: 'TOOL_BUDGET_EXCEEDED', errorMessage: 'The tool-call or cost budget was exceeded.' }, ['pending', 'waiting_approval', 'running'])
          return failRun(workspaceId, runId, new AgentRuntimeError('TOOL_BUDGET_EXCEEDED', 'The tool-call or cost budget was exceeded.'), 'budget_exceeded', ['running'])
        }
        await database.updateAgentStep(workspaceId, step.id, { status: 'running' }, ['pending', 'waiting_approval', 'running'])
        const invocation = {
          autonomous: true,
          origin: 'agent-runtime',
          requestId: randomUUID(),
          runId,
          stepId: step.id,
          attempt: attempt + 1,
          approval: approvalProof,
          signal,
          metadata: { workspaceId, userId, threadId: run.threadId, runId, stepId: step.id, sequence: step.sequence },
        }
        try {
          envelope = typeof registry.invokeNormalized === 'function'
            ? await registry.invokeNormalized(planned.toolId, resolvedArguments, context, invocation)
            : { success: true, data: await registry.invoke(planned.toolId, resolvedArguments, context, invocation), artifacts: [], warnings: [], error: null, metadata: {} }
        } catch (error) {
          envelope = {
            success: false,
            data: null,
            artifacts: [],
            warnings: [],
            error: {
              code: String(error?.code || 'CAPABILITY_FAILED'),
              message: String(error?.message || 'The capability failed.'),
              retryable: Boolean(error?.retryable),
            },
            metadata: {},
          }
        }
        run = await database.updateAgentRun(workspaceId, runId, {
          toolCalls: run.toolCalls + 1,
          iterations: run.iterations + 1,
        }, ['running'])
        if (!run) {
          const concurrent = await database.getAgentRun(workspaceId, runId, userId)
          if (concurrent?.status === 'cancelled') {
            await database.updateAgentStep(workspaceId, step.id, { status: 'cancelled' }, ['running'])
            return concurrent
          }
          throw new AgentRuntimeError('RUN_STATE_CONFLICT', 'The agent run changed state during execution.')
        }
        usage.cost += boundedNumber(envelope?.metadata?.cost, estimatedCost)
        usage.tokens += boundedNumber(envelope?.metadata?.tokens ?? envelope?.metadata?.totalTokens, 0, { integer: true })
        if (usage.cost > budget.maxCost || usage.tokens > budget.maxTokens || Math.max(0, now() - startedMs) > budget.maxRuntimeMs) {
          const code = usage.cost > budget.maxCost
            ? 'COST_BUDGET_EXCEEDED'
            : usage.tokens > budget.maxTokens
              ? 'TOKEN_BUDGET_EXCEEDED'
              : 'RUNTIME_BUDGET_EXCEEDED'
          const message = 'The agent execution budget was exceeded.'
          await database.updateAgentStep(workspaceId, step.id, { status: 'failed', errorCode: code, errorMessage: message, result: envelope }, ['running'])
          await database.updateAgentRun(workspaceId, runId, { usage })
          return failRun(workspaceId, runId, new AgentRuntimeError(code, message), 'budget_exceeded', ['running'])
        }
        if (envelope?.success) break
        const failure = failureFromEnvelope(envelope)
        if (!failure.retryable || attempt >= budget.maxRetries || planned.requiresApproval) break
        attempt += 1
        usage.retries += 1
        const delayMs = budget.retryBaseMs * (2 ** (attempt - 1))
        await event(workspaceId, runId, 'step.retry', 'Retrying a transient capability failure.', { stepId: step.id, attempt: attempt + 1, delayMs, code: failure.code }, 'warning')
        await sleep(delayMs)
      }

      usage.runtimeMs = Math.max(0, now() - startedMs)
      if (!envelope?.success) {
        const failure = failureFromEnvelope(envelope)
        await database.updateAgentStep(workspaceId, step.id, { status: 'failed', errorCode: failure.code, errorMessage: failure.message, result: envelope }, ['running'])
        await database.updateAgentRun(workspaceId, runId, { usage })
        return failRun(workspaceId, runId, new AgentRuntimeError(failure.code, failure.message), 'failed', ['running'])
      }
      const normalized = {
        success: true,
        data: envelope.data ?? null,
        artifacts: Array.isArray(envelope.artifacts) ? envelope.artifacts : [],
        warnings: Array.isArray(envelope.warnings) ? envelope.warnings : [],
        error: null,
        metadata: envelope.metadata && typeof envelope.metadata === 'object' ? envelope.metadata : {},
      }
      await database.updateAgentStep(workspaceId, step.id, { status: 'completed', result: normalized }, ['running'])
      results[index] = normalized
      await database.updateAgentRun(workspaceId, runId, { results, usage, pendingAction: null })
      await event(workspaceId, runId, 'step.completed', 'Agent step completed.', { stepId: step.id, toolId: step.toolId, sequence: step.sequence })
    }

    usage.runtimeMs = Math.max(0, now() - startedMs)
    let finalOutput = plan.finalOutput
    if (!finalOutput && typeof responder === 'function') {
      let response
      try {
        response = await responder({ objective: run.objective, plan, results, context, runId, usage, budget })
      } catch (error) {
        return failRun(workspaceId, runId, new AgentRuntimeError(
          error?.code || 'RESPONSE_FAILED',
          error?.message || 'The final response could not be generated.',
        ), 'failed', ['running'])
      }
      finalOutput = typeof response === 'string' ? response : String(response?.content || '')
      usage.tokens += boundedNumber(response?.usage?.tokens ?? response?.usage?.totalTokens, 0, { integer: true })
      usage.cost += boundedNumber(response?.usage?.cost, 0)
      if (usage.tokens > budget.maxTokens || usage.cost > budget.maxCost || Math.max(0, now() - startedMs) > budget.maxRuntimeMs) {
        return failRun(workspaceId, runId, new AgentRuntimeError('RESPONSE_BUDGET_EXCEEDED', 'The final response exceeded the execution budget.'), 'budget_exceeded', ['running'])
      }
    }
    await database.updateAgentRun(workspaceId, runId, {
      status: 'completed',
      results,
      usage,
      pendingAction: null,
      finalOutput: finalOutput || JSON.stringify(results.map((result) => result?.data ?? null)),
      errorCode: null,
      errorMessage: null,
    }, ['running'])
    await event(workspaceId, runId, 'run.completed', 'Agent run completed.', { steps: plan.steps.length })
    return database.getAgentRun(workspaceId, runId, userId)
  }

  async function executeRun(contextInput, runId) {
    const context = trustedContext(contextInput)
    const key = `${context.workspace.id}:${runId}`
    const existing = activeRuns.get(key)
    if (existing) return existing.promise
    const controller = new AbortController()
    const promise = executeRunInternal(context, runId, controller.signal).finally(() => {
      if (activeRuns.get(key)?.promise === promise) activeRuns.delete(key)
    })
    activeRuns.set(key, { controller, promise })
    return promise
  }

  async function start({ context: contextInput, objective, threadId = null, title = '', provider = 'lancee', externalThreadId = null, model = null, budget: budgetInput = {} }) {
    const context = trustedContext(contextInput)
    const workspaceId = context.workspace.id
    const userId = context.user.id
    const budget = normalizeAgentBudget(budgetInput)
    const thread = threadId
      ? await database.getAgentThread(workspaceId, threadId, userId)
      : await database.createAgentThread({ workspaceId, userId, title, provider, externalThreadId })
    if (!thread || thread.status !== 'active') throw new AgentRuntimeError('THREAD_NOT_FOUND', 'The active agent thread was not found.')
    let run = await database.createAgentRun({ workspaceId, userId, threadId: thread.id, objective, status: 'planned', model, plan: [], budget })
    await event(workspaceId, run.id, 'run.created', 'Agent run created.', { threadId: thread.id })
    try {
      const planned = validateAgentPlan(await planner({ objective, context, model, budget, runId: run.id, threadId: thread.id }), registry, budget)
      const initialUsage = { ...usageFromPlan(planned), startedAtMs: now() }
      if (initialUsage.tokens > budget.maxTokens || initialUsage.cost > budget.maxCost) {
        return failRun(workspaceId, run.id, new AgentRuntimeError('PLANNER_BUDGET_EXCEEDED', 'The planner exceeded the token or cost budget.'), 'budget_exceeded', ['planned'])
      }
      run = await database.updateAgentRun(workspaceId, run.id, { plan: planned, usage: initialUsage, status: 'running' }, ['planned'])
      await event(workspaceId, run.id, 'plan.validated', 'Agent plan validated.', { steps: planned.steps.length })
      return executeRun(context, run.id)
    } catch (error) {
      return failRun(workspaceId, run.id, error, error?.code?.includes('BUDGET') ? 'budget_exceeded' : 'failed', ['planned', 'running'])
    }
  }

  async function resume({ context, runId }) {
    const trusted = trustedContext(context)
    const run = await database.getAgentRun(trusted.workspace.id, runId, trusted.user.id)
    if (!run) throw new AgentRuntimeError('RUN_NOT_FOUND', 'The agent run was not found in this workspace.')
    if (run.status === 'waiting_approval') {
      const transitioned = await database.updateAgentRun(trusted.workspace.id, runId, { status: 'running' }, ['waiting_approval'])
      if (!transitioned) return database.getAgentRun(trusted.workspace.id, runId, trusted.user.id)
    }
    return executeRun(trusted, runId)
  }

  async function decideApproval({ context, runId, approvalId, decision, reason = '' }) {
    const trusted = trustedContext(context)
    const workspaceId = trusted.workspace.id
    const run = await database.getAgentRun(workspaceId, runId, trusted.user.id)
    if (!run) throw new AgentRuntimeError('RUN_NOT_FOUND', 'The agent run was not found in this workspace.')
    const approval = await database.getAgentApproval(workspaceId, approvalId, trusted.user.id)
    if (!approval || approval.runId !== runId) throw new AgentRuntimeError('APPROVAL_NOT_FOUND', 'The approval was not found for this run.')
    const decided = await database.decideAgentApproval({ workspaceId, id: approvalId, decidedBy: trusted.user.id, decision, reason, now: new Date(now()).toISOString() })
    if (!decided) {
      await database.expireAgentApprovals(workspaceId, new Date(now()).toISOString())
      throw new AgentRuntimeError('APPROVAL_NOT_PENDING', 'The approval is expired or has already been decided.')
    }
    await event(workspaceId, runId, `approval.${decision}`, `Agent action ${decision}.`, { approvalId, stepId: approval.stepId })
    return decided
  }

  async function cancel({ context, runId }) {
    const trusted = trustedContext(context)
    const workspaceId = trusted.workspace.id
    const run = await database.getAgentRun(workspaceId, runId, trusted.user.id)
    if (!run) throw new AgentRuntimeError('RUN_NOT_FOUND', 'The agent run was not found in this workspace.')
    if (TERMINAL_STATUSES.has(run.status)) return run
    activeRuns.get(`${workspaceId}:${runId}`)?.controller.abort()
    const cancelled = await database.updateAgentRun(workspaceId, runId, { status: 'cancelled', pendingAction: null }, ['planned', 'queued', 'running', 'waiting_approval'])
    for (const step of await database.listAgentSteps(workspaceId, runId)) {
      if (['pending', 'running', 'waiting_approval'].includes(step.status)) await database.updateAgentStep(workspaceId, step.id, { status: 'cancelled' }, [step.status])
    }
    await event(workspaceId, runId, 'run.cancelled', 'Agent run cancelled.')
    return cancelled || database.getAgentRun(workspaceId, runId, trusted.user.id)
  }

  return Object.freeze({ start, run: start, executeRun, resume, resumeRun: resume, decideApproval, cancel, cancelRun: cancel })
}
