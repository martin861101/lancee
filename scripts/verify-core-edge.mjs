import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import {
  decryptToken,
  encryptToken,
  generateMasterKey,
  VaultError,
} from '../server/vault.mjs'

const projectDirectory = new URL('..', import.meta.url).pathname
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'lancee-core-edge-'))
const databasePath = join(temporaryDirectory, 'lancee.sqlite')
const password = 'core-edge-test-password'
const passwordSalt = 'core-edge-test-salt'
const passwordHash = scryptSync(password, passwordSalt, 64).toString('hex')
const adminEmail = 'core-edge-test@example.com'
const masterKey = generateMasterKey()
process.env.ENCRYPTION_MASTER_KEY = masterKey

const roundTrip = encryptToken('sk_live_51NxXXXXXXXXXXXXXXXXXXXX')
assert.equal(
  decryptToken(roundTrip),
  'sk_live_51NxXXXXXXXXXXXXXXXXXXXX',
)
assert.equal(roundTrip.iv.length, 32)
assert.equal(roundTrip.auth_tag.length, 32)

const rotatedMasterKey = generateMasterKey()
process.env.ENCRYPTION_MASTER_KEY = rotatedMasterKey
process.env.ENCRYPTION_MASTER_KEY_PREVIOUS = masterKey
assert.equal(
  decryptToken(roundTrip),
  'sk_live_51NxXXXXXXXXXXXXXXXXXXXX',
)
delete process.env.ENCRYPTION_MASTER_KEY_PREVIOUS

const saved = process.env.ENCRYPTION_MASTER_KEY
delete process.env.ENCRYPTION_MASTER_KEY
assert.throws(() => encryptToken('secret'), (error) => error instanceof VaultError)
process.env.ENCRYPTION_MASTER_KEY = saved

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

