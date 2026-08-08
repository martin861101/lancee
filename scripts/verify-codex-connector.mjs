import assert from 'node:assert/strict'
import { createHash, scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

const projectDirectory = new URL('..', import.meta.url).pathname
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'lancee-codex-'))
const databasePath = join(temporaryDirectory, 'lancee.sqlite')
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
    if (request.url === '/search') {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const parameters = new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
      assert.match(parameters.get('q') || '', /baking companies/i)
      response.setHeader('Content-Type', 'text/html; charset=UTF-8')
      response.end(`<!doctype html><html><body>
        <a class="result__a" href="https://example.com/bimbo">Grupo Bimbo company profile</a>
        <a class="result__snippet">Global baking company with bread and snack brands.</a>
        <a class="result__a" href="https://example.com/flowers">Flowers Foods company profile</a>
        <a class="result__snippet">Producer of packaged bakery foods.</a>
      </body></html>`)
      return
    }
    assert.equal(request.url, '/chat/completions')
    assert.equal(request.headers.authorization, 'Bearer provider-test-key')
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    assert.equal(body.model, 'connector-test-model')
    assert(body.messages.some((message) => message.role === 'user'))
    response.setHeader('Content-Type', 'application/json')
    if (body.tools?.length) {
      const userMessage = [...body.messages].reverse().find((message) => message.role === 'user')?.content || ''
      const availableToolNames = body.tools.map((tool) => tool.function?.name)
      const requestedTool = availableToolNames.includes('lancee_web_search') && /search|research/i.test(userMessage)
        ? 'lancee_web_search'
        : availableToolNames.includes('lancee_create_pdf') && /pdf|untrusted_tool_result/i.test(userMessage)
          ? 'lancee_create_pdf'
          : /create.*file|file.*containing/i.test(userMessage)
            ? 'lancee_create_file'
            : /run workflow/i.test(userMessage)
              ? 'lancee_run_workflow'
              : 'lancee_create_workflow'
      const workflowId = userMessage.match(/aut_[a-f0-9]{12}/)?.[0]
      const argumentsValue = requestedTool === 'lancee_run_workflow'
        ? { workflow_id: workflowId, instruction: 'Summarize this workspace.' }
        : requestedTool === 'lancee_web_search'
          ? { query: 'notable baking companies', limit: 10 }
          : requestedTool === 'lancee_create_pdf'
            ? {
                name: 'baking-companies.pdf',
                title: 'Notable Baking Companies',
                content: '1. Grupo Bimbo — Global baking company.\n   Source: https://example.com/bimbo\n\n2. Flowers Foods — Packaged bakery foods producer.\n   Source: https://example.com/flowers',
              }
        : requestedTool === 'lancee_create_file'
          ? { name: 'assistant-note.md', content: '# Saved by Lancee', mime_type: 'text/markdown' }
          : {
            name: 'Assistant workspace pulse',
            description: 'Summarize live workspace activity through the Lancee Core.',
            execution: 'core',
            tools: ['workspace.summary'],
            activate: true,
          }
      assert(body.tools.some((tool) => tool.function?.name === requestedTool))
      if (['lancee_create_file', 'lancee_web_search', 'lancee_create_pdf'].includes(requestedTool)) {
        assert.deepEqual(body.tools.map((tool) => tool.function?.name), [requestedTool])
      }
      response.end(JSON.stringify({
        model: 'connector-test-model',
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: `call_${requestedTool}`,
              type: 'function',
              function: { name: requestedTool, arguments: JSON.stringify(argumentsValue) },
            }],
          },
        }],
        usage: { prompt_tokens: 15, completion_tokens: 8, total_tokens: 23 },
      }))
      return
    }
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
      LANCEE_WEB_SEARCH_URL: `${new URL(aiEndpoint).origin}/search`,
      SMTP_ENABLED: 'false',
      LANCEE_MCP_CODE_EXECUTION: 'true',
      LANCEE_MCP_PYTHON_BIN: process.env.LANCEE_MCP_PYTHON_BIN || 'python3',
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
  let run
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await sessionRequest(origin, cookie, `/api/automations/runs/${runId}`)
    assert.equal(response.status, 200)
    run = await response.json()
    if (run.status !== 'running') return run
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return run
}

