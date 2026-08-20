import assert from 'node:assert/strict'
import {
  createLanceeMcpProtocolServer,
  dispatchLanceeMcpPayload,
  lanceeMcpProtocolVersion,
} from '../server/lancee-mcp-protocol.mjs'
import { LanceeMcpError } from '../server/lancee-mcp.mjs'

const context = {
  user: { id: 'usr_test' },
  workspace: { id: 'wsp_test' },
  membership: { role: 'owner' },
}
const calls = []
const runtime = {
  async invoke(name, argumentsValue, invocationContext) {
    calls.push({ name, argumentsValue, invocationContext })
    if (name === 'query_dashboard') {
      return { resource: argumentsValue.resource, rows: [], total: 0 }
    }
    throw new LanceeMcpError('MCP_TEST_FAILURE', 'Expected test failure.')
  },
  normalizeResult(_name, result) {
    return {
      success: true,
      ok: true,
      data: {
        resource: result.resource,
        results: result.rows,
        total: result.total,
      },
      artifacts: [],
      warnings: [],
      error: null,
      metadata: { contractVersion: '1.0' },
    }
  },
}
const server = createLanceeMcpProtocolServer({ runtime })

const initialize = await server.handleMessage({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {},
}, context)
assert.equal(initialize.result.protocolVersion, lanceeMcpProtocolVersion)
assert.equal(initialize.result.serverInfo.name, 'lancee')

const listed = await server.handleMessage({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/list',
}, context)
assert(listed.result.tools.some((tool) => tool.name === 'query_dashboard'))
assert(!listed.result.tools.some((tool) => tool.name === 'configure_mcp_service'))

const invoked = await server.handleMessage({
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: { name: 'query_dashboard', arguments: { resource: 'projects' } },
}, context)
assert.equal(invoked.result.isError, undefined)
assert.deepEqual(invoked.result.structuredContent.data, {
  resource: 'projects',
  results: [],
  total: 0,
})
assert.equal(calls[0].invocationContext, context)

const failed = await server.handleMessage({
  jsonrpc: '2.0',
  id: 4,
  method: 'tools/call',
  params: { name: 'create_client', arguments: { name: 'Test' } },
}, context)
assert.equal(failed.result.isError, true)
assert.equal(failed.result.structuredContent.ok, false)
assert.equal(failed.result.structuredContent.error.code, 'MCP_TEST_FAILURE')

const dispatched = await dispatchLanceeMcpPayload([
  { jsonrpc: '2.0', id: 5, method: 'ping' },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
], server, context)
assert.equal(dispatched.batch, true)
assert.deepEqual(dispatched.responses, [{ jsonrpc: '2.0', id: 5, result: {} }])

console.log('Local Lancee MCP protocol verified: initialization, local tool discovery, workspace-context invocation, bounded batches, and error results.')
