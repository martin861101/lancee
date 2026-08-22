import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AgentProviderError, createAgentProviderGateway, getAgentProviderConfig, trustedAgentRequest } from '../server/agents/agent-provider.mjs'
import { createHermesAgentProvider } from '../server/agents/hermes-agent-provider.mjs'
import { openDatabase } from '../server/database.mjs'

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'lancee-agent-provider-'))
const databasePath = join(temporaryDirectory, 'provider.sqlite')
const hermesMediaDirectory = join(temporaryDirectory, 'hermes-media')
mkdirSync(hermesMediaDirectory)
let database

const context = {
  user: { id: 'usr_agent_provider', name: 'Agent Provider' },
  workspace: { id: 'wsp_agent_provider', name: 'Agent Provider Workspace' },
  membership: { role: 'owner' },
  permissions: ['workspace:read'],
}

const hermesEnvironment = {
  HERMES_ENDPOINT_URL: 'http://hermes.test',
  HERMES_API_KEY: 'hermes-secret',
  HERMES_PROFILE_ENDPOINT_TEMPLATE: 'http://hermes.test/p/{profileId}',
  HERMES_MODEL: 'hermes-test',
  HERMES_AGENT_TIMEOUT_MS: '1000',
  HERMES_AGENT_POLL_MS: '50',
  HERMES_AGENT_STREAM_EVENTS: 'false',
}

let sessionLookupCount = 0
let runNumber = 0
let artifactDocument = null
let databaseB
const nativeCalls = []
const nativeFetch = async (url, init = {}) => {
  const parsedUrl = new URL(url)
  const method = init.method || 'GET'
  const body = init.body ? JSON.parse(init.body) : null
  nativeCalls.push({ path: parsedUrl.pathname, method, body, headers: init.headers || {} })

  if (parsedUrl.pathname.includes('/api/sessions/')) {
    sessionLookupCount += 1
    return sessionLookupCount === 1
      ? new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      : new Response(JSON.stringify({ id: parsedUrl.pathname.split('/').pop() }), { status: 200 })
  }
  if (parsedUrl.pathname.endsWith('/api/sessions') && method === 'POST') {
    return new Response(JSON.stringify({ ok: true }), { status: 201 })
  }
  if (parsedUrl.pathname.endsWith('/v1/runs') && method === 'POST') {
    runNumber += 1
    return new Response(JSON.stringify({ run_id: `hermes-run-${runNumber}`, status: 'started' }), { status: 202 })
  }
  if (parsedUrl.pathname.includes('/v1/runs/hermes-run-') && method === 'GET') {
    return new Response(JSON.stringify({
      status: 'completed',
      output: `completed-${parsedUrl.pathname.split('-').pop()}`,
      ...(runNumber === 3 && artifactDocument
        ? { results: [{ data: { file: artifactDocument } }] }
        : {}),
      usage: { input_tokens: 4, output_tokens: 3, total_tokens: 7 },
    }), { status: 200 })
  }
  throw new Error(`Unexpected Hermes test request: ${method} ${parsedUrl.pathname}`)
}

