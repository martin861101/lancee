import { randomUUID } from 'node:crypto'
import { OpenConnectorAdapterError } from './openconnector-adapter.mjs'

const providerPattern = /^[a-z0-9][a-z0-9_-]{1,79}$/
const actionPattern = /^[a-z0-9][a-z0-9_-]{1,79}\.[a-z0-9][a-z0-9_.-]{1,159}$/
const sources = new Set(['user', 'ai', 'automation', 'workflow', 'api'])

export class IntegrationGatewayError extends Error {
  constructor(code, message, status = 400, { retryable = false } = {}) {
    super(message)
    this.name = 'IntegrationGatewayError'
    this.code = code
    this.status = status
    this.retryable = retryable
  }
}

function gatewayError(error) {
  if (error instanceof IntegrationGatewayError) return error
  if (error instanceof OpenConnectorAdapterError) {
    return new IntegrationGatewayError(error.code, error.message, error.status, { retryable: error.retryable })
  }
  return new IntegrationGatewayError('INTEGRATION_PROVIDER_ERROR', 'The integration provider request failed.', 502)
}

function validateProvider(value) {
  const provider = String(value || '').trim().toLowerCase()
  if (!providerPattern.test(provider)) {
    throw new IntegrationGatewayError('INTEGRATION_INVALID_INPUT', 'A valid integration provider is required.')
  }
  return provider
}

function validateAction(value) {
  const action = String(value || '').trim().toLowerCase()
  if (!actionPattern.test(action)) {
    throw new IntegrationGatewayError('INTEGRATION_INVALID_INPUT', 'A valid integration action is required.')
  }
  return action
}

function riskForAction(action) {
  const value = `${action.id} ${action.name || ''} ${action.description || ''}`.toLowerCase()
  if (/\b(delete|remove|revoke|destroy|archive|cancel|terminate|purge)\b/.test(value)) return 'destructive'
  if (/\b(payment|charge|refund|transfer|payout|invoice|subscription)\b/.test(value)) return 'administrative'
  if (/\b(create|send|post|publish|upload|update|edit|write|invite|add|move|reply)\b/.test(value)) return 'external-action'
  if (/\b(get|list|read|search|find|fetch|lookup|download|inspect|view)\b/.test(value)) return 'read'
  return 'external-action'
}

function publicConnection(connection) {
  return {
    id: connection.id,
    provider: connection.provider,
    displayName: connection.displayName,
    status: connection.status,
    scopes: connection.scopes,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    lastUsedAt: connection.lastUsedAt,
    error: connection.lastError || null,
  }
}

function redactSecrets(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[REDACTED]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, seen))
  const result = {}
  for (const [key, child] of Object.entries(value)) {
    result[key] = /(^|_)(access_?token|refresh_?token|api_?key|client_?secret|authorization|password|credential|cookie)($|_)/i.test(key)
      ? '[REDACTED]'
      : redactSecrets(child, seen)
  }
  return result
}

function permissionMatches(granted, required) {
  return granted === 'integration.*'
    || granted === required
    || (granted.endsWith('.*') && required.startsWith(granted.slice(0, -1)))
}

function assertActionPermission(context, provider, actionId) {
  const declared = Array.isArray(context?.integrationPermissions)
    ? context.integrationPermissions
    : Array.isArray(context?.permissions)
      ? context.permissions.filter((permission) => String(permission).startsWith('integration.'))
      : []
  if (declared.length === 0) return
  const actionName = actionId.slice(provider.length + 1)
  const required = `integration.${provider}.${actionName}`
  if (!declared.some((permission) => permissionMatches(String(permission), required))) {
    throw new IntegrationGatewayError('INTEGRATION_PERMISSION_DENIED', `Permission is required for ${actionId}.`, 403)
  }
}

function requireContext(context) {
  if (!context?.workspace?.id || !context?.user?.id) {
    throw new IntegrationGatewayError('INTEGRATION_PERMISSION_DENIED', 'The integration workspace context is unavailable.', 401)
  }
  return context
}

