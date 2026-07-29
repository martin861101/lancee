import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import {
  hashBody,
  signN8nRequest,
  validateN8nTimestamp,
  validateN8nWebhookUrl,
  verifyN8nRequest,
} from '../server/n8n.mjs'

const projectDirectory = new URL('..', import.meta.url).pathname
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'lancee-n8n-'))
const databasePath = join(temporaryDirectory, 'lancee.sqlite')
const password = 'n8n-test-password'
const passwordSalt = 'n8n-test-salt'
const passwordHash = scryptSync(password, passwordSalt, 64).toString('hex')
const adminEmail = 'n8n-test@example.com'
const signingSecret = 'n8n-test-shared-secret-with-at-least-32-characters'
let requestCount = 0
let failNext = false
const received = []

await assert.rejects(
  validateN8nWebhookUrl({
    value: 'http://n8n.example/webhook/lancee',
    allowedBaseUrl: 'https://n8n.example',
  }),
  /HTTPS/,
)

async function availablePort() {
  const server = createNetServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert(address && typeof address === 'object')
  const port = address.port
  server.close()
  await once(server, 'close')
  return port
}

async function readRequestBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function startN8nStub() {
  const port = await availablePort()
  const server = createServer(async (request, response) => {
    if (!request.url.startsWith('/webhook/lancee')) {
      response.writeHead(404)
      response.end()
      return
    }
    const body = await readRequestBody(request)
    const timestamp = String(request.headers['x-lancee-timestamp'] || '')
    const nonce = String(request.headers['x-lancee-nonce'] || '')
    const signature = String(request.headers['x-lancee-signature'] || '')
    assert(validateN8nTimestamp(timestamp))
    assert.match(nonce, /^[A-Za-z0-9_-]{16,64}$/)
    assert(
      verifyN8nRequest({
        secret: signingSecret,
        signature,
        timestamp,
        nonce,
        method: request.method,
        path: request.url,
        bodyHash: hashBody(body),
      }),
    )
    assert(request.headers['x-lancee-correlation-id'])
    assert(request.headers['x-lancee-delivery-id'])
    requestCount += 1
    received.push({
      method: request.method,
      url: request.url,
      body: body.length ? JSON.parse(body.toString('utf8')) : null,
    })
    if (failNext) {
      failNext = false
      response.writeHead(503)
      response.end()
      return
    }
    response.writeHead(204)
    response.end()
  })
  server.listen(port, '127.0.0.1')
  await once(server, 'listening')
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
  }
}

async function stopServer(server) {
  server.close()
  await once(server, 'close')
}

async function startApplication(n8nBaseUrl) {
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
      SESSION_SECRET: 'n8n-test-session-secret-with-sufficient-entropy',
      ADMIN_NAME: 'n8n Test Admin',
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD_SALT: passwordSalt,
      ADMIN_PASSWORD_HASH: passwordHash,
      WORKSPACE_ID: 'wsp_n8n_test',
      WORKSPACE_NAME: 'n8n Test Workspace',
      N8N_BASE_URL: n8nBaseUrl,
      N8N_ALLOW_PRIVATE: 'true',
      N8N_TIMEOUT_MS: '500',
      SMTP_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => output.push(chunk.toString()))
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))

  for (let attempt = 0; attempt < 60; attempt += 1) {
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

async function stopApplication(application) {
  if (application.child.exitCode !== null) return
  application.child.kill('SIGTERM')
  await once(application.child, 'exit')
}

async function login(origin) {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify({ email: adminEmail, password }),
  })
  assert.equal(response.status, 200)
  return response.headers.get('set-cookie').split(';', 1)[0]
}

async function sessionRequest(origin, cookie, path, options = {}) {
  return fetch(`${origin}${path}`, {
    ...options,
    headers: {
      Cookie: cookie,
      Origin: origin,
      ...(options.headers || {}),
    },
  })
}

async function inboundRequest(origin, callbackUrl, method, event, nonce, timestamp) {
  const callback = new URL(callbackUrl)
  if (method === 'GET') {
    callback.searchParams.set('event', event.type)
    callback.searchParams.set('correlation_id', 'cor_external_get_test')
  }
  const body = method === 'POST'
    ? Buffer.from(JSON.stringify(event))
    : Buffer.alloc(0)
  const path = `${callback.pathname}${callback.search}`
  const signature = signN8nRequest({
    secret: signingSecret,
    timestamp,
    nonce,
    method,
    path,
    bodyHash: hashBody(body),
  })
  return fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      'X-Lancee-Timestamp': timestamp,
      'X-Lancee-Nonce': nonce,
      'X-Lancee-Signature': signature,
      'X-Lancee-Correlation-Id': `cor_external_${method.toLowerCase()}_test`,
    },
    body: method === 'POST' ? body : undefined,
  })
}

