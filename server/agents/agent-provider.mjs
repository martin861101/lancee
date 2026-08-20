import { createHash } from 'node:crypto'

export class AgentProviderError extends Error {
  constructor(code, message, {
    status = 503,
    retryable = false,
    fallbackEligible = false,
    cause = undefined,
  } = {}) {
    super(message, cause ? { cause } : undefined)
    this.name = 'AgentProviderError'
    this.code = code
    this.status = status
    this.retryable = retryable
    this.fallbackEligible = fallbackEligible
  }
}

export function getAgentProviderConfig(env = process.env) {
  const requestedProvider = String(env.AGENT_PROVIDER || '').trim().toLowerCase()
  const hermesEndpoint = String(env.HERMES_ENDPOINT_URL || '').trim()
  const hermesApiKey = String(env.HERMES_API_KEY || '').trim()
  const profileApiKeysConfigured = Boolean(String(env.HERMES_PROFILE_API_KEYS_JSON || '').trim())
  const hermesConfigured = Boolean(hermesEndpoint && (hermesApiKey || profileApiKeysConfigured))
  const supportedProviders = new Set(['hermes', 'lancee'])
  const configurationError = requestedProvider && !supportedProviders.has(requestedProvider)
    ? `Unsupported agent provider: ${requestedProvider}`
    : null
  const provider = supportedProviders.has(requestedProvider)
    ? requestedProvider
    : requestedProvider
      ? 'lancee'
      : hermesConfigured
        ? 'hermes'
        : 'lancee'
  const fallbackRequested = String(env.AGENT_FALLBACK_PROVIDER || 'lancee').trim().toLowerCase()
  const fallbackProvider = supportedProviders.has(fallbackRequested) && fallbackRequested !== provider
    ? fallbackRequested
    : null

  return Object.freeze({
    provider,
    fallbackProvider,
    fallbackEnabled: env.AGENT_FALLBACK_ENABLED !== 'false',
    configurationError,
    hermes: Object.freeze({
      configured: hermesConfigured,
      endpoint: hermesEndpoint,
      model: String(env.HERMES_MODEL || 'hermes-agent').trim() || 'hermes-agent',
      timeoutMs: boundedEnvironmentNumber(env.HERMES_AGENT_TIMEOUT_MS || env.AGENT_TIMEOUT_MS, 120_000, 1_000, 600_000),
      pollMs: boundedEnvironmentNumber(env.HERMES_AGENT_POLL_MS, 250, 50, 5_000),
      streamEvents: env.HERMES_AGENT_STREAM_EVENTS !== 'false',
      profileEndpointTemplate: String(env.HERMES_PROFILE_ENDPOINT_TEMPLATE || '').trim(),
      profileApiKeysConfigured,
      profileIsolation: true,
      mcpConfigured: Boolean(
        String(env.HERMES_MCP_URL || '').trim() &&
        String(env.HERMES_MCP_AUTH_TOKEN || '').trim(),
      ),
    }),
  })
}

function boundedEnvironmentNumber(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value || '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, parsed))
}

export function trustedAgentRequest(input = {}) {
  const context = input.context
  const contextWorkspaceId = String(context?.workspace?.id || '').trim()
  const contextUserId = String(context?.user?.id || '').trim()
  if (!contextWorkspaceId || !contextUserId) {
    throw new AgentProviderError(
      'AGENT_CONTEXT_UNAVAILABLE',
      'A trusted workspace and user context is required.',
      { status: 401 },
    )
  }
  const workspaceId = String(input.workspaceId || contextWorkspaceId).trim()
  const userId = String(input.userId || contextUserId).trim()
  if (workspaceId !== contextWorkspaceId || userId !== contextUserId) {
    throw new AgentProviderError(
      'AGENT_CONTEXT_MISMATCH',
      'The requested agent identity does not match the authenticated context.',
      { status: 403 },
    )
  }
  const message = String(input.message ?? input.objective ?? '').trim()
  if (!message || message.length > 4_000) {
    throw new AgentProviderError(
      'AGENT_INVALID_MESSAGE',
      'An agent message between 1 and 4,000 characters is required.',
      { status: 400 },
    )
  }
  const threadId = input.threadId ? String(input.threadId).trim() : null
  const conversationId = input.conversationId
    ? String(input.conversationId).trim()
    : threadId
  if (threadId && !/^athr_[a-f0-9]{20}$/.test(threadId)) {
    throw new AgentProviderError(
      'AGENT_INVALID_THREAD',
      'A valid agent conversation id is required.',
      { status: 400 },
    )
  }
  if (conversationId && !/^athr_[a-f0-9]{20}$/.test(conversationId)) {
    throw new AgentProviderError(
      'AGENT_INVALID_THREAD',
      'A valid agent conversation id is required.',
      { status: 400 },
    )
  }
  return {
    ...input,
    context,
    workspaceId,
    userId,
    message,
    objective: message,
    threadId,
    conversationId: conversationId || null,
  }
}

export function stableAgentScope(workspaceId, userId, scope = 'conversation') {
  return `agent:${createHash('sha256').update(`${workspaceId}:${userId}:${scope}`).digest('hex').slice(0, 32)}`
}

