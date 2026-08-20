import { randomUUID } from 'node:crypto'
import {
  normalizeDecisionVector,
  normalizeTaxonomyValue,
} from './decision-taxonomy.mjs'
import {
  findRelatedWorkspaceEvents,
  getWorkspaceEvent,
  markWorkspaceEventProcessed,
  recordWorkspaceEvent,
} from './workspace-events.mjs'

export const DECISION_SIGNAL_PATTERNS = Object.freeze([
  /\bwe decided\b/i,
  /\bwe agreed\b/i,
  /\bagreed\b/i,
  /\bapproved\b/i,
  /\bgo ahead\b/i,
  /\blet'?s use\b/i,
  /\blet'?s change\b/i,
  /\bwe(?:'ll| will) use\b/i,
  /\bwe(?:'ll| will) change\b/i,
  /\bfrom next month\b/i,
  /\bstarting next\b/i,
  /\bsee if\b/i,
  /\btest whether\b/i,
])

export const DECISION_CAPTURE_POLICY = Object.freeze({
  version: 'decision-capture-v1',
  autoPromoteThreshold: 0.9,
  reviewThreshold: 0.65,
})

export const HERMES_SIGNAL_CLASSIFICATION_CONTRACT = Object.freeze({
  task: 'classify_workspace_signal',
  allowedClassifications: Object.freeze([
    'decision_candidate',
    'fact',
    'hypothesis',
    'discussion',
    'noise',
  ]),
  output: Object.freeze({
    classification: 'string',
    confidence: 'number:0..1',
    decision: 'normalized decision candidate fields when classification is decision_candidate',
    evidence: 'supporting_text and reason',
  }),
})

const relevantEventPrefixes = Object.freeze([
  'communication.',
  'meeting.',
  'project.',
  'quote.',
  'invoice.',
  'payment.',
  'client.',
  'ai.',
])

export class SignalEngineError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'SignalEngineError'
    this.code = code
    this.status = status
  }
}

function scope(context, { write = false } = {}) {
  const workspaceId = String(context?.workspace?.id || '').trim()
  const userId = String(context?.user?.id || '').trim()
  if (!workspaceId || !userId) {
    throw new SignalEngineError('SIGNAL_CONTEXT_REQUIRED', 'Trusted workspace and user context is required.', 401)
  }
  if (write && context?.membership?.role === 'viewer') {
    throw new SignalEngineError('SIGNAL_PERMISSION_DENIED', 'Workspace write permission is required.', 403)
  }
  return { workspaceId, userId }
}

function confidence(value, field = 'confidence') {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new SignalEngineError('INVALID_SIGNAL', `${field} must be from 0 to 1.`)
  }
  return parsed
}

function bounded(value, maxLength = 2_000) {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, maxLength) : null
}

