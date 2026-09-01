import { createHash, randomUUID } from 'node:crypto'
import { createConnectedInspectionService } from './connected-inspections.mjs'
import { recordWorkspaceEvent } from './workspace-events.mjs'

export const PROJECT_MEETING_LOAD_POLICY = Object.freeze({
  version: 'project-meeting-load-v1',
  minimumHistoricalProjects: 3,
  percentile: 0.75,
})

export const CLIENT_ATTENTION_LOAD_POLICY = Object.freeze({
  version: 'client-attention-load-v1',
  minimumComparisonClients: 3,
  opportunityPercentile: 0.75,
})

export class ConnectedIntelligenceError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'ConnectedIntelligenceError'
    this.code = code
    this.status = status
  }
}

function trustedScope(context, { write = false } = {}) {
  const workspaceId = String(context?.workspace?.id || '').trim()
  const userId = String(context?.user?.id || '').trim()
  if (!workspaceId || (write && !userId)) {
    throw new ConnectedIntelligenceError(
      'CONNECTED_INTELLIGENCE_CONTEXT_REQUIRED',
      'Trusted workspace and user context is required.',
      401,
    )
  }
  if (write && context?.membership?.role === 'viewer') {
    throw new ConnectedIntelligenceError(
      'CONNECTED_INTELLIGENCE_PERMISSION_DENIED',
      'Workspace write permission is required.',
      403,
    )
  }
  return { workspaceId, userId: userId || null }
}

function boundedText(value, field, maximum, { required = false } = {}) {
  const text = String(value ?? '').trim()
  if (required && !text) {
    throw new ConnectedIntelligenceError('INVALID_CALENDAR_EVENT', `${field} is required.`)
  }
  if (text.length > maximum) {
    throw new ConnectedIntelligenceError('INVALID_CALENDAR_EVENT', `${field} is too long.`)
  }
  return text || null
}

function timestamp(value, field) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw new ConnectedIntelligenceError('INVALID_CALENDAR_EVENT', `${field} must be a valid date-time.`)
  }
  return date.toISOString()
}

function parseJson(value, fallback) {
  try {
    return (typeof value === 'string' ? JSON.parse(value) : value) ?? fallback
  } catch {
    return fallback
  }
}

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor
}

function durationMinutes(startAt, endAt) {
  return Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000)
}

function normalizeParticipants(value) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 100) {
    throw new ConnectedIntelligenceError(
      'INVALID_CALENDAR_EVENT',
      'participants must be a bounded list.',
    )
  }
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
    .map((item) => {
      if (item.length > 320) {
        throw new ConnectedIntelligenceError('INVALID_CALENDAR_EVENT', 'A participant reference is too long.')
      }
      return item
    })
}

function mapCalendarEvent(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    projectId: row.project_id,
    projectName: row.project_name || null,
    clientId: row.client_id,
    clientName: row.client_name || null,
    title: row.title,
    kind: row.kind,
    startAt: row.start_at,
    endAt: row.end_at,
    durationMinutes: durationMinutes(row.start_at, row.end_at),
    status: row.status,
    participants: parseJson(row.participants_json, []),
    source: row.source,
    sourceIdentifier: row.source_identifier,
    creationEventId: row.creation_event_id,
    completionEventId: row.completion_event_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapOpportunity(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    detectorKey: row.detector_key,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    projectId: row.project_id,
    clientId: row.client_id,
    title: row.title,
    summary: row.summary,
    confidence: Number(row.confidence),
    status: row.status,
    evidence: parseJson(row.evidence_json, []),
    metrics: parseJson(row.metrics_json, {}),
    firstDetectedAt: row.first_detected_at,
    lastDetectedAt: row.last_detected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function percentile(values, position) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * position
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return round(sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower))
}

function canonicalEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+$/.test(email) ? email : null
}

function normalizedAddresses(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 100).map((item) => ({
    name: String(item?.name || '').trim().slice(0, 200),
    address: canonicalEmail(item?.address),
  })).filter((item) => item.address)
}

