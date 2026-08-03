import assert from 'node:assert/strict'
import { createHash, scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

const projectDirectory = new URL('..', import.meta.url).pathname
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'lancee-durable-'))
const databasePath = join(temporaryDirectory, 'lancee.sqlite')
const password = 'durable-test-password'
const passwordSalt = 'durable-test-salt'
const passwordHash = scryptSync(password, passwordSalt, 64).toString('hex')
const adminEmail = 'durable-test@example.com'

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

async function startMcpGateway() {
  const port = await availablePort()
  const server = createHttpServer(async (request, response) => {
    assert.equal(request.headers.authorization, 'Bearer test-mcp-token')
    response.setHeader('Content-Type', 'application/json')
    response.setHeader('X-Request-Id', 'req_mcp_verifier')
    if (request.method === 'GET' && request.url === '/api/v1/capabilities') {
      response.end(JSON.stringify({
        services: [{
          service_id: 'browser-worker',
          display_name: 'Browser & documents',
          status: 'available',
          revision: 'test',
        }, {
          service_id: 'crm-data-worker',
          display_name: 'CRM data',
          status: 'available',
          revision: 'test',
        }],
        tools: [{
          service_id: 'browser-worker',
          catalog_id: 'browser.open',
          name: 'browser.open',
          title: 'Open a page',
          description: 'Opens an allowed test page.',
          input_schema: {
            type: 'object',
            properties: { url: { type: 'string' } },
            required: ['url'],
          },
          tags: ['browser'],
        }, {
          service_id: 'crm-data-worker',
          catalog_id: 'crm.read',
          name: 'crm.read',
          title: 'Read CRM',
          description: 'Reads business-system records.',
          input_schema: { type: 'object', properties: {} },
          tags: ['data'],
        }],
        skills: [],
      }))
      return
    }
    if (request.method === 'POST' && request.url === '/api/v1/tools/browser.open/call') {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      response.end(JSON.stringify({
        service_id: 'browser-worker',
        tool: 'browser.open',
        is_error: false,
        data: { opened: input.url },
        result: 'opened',
      }))
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ error: 'Not found' }))
  })
  server.listen(port, '127.0.0.1')
  await once(server, 'listening')
  return { server, url: `http://127.0.0.1:${port}` }
}

