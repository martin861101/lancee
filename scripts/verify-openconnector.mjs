import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/database.mjs'
import { createLanceeMcpRuntime, LanceeMcpError } from '../server/lancee-mcp.mjs'
import {
  createIntegrationGateway,
  IntegrationGatewayError,
} from '../server/integrations/integration-gateway.mjs'
import {
  createOpenConnectorAdapter,
  OpenConnectorAdapterError,
} from '../server/integrations/openconnector-adapter.mjs'

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'lancee-openconnector-'))
let database

try {
  database = await openDatabase({
    databasePath: join(temporaryDirectory, 'openconnector.sqlite'),
    adminEmail: 'openconnector@example.test',
    adminName: 'OpenConnector Test',
    adminPasswordSalt: 'openconnector-salt',
    adminPasswordHash: 'openconnector-hash',
    workspaceId: 'wsp_openconnector_a',
    workspaceName: 'OpenConnector A',
  })
  const contextA = await database.getContextByEmail('openconnector@example.test')
  const timestamp = new Date().toISOString()
  await database.query(
    `INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
    ['wsp_openconnector_b', 'OpenConnector B', timestamp, timestamp],
  )
  await database.query(
    `INSERT INTO users (id, email, name, password_salt, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    ['usr_openconnector_b', 'openconnector-b@example.test', 'OpenConnector B', 'salt', 'hash', timestamp, timestamp],
  )
  await database.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES ($1, $2, 'owner', $3)`,
    ['wsp_openconnector_b', 'usr_openconnector_b', timestamp],
  )
  const contextB = await database.getContextByIds('usr_openconnector_b', 'wsp_openconnector_b')

  let externalAlias = ''
  let connected = false
  let executeFailure = null
  const action = {
    id: 'gmail.send_email',
    service: 'gmail',
    name: 'send_email',
    description: 'Send an email message.',
    requiredScopes: ['https://www.googleapis.com/auth/gmail.send'],
    providerPermissions: [],
    inputSchema: { type: 'object', required: ['to'], properties: { to: { type: 'string' } } },
    outputSchema: { type: 'object' },
  }
  const adapter = {
    enabled: true,
    async health() { return { status: 'healthy', latencyMs: 1 } },
    async listProviders() {
      return [
        { service: 'gmail', displayName: 'Gmail', iconUrl: null, categories: [{ displayName: 'Communication' }], authTypes: ['oauth2'] },
        { service: 'github', displayName: 'GitHub', iconUrl: null, categories: [{ displayName: 'Developer Tools' }], authTypes: ['api_key'] },
      ]
    },
    async listConnections() {
      return connected ? [{ id: 'upstream-gmail', service: 'gmail', alias: externalAlias, status: 'active', accountLabel: 'owner@example.test', scopes: action.requiredScopes, credential: { accessToken: 'must-not-leak' } }] : []
    },
    async searchActions() {
      return [{ ...action, authenticated: true, outputSchema: action.outputSchema }]
    },
    async describeAction() { return action },
    async startOAuth({ connectionName }) {
      externalAlias = connectionName
      return { authorizationUrl: 'https://accounts.example.test/oauth', state: 'opaque-state' }
    },
    async disconnect() { connected = false; return { configured: false } },
    async executeAction() {
      if (executeFailure) throw executeFailure
      return {
        data: { sent: true, access_token: 'secret', nested: { apiKey: 'secret-key' } },
        meta: { executionId: 'openconnector-execution' },
      }
    },
  }
  const gateway = createIntegrationGateway({ database, adapter })

  const catalog = await gateway.providers(contextA, { query: 'mail', limit: 5 })
  assert.equal(catalog[0].provider, 'gmail')
  const authorization = await gateway.connect(contextA, 'gmail')
  assert.match(authorization.authorizationUrl, /^https:/)
  assert.equal(authorization.connection.status, 'connecting')
  connected = true
  const connectionsA = await gateway.listConnections(contextA)
  assert.equal(connectionsA[0].status, 'connected')
  assert.equal(connectionsA[0].displayName, 'owner@example.test')
  assert.equal(JSON.stringify(connectionsA).includes('must-not-leak'), false)
  assert.deepEqual(await gateway.listConnections(contextB), [])
  assert.equal(await database.getIntegrationConnection(contextB.workspace.id, connectionsA[0].id), null)

  const found = await gateway.searchActions(contextA, { query: 'send email', limit: 5 })
  assert.equal(found[0].action, 'gmail.send_email')
  assert.equal(found[0].connected, true)
  const described = await gateway.describeAction(contextA, 'gmail.send_email')
  assert.equal(described.inputSchema.required[0], 'to')
  assert.equal(described.riskLevel, 'external-action')

  await assert.rejects(
    gateway.executeAction(
      { ...contextA, integrationPermissions: ['integration.gmail.read.*'] },
      { action: 'gmail.send_email', connection_id: connectionsA[0].id, input: { to: 'person@example.test' } },
    ),
    (error) => error instanceof IntegrationGatewayError && error.code === 'INTEGRATION_PERMISSION_DENIED',
  )
  await assert.rejects(
    gateway.executeAction(contextB, {
      action: 'gmail.send_email',
      connection_id: connectionsA[0].id,
      input: { to: 'person@example.test' },
    }),
    (error) => error instanceof IntegrationGatewayError && error.code === 'INTEGRATION_NOT_CONNECTED',
  )

  const execution = await gateway.executeAction(contextA, {
    action: 'gmail.send_email',
    connection_id: connectionsA[0].id,
    input: { to: 'person@example.test' },
    source: 'automation',
  })
  assert.equal(execution.result.sent, true)
  assert.equal(execution.result.access_token, '[REDACTED]')
  assert.equal(execution.result.nested.apiKey, '[REDACTED]')
  assert.equal((await database.listIntegrationExecutions(contextA.workspace.id))[0].status, 'completed')

  executeFailure = new OpenConnectorAdapterError('INTEGRATION_RATE_LIMITED', 'Provider rate limited.', 429, { retryable: true })
  await assert.rejects(
    gateway.executeAction(contextA, {
      action: 'gmail.send_email',
      connection_id: connectionsA[0].id,
      input: { to: 'person@example.test' },
    }),
    (error) => error.code === 'INTEGRATION_RATE_LIMITED' && error.retryable,
  )
  assert.equal((await database.listIntegrationExecutions(contextA.workspace.id))[0].status, 'failed')
  executeFailure = null

  const mcp = createLanceeMcpRuntime({ database, integrationGateway: gateway })
  const toolNames = mcp.listTools().map((tool) => tool.name)
  for (const name of ['integrations_search', 'integrations_describe', 'integrations_execute', 'integrations_connections']) {
    assert(toolNames.includes(name), `${name} should be registered`)
  }
  const mcpSearch = await mcp.invoke('integrations_search', { query: 'send email' }, contextA)
  assert.equal(mcpSearch[0].action, 'gmail.send_email')
  await assert.rejects(
    mcp.invoke('integrations_execute', {
      action: 'gmail.send_email',
      connection_id: connectionsA[0].id,
      input: { to: 'person@example.test' },
    }, contextA, { autonomous: true }),
    (error) => error instanceof LanceeMcpError && error.code === 'MCP_APPROVAL_REQUIRED',
  )
  const mcpExecution = await mcp.invoke('integrations_execute', {
    action: 'gmail.send_email',
    connection_id: connectionsA[0].id,
    input: { to: 'person@example.test' },
    source: 'ai',
  }, contextA, { autonomous: true, approval: { approved: true } })
  assert.equal(mcpExecution.result.sent, true)

  const adapterRequests = []
  const httpAdapter = createOpenConnectorAdapter({
    env: {
      OPENCONNECTOR_ENABLED: 'true',
      OPENCONNECTOR_URL: 'http://connector.test:3000',
      OPENCONNECTOR_RUNTIME_TOKEN: 'runtime-token',
      OPENCONNECTOR_TIMEOUT_MS: '500',
    },
    fetchImpl: async (url, options) => {
      adapterRequests.push({ url, options })
      return new Response(JSON.stringify({ success: true, message: 'OK', data: [{ id: 'gmail.send_email' }], meta: {} }), {
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  assert.equal((await httpAdapter.searchActions({ query: 'send', limit: 5 }))[0].id, 'gmail.send_email')
  assert.equal(adapterRequests[0].options.headers.Authorization, 'Bearer runtime-token')

  const timeoutAdapter = createOpenConnectorAdapter({
    env: { OPENCONNECTOR_ENABLED: 'true', OPENCONNECTOR_URL: 'http://connector.test:3000', OPENCONNECTOR_TIMEOUT_MS: '500' },
    fetchImpl: async (_url, options) => await new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })
    }),
  })
  await assert.rejects(
    timeoutAdapter.describeAction('gmail.send_email'),
    (error) => error instanceof OpenConnectorAdapterError && error.code === 'INTEGRATION_GATEWAY_UNAVAILABLE',
  )

  await gateway.disconnect(contextA, connectionsA[0].id)
  assert.deepEqual(await gateway.listConnections(contextA), [])
  assert((await database.listIntegrationExecutions(contextA.workspace.id)).length >= 3)
  console.log('OpenConnector verified: adapter contracts, timeout/error normalization, OAuth association, tenant isolation, dynamic discovery, schema description, approval enforcement, redaction, execution auditing, MCP flow, and disconnect.')
} finally {
  await database?.close()
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