export function createLanceeAgentProvider({ runtime }) {
  if (!runtime || typeof runtime.start !== 'function') {
    throw new TypeError('A Lancee agent runtime is required.')
  }
  return Object.freeze({
    name: 'lancee',
    async runAgent(input) {
      const request = trustedAgentRequest(input)
      return runtime.start({
        context: request.context,
        objective: request.message,
        threadId: request.threadId || request.conversationId,
        title: request.title || request.message.slice(0, 120),
        budget: request.budget || {},
        provider: 'lancee',
      })
    },
    async resumeAgent(input) {
      const request = trustedAgentRequest({ ...input, message: input.message || 'Resume the existing agent run.' })
      return runtime.resume({ context: request.context, runId: input.runId })
    },
    async decideApproval(input) {
      const request = trustedAgentRequest({ ...input, message: input.message || 'Decide the existing agent approval.' })
      return runtime.decideApproval({
        context: request.context,
        runId: input.runId,
        approvalId: input.approvalId,
        decision: input.decision,
        reason: input.reason || '',
      }).then(async () => runtime.resume({ context: request.context, runId: input.runId }))
    },
    async cancelAgent(input) {
      const request = trustedAgentRequest({ ...input, message: input.message || 'Cancel the existing agent run.' })
      return runtime.cancel({ context: request.context, runId: input.runId })
    },
    async getStatus() {
      return { configured: true, reachable: true, provider: 'lancee', runtimeAvailable: true, mcpAvailable: true }
    },
  })
}

export function createAgentProviderGateway({
  database,
  config = getAgentProviderConfig(),
  hermes,
  lancee,
  logger = console,
} = {}) {
  const providers = new Map([
    ['hermes', hermes],
    ['lancee', lancee],
  ])

  function providerForName(name) {
    const provider = providers.get(name)
    if (!provider) throw new AgentProviderError('AGENT_PROVIDER_UNAVAILABLE', `Agent provider ${name} is unavailable.`)
    return provider
  }

  async function providerForThread(context, threadId) {
    if (!threadId || !database?.getAgentThread) return providerForName(config.provider)
    const thread = await database.getAgentThread(context.workspace.id, threadId, context.user.id)
    if (!thread) {
      throw new AgentProviderError('AGENT_THREAD_NOT_FOUND', 'The agent conversation was not found.', { status: 404 })
    }
    return providerForName(thread.provider === 'hermes' ? 'hermes' : 'lancee')
  }

  async function runAgent(input) {
    const request = trustedAgentRequest(input)
    const primary = await providerForThread(request.context, request.threadId || request.conversationId)
    try {
      return await primary.runAgent(request)
    } catch (error) {
      const fallbackName = config.fallbackEnabled && config.fallbackProvider
        ? config.fallbackProvider
        : null
      if (
        !fallbackName ||
        primary.name === fallbackName ||
        !(error instanceof AgentProviderError) ||
        !error.fallbackEligible
      ) throw error
      logger.warn?.('agent.provider.fallback', {
        from: primary.name,
        to: fallbackName,
        workspaceId: request.workspaceId,
        userId: request.userId,
        code: error.code,
      })
      const fallbackRequest = primary.name === 'hermes'
        ? { ...request, threadId: null, conversationId: null }
        : request
      return providerForName(fallbackName).runAgent(fallbackRequest)
    }
  }

  async function providerForRun(context, runId) {
    if (!database?.getAgentRun || !database?.getAgentThread) return providerForName(config.provider)
    const run = await database.getAgentRun(context.workspace.id, runId, context.user.id)
    if (!run) throw new AgentProviderError('AGENT_RUN_NOT_FOUND', 'The agent run was not found.', { status: 404 })
    return providerForThread(context, run.threadId)
  }

  async function status({ probe = false } = {}) {
    const primary = providerForName(config.provider)
    const fallback = config.fallbackProvider ? providers.get(config.fallbackProvider) : null
    const [primaryStatus, fallbackStatus] = await Promise.all([
      primary?.getStatus?.({ probe }) || { configured: false, reachable: false, provider: config.provider },
      fallback?.getStatus?.({ probe }) || null,
    ])
    return {
      provider: config.provider,
      configured: Boolean(primaryStatus.configured),
      reachable: Boolean(primaryStatus.reachable),
      runtimeAvailable: Boolean(primaryStatus.runtimeAvailable),
      mcpAvailable: Boolean(primaryStatus.mcpAvailable),
      fallbackProvider: config.fallbackProvider,
      fallback: fallbackStatus,
      configurationError: config.configurationError || primaryStatus.error || null,
    }
  }

  return Object.freeze({
    name: config.provider,
    runAgent,
    start: runAgent,
    async resume(input) {
      const request = trustedAgentRequest({ ...input, message: input.message || 'Resume the existing agent run.' })
      return (await providerForRun(request.context, input.runId)).resumeAgent({ ...request, runId: input.runId })
    },
    async decideApproval(input) {
      const request = trustedAgentRequest({ ...input, message: input.message || 'Decide the existing agent approval.' })
      return (await providerForRun(request.context, input.runId)).decideApproval({ ...request, ...input })
    },
    async cancel(input) {
      const request = trustedAgentRequest({ ...input, message: input.message || 'Cancel the existing agent run.' })
      return (await providerForRun(request.context, input.runId)).cancelAgent({ ...request, runId: input.runId })
    },
    status,
    config,
  })
}
