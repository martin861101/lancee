import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FIXTURE_PURPOSE = 'connected_intelligence_test'
export const FIXTURE_DATASET = 'business-records'
export const FIXTURE_VERSION = 1
export const FIXTURE_WORKSPACE_NAME = 'Connected Intelligence Test'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
export const fixturePath = resolve(
  projectDirectory,
  'test-data/connected-intelligence/business-records.v1.json',
)

export function stableFixtureId(prefix, ...parts) {
  return `${prefix}_${createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 24)}`
}

export function fixtureCounts(fixture) {
  return {
    clients: fixture.clients.length,
    people: fixture.people.length,
    projects: fixture.projects.length,
    quotes: fixture.quotes.length,
    invoices: fixture.invoices.length,
    payments: fixture.payments.length,
    timeEntries: fixture.timeEntries.length,
    approvals: fixture.approvals.length,
    communications: fixture.communications.length,
    meetings: fixture.meetings.length,
    revisions: fixture.revisions.length,
    tasks: fixture.tasks.length,
  }
}

function uniqueRefs(records, label, errors) {
  const refs = new Set()
  for (const record of records) {
    if (!record?.ref) errors.push(`${label} contains a record without ref.`)
    else if (refs.has(record.ref)) errors.push(`${label} contains duplicate ref ${record.ref}.`)
    refs.add(record?.ref)
  }
  return refs
}

export function validateFixture(fixture) {
  const errors = []
  if (fixture?.metadata?.purpose !== FIXTURE_PURPOSE) errors.push('Fixture purpose is invalid.')
  if (fixture?.metadata?.dataset !== FIXTURE_DATASET) errors.push('Fixture dataset is invalid.')
  if (fixture?.metadata?.version !== FIXTURE_VERSION) errors.push('Fixture version is invalid.')
  const arrays = [
    'clients', 'people', 'projects', 'quotes', 'invoices', 'payments',
    'timeEntries', 'approvals', 'communications', 'meetings', 'revisions', 'tasks',
    'expectedOpportunities',
  ]
  for (const key of arrays) if (!Array.isArray(fixture?.[key])) errors.push(`${key} must be an array.`)
  if (errors.length) return { errors, warnings: fixture?.dataQuality?.warnings || [] }

  const clients = uniqueRefs(fixture.clients, 'clients', errors)
  const people = uniqueRefs(fixture.people, 'people', errors)
  const projects = uniqueRefs(fixture.projects, 'projects', errors)
  uniqueRefs(fixture.quotes, 'quotes', errors)
  const invoices = uniqueRefs(fixture.invoices, 'invoices', errors)
  uniqueRefs(fixture.payments, 'payments', errors)
  uniqueRefs(fixture.timeEntries, 'timeEntries', errors)
  uniqueRefs(fixture.approvals, 'approvals', errors)
  uniqueRefs(fixture.communications, 'communications', errors)
  uniqueRefs(fixture.meetings, 'meetings', errors)
  uniqueRefs(fixture.revisions, 'revisions', errors)
  uniqueRefs(fixture.tasks, 'tasks', errors)

  const requireRef = (set, value, label) => {
    if (!set.has(value)) errors.push(`${label} references unknown ${value}.`)
  }
  for (const person of fixture.people) requireRef(clients, person.clientRef, person.ref)
  for (const project of fixture.projects) requireRef(clients, project.clientRef, project.ref)
  for (const quote of fixture.quotes) {
    requireRef(clients, quote.clientRef, quote.ref)
    if (quote.projectRef) requireRef(projects, quote.projectRef, quote.ref)
  }
  for (const invoice of fixture.invoices) {
    requireRef(clients, invoice.clientRef, invoice.ref)
    requireRef(projects, invoice.projectRef, invoice.ref)
  }
  for (const payment of fixture.payments) requireRef(invoices, payment.invoiceRef, payment.ref)
  for (const key of ['timeEntries', 'approvals', 'revisions', 'tasks']) {
    for (const record of fixture[key]) requireRef(projects, record.projectRef, record.ref)
  }
  for (const communication of fixture.communications) {
    requireRef(clients, communication.clientRef, communication.ref)
    requireRef(people, communication.personRef, communication.ref)
  }
  for (const meeting of fixture.meetings) {
    requireRef(clients, meeting.clientRef, meeting.ref)
    requireRef(projects, meeting.projectRef, meeting.ref)
    for (const personRef of meeting.participantRefs) requireRef(people, personRef, meeting.ref)
  }
  for (const expected of fixture.expectedOpportunities) {
    if (expected.detector === 'project_meeting_load') requireRef(projects, expected.subjectRef, expected.detector)
    else if (expected.detector === 'client_attention_load') requireRef(clients, expected.subjectRef, expected.detector)
    else errors.push(`Unknown expected detector ${expected.detector}.`)
  }
  return { errors, warnings: fixture.dataQuality?.warnings || [] }
}

