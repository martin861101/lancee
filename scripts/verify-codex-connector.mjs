import assert from 'node:assert/strict'
import { createHash, scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

const projectDirectory = new URL('..', import.meta.url).pathname
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'lancee-codex-'))
const databasePath = join(temporaryDirectory, 'lancee.sqlite')
const pluginDataPath = join(temporaryDirectory, 'plugin-data')
const password = 'codex-connector-test-password'
const passwordSalt = 'codex-connector-test-salt'
const passwordHash = scryptSync(password, passwordSalt, 64).toString('hex')
const adminEmail = 'codex-connector@example.com'

async function availablePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert(address && typeof address === 'object')
  const port = address.port
  server.close()
  await once(server, 'close')
  return port
}

async function startAiProvider() {
  const port = await availablePort()
  const server = createHttpServer(async (request, response) => {
    assert.equal(request.method, 'POST')
    assert.equal(request.url, '/chat/completions')
    assert.equal(request.headers.authorization, 'Bearer provider-test-key')
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    assert.equal(body.model, 'connector-test-model')
    assert(body.messages.some((message) => message.role === 'user'))
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({
      model: 'connector-test-model',
      choices: [{ message: { content: 'Device-authenticated completion' } }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    }))
  })
  server.listen(port, '127.0.0.1')
  await once(server, 'listening')
  return { server, url: `http://127.0.0.1:${port}/chat/completions` }
}

async function startApplication(aiEndpoint) {
  const port = await availablePort()
  const origin = `http://127.0.0.1:${port}`
  const output = []
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: projectDirectory,
    env: {
      ...process.env,
      APP_ENV: 'development',
      PORT: String(port),
      PUBLIC_ORIGIN: origin,
      DATABASE_PATH: databasePath,
      SESSION_SECRET: 'codex-connector-test-session-secret',
      ADMIN_NAME: 'Codex Connector Admin',
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD_SALT: passwordSalt,
      ADMIN_PASSWORD_HASH: passwordHash,
      WORKSPACE_ID: 'wsp_codex_connector',
      WORKSPACE_NAME: 'Codex Connector Workspace',
      AI_PROVIDER: 'openai',
      AI_API_KEY: 'provider-test-key',
      AI_MODEL: 'connector-test-model',
      AI_ENDPOINT_URL: aiEndpoint,
      SMTP_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => output.push(chunk.toString()))
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Application exited before startup:\n${output.join('')}`)
    }
    try {
      const response = await fetch(`${origin}/api/health`)
      if (response.ok) return { child, origin, output }
    } catch {
      // The listener is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  child.kill('SIGTERM')
  throw new Error(`Application did not become healthy:\n${output.join('')}`)
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await once(child, 'exit')
}

async function login(origin) {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ email: adminEmail, password }),
  })
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie')
  assert(cookie)
  return cookie.split(';', 1)[0]
}

async function issueDeviceCode(origin) {
  const response = await fetch(`${origin}/api/codex/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: 'lancee-codex-plugin',
      scope: 'ai:invoke',
    }),
  })
  assert.equal(response.status, 201)
  const authorization = await response.json()
  assert.match(authorization.user_code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  assert.match(authorization.verification_uri_complete, /\?device=/)
  return authorization
}

async function approve(origin, cookie, userCode) {
  const detailsResponse = await fetch(
    `${origin}/api/codex/device/authorization?user_code=${encodeURIComponent(userCode)}`,
    { headers: { Cookie: cookie } },
  )
  assert.equal(detailsResponse.status, 200)
  const details = await detailsResponse.json()
  assert.equal(details.scope, 'ai:invoke')
  assert.equal(details.status, 'pending')

  const response = await fetch(`${origin}/api/codex/device/authorization`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      Origin: origin,
    },
    body: JSON.stringify({ userCode, decision: 'approve' }),
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).status, 'approved')
}

