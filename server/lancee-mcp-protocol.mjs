import {
  LanceeMcpError,
  lanceeMcpToolDefinitions,
} from './lancee-mcp.mjs'

export const lanceeMcpProtocolVersion = '2025-06-18'

const SERVER_INFO = {
  name: 'lancee',
  title: 'Lancee MCP',
  version: '0.1.0',
}
const MAX_BATCH_SIZE = 64

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result }
}

function rpcError(id, code, message, data) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  }
}

function toolResult(value, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    ...(isError ? { isError: true } : {}),
  }
}

function validArguments(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

export function createLanceeMcpProtocolServer({
  runtime,
  toolDefinitions = null,
  logger = console,
} = {}) {
  if (!runtime || typeof runtime.invoke !== 'function') {
    throw new TypeError('A Lancee MCP runtime with an invoke method is required.')
  }

  const resolvedTools = toolDefinitions || runtime.listTools?.() || lanceeMcpToolDefinitions
  const tools = resolvedTools.map((tool) => ({ ...tool }))
  const toolNames = new Set(tools.map((tool) => tool.name))

  async function handleMessage(message, context) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      return rpcError(null, -32600, 'Invalid Request')
    }

    const hasId = Object.hasOwn(message, 'id')
    if (
      message.method === 'notifications/initialized' ||
      message.method === 'notifications/cancelled'
    ) {
      return null
    }
    if (message.method === 'initialize') {
      return rpcResult(message.id ?? null, {
        protocolVersion: lanceeMcpProtocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      })
    }
    if (!hasId) return null
    if (message.method === 'ping') return rpcResult(message.id, {})
    if (message.method === 'tools/list') {
      return rpcResult(message.id, { tools })
    }
    if (message.method === 'tools/call') {
      const name = message.params?.name
      const argumentsValue = message.params?.arguments ?? {}
      if (typeof name !== 'string' || !toolNames.has(name)) {
        return rpcError(message.id, -32602, `Unknown Lancee MCP tool: ${name}`)
      }
      if (!validArguments(argumentsValue)) {
        return rpcError(message.id, -32602, 'Tool arguments must be a JSON object.')
      }
      try {
        const result = await runtime.invoke(name, argumentsValue, context, {
          origin: 'mcp-protocol',
          requestId: String(message.id),
        })
        return rpcResult(message.id, toolResult(result))
      } catch (error) {
        const knownError = error instanceof LanceeMcpError
        if (!knownError) {
          logger.error(`Lancee MCP tool ${name} failed:`, error)
        }
        return rpcResult(message.id, toolResult({
          error: knownError ? error.code : 'MCP_TOOL_FAILED',
          message: knownError ? error.message : 'The Lancee MCP tool failed.',
          tool: name,
        }, true))
      }
    }
    return rpcError(message.id, -32601, `Method not found: ${message.method}`)
  }

  return { handleMessage, tools }
}

export async function dispatchLanceeMcpPayload(payload, server, context) {
  const batch = Array.isArray(payload)
  const messages = batch ? payload : [payload]
  if (batch && (messages.length === 0 || messages.length > MAX_BATCH_SIZE)) {
    return {
      batch: false,
      responses: [rpcError(null, -32600, 'MCP batches must contain between 1 and 64 requests.')],
    }
  }
  const responses = (
    await Promise.all(messages.map((message) => server.handleMessage(message, context)))
  ).filter(Boolean)
  return { batch, responses }
}
