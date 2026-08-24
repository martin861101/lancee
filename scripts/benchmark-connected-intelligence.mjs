import { createConnectedIntelligenceService } from '../server/connected-intelligence.mjs'
import {
  FIXTURE_DATASET,
  FIXTURE_VERSION,
  findFixtureWorkspace,
  fixtureContext,
  fixtureCounts,
  getFixtureOwner,
  loadFixture,
  openFixtureDatabase,
} from './connected-intelligence-fixture.mjs'

const { fixture } = await loadFixture()
const expectedCounts = fixtureCounts(fixture)
const database = await openFixtureDatabase()
let failed = false

const pass = (value) => value ? 'PASS' : 'FAIL'
const keyFor = (detector, ref) => `${detector}:${ref}`

try {
  const owner = await getFixtureOwner(database)
  const marker = await findFixtureWorkspace(database, owner.id)
  if (!marker) throw new Error('The marked Connected Intelligence fixture workspace was not found. Run npm run seed:ci first.')
  const workspaceId = marker.workspace_id
  const context = fixtureContext(workspaceId, owner)
  const intelligence = createConnectedIntelligenceService({ database })
  const refRows = await database.query(
    `SELECT record_type, fixture_ref, record_id FROM workspace_fixture_refs
     WHERE workspace_id = $1 AND dataset = $2`,
    [workspaceId, FIXTURE_DATASET],
  )
  const idByRef = new Map(refRows.map((row) => [row.fixture_ref, row.record_id]))
  const refByTypeAndId = new Map(refRows.map((row) => [`${row.record_type}:${row.record_id}`, row.fixture_ref]))

  const detectorResults = []
  for (const project of fixture.projects) {
    detectorResults.push(await intelligence.detectProjectMeetingLoad(
      context,
      idByRef.get(project.ref),
      { persist: true, completeDue: false },
    ))
  }
  for (const client of fixture.clients) {
    detectorResults.push(await intelligence.detectClientAttentionLoad(
      context,
      idByRef.get(client.ref),
      { persist: true, completeDue: false },
    ))
  }

  const opportunities = await database.query(
    `SELECT * FROM connected_opportunities WHERE workspace_id = $1 AND status = 'active'`,
    [workspaceId],
  )
  const expectedPositive = new Set(fixture.expectedOpportunities
    .filter((item) => item.expected)
    .map((item) => keyFor(item.detector, item.subjectRef)))
  const expectedNegative = new Set(fixture.expectedOpportunities
    .filter((item) => !item.expected)
    .map((item) => keyFor(item.detector, item.subjectRef)))
  const actualPositive = new Set(opportunities.map((opportunity) => {
    const recordType = opportunity.subject_type === 'project' ? 'project' : 'client'
    return keyFor(opportunity.detector_key, refByTypeAndId.get(`${recordType}:${opportunity.subject_id}`))
  }))
  const truePositives = [...actualPositive].filter((item) => expectedPositive.has(item))
  const falsePositives = [...actualPositive].filter((item) => !expectedPositive.has(item))
  const falseNegatives = [...expectedPositive].filter((item) => !actualPositive.has(item))
  const unexpectedNormalFailures = detectorResults.filter((result) => {
    const recordType = result.subjectType === 'project' ? 'project' : 'client'
    const subjectRef = refByTypeAndId.get(`${recordType}:${result.subjectId}`)
    return expectedNegative.has(keyFor(result.detector, subjectRef)) && result.status === 'opportunity'
  })

  const actualCounts = {}
  const countTables = {
    clients: 'clients', people: 'connected_people', projects: 'projects', quotes: 'quotes',
    invoices: 'invoices', payments: 'workspace_payments', timeEntries: 'time_entries',
    approvals: 'project_approval_records', communications: 'communication_messages',
    meetings: 'calendar_events', revisions: 'project_change_records', tasks: 'project_tasks',
  }
  for (const [key, table] of Object.entries(countTables)) {
    const rows = await database.query(`SELECT COUNT(*) AS count FROM ${table} WHERE workspace_id = $1`, [workspaceId])
    actualCounts[key] = Number(rows[0].count)
  }
  const countsPass = Object.keys(expectedCounts).every((key) => actualCounts[key] === expectedCounts[key])

  let evidenceIntegrity = true
  for (const opportunity of opportunities) {
    for (const evidence of JSON.parse(opportunity.evidence_json || '[]')) {
      const rows = await database.query(
        `SELECT id FROM workspace_events WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, evidence.id],
      )
      if (rows.length !== 1) evidenceIntegrity = false
    }
  }
  const duplicateRows = await database.query(
    `SELECT detector_key, subject_type, subject_id, COUNT(*) AS count
     FROM connected_opportunities WHERE workspace_id = $1
     GROUP BY detector_key, subject_type, subject_id HAVING COUNT(*) > 1`,
    [workspaceId],
  )
  evidenceIntegrity = evidenceIntegrity && duplicateRows.length === 0

  const identityRows = await database.query(
    `SELECT DISTINCT connected_people.id, connected_people.canonical_email
     FROM connected_people
     JOIN communication_messages
       ON communication_messages.workspace_id = connected_people.workspace_id
      AND communication_messages.person_ids_json LIKE '%' || connected_people.id || '%'
     WHERE connected_people.workspace_id = $1`,
    [workspaceId],
  )
  const meetingParticipants = await database.query(
    `SELECT participant_refs_json FROM workspace_events
     WHERE workspace_id = $1 AND event_type = 'meeting.created'`,
    [workspaceId],
  )
  const meetingPersonIds = new Set(meetingParticipants.flatMap((row) => JSON.parse(row.participant_refs_json || '[]')))
  const sharedPersonIdentity = identityRows.length === fixture.people.length
    && identityRows.every((row) => meetingPersonIds.has(row.id))

  const eventCounts = await database.query(
    `SELECT event_type, COUNT(*) AS count FROM workspace_events
     WHERE workspace_id = $1 AND event_type IN (
       'meeting.completed', 'communication.received', 'communication.sent'
     ) GROUP BY event_type`,
    [workspaceId],
  )
  const events = new Map(eventCounts.map((row) => [row.event_type, Number(row.count)]))
  const historical = await database.query(
    `SELECT MIN(occurred_at) AS first_at, MAX(occurred_at) AS last_at
     FROM workspace_events WHERE workspace_id = $1`,
    [workspaceId],
  )
  const historicalEvents = historical[0]?.first_at?.startsWith('2024-')
    && historical[0]?.last_at?.startsWith('2025-')
  const canonicalEvents = events.get('meeting.completed') === fixture.meetings.length
    && (events.get('communication.received') || 0) + (events.get('communication.sent') || 0) === fixture.communications.length

  const sideEffects = await Promise.all([
    database.query('SELECT workspace_id FROM mail_accounts WHERE workspace_id = $1', [workspaceId]),
    database.query('SELECT id FROM payment_links WHERE workspace_id = $1', [workspaceId]),
    database.query('SELECT id FROM integration_executions WHERE workspace_id = $1', [workspaceId]),
    database.query('SELECT id FROM automation_runs WHERE workspace_id = $1', [workspaceId]),
    database.query('SELECT id FROM workspace_notifications WHERE workspace_id = $1', [workspaceId]),
  ])
  const sideEffectFirewall = sideEffects.every((rows) => rows.length === 0)
  const markerMembership = await database.query(
    `SELECT workspace_fixture_markers.workspace_id
     FROM workspace_fixture_markers
     JOIN workspace_members
       ON workspace_members.workspace_id = workspace_fixture_markers.workspace_id
      AND workspace_members.user_id = workspace_fixture_markers.owner_user_id
      AND workspace_members.role = 'owner'
     WHERE workspace_fixture_markers.workspace_id = $1
       AND workspace_fixture_markers.dataset = $2
       AND workspace_fixture_markers.dataset_version = $3`,
    [workspaceId, FIXTURE_DATASET, FIXTURE_VERSION],
  )
  const workspaceIsolation = markerMembership.length === 1
    && refRows.length === Object.values(expectedCounts).reduce((sum, count) => sum + count, 0)

  const detectorPass = (detector) => !falsePositives.some((item) => item.startsWith(`${detector}:`))
    && !falseNegatives.some((item) => item.startsWith(`${detector}:`))
    && !unexpectedNormalFailures.some((result) => result.detector === detector)
  const projectDetectorPass = detectorPass('project_meeting_load')
  const clientDetectorPass = detectorPass('client_attention_load')

  console.log('CONNECTED INTELLIGENCE BENCHMARK')
  console.log(`\nDataset: ${FIXTURE_DATASET}.v${FIXTURE_VERSION}`)
  console.log(`Workspace: ${workspaceId}`)
  console.log('\nRecords')
  for (const key of ['people', 'clients', 'projects', 'meetings', 'communications', 'timeEntries', 'invoices', 'payments']) {
    console.log(`${`${key}:`.padEnd(18)}${actualCounts[key]} / ${expectedCounts[key]}`)
  }
  console.log(`Record integrity:   ${pass(countsPass)}`)
  console.log('\nIntelligence')
  console.log(`Expected opportunities: ${expectedPositive.size}`)
  console.log(`Detected opportunities: ${actualPositive.size}`)
  console.log(`True positives:          ${truePositives.length}`)
  console.log(`False positives:         ${falsePositives.length}`)
  console.log(`False negatives:         ${falseNegatives.length}`)
  if (falsePositives.length) console.log(`False-positive subjects: ${falsePositives.join(', ')}`)
  if (falseNegatives.length) console.log(`False-negative subjects: ${falseNegatives.join(', ')}`)
  console.log('\nDetectors')
  console.log(`project_meeting_load     ${pass(projectDetectorPass)}`)
  console.log(`client_attention_load    ${pass(clientDetectorPass)}`)
  console.log(`Evidence integrity       ${pass(evidenceIntegrity)}`)
  console.log(`Workspace isolation      ${pass(workspaceIsolation)}`)
  console.log(`Shared Person identity   ${pass(sharedPersonIdentity)}`)
  console.log(`Canonical event counts   ${pass(canonicalEvents)}`)
  console.log(`Historical timestamps    ${pass(historicalEvents)}`)
  console.log(`Side-effect firewall     ${pass(sideEffectFirewall)}`)

  failed = !countsPass || !projectDetectorPass || !clientDetectorPass || !evidenceIntegrity
    || !workspaceIsolation || !sharedPersonIdentity || !canonicalEvents
    || !historicalEvents || !sideEffectFirewall
} finally {
  await database.close()
}

if (failed) process.exitCode = 1