async function exchange(origin, deviceCode) {
  return fetch(`${origin}/api/codex/device/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: 'lancee-codex-plugin',
      device_code: deviceCode,
    }),
  })
}

function startConnector(origin) {
  const output = []
  const child = spawn(
    process.execPath,
    ['plugins/lancee-ai/scripts/mcp-server.mjs'],
    {
      cwd: projectDirectory,
      env: {
        ...process.env,
        LANCEE_BASE_URL: origin,
        PLUGIN_DATA: pluginDataPath,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))
  const pending = new Map()
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
  lines.on('line', (line) => {
    const message = JSON.parse(line)
    const callback = pending.get(message.id)
    if (callback) {
      pending.delete(message.id)
      callback.resolve(message)
    }
  })
  let requestId = 0
  const rpc = (method, params = {}) =>
    new Promise((resolve, reject) => {
      requestId += 1
      const id = requestId
      pending.set(id, { resolve, reject })
      child.stdin.write(`${JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      })}\n`)
      setTimeout(() => {
        if (!pending.has(id)) return
        pending.delete(id)
        reject(new Error(`Connector RPC timed out: ${method}\n${output.join('')}`))
      }, 5_000).unref()
    })
  return { child, rpc, output }
}

let aiProvider
let application
let connector
let rawAccessToken
try {
  aiProvider = await startAiProvider()
  application = await startApplication(aiProvider.url)
  const cookie = await login(application.origin)

  const initialIntegrationsResponse = await fetch(
    `${application.origin}/api/integrations`,
    { headers: { Cookie: cookie } },
  )
  assert.equal(initialIntegrationsResponse.status, 200)
  const initialIntegrations = (await initialIntegrationsResponse.json()).integrations
  assert.equal(
    initialIntegrations.find((integration) => integration.id === 'codex-ai')
      ?.connected,
    false,
  )

  const pending = await issueDeviceCode(application.origin)
  const pendingExchange = await exchange(application.origin, pending.device_code)
  assert.equal(pendingExchange.status, 400)
  assert.equal((await pendingExchange.json()).error, 'authorization_pending')

  await approve(application.origin, cookie, pending.user_code)
  const tokenResponse = await exchange(application.origin, pending.device_code)
  assert.equal(tokenResponse.status, 200)
  const token = await tokenResponse.json()
  rawAccessToken = token.access_token
  assert.match(rawAccessToken, /^lnc_codex_[A-Za-z0-9_-]+$/)
  assert.equal(token.scope, 'ai:invoke')

  const connectedResponse = await fetch(
    `${application.origin}/api/codex/connection`,
    { headers: { Cookie: cookie } },
  )
  assert.equal(connectedResponse.status, 200)
  assert.equal((await connectedResponse.json()).activeConnections, 1)

  const connectedIntegrationsResponse = await fetch(
    `${application.origin}/api/integrations`,
    { headers: { Cookie: cookie } },
  )
  const connectedIntegrations =
    (await connectedIntegrationsResponse.json()).integrations
  assert.equal(
    connectedIntegrations.find((integration) => integration.id === 'codex-ai')
      ?.connected,
    true,
  )

  const replayResponse = await exchange(application.origin, pending.device_code)
  assert.equal(replayResponse.status, 400)
  assert.equal((await replayResponse.json()).error, 'invalid_grant')

  const statusResponse = await fetch(`${application.origin}/api/codex/ai/status`, {
    headers: { Authorization: `Bearer ${rawAccessToken}` },
  })
  assert.equal(statusResponse.status, 200)
  assert.equal((await statusResponse.json()).model, 'connector-test-model')

  connector = startConnector(application.origin)
  const initialized = await connector.rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'verifier', version: '1.0.0' },
  })
  assert.equal(initialized.result.serverInfo.name, 'lancee-ai')
  const listed = await connector.rpc('tools/list')
  assert.deepEqual(
    listed.result.tools.map((tool) => tool.name),
    ['connect', 'ai_status', 'complete'],
  )

  const firstConnect = await connector.rpc('tools/call', {
    name: 'connect',
    arguments: {},
  })
  const connectorGrant = firstConnect.result.structuredContent
  assert.equal(connectorGrant.status, 'authorization_required')
  await approve(application.origin, cookie, connectorGrant.userCode)

  const secondConnect = await connector.rpc('tools/call', {
    name: 'connect',
    arguments: {},
  })
  assert.equal(secondConnect.result.structuredContent.connected, true)
  assert.equal(
    secondConnect.result.structuredContent.workspace,
    'Codex Connector Workspace',
  )

  const completion = await connector.rpc('tools/call', {
    name: 'complete',
    arguments: { prompt: 'Verify the connector.' },
  })
  assert.equal(
    completion.result.structuredContent.content,
    'Device-authenticated completion',
  )

  const twoDevicesResponse = await fetch(
    `${application.origin}/api/codex/connection`,
    { headers: { Cookie: cookie } },
  )
  assert.equal((await twoDevicesResponse.json()).activeConnections, 2)

  const state = JSON.parse(
    await readFile(join(pluginDataPath, 'device-auth.json'), 'utf8'),
  )
  assert.match(state.accessToken, /^lnc_codex_/)
  assert.equal(Object.hasOwn(state, 'pending'), false)

  const revokeResponse = await fetch(
    `${application.origin}/api/codex/connection/revoke`,
    {
      method: 'POST',
      headers: { Cookie: cookie, Origin: application.origin },
    },
  )
  assert.equal(revokeResponse.status, 200)
  assert.equal((await revokeResponse.json()).connected, false)
  const revokedStatusResponse = await fetch(
    `${application.origin}/api/codex/ai/status`,
    { headers: { Authorization: `Bearer ${rawAccessToken}` } },
  )
  assert.equal(revokedStatusResponse.status, 401)

  await stopChild(connector.child)
  connector = null
  await stopChild(application.child)
  application = null

  const database = new DatabaseSync(databasePath, { readOnly: true })
  const tokenRows = database
    .prepare('SELECT token_hash FROM codex_access_tokens')
    .all()
  assert.equal(tokenRows.length, 2)
  assert(
    tokenRows.every((row) => /^[a-f0-9]{64}$/.test(row.token_hash)),
  )
  assert(
    tokenRows.some(
      (row) =>
        row.token_hash ===
        createHash('sha256').update(rawAccessToken).digest('hex'),
    ),
  )
  assert.equal(
    database
      .prepare(
        'SELECT COUNT(*) AS count FROM codex_access_tokens WHERE token_hash = ?',
      )
      .get(rawAccessToken).count,
    0,
  )
  database.close()

  console.log(
    'Codex connector verified: Connections catalog state, device approval, one-time exchange, scoped AI APIs, MCP tools, revocation, and hashed token storage.',
  )
} finally {
  await stopChild(connector?.child)
  await stopChild(application?.child)
  if (aiProvider?.server.listening) {
    aiProvider.server.close()
    await once(aiProvider.server, 'close')
  }
  await rm(temporaryDirectory, { recursive: true, force: true })
}
