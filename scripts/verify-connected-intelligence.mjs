import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConnectedIntelligenceService } from '../server/connected-intelligence.mjs'
import { openDatabase } from '../server/database.mjs'
import { createSignalEngine } from '../server/signal-engine.mjs'

const directory = mkdtempSync(join(tmpdir(), 'lancee-connected-intelligence-'))
let database

try {
  database = await openDatabase({
    databasePath: join(directory, 'connected-intelligence.sqlite'),
    adminEmail: 'connected@example.test',
    adminName: 'Connected Intelligence Test',
    adminPasswordSalt: 'connected-salt',
    adminPasswordHash: 'connected-hash',
    workspaceId: 'wsp_connected_a',
    workspaceName: 'Connected Workspace A',
  })
  const contextA = await database.getContextByEmail('connected@example.test')
  const createdAt = '2026-08-22T12:00:00.000Z'
  await database.query(
    `INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
    ['wsp_connected_b', 'Connected Workspace B', createdAt, createdAt],
  )
  await database.query(
    `INSERT INTO users (id, email, name, password_salt, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    ['usr_connected_b', 'connected-b@example.test', 'Connected B', 'salt', 'hash', createdAt, createdAt],
  )
  await database.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
     VALUES ($1, $2, 'owner', $3)`,
    ['wsp_connected_b', 'usr_connected_b', createdAt],
  )
  const contextB = await database.getContextByIds('usr_connected_b', 'wsp_connected_b')
  const intelligence = createConnectedIntelligenceService({
    database,
    now: () => new Date(createdAt),
  })

  const clientA = await database.createClient({
    workspaceId: contextA.workspace.id,
    name: 'Acme Client',
    email: 'acme@example.test',
  })
  const clientB = await database.createClient({
    workspaceId: contextB.workspace.id,
    name: 'Other Client',
    email: 'other@example.test',
  })
  const createProject = (context, client, name, status) => database.createProject({
    workspaceId: context.workspace.id,
    name,
    clientId: client.id,
    client: client.name,
    status,
  })
  const currentProject = await createProject(contextA, clientA, 'Current Project', 'In progress')
  const historicalProjects = await Promise.all([
    createProject(contextA, clientA, 'Historical One', 'Ready'),
    createProject(contextA, clientA, 'Historical Two', 'Ready'),
    createProject(contextA, clientA, 'Historical Three', 'Ready'),
  ])
  const otherProject = await createProject(contextB, clientB, 'Other Workspace Project', 'In progress')

  const createMeeting = async (context, project, title, startAt, minutes) => {
    const endAt = new Date(new Date(startAt).getTime() + minutes * 60_000).toISOString()
    return intelligence.createCalendarEvent(context, {
      title,
      kind: 'meeting',
      projectId: project.id,
      startAt,
      endAt,
      participants: ['participant@example.test'],
    })
  }

  const linkedMeeting = await createMeeting(
    contextA,
    currentProject,
    'Current coordination',
    '2026-08-23T09:00:00.000Z',
    360,
  )
  assert.equal(linkedMeeting.projectId, currentProject.id)
  assert.equal(linkedMeeting.projectName, currentProject.name)
  assert.equal(linkedMeeting.clientId, clientA.id)
  assert.equal(linkedMeeting.clientName, clientA.name)
  assert.equal(linkedMeeting.durationMinutes, 360)
  assert(linkedMeeting.creationEventId)

  await assert.rejects(
    intelligence.createCalendarEvent(contextA, {
      title: 'Cross-workspace meeting',
      kind: 'meeting',
      projectId: otherProject.id,
      startAt: '2026-08-23T09:00:00.000Z',
      endAt: '2026-08-23T10:00:00.000Z',
    }),
    (error) => error.code === 'CALENDAR_PROJECT_NOT_FOUND',
  )

  const createdEvents = await database.query(
    `SELECT * FROM workspace_events
     WHERE workspace_id = $1 AND event_type = 'meeting.created' AND entity_id = $2`,
    [contextA.workspace.id, linkedMeeting.id],
  )
  assert.equal(createdEvents.length, 1)
  assert.equal(createdEvents[0].project_id, currentProject.id)
  assert.equal(createdEvents[0].client_id, clientA.id)

  await createMeeting(contextA, historicalProjects[0], 'Historical one meeting', '2026-08-23T09:00:00.000Z', 60)
  await createMeeting(contextA, historicalProjects[1], 'Historical two meeting', '2026-08-24T09:00:00.000Z', 90)
  await createMeeting(contextA, historicalProjects[2], 'Historical three meeting', '2026-08-25T09:00:00.000Z', 120)
  await createMeeting(contextB, otherProject, 'Other workspace long meeting', '2026-08-23T09:00:00.000Z', 1_000)

  const insufficient = await intelligence.detectProjectMeetingLoad(contextB, otherProject.id)
  assert.equal(insufficient.status, 'insufficient_evidence')
  assert.equal(insufficient.baseline.sampleSize, 0)

  const completed = await intelligence.completeDueMeetings({
    completedAt: '2026-09-01T00:00:00.000Z',
  })
  assert.equal(completed.length, 5)
  assert.equal((await intelligence.completeDueMeetings({
    completedAt: '2026-09-01T00:00:00.000Z',
  })).length, 0)

  const completedEvents = await database.query(
    `SELECT * FROM workspace_events
     WHERE workspace_id = $1 AND event_type = 'meeting.completed' AND entity_id = $2`,
    [contextA.workspace.id, linkedMeeting.id],
  )
  assert.equal(completedEvents.length, 1)
  assert.equal(JSON.parse(completedEvents[0].payload_json).durationMinutes, 360)

  const featuresA = await intelligence.getMeetingFeatures(contextA)
  const currentAggregate = featuresA.projects.find((item) => item.projectId === currentProject.id)
  assert.deepEqual(
    {
      count: currentAggregate.meetingCount,
      total: currentAggregate.meetingMinutesTotal,
      average: currentAggregate.meetingMinutesAverage,
    },
    { count: 1, total: 360, average: 360 },
  )
  const clientAggregate = featuresA.clients.find((item) => item.clientId === clientA.id)
  assert.equal(clientAggregate.meetingCount, 4)
  assert.equal(clientAggregate.meetingMinutesTotal, 630)
  assert.equal(featuresA.meetingMinutesPerProject[currentProject.id], 360)
  assert.equal(featuresA.meetingMinutesPerClient[clientA.id], 630)
  assert.equal(featuresA.meetings.some((meeting) => meeting.projectId === otherProject.id), false)

  const abnormal = await intelligence.detectProjectMeetingLoad(
    contextA,
    currentProject.id,
    { persist: true },
  )
  assert.equal(abnormal.status, 'opportunity')
  assert.equal(abnormal.observed.meetingMinutes, 360)
  assert.equal(abnormal.baseline.sampleSize, 3)
  assert.equal(abnormal.baseline.medianMeetingMinutes, 90)
  assert.equal(abnormal.baseline.percentile75MeetingMinutes, 105)
  assert.equal(abnormal.comparison.differenceMinutes, 270)
  assert.equal(abnormal.comparison.differencePercent, 300)
  assert(abnormal.confidence > 0 && abnormal.confidence <= 1)
  assert(abnormal.evidence.length >= 4)
  for (const evidence of abnormal.evidence) {
    const rows = await database.query(
      `SELECT id FROM workspace_events WHERE workspace_id = $1 AND id = $2`,
      [contextA.workspace.id, evidence.id],
    )
    assert.equal(rows.length, 1)
  }

  const repeated = await intelligence.detectProjectMeetingLoad(
    contextA,
    currentProject.id,
    { persist: true },
  )
  assert.equal(repeated.opportunity.id, abnormal.opportunity.id)
  const opportunities = await intelligence.listOpportunities(contextA)
  assert.equal(opportunities.length, 1)
  assert.equal(opportunities[0].projectId, currentProject.id)
  assert.equal((await intelligence.listOpportunities(contextB)).length, 0)

  const persistedCalendar = await intelligence.listCalendarEvents(contextA)
  const persistedLink = persistedCalendar.find((event) => event.id === linkedMeeting.id)
  assert.equal(persistedLink.projectId, currentProject.id)
  assert.equal(persistedLink.clientId, clientA.id)
  assert(persistedLink.completionEventId)

  const signalEngine = createSignalEngine({ database })
  const signalResult = await signalEngine.processWorkspaceEvent(linkedMeeting.creationEventId, contextA)
  assert.equal(signalResult.classification, 'activity_only')

  console.log('Connected Intelligence verified: calendar persistence and tenant-scoped relationships, canonical meeting events, idempotent completion, deterministic duration and aggregates, evidence-backed meeting-load detection, opportunity idempotence, cross-workspace isolation, and Signal Engine compatibility.')
} finally {
  await database?.close()
  rmSync(directory, { recursive: true, force: true })
}
