import { randomUUID } from 'node:crypto'

const communicationEvents = new Set(['communication.received', 'communication.sent'])
const sensitiveKeyPattern = /(?:password|secret|token|authorization|cookie|api[_-]?key|access[_-]?key|refresh[_-]?key|private[_-]?key)/i

export const WORKSPACE_EVENT_TAXONOMY = Object.freeze([
  'communication.received',
  'communication.sent',
  'meeting.created',
  'meeting.completed',
  'project.created',
  'project.updated',
  'project.completed',
  'task.created',
  'task.completed',
  'task.assigned',
  'task.unassigned',
  'note.task_linked',
  'note.task_unlinked',
  'member.mentioned',
  'file.created',
  'file.uploaded',
  'file.updated',
  'quote.created',
  'quote.updated',
  'quote.approved',
  'quote.rejected',
  'invoice.created',
  'invoice.sent',
  'invoice.paid',
  'invoice.overdue',
  'payment.received',
  'client.created',
  'client.updated',
  'ai.prompted',
  'ai.responded',
  'decision_candidate.detected',
  'decision_candidate.confirmed',
  'decision_candidate.rejected',
  'decision.created',
  'decision.updated',
  'decision.reviewed',
  'decision.comparison_reviewed',
  'decision.learning_model_updated',
  'decision.pattern_detected',
  'decision.prediction_created',
  'decision.prediction_measured',
  'decision.warning_created',
  'decision.causal_assessed',
  'outcome.observation_started',
  'outcome.observation_completed',
  'outcome.recorded',
])

export class WorkspaceEventError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'WorkspaceEventError'
    this.code = code
    this.status = status
  }
}

function trustedScope(context) {
  const workspaceId = String(context?.workspace?.id || '').trim()
  const actorId = String(context?.user?.id || '').trim() || null
  if (!workspaceId) {
    throw new WorkspaceEventError('WORKSPACE_CONTEXT_REQUIRED', 'Trusted workspace context is required.', 401)
  }
  return { workspaceId, actorId }
}

function boundedText(value, field, maxLength, { required = false } = {}) {
  const text = String(value ?? '').trim()
  if (required && !text) throw new WorkspaceEventError('INVALID_EVENT', `${field} is required.`)
  if (text.length > maxLength) throw new WorkspaceEventError('INVALID_EVENT', `${field} is too long.`)
  return text || null
}

function cleanPayload(value, seen = new WeakSet()) {
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return value
  if (!value || typeof value !== 'object' || seen.has(value)) return null
  seen.add(value)
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => cleanPayload(item, seen))
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !sensitiveKeyPattern.test(key))
      .slice(0, 100)
      .map(([key, child]) => [key, cleanPayload(child, seen)]),
  )
}

function parseJson(value, fallback) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function mapWorkspaceEvent(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    actorId: row.actor_id,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    clientId: row.client_id,
    projectId: row.project_id,
    conversationId: row.conversation_id,
    connectionId: row.connection_id,
    sourceChannel: row.source_channel,
    sourceIdentifier: row.source_identifier,
    participantRefs: parseJson(row.participant_refs_json, []),
    payload: parseJson(row.payload_json, {}),
    importance: Number(row.importance),
    occurredAt: row.occurred_at,
    processedAt: row.processed_at,
    createdAt: row.created_at,
  }
}

