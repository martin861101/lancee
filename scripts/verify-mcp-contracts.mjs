import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/database.mjs'
import { createLanceeMcpRuntime } from '../server/lancee-mcp.mjs'
import { createLanceeMcpProtocolServer } from '../server/lancee-mcp-protocol.mjs'

const directory = mkdtempSync(join(tmpdir(), 'lancee-mcp-contracts-'))
let database

try {
  database = await openDatabase({
    databasePath: join(directory, 'contracts.sqlite'),
    adminEmail: 'contracts@example.test',
    adminName: 'MCP Contract Test',
    adminPasswordSalt: 'contracts-salt',
    adminPasswordHash: 'contracts-hash',
    workspaceId: 'wsp_contracts',
    workspaceName: 'MCP Contract Workspace',
  })
  const context = await database.getContextByEmail('contracts@example.test')
  const auditEvents = []
  const runtime = createLanceeMcpRuntime({
    database,
    env: { NODE_ENV: 'test' },
    coreToolIds: ['workspace.summary'],
    executeAutomationRun: async () => {},
    audit: async (event) => auditEvents.push(event),
  })
  const server = createLanceeMcpProtocolServer({ runtime })

  const tools = runtime.listTools()
  assert.equal(tools.length, 42)
  for (const tool of tools) {
    assert.deepEqual(tool.outputSchema.required, ['success', 'ok', 'data', 'error'])
  }

  let requestId = 1
  async function call(name, args, invocationContext = context) {
    const response = await server.handleMessage({
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: { name, arguments: args },
    }, invocationContext)
    assert.equal(response.error, undefined)
    return response.result
  }

  const createdFile = await call('create_file', {
    name: 'wine-chapters.txt',
    content: 'Chapter one',
  })
  assert.equal(createdFile.structuredContent.ok, true)
  assert.equal(createdFile.structuredContent.data.resource.type, 'file')
  const fileId = createdFile.structuredContent.data.resource.id
  assert.match(fileId, /^doc_[a-f0-9]{16}$/)
  assert.equal(createdFile.structuredContent.data.resource.body, undefined)

  const duplicateFile = await call('create_file', {
    name: 'wine-chapters.txt',
    content: 'Chapter two',
  })
  const duplicateFileId = duplicateFile.structuredContent.data.resource.id
  assert.notEqual(duplicateFileId, fileId)

  const searched = await call('search_files', { query: 'wine-chapters' })
  const fileResults = searched.structuredContent.data.results
  assert.equal(searched.structuredContent.data.files, undefined)
  assert.equal(fileResults.length, 2)
  assert.deepEqual(new Set(fileResults.map((file) => file.id)), new Set([fileId, duplicateFileId]))
  assert(fileResults.every((file) => file.type === 'file' && file.name === 'wine-chapters.txt'))

  const read = await call('read_file', { file_id: fileId })
  assert.equal(read.structuredContent.data.resource.id, fileId)
  assert.equal(read.structuredContent.data.content, 'Chapter one')
  const duplicateRead = await call('read_file', { file_id: duplicateFileId })
  assert.equal(duplicateRead.structuredContent.data.resource.id, duplicateFileId)
  assert.equal(duplicateRead.structuredContent.data.content, 'Chapter two')

  const metadata = await call('get_file_metadata', { file_id: fileId })
  assert.equal(metadata.structuredContent.data.resource.id, fileId)

  const artifacts = await call('list_artifacts', {})
  assert.equal(artifacts.structuredContent.data.artifacts, undefined)
  assert(artifacts.structuredContent.data.results.every((item) => item.id && item.type === 'artifact'))

  const client = await call('create_client', { name: 'Contract Client' })
  const clientId = client.structuredContent.data.resource.id
  assert.equal(client.structuredContent.data.client.id, clientId)
  const clientList = await call('query_dashboard', { resource: 'clients' })
  assert.equal(clientList.structuredContent.data.rows, undefined)
  assert(clientList.structuredContent.data.results.some((item) => item.id === clientId))

  const project = await call('create_project', { name: 'Contract Project', client_id: clientId })
  const projectId = project.structuredContent.data.resource.id
  const projectList = await call('query_dashboard', { resource: 'projects' })
  assert(projectList.structuredContent.data.results.some((item) => item.id === projectId))
  const changed = await call('set_project_status', { project_id: projectId, status: 'Ready' })
  assert.equal(changed.structuredContent.data.resource.id, projectId)
  assert.equal(changed.structuredContent.data.resource.type, 'project')

  const invoiceList = await call('query_dashboard', { resource: 'invoices' })
  assert(Array.isArray(invoiceList.structuredContent.data.results))

  const createdWorkflow = await call('create_workflow', {
    name: 'Contract Workflow',
    description: 'Workflow contract regression test.',
    tools: ['workspace.summary'],
  })
  const workflowId = createdWorkflow.structuredContent.data.resource.id
  const workflowList = await call('search_workflows', { query: 'Contract Workflow' })
  assert.equal(workflowList.structuredContent.data.workflows, undefined)
  assert(workflowList.structuredContent.data.results.some((item) => item.id === workflowId))
  const workflowStatus = await call('get_workflow_status', {
    workflow_id: workflowId,
    include_runs: false,
  })
  assert.equal(workflowStatus.structuredContent.data.resource.id, workflowId)

  const jobs = await call('list_jobs', {})
  assert(Array.isArray(jobs.structuredContent.data.results))

  const foreignRead = await call('read_file', { file_id: fileId }, {
    ...context,
    workspace: { ...context.workspace, id: 'wsp_other' },
  })
  assert.equal(foreignRead.isError, true)
  assert.equal(foreignRead.structuredContent.ok, false)
  assert.equal(foreignRead.structuredContent.data, null)
  assert.equal(foreignRead.structuredContent.error.code, 'MCP_NOT_FOUND')

  const failed = await call('read_file', { file_id: 'doc_0000000000000000' })
  assert.equal(failed.isError, true)
  assert.equal(failed.structuredContent.ok, false)
  assert.equal(failed.structuredContent.error.code, 'MCP_NOT_FOUND')
  assert.match(failed.structuredContent.error.message, /not found/i)

  const completed = auditEvents.filter((event) => event.status === 'completed')
  assert(completed.some((event) => event.capabilityId === 'file.search' && event.canonicalIdPresent === true))
  assert(completed.every((event) => event.schemaValidationPassed === true))

  console.log('MCP result contracts verified: canonical list/single resources, Hermes-compatible references, create/use and list/select/mutate chains, normalized errors, tenant isolation, output schemas, and audit diagnostics.')
} finally {
  await database?.close()
  rmSync(directory, { recursive: true, force: true })
}
