import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConnectedIntelligenceService } from '../server/connected-intelligence.mjs'
import { openDatabase } from '../server/database.mjs'
import { createLanceeMcpRuntime } from '../server/lancee-mcp.mjs'

const directory = mkdtempSync(join(tmpdir(), 'lancee-connected-inspections-'))
let database

try {
  const now = '2026-08-24T12:00:00.000Z'
  database = await openDatabase({
    databasePath: join(directory, 'connected-inspections.sqlite'),
    adminEmail: 'inspection-a@example.test',
    adminName: 'Inspection A',
    adminPasswordSalt: 'salt-a',
    adminPasswordHash: 'hash-a',
    workspaceId: 'wsp_inspection_a',
    workspaceName: 'Inspection Workspace A',
  })
  await database.query(
    'INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $3)',
    ['wsp_inspection_b', 'Inspection Workspace B', now],
  )
  await database.query(
    `INSERT INTO users (id, email, name, password_salt, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)`,
    ['usr_inspection_b', 'inspection-b@example.test', 'Inspection B', 'salt-b', 'hash-b', now],
  )
  await database.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
     VALUES ($1, $2, 'owner', $3)`,
    ['wsp_inspection_b', 'usr_inspection_b', now],
  )
  const contextA = await database.getContextByEmail('inspection-a@example.test')
  const contextB = await database.getContextByIds('usr_inspection_b', 'wsp_inspection_b')
  const intelligence = createConnectedIntelligenceService({
    database,
    now: () => new Date(now),
    logger: { warn() {} },
  })

  assert.equal((await intelligence.getIntelligenceSummary(contextA)).status, 'insufficient_activity')
  assert.equal((await intelligence.getIntelligenceSummary(contextB)).status, 'insufficient_activity')

  const client = await database.createClient({
    workspaceId: contextA.workspace.id,
    name: 'Inspection Client',
    email: 'inspection-client@example.test',
  })
  const createProject = (name, status) => database.createProject({
    workspaceId: contextA.workspace.id,
    clientId: client.id,
    client: client.name,
    name,
    status,
  })
  const currentProject = await createProject('Current load', 'In progress')
  const historicalProjects = await Promise.all([
    createProject('Historical 1', 'Ready'),
    createProject('Historical 2', 'Ready'),
    createProject('Historical 3', 'Ready'),
    createProject('Historical 4', 'Ready'),
  ])
  const meetingMinutes = [300, 100, 100, 100, 100]
  for (const [index, project] of [currentProject, ...historicalProjects].entries()) {
    const startAt = `2026-08-${String(10 + index).padStart(2, '0')}T09:00:00.000Z`
    await intelligence.createCalendarEvent(contextA, {
      title: `Inspection meeting ${index + 1}`,
      kind: 'meeting',
      projectId: project.id,
      startAt,
      endAt: new Date(new Date(startAt).getTime() + meetingMinutes[index] * 60_000).toISOString(),
    })
  }
  await intelligence.completeDueMeetings({ completedAt: '2026-08-24T12:00:00.000Z' })

  const opportunities = await intelligence.listOpportunities(contextA)
  assert.equal(opportunities.length, 1)
  assert.equal(opportunities[0].projectId, currentProject.id)
  const linkedRows = await database.query(
    `SELECT * FROM connected_inspections
     WHERE workspace_id = $1 AND related_opportunity_id = $2`,
    [contextA.workspace.id, opportunities[0].id],
  )
  assert(linkedRows.length >= 1)
  assert(linkedRows.some((row) => row.status === 'opportunity_created'))

  const repeated = await intelligence.detectProjectMeetingLoad(contextA, currentProject.id, { persist: true })
  assert.equal(repeated.opportunity.id, opportunities[0].id)
  assert.equal((await intelligence.listOpportunities(contextA)).length, 1)

  const normal = await intelligence.detectProjectMeetingLoad(contextA, historicalProjects[0].id, { persist: true })
  assert.equal(normal.status, 'normal')
  const normalInspection = (await database.query(
    `SELECT * FROM connected_inspections
     WHERE workspace_id = $1 AND project_id = $2
     ORDER BY started_at DESC LIMIT 1`,
    [contextA.workspace.id, historicalProjects[0].id],
  ))[0]
  assert.equal(normalInspection.status, 'all_clear')
  assert.equal(normalInspection.related_opportunity_id, null)
  assert.equal((await database.query(
    `SELECT COUNT(*) AS count FROM connected_opportunities
     WHERE workspace_id = $1 AND project_id = $2`,
    [contextA.workspace.id, historicalProjects[0].id],
  ))[0].count, 0)

  const summaryA = await intelligence.getIntelligenceSummary(contextA)
  assert.equal(summaryA.status, 'attention_needed')
  assert.equal(summaryA.findings, 1)
  assert(summaryA.meetingsInspected >= 5)

  const inspectionB = await intelligence.startInspection(contextB, {
    inspectionType: 'mail',
    sourceType: 'mail',
    summary: 'Reviewed recent communication.',
  })
  await intelligence.completeInspection(contextB, inspectionB.id, {
    status: 'all_clear',
    recordsInspected: 5,
    summary: 'Reviewed recent communication; nothing unusual needs attention.',
    metadata: { messages: 5, threads: 2 },
  })
  const summaryB = await intelligence.getIntelligenceSummary(contextB)
  assert.equal(summaryB.status, 'all_clear')
  assert.equal(summaryB.findings, 0)
  assert.equal(summaryB.messagesInspected, 5)

  const failed = await intelligence.startInspection(contextB, {
    inspectionType: 'project',
    sourceType: 'calendar',
    summary: 'Compared project activity.',
  })
  await intelligence.failInspection(contextB, failed.id, new Error('Expected test failure.'))
  assert.equal((await intelligence.getActivity(contextB, failed.id)).status, 'failed')

  const activityA = await intelligence.listActivity(contextA, { limit: 100, offset: 0 })
  const activityB = await intelligence.listActivity(contextB, { limit: 100, offset: 0 })
  assert(activityA.activity.length > 0)
  assert.equal(activityA.activity.some((item) => item.id === inspectionB.id), false)
  assert.equal(activityB.activity.some((item) => item.id === inspectionB.id), true)
  assert.equal(await intelligence.getActivity(contextB, activityA.activity[0].id), null)
  assert.deepEqual(
    activityB.activity.find((item) => item.id === inspectionB.id).counts,
    { messages: 5, threads: 2 },
  )

  const evidence = await intelligence.getOpportunityEvidence(contextA, opportunities[0].id)
  assert(evidence.evidence.length >= 4)
  assert(evidence.evidence.every((item) => !Object.hasOwn(item, 'payload')))
  assert.equal(await intelligence.getOpportunityEvidence(contextB, opportunities[0].id), null)

  const mcp = createLanceeMcpRuntime({ database, connectedIntelligence: intelligence })
  const toolNames = new Set(mcp.listTools().map((tool) => tool.name))
  for (const name of [
    'get_connected_intelligence_summary',
    'list_connected_opportunities',
    'list_connected_intelligence_activity',
    'get_connected_intelligence_activity',
    'get_connected_opportunity_evidence',
  ]) assert(toolNames.has(name), `${name} should be exposed through Lancee MCP.`)
  const mcpSummary = await mcp.invoke('get_connected_intelligence_summary', {}, contextA)
  assert.equal(mcpSummary.summary.status, 'attention_needed')
  assert.equal(mcpSummary.summary.findings, 1)
  const normalizedSummary = mcp.normalizeResult('get_connected_intelligence_summary', mcpSummary)
  assert.equal(normalizedSummary.data.summary.status, 'attention_needed')
  const normalizedActivity = mcp.normalizeResult(
    'list_connected_intelligence_activity',
    await mcp.invoke('list_connected_intelligence_activity', { limit: 10, offset: 0 }, contextA),
  )
  assert(normalizedActivity.data.results.length > 0)

  const indexSource = readFileSync(new URL('../server/index.mjs', import.meta.url), 'utf8')
  const hermesSource = readFileSync(new URL('../server/agents/hermes-agent-provider.mjs', import.meta.url), 'utf8')
  assert.match(indexSource, /Connected Intelligence is Lancee's current intelligence product/)
  assert.match(indexSource, /insufficient_activity means there is not enough inspected activity/)
  assert.match(hermesSource, /Connected Intelligence is Lancee’s current intelligence product/)
  assert.match(hermesSource, /Legacy structured-decision tools remain available only for explicit questions/)
  assert.doesNotMatch(indexSource, /You can use Lancee's local workspace tools[^\n]+Decision Intelligence/)

  console.log('Connected inspections verified: real all-clear and finding lifecycles, opportunity linking and deduplication, insufficient-activity distinction, workspace isolation, semantic activity, evidence resolution, MCP capabilities, and Connected Intelligence AI contract.')
} finally {
  await database?.close()
  rmSync(directory, { recursive: true, force: true })
}