async function requireWorkspaceResource(database, workspaceId, table, id, label) {
  if (!id) return
  const rows = await database.query(
    `SELECT id FROM ${table} WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, id],
  )
  if (!rows[0]) throw new WorkspaceEventError('EVENT_SOURCE_NOT_FOUND', `${label} was not found.`, 404)
}

async function requireAuthorizedCommunication(database, workspaceId, event) {
  if (!communicationEvents.has(event.eventType)) return
  if (!event.connectionId || !event.sourceChannel || !event.sourceIdentifier) {
    throw new WorkspaceEventError(
      'COMMUNICATION_PROVENANCE_REQUIRED',
      'Connected communications require a connection id, source channel, and source identifier.',
    )
  }
  let rows = []
  if (event.connectionId === 'fixture') {
    rows = await database.query(
      `SELECT workspace_id AS id FROM workspace_fixture_markers
       WHERE workspace_id = $1 AND purpose = 'connected_intelligence_test'`,
      [workspaceId],
    )
  } else if (event.connectionId === 'mail') {
    rows = await database.query(
      `SELECT workspace_id AS id FROM mail_accounts WHERE workspace_id = $1 AND status = 'connected'`,
      [workspaceId],
    )
  } else if (event.connectionId === 'whatsapp') {
    rows = await database.query(
      `SELECT workspace_id AS id FROM whatsapp_connections WHERE workspace_id = $1 AND status = 'connected'`,
      [workspaceId],
    )
  } else {
    rows = await database.query(
      `SELECT id FROM integration_connections
       WHERE workspace_id = $1 AND id = $2 AND status = 'connected'`,
      [workspaceId, event.connectionId],
    )
  }
  if (!rows[0]) {
    throw new WorkspaceEventError(
      'COMMUNICATION_CONNECTION_NOT_AUTHORIZED',
      'The originating communication connection is not authorized for this workspace.',
      403,
    )
  }
}

/** Append one authoritative workspace fact using server-derived workspace context. */
export async function recordWorkspaceEvent({
  database,
  context,
  eventType,
  entityType,
  entityId = null,
  clientId = null,
  projectId = null,
  conversationId = null,
  connectionId = null,
  sourceChannel = null,
  sourceIdentifier = null,
  participantRefs = [],
  payload = {},
  importance = 50,
  occurredAt = null,
}) {
  if (!database?.query) throw new TypeError('recordWorkspaceEvent requires the Lancee database adapter.')
  const { workspaceId, actorId } = trustedScope(context)
  const event = {
    eventType: boundedText(eventType, 'eventType', 120, { required: true }),
    entityType: boundedText(entityType, 'entityType', 80, { required: true }),
    entityId: boundedText(entityId, 'entityId', 160),
    clientId: boundedText(clientId, 'clientId', 160),
    projectId: boundedText(projectId, 'projectId', 160),
    conversationId: boundedText(conversationId, 'conversationId', 160),
    connectionId: boundedText(connectionId, 'connectionId', 160),
    sourceChannel: boundedText(sourceChannel, 'sourceChannel', 80),
    sourceIdentifier: boundedText(sourceIdentifier, 'sourceIdentifier', 240),
  }
  if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(event.eventType)) {
    throw new WorkspaceEventError('INVALID_EVENT', 'eventType must use the resource.action taxonomy.')
  }
  const normalizedImportance = Number(importance)
  if (!Number.isInteger(normalizedImportance) || normalizedImportance < 0 || normalizedImportance > 100) {
    throw new WorkspaceEventError('INVALID_EVENT', 'importance must be an integer from 0 to 100.')
  }
  if (!Array.isArray(participantRefs) || participantRefs.length > 100) {
    throw new WorkspaceEventError('INVALID_EVENT', 'participantRefs must be a bounded array.')
  }
  const occurred = occurredAt ? new Date(occurredAt) : new Date()
  if (!Number.isFinite(occurred.getTime())) {
    throw new WorkspaceEventError('INVALID_EVENT', 'occurredAt must be a valid date-time.')
  }
  await requireWorkspaceResource(database, workspaceId, 'clients', event.clientId, 'Client')
  await requireWorkspaceResource(database, workspaceId, 'projects', event.projectId, 'Project')
  await requireWorkspaceResource(database, workspaceId, 'ai_conversations', event.conversationId, 'Conversation')
  await requireAuthorizedCommunication(database, workspaceId, event)

  const id = `evt_${randomUUID().replaceAll('-', '')}`
  const createdAt = new Date().toISOString()
  await database.query(
    `INSERT INTO workspace_events (
       id, workspace_id, actor_id, event_type, entity_type, entity_id,
       client_id, project_id, conversation_id, connection_id, source_channel,
       source_identifier, participant_refs_json, payload_json, importance,
       occurred_at, processed_at, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NULL, $17)`,
    [
      id,
      workspaceId,
      actorId,
      event.eventType,
      event.entityType,
      event.entityId,
      event.clientId,
      event.projectId,
      event.conversationId,
      event.connectionId,
      event.sourceChannel,
      event.sourceIdentifier,
      JSON.stringify(cleanPayload(participantRefs)),
      JSON.stringify(cleanPayload(payload)),
      normalizedImportance,
      occurred.toISOString(),
      createdAt,
    ],
  )
  return getWorkspaceEvent(database, context, id)
}

export async function getWorkspaceEvent(database, context, eventId) {
  const { workspaceId } = trustedScope(context)
  const rows = await database.query(
    `SELECT * FROM workspace_events WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, String(eventId || '')],
  )
  return mapWorkspaceEvent(rows[0])
}

export async function listWorkspaceEvents(database, context, { limit = 100 } = {}) {
  const { workspaceId } = trustedScope(context)
  const boundedLimit = Math.min(200, Math.max(1, Number.isInteger(limit) ? limit : 100))
  const rows = await database.query(
    `SELECT * FROM workspace_events
     WHERE workspace_id = $1
     ORDER BY occurred_at DESC, created_at DESC
     LIMIT $2`,
    [workspaceId, boundedLimit],
  )
  return rows.map(mapWorkspaceEvent)
}

export async function findRelatedWorkspaceEvents(database, context, {
  entityType,
  entityId,
  around,
  limit = 10,
}) {
  const { workspaceId } = trustedScope(context)
  const boundedLimit = Math.min(20, Math.max(1, Number.isInteger(limit) ? limit : 10))
  const timestamp = new Date(around)
  if (!Number.isFinite(timestamp.getTime())) throw new WorkspaceEventError('INVALID_EVENT', 'around must be a valid date-time.')
  const rows = await database.query(
    `SELECT * FROM workspace_events
     WHERE workspace_id = $1 AND entity_type = $2 AND entity_id = $3
     ORDER BY occurred_at DESC
     LIMIT 100`,
    [workspaceId, entityType, entityId],
  )
  return rows
    .map(mapWorkspaceEvent)
    .sort((left, right) => (
      Math.abs(new Date(left.occurredAt).getTime() - timestamp.getTime()) -
      Math.abs(new Date(right.occurredAt).getTime() - timestamp.getTime())
    ))
    .slice(0, boundedLimit)
}

export async function markWorkspaceEventProcessed(database, context, eventId, processedAt = new Date().toISOString()) {
  const { workspaceId } = trustedScope(context)
  await database.query(
    `UPDATE workspace_events SET processed_at = $1
     WHERE workspace_id = $2 AND id = $3 AND processed_at IS NULL`,
    [processedAt, workspaceId, eventId],
  )
  return getWorkspaceEvent(database, context, eventId)
}
