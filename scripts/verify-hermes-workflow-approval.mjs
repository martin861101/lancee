import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const projectDirectory = new URL('..', import.meta.url).pathname
const directory = mkdtempSync(join(tmpdir(), 'lancee-hermes-workflow-'))
let application
let aiServer
let hermesServer

async function availablePort() {
  const server = createNetServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  server.close()
  await once(server, 'close')
  return address.port
}

async function readJson(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

async function sessionRequest(origin, cookie, path, options = {}) {
  return await fetch(`${origin}${path}`, {
    ...options,
    headers: { Cookie: cookie, Origin: origin, ...(options.headers || {}) },
  })
}

async function startApplication({ port, aiPort, hermesPort, databasePath, email, passwordHash, masterKey }) {
  const origin = `http://127.0.0.1:${port}`
  const output = []
  const child = spawn(process.execPath, [join(projectDirectory, 'server', 'index.mjs')], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      APP_ENV: 'development',
      PORT: String(port),
      PUBLIC_ORIGIN: origin,
      DATABASE_PATH: databasePath,
      SESSION_SECRET: 'hermes-workflow-session-secret-with-sufficient-entropy',
      ADMIN_NAME: 'Hermes Workflow Owner',
      ADMIN_EMAIL: email,
      ADMIN_PASSWORD_SALT: 'hermes-workflow-salt',
      ADMIN_PASSWORD_HASH: passwordHash,
      WORKSPACE_ID: 'wsp_hermes_workflow',
      WORKSPACE_NAME: 'Hermes Workflow',
      ENCRYPTION_MASTER_KEY: masterKey,
      AGENT_PROVIDER: 'hermes',
      AGENT_FALLBACK_ENABLED: 'false',
      HERMES_ENDPOINT_URL: `http://127.0.0.1:${hermesPort}`,
      HERMES_PROFILE_ENDPOINT_TEMPLATE: `http://127.0.0.1:${hermesPort}/p/{profileId}`,
      HERMES_API_KEY: 'hermes-workflow-test-key',
      HERMES_AGENT_STREAM_EVENTS: 'false',
      HERMES_AGENT_POLL_MS: '50',
      AI_PROVIDER: 'openai',
      AI_API_KEY: 'workflow-test-key',
      AI_MODEL: 'workflow-test-model',
      AI_ENDPOINT_URL: `http://127.0.0.1:${aiPort}/v1/chat/completions`,
      SMTP_ENABLED: 'false',
      REDIS_QUEUE_PREFIX: `hermes-workflow-${process.pid}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => output.push(chunk.toString()))
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Application exited before startup:\n${output.join('')}`)
    try {
      if ((await fetch(`${origin}/api/health`)).ok) return { child, origin, output }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  child.kill('SIGTERM')
  throw new Error(`Application did not become healthy:\n${output.join('')}`)
}

const objective = "Create a workflow automation that triggers when a new email arrives from mschoeman3@gmail.com and it's a request to create a website or develop a platform. If those conditions are met create a project linked to Hookitup client with a note of the requirement and a task list."
const workflow = {
  version: 1,
  name: 'Hookitup website requests',
  trigger: { type: 'mail.received', matchMode: 'all', conditions: [{ field: 'sender.email', operator: 'equals', value: 'mschoeman3@gmail.com' }] },
  steps: [
    { id: 'understand_request', tool: 'ai.extract_project_request', input: { subject: '{{event.subject}}', body: '{{event.body}}' } },
    { id: 'resolve_client', tool: 'clients.resolve', input: { query: 'Hookitup' } },
    { id: 'create_project', tool: 'projects.create', input: { name: { $ref: 'steps.understand_request.output.projectName' }, clientId: { $ref: 'steps.resolve_client.output.resource.id' }, scope: { $ref: 'steps.understand_request.output.summary' }, sourceKey: 'mail:{{event.messageId}}' } },
    { id: 'add_note', tool: 'projects.add_note', input: { projectId: { $ref: 'steps.create_project.output.resource.id' }, body: { $ref: 'steps.understand_request.output.summary' }, sourceKey: 'mail:{{event.messageId}}:note' } },
    { id: 'create_tasks', tool: 'tasks.create_many', input: { projectId: { $ref: 'steps.create_project.output.resource.id' }, tasks: { $ref: 'steps.understand_request.output.tasks' }, sourceKey: 'mail:{{event.messageId}}:tasks' } },
  ],
}

try {
  const aiPort = await availablePort()
  const hermesPort = await availablePort()
  const appPort = await availablePort()
  const email = 'hermes-workflow@example.test'
  const password = 'hermes-workflow-password'
  const passwordHash = scryptSync(password, 'hermes-workflow-salt', 64).toString('hex')
  const masterKey = '8a9c0e5d1f274b9fa3c8b7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6'
  let mcpToken = ''
  let applicationOrigin = ''
  const hermesRuns = new Map()
  let hermesSequence = 0

  aiServer = createServer(async (request, response) => {
    const payload = await readJson(request)
    const systemPrompt = payload.messages?.find((entry) => entry.role === 'system')?.content || ''
    const content = systemPrompt.includes('Create a workflow proposal')
      ? JSON.stringify({ status: 'ready', workflow, assumptions: [], warnings: [], questions: [] })
      : JSON.stringify({})
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
  })
  aiServer.listen(aiPort, '127.0.0.1')
  await once(aiServer, 'listening')

  hermesServer = createServer(async (request, response) => {
    const path = new URL(request.url, `http://${request.headers.host}`).pathname
    if (request.method === 'GET' && path.includes('/api/sessions/')) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end('{}')
      return
    }
    if (request.method === 'POST' && path.endsWith('/v1/runs')) {
      const body = await readJson(request)
      const list = await fetch(`${applicationOrigin}/mcp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${mcpToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'tools-list', method: 'tools/list' }),
      })
      const tools = await list.json()
      assert.equal(tools.result.tools.some((tool) => tool.name === 'propose_workflow'), true)
      const proposed = await fetch(`${applicationOrigin}/mcp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${mcpToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'workflow-propose', method: 'tools/call', params: { name: 'propose_workflow', arguments: { objective: body.input } } }),
      })
      const proposal = await proposed.json()
      assert.equal(proposal.result.structuredContent.success, true)
      const id = `hermes-workflow-${++hermesSequence}`
      hermesRuns.set(id, { proposal })
      response.writeHead(202, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ run_id: id, status: 'started' }))
      return
    }
    const runMatch = path.match(/\/v1\/runs\/(hermes-workflow-\d+)$/)
    if (request.method === 'GET' && runMatch) {
      const record = hermesRuns.get(runMatch[1])
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        status: 'completed',
        output: 'I prepared the requested workflow for approval.',
        results: [{ data: record.proposal.result.structuredContent.data }],
      }))
      return
    }
    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end('{}')
  })
  hermesServer.listen(hermesPort, '127.0.0.1')
  await once(hermesServer, 'listening')

  application = await startApplication({
    port: appPort,
    aiPort,
    hermesPort,
    databasePath: join(directory, 'workflow.sqlite'),
    email,
    passwordHash,
    masterKey,
  })
  applicationOrigin = application.origin
  const login = await fetch(`${application.origin}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: application.origin }, body: JSON.stringify({ email, password }),
  })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie').split(';', 1)[0]
  const device = await fetch(`${application.origin}/api/codex/device/code`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: 'lancee-codex-plugin', scope: 'mcp:invoke' }),
  })
  const devicePayload = await device.json()
  assert.equal(device.status, 201)
  const deviceApproval = await sessionRequest(application.origin, cookie, '/api/codex/device/authorization', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'hermes-workflow-device-approval' }, body: JSON.stringify({ userCode: devicePayload.user_code, decision: 'approve' }),
  })
  assert.equal(deviceApproval.status, 200)
  const token = await fetch(`${application.origin}/api/codex/device/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: 'lancee-codex-plugin', device_code: devicePayload.device_code }),
  })
  const tokenPayload = await token.json()
  assert.equal(token.status, 200)
  mcpToken = tokenPayload.access_token

  const before = await sessionRequest(application.origin, cookie, '/api/automations')
  assert.equal((await before.json()).automations.length, 0)
  const proposed = await sessionRequest(application.origin, cookie, '/api/agent/runs', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'hermes-workflow-proposal-0001' }, body: JSON.stringify({ objective }),
  })
  const proposedPayload = await proposed.json()
  assert.equal(proposed.status, 201, JSON.stringify(proposedPayload))
  assert.equal(proposedPayload.run.status, 'waiting_approval')
  assert.equal(proposedPayload.proposedAction.agentRunId, proposedPayload.run.id)
  assert.equal(proposedPayload.proposedAction.preview.conditions[0].value, 'mschoeman3@gmail.com')
  assert.equal((await (await sessionRequest(application.origin, cookie, '/api/automations')).json()).automations.length, 0)
  const approved = await sessionRequest(application.origin, cookie, `/api/agent/runs/${proposedPayload.run.id}/approvals/${proposedPayload.proposedAction.approvalId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'hermes-workflow-approval-0001' }, body: JSON.stringify({ decision: 'approved' }),
  })
  const approvedPayload = await approved.json()
  assert.equal(approved.status, 200, JSON.stringify(approvedPayload))
  assert.equal(approvedPayload.run.status, 'completed')
  assert.equal((await (await sessionRequest(application.origin, cookie, '/api/automations')).json()).automations.length, 1)
  assert.equal((await (await sessionRequest(application.origin, cookie, '/api/mail/rules')).json()).rules.length, 1)

  const denied = await sessionRequest(application.origin, cookie, '/api/agent/runs', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'hermes-workflow-proposal-0002' }, body: JSON.stringify({ objective }),
  })
  const deniedPayload = await denied.json()
  assert.equal(deniedPayload.run.status, 'waiting_approval')
  const denyResponse = await sessionRequest(application.origin, cookie, `/api/agent/runs/${deniedPayload.run.id}/approvals/${deniedPayload.proposedAction.approvalId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'hermes-workflow-denial-0001' }, body: JSON.stringify({ decision: 'denied' }),
  })
  const deniedResult = await denyResponse.json()
  assert.equal(denyResponse.status, 200, JSON.stringify(deniedResult))
  assert.equal(deniedResult.run.status, 'failed')
  assert.equal(deniedResult.run.errorCode, 'APPROVAL_DENIED')
  assert.equal((await (await sessionRequest(application.origin, cookie, '/api/automations')).json()).automations.length, 1)
  console.log('Hermes workflow approval verified through authenticated HTTP, MCP protocol, server-issued approval, and persistence.')
} finally {
  if (application?.child.exitCode === null) {
    application.child.kill('SIGTERM')
    await once(application.child, 'exit')
  }
  if (hermesServer?.listening) {
    hermesServer.close()
    await once(hermesServer, 'close')
  }
  if (aiServer?.listening) {
    aiServer.close()
    await once(aiServer, 'close')
  }
  rmSync(directory, { recursive: true, force: true })
}