try {
  assert.equal(getAgentProviderConfig({}).provider, 'lancee')
  assert.equal(getAgentProviderConfig({ HERMES_ENDPOINT_URL: 'http://hermes.test', HERMES_API_KEY: 'key' }).provider, 'hermes')
  assert.equal(getAgentProviderConfig({ AGENT_PROVIDER: 'lancee', HERMES_ENDPOINT_URL: 'http://hermes.test', HERMES_API_KEY: 'key' }).provider, 'lancee')
  const invalidConfig = getAgentProviderConfig({ AGENT_PROVIDER: 'unknown' })
  assert.equal(invalidConfig.provider, 'lancee')
  assert.match(invalidConfig.configurationError, /Unsupported agent provider/)

  assert.throws(
    () => trustedAgentRequest({ context, workspaceId: 'wsp_other', message: 'cross tenant request' }),
    (error) => error instanceof AgentProviderError && error.code === 'AGENT_CONTEXT_MISMATCH' && error.status === 403,
  )

  database = await openDatabase({
    databasePath,
    adminEmail: 'agent-provider@example.test',
    adminName: 'Agent Provider',
    adminPasswordSalt: 'provider-salt',
    adminPasswordHash: 'provider-hash',
    workspaceId: context.workspace.id,
    workspaceName: context.workspace.name,
  })
  const databaseContext = await database.getContextByEmail('agent-provider@example.test')
  const providerContext = { ...databaseContext, permissions: context.permissions }

  const hermes = createHermesAgentProvider({
    database,
    env: hermesEnvironment,
    fetchImpl: nativeFetch,
    sleep: async () => undefined,
    now: () => 1_700_000_000_000,
    logger: { info() {}, warn() {} },
  })
  const providerStatus = await hermes.getStatus()
  assert.equal(providerStatus.profileIsolation, true)
  assert.equal(providerStatus.profileRoutingConfigured, true)

  const firstRun = await hermes.runAgent({
    context: providerContext,
    message: 'Read the workspace summary. Marker ORANGE-PENGUIN-92841.',
    title: 'Workspace summary',
  })
  assert.equal(firstRun.status, 'completed')
  assert.match(firstRun.finalOutput, /completed-1/)
  const firstThread = await database.getAgentThread(providerContext.workspace.id, firstRun.threadId, providerContext.user.id)
  assert.equal(firstThread.provider, 'hermes')
  assert.match(firstThread.externalThreadId, /^lancee_[a-f0-9]{32}$/)

  const secondRun = await hermes.runAgent({
    context: providerContext,
    message: 'Read it again.',
    threadId: firstRun.threadId,
  })
  assert.equal(secondRun.status, 'completed')
  assert.equal(secondRun.threadId, firstRun.threadId)
  const runRequests = nativeCalls.filter((call) => call.path.endsWith('/v1/runs') && call.method === 'POST')
  assert.equal(runRequests.length, 2)
  assert.equal(runRequests[0].body.session_id, firstThread.externalThreadId)
  assert.equal(runRequests[1].body.session_id, firstThread.externalThreadId)
  assert.equal(runRequests[0].body.model, 'hermes-test')
  assert.equal(runRequests[0].body.conversation_history, undefined)
  assert.match(JSON.stringify(runRequests[1].body.conversation_history), /ORANGE-PENGUIN-92841/)
  assert.match(runRequests[0].body.instructions, /Authenticated workspace/)
  assert.match(runRequests[0].body.instructions, /Lancee decision tools/)
  assert.match(runRequests[0].body.instructions, /evidence confidence separate from causal confidence/)
  assert.match(runRequests[0].body.instructions, /persisted Lancee pattern, prediction, warning/)
  assert.match(runRequests[0].body.instructions, /controlled estimates depend on stated assumptions/)
  assert.match(runRequests[0].body.instructions, /Zero reviews does not mean zero decisions/)
  assert.match(runRequests[0].body.instructions, /full native Hermes capability set/)
  assert.match(runRequests[0].body.instructions, /browser automation and screenshots/)
  assert.match(runRequests[0].body.instructions, /normal MEDIA: path/)
  assert.equal(runRequests[0].headers.Authorization, 'Bearer hermes-secret')
  assert.match(runRequests[0].headers['X-Hermes-Session-Key'], /^agent:[a-f0-9]{32}$/)
  assert.equal(runRequests[0].headers['X-Hermes-Session-Id'], firstThread.externalThreadId)
  assert.equal(runRequests[0].headers['X-Hermes-Session-Key'], runRequests[1].headers['X-Hermes-Session-Key'])
  assert.equal(runRequests[0].path.startsWith(`/p/lancee_ws_${providerContext.workspace.id}/`), true)
  assert.equal(JSON.stringify(runRequests[0].body).includes('hermes-secret'), false)

  artifactDocument = await database.createWorkspaceDocument({
    workspaceId: providerContext.workspace.id,
    name: 'workspace-summary.md',
    mimeType: 'text/markdown',
    body: Buffer.from('# Workspace summary\n\nORANGE-PENGUIN-92841', 'utf8'),
  })
  const thirdRun = await hermes.runAgent({
    context: providerContext,
    message: 'Separate conversation marker HOME-AFFAIRS-9921.',
  })
  assert.equal(thirdRun.status, 'completed')
  assert.notEqual(thirdRun.threadId, firstRun.threadId)
  const thirdThread = await database.getAgentThread(providerContext.workspace.id, thirdRun.threadId, providerContext.user.id)
  assert.notEqual(thirdThread.externalThreadId, firstThread.externalThreadId)
  const thirdRunRequest = nativeCalls.filter((call) => call.path.endsWith('/v1/runs') && call.method === 'POST')[2]
  assert.notEqual(thirdRunRequest.headers['X-Hermes-Session-Key'], runRequests[0].headers['X-Hermes-Session-Key'])
  assert.equal(String(JSON.stringify(thirdRunRequest.body.conversation_history)).includes('ORANGE-PENGUIN-92841'), false)
  assert.equal(thirdRun.results[0].data.files[0].id, artifactDocument.id)
  const linkedArtifacts = await database.listArtifacts(providerContext.workspace.id, {
    subjectType: 'agent_run',
    subjectId: thirdRun.id,
  })
  assert.equal(linkedArtifacts.length, 1)
  assert.equal(linkedArtifacts[0].storageDocumentId, artifactDocument.id)

  const thirdFollowUp = await hermes.runAgent({
    context: providerContext,
    threadId: thirdRun.threadId,
    message: 'What were we discussing?',
  })
  assert.equal(thirdFollowUp.threadId, thirdRun.threadId)
  const thirdFollowUpRequest = nativeCalls.filter((call) => call.path.endsWith('/v1/runs') && call.method === 'POST').at(-1)
  assert.match(JSON.stringify(thirdFollowUpRequest.body.conversation_history), /HOME-AFFAIRS-9921/)
  assert.equal(JSON.stringify(thirdFollowUpRequest.body.conversation_history).includes('ORANGE-PENGUIN-92841'), false)

  databaseB = await openDatabase({
    databasePath: join(temporaryDirectory, 'provider-b.sqlite'),
    adminEmail: 'agent-provider-b@example.test',
    adminName: 'Agent Provider B',
    adminPasswordSalt: 'provider-salt-b',
    adminPasswordHash: 'provider-hash-b',
    workspaceId: 'wsp_agent_provider_b',
    workspaceName: 'Agent Provider Workspace B',
  })
  const providerContextB = {
    ...(await databaseB.getContextByEmail('agent-provider-b@example.test')),
    permissions: context.permissions,
  }
  const hermesB = createHermesAgentProvider({
    database: databaseB,
    env: hermesEnvironment,
    fetchImpl: nativeFetch,
    sleep: async () => undefined,
    now: () => 1_700_000_000_003,
    logger: { info() {}, warn() {} },
  })
  const workspaceBRun = await hermesB.runAgent({
    context: providerContextB,
    message: 'Read the other workspace summary. Marker HOME-AFFAIRS-9921.',
  })
  assert.equal(workspaceBRun.status, 'completed')
  const workspaceBRequest = nativeCalls.filter((call) => call.path.endsWith('/v1/runs') && call.method === 'POST').at(-1)
  assert.equal(workspaceBRequest.path.startsWith(`/p/lancee_ws_${providerContextB.workspace.id}/`), true)
  assert.equal(JSON.stringify(workspaceBRequest.body).includes('ORANGE-PENGUIN-92841'), false)
  assert.notEqual(workspaceBRequest.headers['X-Hermes-Session-Key'], runRequests[0].headers['X-Hermes-Session-Key'])

  const reloadedHermes = createHermesAgentProvider({
    database,
    env: hermesEnvironment,
    fetchImpl: nativeFetch,
    sleep: async () => undefined,
    now: () => 1_700_000_000_004,
    logger: { info() {}, warn() {} },
  })
  const reloadedRun = await reloadedHermes.runAgent({
    context: providerContext,
    threadId: firstRun.threadId,
    message: 'What were we discussing before reload?',
  })
  assert.equal(reloadedRun.threadId, firstRun.threadId)
  const reloadRequest = nativeCalls.filter((call) => call.path.endsWith('/v1/runs') && call.method === 'POST').at(-1)
  assert.equal(reloadRequest.body.session_id, firstThread.externalThreadId)
  assert.match(JSON.stringify(reloadRequest.body.conversation_history), /ORANGE-PENGUIN-92841/)
  assert.equal(JSON.stringify(reloadRequest.body.conversation_history).includes('HOME-AFFAIRS-9921'), false)

  await assert.rejects(
    hermes.runAgent({
      context: { ...providerContext, user: { ...providerContext.user, id: 'usr_other' } },
      threadId: firstRun.threadId,
      message: 'Attempt to access another user conversation.',
    }),
    (error) => error instanceof AgentProviderError && error.code === 'AGENT_THREAD_NOT_FOUND' && error.status === 404,
  )

  const screenshotPath = join(hermesMediaDirectory, 'dashboard-screenshot.png')
  const screenshotBody = Buffer.from('89504e470d0a1a0a00000000', 'hex')
  writeFileSync(screenshotPath, screenshotBody)
  const mediaProvider = createHermesAgentProvider({
    database,
    env: { ...hermesEnvironment, HERMES_MEDIA_ROOTS: hermesMediaDirectory },
    fetchImpl: async (url, init = {}) => {
      const path = new URL(url).pathname
      const method = init.method || 'GET'
      if (path.includes('/api/sessions/')) return new Response('{}', { status: 200 })
      if (path.endsWith('/v1/runs') && method === 'POST') return new Response('{"run_id":"native-media-run"}', { status: 202 })
      if (path.endsWith('/v1/runs/native-media-run') && method === 'GET') {
        return new Response(JSON.stringify({
          status: 'completed',
          output: `Screenshot ready for https://example.com/app/dashboard.\nMEDIA:${screenshotPath}`,
        }), { status: 200 })
      }
      throw new Error(`Unexpected native-media request: ${method} ${path}`)
    },
    sleep: async () => undefined,
    logger: { info() {}, warn() {} },
  })
  const mediaRun = await mediaProvider.runAgent({
    context: providerContext,
    message: 'Take a screenshot of the dashboard URL.',
  })
  assert.equal(mediaRun.status, 'completed')
  assert.match(mediaRun.finalOutput, /https:\/\/example\.com\/app\/dashboard/)
  assert.match(mediaRun.finalOutput, /\/api\/documents\/doc_[a-f0-9]+\/download/)
  assert.equal(mediaRun.finalOutput.includes(screenshotPath), false)
  const mediaFile = mediaRun.results[0].data.files[0]
  assert.equal(mediaFile.name, 'dashboard-screenshot.png')
  assert.equal(mediaFile.mimeType, 'image/png')
  const persistedScreenshot = await database.getWorkspaceDocument(providerContext.workspace.id, mediaFile.id)
  assert.deepEqual(persistedScreenshot.body, screenshotBody)
  const mediaArtifacts = await database.listArtifacts(providerContext.workspace.id, {
    subjectType: 'agent_run',
    subjectId: mediaRun.id,
  })
  assert.equal(mediaArtifacts.length, 1)
  assert.equal(mediaArtifacts[0].source, 'hermes-native-media')

  const failedProvider = createHermesAgentProvider({
    database,
    env: { ...hermesEnvironment, HERMES_AGENT_STREAM_EVENTS: 'false' },
    fetchImpl: async (url, init = {}) => {
      const path = new URL(url).pathname
      if (path.includes('/api/sessions/')) return new Response('{}', { status: 404 })
      if (path.endsWith('/api/sessions')) return new Response('{}', { status: 201 })
      if (path.endsWith('/v1/runs')) return new Response('{}', { status: 202 })
      throw new Error(`Unexpected malformed Hermes request: ${init.method || 'GET'} ${path}`)
    },
    sleep: async () => undefined,
    now: () => 1_700_000_000_001,
    logger: { info() {}, warn() {} },
  })
  await assert.rejects(
    failedProvider.runAgent({ context: providerContext, message: 'Return a malformed run.' }),
    (error) => error instanceof AgentProviderError && error.code === 'HERMES_INVALID_RESPONSE',
  )

  let unavailableSessionRunRequests = 0
  const unavailableSessionProvider = createHermesAgentProvider({
    database,
    env: hermesEnvironment,
    fetchImpl: async (url, init = {}) => {
      const path = new URL(url).pathname
      if (path.includes('/api/sessions/')) return new Response('{}', { status: 405 })
      if (path.endsWith('/v1/runs')) unavailableSessionRunRequests += 1
      throw new Error(`Unexpected unavailable-session request: ${init.method || 'GET'} ${path}`)
    },
    sleep: async () => undefined,
    logger: { info() {}, warn() {} },
  })
  await assert.rejects(
    unavailableSessionProvider.runAgent({ context: providerContext, message: 'Do not run without a session.' }),
    (error) => error instanceof AgentProviderError && error.code === 'HERMES_REQUEST_FAILED',
  )
  assert.equal(unavailableSessionRunRequests, 0)

  const unverifiedFileProvider = createHermesAgentProvider({
    database,
    env: hermesEnvironment,
    fetchImpl: async (url, init = {}) => {
      const path = new URL(url).pathname
      const method = init.method || 'GET'
      if (path.includes('/api/sessions/')) return new Response('{}', { status: 200 })
      if (path.endsWith('/v1/runs') && method === 'POST') return new Response('{"run_id":"unverified-file-run"}', { status: 202 })
      if (path.endsWith('/v1/runs/unverified-file-run') && method === 'GET') {
        return new Response(JSON.stringify({
          status: 'completed',
          output: 'Done — I created the document at /tmp/lancee-power-pricing.md.',
        }), { status: 200 })
      }
      throw new Error(`Unexpected file-truthfulness request: ${method} ${path}`)
    },
    sleep: async () => undefined,
    logger: { info() {}, warn() {} },
  })
  const unverifiedFileRun = await unverifiedFileProvider.runAgent({
    context: providerContext,
    message: 'Create a pricing document.',
  })
  assert.equal(unverifiedFileRun.finalOutput, 'I could not verify that a file was saved to Lancee Files. Please try the save again.')
  assert.equal(unverifiedFileRun.finalOutput.includes('/tmp/'), false)

  const unconfiguredProfile = createHermesAgentProvider({
    database,
    env: {
      HERMES_ENDPOINT_URL: 'http://hermes.test',
      HERMES_PROFILE_API_KEYS_JSON: JSON.stringify({ lancee_ws_other_workspace: 'other-secret' }),
    },
    fetchImpl: nativeFetch,
  })
  await assert.rejects(
    unconfiguredProfile.runAgent({ context: providerContext, message: 'No workspace profile.' }),
    (error) => error instanceof AgentProviderError && error.code === 'HERMES_PROFILE_UNAVAILABLE' && !error.fallbackEligible,
  )
  const failedRuns = await database.listAgentRuns(providerContext.workspace.id, { userId: providerContext.user.id, limit: 20 })
  assert(failedRuns.some((run) => run.errorCode === 'HERMES_INVALID_RESPONSE'))

  const unavailable = createHermesAgentProvider({ database, env: {}, fetchImpl: nativeFetch })
  await assert.rejects(
    unavailable.runAgent({ context: providerContext, message: 'Unavailable Hermes.' }),
    (error) => error instanceof AgentProviderError && error.code === 'HERMES_NOT_CONFIGURED' && error.fallbackEligible,
  )

  const timeoutError = Object.assign(new Error('Hermes timeout'), { name: 'TimeoutError' })
  const timedOut = createHermesAgentProvider({
    database,
    env: { ...hermesEnvironment, HERMES_AGENT_STREAM_EVENTS: 'false' },
    fetchImpl: async () => { throw timeoutError },
    sleep: async () => undefined,
    now: () => 1_700_000_000_002,
    logger: { info() {}, warn() {} },
  })
  await assert.rejects(
    timedOut.runAgent({ context: providerContext, message: 'Time out Hermes.' }),
    (error) => error instanceof AgentProviderError && error.code === 'HERMES_TIMEOUT',
  )

  const gateway = createAgentProviderGateway({
    database,
    config: {
      provider: 'hermes',
      fallbackProvider: 'lancee',
      fallbackEnabled: true,
      configurationError: null,
    },
    hermes: {
      name: 'hermes',
      async runAgent() {
        throw new AgentProviderError('HERMES_UNAVAILABLE', 'test unavailable', { fallbackEligible: true })
      },
    },
    lancee: {
      name: 'lancee',
      async runAgent(input) {
        return { provider: 'lancee', objective: input.message }
      },
    },
  })
  assert.deepEqual(
    await gateway.runAgent({ context: providerContext, message: 'Use the fallback.' }),
    { provider: 'lancee', objective: 'Use the fallback.' },
  )

  await assert.rejects(
    gateway.runAgent({ context: providerContext, threadId: 'athr_00000000000000000000', message: 'Unknown thread.' }),
    (error) => error instanceof AgentProviderError && error.code === 'AGENT_THREAD_NOT_FOUND' && error.status === 404,
  )

  assert.equal(await database.getAgentRun(providerContext.workspace.id, firstRun.id, 'usr_other'), null)
  console.log('Agent provider verification passed: selection, tenant isolation, native-session restoration, conversation continuity, artifact and native-media persistence, URL preservation, file-save truthfulness, failure handling, fallback, and run isolation.')
} finally {
  await database?.close()
  await databaseB?.close()
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
