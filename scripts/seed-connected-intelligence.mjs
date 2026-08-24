import { createConnectedIntelligenceService } from '../server/connected-intelligence.mjs'
import { recordWorkspaceEvent } from '../server/workspace-events.mjs'
import {
  FIXTURE_DATASET,
  FIXTURE_PURPOSE,
  FIXTURE_VERSION,
  FIXTURE_WORKSPACE_NAME,
  findFixtureWorkspace,
  fixtureContext,
  fixtureCounts,
  getFixtureOwner,
  loadFixture,
  openFixtureDatabase,
  saveFixtureRef,
  stableFixtureId,
} from './connected-intelligence-fixture.mjs'

const options = new Set(process.argv.slice(2))
const dryRun = options.has('--dry-run')
const reset = options.has('--reset')
const unknown = [...options].filter((option) => !['--dry-run', '--reset'].includes(option))
if (unknown.length || (dryRun && reset)) {
  throw new Error('Usage: npm run seed:ci -- [--dry-run | --reset]')
}

const { fixture, validation } = await loadFixture()
const intended = fixtureCounts(fixture)

function printCounts(counts) {
  const labels = {
    clients: 'Clients', people: 'People', projects: 'Projects', quotes: 'Quotes',
    invoices: 'Invoices', payments: 'Payments', timeEntries: 'Time entries',
    approvals: 'Approvals', communications: 'Communications', meetings: 'Meetings',
    revisions: 'Revisions', tasks: 'Tasks',
  }
  for (const [key, label] of Object.entries(labels)) {
    console.log(`${`${label}:`.padEnd(18)}${counts[key]}`)
  }
}

console.log(`Connected Intelligence Fixture v${fixture.metadata.version}`)
console.log(`Dataset: ${fixture.metadata.dataset}`)
printCounts(intended)
console.log(`Warnings: ${validation.warnings.length}`)
for (const warning of validation.warnings) console.log(`- ${warning.code} (${warning.count}): ${warning.message}`)
if (dryRun) {
  console.log('\nNo changes made.')
  process.exit(0)
}