async function startApplication() {
  const port = await availablePort()
  const origin = `http://127.0.0.1:${port}`
  const output = []
  const child = spawn(
    process.execPath,
    [join(projectDirectory, 'server', 'index.mjs')],
    {
      env: {
        ...process.env,
        APP_ENV: 'development',
        PORT: String(port),
        PUBLIC_ORIGIN: origin,
        DATABASE_PATH: databasePath,
        SESSION_SECRET: 'core-edge-test-session-secret-with-sufficient-entropy',
        ADMIN_NAME: 'Core Edge Test Admin',
        ADMIN_EMAIL: adminEmail,
        ADMIN_PASSWORD_SALT: passwordSalt,
        ADMIN_PASSWORD_HASH: passwordHash,
        WORKSPACE_ID: 'wsp_core_edge_test',
        WORKSPACE_NAME: 'Core Edge Test Workspace',
        SMTP_ENABLED: 'false',
        N8N_BASE_URL: 'https://n8n.invalid',
        N8N_TIMEOUT_MS: '500',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
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

async function waitForRun(origin, cookie, runId) {
  let run = await (await sessionRequest(
    origin,
    cookie,
    `/api/automations/runs/${runId}`,
  )).json()
  for (let attempt = 0; attempt < 40 && run.status === 'running'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    run = await (await sessionRequest(
      origin,
      cookie,
      `/api/automations/runs/${runId}`,
    )).json()
  }
  return run
}

let application
try {
  application = await startApplication()
  const cookie = await login(application.origin)

  const health = await fetch(`${application.origin}/api/health`)
  const healthPayload = await health.json()
  assert.equal(health.status, 200)
  assert.equal(healthPayload.core.redis, true)

  const schemas = await sessionRequest(
    application.origin,
    cookie,
    '/api/ai/actions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_schemas' }),
    },
  )
  assert.equal(schemas.status, 200)
  assert.deepEqual((await schemas.json()).schemas, ['main'])
  const executeAction = await sessionRequest(
    application.origin,
    cookie,
    '/api/ai/actions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'execute', sql: 'DROP TABLE projects' }),
    },
  )
  assert.equal(executeAction.status, 409)
  assert.equal((await executeAction.json()).code, 'AI_APPROVAL_REQUIRED')

  const saveToken = await sessionRequest(
    application.origin,
    cookie,
    '/api/integrations/tokens/stripe',
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'token-save-0001',
      },
      body: JSON.stringify({
        accessToken: 'sk_live_51NxXXXXXXXXXXXXXXXXXXXX',
        refreshToken: 'rt_1XyZ9876543210',
        tokenType: 'Bearer',
        expiresAt: '2030-01-01T00:00:00.000Z',
      }),
    },
  )
  assert.equal(saveToken.status, 200)
  const savedToken = await saveToken.json()
  assert.equal(savedToken.provider, 'stripe')

  const stored = new DatabaseSync(databasePath)
    .prepare(
      `SELECT encrypted_access_token, iv, auth_tag,
              encrypted_refresh_token, refresh_iv, refresh_auth_tag
       FROM tenant_integration_tokens
       WHERE workspace_id = 'wsp_core_edge_test' AND provider = 'stripe'`,
    )
    .get()
  assert(stored, 'the vault row must exist')
  assert.notEqual(stored.encrypted_access_token, 'sk_live_51NxXXXXXXXXXXXXXXXXXXXX')
  assert.equal(stored.iv.length, 32)
  assert.equal(stored.auth_tag.length, 32)
  assert.equal(
    decryptToken({
      encrypted_access_token: stored.encrypted_access_token,
      iv: stored.iv,
      auth_tag: stored.auth_tag,
    }),
    'sk_live_51NxXXXXXXXXXXXXXXXXXXXX',
  )
  assert.equal(
    decryptToken({
      encrypted_access_token: stored.encrypted_refresh_token,
      iv: stored.refresh_iv,
      auth_tag: stored.refresh_auth_tag,
    }),
    'rt_1XyZ9876543210',
  )

  const tokenList = await sessionRequest(
    application.origin,
    cookie,
    '/api/integrations/tokens',
  )
  assert.equal(tokenList.status, 200)
  const tokenListPayload = await tokenList.json()
  assert.equal(tokenListPayload.tokens.length, 1)
  assert.equal(tokenListPayload.tokens[0].provider, 'stripe')
  assert.equal(tokenListPayload.tokens[0].tokenType, 'Bearer')
  assert.equal(tokenListPayload.tokens[0].expiresAt, '2030-01-01T00:00:00.000Z')
  assert.equal('encryptedAccessToken' in tokenListPayload.tokens[0], false)

  const getToken = await sessionRequest(
    application.origin,
    cookie,
    '/api/integrations/tokens/stripe',
  )
  assert.equal(getToken.status, 200)
  assert.equal((await getToken.json()).token.provider, 'stripe')

  const clientCreate = await sessionRequest(
    application.origin,
    cookie,
    '/api/clients',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'phase3-client-create-0001',
      },
      body: JSON.stringify({
        name: 'Phase 3 Client',
        email: 'client@example.com',
      }),
    },
  )
  assert.equal(clientCreate.status, 201)
  const client = await clientCreate.json()
  const projectCreate = await sessionRequest(
    application.origin,
    cookie,
    '/api/projects',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'phase3-project-create-0001',
      },
      body: JSON.stringify({
        name: 'Phase 3 Packaging Project',
        clientId: client.id,
        scope: 'Packaging deliverables',
      }),
    },
  )
  const projectCreateBody = await projectCreate.text()
  assert.equal(
    projectCreate.status,
    201,
    `${projectCreateBody}\nApplication output:\n${application.output.join('')}`,
  )
  const project = JSON.parse(projectCreateBody)
  assert.equal(project.draftInvoice.status, 'draft')

  const invalidProvider = await sessionRequest(
    application.origin,
    cookie,
    `/api/integrations/tokens/${encodeURIComponent('bad provider')}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: 'secret' }),
    },
  )
  assert.equal(invalidProvider.status, 400)

  const createCoreAutomation = await sessionRequest(
    application.origin,
    cookie,
    '/api/automations',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'core-automation-create-0001',
      },
      body: JSON.stringify({
        name: 'Core reminder',
        description: 'Runs entirely inside lancee without n8n.',
        execution: 'core',
        tools: ['projects.update_status'],
      }),
    },
  )
  assert.equal(createCoreAutomation.status, 201)
  const coreAutomation = await createCoreAutomation.json()
  assert.equal(coreAutomation.execution, 'core')

  const activateCore = await sessionRequest(
    application.origin,
    cookie,
    `/api/automations/${coreAutomation.id}/toggle`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': 'core-automation-activate-0001' },
    },
  )
  assert.equal((await activateCore.json()).status, 'active')

  const runCore = await sessionRequest(
    application.origin,
    cookie,
    '/api/automations/runs',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'core-automation-run-0001',
      },
      body: JSON.stringify({
        automationId: coreAutomation.id,
        instruction: JSON.stringify({
          steps: [{
            tool: 'projects.update_status',
            input: { projectId: project.id, status: 'Ready' },
          }],
        }),
      }),
    },
  )
  assert.equal(runCore.status, 201)
  const coreRun = await waitForRun(
    application.origin,
    cookie,
    (await runCore.json()).id,
  )
  assert.equal(coreRun.status, 'completed')
  assert.equal(coreRun.errorCode, null)
  assert.equal(coreRun.steps, 1)
  assert(coreRun.events.some((event) => event.eventType === 'step.completed'))
  const projectAfterCore = await sessionRequest(
    application.origin,
    cookie,
    '/api/projects',
  )
  assert.equal(
    (await projectAfterCore.json()).projects.find((item) => item.id === project.id).status,
    'Ready',
  )

  const createProjectAutomation = await sessionRequest(
    application.origin,
    cookie,
    '/api/automations',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'project-automation-create-0001',
      },
      body: JSON.stringify({
        name: 'Create projects from email',
        description: 'Creates an idempotent project and links it to the sender client.',
        execution: 'core',
        tools: ['projects.create'],
      }),
    },
  )
  assert.equal(createProjectAutomation.status, 201)
  const projectAutomation = await createProjectAutomation.json()
  const activateProjectAutomation = await sessionRequest(
    application.origin,
    cookie,
    `/api/automations/${projectAutomation.id}/toggle`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': 'project-automation-active-0001' },
    },
  )
  assert.equal((await activateProjectAutomation.json()).status, 'active')

  const mailRule = await sessionRequest(
    application.origin,
    cookie,
    '/api/mail/rules',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        automationId: projectAutomation.id,
        name: 'Create project for new packaging mail',
        sender: client.email,
        subject: 'new project',
        keywords: ['packaging'],
        matchMode: 'all',
        instruction: JSON.stringify({
          steps: [{
            tool: 'projects.create',
            input: {
              name: '{{subject}}',
              clientName: '{{senderName}}',
              clientEmail: '{{senderEmail}}',
              scope: '{{body}}',
              sourceKey: 'mail:{{ruleId}}:{{messageId}}',
            },
          }],
        }),
      }),
    },
  )
  assert.equal(mailRule.status, 201)

  const projectFromMailInstruction = JSON.stringify({
    steps: [{
      tool: 'projects.create',
      input: {
        name: 'Email project: packaging refresh',
        clientName: 'Incoming display name',
        clientEmail: client.email,
        scope: 'Packaging details from the incoming message.',
        status: 'In progress',
        sourceKey: 'mail:rule-test:message-test-001',
      },
    }],
  })
  const runProjectFromMail = await sessionRequest(
    application.origin,
    cookie,
    '/api/automations/runs',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'project-from-mail-run-0001',
      },
      body: JSON.stringify({
        automationId: projectAutomation.id,
        instruction: projectFromMailInstruction,
      }),
    },
  )
  assert.equal(runProjectFromMail.status, 201)
  const projectFromMailRun = await waitForRun(
    application.origin,
    cookie,
    (await runProjectFromMail.json()).id,
  )
  assert.equal(projectFromMailRun.status, 'completed')
  assert(projectFromMailRun.events.some((event) => event.toolId === 'projects.create'))

  const projectsAfterMail = await sessionRequest(application.origin, cookie, '/api/projects')
  const projectsAfterMailPayload = await projectsAfterMail.json()
  const createdFromMail = projectsAfterMailPayload.projects.find(
    (item) => item.name === 'Email project: packaging refresh',
  )
  assert(createdFromMail, 'the Core project action must create a project')
  assert.equal(createdFromMail.clientId, client.id)

  const duplicateMailRun = await sessionRequest(
    application.origin,
    cookie,
    '/api/automations/runs',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'project-from-mail-run-0002',
      },
      body: JSON.stringify({
        automationId: projectAutomation.id,
        instruction: projectFromMailInstruction,
      }),
    },
  )
  assert.equal(duplicateMailRun.status, 201)
  const duplicateMailRunPayload = await waitForRun(
    application.origin,
    cookie,
    (await duplicateMailRun.json()).id,
  )
  assert.equal(duplicateMailRunPayload.status, 'completed')
  const projectsAfterDuplicateMail = await sessionRequest(application.origin, cookie, '/api/projects')
  const duplicateMatches = (await projectsAfterDuplicateMail.json()).projects.filter(
    (item) => item.name === 'Email project: packaging refresh',
  )
  assert.equal(duplicateMatches.length, 1)

  const sendApproval = await sessionRequest(
    application.origin,
    cookie,
    `/api/projects/${project.id}/approvals`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'phase3-approval-send-0001',
      },
      body: JSON.stringify({}),
    },
  )
  assert.equal(sendApproval.status, 201)
  const approvalPayload = await sendApproval.json()
  assert.equal(approvalPayload.delivery, 'not_configured')
  const approvalUrl = new URL(approvalPayload.approval.reviewUrl)
  const approvalToken = approvalUrl.searchParams.get('token')
  assert.match(approvalToken, /^[A-Za-z0-9_-]{20,}$/)
  const approvalPage = await fetch(
    `${application.origin}${approvalUrl.pathname}${approvalUrl.search}`,
  )
  assert.equal(approvalPage.status, 200)
  const approvalComment = await fetch(`${application.origin}/api/public/approvals/${approvalToken}/comment`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ comment: 'Please adjust the final label spacing.' }),
  })
  assert.equal(approvalComment.status, 303)
  const reviewState = await sessionRequest(
    application.origin,
    cookie,
    `/api/projects/${project.id}/approvals`,
  )
  const reviewPayload = await reviewState.json()
  assert.equal(reviewPayload.comments.length, 1)

  const approvalApprove = await fetch(`${application.origin}/api/public/approvals/${approvalToken}/approve`, {
    method: 'POST',
    redirect: 'manual',
  })
  assert.equal(approvalApprove.status, 303)
  const approvedState = await sessionRequest(
    application.origin,
    cookie,
    `/api/projects/${project.id}/approvals`,
  )
  const approvedPayload = await approvedState.json()
  assert.equal(approvedPayload.approvals[0].status, 'approved')
  assert.equal(approvedPayload.draftInvoice.status, 'ready_for_review')

  const updateDraft = await sessionRequest(
    application.origin,
    cookie,
    `/api/draft-invoices/${approvedPayload.draftInvoice.id}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'phase3-draft-update-0001',
      },
      body: JSON.stringify({ amountMinor: 12500 }),
    },
  )
  assert.equal(updateDraft.status, 200)
  const sendDraft = await sessionRequest(
    application.origin,
    cookie,
    `/api/draft-invoices/${approvedPayload.draftInvoice.id}/send`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': 'phase3-draft-send-0001' },
      body: '{}',
    },
  )
  assert.equal(sendDraft.status, 200)
  const sentPayload = await sendDraft.json()
  assert.equal(sentPayload.invoice.status, 'sent')
  assert.match(sentPayload.invoice.paymentUrl, /\/pay\//)
  assert.equal(sentPayload.project.status, 'Ready')
  assert.equal(sentPayload.project.progress, 100)
  const paymentPage = await fetch(new URL(sentPayload.invoice.paymentUrl).toString())
  assert.equal(paymentPage.status, 200)

  const createEdgeAutomation = await sessionRequest(
    application.origin,
    cookie,
    '/api/automations',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'edge-automation-create-0001',
      },
      body: JSON.stringify({
        name: 'Custom n8n workflow',
        description: 'Only runs when a custom n8n workflow is connected.',
        execution: 'edge',
      }),
    },
  )
  assert.equal(createEdgeAutomation.status, 201)
  const edgeAutomation = await createEdgeAutomation.json()
  assert.equal(edgeAutomation.execution, 'edge')

  const activateEdge = await sessionRequest(
    application.origin,
    cookie,
    `/api/automations/${edgeAutomation.id}/toggle`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': 'edge-automation-activate-0001' },
    },
  )
  assert.equal((await activateEdge.json()).status, 'active')

  const runEdgeWithoutN8n = await sessionRequest(
    application.origin,
    cookie,
    '/api/automations/runs',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'edge-automation-run-0001',
      },
      body: JSON.stringify({
        automationId: edgeAutomation.id,
        instruction: 'Run the custom n8n flow.',
      }),
    },
  )
  assert.equal(runEdgeWithoutN8n.status, 409)

  const removeToken = await sessionRequest(
    application.origin,
    cookie,
    '/api/integrations/tokens/stripe',
    {
      method: 'DELETE',
      headers: { 'Idempotency-Key': 'token-remove-0001' },
    },
  )
  assert.equal(removeToken.status, 204)

  const afterRemoval = await sessionRequest(
    application.origin,
    cookie,
    '/api/integrations/tokens',
  )
  assert.equal((await afterRemoval.json()).tokens.length, 0)

  console.log(
    'Core/Edge verified: vault encryption roundtrip, master-key guard, encrypted token storage, token CRUD, in-process Core automation runs without n8n, and Edge gating on n8n connection.',
  )
} finally {
  if (application) await stopApplication(application)
  await rm(temporaryDirectory, { recursive: true, force: true })
}