async function issueDeviceCode(origin, scope = 'ai:invoke') {
  const response = await fetch(`${origin}/api/codex/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: 'lancee-codex-plugin',
      scope,
    }),
  })
  assert.equal(response.status, 201)
  const authorization = await response.json()
  assert.match(authorization.user_code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  assert.match(authorization.verification_uri_complete, /\?device=/)
  return authorization
}

async function approve(origin, cookie, userCode, expectedScope = 'ai:invoke') {
  const detailsResponse = await fetch(
    `${origin}/api/codex/device/authorization?user_code=${encodeURIComponent(userCode)}`,
    { headers: { Cookie: cookie } },
  )
  assert.equal(detailsResponse.status, 200)
  const details = await detailsResponse.json()
  assert.equal(details.scope, expectedScope)
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

function createMcpClient(origin, token) {
  let requestId = 0
  const rpc = async (method, params = {}) => {
    requestId += 1
    const response = await fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        method,
        params,
      }),
    })
    assert.equal(response.status, 200)
    return response.json()
  }
  return { rpc }
}

let aiProvider
let application
let connector
let rawAccessToken
try {
  aiProvider = await startAiProvider()
  application = await startApplication(aiProvider.url)
  const cookie = await login(application.origin)

  const servicesResponse = await sessionRequest(application.origin, cookie, '/api/mcp/services')
  assert.equal(servicesResponse.status, 200)
  const builtInService = (await servicesResponse.json()).services.find((service) => service.id === 'lancee')
  assert.equal(builtInService.active, true)
  assert.equal(builtInService.tools.length, 18)

  const assistantCreateResponse = await sessionRequest(
    application.origin,
    cookie,
    '/api/ai/chat',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Create and activate a workflow that summarizes my workspace.' }),
    },
  )
  assert.equal(assistantCreateResponse.status, 200)
  const assistantCreate = await assistantCreateResponse.json()
  assert.deepEqual({
    serviceId: assistantCreate.proposedAction.serviceId,
    toolId: assistantCreate.proposedAction.toolId,
    arguments: assistantCreate.proposedAction.arguments,
  }, {
    serviceId: 'lancee',
    toolId: 'create_workflow',
    arguments: {
      name: 'Assistant workspace pulse',
      description: 'Summarize live workspace activity through the Lancee Core.',
      execution: 'core',
      tools: ['workspace.summary'],
      activate: true,
    },
  })
  const approvedCreateResponse = await sessionRequest(
    application.origin,
    cookie,
    '/api/mcp/invoke',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'assistant-create-workflow-0001',
      },
      body: JSON.stringify(assistantCreate.proposedAction),
    },
  )
  assert.equal(approvedCreateResponse.status, 200)
  const assistantWorkflow = (await approvedCreateResponse.json()).data.workflow
  assert.equal(assistantWorkflow.status, 'active')

  const assistantFileResponse = await sessionRequest(
    application.origin,
    cookie,
    '/api/ai/chat',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Create a file called assistant-note.md containing # Saved by Lancee.' }),
    },
  )
  assert.equal(assistantFileResponse.status, 200)
  const assistantFile = await assistantFileResponse.json()
  assert.deepEqual({
    serviceId: assistantFile.proposedAction.serviceId,
    toolId: assistantFile.proposedAction.toolId,
    arguments: assistantFile.proposedAction.arguments,
  }, {
    serviceId: 'lancee',
    toolId: 'create_file',
    arguments: { name: 'assistant-note.md', content: '# Saved by Lancee', mime_type: 'text/markdown' },
  })

  const createFileResponse = await sessionRequest(
    application.origin,
    cookie,
    '/api/mcp/invoke',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'assistant-create-file-0001',
      },
      body: JSON.stringify(assistantFile.proposedAction),
    },
  )
  assert.equal(createFileResponse.status, 200)
  assert.match((await createFileResponse.json()).data.file.id, /^doc_[a-f0-9]{16}$/)

  const researchRequest = 'Search for notable baking companies, extract a sourced list, and save it to Files as a PDF.'
  const assistantSearchResponse = await sessionRequest(
    application.origin,
    cookie,
    '/api/ai/chat',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: researchRequest }),
    },
  )
  assert.equal(assistantSearchResponse.status, 200)
  const assistantSearch = await assistantSearchResponse.json()
  assert.equal(assistantSearch.proposedAction.toolId, 'web_search')
  assert.equal(assistantSearch.proposedAction.continueAfterSuccess, true)

  const approvedSearchResponse = await sessionRequest(
    application.origin,
    cookie,
    '/api/mcp/invoke',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'assistant-web-search-0001',
      },
      body: JSON.stringify(assistantSearch.proposedAction),
    },
  )
  assert.equal(approvedSearchResponse.status, 200)
  const approvedSearch = await approvedSearchResponse.json()
  assert.equal(approvedSearch.ok, true)
  assert.equal(approvedSearch.data.results.length, 2)

  const assistantPdfResponse = await sessionRequest(
    application.origin,
    cookie,
    '/api/ai/chat',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: researchRequest,
        history: [
          { role: 'user', content: researchRequest },
          { role: 'assistant', content: assistantSearch.content },
        ],
        continuation: {
          serviceId: assistantSearch.proposedAction.serviceId,
          toolId: assistantSearch.proposedAction.toolId,
          data: approvedSearch.data,
        },
      }),
    },
  )
  assert.equal(assistantPdfResponse.status, 200)
  const assistantPdf = await assistantPdfResponse.json()
  assert.equal(assistantPdf.proposedAction.toolId, 'create_pdf')

  const approvedPdfResponse = await sessionRequest(
    application.origin,
    cookie,
    '/api/mcp/invoke',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'assistant-create-pdf-0001',
      },
      body: JSON.stringify(assistantPdf.proposedAction),
    },
  )
  assert.equal(approvedPdfResponse.status, 200)
  const approvedPdf = await approvedPdfResponse.json()
  assert.equal(approvedPdf.data.file.mimeType, 'application/pdf')
  const pdfDownloadResponse = await sessionRequest(
    application.origin,
    cookie,
    `/api/documents/${approvedPdf.data.file.id}/download`,
  )
  assert.equal(pdfDownloadResponse.status, 200)
  assert.equal(pdfDownloadResponse.headers.get('content-type'), 'application/pdf')
  assert.equal(Buffer.from(await pdfDownloadResponse.arrayBuffer()).subarray(0, 5).toString(), '%PDF-')

  const requestConnectorResponse = await sessionRequest(
    application.origin,
    cookie,
    '/api/mcp/invoke',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'assistant-request-connector-0001',
      },
      body: JSON.stringify({
        serviceId: 'lancee',
        toolId: 'request_connector',
        arguments: { name: 'PostgreSQL reporting adapter', category: 'Automation', details: 'Workspace-scoped reporting tools.' },
      }),
    },
  )
  assert.equal(requestConnectorResponse.status, 200)
  const requestsResponse = await sessionRequest(application.origin, cookie, '/api/integration-requests')
  assert.equal(requestsResponse.status, 200)
  assert((await requestsResponse.json()).requests.some((item) => item.name === 'PostgreSQL reporting adapter'))

  const assistantRunResponse = await sessionRequest(
    application.origin,
    cookie,
    '/api/ai/chat',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Run workflow ${assistantWorkflow.id} now.` }),
    },
  )
  assert.equal(assistantRunResponse.status, 200)
  const assistantRunProposal = (await assistantRunResponse.json()).proposedAction
  assert.equal(assistantRunProposal.toolId, 'run_workflow')
  const approvedRunResponse = await sessionRequest(
    application.origin,
    cookie,
    '/api/mcp/invoke',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'assistant-run-workflow-0001',
      },
      body: JSON.stringify(assistantRunProposal),
    },
  )
  assert.equal(approvedRunResponse.status, 200)
  const assistantRun = (await approvedRunResponse.json()).data.run
  const completedAssistantRun = await waitForRun(application.origin, cookie, assistantRun.id)
  assert.equal(completedAssistantRun.status, 'completed')
  assert(completedAssistantRun.events.some((event) => event.eventType === 'step.completed'))

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

  const mcpAuthorization = await issueDeviceCode(application.origin, 'mcp:invoke')
  await approve(application.origin, cookie, mcpAuthorization.user_code, 'mcp:invoke')
  const mcpTokenResponse = await exchange(application.origin, mcpAuthorization.device_code)
  assert.equal(mcpTokenResponse.status, 200)
  const mcpToken = (await mcpTokenResponse.json()).access_token
  connector = createMcpClient(application.origin, mcpToken)
  const initialized = await connector.rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'verifier', version: '1.0.0' },
  })
  assert.equal(initialized.result.serverInfo.name, 'lancee')
  const listed = await connector.rpc('tools/list')
  assert.deepEqual(
    listed.result.tools.map((tool) => tool.name),
    [
      'run_workflow',
      'create_workflow',
      'query_dashboard',
      'create_client',
      'create_project',
      'set_project_status',
      'create_file',
      'web_search',
      'create_pdf',
      'request_connector',
      'delete_workspace_resource',
      'get_workflow_status',
      'search_workflows',
      'execute_python',
      'execute_javascript',
      'schedule_job',
      'get_logs',
      'call_external_api',
    ],
  )

  const workflowSearch = await connector.rpc('tools/call', {
    name: 'search_workflows',
    arguments: { limit: 10 },
  })
  assert(Array.isArray(workflowSearch.result.structuredContent.workflows))

  const dashboardQuery = await connector.rpc('tools/call', {
    name: 'query_dashboard',
    arguments: { resource: 'connections', limit: 10 },
  })
  assert(Array.isArray(dashboardQuery.result.structuredContent.rows))

  const javascriptExecution = await connector.rpc('tools/call', {
    name: 'execute_javascript',
    arguments: { code: 'console.log(6 * 7)' },
  })
  assert.equal(javascriptExecution.result.isError, undefined)
  assert.equal(javascriptExecution.result.structuredContent.exitCode, 0)
  assert.match(javascriptExecution.result.structuredContent.stdout, /42/)

  const pythonExecution = await connector.rpc('tools/call', {
    name: 'execute_python',
    arguments: { code: 'print(6 * 7)' },
  })
  assert.equal(pythonExecution.result.isError, undefined)
  assert.equal(pythonExecution.result.structuredContent.exitCode, 0)
  assert.match(pythonExecution.result.structuredContent.stdout, /42/)

  const createdWorkflow = await connector.rpc('tools/call', {
    name: 'create_workflow',
    arguments: {
      name: 'Scheduled connector workflow',
      description: 'Verify durable Lancee scheduling.',
      prompt_template: 'Summarize this workspace.',
    },
  })
  const workflow = createdWorkflow.result.structuredContent.workflow
  assert.match(workflow.id, /^aut_[a-f0-9]{12}$/)
  assert.equal(workflow.status, 'active')

  const directRunResult = await connector.rpc('tools/call', {
    name: 'run_workflow',
    arguments: {
      workflow_id: workflow.id,
    },
  })
  const directRun = directRunResult.result.structuredContent.run
  assert.match(directRun.id, /^run_[a-f0-9]{12}$/)
  const completedDirectRun = await waitForRun(application.origin, cookie, directRun.id)
  assert.equal(completedDirectRun.status, 'completed')

  const persistedLogs = await connector.rpc('tools/call', {
    name: 'get_logs',
    arguments: { run_id: directRun.id },
  })
  assert(
    persistedLogs.result.structuredContent.logs.some(
      (entry) => entry.eventType === 'step.completed',
    ),
  )

  const blockedExternalApi = await connector.rpc('tools/call', {
    name: 'call_external_api',
    arguments: { url: 'http://127.0.0.1/private' },
  })
  assert.equal(blockedExternalApi.result.isError, true)
  assert.equal(
    blockedExternalApi.result.structuredContent.error,
    'MCP_HTTPS_REQUIRED',
  )

  const scheduled = await connector.rpc('tools/call', {
    name: 'schedule_job',
    arguments: {
      workflow_id: workflow.id,
      instruction: 'List the projects in this workspace.',
      run_at: new Date(Date.now() + 1_200).toISOString(),
    },
  })
  const schedule = scheduled.result.structuredContent.schedule
  assert.match(schedule.id, /^sch_[a-f0-9]{20}$/)
  assert.equal(schedule.status, 'scheduled')

  const statusBeforeDispatch = await connector.rpc('tools/call', {
    name: 'get_workflow_status',
    arguments: { workflow_id: workflow.id, include_runs: false },
  })
  assert(
    statusBeforeDispatch.result.structuredContent.schedules.some(
      (entry) => entry.id === schedule.id,
    ),
  )

  await new Promise((resolve) => setTimeout(resolve, 2_500))
  const statusAfterDispatch = await connector.rpc('tools/call', {
    name: 'get_workflow_status',
    arguments: { workflow_id: workflow.id },
  })
  const completedSchedule = statusAfterDispatch.result.structuredContent.schedules.find(
    (entry) => entry.id === schedule.id,
  )
  assert.equal(completedSchedule.status, 'completed')
  assert.match(completedSchedule.lastRunId, /^run_[a-f0-9]{12}$/)

  const twoDevicesResponse = await fetch(
    `${application.origin}/api/codex/connection`,
    { headers: { Cookie: cookie } },
  )
  assert.equal((await twoDevicesResponse.json()).activeConnections, 2)

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
    'Codex connector verified: Connections catalog state, device approval, local HTTP MCP tools, code execution, durable scheduling, revocation, and hashed token storage.',
  )
} finally {
  await stopChild(application?.child)
  if (aiProvider?.server.listening) {
    aiProvider.server.close()
    await once(aiProvider.server, 'close')
  }
  await rm(temporaryDirectory, { recursive: true, force: true })
}
