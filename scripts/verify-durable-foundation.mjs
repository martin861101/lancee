import assert from 'node:assert/strict'
import { createHash, scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
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

async function startApplication() {
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
try {
  application = await startApplication()
  let cookie = await login(application.origin)

  const serviceList = await sessionRequest(
    application.origin,
    cookie,
    '/api/mcp/services',
  )
  assert.equal(serviceList.status, 200)
  const services = (await serviceList.json()).services
  assert.deepEqual(
    services.map((service) => service.id),
    ['lancee'],
  )
  const lanceeService = services.find((service) => service.id === 'lancee')
  assert.equal(lanceeService.active, true)
  assert(lanceeService.tools.some((tool) => tool.id === 'create_workflow'))
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
        serviceId: 'lancee',
        toolId: 'query_dashboard',
        arguments: { resource: 'projects' },
      }),
    },
  )
  assert.equal(invocation.status, 200)
  const invocationData = (await invocation.json()).data
  assert.equal(invocationData.resource, 'projects')
  assert(Array.isArray(invocationData.rows))

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
        role: 'member',
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
  assert.equal((await acceptInvitation.json()).user.role, 'member')

  const ownerTeam = await sessionRequest(application.origin, cookie, '/api/workspace/team')
  assert.equal(ownerTeam.status, 200)
  const ownerMember = (await ownerTeam.json()).members.find((member) => member.role === 'owner')
  assert(ownerMember)
  const memberTeam = await sessionRequest(application.origin, invitedCookie, '/api/workspace/team')
  assert.equal(memberTeam.status, 200)
  const protectedOwner = await sessionRequest(
    application.origin,
    cookie,
    `/api/workspace/team/${ownerMember.id}`,
    { method: 'DELETE' },
  )
  assert.equal(protectedOwner.status, 403)

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
        role: 'member',
      }),
    },
  )
  assert.equal(forbiddenInvite.status, 403)

  const revocableInvite = await sessionRequest(
    application.origin,
    cookie,
    '/api/workspace/team/invite',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'revoked-member@example.com', role: 'member' }),
    },
  )
  assert.equal(revocableInvite.status, 201)
  const revocable = await revocableInvite.json()
  const revokedToken = new URL(revocable.acceptUrl).searchParams.get('invite')
  const revokeInvite = await sessionRequest(
    application.origin,
    cookie,
    `/api/workspace/team/${revocable.id}`,
    { method: 'DELETE' },
  )
  assert.equal(revokeInvite.status, 204)
  const revokedDetails = await fetch(`${application.origin}/api/auth/invitations/${revokedToken}`)
  assert.equal(revokedDetails.status, 410)

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

  application = await startApplication()
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
  const lancee = servicePayload.services.find((service) => service.id === 'lancee')
  assert.ok(lancee)
  assert.strictEqual(lancee.active, true)
  assert.strictEqual(lancee.name, 'Lancee')
  assert.ok(Array.isArray(lancee.tools))

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
    'Durable foundation verified: workspace auth, expiring team invitations, local Lancee MCP execution, hashed API keys, idempotency, restart persistence, and revocation.',
  )
} finally {
  if (application) await stopApplication(application)
  await rm(temporaryDirectory, { recursive: true, force: true })
}