function mapCandidate(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sourceEventId: row.source_event_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    objectType: row.object_type,
    objectId: row.object_id,
    actionType: row.action_type,
    targetType: row.target_type,
    sourceState: row.source_state,
    destinationState: row.destination_state,
    intentType: row.intent_type,
    expectedMetric: row.expected_metric,
    expectedDirection: row.expected_direction,
    candidateText: row.candidate_text,
    rationaleText: row.rationale_text,
    detectionMethod: row.detection_method,
    detectionConfidence: Number(row.detection_confidence),
    policyVersion: row.policy_version,
    machineClassification: row.machine_classification,
    machineConfidence: Number(row.machine_confidence),
    humanClassification: row.human_classification,
    reviewResult: row.review_result,
    status: row.status,
    promotedDecisionId: row.promoted_decision_id,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function extractEventText(event) {
  const payload = event?.payload || {}
  return bounded(
    payload.text ?? payload.body ?? payload.message ?? payload.content ?? payload.summary,
    5_000,
  ) || ''
}

function expectedVectorDirection(value) {
  const direction = normalizeTaxonomyValue(value)
  if (direction === 'increase') return 'positive'
  if (direction === 'decrease') return 'negative'
  if (direction === 'no_change' || direction === 'maintain') return 'neutral'
  return direction
}

function completeVector(candidate) {
  return Boolean(
    candidate.objectType &&
    candidate.actionType &&
    candidate.targetType &&
    candidate.intentType &&
    candidate.expectedDirection,
  )
}

export function hasDecisionLanguage(text = '') {
  return DECISION_SIGNAL_PATTERNS.some((pattern) => pattern.test(String(text)))
}

export function isIntelligenceRelevant(event) {
  const type = String(event?.eventType || '')
  return relevantEventPrefixes.some((prefix) => type.startsWith(prefix)) || Boolean(event?.payload?.decisionSignal)
}

export function shouldRequestSemanticClassification(event) {
  return hasDecisionLanguage(extractEventText(event))
}

export function decisionCandidateAction(candidate, policy = DECISION_CAPTURE_POLICY) {
  const candidateConfidence = confidence(candidate?.detectionConfidence, 'detectionConfidence')
  if (candidateConfidence >= policy.autoPromoteThreshold) return 'auto_promote'
  if (candidateConfidence >= policy.reviewThreshold) return 'request_review'
  return 'activity_only'
}

export function detectStructuredSignals(event) {
  const payload = event?.payload || {}
  if (payload.decisionSignal && typeof payload.decisionSignal === 'object') {
    const signal = payload.decisionSignal
    return {
      isDecision: true,
      confidence: confidence(signal.confidence ?? 0.98),
      candidateText: bounded(signal.candidateText ?? signal.candidate_text ?? extractEventText(event), 5_000),
      rationaleText: bounded(signal.rationaleText ?? signal.rationale_text ?? payload.reason, 5_000),
      vector: signal,
    }
  }
  if (event?.eventType === 'quote.updated') {
    const previousAmount = Number(payload.previousAmount ?? payload.previous_amount)
    const currentAmount = Number(payload.currentAmount ?? payload.current_amount)
    const intentType = payload.intentType ?? payload.intent_type
    if (Number.isFinite(previousAmount) && Number.isFinite(currentAmount) && previousAmount !== currentAmount && intentType) {
      const reduced = currentAmount < previousAmount
      return {
        isDecision: true,
        confidence: 0.96,
        candidateText: `Change quote amount from ${previousAmount} to ${currentAmount}.`,
        rationaleText: bounded(payload.reason, 5_000),
        vector: {
          objectType: 'quote',
          objectId: event.entityId,
          actionType: reduced ? 'reduce_price' : 'increase_price',
          targetType: 'quote_amount',
          sourceState: String(previousAmount),
          destinationState: String(currentAmount),
          intentType,
          expectedMetric: payload.expectedMetric ?? payload.expected_metric ?? 'deal_conversion',
          expectedDirection: payload.expectedDirection ?? payload.expected_direction ?? 'increase',
        },
      }
    }
  }
  return { isDecision: false }
}

export function buildHermesSignalClassificationRequest(event, relatedEvents = []) {
  return {
    task: HERMES_SIGNAL_CLASSIFICATION_CONTRACT.task,
    event: {
      id: event.id,
      type: event.eventType,
      text: extractEventText(event),
      occurred_at: event.occurredAt,
    },
    known_context: {
      entity_type: event.entityType,
      entity_id: event.entityId,
      project_id: event.projectId,
      client_id: event.clientId,
      related_events: relatedEvents.slice(0, 10).map((related) => ({
        id: related.id,
        type: related.eventType,
        occurred_at: related.occurredAt,
        payload: related.payload,
      })),
    },
    allowed_classifications: [...HERMES_SIGNAL_CLASSIFICATION_CONTRACT.allowedClassifications],
  }
}

export function createSignalEngine({
  database,
  decisionDynamics = null,
  semanticClassifier = null,
  policy = DECISION_CAPTURE_POLICY,
  now = () => new Date(),
} = {}) {
  if (!database?.query) throw new TypeError('The Signal Engine requires the Lancee database adapter.')
  if (
    !policy?.version ||
    !Number.isFinite(policy.autoPromoteThreshold) ||
    !Number.isFinite(policy.reviewThreshold) ||
    policy.reviewThreshold < 0 ||
    policy.autoPromoteThreshold > 1 ||
    policy.reviewThreshold >= policy.autoPromoteThreshold
  ) {
    throw new TypeError('The Signal Engine requires a valid versioned capture policy.')
  }

  const timestamp = () => {
    const value = now()
    const date = value instanceof Date ? value : new Date(value)
    if (!Number.isFinite(date.getTime())) throw new TypeError('Signal Engine now() returned an invalid date.')
    return date.toISOString()
  }

  async function getDecisionCandidate(context, candidateId) {
    const { workspaceId } = scope(context)
    const rows = await database.query(
      `SELECT * FROM decision_candidates WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, String(candidateId || '')],
    )
    return mapCandidate(rows[0])
  }

  async function listDecisionCandidates(context, { status = null, limit = 50 } = {}) {
    const { workspaceId } = scope(context)
    const boundedLimit = Math.min(100, Math.max(1, Number.isInteger(limit) ? limit : 50))
    const params = [workspaceId]
    let filter = ''
    if (status) {
      params.push(String(status))
      filter = ` AND status = $${params.length}`
    }
    params.push(boundedLimit)
    const rows = await database.query(
      `SELECT * FROM decision_candidates
       WHERE workspace_id = $1${filter}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    )
    return rows.map(mapCandidate)
  }

  async function createDecisionCandidate(context, event, signal, detectionMethod) {
    const { workspaceId } = scope(context, { write: true })
    const existingRows = await database.query(
      `SELECT * FROM decision_candidates WHERE workspace_id = $1 AND source_event_id = $2`,
      [workspaceId, event.id],
    )
    if (existingRows[0]) return mapCandidate(existingRows[0])
    const vector = signal.vector || signal.decision || {}
    const candidateConfidence = confidence(signal.confidence)
    const candidateText = bounded(signal.candidateText ?? signal.evidence?.supporting_text ?? extractEventText(event), 5_000)
    if (!candidateText) throw new SignalEngineError('INVALID_SIGNAL', 'A decision candidate must preserve its source language.')
    const id = `dcan_${randomUUID().replaceAll('-', '')}`
    const createdAt = timestamp()
    await database.query(
      `INSERT INTO decision_candidates (
         id, workspace_id, source_event_id, source_type, source_id,
         object_type, object_id, action_type, target_type, source_state,
         destination_state, intent_type, expected_metric, expected_direction,
         candidate_text, rationale_text, detection_method, detection_confidence,
         policy_version, machine_classification, machine_confidence, status,
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'decision_candidate', $20, 'pending', $21, $22)`,
      [
        id,
        workspaceId,
        event.id,
        event.sourceChannel || event.entityType || 'workspace_event',
        event.sourceIdentifier || event.entityId || event.id,
        normalizeTaxonomyValue(vector.objectType ?? vector.object_type),
        bounded(vector.objectId ?? vector.object_id ?? vector.objectReference ?? vector.object_reference ?? event.entityId, 240),
        normalizeTaxonomyValue(vector.actionType ?? vector.action_type),
        normalizeTaxonomyValue(vector.targetType ?? vector.target_type),
        normalizeTaxonomyValue(vector.sourceState ?? vector.source_state),
        normalizeTaxonomyValue(vector.destinationState ?? vector.destination_state),
        normalizeTaxonomyValue(vector.intentType ?? vector.intent_type),
        normalizeTaxonomyValue(vector.expectedMetric ?? vector.expected_metric),
        normalizeTaxonomyValue(vector.expectedDirection ?? vector.expected_direction),
        candidateText,
        bounded(signal.rationaleText ?? signal.evidence?.reason, 5_000),
        detectionMethod,
        candidateConfidence,
        policy.version,
        candidateConfidence,
        createdAt,
        createdAt,
      ],
    )
    const candidate = await getDecisionCandidate(context, id)
    await recordWorkspaceEvent({
      database,
      context,
      eventType: 'decision_candidate.detected',
      entityType: 'decision_candidate',
      entityId: candidate.id,
      payload: {
        sourceEventId: event.id,
        detectionMethod,
        detectionConfidence: candidate.detectionConfidence,
        policyVersion: policy.version,
      },
      importance: 80,
    })
    return candidate
  }

  async function promoteCandidate(context, candidate, status) {
    if (!decisionDynamics?.createDecision) {
      throw new SignalEngineError('DECISION_DYNAMICS_UNAVAILABLE', 'Decision Dynamics is required to promote a candidate.', 503)
    }
    if (!completeVector(candidate)) {
      throw new SignalEngineError('CANDIDATE_REVIEW_REQUIRED', 'The candidate needs a complete decision vector before promotion.', 409)
    }
    const sourceEvent = await getWorkspaceEvent(database, context, candidate.sourceEventId)
    if (!sourceEvent) throw new SignalEngineError('SOURCE_EVENT_NOT_FOUND', 'The candidate source event was not found.', 404)
    const normalizedVector = normalizeDecisionVector({
      objectType: candidate.objectType,
      actionType: candidate.actionType,
      targetType: candidate.targetType,
      sourceState: candidate.sourceState,
      destinationState: candidate.destinationState,
      intentType: candidate.intentType,
      expectedDirection: expectedVectorDirection(candidate.expectedDirection),
    })
    const decision = await decisionDynamics.createDecision(context, {
      title: candidate.candidateText.slice(0, 200),
      decisionText: candidate.candidateText,
      rationale: candidate.rationaleText,
      intent: candidate.intentType,
      objectType: candidate.objectType,
      objectId: candidate.objectId,
      clientId: sourceEvent.clientId,
      projectId: sourceEvent.projectId,
      conversationId: sourceEvent.conversationId,
      decidedAt: sourceEvent.occurredAt,
      status: 'active',
      vector: normalizedVector,
      expectedReactions: candidate.expectedMetric ? [{
        metricKey: candidate.expectedMetric,
        direction: candidate.expectedDirection,
        confidence: candidate.detectionConfidence,
      }] : [],
      evidence: [{
        sourceType: 'event',
        sourceId: sourceEvent.id,
        relation: 'observed_action',
        summary: candidate.candidateText,
        weight: candidate.detectionConfidence,
      }],
      sourceCandidateId: candidate.id,
    })
    const reviewedAt = timestamp()
    await database.query(
      `UPDATE decision_candidates
       SET status = $1, promoted_decision_id = $2, review_result = $3,
           human_classification = $4, reviewed_by = $5, reviewed_at = $6,
           updated_at = $7
       WHERE workspace_id = $8 AND id = $9`,
      [
        status,
        decision.id,
        status === 'auto_promoted' ? 'auto_promoted' : 'promoted',
        status === 'auto_promoted' ? null : 'decision_candidate',
        status === 'auto_promoted' ? null : scope(context).userId,
        reviewedAt,
        reviewedAt,
        scope(context).workspaceId,
        candidate.id,
      ],
    )
    return { candidate: await getDecisionCandidate(context, candidate.id), decision }
  }

  async function processWorkspaceEvent(eventOrId, context) {
    scope(context, { write: true })
    const eventId = typeof eventOrId === 'string' ? eventOrId : eventOrId?.id
    const event = await getWorkspaceEvent(database, context, eventId)
    if (!event) throw new SignalEngineError('WORKSPACE_EVENT_NOT_FOUND', 'Workspace event not found.', 404)
    if (event.processedAt) {
      const candidate = (await listDecisionCandidates(context, { limit: 100 }))
        .find((item) => item.sourceEventId === event.id) || null
      return { classification: candidate ? 'decision_candidate' : 'activity_only', candidate, processed: true }
    }
    if (!isIntelligenceRelevant(event)) {
      await markWorkspaceEventProcessed(database, context, event.id, timestamp())
      return { classification: 'noise' }
    }

    const structured = detectStructuredSignals(event)
    let result
    if (structured.isDecision) {
      result = { ...structured, classification: 'decision_candidate', decision: structured.vector }
    } else if (!shouldRequestSemanticClassification(event)) {
      await markWorkspaceEventProcessed(database, context, event.id, timestamp())
      return { classification: 'activity_only' }
    } else if (typeof semanticClassifier !== 'function') {
      await markWorkspaceEventProcessed(database, context, event.id, timestamp())
      return {
        classification: 'activity_only',
        semanticClassification: 'not_configured',
        request: buildHermesSignalClassificationRequest(event),
      }
    } else {
      const relatedEvents = event.entityId
        ? await findRelatedWorkspaceEvents(database, context, {
            entityType: event.entityType,
            entityId: event.entityId,
            around: event.occurredAt,
            limit: 10,
          })
        : []
      const request = buildHermesSignalClassificationRequest(event, relatedEvents)
      result = await semanticClassifier(request, context)
      if (!HERMES_SIGNAL_CLASSIFICATION_CONTRACT.allowedClassifications.includes(result?.classification)) {
        throw new SignalEngineError('INVALID_SEMANTIC_RESULT', 'Semantic classification returned an unsupported classification.', 502)
      }
      if (result.classification !== 'decision_candidate') {
        await markWorkspaceEventProcessed(database, context, event.id, timestamp())
        return { classification: result.classification, confidence: confidence(result.confidence) }
      }
    }

    const candidateAction = decisionCandidateAction({ detectionConfidence: result.confidence }, policy)
    if (candidateAction === 'activity_only') {
      await markWorkspaceEventProcessed(database, context, event.id, timestamp())
      return { classification: 'activity_only', machineClassification: 'decision_candidate', confidence: result.confidence }
    }
    const candidate = await createDecisionCandidate(
      context,
      event,
      {
        ...result,
        vector: result.vector || result.decision,
        candidateText: result.candidateText,
        rationaleText: result.rationaleText,
      },
      structured.isDecision ? 'structured' : 'semantic',
    )
    await markWorkspaceEventProcessed(database, context, event.id, timestamp())
    if (candidateAction === 'auto_promote' && completeVector(candidate)) {
      const promoted = await promoteCandidate(context, candidate, 'auto_promoted')
      return { classification: 'decision_candidate', action: candidateAction, ...promoted }
    }
    return { classification: 'decision_candidate', action: 'request_review', candidate }
  }

  async function reviewDecisionCandidate(context, candidateId, action, corrections = {}) {
    const { workspaceId, userId } = scope(context, { write: true })
    const candidate = await getDecisionCandidate(context, candidateId)
    if (!candidate) throw new SignalEngineError('DECISION_CANDIDATE_NOT_FOUND', 'Decision candidate not found.', 404)
    if (candidate.status !== 'pending') {
      throw new SignalEngineError('CANDIDATE_ALREADY_REVIEWED', 'The decision candidate has already been reviewed.', 409)
    }
    if (action === 'reject') {
      const reviewedAt = timestamp()
      await database.query(
        `UPDATE decision_candidates
         SET status = 'rejected', human_classification = 'not_a_decision',
             review_result = 'rejected', reviewed_by = $1, reviewed_at = $2,
             updated_at = $3
         WHERE workspace_id = $4 AND id = $5`,
        [userId, reviewedAt, reviewedAt, workspaceId, candidate.id],
      )
      await recordWorkspaceEvent({
        database,
        context,
        eventType: 'decision_candidate.rejected',
        entityType: 'decision_candidate',
        entityId: candidate.id,
        payload: { sourceEventId: candidate.sourceEventId, policyVersion: policy.version },
        importance: 70,
      })
      return { candidate: await getDecisionCandidate(context, candidate.id), decision: null }
    }
    if (!['confirm', 'edit'].includes(action)) {
      throw new SignalEngineError('INVALID_REVIEW_ACTION', 'Use confirm, edit, or reject.')
    }
    let reviewedCandidate = candidate
    if (action === 'edit') {
      const corrected = {
        objectType: normalizeTaxonomyValue(corrections.objectType ?? candidate.objectType),
        objectId: bounded(corrections.objectId ?? candidate.objectId, 240),
        actionType: normalizeTaxonomyValue(corrections.actionType ?? candidate.actionType),
        targetType: normalizeTaxonomyValue(corrections.targetType ?? candidate.targetType),
        sourceState: normalizeTaxonomyValue(corrections.sourceState ?? candidate.sourceState),
        destinationState: normalizeTaxonomyValue(corrections.destinationState ?? candidate.destinationState),
        intentType: normalizeTaxonomyValue(corrections.intentType ?? candidate.intentType),
        expectedMetric: normalizeTaxonomyValue(corrections.expectedMetric ?? candidate.expectedMetric),
        expectedDirection: normalizeTaxonomyValue(corrections.expectedDirection ?? candidate.expectedDirection),
        candidateText: bounded(corrections.candidateText ?? candidate.candidateText, 5_000),
        rationaleText: bounded(corrections.rationaleText ?? candidate.rationaleText, 5_000),
      }
      await database.query(
        `UPDATE decision_candidates SET
           object_type = $1, object_id = $2, action_type = $3, target_type = $4,
           source_state = $5, destination_state = $6, intent_type = $7,
           expected_metric = $8, expected_direction = $9, candidate_text = $10,
           rationale_text = $11, human_classification = 'decision_candidate',
           updated_at = $12
         WHERE workspace_id = $13 AND id = $14`,
        [
          corrected.objectType,
          corrected.objectId,
          corrected.actionType,
          corrected.targetType,
          corrected.sourceState,
          corrected.destinationState,
          corrected.intentType,
          corrected.expectedMetric,
          corrected.expectedDirection,
          corrected.candidateText,
          corrected.rationaleText,
          timestamp(),
          workspaceId,
          candidate.id,
        ],
      )
      reviewedCandidate = await getDecisionCandidate(context, candidate.id)
    }
    const promoted = await promoteCandidate(context, reviewedCandidate, action === 'edit' ? 'edited' : 'confirmed')
    await recordWorkspaceEvent({
      database,
      context,
      eventType: 'decision_candidate.confirmed',
      entityType: 'decision_candidate',
      entityId: candidate.id,
      payload: { decisionId: promoted.decision.id, reviewAction: action, policyVersion: policy.version },
      importance: 90,
    })
    return promoted
  }

  return {
    policy: Object.freeze({ ...policy }),
    processWorkspaceEvent,
    getDecisionCandidate,
    listDecisionCandidates,
    reviewDecisionCandidate,
  }
}
