import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

const projectDirectory = new URL('..', import.meta.url).pathname
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'lancee-workspace-flows-'))
const databasePath = join(temporaryDirectory, 'lancee.sqlite')
const password = 'workspace-flow-password'
const passwordSalt = 'workspace-flow-salt'
const passwordHash = scryptSync(password, passwordSalt, 64).toString('hex')
const adminEmail = 'workspace-flow@example.com'
const workspaceId = 'wsp_workspace_flow'

async function availablePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert(address && typeof address === 'object')
  server.close()
  await once(server, 'close')
  return address.port
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
      PUBLIC_ORIGIN: 'https://public.example.test',
      DATABASE_PATH: databasePath,
      SESSION_SECRET: 'workspace-flow-session-secret-with-sufficient-entropy',
      ADMIN_NAME: 'Workspace Flow Admin',
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD_SALT: passwordSalt,
      ADMIN_PASSWORD_HASH: passwordHash,
      WORKSPACE_ID: workspaceId,
      WORKSPACE_NAME: 'Original Workspace',
      GOOGLE_DRIVE_CLIENT_ID:
        '1234567890-workspaceflow.apps.googleusercontent.com',
      GOOGLE_DRIVE_CLIENT_SECRET: 'workspace-flow-google-secret',
      GOOGLE_DRIVE_REDIRECT_URI:
        'https://public.example.test/oauth/callback',
      PAYSTACK_SECRET_KEY: '',
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
  if (!application || application.child.exitCode !== null) return
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
  const cookie = await login(application.origin)

  const driveAuthorization = await sessionRequest(
    application.origin,
    cookie,
    '/api/google-drive/oauth/url',
  )
  assert.equal(driveAuthorization.status, 200)
  const driveAuthorizationPayload = await driveAuthorization.json()
  const driveAuthorizationUrl = new URL(driveAuthorizationPayload.url)
  assert.equal(
    driveAuthorizationUrl.searchParams.get('redirect_uri'),
    'https://public.example.test/oauth/callback',
  )
  assert.equal(
    driveAuthorizationUrl.searchParams.get('scope'),
    'https://www.googleapis.com/auth/drive.file',
  )
  assert.equal(
    driveAuthorizationUrl.searchParams.get('include_granted_scopes'),
    'false',
  )
  assert.equal(
    driveAuthorizationUrl.searchParams.get('trigger_onepick'),
    'true',
  )
  assert.equal(
    driveAuthorizationUrl.searchParams.get('allow_multiple'),
    'true',
  )
  assert.equal(
    driveAuthorizationUrl.searchParams.get('allow_folder_selection'),
    'true',
  )

  const driveCallback = await fetch(
    `${application.origin}/oauth/callback?error=access_denied`,
    { redirect: 'manual' },
  )
  assert.equal(driveCallback.status, 302)
  assert.match(
    driveCallback.headers.get('location'),
    /page=integrations&drive=error/,
  )

  const configuredDriveCallback = await fetch(
    `${application.origin}/api/integrations/google/callback?error=access_denied`,
    { redirect: 'manual' },
  )
  assert.equal(configuredDriveCallback.status, 302)
  assert.match(
    configuredDriveCallback.headers.get('location'),
    /page=integrations&drive=error/,
  )

  const settingsUpdate = await sessionRequest(
    application.origin,
    cookie,
    '/api/workspace/settings',
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'workspace-settings-update-0001',
      },
      body: JSON.stringify({ name: 'Updated Workspace' }),
    },
  )
  assert.equal(settingsUpdate.status, 200)
  const settings = await settingsUpdate.json()
  assert.equal(settings.name, 'Updated Workspace')
  assert.equal(settings.timezone, 'Africa/Johannesburg')

  const session = await sessionRequest(
    application.origin,
    cookie,
    '/api/auth/session',
  )
  assert.equal(session.status, 200)
  assert.equal((await session.json()).user.workspace, 'Updated Workspace')

  const projectResponse = await sessionRequest(
    application.origin,
    cookie,
    '/api/projects',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'workspace-project-create-0001',
      },
      body: JSON.stringify({
        name: 'Attachment project',
        client: 'Example Client',
      }),
    },
  )
  assert.equal(projectResponse.status, 201)
  const project = await projectResponse.json()

  const fileContent = Buffer.from('A real project attachment.\n', 'utf8')
  const upload = await sessionRequest(
    application.origin,
    cookie,
    `/api/projects/${project.id}/files`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Idempotency-Key': 'workspace-file-upload-0001',
        'X-File-Name': encodeURIComponent('project brief.txt'),
        'X-File-Type': 'text/plain',
      },
      body: fileContent,
    },
  )
  assert.equal(upload.status, 201)
  const uploadedFile = (await upload.json()).file
  assert.equal(uploadedFile.name, 'project brief.txt')
  assert.equal(uploadedFile.size, fileContent.length)

  const fileList = await sessionRequest(
    application.origin,
    cookie,
    `/api/projects/${project.id}/files`,
  )
  assert.equal(fileList.status, 200)
  assert.equal((await fileList.json()).files.length, 1)

  const download = await sessionRequest(
    application.origin,
    cookie,
    `/api/projects/files/${uploadedFile.id}/download`,
  )
  assert.equal(download.status, 200)
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), fileContent)
  assert.match(download.headers.get('content-disposition'), /project brief\.txt/)

  const projectMove = await sessionRequest(
    application.origin,
    cookie,
    `/api/projects/${project.id}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'workspace-project-move-0001',
      },
      body: JSON.stringify({ status: 'In review' }),
    },
  )
  assert.equal(projectMove.status, 200)
  assert.equal((await projectMove.json()).status, 'In review')

  const automationCreate = await sessionRequest(
    application.origin,
    cookie,
    '/api/automations',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'workspace-automation-create-0001',
      },
      body: JSON.stringify({
        name: 'Disposable verifier',
        description: 'Checks confirmed automation deletion.',
        model: 'Rules',
      }),
    },
  )
  assert.equal(automationCreate.status, 201)
  const automation = await automationCreate.json()
  const automationDelete = await sessionRequest(
    application.origin,
    cookie,
    `/api/automations/${automation.id}`,
    { method: 'DELETE' },
  )
  assert.equal(automationDelete.status, 204)
  const automationList = await sessionRequest(
    application.origin,
    cookie,
    '/api/automations',
  )
  assert.equal(automationList.status, 200)
  assert.equal(
    (await automationList.json()).automations.some(
      (item) => item.id === automation.id,
    ),
    false,
  )

  const clientList = await sessionRequest(
    application.origin,
    cookie,
    '/api/clients',
  )
  assert.equal(clientList.status, 200)
  const client = (await clientList.json()).clients.find(
    (item) => item.name === 'Example Client',
  )
  assert(client)
  const clientDelete = await sessionRequest(
    application.origin,
    cookie,
    `/api/clients/${client.id}`,
    { method: 'DELETE' },
  )
  assert.equal(clientDelete.status, 204)
  const projectList = await sessionRequest(
    application.origin,
    cookie,
    '/api/projects',
  )
  assert.equal(projectList.status, 200)
  assert.equal(
    (await projectList.json()).projects.find((item) => item.id === project.id)
      .clientId,
    null,
  )

  const paystackSecret = 'sk_test_workspaceflow123456789'
  const paystackConnect = await sessionRequest(
    application.origin,
    cookie,
    '/api/money/paystack/connection',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'workspace-paystack-connect-0001',
      },
      body: JSON.stringify({ secretKey: paystackSecret }),
    },
  )
  assert.equal(paystackConnect.status, 200)
  const paystackStatus = await paystackConnect.json()
  assert.equal(paystackStatus.configured, true)
  assert.equal(paystackStatus.credentialSource, 'workspace')
  assert.equal(
    paystackStatus.webhookUrl,
    `https://public.example.test/api/webhooks/paystack/${workspaceId}`,
  )

  const integrations = await sessionRequest(
    application.origin,
    cookie,
    '/api/integrations',
  )
  assert.equal(integrations.status, 200)
  assert.equal(
    (await integrations.json()).integrations.find(
      (integration) => integration.id === 'paystack',
    ).connected,
    true,
  )

  const inspectionDatabase = new DatabaseSync(databasePath, { readOnly: true })
  const storedPayment = inspectionDatabase
    .prepare(
      `SELECT credential_source, secret_ciphertext
       FROM payment_connections
       WHERE workspace_id = ? AND provider = 'paystack'`,
    )
    .get(workspaceId)
  inspectionDatabase.close()
  assert.equal(storedPayment.credential_source, 'workspace')
  assert(storedPayment.secret_ciphertext)
  assert(!storedPayment.secret_ciphertext.includes(paystackSecret))

  const paystackDisconnect = await sessionRequest(
    application.origin,
    cookie,
    '/api/money/paystack/disconnect',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': 'workspace-paystack-disconnect-0001' },
    },
  )
  assert.equal(paystackDisconnect.status, 200)
  assert.equal((await paystackDisconnect.json()).configured, false)

  const removeFile = await sessionRequest(
    application.origin,
    cookie,
    `/api/projects/files/${uploadedFile.id}`,
    { method: 'DELETE' },
  )
  assert.equal(removeFile.status, 204)

  console.log(
    'Workspace flows verified: safe Google OAuth callback/scope, same-origin mutations, canonical settings, project status moves, confirmed client/automation deletion, encrypted provider connection, and real project file upload/download.',
  )
} finally {
  await stopApplication(application)
  await rm(temporaryDirectory, { recursive: true, force: true })
}
