import assert from 'node:assert/strict'
import {
  BaseboxMcpError,
  createBaseboxMcpClient,
} from '../server/basebox-mcp.mjs'

const calls = []
let sessionNumber = 0

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
}

async function fakeFetch(_url, init = {}) {
  calls.push(init)
  assert.equal(init.headers.Authorization, 'Bearer test-basebox-key')
  if (init.method === 'DELETE') {
    assert.match(init.headers['Mcp-Session-Id'], /^session-/)
    assert.equal(init.headers['MCP-Protocol-Version'], '2025-11-25')
    return new Response(null, { status: 204 })
  }

  const request = JSON.parse(init.body)
  if (request.method === 'initialize') {
    sessionNumber += 1
    return jsonResponse({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: '2025-11-25',
        capabilities: { tools: {} },
        serverInfo: { name: 'basebox-verifier', version: '1.0.0' },
      },
    }, { headers: { 'Mcp-Session-Id': `session-${sessionNumber}` } })
  }

  assert.equal(init.headers['Mcp-Session-Id'], `session-${sessionNumber}`)
  assert.equal(init.headers['MCP-Protocol-Version'], '2025-11-25')
  if (request.method === 'notifications/initialized') {
    return new Response(null, { status: 202 })
  }
  if (request.method === 'tools/list' && !request.params.cursor) {
    return jsonResponse({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: [{
          name: 'connections_list',
          title: 'List connections',
          description: 'Lists live Basebox connections.',
          inputSchema: { type: 'object', properties: {} },
        }],
        nextCursor: 'page-2',
      },
    })
  }
  if (request.method === 'tools/list' && request.params.cursor === 'page-2') {
    const payload = {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: [{
          name: 'connection_status',
          description: 'Gets one connection status.',
          inputSchema: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        }],
      },
    }
    return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  if (request.method === 'tools/call') {
    assert.equal(request.params.name, 'connections_list')
    return jsonResponse({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [{ type: 'text', text: '{"connections":2}' }],
        structuredContent: { connections: 2 },
        isError: false,
      },
    })
  }
  throw new Error(`Unexpected test MCP method: ${request.method}`)
}

const client = createBaseboxMcpClient({
  token: 'test-basebox-key',
  fetchImplementation: fakeFetch,
})
assert.equal(client.configured, true)
assert.equal(client.mcpUrl, 'https://base-api.hygridtech.co.za/mcp')

const catalog = await client.listTools()
assert.deepEqual(catalog.tools.map((tool) => tool.name), [
  'connections_list',
  'connection_status',
])
assert.equal(catalog.tools[0].title, 'List connections')
assert.equal(catalog.tools[1].title, 'Connection Status')

const invocation = await client.invoke('connections_list', {})
assert.equal(invocation.isError, false)
assert.deepEqual(invocation.data, { connections: 2 })
assert.equal(calls.filter((call) => call.method === 'DELETE').length, 2)

const missing = createBaseboxMcpClient({ token: '', fetchImplementation: fakeFetch })
await assert.rejects(
  () => missing.listTools(),
  (error) => error instanceof BaseboxMcpError && error.code === 'BASEBOX_MCP_NOT_CONFIGURED',
)

const rejected = createBaseboxMcpClient({
  token: 'test-basebox-key',
  fetchImplementation: async () => jsonResponse({ error: 'Invalid MCP access key' }, { status: 401 }),
})
await assert.rejects(
  () => rejected.listTools(),
  (error) => error instanceof BaseboxMcpError && error.code === 'BASEBOX_MCP_UNAUTHORIZED',
)

let retrySession = 0
let expiredOnce = false
const retrying = createBaseboxMcpClient({
  token: 'test-basebox-key',
  fetchImplementation: async (_url, init = {}) => {
    if (init.method === 'DELETE') return new Response(null, { status: 204 })
    const request = JSON.parse(init.body)
    if (request.method === 'initialize') {
      retrySession += 1
      return jsonResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: { protocolVersion: '2025-11-25', capabilities: { tools: {} } },
      }, { headers: { 'Mcp-Session-Id': `retry-${retrySession}` } })
    }
    if (request.method === 'notifications/initialized') return new Response(null, { status: 202 })
    if (!expiredOnce) {
      expiredOnce = true
      return jsonResponse({ error: 'Session expired' }, { status: 404 })
    }
    return jsonResponse({ jsonrpc: '2.0', id: request.id, result: { tools: [] } })
  },
})
assert.deepEqual((await retrying.listTools()).tools, [])
assert.equal(retrySession, 2)

console.log('Basebox MCP verified: authenticated Streamable HTTP, negotiated sessions, expired-session recovery, pagination, SSE responses, structured tool results, cleanup, and honest auth failures.')