const database = await openFixtureDatabase()
try {
  const owner = await getFixtureOwner(database)
  const existing = await findFixtureWorkspace(database, owner.id)
  if (existing && !reset) {
    throw new Error('The matching synthetic workspace already exists. Use npm run seed:ci -- --reset to rebuild it.')
  }
  if (reset) {
    if (!existing) throw new Error('No matching marked synthetic workspace exists; reset aborted.')
    if (
      existing.purpose !== FIXTURE_PURPOSE
      || existing.dataset !== FIXTURE_DATASET
      || Number(existing.dataset_version) !== FIXTURE_VERSION
      || existing.owner_user_id !== owner.id
      || existing.source_sha256 !== fixture.metadata.sourceSha256
    ) {
      throw new Error('Synthetic marker verification failed; reset aborted.')
    }
    const memberships = await database.query(
      `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [existing.workspace_id, owner.id],
    )
    if (memberships[0]?.role !== 'owner') throw new Error('Fixture owner membership verification failed; reset aborted.')
    await database.transaction(async () => {
      const markers = await database.query(
        `SELECT workspace_id FROM workspace_fixture_markers
         WHERE workspace_id = $1 AND purpose = $2 AND dataset = $3
           AND dataset_version = $4 AND owner_user_id = $5`,
        [existing.workspace_id, FIXTURE_PURPOSE, FIXTURE_DATASET, FIXTURE_VERSION, owner.id],
      )
      if (markers.length !== 1) throw new Error('Fixture marker changed during reset; reset aborted.')
      await database.query('DELETE FROM workspaces WHERE id = $1', [existing.workspace_id])
    })
    console.log(`\nReset verified and removed fixture workspace ${existing.workspace_id}.`)
  }

  const workspaceId = stableFixtureId('wsp', owner.id, FIXTURE_PURPOSE, FIXTURE_DATASET, FIXTURE_VERSION)
  const collision = await database.query('SELECT id FROM workspaces WHERE id = $1', [workspaceId])
  if (collision[0]) throw new Error('Deterministic fixture workspace ID already exists without the expected marker; aborting.')
  const markerCreatedAt = fixture.metadata.sourceDateRange.from + 'T00:00:00.000Z'
  await database.transaction(async () => {
    await database.query(
      `INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $3)`,
      [workspaceId, FIXTURE_WORKSPACE_NAME, markerCreatedAt],
    )
    await database.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
       VALUES ($1, $2, 'owner', $3)`,
      [workspaceId, owner.id, markerCreatedAt],
    )
    await database.query(
      `INSERT INTO workspace_settings (workspace_id, name, timezone, updated_at)
       VALUES ($1, $2, 'UTC', $3)`,
      [workspaceId, FIXTURE_WORKSPACE_NAME, markerCreatedAt],
    )
    await database.query(
      `INSERT INTO workspace_fixture_markers (
         workspace_id, purpose, dataset, dataset_version, source_sha256,
         owner_user_id, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [workspaceId, FIXTURE_PURPOSE, FIXTURE_DATASET, FIXTURE_VERSION, fixture.metadata.sourceSha256, owner.id, markerCreatedAt],
    )
  })

  const context = fixtureContext(workspaceId, owner)
  const intelligence = createConnectedIntelligenceService({ database })
  const ids = new Map()
  const link = async (type, ref, id, occurredAt = markerCreatedAt) => {
    ids.set(ref, id)
    await saveFixtureRef(database, workspaceId, type, ref, id, occurredAt)
  }
  const event = (input) => recordWorkspaceEvent({
    database,
    context,
    sourceChannel: 'fixture',
    sourceIdentifier: input.sourceIdentifier,
    payload: { fixture: true, dataset: FIXTURE_DATASET, ...input.payload },
    ...input,
  })

  for (const source of fixture.clients) {
    const client = await database.createClient({
      workspaceId,
      name: source.name,
      email: source.email,
      company: source.company,
      notes: `Fixture ${source.sourceId}; industry: ${source.industry}`,
    })
    await database.query(
      `UPDATE clients SET created_at = $1, updated_at = $1 WHERE workspace_id = $2 AND id = $3`,
      [source.createdAt, workspaceId, client.id],
    )
    await link('client', source.ref, client.id, source.createdAt)
    await event({
      eventType: 'client.created', entityType: 'client', entityId: client.id,
      clientId: client.id, occurredAt: source.createdAt, sourceIdentifier: source.ref,
      payload: { sourceId: source.sourceId, sourceCompany: source.sourceCompany },
    })
  }

  for (const source of fixture.projects) {
    const clientId = ids.get(source.clientRef)
    const client = fixture.clients.find((item) => item.ref === source.clientRef)
    const project = await database.createProject({
      workspaceId,
      name: source.name,
      clientId,
      client: client.name,
      clientEmail: client.email,
      scope: source.scope,
      due: source.due || 'Set date',
      status: source.status,
      progress: source.progress,
      idempotencyKey: `fixture:${source.ref}`,
    })
    await database.query(
      `UPDATE projects SET started_at = $1, ended_at = $2, quoted_amount_minor = $3,
         quoted_currency = NULL, provenance_json = $4, created_at = $1, updated_at = $5
       WHERE workspace_id = $6 AND id = $7`,
      [source.startedAt, source.endedAt, source.quotedAmountMinor, JSON.stringify({ source: 'fixture/import', sourceId: source.sourceId }), source.endedAt || source.startedAt, workspaceId, project.id],
    )
    await link('project', source.ref, project.id, source.startedAt)
    await event({
      eventType: 'project.created', entityType: 'project', entityId: project.id,
      clientId, projectId: project.id, occurredAt: source.startedAt, sourceIdentifier: source.ref,
      payload: { sourceId: source.sourceId, type: source.type, status: source.sourceStatus },
    })
    if (source.endedAt) {
      await event({
        eventType: 'project.completed', entityType: 'project', entityId: project.id,
        clientId, projectId: project.id, occurredAt: source.endedAt,
        sourceIdentifier: `${source.ref}:completed`, payload: { sourceStatus: source.sourceStatus },
      })
    }
  }

  for (const source of fixture.quotes) {
    const id = stableFixtureId('quo', workspaceId, source.ref)
    const clientId = ids.get(source.clientRef)
    const projectId = source.projectRef ? ids.get(source.projectRef) : null
    await database.query(
      `INSERT INTO quotes (
         id, workspace_id, client_id, project_id, quote_number, amount_minor,
         currency, scope, status, issued_at, provenance_json, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9, $10, $9, $9)`,
      [id, workspaceId, clientId, projectId, source.sourceId, source.amountMinor, source.scope, source.status, source.issuedAt, JSON.stringify({ source: 'fixture/import', sourceRow: source.sourceRow })],
    )
    await link('quote', source.ref, id, source.issuedAt)
    await event({
      eventType: 'quote.created', entityType: 'quote', entityId: id, clientId, projectId,
      occurredAt: source.issuedAt, sourceIdentifier: source.ref,
      payload: { sourceId: source.sourceId, amountMinor: source.amountMinor, currency: null, status: source.status },
    })
    await event({
      eventType: source.status === 'accepted' ? 'quote.approved' : 'quote.rejected',
      entityType: 'quote', entityId: id, clientId, projectId, occurredAt: source.issuedAt,
      sourceIdentifier: `${source.ref}:${source.status}`, payload: { sourceId: source.sourceId },
    })
  }

  for (const source of fixture.invoices) {
    const id = stableFixtureId('inv', workspaceId, source.ref)
    const clientId = ids.get(source.clientRef)
    const projectId = ids.get(source.projectRef)
    const client = fixture.clients.find((item) => item.ref === source.clientRef)
    const project = fixture.projects.find((item) => item.ref === source.projectRef)
    await database.query(
      `INSERT INTO invoices (
         id, workspace_id, invoice_number, client_name, client_email, project_name,
         description, amount_minor, currency, due_date, status, provider,
         provider_reference, created_at, updated_at, paid_at, client_id, project_id,
         issued_at, provenance_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'XXX', $9, $10, 'fixture',
         $11, $12, $12, NULL, $13, $14, $12, $15)`,
      [id, workspaceId, source.sourceId, client.name, client.email, project.name, `Fixture invoice for ${project.name}`, source.amountMinor, source.dueAt.slice(0, 10), source.status, stableFixtureId('fixture', workspaceId, source.ref), source.issuedAt, clientId, projectId, JSON.stringify({ source: 'fixture/import', currencySupplied: false })],
    )
    await link('invoice', source.ref, id, source.issuedAt)
    await event({
      eventType: 'invoice.created', entityType: 'invoice', entityId: id, clientId, projectId,
      occurredAt: source.issuedAt, sourceIdentifier: source.ref,
      payload: { sourceId: source.sourceId, amountMinor: source.amountMinor, currency: null },
    })
  }

  for (const source of fixture.payments) {
    const id = stableFixtureId('pay', workspaceId, source.ref)
    const invoiceId = ids.get(source.invoiceRef)
    const invoice = fixture.invoices.find((item) => item.ref === source.invoiceRef)
    const clientId = ids.get(invoice.clientRef)
    const projectId = ids.get(invoice.projectRef)
    await database.query(
      `INSERT INTO workspace_payments (
         id, workspace_id, invoice_id, amount_minor, currency, paid_at,
         provenance_json, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, NULL, $5, $6, $5, $5)`,
      [id, workspaceId, invoiceId, source.amountMinor, source.paidAt, JSON.stringify({ source: 'fixture/import', sourceId: source.sourceId })],
    )
    await database.query(
      `UPDATE invoices SET status = 'paid', paid_at = $1, updated_at = $1
       WHERE workspace_id = $2 AND id = $3`,
      [source.paidAt, workspaceId, invoiceId],
    )
    await link('payment', source.ref, id, source.paidAt)
    for (const eventType of ['invoice.paid', 'payment.received']) {
      await event({
        eventType, entityType: eventType.startsWith('invoice') ? 'invoice' : 'payment',
        entityId: eventType.startsWith('invoice') ? invoiceId : id, clientId, projectId,
        occurredAt: source.paidAt, sourceIdentifier: `${source.ref}:${eventType}`,
        payload: { invoiceId, amountMinor: source.amountMinor, currency: null },
      })
    }
  }

  for (const source of fixture.timeEntries) {
    const id = stableFixtureId('time', workspaceId, source.ref)
    await database.query(
      `INSERT INTO time_entries (
         id, workspace_id, project_id, client_id, user_id, entry_date,
         duration_minutes, activity, provenance_json, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
      [id, workspaceId, ids.get(source.projectRef), ids.get(source.clientRef), owner.id, source.entryDate, source.durationMinutes, source.activity, JSON.stringify({ source: 'fixture/import', sourceRow: source.sourceRow }), `${source.entryDate}T00:00:00.000Z`],
    )
    await link('time_entry', source.ref, id, `${source.entryDate}T00:00:00.000Z`)
  }

  for (const source of fixture.approvals) {
    const id = stableFixtureId('approval', workspaceId, source.ref)
    const projectId = ids.get(source.projectRef)
    const project = fixture.projects.find((item) => item.ref === source.projectRef)
    await database.query(
      `INSERT INTO project_approval_records (
         id, workspace_id, project_id, approved_at, provenance_json, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $4, $4)`,
      [id, workspaceId, projectId, source.approvedAt, JSON.stringify({ source: 'fixture/import', sourceRow: source.sourceRow })],
    )
    await link('approval', source.ref, id, source.approvedAt)
    await event({
      eventType: 'project.updated', entityType: 'project', entityId: projectId,
      clientId: ids.get(project.clientRef), projectId, occurredAt: source.approvedAt,
      sourceIdentifier: source.ref, payload: { change: 'approved' },
    })
  }

  const fixtureMailbox = 'fixture@connected-intelligence.test'
  for (const source of fixture.communications) {
    const person = fixture.people.find((item) => item.ref === source.personRef)
    const external = { name: person.displayName, address: person.email }
    const mailbox = { name: 'Fixture Workspace', address: fixtureMailbox }
    const observed = await intelligence.observeFixtureCommunication(context, {
      sourceAccountId: fixtureMailbox,
      dataset: `${FIXTURE_DATASET}.v${FIXTURE_VERSION}`,
      externalMessageId: source.ref,
      externalThreadId: source.externalThreadId,
      direction: source.direction,
      from: source.direction === 'inbound' ? [external] : [mailbox],
      to: source.direction === 'inbound' ? [mailbox] : [external],
      subject: source.subject,
      occurredAt: source.occurredAt,
      providerUid: String(source.sourceRow),
    })
    if (!observed.observed) throw new Error(`Duplicate communication ${source.ref}.`)
    await database.query(
      `UPDATE communication_messages SET created_at = occurred_at, updated_at = occurred_at
       WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, observed.relationship.messageId],
    )
    await link('communication', source.ref, observed.relationship.messageId, source.occurredAt)
  }

  for (const source of fixture.people) {
    const rows = await database.query(
      `SELECT id FROM connected_people WHERE workspace_id = $1 AND canonical_email = $2`,
      [workspaceId, source.email],
    )
    if (!rows[0]) throw new Error(`Canonical Person was not resolved for ${source.ref}.`)
    const client = fixture.clients.find((item) => item.ref === source.clientRef)
    await database.query(
      `UPDATE connected_people SET provenance_json = $1, created_at = $2, updated_at = $2
       WHERE workspace_id = $3 AND id = $4`,
      [JSON.stringify(source.provenance), client.createdAt, workspaceId, rows[0].id],
    )
    await link('person', source.ref, rows[0].id, client.createdAt)
  }

  for (const source of fixture.meetings) {
    const participants = source.participantRefs.map((ref) => fixture.people.find((item) => item.ref === ref).email)
    const calendar = await intelligence.createCalendarEvent(context, {
      title: source.title,
      kind: 'meeting',
      projectId: ids.get(source.projectRef),
      clientId: ids.get(source.clientRef),
      startAt: source.startAt,
      endAt: source.endAt,
      participants,
      source: 'fixture',
      sourceIdentifier: source.ref,
    })
    await database.query(
      `UPDATE calendar_events SET created_at = $1, updated_at = $1
       WHERE workspace_id = $2 AND id = $3`,
      [source.startAt, workspaceId, calendar.id],
    )
    await database.query(
      `UPDATE workspace_events SET occurred_at = $1, created_at = $1
       WHERE workspace_id = $2 AND id = $3`,
      [source.startAt, workspaceId, calendar.creationEventId],
    )
    await link('meeting', source.ref, calendar.id, source.startAt)
  }
  const finalMeetingEnd = fixture.meetings.map((meeting) => meeting.endAt).sort().at(-1)
  await intelligence.completeDueMeetings({ workspaceId, completedAt: finalMeetingEnd })
  await database.query(
    `UPDATE calendar_events SET completed_at = end_at, updated_at = end_at
     WHERE workspace_id = $1 AND source = 'fixture' AND status = 'completed'`,
    [workspaceId],
  )

  for (const source of fixture.revisions) {
    const id = stableFixtureId('change', workspaceId, source.ref)
    const projectId = ids.get(source.projectRef)
    const project = fixture.projects.find((item) => item.ref === source.projectRef)
    await database.query(
      `INSERT INTO project_change_records (
         id, workspace_id, project_id, occurred_at, change_count,
         provenance_json, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $4, $4)`,
      [id, workspaceId, projectId, source.occurredAt, source.changeCount, JSON.stringify({ source: 'fixture/import', sourceRow: source.sourceRow })],
    )
    await link('revision', source.ref, id, source.occurredAt)
    await event({
      eventType: 'project.updated', entityType: 'project', entityId: projectId,
      clientId: ids.get(project.clientRef), projectId, occurredAt: source.occurredAt,
      sourceIdentifier: source.ref, payload: { change: 'revision', changeCount: source.changeCount },
    })
  }

  for (const source of fixture.tasks) {
    const id = stableFixtureId('tsk', workspaceId, source.ref)
    const projectId = ids.get(source.projectRef)
    const project = fixture.projects.find((item) => item.ref === source.projectRef)
    await database.query(
      `INSERT INTO project_tasks (
         id, workspace_id, project_id, bucket_id, title, notes, completed_at,
         created_at, updated_at, due_at, provenance_json
       ) VALUES ($1, $2, $3, 'fixture', $4, '', $5, $6, $7, $8, $9)`,
      [id, workspaceId, projectId, source.title, source.completedAt, source.createdAt, source.completedAt || source.createdAt, source.dueAt, JSON.stringify({ source: 'fixture/import', sourceId: source.sourceId })],
    )
    await link('task', source.ref, id, source.createdAt)
    await event({
      eventType: 'task.created', entityType: 'task', entityId: id,
      clientId: ids.get(project.clientRef), projectId, occurredAt: source.createdAt,
      sourceIdentifier: source.ref, payload: { dueAt: source.dueAt },
    })
    if (source.completedAt) {
      await event({
        eventType: 'task.completed', entityType: 'task', entityId: id,
        clientId: ids.get(project.clientRef), projectId, occurredAt: source.completedAt,
        sourceIdentifier: `${source.ref}:completed`, payload: { dueAt: source.dueAt },
      })
    }
  }

  for (const source of fixture.projects) {
    await intelligence.detectProjectMeetingLoad(context, ids.get(source.ref), { persist: true, completeDue: false })
  }
  for (const source of fixture.clients) {
    await intelligence.detectClientAttentionLoad(context, ids.get(source.ref), { persist: true, completeDue: false })
  }

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
    if (actualCounts[key] !== intended[key]) throw new Error(`${key} count mismatch: expected ${intended[key]}, got ${actualCounts[key]}.`)
  }
  const marker = await findFixtureWorkspace(database, owner.id)
  if (marker?.workspace_id !== workspaceId) throw new Error('Synthetic marker verification failed after import.')
  const externalState = await Promise.all([
    database.query('SELECT workspace_id FROM mail_accounts WHERE workspace_id = $1', [workspaceId]),
    database.query('SELECT id FROM payment_links WHERE workspace_id = $1', [workspaceId]),
    database.query('SELECT id FROM integration_executions WHERE workspace_id = $1', [workspaceId]),
    database.query('SELECT id FROM automation_runs WHERE workspace_id = $1', [workspaceId]),
  ])
  if (externalState.some((rows) => rows.length)) throw new Error('Side-effect firewall verification failed.')

  console.log(`\nSeeded ${FIXTURE_WORKSPACE_NAME} (${workspaceId}).`)
  printCounts(actualCounts)
  console.log('Verification: PASS')
  console.log('External side-effect firewall: PASS')
} finally {
  await database.close()
}