function stableConnectedId(prefix, value) {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 24)}`
}

function percentileRank(value, baseline) {
  if (!baseline.length) return 0
  const below = baseline.filter((item) => item < value).length
  const equal = baseline.filter((item) => item === value).length
  return round((below + equal * 0.5) / baseline.length, 3)
}

export function createConnectedIntelligenceService({
  database,
  now = () => new Date(),
  policy = PROJECT_MEETING_LOAD_POLICY,
  attentionPolicy = CLIENT_ATTENTION_LOAD_POLICY,
  logger = console,
} = {}) {
  if (!database?.query || !database?.transaction) {
    throw new TypeError('Connected Intelligence requires the Lancee database adapter.')
  }

  const nowIso = () => {
    const value = now()
    const date = value instanceof Date ? value : new Date(value)
    if (!Number.isFinite(date.getTime())) throw new TypeError('Connected Intelligence now() returned an invalid date.')
    return date.toISOString()
  }
  const inspections = createConnectedInspectionService({ database, now, logger })

  async function calendarEventById(workspaceId, eventId) {
    const rows = await database.query(
      `SELECT calendar_events.*, projects.name AS project_name, clients.name AS client_name
       FROM calendar_events
       LEFT JOIN projects
         ON projects.workspace_id = calendar_events.workspace_id
        AND projects.id = calendar_events.project_id
       LEFT JOIN clients
         ON clients.workspace_id = calendar_events.workspace_id
        AND clients.id = calendar_events.client_id
       WHERE calendar_events.workspace_id = $1 AND calendar_events.id = $2`,
      [workspaceId, eventId],
    )
    return mapCalendarEvent(rows[0])
  }

  async function validateRelationships(workspaceId, projectId, requestedClientId) {
    let clientId = requestedClientId
    if (projectId) {
      const projects = await database.query(
        `SELECT id, client_id FROM projects WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, projectId],
      )
      if (!projects[0]) {
        throw new ConnectedIntelligenceError('CALENDAR_PROJECT_NOT_FOUND', 'The selected project was not found.', 404)
      }
      if (projects[0].client_id) {
        if (clientId && clientId !== projects[0].client_id) {
          throw new ConnectedIntelligenceError(
            'CALENDAR_CLIENT_MISMATCH',
            'The selected client does not belong to the selected project.',
            409,
          )
        }
        clientId = projects[0].client_id
      }
    }
    if (clientId) {
      const clients = await database.query(
        `SELECT id FROM clients WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, clientId],
      )
      if (!clients[0]) {
        throw new ConnectedIntelligenceError('CALENDAR_CLIENT_NOT_FOUND', 'The selected client was not found.', 404)
      }
    }
    return clientId || null
  }

  async function resolvePerson(workspaceId, address, provenance = 'mail') {
    const email = canonicalEmail(address?.address ?? address)
    if (!email) return null
    const existing = await database.query(
      `SELECT * FROM connected_people WHERE workspace_id = $1 AND canonical_email = $2`,
      [workspaceId, email],
    )
    if (existing[0]?.client_id) return existing[0]
    const clients = await database.query(
      `SELECT id FROM clients WHERE workspace_id = $1 AND LOWER(TRIM(email)) = $2`,
      [workspaceId, email],
    )
    const clientId = clients.length === 1 ? clients[0].id : null
    if (existing[0]) {
      if (!clientId) return existing[0]
      await database.query(
        `UPDATE connected_people SET client_id = $1, updated_at = $2
         WHERE workspace_id = $3 AND id = $4 AND client_id IS NULL`,
        [clientId, nowIso(), workspaceId, existing[0].id],
      )
      return (await database.query(
        `SELECT * FROM connected_people WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, existing[0].id],
      ))[0]
    }
    const displayName = String(address?.name || '').trim().slice(0, 200)
    const createdAt = nowIso()
    const id = stableConnectedId('person', `${workspaceId}:${email}`)
    await database.query(
      `INSERT INTO connected_people (
         id, workspace_id, canonical_email, display_name, client_id,
         provenance_json, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT (workspace_id, canonical_email) DO NOTHING`,
      [id, workspaceId, email, displayName, clientId, JSON.stringify([provenance]), createdAt],
    )
    const rows = await database.query(
      `SELECT * FROM connected_people WHERE workspace_id = $1 AND canonical_email = $2`,
      [workspaceId, email],
    )
    return rows[0] || null
  }

  async function resolveParticipants(workspaceId, addresses, provenance) {
    const people = []
    for (const address of normalizedAddresses(addresses)) {
      const person = await resolvePerson(workspaceId, address, provenance)
      if (person && !people.some((item) => item.id === person.id)) people.push(person)
    }
    return people
  }

  async function getCommunicationRelationship(context, externalMessageId, sourceAccountId) {
    const { workspaceId } = trustedScope(context)
    const rows = await database.query(
      `SELECT communication_messages.*, clients.name AS client_name, projects.name AS project_name
       FROM communication_messages
       LEFT JOIN clients
         ON clients.workspace_id = communication_messages.workspace_id
        AND clients.id = communication_messages.client_id
       LEFT JOIN projects
         ON projects.workspace_id = communication_messages.workspace_id
        AND projects.id = communication_messages.project_id
       WHERE communication_messages.workspace_id = $1
         AND communication_messages.source_account_id = $2
         AND communication_messages.external_message_id = $3`,
      [workspaceId, String(sourceAccountId || '').trim().toLowerCase(), String(externalMessageId || '').trim()],
    )
    const row = rows[0]
    if (!row) return null
    return {
      messageId: row.id,
      externalMessageId: row.external_message_id,
      threadId: row.external_thread_id,
      clientId: row.client_id,
      clientName: row.client_name || null,
      projectId: row.project_id,
      projectName: row.project_name || null,
      relationshipSource: row.relationship_source,
      confirmed: row.relationship_source === 'confirmed_thread',
    }
  }

  async function insertCommunicationObservation(context, input, { fixture = false } = {}) {
    const { workspaceId } = trustedScope(context)
    if (fixture) {
      const markers = await database.query(
        `SELECT workspace_id FROM workspace_fixture_markers
         WHERE workspace_id = $1 AND purpose = 'connected_intelligence_test'`,
        [workspaceId],
      )
      if (!markers[0]) {
        throw new ConnectedIntelligenceError(
          'FIXTURE_WORKSPACE_REQUIRED',
          'Fixture communication is restricted to a marked synthetic workspace.',
          403,
        )
      }
    }
    const sourceAccountId = canonicalEmail(input?.sourceAccountId)
    if (!sourceAccountId) {
      throw new ConnectedIntelligenceError('INVALID_COMMUNICATION', 'A canonical source account is required.')
    }
    const direction = String(input?.direction || '')
    if (!['inbound', 'outbound'].includes(direction)) {
      throw new ConnectedIntelligenceError('INVALID_COMMUNICATION', 'direction must be inbound or outbound.')
    }
    const from = normalizedAddresses(input?.from)
    const to = normalizedAddresses(input?.to)
    const cc = normalizedAddresses(input?.cc)
    const externalMessageId = String(input?.externalMessageId || '').trim().slice(0, 998)
    if (!externalMessageId) {
      throw new ConnectedIntelligenceError('INVALID_COMMUNICATION', 'A stable external message identity is required.')
    }
    const externalThreadId = String(input?.externalThreadId || externalMessageId).trim().slice(0, 998)
    const occurredAt = timestamp(input?.occurredAt, 'occurredAt')
    const participantAddresses = fixture
      ? [...from, ...to, ...cc].filter((address) => address.address !== sourceAccountId)
      : [...from, ...to, ...cc]
    const people = await resolveParticipants(workspaceId, participantAddresses, `email:${direction}`)
    const externalEmails = direction === 'inbound'
      ? new Set(from.map((item) => item.address).filter((email) => email !== sourceAccountId))
      : new Set([...to, ...cc].map((item) => item.address).filter((email) => email !== sourceAccountId))
    const clientIds = [...new Set(people
      .filter((person) => externalEmails.has(person.canonical_email))
      .map((person) => person.client_id)
      .filter(Boolean))]
    let clientId = clientIds.length === 1 ? clientIds[0] : null
    let projectId = null
    let relationshipSource = clientId ? 'person_client' : 'unresolved'
    const links = await database.query(
      `SELECT client_id, project_id FROM communication_thread_links
       WHERE workspace_id = $1 AND source_account_id = $2 AND external_thread_id = $3`,
      [workspaceId, sourceAccountId, externalThreadId],
    )
    if (links[0]) {
      projectId = links[0].project_id
      clientId = links[0].client_id
      relationshipSource = 'confirmed_thread'
    }
    const id = stableConnectedId('comm', `${workspaceId}:${sourceAccountId}:${externalMessageId}`)
    const createdAt = nowIso()
    const inserted = await database.query(
      `INSERT INTO communication_messages (
         id, workspace_id, source_account_id, source_type, external_message_id,
         external_thread_id, direction, from_json, to_json, cc_json, subject,
         occurred_at, person_ids_json, client_id, project_id, relationship_source,
         folder, provider_uid, provenance_json, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18, $19, $20, $20)
       ON CONFLICT (workspace_id, source_account_id, external_message_id) DO NOTHING
       RETURNING id`,
      [
        id,
        workspaceId,
        sourceAccountId,
        fixture ? 'fixture' : 'email',
        externalMessageId,
        externalThreadId,
        direction,
        JSON.stringify(from),
        JSON.stringify(to),
        JSON.stringify(cc),
        String(input?.subject || '').trim().slice(0, 998),
        occurredAt,
        JSON.stringify(people.map((person) => person.id)),
        clientId,
        projectId,
        relationshipSource,
        String(input?.folder || '').trim().slice(0, 500) || null,
        String(input?.providerUid || '').trim().slice(0, 160) || null,
        JSON.stringify(fixture
          ? { provider: 'fixture', source: 'fixture/import', dataset: String(input?.dataset || '').slice(0, 160) }
          : { provider: String(input?.provider || 'custom').slice(0, 80) }),
        createdAt,
      ],
    )
    if (!inserted[0]) {
      const relationship = await getCommunicationRelationship(context, externalMessageId, sourceAccountId)
      return { observed: false, relationship }
    }
    const event = await recordWorkspaceEvent({
      database,
      context,
      eventType: direction === 'inbound' ? 'communication.received' : 'communication.sent',
      entityType: 'email',
      entityId: id,
      clientId,
      projectId,
      connectionId: fixture ? 'fixture' : 'mail',
      participantRefs: people.map((person) => person.id),
      sourceChannel: fixture ? 'fixture' : 'email',
      sourceIdentifier: stableConnectedId('mail', `${sourceAccountId}:${externalMessageId}`),
      payload: {
        threadId: externalThreadId,
        direction,
        subject: String(input?.subject || '').trim().slice(0, 998),
      },
      importance: 60,
      occurredAt,
    })
    await database.query(
      `UPDATE communication_messages SET workspace_event_id = $1
       WHERE workspace_id = $2 AND id = $3`,
      [event.id, workspaceId, id],
    )
    return {
      observed: true,
      event,
      relationship: await getCommunicationRelationship(context, externalMessageId, sourceAccountId),
    }
  }

  async function observeCommunication(context, input, { transactional = true } = {}) {
    if (!transactional) return insertCommunicationObservation(context, input)
    return database.transaction(() => insertCommunicationObservation(context, input))
  }

  async function observeFixtureCommunication(context, input, { transactional = true } = {}) {
    if (!transactional) return insertCommunicationObservation(context, input, { fixture: true })
    return database.transaction(() => insertCommunicationObservation(context, input, { fixture: true }))
  }

  async function confirmThreadProject(context, { externalMessageId, sourceAccountId, projectId }) {
    const { workspaceId, userId } = trustedScope(context, { write: true })
    return database.transaction(async () => {
      const messages = await database.query(
        `SELECT * FROM communication_messages
         WHERE workspace_id = $1 AND source_account_id = $2 AND external_message_id = $3`,
        [workspaceId, canonicalEmail(sourceAccountId), String(externalMessageId || '').trim()],
      )
      if (!messages[0]) {
        throw new ConnectedIntelligenceError('COMMUNICATION_NOT_FOUND', 'The observed message was not found.', 404)
      }
      const projects = await database.query(
        `SELECT id, client_id FROM projects WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, String(projectId || '').trim()],
      )
      if (!projects[0]) {
        throw new ConnectedIntelligenceError('COMMUNICATION_PROJECT_NOT_FOUND', 'The selected project was not found.', 404)
      }
      const message = messages[0]
      const updatedAt = nowIso()
      await database.query(
        `INSERT INTO communication_thread_links (
           workspace_id, source_account_id, external_thread_id, client_id,
           project_id, confirmed_by, provenance, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'manual_confirmation', $7, $7)
         ON CONFLICT (workspace_id, source_account_id, external_thread_id)
         DO UPDATE SET client_id = EXCLUDED.client_id, project_id = EXCLUDED.project_id,
           confirmed_by = EXCLUDED.confirmed_by, provenance = EXCLUDED.provenance,
           updated_at = EXCLUDED.updated_at`,
        [workspaceId, message.source_account_id, message.external_thread_id, projects[0].client_id, projects[0].id, userId, updatedAt],
      )
      await database.query(
        `UPDATE communication_messages
         SET client_id = $1, project_id = $2, relationship_source = 'confirmed_thread', updated_at = $3
         WHERE workspace_id = $4 AND source_account_id = $5 AND external_thread_id = $6`,
        [projects[0].client_id, projects[0].id, updatedAt, workspaceId, message.source_account_id, message.external_thread_id],
      )
      await database.query(
        `UPDATE workspace_events
         SET client_id = $1, project_id = $2
         WHERE workspace_id = $3 AND entity_type = 'email'
           AND entity_id IN (
             SELECT id FROM communication_messages
             WHERE workspace_id = $3 AND source_account_id = $4 AND external_thread_id = $5
           )`,
        [projects[0].client_id, projects[0].id, workspaceId, message.source_account_id, message.external_thread_id],
      )
      return getCommunicationRelationship(context, message.external_message_id, message.source_account_id)
    })
  }

  async function insertCalendarEvent(context, input) {
    const { workspaceId, userId } = trustedScope(context, { write: true })
    const title = boundedText(input?.title, 'title', 200, { required: true })
    const kind = String(input?.kind || 'meeting')
    if (!['meeting', 'deadline'].includes(kind)) {
      throw new ConnectedIntelligenceError('INVALID_CALENDAR_EVENT', 'kind must be meeting or deadline.')
    }
    const startAt = timestamp(input?.startAt, 'startAt')
    const endAt = timestamp(input?.endAt, 'endAt')
    const meetingDuration = durationMinutes(startAt, endAt)
    if (meetingDuration < 1 || meetingDuration > 10_080) {
      throw new ConnectedIntelligenceError(
        'INVALID_CALENDAR_EVENT',
        'endAt must be after startAt and no more than seven days later.',
      )
    }
    const projectId = boundedText(input?.projectId, 'projectId', 160)
    const requestedClientId = boundedText(input?.clientId, 'clientId', 160)
    const clientId = await validateRelationships(workspaceId, projectId, requestedClientId)
    const participants = normalizeParticipants(input?.participants)
    const participantPeople = await resolveParticipants(
      workspaceId,
      participants.map((address) => ({ address })),
      'calendar_attendee',
    )
    const source = boundedText(input?.source || 'lancee', 'source', 80, { required: true })
    const id = `cal_${randomUUID().replaceAll('-', '')}`
    const sourceIdentifier = boundedText(input?.sourceIdentifier || id, 'sourceIdentifier', 240, { required: true })
    const createdAt = nowIso()
    await database.query(
      `INSERT INTO calendar_events (
         id, workspace_id, created_by, project_id, client_id, title, kind,
         start_at, end_at, status, participants_json, source,
         source_identifier, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled', $10, $11, $12, $13, $14)`,
      [
        id,
        workspaceId,
        userId,
        projectId,
        clientId,
        title,
        kind,
        startAt,
        endAt,
        JSON.stringify(participants),
        source,
        sourceIdentifier,
        createdAt,
        createdAt,
      ],
    )
    if (kind === 'meeting') {
      const workspaceEvent = await recordWorkspaceEvent({
        database,
        context,
        eventType: 'meeting.created',
        entityType: 'meeting',
        entityId: id,
        clientId,
        projectId,
        participantRefs: participantPeople.map((person) => person.id),
        sourceChannel: 'calendar',
        sourceIdentifier,
        payload: {
          title,
          startAt,
          endAt,
          durationMinutes: meetingDuration,
          meetingType: ['internal', 'client'].includes(input?.meetingType)
            ? input.meetingType
            : kind,
          source,
        },
        importance: 60,
        occurredAt: createdAt,
      })
      await database.query(
        `UPDATE calendar_events SET creation_event_id = $1 WHERE workspace_id = $2 AND id = $3`,
        [workspaceEvent.id, workspaceId, id],
      )
    }
    return calendarEventById(workspaceId, id)
  }

  async function createCalendarEvent(context, input, { transactional = true } = {}) {
    if (!transactional) return insertCalendarEvent(context, input)
    return database.transaction(() => insertCalendarEvent(context, input))
  }

  async function resolveActiveOpportunity(workspaceId, projectId) {
    const updatedAt = nowIso()
    await database.query(
      `UPDATE connected_opportunities
       SET status = 'resolved', updated_at = $1
       WHERE workspace_id = $2 AND detector_key = 'project_meeting_load'
         AND subject_type = 'project' AND subject_id = $3 AND status = 'active'`,
      [updatedAt, workspaceId, projectId],
    )
  }

  async function completeDueMeetings({
    workspaceId = null,
    eventId = null,
    completedAt = nowIso(),
    force = false,
  } = {}) {
    const completionTime = timestamp(completedAt, 'completedAt')
    const params = []
    const filters = [
      "kind = 'meeting'",
      "status = 'scheduled'",
      'completion_event_id IS NULL',
    ]
    if (!force) {
      params.push(completionTime)
      filters.push(`end_at <= $${params.length}`)
      filters.push("id NOT IN (SELECT id FROM meetings WHERE status = 'live')")
    }
    if (workspaceId) {
      params.push(workspaceId)
      filters.push(`workspace_id = $${params.length}`)
    }
    if (eventId) {
      params.push(eventId)
      filters.push(`id = $${params.length}`)
    }
    const due = await database.query(
      `SELECT * FROM calendar_events WHERE ${filters.join(' AND ')} ORDER BY end_at ASC`,
      params,
    )
    const completed = []
    for (const candidate of due) {
      const result = await database.transaction(async () => {
        const claimed = await database.query(
          `UPDATE calendar_events
           SET status = 'completed', completed_at = $1, updated_at = $1
           WHERE workspace_id = $2 AND id = $3 AND status = 'scheduled'
             AND completion_event_id IS NULL
           RETURNING *`,
          [completionTime, candidate.workspace_id, candidate.id],
        )
        if (!claimed[0]) return null
        const event = claimed[0]
        const nativeMeeting = await database.query(
          `SELECT meeting_type, started_at FROM meetings WHERE workspace_id = $1 AND id = $2`,
          [event.workspace_id, event.id],
        )
        const context = {
          workspace: { id: event.workspace_id },
          user: event.created_by ? { id: event.created_by } : null,
          membership: { role: 'owner' },
        }
        const participantPeople = await resolveParticipants(
          event.workspace_id,
          parseJson(event.participants_json, []).map((address) => ({ address })),
          'calendar_attendee',
        )
        const workspaceEvent = await recordWorkspaceEvent({
          database,
          context,
          eventType: 'meeting.completed',
          entityType: 'meeting',
          entityId: event.id,
          clientId: event.client_id,
          projectId: event.project_id,
          participantRefs: participantPeople.map((person) => person.id),
          sourceChannel: 'calendar',
          sourceIdentifier: event.source_identifier,
          payload: {
            title: event.title,
            startAt: nativeMeeting[0]?.started_at || event.start_at,
            endAt: force ? completionTime : event.end_at,
            durationMinutes: durationMinutes(
              nativeMeeting[0]?.started_at || event.start_at,
              force ? completionTime : event.end_at,
            ),
            meetingType: nativeMeeting[0]?.meeting_type || event.kind,
            source: event.source,
          },
          importance: 70,
          occurredAt: force ? completionTime : event.end_at,
        })
        await database.query(
          `UPDATE calendar_events SET completion_event_id = $1 WHERE workspace_id = $2 AND id = $3`,
          [workspaceEvent.id, event.workspace_id, event.id],
        )
        return calendarEventById(event.workspace_id, event.id)
      })
      if (result) completed.push(result)
    }
    const completedByWorkspace = new Map()
    for (const event of completed) {
      const current = completedByWorkspace.get(event.workspaceId) || []
      current.push(event)
      completedByWorkspace.set(event.workspaceId, current)
    }
    const calendarInspections = new Map()
    for (const [completedWorkspaceId, events] of completedByWorkspace) {
      const context = {
        workspace: { id: completedWorkspaceId },
        user: events[0]?.createdBy ? { id: events[0].createdBy } : null,
      }
      const inspection = await inspections.startInspection(context, {
        inspectionType: 'calendar',
        sourceType: 'calendar',
        summary: 'Reviewed completed meeting activity.',
      })
      calendarInspections.set(completedWorkspaceId, {
        context,
        events,
        inspection,
        opportunities: new Map(),
        sufficientEvidence: false,
      })
    }
    try {
      const projects = new Map()
      for (const event of completed) {
        if (event.projectId) projects.set(`${event.workspaceId}:${event.projectId}`, event)
      }
      for (const event of projects.values()) {
        const detection = await detectProjectMeetingLoad(
          { workspace: { id: event.workspaceId }, user: event.createdBy ? { id: event.createdBy } : null },
          event.projectId,
          { persist: true, completeDue: false },
        )
        const calendarInspection = calendarInspections.get(event.workspaceId)
        if (detection.status !== 'insufficient_evidence') calendarInspection.sufficientEvidence = true
        if (detection.opportunity) calendarInspection.opportunities.set(detection.opportunity.id, detection.opportunity)
      }
      const clients = new Map()
      for (const event of completed) {
        if (event.clientId) clients.set(`${event.workspaceId}:${event.clientId}`, event)
      }
      for (const event of clients.values()) {
        const detection = await detectClientAttentionLoad(
          { workspace: { id: event.workspaceId }, user: event.createdBy ? { id: event.createdBy } : null },
          event.clientId,
          { persist: true, completeDue: false },
        )
        const calendarInspection = calendarInspections.get(event.workspaceId)
        if (detection.status !== 'insufficient_evidence') calendarInspection.sufficientEvidence = true
        if (detection.opportunity) calendarInspection.opportunities.set(detection.opportunity.id, detection.opportunity)
      }
    } catch (error) {
      for (const value of calendarInspections.values()) {
        if (value.inspection) {
          await inspections.failInspection(value.context, value.inspection.id, error, {
            recordsInspected: value.events.length,
            metadata: { meetings: value.events.length },
          })
        }
      }
      throw error
    }
    for (const value of calendarInspections.values()) {
      if (!value.inspection) continue
      await inspections.completeInspection(value.context, value.inspection.id, {
        status: value.opportunities.size > 0 ? 'opportunity_created' : 'all_clear',
        recordsInspected: value.events.length,
        signalsFound: value.opportunities.size,
        relatedOpportunityId: value.opportunities.values().next().value?.id || null,
        summary: value.opportunities.size > 0
          ? 'Reviewed completed meeting activity and found connected activity worth attention.'
          : value.sufficientEvidence
            ? 'Reviewed completed meeting activity; nothing unusual currently needs attention.'
            : 'Reviewed completed meeting activity, but there was not enough comparison history.',
        metadata: {
          meetings: value.events.length,
          sufficientEvidence: value.sufficientEvidence,
        },
      })
    }
    return completed
  }

  async function listCalendarEvents(context, { from = null, to = null } = {}) {
    const { workspaceId } = trustedScope(context)
    await completeDueMeetings({ workspaceId })
    const params = [workspaceId]
    const filters = ['calendar_events.workspace_id = $1']
    if (from) {
      params.push(timestamp(from, 'from'))
      filters.push(`calendar_events.end_at >= $${params.length}`)
    }
    if (to) {
      params.push(timestamp(to, 'to'))
      filters.push(`calendar_events.start_at <= $${params.length}`)
    }
    const rows = await database.query(
      `SELECT calendar_events.*, projects.name AS project_name, clients.name AS client_name
       FROM calendar_events
       LEFT JOIN projects
         ON projects.workspace_id = calendar_events.workspace_id
        AND projects.id = calendar_events.project_id
       LEFT JOIN clients
         ON clients.workspace_id = calendar_events.workspace_id
        AND clients.id = calendar_events.client_id
       WHERE ${filters.join(' AND ')}
       ORDER BY calendar_events.start_at ASC`,
      params,
    )
    return rows.map(mapCalendarEvent)
  }

  async function getMeetingFeatures(context, { completeDue = true } = {}) {
    const { workspaceId } = trustedScope(context)
    if (completeDue) await completeDueMeetings({ workspaceId })
    const rows = await database.query(
      `SELECT calendar_events.*, workspace_events.id AS evidence_event_id
       FROM calendar_events
       JOIN workspace_events
         ON workspace_events.workspace_id = calendar_events.workspace_id
        AND workspace_events.id = calendar_events.completion_event_id
        AND workspace_events.event_type = 'meeting.completed'
       WHERE calendar_events.workspace_id = $1
         AND calendar_events.kind = 'meeting'
         AND calendar_events.status = 'completed'
       ORDER BY calendar_events.end_at ASC`,
      [workspaceId],
    )
    const meetings = rows.map((row) => ({
      meetingId: row.id,
      projectId: row.project_id,
      clientId: row.client_id,
      meetingDurationMinutes: durationMinutes(row.start_at, row.end_at),
      evidenceEventId: row.evidence_event_id,
      startAt: row.start_at,
      endAt: row.end_at,
    }))
    const aggregate = (field) => {
      const values = new Map()
      for (const meeting of meetings) {
        const id = meeting[field]
        if (!id) continue
        const current = values.get(id) || {
          [`${field}`]: id,
          meetingCount: 0,
          meetingMinutesTotal: 0,
          evidenceEventIds: [],
        }
        current.meetingCount += 1
        current.meetingMinutesTotal += meeting.meetingDurationMinutes
        current.evidenceEventIds.push(meeting.evidenceEventId)
        values.set(id, current)
      }
      return [...values.values()].map((value) => ({
        ...value,
        meetingMinutesAverage: round(value.meetingMinutesTotal / value.meetingCount),
      }))
    }
    const projects = aggregate('projectId')
    const clients = aggregate('clientId')
    return {
      meetings,
      projects,
      clients,
      meetingMinutesPerProject: Object.fromEntries(
        projects.map((project) => [project.projectId, project.meetingMinutesTotal]),
      ),
      meetingMinutesPerClient: Object.fromEntries(
        clients.map((client) => [client.clientId, client.meetingMinutesTotal]),
      ),
    }
  }

  async function persistOpportunity(workspaceId, project, result) {
    const detectedAt = nowIso()
    const id = `opp_${createHash('sha256')
      .update(`${workspaceId}:project_meeting_load:project:${project.id}`)
      .digest('hex')
      .slice(0, 24)}`
    const title = `High meeting load on ${project.name}`
    const summary = `${result.observed.meetingMinutes} meeting minutes is ${result.comparison.differencePercent === null ? result.comparison.differenceMinutes + ' minutes' : result.comparison.differencePercent + '%'} above this workspace's completed-project median.`
    await database.query(
      `INSERT INTO connected_opportunities (
         id, workspace_id, detector_key, subject_type, subject_id, project_id,
         client_id, title, summary, confidence, status, evidence_json,
         metrics_json, first_detected_at, last_detected_at, created_at, updated_at
       ) VALUES ($1, $2, 'project_meeting_load', 'project', $3, $3, $4, $5, $6,
         $7, 'active', $8, $9, $10, $10, $10, $10)
       ON CONFLICT (workspace_id, detector_key, subject_type, subject_id)
       DO UPDATE SET
         project_id = EXCLUDED.project_id,
         client_id = EXCLUDED.client_id,
         title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         confidence = EXCLUDED.confidence,
         status = CASE
           WHEN connected_opportunities.status = 'dismissed' THEN 'dismissed'
           ELSE 'active'
         END,
         evidence_json = EXCLUDED.evidence_json,
         metrics_json = EXCLUDED.metrics_json,
         last_detected_at = EXCLUDED.last_detected_at,
         updated_at = EXCLUDED.updated_at`,
      [
        id,
        workspaceId,
        project.id,
        project.client_id,
        title,
        summary,
        result.confidence,
        JSON.stringify(result.evidence),
        JSON.stringify(result),
        detectedAt,
      ],
    )
    const rows = await database.query(
      `SELECT * FROM connected_opportunities
       WHERE workspace_id = $1 AND detector_key = 'project_meeting_load'
         AND subject_type = 'project' AND subject_id = $2`,
      [workspaceId, project.id],
    )
    return mapOpportunity(rows[0])
  }

  async function detectProjectMeetingLoad(context, projectId, {
    persist = false,
    completeDue = true,
    instrument = true,
  } = {}) {
    const { workspaceId } = trustedScope(context)
    const projects = await database.query(
      `SELECT id, name, client_id, status FROM projects WHERE workspace_id = $1`,
      [workspaceId],
    )
    const project = projects.find((item) => item.id === projectId)
    if (!project) {
      throw new ConnectedIntelligenceError('PROJECT_NOT_FOUND', 'Project not found.', 404)
    }
    const inspection = instrument ? await inspections.startInspection(context, {
      inspectionType: 'project',
      sourceType: 'calendar',
      projectId: project.id,
      clientId: project.client_id,
      summary: 'Compared project meeting activity with completed workspace projects.',
    }) : null
    try {
    const features = await getMeetingFeatures(context, { completeDue })
    const projectFeatures = new Map(features.projects.map((item) => [item.projectId, item]))
    const observedFeature = projectFeatures.get(project.id)
    const observedMinutes = observedFeature?.meetingMinutesTotal || 0
    const historicalProjects = projects.filter((item) => item.id !== project.id && item.status === 'Ready')
    const historicalMinutes = historicalProjects.map((item) => (
      projectFeatures.get(item.id)?.meetingMinutesTotal || 0
    ))
    const medianMeetingMinutes = percentile(historicalMinutes, 0.5)
    const highPercentileMeetingMinutes = percentile(historicalMinutes, policy.percentile)
    const differenceMinutes = round(observedMinutes - medianMeetingMinutes)
    const differencePercent = medianMeetingMinutes > 0
      ? round((differenceMinutes / medianMeetingMinutes) * 100, 1)
      : null
    const evidence = features.meetings
      .filter((meeting) => (
        meeting.projectId === project.id || historicalProjects.some((item) => item.id === meeting.projectId)
      ))
      .slice(0, 100)
      .map((meeting) => ({
        type: 'workspace_event',
        id: meeting.evidenceEventId,
        meetingId: meeting.meetingId,
        projectId: meeting.projectId,
      }))
    let status = 'normal'
    let confidence = round(Math.min(0.9, 0.5 + historicalProjects.length * 0.04), 3)
    if (historicalProjects.length < policy.minimumHistoricalProjects) {
      status = 'insufficient_evidence'
      confidence = 0
    } else if (observedMinutes > highPercentileMeetingMinutes) {
      status = 'opportunity'
      const sampleConfidence = Math.min(1, historicalProjects.length / 10)
      const deviation = highPercentileMeetingMinutes > 0
        ? Math.min(1, (observedMinutes - highPercentileMeetingMinutes) / highPercentileMeetingMinutes)
        : observedMinutes > 0 ? 1 : 0
      confidence = round(0.55 + sampleConfidence * 0.25 + deviation * 0.2, 3)
    }
    const result = {
      detector: 'project_meeting_load',
      detectorVersion: policy.version,
      subjectType: 'project',
      subjectId: project.id,
      status,
      observed: {
        meetingCount: observedFeature?.meetingCount || 0,
        meetingMinutes: observedMinutes,
      },
      baseline: {
        sampleSize: historicalProjects.length,
        medianMeetingMinutes,
        percentile75MeetingMinutes: highPercentileMeetingMinutes,
        projectIds: historicalProjects.map((item) => item.id),
      },
      comparison: { differenceMinutes, differencePercent },
      confidence,
      evidence,
    }
    let opportunity = null
    if (persist && status === 'opportunity') {
      opportunity = await persistOpportunity(workspaceId, project, result)
    } else if (persist && status === 'normal') {
      await resolveActiveOpportunity(workspaceId, project.id)
    }
    if (inspection) {
      await inspections.completeInspection(context, inspection.id, {
        status: opportunity ? 'opportunity_created' : status === 'opportunity' ? 'signal_found' : 'all_clear',
        recordsInspected: features.meetings.length,
        signalsFound: status === 'opportunity' ? 1 : 0,
        relatedOpportunityId: opportunity?.id || null,
        summary: status === 'opportunity'
          ? 'Found project meeting activity worth attention.'
          : status === 'normal'
            ? 'Project meeting activity did not require attention.'
            : 'Reviewed project meeting activity, but there was not enough comparison history.',
        metadata: {
          meetings: features.meetings.length,
          projectsCompared: historicalProjects.length,
          sufficientEvidence: status !== 'insufficient_evidence',
        },
      })
    }
    return { ...result, opportunity }
    } catch (error) {
      if (inspection) await inspections.failInspection(context, inspection.id, error)
      throw error
    }
  }

  async function getCommunicationFeatures(context) {
    const { workspaceId } = trustedScope(context)
    const rows = await database.query(
      `SELECT communication_messages.*
       FROM communication_messages
       JOIN workspace_events
         ON workspace_events.workspace_id = communication_messages.workspace_id
        AND workspace_events.id = communication_messages.workspace_event_id
        AND workspace_events.event_type IN ('communication.received', 'communication.sent')
       WHERE communication_messages.workspace_id = $1
       ORDER BY communication_messages.occurred_at ASC`,
      [workspaceId],
    )
    const messages = rows.map((row) => ({
      messageId: row.id,
      eventId: row.workspace_event_id,
      direction: row.direction,
      threadId: row.external_thread_id,
      projectId: row.project_id,
      clientId: row.client_id,
      personIds: parseJson(row.person_ids_json, []),
      occurredAt: row.occurred_at,
    }))
    const aggregate = (field) => {
      const values = new Map()
      for (const message of messages) {
        const id = message[field]
        if (!id) continue
        const current = values.get(id) || {
          [field]: id,
          messageCount: 0,
          inboundMessageCount: 0,
          outboundMessageCount: 0,
          threadIds: new Set(),
          personIds: new Set(),
          communicationDays: new Set(),
          projectIds: new Set(),
          evidenceEventIds: [],
        }
        current.messageCount += 1
        current[message.direction === 'inbound' ? 'inboundMessageCount' : 'outboundMessageCount'] += 1
        if (message.threadId) current.threadIds.add(message.threadId)
        for (const personId of message.personIds) current.personIds.add(personId)
        current.communicationDays.add(message.occurredAt.slice(0, 10))
        if (message.projectId) current.projectIds.add(message.projectId)
        current.evidenceEventIds.push(message.eventId)
        values.set(id, current)
      }
      return [...values.values()].map((value) => ({
        [field]: value[field],
        messageCount: value.messageCount,
        inboundMessageCount: value.inboundMessageCount,
        outboundMessageCount: value.outboundMessageCount,
        threadCount: value.threadIds.size,
        participantCount: value.personIds.size,
        communicationDays: value.communicationDays.size,
        averageMessagesPerThread: value.threadIds.size
          ? round(value.messageCount / value.threadIds.size)
          : 0,
        numberOfRelatedProjects: value.projectIds.size,
        evidenceEventIds: value.evidenceEventIds,
      }))
    }
    const projects = aggregate('projectId')
    const clients = aggregate('clientId')
    const personValues = new Map()
    for (const message of messages) {
      for (const personId of message.personIds) {
        const current = personValues.get(personId) || {
          personId,
          messageCount: 0,
          threadIds: new Set(),
          lastCommunicationAt: null,
        }
        current.messageCount += 1
        if (message.threadId) current.threadIds.add(message.threadId)
        if (!current.lastCommunicationAt || message.occurredAt > current.lastCommunicationAt) {
          current.lastCommunicationAt = message.occurredAt
        }
        personValues.set(personId, current)
      }
    }
    const people = [...personValues.values()].map((value) => ({
      personId: value.personId,
      messageCount: value.messageCount,
      threadCount: value.threadIds.size,
      lastCommunicationAt: value.lastCommunicationAt,
    }))
    return { messages, projects, clients, people }
  }

  async function resolveClientAttentionOpportunity(workspaceId, clientId) {
    await database.query(
      `UPDATE connected_opportunities
       SET status = 'resolved', updated_at = $1
       WHERE workspace_id = $2 AND detector_key = 'client_attention_load'
         AND subject_type = 'client' AND subject_id = $3 AND status = 'active'`,
      [nowIso(), workspaceId, clientId],
    )
  }

  async function persistClientAttentionOpportunity(workspaceId, client, result) {
    const detectedAt = nowIso()
    const id = stableConnectedId('opp', `${workspaceId}:client_attention_load:client:${client.id}`)
    const title = `High coordination attention for ${client.name}`
    const summary = `${client.name} currently requires substantially more coordination attention than this workspace's typical observed client: ${result.observed.messageCount} messages across ${result.observed.threadCount} threads and ${round(result.observed.meetingMinutes / 60, 1)} meeting hours.`
    await database.query(
      `INSERT INTO connected_opportunities (
         id, workspace_id, detector_key, subject_type, subject_id, project_id,
         client_id, title, summary, confidence, status, evidence_json,
         metrics_json, first_detected_at, last_detected_at, created_at, updated_at
       ) VALUES ($1, $2, 'client_attention_load', 'client', $3, NULL, $3, $4, $5,
         $6, 'active', $7, $8, $9, $9, $9, $9)
       ON CONFLICT (workspace_id, detector_key, subject_type, subject_id)
       DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary,
         confidence = EXCLUDED.confidence,
         status = CASE WHEN connected_opportunities.status = 'dismissed' THEN 'dismissed' ELSE 'active' END,
         evidence_json = EXCLUDED.evidence_json, metrics_json = EXCLUDED.metrics_json,
         last_detected_at = EXCLUDED.last_detected_at, updated_at = EXCLUDED.updated_at`,
      [id, workspaceId, client.id, title, summary, result.confidence, JSON.stringify(result.evidence), JSON.stringify(result), detectedAt],
    )
    const rows = await database.query(
      `SELECT * FROM connected_opportunities
       WHERE workspace_id = $1 AND detector_key = 'client_attention_load'
         AND subject_type = 'client' AND subject_id = $2`,
      [workspaceId, client.id],
    )
    return mapOpportunity(rows[0])
  }

  async function detectClientAttentionLoad(context, clientId, {
    persist = false,
    completeDue = true,
    instrument = true,
  } = {}) {
    const { workspaceId } = trustedScope(context)
    const clientRows = await database.query(
      `SELECT id, name FROM clients WHERE workspace_id = $1`,
      [workspaceId],
    )
    const client = clientRows.find((item) => item.id === clientId)
    if (!client) throw new ConnectedIntelligenceError('CLIENT_NOT_FOUND', 'Client not found.', 404)
    const inspection = instrument ? await inspections.startInspection(context, {
      inspectionType: 'cross_source',
      sourceType: 'connected',
      clientId: client.id,
      summary: 'Compared client communication and meeting activity.',
    }) : null
    try {
    const [communication, meetings] = await Promise.all([
      getCommunicationFeatures(context),
      getMeetingFeatures(context, { completeDue }),
    ])
    const communicationByClient = new Map(communication.clients.map((item) => [item.clientId, item]))
    const meetingsByClient = new Map(meetings.clients.map((item) => [item.clientId, item]))
    const featuresFor = (id) => {
      const mail = communicationByClient.get(id)
      const calendar = meetingsByClient.get(id)
      return {
        clientId: id,
        messageCount: mail?.messageCount || 0,
        threadCount: mail?.threadCount || 0,
        communicationDays: mail?.communicationDays || 0,
        meetingCount: calendar?.meetingCount || 0,
        meetingMinutes: calendar?.meetingMinutesTotal || 0,
        communicationEvidence: mail?.evidenceEventIds || [],
        meetingEvidence: meetings.meetings
          .filter((meeting) => meeting.clientId === id)
          .map((meeting) => meeting.evidenceEventId),
      }
    }
    const observed = featuresFor(client.id)
    const comparisonClients = clientRows
      .filter((item) => item.id !== client.id)
      .map((item) => featuresFor(item.id))
      .filter((item) => item.messageCount > 0 || item.meetingCount > 0)
    const messageValues = comparisonClients.map((item) => item.messageCount)
    const threadValues = comparisonClients.map((item) => item.threadCount)
    const meetingMinuteValues = comparisonClients.map((item) => item.meetingMinutes)
    const messagePercentile = percentileRank(observed.messageCount, messageValues)
    const threadPercentile = percentileRank(observed.threadCount, threadValues)
    const meetingMinutesPercentile = percentileRank(observed.meetingMinutes, meetingMinuteValues)
    const attentionIndex = round((messagePercentile + threadPercentile + meetingMinutesPercentile) / 3, 3)
    let status = 'normal'
    let confidence = round(Math.min(0.9, 0.5 + comparisonClients.length * 0.04), 3)
    if (comparisonClients.length < attentionPolicy.minimumComparisonClients) {
      status = 'insufficient_evidence'
      confidence = 0
    } else if (
      observed.messageCount + observed.meetingCount > 0 &&
      attentionIndex > attentionPolicy.opportunityPercentile
    ) {
      status = 'opportunity'
      const sampleConfidence = Math.min(1, comparisonClients.length / 10)
      const sourceCount = Number(observed.messageCount > 0) + Number(observed.meetingCount > 0)
      confidence = round(0.55 + sampleConfidence * 0.25 + (sourceCount === 2 ? 0.1 : 0), 3)
    }
    const evidence = [
      ...observed.communicationEvidence.map((id) => ({ type: 'workspace_event', id, eventType: 'communication' })),
      ...observed.meetingEvidence.map((id) => ({ type: 'workspace_event', id, eventType: 'meeting.completed' })),
    ].slice(0, 100)
    const result = {
      detector: 'client_attention_load',
      detectorVersion: attentionPolicy.version,
      subjectType: 'client',
      subjectId: client.id,
      status,
      observed: {
        messageCount: observed.messageCount,
        threadCount: observed.threadCount,
        communicationDays: observed.communicationDays,
        meetingCount: observed.meetingCount,
        meetingMinutes: observed.meetingMinutes,
      },
      baseline: {
        sampleSize: comparisonClients.length,
        medianMessages: percentile(messageValues, 0.5),
        medianThreads: percentile(threadValues, 0.5),
        medianMeetingMinutes: percentile(meetingMinuteValues, 0.5),
        clientIds: comparisonClients.map((item) => item.clientId),
      },
      comparison: { messagePercentile, threadPercentile, meetingMinutesPercentile, attentionIndex },
      confidence,
      evidence,
    }
    let opportunity = null
    if (persist && status === 'opportunity') {
      opportunity = await persistClientAttentionOpportunity(workspaceId, client, result)
    } else if (persist && status === 'normal') {
      await resolveClientAttentionOpportunity(workspaceId, client.id)
    }
    if (inspection) {
      await inspections.completeInspection(context, inspection.id, {
        status: opportunity ? 'opportunity_created' : status === 'opportunity' ? 'signal_found' : 'all_clear',
        recordsInspected: communication.messages.length + meetings.meetings.length,
        signalsFound: status === 'opportunity' ? 1 : 0,
        relatedOpportunityId: opportunity?.id || null,
        summary: status === 'opportunity'
          ? 'Found connected client activity worth attention.'
          : status === 'normal'
            ? 'Connected client activity did not require attention.'
            : 'Reviewed connected client activity, but there was not enough comparison history.',
        metadata: {
          communicationRecords: communication.messages.length,
          meetingRecords: meetings.meetings.length,
          clients: comparisonClients.length + 1,
          sufficientEvidence: status !== 'insufficient_evidence',
        },
      })
    }
    return { ...result, opportunity }
    } catch (error) {
      if (inspection) await inspections.failInspection(context, inspection.id, error)
      throw error
    }
  }

  async function getSummary(context) {
    const [workspace, intelligence] = await Promise.all([
      getWorkspaceSummary(context),
      inspections.getSummary(context),
    ])
    return { ...workspace, ...intelligence }
  }

  async function getWorkspaceSummary(context) {
    const { workspaceId } = trustedScope(context)
    const [
      clientCount,
      projectCount,
      communicationCount,
      meetingCount,
      invoiceCount,
      timeEntryCount,
      workspacePaymentCount,
      providerPaymentCount,
      clients,
      projects,
    ] = await Promise.all([
      database.query('SELECT COUNT(*) AS count FROM clients WHERE workspace_id = $1', [workspaceId]),
      database.query('SELECT COUNT(*) AS count FROM projects WHERE workspace_id = $1', [workspaceId]),
      database.query('SELECT COUNT(*) AS count FROM communication_messages WHERE workspace_id = $1', [workspaceId]),
      database.query("SELECT COUNT(*) AS count FROM calendar_events WHERE workspace_id = $1 AND kind = 'meeting'", [workspaceId]),
      database.query('SELECT COUNT(*) AS count FROM invoices WHERE workspace_id = $1', [workspaceId]),
      database.query('SELECT COUNT(*) AS count FROM time_entries WHERE workspace_id = $1', [workspaceId]),
      database.query('SELECT COUNT(*) AS count FROM workspace_payments WHERE workspace_id = $1', [workspaceId]),
      database.query(
        `SELECT COUNT(*) AS count
         FROM payment_links
         WHERE workspace_id = $1 AND status = 'paid'
           AND NOT EXISTS (
             SELECT 1 FROM workspace_payments
             WHERE workspace_payments.workspace_id = payment_links.workspace_id
               AND workspace_payments.invoice_id = payment_links.invoice_id
           )`,
        [workspaceId],
      ),
      database.query(
        `SELECT id, name
         FROM clients
         WHERE workspace_id = $1
         ORDER BY name ASC`,
        [workspaceId],
      ),
      database.query(
        `SELECT projects.id, projects.name, projects.client_id,
           (SELECT COUNT(*) FROM calendar_events
            WHERE calendar_events.workspace_id = $1
              AND calendar_events.project_id = projects.id
              AND calendar_events.kind = 'meeting') AS meeting_count,
           (SELECT COUNT(*) FROM communication_messages
            WHERE communication_messages.workspace_id = $1
              AND communication_messages.project_id = projects.id) AS communication_count,
           (SELECT COUNT(*) FROM time_entries
            WHERE time_entries.workspace_id = $1
              AND time_entries.project_id = projects.id) AS time_entry_count,
           (SELECT COUNT(*) FROM invoices
            WHERE invoices.workspace_id = $1
              AND invoices.project_id = projects.id) AS invoice_count,
           (SELECT COUNT(*) FROM workspace_payments
            JOIN invoices ON invoices.id = workspace_payments.invoice_id
            WHERE workspace_payments.workspace_id = $1
              AND invoices.project_id = projects.id) +
           (SELECT COUNT(*) FROM payment_links
            JOIN invoices ON invoices.id = payment_links.invoice_id
            WHERE payment_links.workspace_id = $1
              AND payment_links.status = 'paid'
              AND invoices.project_id = projects.id
              AND NOT EXISTS (
                SELECT 1 FROM workspace_payments
                WHERE workspace_payments.workspace_id = payment_links.workspace_id
                  AND workspace_payments.invoice_id = payment_links.invoice_id
              )) AS payment_count
         FROM projects
         WHERE projects.workspace_id = $1
         ORDER BY projects.name ASC`,
        [workspaceId],
      ),
    ])
    const count = (rows) => Number(rows[0]?.count || 0)
    const mappedProjects = projects.map((project) => ({
      id: project.id,
      name: project.name,
      clientId: project.client_id,
      connections: {
        meetings: Number(project.meeting_count || 0),
        communications: Number(project.communication_count || 0),
        timeEntries: Number(project.time_entry_count || 0),
        invoices: Number(project.invoice_count || 0),
        payments: Number(project.payment_count || 0),
      },
    }))
    return {
      counts: {
        clients: count(clientCount),
        projects: count(projectCount),
        communications: count(communicationCount),
        meetings: count(meetingCount),
        invoices: count(invoiceCount),
        timeEntries: count(timeEntryCount),
        payments: count(workspacePaymentCount) + count(providerPaymentCount),
      },
      clients: clients.map((client) => ({
        id: client.id,
        name: client.name,
        projects: mappedProjects.filter((project) => project.clientId === client.id),
      })),
      unlinkedProjects: mappedProjects.filter((project) => !project.clientId),
    }
  }

  async function listOpportunities(context, { status = 'active', limit = 50 } = {}) {
    const { workspaceId } = trustedScope(context)
    if (status && !['active', 'dismissed', 'resolved', 'expired'].includes(status)) {
      throw new ConnectedIntelligenceError('INVALID_OPPORTUNITY_STATUS', 'Use a supported opportunity status.')
    }
    const boundedLimit = Math.min(100, Math.max(1, Number.isInteger(limit) ? limit : 50))
    const params = [workspaceId]
    let filter = ''
    if (status) {
      params.push(status)
      filter = ` AND status = $${params.length}`
    }
    params.push(boundedLimit)
    const rows = await database.query(
      `SELECT * FROM connected_opportunities
       WHERE workspace_id = $1${filter}
       ORDER BY last_detected_at DESC
       LIMIT $${params.length}`,
      params,
    )
    return rows.map(mapOpportunity)
  }

  async function getOpportunityEvidence(context, opportunityId) {
    const { workspaceId } = trustedScope(context)
    const rows = await database.query(
      'SELECT * FROM connected_opportunities WHERE workspace_id = $1 AND id = $2',
      [workspaceId, String(opportunityId || '')],
    )
    const opportunity = mapOpportunity(rows[0])
    if (!opportunity) return null
    const eventIds = [...new Set(opportunity.evidence
      .filter((item) => item?.type === 'workspace_event' && item.id)
      .map((item) => String(item.id)))]
      .slice(0, 100)
    if (eventIds.length === 0) return { opportunity, evidence: [] }
    const placeholders = eventIds.map((_, index) => `$${index + 2}`).join(', ')
    const evidenceRows = await database.query(
      `SELECT id, event_type, entity_type, entity_id, client_id, project_id,
         source_channel, importance, occurred_at
       FROM workspace_events
       WHERE workspace_id = $1 AND id IN (${placeholders})`,
      [workspaceId, ...eventIds],
    )
    const evidenceById = new Map(evidenceRows.map((item) => [item.id, item]))
    return {
      opportunity,
      evidence: eventIds.flatMap((id) => {
        const event = evidenceById.get(id)
        return event ? [{
          id: event.id,
          eventType: event.event_type,
          entityType: event.entity_type,
          entityId: event.entity_id,
          clientId: event.client_id,
          projectId: event.project_id,
          source: event.source_channel,
          importance: Number(event.importance),
          occurredAt: event.occurred_at,
        }] : []
      }),
    }
  }

  return {
    createCalendarEvent,
    listCalendarEvents,
    completeDueMeetings,
    getMeetingFeatures,
    observeCommunication,
    observeFixtureCommunication,
    getCommunicationRelationship,
    confirmThreadProject,
    getCommunicationFeatures,
    detectProjectMeetingLoad,
    detectClientAttentionLoad,
    getWorkspaceSummary,
    getIntelligenceSummary: inspections.getSummary,
    getSummary,
    startInspection: inspections.startInspection,
    completeInspection: inspections.completeInspection,
    failInspection: inspections.failInspection,
    listActivity: inspections.listActivity,
    getActivity: inspections.getActivity,
    listOpportunities,
    getOpportunityEvidence,
  }
}
