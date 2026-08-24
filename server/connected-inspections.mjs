import { randomUUID } from 'node:crypto'

const terminalStatuses = new Set(['all_clear', 'signal_found', 'opportunity_created'])
const countKeys = new Set([
  'messages',
  'threads',
  'peopleResolved',
  'clientsMatched',
  'projectsCompared',
  'meetings',
  'clients',
  'projects',
  'communicationRecords',
  'meetingRecords',
])

function workspaceIdFrom(context) {
  const workspaceId = String(context?.workspace?.id || '').trim()
  if (!workspaceId) throw new TypeError('Connected inspection requires trusted workspace context.')
  return workspaceId
}

function boundedKey(value, field) {
  const key = String(value || '').trim()
  if (!/^[a-z][a-z0-9_-]{0,79}$/.test(key)) {
    throw new TypeError(`${field} must be a bounded semantic key.`)
  }
  return key
}

function boundedText(value, maximum = 1_000) {
  return String(value || '').trim().slice(0, maximum) || null
}

function count(value) {
  const number = Number(value || 0)
  if (!Number.isInteger(number) || number < 0) throw new TypeError('Inspection counts must be non-negative integers.')
  return number
}

function metadataJson(value) {
  const metadata = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const serialized = JSON.stringify(metadata)
  if (serialized.length > 16_000) throw new TypeError('Inspection metadata is too large.')
  return serialized
}

