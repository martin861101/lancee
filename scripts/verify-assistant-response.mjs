import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeAssistantError, normalizeAssistantResponse } from '../server/assistant-response.mjs'
import { openDatabase } from '../server/database.mjs'

const workflow = {
  version: 1,
  name: 'Hookitup email project requests',
  trigger: {
    type: 'mail.received',
    matchMode: 'all',
    conditions: [{ field: 'sender.email', operator: 'equals', value: 'mschoeman3@gmail.com' }],
  },
  steps: [
    {
      id: 'understand_request',
      tool: 'ai.extract_project_request',
      input: { subject: '{{event.subject}}', body: '{{event.body}}' },
    },
    {
      id: 'resolve_client',
      tool: 'clients.resolve',
      input: { query: 'Hookitup' },
    },
    {
      id: 'create_project',
      tool: 'projects.create',
      input: {
        clientId: { $ref: 'steps.resolve_client.output.resource.id' },
        name: '{{event.subject}}',
        scope: { $ref: 'steps.understand_request.output.summary' },
        sourceKey: 'mail:{{event.messageId}}',
      },
    },
    {
      id: 'add_note',
      tool: 'projects.add_note',
      input: {
        projectId: { $ref: 'steps.create_project.output.resource.id' },
        body: '{{event.body}}',
        sourceKey: 'mail:{{event.messageId}}:note',
      },
    },
  ],
}

// A. Plain conversational responses remain Markdown-capable messages.
assert.deepEqual(normalizeAssistantResponse('Hello **there**.'), { type: 'message', message: 'Hello **there**.' })

// B/E/G. Valid nested workflow data is validated, separated, and carried by the create action.
const workflowEnvelope = { status: 'ready', workflow, assumptions: [], warnings: [], questions: [] }
const workflowResponse = normalizeAssistantResponse(JSON.stringify(workflowEnvelope))
assert.equal(workflowResponse.type, 'workflow_preview')
assert.equal(workflowResponse.message.includes('{'), false)
assert.deepEqual(workflowResponse.data.workflow, workflow)
assert.deepEqual(workflowResponse.actions[0].payload.workflow, workflow)
assert.equal(workflowResponse.actions[0].id, 'create_workflow')

// C. Malformed structured output is contained and never displayed as prose.
const malformed = normalizeAssistantResponse('{"status":"ready","workflow":')
assert.equal(malformed.type, 'error')
assert.equal(malformed.message.includes('"workflow"'), false)

// D. Provider JSON fences are parsed at the server boundary.
const fenced = normalizeAssistantResponse(`\`\`\`json\n${JSON.stringify(workflowEnvelope)}\n\`\`\``)
assert.equal(fenced.type, 'workflow_preview')
assert.deepEqual(fenced.data.workflow, workflow)

// H. Explicitly requested JSON/code remains legitimate assistant content.
const requestedJson = normalizeAssistantResponse('{"answer":42}', { objective: 'Return the answer as JSON only.' })
assert.equal(requestedJson.type, 'message')
assert.equal(requestedJson.message, '{"answer":42}')

// I. Provider errors expose neither the provider body nor diagnostic secrets.
const providerError = normalizeAssistantError({ code: 'PROVIDER_FAILED', message: '{"api_key":"secret","stack":"private"}' }, { debug: true })
assert.equal(providerError.type, 'error')
assert.equal(JSON.stringify(providerError).includes('secret'), false)
assert.equal(JSON.stringify(providerError).includes('private'), false)

// J. Legacy plain text remains renderable through the canonical fallback.
assert.deepEqual(normalizeAssistantResponse('A legacy assistant reply.'), { type: 'message', message: 'A legacy assistant reply.' })

// Known canonical workflow payloads are still validated.
const invalidCanonical = normalizeAssistantResponse({
  type: 'workflow_preview',
  message: 'ready',
  data: { workflow: { version: 1, name: 'Unsafe', steps: [] } },
})
assert.equal(invalidCanonical.type, 'error')

// F. The typed envelope survives database persistence and history reload.
const directory = mkdtempSync(join(tmpdir(), 'lancee-assistant-response-'))
try {
  const database = await openDatabase({
    databasePath: join(directory, 'assistant-response.sqlite'),
    adminEmail: 'assistant-response@example.test',
    adminName: 'Assistant Response',
    adminPasswordSalt: 'assistant-response-salt',
    adminPasswordHash: 'assistant-response-hash',
    workspaceId: 'wsp_assistant_response',
    workspaceName: 'Assistant Response',
  })
  const context = await database.getContextByEmail('assistant-response@example.test')
  const thread = await database.createAgentThread({
    workspaceId: context.workspace.id,
    userId: context.user.id,
    title: 'Workflow response',
  })
  const run = await database.createAgentRun({
    workspaceId: context.workspace.id,
    userId: context.user.id,
    threadId: thread.id,
    objective: 'Create the workflow',
    status: 'running',
  })
  await database.updateAgentRun(context.workspace.id, run.id, {
    status: 'waiting_approval',
    finalOutput: JSON.stringify(workflowEnvelope),
    assistantResponse: workflowResponse,
  }, ['running'])
  const restored = (await database.listAgentRuns(context.workspace.id, {
    userId: context.user.id,
    threadId: thread.id,
  }))[0]
  assert.equal(restored.assistantResponse.type, 'workflow_preview')
  assert.deepEqual(restored.assistantResponse.data.workflow, workflow)
} finally {
  rmSync(directory, { recursive: true, force: true })
}

const renderer = readFileSync(new URL('../src/components/dashboard/AssistantResponseRenderer.tsx', import.meta.url), 'utf8')
const frontendBoundary = readFileSync(new URL('../src/lib/assistantResponse.ts', import.meta.url), 'utf8')
const chat = readFileSync(new URL('../src/components/dashboard/WorkspaceChat.tsx', import.meta.url), 'utf8')
const server = readFileSync(new URL('../server/index.mjs', import.meta.url), 'utf8')
for (const expected of ['workflow_preview', 'confirmation', 'type === \'data\'', 'type === \'error\'']) {
  assert(renderer.includes(expected), `Missing typed assistant renderer: ${expected}`)
}
assert(frontendBoundary.includes('safeAssistantResponse'))
assert(chat.includes('run.assistantResponse'))
assert(chat.includes('run.proposedAction'))
assert(chat.includes("action.id === 'create_workflow'"))
assert(chat.includes('approveAction(index)'))
assert(server.includes('assistantResponse: envelope.response'))
assert(server.includes('proposedAction: envelope.proposedAction'))
assert(server.includes('finalOutput: envelope.response.message'))

console.log('Assistant response contract verified: normalization, workflow validation, safe fallbacks, persistence, action fidelity, and typed rendering.')
