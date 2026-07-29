export class McpGatewayError extends Error {
  constructor(code, message, status = 502, details = {}) {
    super(message)
    this.code = code
    this.status = status
    Object.assign(this, details)
  }
}

function normalizedGatewayUrl(value, allowInsecure) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('MCP_GATEWAY_URL must be a valid URL.')
  }
  if (url.protocol !== 'https:' && !allowInsecure) {
    throw new Error('MCP_GATEWAY_URL must use HTTPS in production.')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('MCP_GATEWAY_URL must use http or https.')
  }
  return url.toString().replace(/\/$/, '')
}

function gatewayMessage(payload, fallback) {
  return String(payload?.detail || payload?.error || payload?.message || fallback).slice(0, 500)
}

export function createMcpGatewayClient({
  gatewayUrl,
  token,
  allowInsecure = false,
  timeoutMilliseconds = 30_000,
  fetchImplementation = fetch,
}) {
  const baseUrl = normalizedGatewayUrl(gatewayUrl, allowInsecure)
  const bearerToken = String(token || '').trim()
  const timeout = Number.isFinite(timeoutMilliseconds)
    ? Math.min(120_000, Math.max(1_000, timeoutMilliseconds))
    : 30_000

  async function request(path, init = {}) {
    if (!bearerToken) {
      throw new McpGatewayError(
        'MCP_NOT_CONFIGURED',
        'MCP gateway bearer access is not configured on the server.',
        503,
      )
    }

    let response
    try {
      response = await fetchImplementation(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          Accept: 'application/json',
          ...(init.headers || {}),
        },
        signal: AbortSignal.timeout(timeout),
      })
    } catch (error) {
      if (error?.name === 'TimeoutError') {
        throw new McpGatewayError('MCP_TIMEOUT', 'MCP gateway request timed out.', 504)
      }
      throw new McpGatewayError('MCP_UNREACHABLE', 'MCP gateway could not be reached.', 502)
    }

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new McpGatewayError(
        'MCP_REQUEST_FAILED',
        gatewayMessage(payload, `MCP gateway returned HTTP ${response.status}.`),
        response.status >= 400 && response.status < 600 ? response.status : 502,
      )
    }
    if (!payload || typeof payload !== 'object') {
      throw new McpGatewayError(
        'MCP_INVALID_RESPONSE',
        'MCP gateway returned an invalid response.',
        502,
      )
    }
    return { payload, requestId: response.headers.get('x-request-id') }
  }

  return {
    configured: Boolean(bearerToken),
    gatewayUrl: baseUrl,

    async capabilities() {
      const { payload, requestId } = await request('/api/v1/capabilities')
      if (
        !Array.isArray(payload.services) ||
        !Array.isArray(payload.tools) ||
        !Array.isArray(payload.skills)
      ) {
        throw new McpGatewayError(
          'MCP_INVALID_CAPABILITIES',
          'MCP gateway returned an invalid capability catalog.',
          502,
        )
      }
      return {
        requestId,
        services: payload.services,
        tools: payload.tools,
        skills: payload.skills,
      }
    },

    async invoke(toolId, arguments_ = {}) {
      const { payload, requestId } = await request(
        `/api/v1/tools/${encodeURIComponent(toolId)}/call`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(arguments_),
        },
      )
      if (
        typeof payload.service_id !== 'string' ||
        typeof payload.tool !== 'string' ||
        typeof payload.is_error !== 'boolean'
      ) {
        throw new McpGatewayError(
          'MCP_INVALID_INVOCATION',
          'MCP gateway returned an invalid tool result.',
          502,
        )
      }
      return {
        requestId,
        serviceId: payload.service_id,
        toolId: payload.tool,
        isError: payload.is_error,
        data: payload.data,
        result: payload.result,
      }
    },
  }
}
