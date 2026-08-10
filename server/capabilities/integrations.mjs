import { requestPublicResource } from './network.mjs'
import { LanceeCapabilityError, textInput } from './registry.mjs'
import { IntegrationGatewayError } from '../integrations/integration-gateway.mjs'

const MAX_EXTERNAL_BODY_LENGTH = 32_000
const MAX_EXTERNAL_RESPONSE_LENGTH = 256_000

function jsonBody(value) {
  try {
    const body = Buffer.from(JSON.stringify(value))
    if (body.byteLength > MAX_EXTERNAL_BODY_LENGTH) {
      throw new LanceeCapabilityError('BODY_TOO_LARGE', 'The external API request body exceeded the 32 KB limit.', 413)
    }
    return body
  } catch (error) {
    if (error instanceof LanceeCapabilityError) throw error
    throw new LanceeCapabilityError('INVALID_ARGUMENTS', 'The request body must be JSON-compatible.')
  }
}

export function createIntegrationCapabilities({
  requestImpl = requestPublicResource,
  dnsLookup,
  env = process.env,
  integrationGateway = null,
} = {}) {
  const capabilities = [{
    id: 'integration.http.request',
    namespace: 'integration',
    version: '1.1.0',
    description: 'Call a public HTTP API with pinned DNS, bounded input/output, no redirects, and private-network blocking.',
    provider: 'lancee.integrations.http',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', minLength: 1, maxLength: 2048, format: 'uri' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] },
        headers: {
          type: 'object',
          additionalProperties: { type: 'string', maxLength: 500 },
          maxProperties: 20,
        },
        body: {},
        timeout_ms: { type: 'integer', minimum: 250, maximum: 15000 },
      },
      required: ['url'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      required: ['status', 'ok', 'url', 'contentType', 'data'],
    },
    requiredPermissions: ['integrations:invoke'],
    riskLevel: 'external-action',
    requiresApproval: true,
    timeoutMs: 15_000,
    concurrencyLimit: 2,
    estimatedCost: 0,
    supportsAsync: false,
    tags: ['integration', 'http', 'api'],
    async execute({ input, signal }) {
      const url = textInput(input, 'url', { required: true, maxLength: 2048 })
      const method = textInput(input, 'method', { maxLength: 10 }).toUpperCase() || 'GET'
      const headers = input.headers === undefined ? {} : input.headers
      const blockedHeaders = new Set([
        'authorization', 'cookie', 'set-cookie', 'proxy-authorization', 'host',
        'content-length', 'x-forwarded-for', 'x-forwarded-host',
      ])
      const requestHeaders = {}
      for (const [key, value] of Object.entries(headers)) {
        if (blockedHeaders.has(key.toLowerCase())) {
          throw new LanceeCapabilityError('HEADER_BLOCKED', `The ${key} header is not allowed.`)
        }
        if (!/^[a-z0-9-]+$/i.test(key)) {
          throw new LanceeCapabilityError('INVALID_ARGUMENTS', 'Headers must use simple names.')
        }
        requestHeaders[key] = value
      }
      const hasBody = input.body !== undefined && !['GET', 'HEAD'].includes(method)
      const body = hasBody ? jsonBody(input.body) : null
      if (hasBody && !Object.keys(requestHeaders).some((key) => key.toLowerCase() === 'content-type')) {
        requestHeaders['Content-Type'] = 'application/json'
      }
      const production = env.NODE_ENV === 'production' || env.APP_ENV === 'production'
      const allowDevelopmentHttp = !production && env.LANCEE_CAPABILITIES_ALLOW_HTTP === 'true'
      const response = await requestImpl(url, {
        method,
        headers: requestHeaders,
        body,
        dnsLookup,
        protocols: allowDevelopmentHttp ? ['https:', 'http:'] : ['https:'],
        maximumBytes: MAX_EXTERNAL_RESPONSE_LENGTH,
        timeoutMs: Number.isInteger(input.timeout_ms) ? input.timeout_ms : 10_000,
        maximumRedirects: 0,
        signal,
      })
      const contentType = String(response.headers['content-type'] || '')
      const raw = response.body.toString('utf8')
      let data = raw
      if (contentType.includes('json')) {
        try {
          data = JSON.parse(raw)
        } catch {
          data = raw
        }
      }
      return {
        status: response.status,
        ok: response.status >= 200 && response.status < 300,
        url: response.url,
        contentType: contentType || null,
        data,
      }
    },
  }]

  if (!integrationGateway?.enabled) return capabilities

  const execute = (operation) => async ({ input, context, signal, invocation }) => {
    try {
      return await operation(input, context, { ...invocation, signal })
    } catch (error) {
      if (error instanceof IntegrationGatewayError) {
        throw new LanceeCapabilityError(error.code, error.message, error.status, { retryable: error.retryable })
      }
      throw error
    }
  }
  const gatewayAvailable = () => integrationGateway.enabled

  capabilities.push(
    {
      id: 'integration.search',
      namespace: 'integration',
      version: '1.0.0',
      description: 'Search the external integration catalog dynamically and return a small ranked set of workspace-relevant actions.',
      provider: 'lancee.integration-gateway',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 256 },
          provider: { type: 'string', maxLength: 80 },
          connected_only: { type: 'boolean' },
          limit: { type: 'integer', minimum: 1, maximum: 10 },
        },
        required: ['query'],
        additionalProperties: false,
      },
      outputSchema: { type: 'array', maxItems: 10 },
      requiredPermissions: ['integrations:read'],
      riskLevel: 'read',
      requiresApproval: false,
      timeoutMs: 15_000,
      concurrencyLimit: 4,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['integration', 'search', 'discovery'],
      isAvailable: gatewayAvailable,
      execute: execute((input, context) => integrationGateway.searchActions(context, input)),
    },
    {
      id: 'integration.describe',
      namespace: 'integration',
      version: '1.0.0',
      description: 'Describe one external action using its current OpenConnector schema, scopes, connection state, and risk classification.',
      provider: 'lancee.integration-gateway',
      inputSchema: {
        type: 'object',
        properties: { action: { type: 'string', minLength: 3, maxLength: 240 } },
        required: ['action'],
        additionalProperties: false,
      },
      outputSchema: { type: 'object' },
      requiredPermissions: ['integrations:read'],
      riskLevel: 'read',
      requiresApproval: false,
      timeoutMs: 15_000,
      concurrencyLimit: 4,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['integration', 'describe', 'schema'],
      isAvailable: gatewayAvailable,
      execute: execute((input, context) => integrationGateway.describeAction(context, input.action)),
    },
    {
      id: 'integration.connections',
      namespace: 'integration',
      version: '1.0.0',
      description: 'List only the safe, non-secret external provider connections owned by the authorized Lancee workspace.',
      provider: 'lancee.integration-gateway',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      outputSchema: { type: 'array' },
      requiredPermissions: ['integrations:read'],
      riskLevel: 'read',
      requiresApproval: false,
      timeoutMs: 15_000,
      concurrencyLimit: 4,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['integration', 'connection', 'discovery'],
      isAvailable: gatewayAvailable,
      execute: execute((_input, context) => integrationGateway.listConnections(context)),
    },
    {
      id: 'integration.execute',
      namespace: 'integration',
      version: '1.0.0',
      description: 'Execute one validated external provider action through a workspace-owned connection. Credentials never enter Lancee tool arguments or results.',
      provider: 'lancee.integration-gateway',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', minLength: 3, maxLength: 240 },
          connection_id: { type: 'string', minLength: 8, maxLength: 100 },
          input: { type: 'object' },
          source: { type: 'string', enum: ['user', 'ai', 'automation', 'workflow', 'api'] },
        },
        required: ['action', 'connection_id', 'input'],
        additionalProperties: false,
      },
      outputSchema: { type: 'object' },
      requiredPermissions: ['integrations:invoke'],
      riskLevel: 'external-action',
      requiresApproval: true,
      timeoutMs: 35_000,
      concurrencyLimit: 2,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['integration', 'execute', 'external'],
      isAvailable: gatewayAvailable,
      execute: execute((input, context, invocation) => integrationGateway.executeAction(context, input, invocation)),
    },
  )
  return capabilities
}
