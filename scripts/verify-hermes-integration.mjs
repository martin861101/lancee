import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHermesAgentProvider } from '../server/agents/hermes-agent-provider.mjs'
import { createLanceeCapabilityRegistry, lanceeMcpCapabilityBindings } from '../server/capabilities/index.mjs'
import { openDatabase } from '../server/database.mjs'
import { createLanceeMcpRuntime } from '../server/lancee-mcp.mjs'

const directory = mkdtempSync(join(tmpdir(), 'lancee-hermes-integration-'))
let database
let otherDatabase

const environment = {
  HERMES_ENDPOINT_URL: 'http://hermes.test',
  HERMES_API_KEY: 'hermes-secret',
  HERMES_PROFILE_ENDPOINT_TEMPLATE: 'http://hermes.test/p/{profileId}',
  HERMES_MODEL: 'hermes-test',
  HERMES_AGENT_TIMEOUT_MS: '1000',
  HERMES_AGENT_POLL_MS: '50',
}

try {
  database = await openDatabase({
    databasePath: join(directory, 'workspace-a.sqlite'),
    adminEmail: 'hermes-a@example.test',
    adminName: 'Hermes A',
    adminPasswordSalt: 'salt-a',
    adminPasswordHash: 'hash-a',
    workspaceId: 'wsp_hermes_a',
    workspaceName: 'Hermes Workspace A',
  })
  otherDatabase = await openDatabase({
    databasePath: join(directory, 'workspace-b.sqlite'),
    adminEmail: 'hermes-b@example.test',
    adminName: 'Hermes B',
    adminPasswordSalt: 'salt-b',
    adminPasswordHash: 'hash-b',
    workspaceId: 'wsp_hermes_b',
    workspaceName: 'Hermes Workspace B',
  })
  const context = {
    ...(await database.getContextByEmail('hermes-a@example.test')),
    permissions: ['files:read', 'files:write'],
  }
  const otherContext = {
    ...(await otherDatabase.getContextByEmail('hermes-b@example.test')),
    permissions: ['files:read', 'files:write'],
  }
  const capabilities = createLanceeCapabilityRegistry({ database })
  const mcp = createLanceeMcpRuntime({ database, capabilities })
  assert.equal(lanceeMcpCapabilityBindings.rename_file, 'file.rename')
  assert.equal(capabilities.has('file.rename'), true)
  assert.equal(mcp.listTools().some((tool) => tool.name === 'rename_file'), true)

  const documents = {
    notes: await database.createWorkspaceDocument({
      workspaceId: context.workspace.id,
      name: 'notes.md',
      mimeType: 'text/markdown',
      body: Buffer.from('hello'),
    }),
    text: await database.createWorkspaceDocument({
      workspaceId: context.workspace.id,
      name: 'matrix.txt',
      mimeType: 'text/plain',
      body: Buffer.from('txt'),
    }),
    json: await database.createWorkspaceDocument({
      workspaceId: context.workspace.id,
      name: 'matrix.json',
      mimeType: 'application/json',
      body: Buffer.from('{"ok":true}'),
    }),
    pdf: await database.createWorkspaceDocument({
      workspaceId: context.workspace.id,
      name: 'matrix.pdf',
      mimeType: 'application/pdf',
      body: Buffer.from('%PDF-1.4\n%%EOF'),
    }),
    importFailure: await database.createWorkspaceDocument({
      workspaceId: context.workspace.id,
      name: 'import-failure.txt',
      mimeType: 'text/plain',
      body: Buffer.from('must not surface'),
    }),
  }
  const createArtifact = database.createArtifact.bind(database)
  database.createArtifact = async (input) => {
    if (input.storageDocumentId === documents.importFailure.id) {
      throw Object.assign(new Error('Simulated artifact import failure.'), { code: 'TEST_ARTIFACT_IMPORT_FAILED' })
    }
    return await createArtifact(input)
  }
  const foreignDocument = await otherDatabase.createWorkspaceDocument({
    workspaceId: otherContext.workspace.id,
    name: 'foreign.txt',
    mimeType: 'text/plain',
    body: Buffer.from('private workspace B'),
  })

  const runRequests = []
  const runs = new Map()
  let runSequence = 0
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname
    const method = init.method || 'GET'
    if (path.includes('/api/sessions/') && method === 'GET') {
      return new Response('{}', { status: 200 })
    }
    if (path.endsWith('/v1/runs') && method === 'POST') {
      const body = JSON.parse(init.body)
      const runId = `hermes-focused-${++runSequence}`
      runRequests.push({ body, headers: init.headers })
      runs.set(runId, { body, polls: 0 })
      if (body.input === 'Rename that file to meeting-notes.md.') {
        assert.match(JSON.stringify(body.conversation_history), new RegExp(documents.notes.id))
        assert.match(JSON.stringify(body.conversation_history), /notes\.md/)
        await mcp.invoke('rename_file', {
          file_id: documents.notes.id,
          name: 'meeting-notes.md',
        }, context)
      }
      return new Response(JSON.stringify({ run_id: runId, status: 'started' }), { status: 202 })
    }
    const eventMatch = path.match(/\/v1\/runs\/(hermes-focused-\d+)\/events$/)
    if (eventMatch && method === 'GET') {
      const run = runs.get(eventMatch[1])
      const event = run?.body.input === 'Create notes.md containing hello.'
        ? `data: ${JSON.stringify({ event: 'tool.completed', tool: 'create_file', result: { file: documents.notes } })}\n\n`
        : ''
      return new Response(event, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    }
    const statusMatch = path.match(/\/v1\/runs\/(hermes-focused-\d+)$/)
    if (statusMatch && method === 'GET') {
      const run = runs.get(statusMatch[1])
      run.polls += 1
      if (run.polls === 1) return new Response('{"status":"running"}', { status: 200 })
      const input = run.body.input
      if (input === 'Remember the code word is pineapple.') {
        return Response.json({ status: 'completed', output: 'I will remember pineapple.' })
      }
      if (input === 'What was the code word?') {
        assert.match(JSON.stringify(run.body.conversation_history), /pineapple/)
        return Response.json({ status: 'completed', output: 'pineapple' })
      }
      if (input === 'Create notes.md containing hello.') {
        return Response.json({
          status: 'completed',
          output: 'Created notes.md in Lancee Files.',
          results: [{ data: { file: documents.notes, artifacts: [documents.notes] } }],
        })
      }
      if (input === 'Rename that file to meeting-notes.md.') {
        return Response.json({
          status: 'completed',
          output: 'Renamed the file to meeting-notes.md.',
          results: [{ data: { file: await database.getWorkspaceDocument(context.workspace.id, documents.notes.id) } }],
        })
      }
      if (input === 'What file did you just create?' || input === 'What file did you create earlier?') {
        assert.match(JSON.stringify(run.body.conversation_history), /meeting-notes\.md/)
        assert.match(JSON.stringify(run.body.conversation_history), new RegExp(documents.notes.id))
        return Response.json({ status: 'completed', output: 'meeting-notes.md' })
      }
      if (input === 'Generate the file matrix.') {
        return Response.json({
          status: 'completed',
          output: 'Created the TXT, Markdown, JSON, and PDF files.',
          results: [{
            data: {
              files: [documents.text, documents.notes, documents.json, documents.pdf],
              artifacts: [
                { id: 'art_metadata_only', name: 'tool-result.json', mimeType: 'application/json' },
                { id: 'doc_eeeeeeeeeeeeeeee', name: 'missing.txt', mimeType: 'text/plain' },
                foreignDocument,
                documents.importFailure,
                documents.json,
              ],
            },
          }],
        })
      }
      if (input === 'What file did I just create?') {
        assert.equal(run.body.conversation_history, undefined)
        return Response.json({ status: 'completed', output: 'No file exists in this conversation.' })
      }
      throw new Error(`Unexpected focused Hermes input: ${input}`)
    }
    throw new Error(`Unexpected focused Hermes request: ${method} ${path}`)
  }

  const providerOptions = {
    database,
    env: environment,
    fetchImpl,
    sleep: async () => undefined,
    logger: { info() {}, warn() {} },
  }
  const provider = createHermesAgentProvider(providerOptions)

  const memoryRun = await provider.runAgent({ context, message: 'Remember the code word is pineapple.' })
  assert.match(runRequests[0].body.instructions, /Connected Intelligence is Lancee’s current intelligence product/)
  assert.match(runRequests[0].body.instructions, /insufficient_activity means there is not enough inspected activity/)
  assert.match(runRequests[0].body.instructions, /Keep MCP names, detector identifiers, database tables, thresholds, event ids, and internal queue terms out of ordinary replies/)
  assert.doesNotMatch(runRequests[0].body.instructions, /For Decision Intelligence, use Lancee decision tools/)
  const memoryAnswer = await provider.runAgent({
    context,
    threadId: memoryRun.threadId,
    message: 'What was the code word?',
  })
  assert.equal(memoryAnswer.finalOutput, 'pineapple')

  const createRun = await provider.runAgent({ context, message: 'Create notes.md containing hello.' })
  assert.equal(createRun.results[0].data.files.length, 1)
  assert.equal(createRun.results[0].data.files[0].id, documents.notes.id)
  assert.equal(createRun.results[0].data.artifacts.length, 1)
  const createLinks = await database.listArtifacts(context.workspace.id, {
    subjectType: 'agent_run',
    subjectId: createRun.id,
  })
  assert.equal(createLinks.length, 1)

  const renameRun = await provider.runAgent({
    context,
    threadId: createRun.threadId,
    message: 'Rename that file to meeting-notes.md.',
  })
  assert.equal(renameRun.threadId, createRun.threadId)
  assert.equal((await database.getWorkspaceDocument(context.workspace.id, documents.notes.id)).name, 'meeting-notes.md')
  assert.equal(renameRun.results[0].data.files[0].name, 'meeting-notes.md')
  const renamedArtifact = await database.getArtifactByStorageDocumentId(context.workspace.id, documents.notes.id)
  assert.equal(renamedArtifact.name, 'meeting-notes.md')

  const namedRun = await provider.runAgent({
    context,
    threadId: createRun.threadId,
    message: 'What file did you just create?',
  })
  assert.equal(namedRun.finalOutput, 'meeting-notes.md')

  const matrixRun = await provider.runAgent({ context, message: 'Generate the file matrix.' })
  assert.deepEqual(
    matrixRun.results[0].data.files.map((file) => file.mimeType).sort(),
    ['application/json', 'application/pdf', 'text/markdown', 'text/plain'],
  )
  assert.equal(new Set(matrixRun.results[0].data.files.map((file) => file.id)).size, 4)
  for (const file of matrixRun.results[0].data.files) {
    assert(await database.getWorkspaceDocument(context.workspace.id, file.id))
  }
  assert.equal(matrixRun.results[0].data.files.some((file) => file.id === foreignDocument.id), false)
  const rejectedEvents = await database.listAgentRunEvents(context.workspace.id, matrixRun.id, { limit: 50 })
  const artifactRejections = rejectedEvents.filter((event) => event.eventType === 'hermes.artifact.rejected')
  assert(artifactRejections.length >= 4)
  assert(artifactRejections.some((event) => event.data?.reason === 'TEST_ARTIFACT_IMPORT_FAILED'))

  const separateConversation = await provider.runAgent({ context, message: 'What file did I just create?' })
  assert.notEqual(separateConversation.threadId, createRun.threadId)

  const reloadedProvider = createHermesAgentProvider(providerOptions)
  const resumedRun = await reloadedProvider.runAgent({
    context,
    threadId: createRun.threadId,
    message: 'What file did you create earlier?',
  })
  assert.equal(resumedRun.threadId, createRun.threadId)
  const originalThread = await database.getAgentThread(context.workspace.id, createRun.threadId, context.user.id)
  const resumeRequest = runRequests.at(-1)
  assert.equal(resumeRequest.body.session_id, originalThread.externalThreadId)
  assert.equal(resumeRequest.headers['X-Hermes-Session-Id'], originalThread.externalThreadId)

  const chatSource = readFileSync(new URL('../src/components/dashboard/WorkspaceChat.tsx', import.meta.url), 'utf8')
  assert.match(chatSource, /file\.storageDocumentId[\s\S]+file\.id/)
  assert.match(chatSource, /\^doc_\[a-f0-9\]\{16\}\$/)
  assert.match(chatSource, /agentThreadIdRef\.current/)
  const serverSource = readFileSync(new URL('../server/index.mjs', import.meta.url), 'utf8')
  assert.match(serverSource, /app\.get\('\/api\/documents\/:id\/download', requireAuth/)
  assert.match(serverSource, /getWorkspaceDocument\(\s*request\.auth\.context\.workspace\.id/)

  console.log('Hermes integration verified: durable TXT/Markdown/JSON/PDF canonical attachments, metadata/import rejection, duplicate suppression, workspace isolation, authenticated document routing, stable immediate-turn and restart sessions, artifact-aware history, and the create/rename/reference workflow.')
} finally {
  await database?.close()
  await otherDatabase?.close()
  rmSync(directory, { recursive: true, force: true })
}