function parseJson(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function mapInspection(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    inspectionType: row.inspection_type,
    sourceType: row.source_type,
    clientId: row.client_id,
    projectId: row.project_id,
    status: row.status,
    recordsInspected: Number(row.records_inspected || 0),
    signalsFound: Number(row.signals_found || 0),
    summary: row.summary,
    relatedOpportunityId: row.related_opportunity_id,
    metadata: parseJson(row.metadata_json),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function activityTitle(inspection) {
  if (inspection.inspectionType === 'mail') return 'Checked recent communication'
  if (inspection.inspectionType === 'calendar') return 'Checked recent meeting activity'
  if (inspection.inspectionType === 'client') return 'Checked client activity'
  if (inspection.inspectionType === 'project') return 'Checked project activity'
  if (inspection.inspectionType === 'cross_source') return 'Compared connected workspace signals'
  return 'Checked workspace activity'
}

function activityCharacter(inspection) {
  if (inspection.status === 'opportunity_created' || inspection.status === 'signal_found') return 'insight'
  if (inspection.status === 'all_clear') return 'all-clear'
  if (inspection.status === 'failed') return 'investigate'
  if (inspection.inspectionType === 'mail') return 'mail'
  if (inspection.inspectionType === 'calendar') return 'calendar'
  return 'connected'
}

function semanticActivity(inspection) {
  const counts = {}
  for (const [key, value] of Object.entries(inspection.metadata)) {
    if (countKeys.has(key) && Number.isInteger(Number(value)) && Number(value) >= 0) {
      counts[key] = Number(value)
    }
  }
  if (Object.keys(counts).length === 0 && inspection.recordsInspected > 0) {
    counts.records = inspection.recordsInspected
  }
  return {
    id: inspection.id,
    type: inspection.inspectionType,
    source: inspection.sourceType,
    status: inspection.status,
    title: activityTitle(inspection),
    summary: inspection.summary,
    counts,
    clientId: inspection.clientId,
    projectId: inspection.projectId,
    opportunityId: inspection.relatedOpportunityId,
    character: activityCharacter(inspection),
    startedAt: inspection.startedAt,
    completedAt: inspection.completedAt,
  }
}

export function createConnectedInspectionService({ database, now = () => new Date(), logger = console } = {}) {
  if (!database?.query) throw new TypeError('Connected inspections require the Lancee database adapter.')

  const nowIso = () => {
    const value = now()
    const date = value instanceof Date ? value : new Date(value)
    if (!Number.isFinite(date.getTime())) throw new TypeError('Connected inspection now() returned an invalid date.')
    return date.toISOString()
  }

  async function safe(operation, fallback = null) {
    try {
      return await operation()
    } catch (error) {
      logger.warn?.('connected_intelligence.inspection_persistence_failed', {
        code: error?.code || 'INSPECTION_PERSISTENCE_FAILED',
        message: error?.message || 'Inspection persistence failed.',
      })
      return fallback
    }
  }

  async function startInspection(context, input) {
    const workspaceId = workspaceIdFrom(context)
    const clientId = boundedText(input?.clientId, 160)
    const projectId = boundedText(input?.projectId, 160)
    if (clientId) {
      const clients = await database.query(
        'SELECT id FROM clients WHERE workspace_id = $1 AND id = $2',
        [workspaceId, clientId],
      )
      if (!clients[0]) throw new TypeError('The inspection client is not in the inspected workspace.')
    }
    if (projectId) {
      const projects = await database.query(
        'SELECT id FROM projects WHERE workspace_id = $1 AND id = $2',
        [workspaceId, projectId],
      )
      if (!projects[0]) throw new TypeError('The inspection project is not in the inspected workspace.')
    }
    const startedAt = nowIso()
    const id = `cinsp_${randomUUID().replaceAll('-', '')}`
    await database.query(
      `INSERT INTO connected_inspections (
         id, workspace_id, inspection_type, source_type, client_id, project_id,
         status, records_inspected, signals_found, summary,
         related_opportunity_id, metadata_json, started_at, completed_at,
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'inspecting', 0, 0, $7, NULL, $8, $9, NULL, $9, $9)`,
      [
        id,
        workspaceId,
        boundedKey(input?.inspectionType, 'inspectionType'),
        boundedKey(input?.sourceType, 'sourceType'),
        clientId,
        projectId,
        boundedText(input?.summary),
        metadataJson(input?.metadata),
        startedAt,
      ],
    )
    return getInspection(context, id)
  }

  async function completeInspection(context, inspectionId, input = {}) {
    const workspaceId = workspaceIdFrom(context)
    const status = String(input.status || 'all_clear')
    if (!terminalStatuses.has(status)) throw new TypeError('Use a supported completed inspection status.')
    const relatedOpportunityId = boundedText(input.relatedOpportunityId, 160)
    if (relatedOpportunityId) {
      const opportunity = await database.query(
        'SELECT id FROM connected_opportunities WHERE workspace_id = $1 AND id = $2',
        [workspaceId, relatedOpportunityId],
      )
      if (!opportunity[0]) throw new TypeError('The related opportunity is not in the inspected workspace.')
    }
    const existing = await getInspection(context, inspectionId)
    if (!existing) return null
    const completedAt = nowIso()
    await database.query(
      `UPDATE connected_inspections
       SET status = $1, records_inspected = $2, signals_found = $3,
         summary = $4, related_opportunity_id = $5, metadata_json = $6,
         completed_at = $7, updated_at = $7
       WHERE workspace_id = $8 AND id = $9 AND status = 'inspecting'`,
      [
        status,
        count(input.recordsInspected),
        count(input.signalsFound),
        boundedText(input.summary) || existing.summary,
        relatedOpportunityId,
        metadataJson({ ...existing.metadata, ...(input.metadata || {}) }),
        completedAt,
        workspaceId,
        String(inspectionId || ''),
      ],
    )
    return getInspection(context, inspectionId)
  }

  async function failInspection(context, inspectionId, error, input = {}) {
    const workspaceId = workspaceIdFrom(context)
    const existing = await getInspection(context, inspectionId)
    if (!existing) return null
    const completedAt = nowIso()
    const errorCode = boundedText(error?.code || 'INSPECTION_FAILED', 120)
    await database.query(
      `UPDATE connected_inspections
       SET status = 'failed', records_inspected = $1, signals_found = $2,
         summary = $3, metadata_json = $4, completed_at = $5, updated_at = $5
       WHERE workspace_id = $6 AND id = $7 AND status = 'inspecting'`,
      [
        count(input.recordsInspected),
        count(input.signalsFound),
        boundedText(input.summary) || 'Connected Intelligence could not complete this inspection.',
        metadataJson({ ...existing.metadata, ...(input.metadata || {}), errorCode }),
        completedAt,
        workspaceId,
        String(inspectionId || ''),
      ],
    )
    return getInspection(context, inspectionId)
  }

  async function getInspection(context, inspectionId) {
    const workspaceId = workspaceIdFrom(context)
    const rows = await database.query(
      'SELECT * FROM connected_inspections WHERE workspace_id = $1 AND id = $2',
      [workspaceId, String(inspectionId || '')],
    )
    return mapInspection(rows[0])
  }

  async function listActivity(context, { limit = 50, offset = 0 } = {}) {
    const workspaceId = workspaceIdFrom(context)
    const boundedLimit = Math.min(100, Math.max(1, Number.isInteger(limit) ? limit : 50))
    const boundedOffset = Math.min(10_000, Math.max(0, Number.isInteger(offset) ? offset : 0))
    const [rows, totals] = await Promise.all([
      database.query(
        `SELECT * FROM connected_inspections
         WHERE workspace_id = $1
         ORDER BY started_at DESC, created_at DESC
         LIMIT $2 OFFSET $3`,
        [workspaceId, boundedLimit, boundedOffset],
      ),
      database.query('SELECT COUNT(*) AS count FROM connected_inspections WHERE workspace_id = $1', [workspaceId]),
    ])
    return {
      activity: rows.map(mapInspection).map(semanticActivity),
      pagination: {
        limit: boundedLimit,
        offset: boundedOffset,
        total: Number(totals[0]?.count || 0),
      },
    }
  }

  async function getActivity(context, inspectionId) {
    const inspection = await getInspection(context, inspectionId)
    return inspection ? semanticActivity(inspection) : null
  }

  async function getSummary(context) {
    const workspaceId = workspaceIdFrom(context)
    const recentCutoff = new Date(new Date(nowIso()).getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString()
    const [opportunities, inspections, clients, recent] = await Promise.all([
      database.query(
        `SELECT COUNT(*) AS count FROM connected_opportunities
         WHERE workspace_id = $1 AND status = 'active'`,
        [workspaceId],
      ),
      database.query(
        `SELECT inspection_type, status, records_inspected, signals_found, metadata_json
         FROM connected_inspections WHERE workspace_id = $1`,
        [workspaceId],
      ),
      database.query(
        `SELECT DISTINCT client_id FROM connected_inspections
         WHERE workspace_id = $1 AND client_id IS NOT NULL AND status <> 'failed'`,
        [workspaceId],
      ),
      database.query(
        `SELECT COUNT(*) AS count FROM connected_inspections
         WHERE workspace_id = $1 AND started_at >= $2`,
        [workspaceId, recentCutoff],
      ),
    ])
    const findings = Number(opportunities[0]?.count || 0)
    const successful = inspections.filter((item) => item.status !== 'inspecting' && item.status !== 'failed')
    const inspectedRecords = (type) => successful
      .filter((item) => item.inspection_type === type)
      .reduce((total, item) => total + Number(item.records_inspected || 0), 0)
    const hasInspectedActivity = successful.some((item) => {
      const metadata = parseJson(item.metadata_json)
      return metadata.sufficientEvidence !== false && (
        Number(item.records_inspected || 0) > 0 || Number(item.signals_found || 0) > 0
      )
    })
    return {
      findings,
      clientsInspected: clients.length,
      messagesInspected: inspectedRecords('mail'),
      meetingsInspected: inspectedRecords('calendar'),
      recentInspections: Number(recent[0]?.count || 0),
      status: findings > 0
        ? 'attention_needed'
        : hasInspectedActivity ? 'all_clear' : 'insufficient_activity',
    }
  }

  return Object.freeze({
    startInspection: (context, input) => safe(() => startInspection(context, input)),
    completeInspection: (context, id, input) => safe(() => completeInspection(context, id, input)),
    failInspection: (context, id, error, input) => safe(() => failInspection(context, id, error, input)),
    getInspection,
    listActivity,
    getActivity,
    getSummary,
  })
}
