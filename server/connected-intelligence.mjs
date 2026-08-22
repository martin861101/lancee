import { createHash, randomUUID } from 'node:crypto'
import { recordWorkspaceEvent } from './workspace-events.mjs'

export const PROJECT_MEETING_LOAD_POLICY = Object.freeze({
  version: 'project-meeting-load-v1',
  minimumHistoricalProjects: 3,
  percentile: 0.75,
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

export function createConnectedIntelligenceService({
  database,
  now = () => new Date(),
  policy = PROJECT_MEETING_LOAD_POLICY,
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
        participantRefs: participants,
        sourceChannel: 'calendar',
        sourceIdentifier,
        payload: {
          title,
          startAt,
          endAt,
          durationMinutes: meetingDuration,
          meetingType: kind,
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

  async function completeDueMeetings({ workspaceId = null, eventId = null, completedAt = nowIso() } = {}) {
    const completionTime = timestamp(completedAt, 'completedAt')
    const params = [completionTime]
    const filters = [
      "kind = 'meeting'",
      "status = 'scheduled'",
      'completion_event_id IS NULL',
      'end_at <= $1',
    ]
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
        const context = {
          workspace: { id: event.workspace_id },
          user: event.created_by ? { id: event.created_by } : null,
          membership: { role: 'owner' },
        }
        const workspaceEvent = await recordWorkspaceEvent({
          database,
          context,
          eventType: 'meeting.completed',
          entityType: 'meeting',
          entityId: event.id,
          clientId: event.client_id,
          projectId: event.project_id,
          participantRefs: parseJson(event.participants_json, []),
          sourceChannel: 'calendar',
          sourceIdentifier: event.source_identifier,
          payload: {
            title: event.title,
            startAt: event.start_at,
            endAt: event.end_at,
            durationMinutes: durationMinutes(event.start_at, event.end_at),
            meetingType: event.kind,
            source: event.source,
          },
          importance: 70,
          occurredAt: event.end_at,
        })
        await database.query(
          `UPDATE calendar_events SET completion_event_id = $1 WHERE workspace_id = $2 AND id = $3`,
          [workspaceEvent.id, event.workspace_id, event.id],
        )
        return calendarEventById(event.workspace_id, event.id)
      })
      if (result) completed.push(result)
    }
    const projects = new Map()
    for (const event of completed) {
      if (event.projectId) projects.set(`${event.workspaceId}:${event.projectId}`, event)
    }
    for (const event of projects.values()) {
      await detectProjectMeetingLoad(
        { workspace: { id: event.workspaceId }, user: event.createdBy ? { id: event.createdBy } : null },
        event.projectId,
        { persist: true, completeDue: false },
      )
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
    return { ...result, opportunity }
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

  return {
    createCalendarEvent,
    listCalendarEvents,
    completeDueMeetings,
    getMeetingFeatures,
    detectProjectMeetingLoad,
    listOpportunities,
  }
}