let application
let n8nStub
try {
  n8nStub = await startN8nStub()
  application = await startApplication(n8nStub.baseUrl)
  let cookie = await login(application.origin)

  const initialConfig = await sessionRequest(
    application.origin,
    cookie,
    '/api/n8n/config',
  )
  assert.equal((await initialConfig.json()).connected, false)

  const disallowed = await sessionRequest(
    application.origin,
    cookie,
    '/api/n8n/config',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'n8n-config-disallowed-0001',
      },
      body: JSON.stringify({
        outboundUrl: 'https://example.com/webhook',
        methods: ['GET', 'POST'],
        signingSecret,
      }),
    },
  )
  assert.equal(disallowed.status, 400)

  const configure = await sessionRequest(
    application.origin,
    cookie,
    '/api/n8n/config',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'n8n-config-save-0001',
      },
      body: JSON.stringify({
        outboundUrl: `${n8nStub.baseUrl}/webhook/lancee`,
        methods: ['GET', 'POST'],
        signingSecret,
      }),
    },
  )
  assert.equal(configure.status, 200)
  const configured = await configure.json()
  assert.equal(configured.connected, true)
  assert.equal(configured.signingSecretConfigured, true)
  assert.equal('signingSecret' in configured, false)

  const postDeliveryOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'n8n-outbound-post-0001',
    },
    body: JSON.stringify({
      method: 'POST',
      event: { type: 'lancee.connection_test', value: 'post' },
    }),
  }
  const postDelivery = await sessionRequest(
    application.origin,
    cookie,
    '/api/n8n/deliveries',
    postDeliveryOptions,
  )
  assert.equal(postDelivery.status, 200)
  const postPayload = await postDelivery.json()
  assert.equal(postPayload.delivery.status, 'succeeded')
  assert.equal(postPayload.delivery.responseStatus, 204)
  assert.equal(received[0].body.value, 'post')

  const replay = await sessionRequest(
    application.origin,
    cookie,
    '/api/n8n/deliveries',
    postDeliveryOptions,
  )
  assert.equal(replay.status, 200)
  assert.equal(replay.headers.get('idempotency-replayed'), 'true')
  assert.equal(requestCount, 1)

  const getDelivery = await sessionRequest(
    application.origin,
    cookie,
    '/api/n8n/deliveries',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'n8n-outbound-get-0001',
      },
      body: JSON.stringify({
        method: 'GET',
        event: { type: 'lancee.connection_test' },
      }),
    },
  )
  assert.equal(getDelivery.status, 200)
  assert.equal(received[1].method, 'GET')
  assert.match(received[1].url, /lancee_event=lancee(?:\.|%2E)connection_test/)

  const createAutomation = await sessionRequest(
    application.origin,
    cookie,
    '/api/automations',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'automation-create-0001',
      },
      body: JSON.stringify({
        name: 'Verifier workflow',
        description: 'Confirms a saved automation executes through n8n.',
      }),
    },
  )
  assert.equal(createAutomation.status, 201)
  const automation = await createAutomation.json()
  const activateAutomation = await sessionRequest(
    application.origin,
    cookie,
    `/api/automations/${automation.id}/toggle`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': 'automation-activate-0001' },
    },
  )
  assert.equal((await activateAutomation.json()).status, 'active')
  const dispatchAutomation = await sessionRequest(
    application.origin,
    cookie,
    '/api/automations/runs',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'automation-run-0001',
      },
      body: JSON.stringify({
        automationId: automation.id,
        instruction: 'Run the signed verifier workflow.',
      }),
    },
  )
  assert.equal(dispatchAutomation.status, 201)
  let automationRun = await dispatchAutomation.json()
  for (let attempt = 0; attempt < 40 && automationRun.status === 'running'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    const runResponse = await sessionRequest(
      application.origin,
      cookie,
      `/api/automations/runs/${automationRun.id}`,
    )
    automationRun = await runResponse.json()
  }
  assert.equal(automationRun.status, 'completed')
  assert.equal(received[2].body.type, 'lancee.automation.run')
  assert.equal(received[2].body.runId, automationRun.id)

  const inboundEvent = { type: 'n8n.external_test', value: 7 }
  const inboundNonce = 'nonce_external_post_0001'
  const inboundTimestamp = String(Date.now())
  const inbound = await inboundRequest(
    application.origin,
    configured.callbackUrl,
    'POST',
    inboundEvent,
    inboundNonce,
    inboundTimestamp,
  )
  assert.equal(inbound.status, 202)
  assert.equal((await inbound.json()).delivery.status, 'accepted')

  const inboundReplay = await inboundRequest(
    application.origin,
    configured.callbackUrl,
    'POST',
    inboundEvent,
    inboundNonce,
    inboundTimestamp,
  )
  assert.equal(inboundReplay.status, 409)

  const stale = await inboundRequest(
    application.origin,
    configured.callbackUrl,
    'POST',
    inboundEvent,
    'nonce_external_stale_0001',
    String(Date.now() - 10 * 60 * 1000),
  )
  assert.equal(stale.status, 401)

  const inboundGet = await inboundRequest(
    application.origin,
    configured.callbackUrl,
    'GET',
    { type: 'n8n.external_get_test' },
    'nonce_external_get_00001',
    String(Date.now()),
  )
  assert.equal(inboundGet.status, 202)

  failNext = true
  const failed = await sessionRequest(
    application.origin,
    cookie,
    '/api/n8n/deliveries',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'n8n-outbound-failure-0001',
      },
      body: JSON.stringify({
        method: 'POST',
        event: { type: 'lancee.retry_test' },
      }),
    },
  )
  assert.equal(failed.status, 502)
  const failedPayload = await failed.json()
  assert.equal(failedPayload.delivery.status, 'failed')
  assert.equal(failedPayload.delivery.responseStatus, 503)

  const retry = await sessionRequest(
    application.origin,
    cookie,
    `/api/n8n/deliveries/${failedPayload.delivery.id}/retry`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': 'n8n-outbound-retry-0001' },
    },
  )
  assert.equal(retry.status, 200)
  const retryPayload = await retry.json()
  assert.equal(retryPayload.delivery.status, 'succeeded')
  assert.equal(retryPayload.delivery.attemptNumber, 2)
  assert.equal(retryPayload.delivery.retryOf, failedPayload.delivery.id)

  const history = await sessionRequest(
    application.origin,
    cookie,
    '/api/n8n/deliveries',
  )
  const historyPayload = await history.json()
  assert(historyPayload.deliveries.some((delivery) => delivery.status === 'failed'))
  assert(historyPayload.deliveries.some((delivery) => delivery.status === 'accepted'))

  await stopApplication(application)
  application = null

  const databaseBytes = await readFile(databasePath)
  assert.equal(databaseBytes.includes(Buffer.from(signingSecret)), false)
  const persisted = new DatabaseSync(databasePath, { readOnly: true })
  const connection = persisted
    .prepare(
      `SELECT secret_ciphertext, secret_iv, secret_tag
       FROM n8n_connections WHERE workspace_id = ?`,
    )
    .get('wsp_n8n_test')
  assert(connection.secret_ciphertext)
  assert.notEqual(connection.secret_ciphertext, signingSecret)
  assert(
    persisted.prepare('SELECT COUNT(*) AS count FROM n8n_deliveries').get().count >= 6,
  )
  persisted.close()

  application = await startApplication(n8nStub.baseUrl)
  cookie = await login(application.origin)
  const restartConfig = await sessionRequest(
    application.origin,
    cookie,
    '/api/n8n/config',
  )
  assert.equal((await restartConfig.json()).connected, true)

  const disconnect = await sessionRequest(
    application.origin,
    cookie,
    '/api/n8n/disconnect',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': 'n8n-disconnect-0001' },
    },
  )
  assert.equal(disconnect.status, 200)
  assert.equal((await disconnect.json()).connected, false)

  const disconnectedCallback = await inboundRequest(
    application.origin,
    configured.callbackUrl,
    'POST',
    inboundEvent,
    'nonce_after_disconnect_0001',
    String(Date.now()),
  )
  assert.equal(disconnectedCallback.status, 404)

  console.log(
    'n8n bridge verified: encrypted configuration, URL policy, signed automation execution, outbound GET/POST, inbound replay protection, durable attempts, retry, disconnect, and restart persistence.',
  )
} finally {
  if (application) await stopApplication(application)
  if (n8nStub) await stopServer(n8nStub.server)
  await rm(temporaryDirectory, { recursive: true, force: true })
}