export function createIntegrationGateway({ database, adapter, now = () => Date.now() }) {
  if (!database || !adapter) throw new TypeError('The integration gateway requires database and adapter dependencies.')

  async function refreshConnections(context) {
    requireContext(context)
    const stored = await database.listIntegrationConnections(context.workspace.id)
    if (!adapter.enabled || stored.length === 0) return stored.map(publicConnection)
    let upstream
    try {
      upstream = await adapter.listConnections()
    } catch (error) {
      if (error instanceof OpenConnectorAdapterError) return stored.map(publicConnection)
      throw error
    }
    const byAlias = new Map(upstream.map((connection) => [connection.alias, connection]))
    const refreshed = []
    for (const connection of stored) {
      const current = byAlias.get(connection.externalConnectionName)
      let status = connection.status
      let lastError = connection.lastError
      if (current?.status === 'active') {
        status = 'connected'
        lastError = ''
      } else if (connection.status === 'connected') {
        status = 'expired'
        lastError = 'Reconnect this provider account.'
      }
      refreshed.push(await database.saveIntegrationConnection({
        ...connection,
        workspaceId: context.workspace.id,
        externalConnectionId: current?.id || connection.externalConnectionId,
        displayName: current?.accountLabel || current?.displayName || connection.displayName,
        status,
        scopes: Array.isArray(current?.scopes) ? current.scopes : connection.scopes,
        lastError,
      }))
    }
    return refreshed.map(publicConnection)
  }

  async function providers(context, { query = '', limit = 2_000 } = {}) {
    requireContext(context)
    if (!adapter.enabled) return []
    try {
      const normalizedQuery = String(query || '').trim().toLowerCase().slice(0, 120)
      const boundedLimit = Math.min(2_000, Math.max(1, Number(limit) || 2_000))
      const [catalog, connections] = await Promise.all([
        adapter.listProviders(),
        database.listIntegrationConnections(context.workspace.id),
      ])
      const connected = new Map(connections.map((item) => [item.provider, item]))
      const preferred = new Map([
        ['gmail', 0], ['outlook', 1], ['slack', 2], ['github', 3],
        ['notion', 4], ['airtable', 5], ['dropbox', 6], ['one_drive', 7],
      ])
      return catalog
        .filter((provider) => !normalizedQuery || `${provider.service} ${provider.displayName} ${(provider.categories || []).map((item) => item.displayName || item).join(' ')}`.toLowerCase().includes(normalizedQuery))
        .sort((left, right) => Number(connected.has(right.service)) - Number(connected.has(left.service))
          || (preferred.get(left.service) ?? 1_000) - (preferred.get(right.service) ?? 1_000)
          || left.displayName.localeCompare(right.displayName))
        .slice(0, boundedLimit)
        .map((provider) => {
          const oauth = (provider.auth || []).find((item) => item.type === 'oauth2')
          return {
            provider: provider.service,
            displayName: provider.displayName,
            description: provider.description || null,
            iconUrl: provider.iconUrl || null,
            homepageUrl: provider.homepageUrl || null,
            authorizationUrl: oauth?.authorizationUrl || null,
            tokenUrl: oauth?.tokenUrl || null,
            categories: (provider.categories || []).map((item) => item.displayName || item.id || item),
            authTypes: provider.authTypes || [],
            connection: connected.has(provider.service) ? publicConnection(connected.get(provider.service)) : null,
          }
        })
    } catch (error) {
      throw gatewayError(error)
    }
  }

  async function connect(context, providerValue) {
    requireContext(context)
    const provider = validateProvider(providerValue)
    try {
      const available = (await adapter.listProviders()).find((item) => item.service === provider)
      if (!available) throw new IntegrationGatewayError('INTEGRATION_ACTION_NOT_FOUND', `Unknown integration provider: ${provider}.`, 404)
      if (!available.authTypes?.includes('oauth2')) {
        throw new IntegrationGatewayError('INTEGRATION_INVALID_INPUT', `${available.displayName} does not expose an OAuth connection flow.`, 409)
      }
      const existing = await database.getIntegrationConnectionByProvider(context.workspace.id, provider)
      const connection = await database.saveIntegrationConnection({
        id: existing?.id || `intcon_${randomUUID().replaceAll('-', '')}`,
        workspaceId: context.workspace.id,
        userId: context.user.id,
        provider,
        externalConnectionName: existing?.externalConnectionName || `lnc_${randomUUID().replaceAll('-', '')}`,
        externalConnectionId: existing?.externalConnectionId || null,
        displayName: existing?.displayName || available.displayName,
        status: 'connecting',
        scopes: existing?.scopes || [],
      })
      const authorization = await adapter.startOAuth({
        provider,
        connectionName: connection.externalConnectionName,
      })
      return { connection: publicConnection(connection), authorizationUrl: authorization.authorizationUrl }
    } catch (error) {
      throw gatewayError(error)
    }
  }

  async function disconnect(context, connectionId) {
    requireContext(context)
    const connection = await database.getIntegrationConnection(context.workspace.id, String(connectionId || ''))
    if (!connection) throw new IntegrationGatewayError('INTEGRATION_NOT_CONNECTED', 'The integration connection was not found.', 404)
    try {
      await adapter.disconnect({
        provider: connection.provider,
        connectionName: connection.externalConnectionName,
      })
      await database.deleteIntegrationConnection(context.workspace.id, connection.id)
      return { disconnected: true, id: connection.id, provider: connection.provider }
    } catch (error) {
      const failure = gatewayError(error)
      if (failure.code === 'INTEGRATION_NOT_CONNECTED') {
        await database.deleteIntegrationConnection(context.workspace.id, connection.id)
        return { disconnected: true, id: connection.id, provider: connection.provider }
      }
      throw failure
    }
  }

  async function searchActions(context, input) {
    requireContext(context)
    const query = String(input?.query || '').trim()
    if (!query || query.length > 256) throw new IntegrationGatewayError('INTEGRATION_INVALID_INPUT', 'query must be between 1 and 256 characters.')
    const provider = input?.provider ? validateProvider(input.provider) : null
    const limit = Math.min(10, Math.max(1, Number(input?.limit) || 8))
    try {
      const [actions, connections] = await Promise.all([
        adapter.searchActions({ query, provider, limit: 10 }),
        database.listIntegrationConnections(context.workspace.id),
      ])
      const connected = new Set(connections.filter((item) => item.status === 'connected').map((item) => item.provider))
      return actions
        .map((action) => ({
          action: action.id,
          provider: action.service,
          name: action.name,
          description: action.description,
          connected: connected.has(action.service),
          riskLevel: riskForAction(action),
          inputSchema: action.inputSchema,
        }))
        .filter((action) => input?.connected_only !== true || action.connected)
        .sort((left, right) => Number(right.connected) - Number(left.connected))
        .slice(0, limit)
    } catch (error) {
      throw gatewayError(error)
    }
  }

  async function describeAction(context, actionValue) {
    requireContext(context)
    const actionId = validateAction(actionValue)
    try {
      const action = await adapter.describeAction(actionId)
      const connection = await database.getIntegrationConnectionByProvider(context.workspace.id, action.service)
      return {
        action: action.id,
        provider: action.service,
        name: action.name,
        description: action.description,
        inputSchema: action.inputSchema,
        outputSchema: action.outputSchema,
        requiredScopes: action.requiredScopes || [],
        providerPermissions: action.providerPermissions || [],
        connectionRequired: true,
        connected: connection?.status === 'connected',
        riskLevel: riskForAction(action),
      }
    } catch (error) {
      throw gatewayError(error)
    }
  }

  async function executeAction(context, input, invocation = {}) {
    requireContext(context)
    const actionId = validateAction(input?.action)
    const connection = await database.getIntegrationConnection(context.workspace.id, String(input?.connection_id || ''))
    if (!connection) throw new IntegrationGatewayError('INTEGRATION_NOT_CONNECTED', 'The integration connection was not found.', 404)
    if (connection.status !== 'connected') throw new IntegrationGatewayError('INTEGRATION_NOT_CONNECTED', 'Reconnect this provider before running actions.', 409)
    if (!actionId.startsWith(`${connection.provider}.`)) {
      throw new IntegrationGatewayError('INTEGRATION_PERMISSION_DENIED', 'The selected connection does not belong to this action provider.', 403)
    }
    assertActionPermission(context, connection.provider, actionId)
    const actionInput = input?.input
    if (!actionInput || typeof actionInput !== 'object' || Array.isArray(actionInput)) {
      throw new IntegrationGatewayError('INTEGRATION_INVALID_INPUT', 'input must be an object.')
    }
    if (Buffer.byteLength(JSON.stringify(actionInput)) > 64_000) {
      throw new IntegrationGatewayError('INTEGRATION_INVALID_INPUT', 'The integration action input exceeded 64 KB.', 413)
    }
    const action = await describeAction(context, actionId)
    const riskLevel = action.riskLevel
    const source = sources.has(input?.source)
      ? input.source
      : invocation.origin === 'mcp' || invocation.origin === 'agent'
        ? 'ai'
        : 'api'
    const executionId = `intexe_${randomUUID().replaceAll('-', '')}`
    const startedAt = now()
    await database.recordIntegrationExecution({
      id: executionId,
      workspaceId: context.workspace.id,
      userId: context.user.id,
      provider: connection.provider,
      connectionId: connection.id,
      action: actionId,
      riskLevel,
      status: 'running',
      durationMs: 0,
      source,
    })
    try {
      const idempotencyKey = `lancee-${executionId}-${randomUUID()}`
      const result = await adapter.executeAction({
        actionId,
        connectionName: connection.externalConnectionName,
        input: actionInput,
        idempotencyKey,
        retry: riskLevel === 'read',
      }, { signal: invocation.signal })
      const durationMs = Math.max(0, Math.round(now() - startedAt))
      await database.completeIntegrationExecution(context.workspace.id, executionId, { status: 'completed', durationMs })
      await database.markIntegrationConnectionUsed(context.workspace.id, connection.id)
      return {
        executionId,
        action: actionId,
        provider: connection.provider,
        riskLevel,
        result: redactSecrets(result.data),
        gateway: redactSecrets(result.meta),
      }
    } catch (error) {
      const failure = gatewayError(error)
      await database.completeIntegrationExecution(context.workspace.id, executionId, {
        status: 'failed',
        durationMs: Math.max(0, Math.round(now() - startedAt)),
        errorCode: failure.code,
      })
      throw failure
    }
  }

  return Object.freeze({
    enabled: adapter.enabled,
    health: (options) => adapter.health(options),
    providers,
    connect,
    disconnect,
    listConnections: refreshConnections,
    searchActions,
    describeAction,
    executeAction,
  })
}