export async function loadFixture() {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
  const validation = validateFixture(fixture)
  if (validation.errors.length) {
    throw new Error(`Fixture validation failed:\n- ${validation.errors.join('\n- ')}`)
  }
  return { fixture, validation }
}

export function fixtureOwnerEmail() {
  const email = String(process.env.CI_FIXTURE_OWNER_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase()
  if (!email) throw new Error('Set ADMIN_EMAIL or CI_FIXTURE_OWNER_EMAIL to an existing Lancee account.')
  return email
}

export async function openFixtureDatabase() {
  const { openDatabase } = await import('../server/database.mjs')
  const configuredPath = process.env.DATABASE_PATH || '.runtime/lancee.sqlite'
  const databasePath = isAbsolute(configuredPath) ? configuredPath : resolve(projectDirectory, configuredPath)
  return openDatabase({
    databasePath,
    adminEmail: process.env.ADMIN_EMAIL,
    adminName: process.env.ADMIN_NAME || 'Workspace Admin',
    adminPasswordSalt: process.env.ADMIN_PASSWORD_SALT,
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH,
    workspaceId: process.env.WORKSPACE_ID || 'wsp_primary',
    workspaceName: process.env.WORKSPACE_NAME || 'Hookitup Solutions',
  })
}

export async function getFixtureOwner(database) {
  const rows = await database.query(
    `SELECT id, email, name FROM users WHERE LOWER(TRIM(email)) = $1 AND disabled_at IS NULL`,
    [fixtureOwnerEmail()],
  )
  if (!rows[0]) throw new Error('The configured fixture owner is not an active Lancee user.')
  return rows[0]
}

export async function findFixtureWorkspace(database, ownerUserId) {
  const rows = await database.query(
    `SELECT workspace_fixture_markers.*, workspaces.name
     FROM workspace_fixture_markers
     JOIN workspaces ON workspaces.id = workspace_fixture_markers.workspace_id
     WHERE purpose = $1 AND dataset = $2 AND dataset_version = $3 AND owner_user_id = $4`,
    [FIXTURE_PURPOSE, FIXTURE_DATASET, FIXTURE_VERSION, ownerUserId],
  )
  if (rows.length > 1) throw new Error('Multiple matching fixture workspaces exist; aborting.')
  return rows[0] || null
}

export async function saveFixtureRef(database, workspaceId, recordType, fixtureRef, recordId, createdAt) {
  await database.query(
    `INSERT INTO workspace_fixture_refs (
       workspace_id, dataset, record_type, fixture_ref, record_id, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [workspaceId, FIXTURE_DATASET, recordType, fixtureRef, recordId, createdAt],
  )
}

export function fixtureContext(workspaceId, owner) {
  return {
    workspace: { id: workspaceId, name: FIXTURE_WORKSPACE_NAME },
    user: { id: owner.id, email: owner.email, name: owner.name },
    membership: { role: 'owner' },
  }
}
