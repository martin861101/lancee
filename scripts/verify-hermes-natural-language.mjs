import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { once } from 'node:events'
import { scryptSync } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const directory = mkdtempSync(join(tmpdir(), 'lancee-hermes-natural-language-'))
let application
let aiServer
let hermesServer

const exactPrompt = 'Create a workflow with a email trigger that when a email arrives from mschoeman3@gmail.com and the body contains anything about software development or web design work it auto creates a project and links it to Hookitup as a client with the subject line as the heading and adds the email body as notes.'
const paraphrases = [
  'When Martin emails asking for software or website work, create a Hookitup project using the email subject as the project name and put the message in the project notes.',
  'Turn software development requests from mschoeman3@gmail.com into projects for Hookitup. Use the subject as the title and save the email as a note.',
  'If an email from mschoeman3@gmail.com looks like a web development request, start a project under Hookitup and attach the request as notes.',
]
const modelResponse = JSON.parse(readFileSync(new URL('./fixtures/hermes-natural-language-workflow.json', import.meta.url), 'utf8'))

function availablePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

async function readJson(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

async function sessionRequest(origin, cookie, path, init = {}) {
  return fetch(`${origin}${path}`, {
    ...init,
    headers: { Origin: origin, Cookie: cookie, ...(init.headers || {}) },
  })
}

try {
  const aiPort = await availablePort()
  const hermesPort = await availablePort()
  const appPort = await availablePort()
  const email = 'hermes-natural-language@example.test'
  const password = 'hermes-natural-language-password'
  const passwordHash = scryptSync(password, 'hermes-natural-language-salt', 64).toString('hex')
  const masterKey = '8a9c0e5d1f274b9fa3c8b7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6'
  let applicationOrigin = ''
  let mcpToken = ''
  let sequence = 0
  const responses = new Map()

  // The completion mock represents the provider's structured planner output.
  // It is deliberately a fixture, not a direct workflow.propose call: the
  // positive cases travel through Hermes -> MCP tools/list/tools/call -> the
  // real workflow planner and validator. Its mixed toolId/capability fields
  // reproduce the provider/schema translation that exposed the regression.
  aiServer = createServer(async (request, response) => {
    const payload = await readJson(request)
    const userPrompt = payload.messages?.at(-1)?.content || ''
    const content = userPrompt.includes('unsupported calendar operation')
      ? JSON.stringify({ ...modelResponse, workflow: { ...modelResponse.workflow, steps: [{ ...modelResponse.workflow.steps[0], capability: 'calendar.create', toolId: undefined }] } })
      : JSON.stringify(modelResponse)
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
      const payload = await readJson(request)
      const list = await fetch(`${applicationOrigin}/mcp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${mcpToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: `list-${sequence}`, method: 'tools/list' }),
      })
      const listed = await list.json()
      assert(listed.result.tools.some((tool) => tool.name === 'propose_workflow'))
      const proposed = await fetch(`${applicationOrigin}/mcp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${mcpToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: `propose-${sequence}`, method: 'tools/call', params: { name: 'propose_workflow', arguments: { objective: payload.input } } }),
      })
      const proposal = await proposed.json()
      const id = `natural-language-${++sequence}`
      responses.set(id, proposal)
      response.writeHead(202, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ run_id: id, status: 'started' }))
      return
    }
    const runMatch = path.match(/\/v1\/runs\/(natural-language-\d+)$/)
    if (request.method === 'GET' && runMatch) {
      const proposal = responses.get(runMatch[1])
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ status: 'completed', output: 'Workflow proposal prepared.', results: [{ data: proposal?.result?.structuredContent?.data }] }))
      return
    }
    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end('{}')
  })
  hermesServer.listen(hermesPort, '127.0.0.1')
  await once(hermesServer, 'listening')

  const child = (await import('node:child_process')).spawn(process.execPath, ['server/index.mjs'], {
    env: {
      ...process.env,
      NODE_ENV: 'test', APP_ENV: 'development', PORT: String(appPort), PUBLIC_ORIGIN: `http://127.0.0.1:${appPort}`,
      DATABASE_PATH: join(directory, 'workflow.sqlite'), SESSION_SECRET: 'hermes-natural-language-session-secret-with-sufficient-entropy',
      ADMIN_NAME: 'Hermes Natural Language Owner', ADMIN_EMAIL: email, ADMIN_PASSWORD_SALT: 'hermes-natural-language-salt', ADMIN_PASSWORD_HASH: passwordHash,
      WORKSPACE_ID: 'wsp_hermes_natural_language', WORKSPACE_NAME: 'Hermes Natural Language', ENCRYPTION_MASTER_KEY: masterKey,
      AGENT_PROVIDER: 'hermes', AGENT_FALLBACK_ENABLED: 'false', HERMES_ENDPOINT_URL: `http://127.0.0.1:${hermesPort}`,
      HERMES_PROFILE_ENDPOINT_TEMPLATE: `http://127.0.0.1:${hermesPort}/p/{profileId}`, HERMES_API_KEY: 'hermes-natural-language-key', HERMES_AGENT_STREAM_EVENTS: 'false', HERMES_AGENT_POLL_MS: '50',
      AI_PROVIDER: 'openai', AI_API_KEY: 'natural-language-key', AI_MODEL: 'natural-language-model', AI_ENDPOINT_URL: `http://127.0.0.1:${aiPort}/v1/chat/completions`,
      SMTP_ENABLED: 'false', REDIS_QUEUE_PREFIX: `hermes-natural-language-${process.pid}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output = []
  child.stdout.on('data', (chunk) => output.push(chunk.toString()))
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))
  application = { child, origin: `http://127.0.0.1:${appPort}`, output }
  applicationOrigin = application.origin
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Application exited before startup:\n${output.join('')}`)
    try {
      if ((await fetch(`${application.origin}/api/health`)).ok) break
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  const login = await fetch(`${application.origin}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: application.origin }, body: JSON.stringify({ email, password }),
  })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie').split(';', 1)[0]
  const device = await fetch(`${application.origin}/api/codex/device/code`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: 'lancee-codex-plugin', scope: 'mcp:invoke' }),
  })
  const devicePayload = await device.json()
  const authorize = await sessionRequest(application.origin, cookie, '/api/codex/device/authorization', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'natural-language-device' }, body: JSON.stringify({ userCode: devicePayload.user_code, decision: 'approve' }),
  })
  assert.equal(authorize.status, 200)
  const token = await fetch(`${application.origin}/api/codex/device/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: 'lancee-codex-plugin', device_code: devicePayload.device_code }),
  })
  mcpToken = (await token.json()).access_token

  for (const [index, objective] of [exactPrompt, ...paraphrases].entries()) {
    const result = await sessionRequest(application.origin, cookie, '/api/agent/runs', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `natural-language-run-${index}` }, body: JSON.stringify({ objective }),
    })
    const payload = await result.json()
    assert.equal(result.status, 201, JSON.stringify(payload))
    assert.equal(payload.run.status, 'waiting_approval', JSON.stringify(payload))
    assert.deepEqual(payload.proposedAction.preview.actions, ['ai.extract_project_request', 'clients.resolve', 'projects.create', 'projects.add_note'])
    assert.equal(payload.proposedAction.preview.conditions[0].value, 'mschoeman3@gmail.com')
    assert.deepEqual(payload.proposedAction.preview.recordsMayCreate, ['client', 'project', 'note'])
    assert.match(payload.proposedAction.description, /email subject/)
    assert.match(payload.proposedAction.description, /email body/)
  }

  const unsupported = await fetch(`${application.origin}/mcp`, {
    method: 'POST', headers: { Authorization: `Bearer ${mcpToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'negative', method: 'tools/call', params: { name: 'propose_workflow', arguments: { objective: 'Create an email workflow that creates a project, but also performs an unsupported calendar operation.' } } }),
  })
  const unsupportedPayload = await unsupported.json()
  assert.equal(unsupportedPayload.result.structuredContent.success, false)
  assert.equal(unsupportedPayload.result.structuredContent.error.code, 'MCP_AUTOMATION_ACTION_UNSUPPORTED')
  assert.match(unsupportedPayload.result.structuredContent.error.message, /calendar\.create/)
  assert.doesNotMatch(unsupportedPayload.result.structuredContent.error.message, /unknown/i)
  assert.equal(unsupportedPayload.result.structuredContent.metadata.diagnostic.requestedCapability, 'calendar.create')
  assert.equal(unsupportedPayload.result.structuredContent.metadata.diagnostic.stepId, 'classify_request')
  assert.equal(unsupportedPayload.result.structuredContent.metadata.diagnostic.validationStage, 'workflow-definition.capability-resolution')
  assert.match(unsupportedPayload.result.structuredContent.metadata.diagnostic.plannerOutput, /calendar\.create/)
  console.log('Hermes natural-language workflow regression verified: exact prompt, three paraphrases, canonical capability translation, approval pause, dynamic subject/body mappings, and explicit unsupported-operation rejection.')
} finally {
  if (application?.child?.exitCode === null) {
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
