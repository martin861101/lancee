import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FIXTURE_DATASET, FIXTURE_PURPOSE, FIXTURE_VERSION, validateFixture } from './connected-intelligence-fixture.mjs'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const sourcePath = resolve(projectDirectory, 'test-data/connected-intelligence/business-records.xlsx')
const outputPath = resolve(projectDirectory, 'test-data/connected-intelligence/business-records.v1.json')

function decodeXml(value = '') {
  return value
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'").replaceAll('&amp;', '&')
}

function unzipEntry(entry) {
  return execFileSync('unzip', ['-p', sourcePath, entry], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
}

function attribute(source, name) {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(source)?.[1] || null
}

function columnIndex(reference) {
  let result = 0
  for (const character of /^[A-Z]+/.exec(reference)?.[0] || '') {
    result = result * 26 + character.charCodeAt(0) - 64
  }
  return result - 1
}

function parseSheet(xml) {
  const rows = []
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const values = []
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const index = columnIndex(attribute(cellMatch[1], 'r'))
      const type = attribute(cellMatch[1], 't')
      let value = null
      if (type === 'inlineStr') {
        value = [...cellMatch[2].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
          .map((match) => decodeXml(match[1])).join('')
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(cellMatch[2])?.[1]
        value = raw === undefined ? null : Number(raw)
      }
      values[index] = value
    }
    rows.push(values)
  }
  const headers = rows.shift()
  return rows.map((values, sourceIndex) => ({
    sourceRow: sourceIndex + 2,
    ...Object.fromEntries(headers.map((header, index) => [header, values[index] ?? null])),
  }))
}

