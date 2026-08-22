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

  const connectMail = (context, email) => database.saveMailAccount({
    workspaceId: context.workspace.id,
    connectedBy: context.user.id,
    email,
    displayName: 'Connected mailbox',
    username: email,
    provider: 'custom',
    passwordCiphertext: 'ciphertext',
    passwordIv: 'iv',
    passwordTag: 'tag',
    imapHost: 'imap.example.test',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.example.test',
    smtpPort: 465,
    smtpSecure: true,
  })
  await connectMail(contextA, 'owner@example.test')
  await connectMail(contextB, 'owner-b@example.test')

  const observe = (context, input) => intelligence.observeCommunication(context, {
    sourceAccountId: context === contextA ? 'owner@example.test' : 'owner-b@example.test',
    provider: 'custom',
    externalMessageId: input.messageId,
    externalThreadId: input.threadId || input.messageId,
    direction: input.direction || 'inbound',
    from: input.from || [{ name: 'Acme Contact', address: 'acme@example.test' }],
    to: input.to || [{ address: 'owner@example.test' }],
    cc: input.cc || [],
    subject: input.subject || 'Coordination update',
    occurredAt: input.occurredAt || '2026-09-02T09:00:00.000Z',
    folder: input.direction === 'outbound' ? null : 'INBOX',
    providerUid: input.uid || null,
  })

  const inbound = await observe(contextA, {
    messageId: '<acme-1@example.test>',
    threadId: '<acme-thread@example.test>',
    from: [{ name: 'John Smith', address: 'ACME@EXAMPLE.TEST' }],
    uid: 101,
  })
  assert.equal(inbound.observed, true)
  assert.equal(inbound.event.eventType, 'communication.received')
  assert.equal(inbound.relationship.clientId, clientA.id)
  assert.equal(inbound.relationship.projectId, null)

  const duplicateInbound = await observe(contextA, {
    messageId: '<acme-1@example.test>',
    threadId: '<acme-thread@example.test>',
    from: [{ name: 'John Smith', address: 'acme@example.test' }],
    uid: 101,
  })
  assert.equal(duplicateInbound.observed, false)
  assert.equal((await database.query(
    `SELECT id FROM workspace_events
     WHERE workspace_id = $1 AND event_type = 'communication.received' AND entity_id = $2`,
    [contextA.workspace.id, inbound.relationship.messageId],
  )).length, 1)

  const outbound = await observe(contextA, {
    messageId: '<acme-2@example.test>',
    threadId: '<acme-thread@example.test>',
    direction: 'outbound',
    from: [{ address: 'owner@example.test' }],
    to: [{ name: 'John Smith', address: 'Acme@Example.Test' }],
    occurredAt: '2026-09-02T10:00:00.000Z',
  })
  assert.equal(outbound.event.eventType, 'communication.sent')
  assert.equal((await observe(contextA, {
    messageId: '<acme-2@example.test>',
    threadId: '<acme-thread@example.test>',
    direction: 'outbound',
    from: [{ address: 'owner@example.test' }],
    to: [{ address: 'acme@example.test' }],
  })).observed, false)
  assert.equal((await database.query(
    `SELECT id FROM workspace_events
     WHERE workspace_id = $1 AND event_type = 'communication.sent' AND entity_id = $2`,
    [contextA.workspace.id, outbound.relationship.messageId],
  )).length, 1)

  const peopleA = await database.query(
    `SELECT * FROM connected_people WHERE workspace_id = $1 AND canonical_email = $2`,
    [contextA.workspace.id, 'acme@example.test'],
  )
  assert.equal(peopleA.length, 1)
  assert.equal(peopleA[0].client_id, clientA.id)

  const calendarIdentity = await intelligence.createCalendarEvent(contextA, {
    title: 'Shared contact identity',
    kind: 'meeting',
    clientId: clientA.id,
    startAt: '2027-01-10T09:00:00.000Z',
    endAt: '2027-01-10T10:00:00.000Z',
    participants: ['Acme@Example.Test'],
  })
  const calendarIdentityEvent = (await database.query(
    `SELECT participant_refs_json FROM workspace_events WHERE workspace_id = $1 AND id = $2`,
    [contextA.workspace.id, calendarIdentity.creationEventId],
  ))[0]
  assert.deepEqual(JSON.parse(calendarIdentityEvent.participant_refs_json), [peopleA[0].id])
  assert.equal((await database.query(
    `SELECT id FROM connected_people WHERE workspace_id = $1 AND canonical_email = $2`,
    [contextA.workspace.id, 'acme@example.test'],
  )).length, 1)

  const crossWorkspaceIdentity = await observe(contextB, {
    messageId: '<acme-other-workspace@example.test>',
    from: [{ address: 'Acme@Example.Test' }],
    to: [{ address: 'owner-b@example.test' }],
  })
  assert.equal(crossWorkspaceIdentity.relationship.clientId, null)
  const peopleB = await database.query(
    `SELECT * FROM connected_people WHERE workspace_id = $1 AND canonical_email = $2`,
    [contextB.workspace.id, 'acme@example.test'],
  )
  assert.equal(peopleB.length, 1)
  assert.notEqual(peopleB[0].id, peopleA[0].id)

  await database.createClient({ workspaceId: contextA.workspace.id, name: 'Ambiguous One', email: 'shared@example.test' })
  await database.createClient({ workspaceId: contextA.workspace.id, name: 'Ambiguous Two', email: 'shared@example.test' })
  const ambiguous = await observe(contextA, {
    messageId: '<ambiguous@example.test>',
    from: [{ address: 'SHARED@example.test' }],
    subject: currentProject.name,
  })
  assert.equal(ambiguous.relationship.clientId, null)
  assert.equal(ambiguous.relationship.projectId, null)

  const confirmed = await intelligence.confirmThreadProject(contextA, {
    externalMessageId: '<acme-1@example.test>',
    sourceAccountId: 'owner@example.test',
    projectId: currentProject.id,
  })
  assert.equal(confirmed.projectId, currentProject.id)
  assert.equal(confirmed.relationshipSource, 'confirmed_thread')
  await assert.rejects(
    intelligence.confirmThreadProject(contextA, {
      externalMessageId: '<acme-1@example.test>',
      sourceAccountId: 'owner@example.test',
      projectId: otherProject.id,
    }),
    (error) => error.code === 'COMMUNICATION_PROJECT_NOT_FOUND',
  )
  const inherited = await observe(contextA, {
    messageId: '<acme-3@example.test>',
    threadId: '<acme-thread@example.test>',
    from: [{ address: 'acme@example.test' }],
    occurredAt: '2026-09-03T09:00:00.000Z',
  })
  assert.equal(inherited.relationship.projectId, currentProject.id)
  assert.equal(inherited.relationship.relationshipSource, 'confirmed_thread')

  const communicationFeatures = await intelligence.getCommunicationFeatures(contextA)
  const projectCommunication = communicationFeatures.projects.find((item) => item.projectId === currentProject.id)
  assert.equal(projectCommunication.messageCount, 3)
  assert.equal(projectCommunication.inboundMessageCount, 2)
  assert.equal(projectCommunication.outboundMessageCount, 1)
  assert.equal(projectCommunication.threadCount, 1)
  assert.equal(projectCommunication.communicationDays, 2)
  assert.equal(projectCommunication.averageMessagesPerThread, 3)
  const personCommunication = communicationFeatures.people.find((item) => item.personId === peopleA[0].id)
  assert.equal(personCommunication.messageCount, 3)
  assert.equal(personCommunication.threadCount, 1)
  assert.equal(personCommunication.lastCommunicationAt, '2026-09-03T09:00:00.000Z')

  const insufficientAttention = await intelligence.detectClientAttentionLoad(contextB, clientB.id)
  assert.equal(insufficientAttention.status, 'insufficient_evidence')

  const comparisonClients = await Promise.all([
    database.createClient({ workspaceId: contextA.workspace.id, name: 'Baseline Alpha', email: 'alpha@example.test' }),
    database.createClient({ workspaceId: contextA.workspace.id, name: 'Baseline Beta', email: 'beta@example.test' }),
    database.createClient({ workspaceId: contextA.workspace.id, name: 'Baseline Gamma', email: 'gamma@example.test' }),
  ])
  for (const [index, comparisonClient] of comparisonClients.entries()) {
    await observe(contextA, {
      messageId: `<baseline-${index}@example.test>`,
      from: [{ address: comparisonClient.email }],
      occurredAt: `2026-09-0${index + 2}T08:00:00.000Z`,
    })
  }
  for (let index = 4; index <= 8; index += 1) {
    await observe(contextA, {
      messageId: `<acme-${index}@example.test>`,
      threadId: `<acme-thread-${index}@example.test>`,
      from: [{ address: 'acme@example.test' }],
      occurredAt: `2026-09-${String(index).padStart(2, '0')}T09:00:00.000Z`,
    })
  }
  const abnormalAttention = await intelligence.detectClientAttentionLoad(contextA, clientA.id, { persist: true })
  assert.equal(abnormalAttention.status, 'opportunity')
  assert.equal(abnormalAttention.baseline.sampleSize, 3)
  assert(abnormalAttention.observed.messageCount > abnormalAttention.baseline.medianMessages)
  assert(abnormalAttention.observed.meetingMinutes > 0)
  assert(abnormalAttention.comparison.attentionIndex > 0.75)
  assert(abnormalAttention.evidence.some((item) => item.eventType === 'communication'))
  assert(abnormalAttention.evidence.some((item) => item.eventType === 'meeting.completed'))
  for (const evidence of abnormalAttention.evidence) {
    assert.equal((await database.query(
      `SELECT id FROM workspace_events WHERE workspace_id = $1 AND id = $2`,
      [contextA.workspace.id, evidence.id],
    )).length, 1)
  }
  const repeatedAttention = await intelligence.detectClientAttentionLoad(contextA, clientA.id, { persist: true })
  assert.equal(repeatedAttention.opportunity.id, abnormalAttention.opportunity.id)
  const normalAttention = await intelligence.detectClientAttentionLoad(contextA, comparisonClients[0].id, { persist: true })
  assert.notEqual(normalAttention.status, 'opportunity')

  for (const [clientIndex, comparisonClient] of comparisonClients.entries()) {
    for (let index = 0; index < 10; index += 1) {
      await observe(contextA, {
        messageId: `<normalized-${clientIndex}-${index}@example.test>`,
        threadId: `<normalized-${clientIndex}-${index}@example.test>`,
        from: [{ address: comparisonClient.email }],
        occurredAt: `2026-10-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`,
      })
    }
  }
  const normalizedAttention = await intelligence.detectClientAttentionLoad(contextA, clientA.id, { persist: true })
  assert.equal(normalizedAttention.status, 'normal')
  const resolvedAttention = await database.query(
    `SELECT status FROM connected_opportunities
     WHERE workspace_id = $1 AND detector_key = 'client_attention_load' AND subject_id = $2`,
    [contextA.workspace.id, clientA.id],
  )
  assert.equal(resolvedAttention[0].status, 'resolved')

  const signalEngine = createSignalEngine({ database })
  const signalResult = await signalEngine.processWorkspaceEvent(linkedMeeting.creationEventId, contextA)
  assert.equal(signalResult.classification, 'activity_only')

  const communicationSignal = await signalEngine.processWorkspaceEvent(inbound.event.id, contextA)
  assert.equal(communicationSignal.classification, 'activity_only')

  console.log('Connected Intelligence verified: authoritative inbound/outbound Mail observations, idempotent communication events, workspace-scoped Person/Client identity, shared Calendar identity, confirmed thread/project inheritance, deterministic communication and meeting features, cross-source client attention detection, evidence provenance, opportunity deduplication/resolution, tenant isolation, Phase 1 meeting load, and Signal Engine compatibility.')
} finally {
  await database?.close()
  rmSync(directory, { recursive: true, force: true })
}
