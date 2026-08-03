export class BaseboxMcpError extends Error {
  constructor(code, message, status = 502, details = {}) {
    super(message)
    this.name = 'BaseboxMcpError'
    this.code = code
    this.status = status
    Object.assign(this, details)
  }
}

const DEFAULT_BASEBOX_MCP_URL = 'https://base-api.hygridtech.co.za/mcp'
const CLIENT_PROTOCOL_VERSION = '2025-11-25'
const MAX_TOOL_PAGES = 25
const MAX_TOOLS = 1_000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

function normalizedMcpUrl(value, allowInsecure) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('BASEBOX_MCP_URL must be a valid URL.')
  }
  if (url.protocol !== 'https:' && !allowInsecure) {
    throw new Error('BASEBOX_MCP_URL must use HTTPS in production.')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('BASEBOX_MCP_URL must use http or https.')
  }
  return url.toString().replace(/\/$/, '')
}

function rpcMessage(payload, fallback) {
  if (payload?.error?.message) return String(payload.error.message).slice(0, 500)
  return String(payload?.error || payload?.message || fallback).slice(0, 500)
}

function toolTitle(name) {
  return String(name || '')
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function parseRpcPayload(raw, contentType, requestId) {
  const candidates = []
  if (contentType.includes('text/event-stream')) {
    for (const line of String(raw || '').split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try { candidates.push(JSON.parse(data)) } catch { /* ignore non-JSON SSE frames */ }
    }
  } else if (raw) {
    try {
      const parsed = JSON.parse(raw)
      candidates.push(...(Array.isArray(parsed) ? parsed : [parsed]))
    } catch {
      return null
    }
  }
  return candidates.find((payload) => String(payload?.id ?? '') === String(requestId)) || candidates.at(-1) || null
}

function validProtocolVersion(value) {
  const version = String(value || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(version) ? version : CLIENT_PROTOCOL_VERSION
}

async function readResponseText(response) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new BaseboxMcpError(
        'BASEBOX_MCP_RESPONSE_TOO_LARGE',
        'Basebox MCP returned more than 2 MB.',
        502,
      )
    }
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}