async function startApplication(mcpGatewayUrl) {
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
      SESSION_SECRET: 'durable-test-session-secret-with-sufficient-entropy',
      ADMIN_NAME: 'Durable Test Admin',
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD_SALT: passwordSalt,
      ADMIN_PASSWORD_HASH: passwordHash,
      WORKSPACE_ID: 'wsp_durable_test',
      WORKSPACE_NAME: 'Durable Test Workspace',
      MCP_API_TOKEN: 'test-mcp-token',
      MCP_GATEWAY_URL: mcpGatewayUrl,
      MCP_ALLOW_INSECURE: 'true',
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
  const payload = await response.json()
  assert.equal(payload.user.workspaceId, 'wsp_durable_test')
  assert.equal(payload.user.role, 'owner')
  const setCookie = response.headers.get('set-cookie')
  assert(setCookie)
  return setCookie.split(';', 1)[0]
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

let application
let mcpGateway
try {
  mcpGateway = await startMcpGateway()
  application = await startApplication(mcpGateway.url)
  let cookie = await login(application.origin)

  const missingIdempotency = await sessionRequest(
    application.origin,
    cookie,
    '/api/mcp/access-request',
    { method: 'POST' },
  )
  assert.equal(missingIdempotency.status, 400)

  const accessRequest = await sessionRequest(
    application.origin,
    cookie,
    '/api/mcp/access-request',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': 'mcp-access-request-0001' },
    },
  )
  assert.equal(accessRequest.status, 200)
  assert.equal((await accessRequest.json()).status, 'approved')

  const serviceList = await sessionRequest(
    application.origin,
    cookie,
    '/api/mcp/services',
  )
  assert.equal(serviceList.status, 200)
  const services = (await serviceList.json()).services
  assert.deepEqual(
    services.map((service) => service.id),
    ['lancee', 'basebox', 'browser-worker'],
  )
  const lanceeService = services.find((service) => service.id === 'lancee')
  assert.equal(lanceeService.active, true)
  assert(lanceeService.tools.some((tool) => tool.id === 'create_workflow'))
  const baseboxService = services.find((service) => service.id === 'basebox')
  assert.equal(baseboxService.status, 'unreachable')
  assert.equal(baseboxService.active, false)
  assert.deepEqual(baseboxService.tools, [])

  const serviceMutation = await sessionRequest(
    application.origin,
    cookie,
    '/api/mcp/services/browser-worker',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'mcp-service-browser-0001',
      },
      body: JSON.stringify({ active: true }),
    },
  )
  assert.equal(serviceMutation.status, 200)
  assert.equal((await serviceMutation.json()).active, true)

  const invocation = await sessionRequest(
    application.origin,
    cookie,
    '/api/mcp/invoke',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'mcp-invoke-browser-0001',
      },
      body: JSON.stringify({
        serviceId: 'browser-worker',
        toolId: 'browser.open',
        arguments: { url: 'https://example.test' },
      }),
    },
  )
  assert.equal(invocation.status, 200)
  assert.deepEqual((await invocation.json()).data, { opened: 'https://example.test' })

  const teamInvite = await sessionRequest(
    application.origin,
    cookie,
    '/api/workspace/team/invite',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'team-invite-member-0001',
      },
      body: JSON.stringify({
        email: 'invited-member@example.com',
        name: 'Invited Member',
        role: 'collaborator',
      }),
    },
  )
  assert.equal(teamInvite.status, 201)
  const invitation = await teamInvite.json()
  assert.equal(invitation.delivery, 'share')
  const invitationToken = new URL(invitation.acceptUrl).searchParams.get('invite')
  assert(invitationToken)

  const invitationDetails = await fetch(
    `${application.origin}/api/auth/invitations/${invitationToken}`,
  )
  assert.equal(invitationDetails.status, 200)
  assert.equal((await invitationDetails.json()).workspace, 'Durable Test Workspace')

  const acceptInvitation = await fetch(`${application.origin}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: application.origin,
    },
    body: JSON.stringify({
      invitationToken,
      password: 'invited-member-password',
      name: 'Invited Member',
    }),
  })
  assert.equal(acceptInvitation.status, 201)
  const invitedCookie = acceptInvitation.headers.get('set-cookie').split(';', 1)[0]
  assert.equal((await acceptInvitation.json()).user.role, 'collaborator')

  const forbiddenInvite = await sessionRequest(
    application.origin,
    invitedCookie,
    '/api/workspace/team/invite',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'team-invite-forbidden-0001',
      },
      body: JSON.stringify({
        email: 'unauthorized-invite@example.com',
        role: 'collaborator',
      }),
    },
  )
  assert.equal(forbiddenInvite.status, 403)

  const createKeyOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'api-key-create-0001',
    },
    body: JSON.stringify({
      name: 'Durability verifier',
      permissions: ['workspace:read', 'mcp:read'],
    }),
  }
  const createKey = await sessionRequest(
    application.origin,
    cookie,
    '/api/api-keys',
    createKeyOptions,
  )
  assert.equal(createKey.status, 201)
  assert.equal(createKey.headers.get('idempotency-replayed'), 'false')
  const created = await createKey.json()
  assert.match(created.secret, /^lnc_live_[A-Za-z0-9_-]+$/)
  assert.deepEqual(created.key.permissions, ['workspace:read', 'mcp:read'])

  const replay = await sessionRequest(
    application.origin,
    cookie,
    '/api/api-keys',
    createKeyOptions,
  )
  assert.equal(replay.status, 201)
  assert.equal(replay.headers.get('idempotency-replayed'), 'true')
  assert.equal((await replay.json()).secret, created.secret)

  const mismatch = await sessionRequest(
    application.origin,
    cookie,
    '/api/api-keys',
    {
      ...createKeyOptions,
      body: JSON.stringify({
        name: 'Different request',
        permissions: ['workspace:read'],
      }),
    },
  )
  assert.equal(mismatch.status, 409)

  const workspaceResponse = await fetch(`${application.origin}/api/v1/workspace`, {
    headers: { Authorization: `Bearer ${created.secret}` },
  })
  assert.equal(workspaceResponse.status, 200)
  assert.equal((await workspaceResponse.json()).workspace.id, 'wsp_durable_test')

  const keyList = await sessionRequest(
    application.origin,
    cookie,
    '/api/api-keys',
  )
  const keyListPayload = await keyList.json()
  assert.equal(keyListPayload.keys.length, 1)
  assert(keyListPayload.keys[0].lastUsedAt)
  assert.equal('secret' in keyListPayload.keys[0], false)

  await stopApplication(application)
  application = null

  const databaseBytes = await readFile(databasePath)
  assert.equal(databaseBytes.includes(Buffer.from(created.secret)), false)
  assert.equal((await stat(databasePath)).mode & 0o777, 0o600)
  const persisted = new DatabaseSync(databasePath, { readOnly: true })
  const storedKey = persisted
    .prepare('SELECT secret_hash, permissions FROM api_keys WHERE id = ?')
    .get(created.key.id)
  assert.equal(
    storedKey.secret_hash,
    createHash('sha256').update(created.secret).digest('hex'),
  )
  assert.deepEqual(JSON.parse(storedKey.permissions), ['workspace:read', 'mcp:read'])
  persisted.close()

  application = await startApplication(mcpGateway.url)
  cookie = await login(application.origin)

  const persistedAccess = await sessionRequest(
    application.origin,
    cookie,
    '/api/mcp/access',
  )
  assert.equal((await persistedAccess.json()).status, 'approved')

  const persistedServices = await sessionRequest(
    application.origin,
    cookie,
    '/api/mcp/services',
  )
  const servicePayload = await persistedServices.json()
  assert.ok(Array.isArray(servicePayload.services))
  const bw = servicePayload.services.find((s) => s.id === 'browser-worker')
  assert.ok(bw)
  assert.strictEqual(bw.active, true)
  assert.strictEqual(bw.name, 'Browser & documents')
  assert.ok(Array.isArray(bw.tools))

  const persistedKeys = await sessionRequest(
    application.origin,
    cookie,
    '/api/api-keys',
  )
  assert.equal((await persistedKeys.json()).keys.length, 1)

  const revoke = await sessionRequest(
    application.origin,
    cookie,
    `/api/api-keys/${created.key.id}`,
    {
      method: 'DELETE',
      headers: { 'Idempotency-Key': 'api-key-revoke-0001' },
    },
  )
  assert.equal(revoke.status, 200)

  const rejectedKey = await fetch(`${application.origin}/api/v1/workspace`, {
    headers: { Authorization: `Bearer ${created.secret}` },
  })
  assert.equal(rejectedKey.status, 401)

  console.log(
    'Durable foundation verified: workspace auth, expiring team invitations, MCP execution, hashed API keys, idempotency, restart persistence, and revocation.',
  )
} finally {
  if (application) await stopApplication(application)
  if (mcpGateway) {
    mcpGateway.server.close()
    await once(mcpGateway.server, 'close')
  }
  await rm(temporaryDirectory, { recursive: true, force: true })
}