function readWorkbook() {
  const workbook = unzipEntry('xl/workbook.xml')
  const relationships = unzipEntry('xl/_rels/workbook.xml.rels')
  const targets = new Map(
    [...relationships.matchAll(/<Relationship\b([^>]*)\/>/g)]
      .map((match) => [attribute(match[1], 'Id'), attribute(match[1], 'Target')]),
  )
  const result = {}
  for (const match of workbook.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const name = decodeXml(attribute(match[1], 'name'))
    const target = targets.get(attribute(match[1], 'r:id')).replace(/^\//, '')
    result[name] = parseSheet(unzipEntry(target))
  }
  return result
}

const slug = (value) => String(value).trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const hash = (value, length = 12) => createHash('sha256').update(value).digest('hex').slice(0, length)
const clientRef = (id) => `client_${slug(id)}`
const projectRef = (id) => `project_${slug(id)}`
const invoiceRef = (id) => `invoice_${slug(id)}`
const isoDate = (value) => `${String(value).slice(0, 10)}T00:00:00.000Z`
const isoTimestamp = (value) => new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z')).toISOString()
const moneyMinor = (value) => Math.round(Number(value) * 100)
const rowRef = (type, sheet, row) => `${type}_${String(row.sourceRow).padStart(4, '0')}_${hash(`${sheet}:${row.sourceRow}:${JSON.stringify(row)}`)}`
const contactEmail = (id) => `contact+${slug(id)}@connected-intelligence.test`
const personRef = (id) => `person_${slug(id)}`

function percentile(values, position) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * position
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

function percentileRank(value, baseline) {
  const below = baseline.filter((item) => item < value).length
  const equal = baseline.filter((item) => item === value).length
  return baseline.length ? (below + equal * 0.5) / baseline.length : 0
}

const workbook = readWorkbook()
const sourceBytes = await readFile(sourcePath)
const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex')
const clients = workbook.Clients.map((row) => ({
  ref: clientRef(row['Client ID']),
  sourceId: row['Client ID'],
  sourceCompany: row.Company,
  name: row['Client Name'],
  company: row.Company,
  industry: row['Industry/Type'],
  email: contactEmail(row['Client ID']),
  createdAt: isoDate(row['Created Date']),
}))

const people = workbook.Clients.map((row) => ({
  ref: personRef(row['Client ID']),
  clientRef: clientRef(row['Client ID']),
  displayName: `${row['Client Name']} fixture contact`,
  email: contactEmail(row['Client ID']),
  provenance: ['fixture/generated-contact', 'mail', 'calendar'],
}))

const projects = workbook.Projects_Jobs.map((row) => ({
  ref: projectRef(row['Project ID']),
  sourceId: row['Project ID'],
  sourceCompany: row.Company,
  clientRef: clientRef(row['Client ID']),
  name: `${row.Type} · ${row['Project ID']}`,
  type: row.Type,
  scope: `Source project type: ${row.Type}`,
  startedAt: isoDate(row['Start Date']),
  endedAt: row['End Date'] ? isoDate(row['End Date']) : null,
  due: row['End Date'] || null,
  quotedAmountMinor: moneyMinor(row['Quoted Amount']),
  currency: null,
  sourceStatus: row.Status,
  status: row.Status === 'Completed' ? 'Ready' : 'In progress',
  progress: row.Status === 'Completed' ? 100 : 55,
}))

const acceptedProjectByClientAmount = new Map(projects.map((project) => [
  `${project.clientRef}:${project.quotedAmountMinor}`,
  project.ref,
]))
const quotes = workbook.Quotes_Proposals.map((row) => ({
  ref: rowRef('quote', 'Quotes_Proposals', row),
  sourceId: row['Quote ID'],
  sourceRow: row.sourceRow,
  sourceCompany: row.Company,
  clientRef: clientRef(row['Client ID']),
  projectRef: row.Status === 'Accepted'
    ? acceptedProjectByClientAmount.get(`${clientRef(row['Client ID'])}:${moneyMinor(row.Amount)}`) || null
    : null,
  amountMinor: moneyMinor(row.Amount),
  currency: null,
  scope: row.Scope,
  status: row.Status.toLowerCase(),
  issuedAt: isoDate(row.Date),
}))

const invoices = workbook.Invoices.map((row) => ({
  ref: invoiceRef(row['Invoice ID']),
  sourceId: row['Invoice ID'],
  sourceCompany: row.Company,
  projectRef: projectRef(row['Project ID']),
  clientRef: clientRef(row['Client ID']),
  amountMinor: moneyMinor(row.Amount),
  currency: null,
  issuedAt: isoDate(row['Issued Date']),
  dueAt: isoDate(row['Due Date']),
  status: 'pending',
}))
const invoiceBySourceId = new Map(invoices.map((invoice) => [invoice.sourceId, invoice]))
const payments = workbook.Payments.map((row) => ({
  ref: `payment_${slug(row['Payment ID'])}`,
  sourceId: row['Payment ID'],
  sourceCompany: row.Company,
  invoiceRef: invoiceRef(row['Invoice ID']),
  amountMinor: moneyMinor(row.Amount),
  currency: null,
  paidAt: isoDate(row['Payment Date']),
}))
for (const payment of workbook.Payments) invoiceBySourceId.get(payment['Invoice ID']).status = 'paid'

const timeEntries = workbook.Time_Entries.map((row) => ({
  ref: rowRef('time', 'Time_Entries', row),
  sourceRow: row.sourceRow,
  sourceCompany: row.Company,
  projectRef: projectRef(row['Project ID']),
  clientRef: clientRef(row['Client ID']),
  entryDate: String(row.Date),
  durationMinutes: Math.round(Number(row.Hours) * 60),
  activity: row.Activity,
}))

const approvals = workbook.Project_Approvals.map((row) => ({
  ref: rowRef('approval', 'Project_Approvals', row),
  sourceRow: row.sourceRow,
  sourceCompany: row.Company,
  projectRef: projectRef(row['Project ID']),
  approvedAt: isoTimestamp(row['Approval/Completion Timestamp']),
}))

const communications = workbook.Emails.map((row) => ({
  ref: rowRef('message', 'Emails', row),
  sourceRow: row.sourceRow,
  sourceCompany: row.Company,
  clientRef: clientRef(row['Client ID']),
  personRef: personRef(row['Client ID']),
  occurredAt: isoTimestamp(row.Timestamp),
  sourceThreadId: row['Thread ID'],
  externalThreadId: `${clientRef(row['Client ID'])}:${row['Thread ID']}`,
  direction: row.Direction.toLowerCase() === 'inbound' ? 'inbound' : 'outbound',
  subject: `Fixture communication ${row['Thread ID']}`,
}))

const meetings = workbook.Calendar_Meetings.map((row) => {
  const startAt = new Date(`${row.Date}T09:00:00.000Z`)
  return {
    ref: rowRef('meeting', 'Calendar_Meetings', row),
    sourceRow: row.sourceRow,
    sourceCompany: row.Company,
    clientRef: clientRef(row['Client ID']),
    projectRef: projectRef(row['Project ID']),
    participantRefs: [personRef(row['Client ID'])],
    title: `Fixture meeting · ${row['Project ID']}`,
    startAt: startAt.toISOString(),
    endAt: new Date(startAt.getTime() + Number(row['Duration (Mins)']) * 60_000).toISOString(),
    durationMinutes: Number(row['Duration (Mins)']),
  }
})

const revisions = workbook.Revisions_Changes.map((row) => ({
  ref: rowRef('revision', 'Revisions_Changes', row),
  sourceRow: row.sourceRow,
  sourceCompany: row.Company,
  projectRef: projectRef(row['Project ID']),
  occurredAt: isoDate(row.Date),
  changeCount: Number(row['Revision/Change Count']),
}))

const tasks = workbook.Tasks.map((row) => ({
  ref: `task_${slug(row['Task ID'])}`,
  sourceId: row['Task ID'],
  sourceCompany: row.Company,
  projectRef: projectRef(row['Project ID']),
  title: `Fixture task ${row['Task ID']}`,
  createdAt: isoDate(row['Created Date']),
  dueAt: isoDate(row['Due Date']),
  completedAt: row['Completed Date'] ? isoDate(row['Completed Date']) : null,
}))

const meetingMinutes = new Map(projects.map((project) => [project.ref, 0]))
const clientMeetingMinutes = new Map(clients.map((client) => [client.ref, 0]))
for (const meeting of meetings) {
  meetingMinutes.set(meeting.projectRef, meetingMinutes.get(meeting.projectRef) + meeting.durationMinutes)
  clientMeetingMinutes.set(meeting.clientRef, clientMeetingMinutes.get(meeting.clientRef) + meeting.durationMinutes)
}
const messageCounts = new Map(clients.map((client) => [client.ref, 0]))
const threadSets = new Map(clients.map((client) => [client.ref, new Set()]))
for (const message of communications) {
  messageCounts.set(message.clientRef, messageCounts.get(message.clientRef) + 1)
  threadSets.get(message.clientRef).add(message.externalThreadId)
}

const expectedOpportunities = []
for (const project of projects) {
  const baseline = projects
    .filter((candidate) => candidate.ref !== project.ref && candidate.status === 'Ready')
    .map((candidate) => meetingMinutes.get(candidate.ref))
  expectedOpportunities.push({
    detector: 'project_meeting_load',
    subjectRef: project.ref,
    expected: meetingMinutes.get(project.ref) > percentile(baseline, 0.75),
  })
}
for (const client of clients) {
  const comparison = clients.filter((candidate) => candidate.ref !== client.ref)
  const attentionIndex = (
    percentileRank(messageCounts.get(client.ref), comparison.map((candidate) => messageCounts.get(candidate.ref)))
    + percentileRank(threadSets.get(client.ref).size, comparison.map((candidate) => threadSets.get(candidate.ref).size))
    + percentileRank(clientMeetingMinutes.get(client.ref), comparison.map((candidate) => clientMeetingMinutes.get(candidate.ref)))
  ) / 3
  expectedOpportunities.push({
    detector: 'client_attention_load',
    subjectRef: client.ref,
    expected: attentionIndex > 0.75,
  })
}

const quoteIdCounts = Map.groupBy(quotes, (quote) => quote.sourceId)
const sourceThreadGroups = Map.groupBy(communications, (message) => message.sourceThreadId)
const latePayments = payments.filter((payment) => payment.paidAt > invoices.find((invoice) => invoice.ref === payment.invoiceRef).dueAt)
const lateTasks = tasks.filter((task) => task.completedAt && task.completedAt > task.dueAt)
const warnings = [
  { code: 'DUPLICATE_SOURCE_QUOTE_ID', count: [...quoteIdCounts.values()].filter((group) => group.length > 1).length, message: 'Quote labels repeat; row-based fixture refs preserve every record.' },
  { code: 'CROSS_CLIENT_THREAD_COLLISION', count: [...sourceThreadGroups.values()].filter((group) => new Set(group.map((item) => item.clientRef)).size > 1).length, message: 'Thread labels collide across clients; normalized thread identity includes clientRef.' },
  { code: 'LATE_PAYMENT', count: latePayments.length, message: 'Payment occurs after invoice due date.' },
  { code: 'LATE_COMPLETED_TASK', count: lateTasks.length, message: 'Task completion occurs after due date.' },
  { code: 'MISSING_CURRENCY', count: quotes.length + invoices.length + payments.length + projects.length, message: 'The source supplies no currency; normalized currency remains null and persistence uses XXX.' },
  { code: 'SYNTHETIC_CONTACT_AUGMENTATION', count: people.length, message: 'The source has no contact addresses; deterministic .test contacts support canonical Person identity testing.' },
  { code: 'SYNTHETIC_MEETING_TIME', count: meetings.length, message: 'The source has date-only meetings; 09:00 UTC is a deterministic fixture-only time.' },
]

const fixture = {
  metadata: {
    purpose: FIXTURE_PURPOSE,
    dataset: FIXTURE_DATASET,
    version: FIXTURE_VERSION,
    displayName: 'Connected Intelligence Test',
    sourceFile: 'business-records.xlsx',
    sourceSha256,
    sourceDateRange: { from: '2024-06-04', to: '2025-02-21' },
    currency: null,
    syntheticDefaults: { meetingStartTime: '09:00:00Z', contactDomain: 'connected-intelligence.test' },
  },
  sourceCounts: Object.fromEntries(Object.entries(workbook).map(([sheet, rows]) => [sheet, rows.length])),
  dataQuality: { errors: [], warnings },
  clients, people, projects, quotes, invoices, payments, timeEntries, approvals,
  communications, meetings, revisions, tasks, expectedOpportunities,
}

const validation = validateFixture(fixture)
if (validation.errors.length) throw new Error(validation.errors.join('\n'))
await writeFile(outputPath, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(`Wrote ${outputPath}`)
console.log(`Source SHA-256: ${sourceSha256}`)
console.log(`Records: ${Object.values(fixture.sourceCounts).reduce((sum, count) => sum + count, 0)}`)
console.log(`Warnings: ${warnings.reduce((sum, warning) => sum + warning.count, 0)} across ${warnings.length} categories`)