export function createBaseboxMcpClient({
  mcpUrl = DEFAULT_BASEBOX_MCP_URL,
  token,
  allowInsecure = false,
  timeoutMilliseconds = 30_000,
  fetchImplementation = fetch,
}) {
  const endpoint = normalizedMcpUrl(mcpUrl || DEFAULT_BASEBOX_MCP_URL, allowInsecure)
  const bearerToken = String(token || '').trim()
  const timeout = Number.isFinite(timeoutMilliseconds)
    ? Math.min(120_000, Math.max(1_000, timeoutMilliseconds))
    : 30_000
  let nextId = 1

  function authorizationHeaders() {
    if (!bearerToken) {
      throw new BaseboxMcpError(
        'BASEBOX_MCP_NOT_CONFIGURED',
        'Basebox MCP access key is not configured on the server.',
        503,
      )
    }
    return { Authorization: `Bearer ${bearerToken}` }
  }

  async function rpc(method, params = {}, { notification = false, session = null } = {}) {
    const id = notification ? null : nextId++
    const body = notification
      ? { jsonrpc: '2.0', method, params }
      : { jsonrpc: '2.0', id, method, params }
    const headers = {
      ...authorizationHeaders(),
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    }
    if (session?.id) headers['Mcp-Session-Id'] = session.id
    if (session?.protocolVersion) headers['MCP-Protocol-Version'] = session.protocolVersion

    let response
    try {
      response = await fetchImplementation(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      })
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new BaseboxMcpError('BASEBOX_MCP_TIMEOUT', 'Basebox MCP request timed out.', 504)
      }
      throw new BaseboxMcpError(
        'BASEBOX_MCP_UNREACHABLE',
        'Basebox MCP could not be reached.',
        502,
      )
    }

    const raw = await readResponseText(response)
    const contentType = String(response.headers.get('content-type') || '')
    const payload = parseRpcPayload(raw, contentType, id)
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403
        ? 'BASEBOX_MCP_UNAUTHORIZED'
        : response.status === 404 && session?.id
          ? 'BASEBOX_MCP_SESSION_EXPIRED'
          : 'BASEBOX_MCP_REQUEST_FAILED'
      throw new BaseboxMcpError(
        code,
        rpcMessage(payload, `Basebox MCP returned HTTP ${response.status}.`),
        response.status >= 400 && response.status < 600 ? response.status : 502,
      )
    }
    if (notification) {
      return {
        result: null,
        requestId: response.headers.get('x-request-id'),
        sessionId: response.headers.get('mcp-session-id'),
      }
    }
    if (!payload || typeof payload !== 'object') {
      throw new BaseboxMcpError(
        'BASEBOX_MCP_INVALID_RESPONSE',
        'Basebox MCP returned an invalid JSON-RPC response.',
        502,
      )
    }
    if (payload.error) {
      throw new BaseboxMcpError(
        'BASEBOX_MCP_RPC_ERROR',
        rpcMessage(payload, 'Basebox MCP RPC failed.'),
        502,
        { rpcCode: payload.error.code },
      )
    }
    return {
      result: payload.result,
      requestId: response.headers.get('x-request-id') || String(payload.id ?? ''),
      sessionId: response.headers.get('mcp-session-id'),
    }
  }

  async function initializeSession() {
    const initialized = await rpc('initialize', {
      protocolVersion: CLIENT_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'lancee', version: '1.0.0' },
    })
    const session = {
      id: initialized.sessionId || null,
      protocolVersion: validProtocolVersion(initialized.result?.protocolVersion),
    }
    await rpc('notifications/initialized', {}, { notification: true, session })
    return session
  }

  async function closeSession(session) {
    if (!session?.id || !bearerToken) return
    try {
      await fetchImplementation(endpoint, {
        method: 'DELETE',
        headers: {
          ...authorizationHeaders(),
          Accept: 'application/json, text/event-stream',
          'Mcp-Session-Id': session.id,
          'MCP-Protocol-Version': session.protocolVersion,
        },
        signal: AbortSignal.timeout(Math.min(timeout, 5_000)),
      })
    } catch {
      // Session cleanup is best-effort and must not replace the tool result.
    }
  }

  async function withSession(operation) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const session = await initializeSession()
      try {
        return await operation(session)
      } catch (error) {
        if (!(error instanceof BaseboxMcpError) || error.code !== 'BASEBOX_MCP_SESSION_EXPIRED' || attempt > 0) {
          throw error
        }
      } finally {
        await closeSession(session)
      }
    }
    throw new BaseboxMcpError('BASEBOX_MCP_SESSION_EXPIRED', 'Basebox MCP session expired.', 502)
  }

  return {
    configured: Boolean(bearerToken),
    mcpUrl: endpoint,
    serviceId: 'basebox',

    async listTools() {
      return await withSession(async (session) => {
        const tools = []
        let cursor
        let requestId = null
        for (let page = 0; page < MAX_TOOL_PAGES; page += 1) {
          const listed = await rpc('tools/list', cursor ? { cursor } : {}, { session })
          requestId = listed.requestId || requestId
          const pageTools = Array.isArray(listed.result?.tools) ? listed.result.tools : []
          tools.push(...pageTools)
          if (tools.length > MAX_TOOLS) {
            throw new BaseboxMcpError(
              'BASEBOX_MCP_CATALOG_TOO_LARGE',
              `Basebox returned more than ${MAX_TOOLS} tools.`,
              502,
            )
          }
          cursor = typeof listed.result?.nextCursor === 'string' && listed.result.nextCursor
            ? listed.result.nextCursor
            : null
          if (!cursor) break
          if (page === MAX_TOOL_PAGES - 1) {
            throw new BaseboxMcpError(
              'BASEBOX_MCP_PAGINATION_LIMIT',
              'Basebox tool discovery exceeded the pagination limit.',
              502,
            )
          }
        }
        return {
          requestId,
          tools: tools.map((tool) => ({
            name: String(tool.name || '').trim(),
            title: String(tool.title || '').trim() || toolTitle(tool.name),
            description: String(tool.description || '').trim(),
            inputSchema:
              tool.inputSchema && typeof tool.inputSchema === 'object' && !Array.isArray(tool.inputSchema)
                ? tool.inputSchema
                : { type: 'object', properties: {} },
          })).filter((tool) => tool.name),
        }
      })
    },

    async invoke(toolName, arguments_ = {}) {
      const name = String(toolName || '').trim()
      if (!name) {
        throw new BaseboxMcpError('BASEBOX_MCP_INVALID_ARGUMENTS', 'A Basebox tool name is required.', 400)
      }
      return await withSession(async (session) => {
        const { result, requestId } = await rpc('tools/call', {
          name,
          arguments: arguments_ && typeof arguments_ === 'object' && !Array.isArray(arguments_)
            ? arguments_
            : {},
        }, { session })
        const isError = Boolean(result?.isError)
        const content = Array.isArray(result?.content) ? result.content : []
        const text = content
          .filter((item) => item?.type === 'text' && typeof item.text === 'string')
          .map((item) => item.text)
          .join('\n')
        let data = result?.structuredContent || result
        if (!result?.structuredContent && text) {
          try { data = JSON.parse(text) } catch { data = { content: text } }
        }
        return {
          requestId,
          serviceId: 'basebox',
          toolId: name,
          isError,
          data,
          result,
        }
      })
    },
  }
}

export const defaultBaseboxMcpUrl = DEFAULT_BASEBOX_MCP_URL
export const baseboxMcpProtocolVersion = CLIENT_PROTOCOL_VERSION
