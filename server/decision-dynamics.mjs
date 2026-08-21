import { randomUUID } from 'node:crypto'
import {
  DECISION_VECTOR_FIELDS,
  DECISION_VECTOR_VERSION,
  normalizeDecisionVector,
  normalizeTaxonomyValue,
} from './decision-taxonomy.mjs'
import { createDecisionLearningService } from './decision-learning.mjs'
import { recordWorkspaceEvent } from './workspace-events.mjs'

export const STRUCTURAL_SCORING_POLICY = Object.freeze({
  version: 'structural-similarity-v1',
  threshold: 0.6,
  maxCandidates: 5,
  retrievalLimit: 200,
  weights: Object.freeze({
    actionType: 0.25,
    objectType: 0.15,
    targetType: 0.15,
    sourceState: 0.1,
    destinationState: 0.05,
    intentType: 0.2,
    expectedDirection: 0.1,
  }),
})

export const COMPARISON_CONFIDENCE_POLICY = Object.freeze({
  version: 'comparison-confidence-v1',
  weights: Object.freeze({
    structuralSimilarity: 0.35,
    contextualSimilarity: 0.3,
    evidenceConfidence: 0.25,
    recencyRelevance: 0.1,
  }),
})

export const EVIDENCE_CONFIDENCE_POLICY = Object.freeze({
  version: 'evidence-confidence-v1',
  contradictionPenalty: 0.25,
  maximumPenalty: 0.75,
})

export const CAUSAL_CONFIDENCE_POLICY = Object.freeze({
  version: 'causal-confidence-v1',
  confounderPenalty: 0.25,
  maximumPenalty: 0.75,
})

export const SEMANTIC_REALITY_CHECK_CONTRACT = Object.freeze({
  version: 'semantic-reality-check-v1',
  input: Object.freeze([
    'new_decision',
    'historical_decision',
    'original_decision_language',
    'rationale',
    'decision_vectors',
    'measured_outcomes',
    'evidence',
    'known_confounders',
    'relevant_business_context',
  ]),
  output: Object.freeze([
    'contextual_similarity',
    'comparable',
    'shared_factors',
    'material_differences',
    'explanation',
  ]),
})

export const DECISION_EVIDENCE_PACK_POLICY = Object.freeze({
  version: 'decision-evidence-pack-v1',
  maxSerializedCharacters: 19_000,
  maxEvidencePerDecision: 2,
  maxConfoundersPerDecision: 2,
  maxMetricsPerDecision: 2,
})

export const OUTCOME_OBSERVATION_POLICY = Object.freeze({
  version: 'decision-outcome-observation-v1',
  maxHorizonDays: 730,
  maxListResults: 100,
})

export const COMPARISON_REVIEW_POLICY = Object.freeze({
  version: 'decision-comparison-review-v1',
  maxFactors: 20,
  maxFactorLength: 500,
  maxExplanationLength: 2_000,
})

export class DecisionDynamicsError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'DecisionDynamicsError'
    this.code = code
    this.status = status
  }
}

function round(value, digits = 6) {
  if (value === null || value === undefined) return null
  const factor = 10 ** digits
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor
}

function bounded(value, field, maxLength, { required = false } = {}) {
  const text = String(value ?? '').trim()
  if (required && !text) throw new DecisionDynamicsError('INVALID_DECISION', `${field} is required.`)
  if (text.length > maxLength) throw new DecisionDynamicsError('INVALID_DECISION', `${field} is too long.`)
  return text || null
}

function numeric(value, field, { nullable = true } = {}) {
  if ((value === null || value === undefined || value === '') && nullable) return null
  const number = Number(value)
  if (!Number.isFinite(number)) throw new DecisionDynamicsError('INVALID_METRIC', `${field} must be a finite number.`)
  return number
}

function boundedConfidence(value, field, { nullable = false } = {}) {
  if ((value === null || value === undefined || value === '') && nullable) return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new DecisionDynamicsError('INVALID_CONFIDENCE', `${field} must be from 0 to 1.`)
  }
  return number
}

function isoDate(value, field, { nullable = true } = {}) {
  if (!value && nullable) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new DecisionDynamicsError('INVALID_DATE', `${field} must be a valid date-time.`)
  return date.toISOString()
}

function parseJson(value, fallback) {
  try {
    return (typeof value === 'string' ? JSON.parse(value) : value) ?? fallback
  } catch {
    return fallback
  }
}

function trustedScope(context, { write = false } = {}) {
  const workspaceId = String(context?.workspace?.id || '').trim()
  const userId = String(context?.user?.id || '').trim()
  if (!workspaceId || !userId) {
    throw new DecisionDynamicsError('DECISION_CONTEXT_REQUIRED', 'Trusted workspace and user context is required.', 401)
  }
  if (write && context?.membership?.role === 'viewer') {
    throw new DecisionDynamicsError('DECISION_PERMISSION_DENIED', 'Workspace write permission is required.', 403)
  }
  return { workspaceId, userId }
}

function mapDecision(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    actorId: row.actor_id,
    objectType: row.object_type,
    objectId: row.object_id,
    clientId: row.client_id,
    projectId: row.project_id,
    conversationId: row.conversation_id,
    sourceCandidateId: row.source_candidate_id,
    title: row.title,
    decisionText: row.decision_text,
    rationale: row.rationale,
    intent: row.intent,
    decidedAt: row.decided_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapVector(row) {
  if (!row) return null
  return {
    decisionId: row.decision_id,
    workspaceId: row.workspace_id,
    objectType: row.object_type,
    actionType: row.action_type,
    targetType: row.target_type,
    sourceState: row.source_state,
    destinationState: row.destination_state,
    intentType: row.intent_type,
    expectedDirection: row.expected_direction,
    vectorVersion: row.vector_version,
    createdAt: row.created_at,
  }
}

function mapExpectedReaction(row) {
  return {
    decisionId: row.decision_id,
    metricKey: row.metric_key,
    direction: row.direction,
    expectedChange: row.expected_change === null ? null : Number(row.expected_change),
    confidence: Number(row.confidence),
    createdAt: row.created_at,
  }
}

function mapMetric(row) {
  if (!row) return null
  return {
    decisionId: row.decision_id,
    metricKey: row.metric_key,
    unit: row.unit,
    baselineValue: row.baseline_value === null ? null : Number(row.baseline_value),
    baselineWindowStart: row.baseline_window_start,
    baselineWindowEnd: row.baseline_window_end,
    observedValue: row.observed_value === null ? null : Number(row.observed_value),
    observationWindowStart: row.observation_window_start,
    observationWindowEnd: row.observation_window_end,
    changeAbsolute: row.change_absolute === null ? null : Number(row.change_absolute),
    changePercent: row.change_percent === null ? null : Number(row.change_percent),
    measurementStatus: row.measurement_status,
    createdAt: row.created_at,
  }
}

function mapOutcome(row) {
  if (!row) return null
  return {
    decisionId: row.decision_id,
    outcomeDirection: row.outcome_direction,
    outcomeClass: row.outcome_class,
    observedReason: row.observed_reason,
    evidenceConfidence: Number(row.evidence_confidence),
    causalConfidence: row.causal_confidence === null ? null : Number(row.causal_confidence),
    confidenceVersion: row.confidence_version,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapEvidence(row) {
  return {
    id: row.id,
    decisionId: row.decision_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    relation: row.relation,
    summary: row.summary,
    weight: Number(row.weight),
    createdAt: row.created_at,
  }
}

function mapConfounder(row) {
  return {
    id: row.id,
    decisionId: row.decision_id,
    factorType: row.factor_type,
    factorValue: row.factor_value,
    significance: Number(row.significance),
    evidenceSourceId: row.evidence_source_id,
    createdAt: row.created_at,
  }
}

function mapObservationReview(row) {
  if (!row) return null
  return {
    id: row.id,
    decisionId: row.decision_id,
    metricKey: row.metric_key,
    scheduledBy: row.scheduled_by,
    dueAt: row.due_at,
    status: row.status,
    notifiedAt: row.notified_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.decision_title ? { decisionTitle: row.decision_title } : {}),
  }
}

function mapComparisonReview(row) {
  if (!row) return null
  return {
    id: row.id,
    comparisonId: row.comparison_id,
    reviewedBy: row.reviewed_by,
    action: row.review_action,
    comparable: Boolean(row.comparable),
    contextualSimilarity: Number(row.contextual_similarity),
    sharedFactors: parseJson(row.shared_factors_json, []),
    materialDifferences: parseJson(row.material_differences_json, []),
    explanation: row.explanation,
    comparisonConfidence: Number(row.comparison_confidence),
    confidenceModelVersion: row.confidence_model_version,
    reviewVersion: row.review_version,
    createdAt: row.created_at,
  }
}

export function calculateDecisionMetric({ baselineValue, observedValue }) {
  const baseline = numeric(baselineValue, 'baselineValue')
  const observed = numeric(observedValue, 'observedValue')
  if (observed === null) {
    return { baselineValue: baseline, observedValue: null, changeAbsolute: null, changePercent: null, measurementStatus: 'pending' }
  }
  if (baseline === null) {
    return { baselineValue: null, observedValue: observed, changeAbsolute: null, changePercent: null, measurementStatus: 'inconclusive' }
  }
  const changeAbsolute = round(observed - baseline)
  const changePercent = baseline === 0 ? null : round((changeAbsolute / baseline) * 100, 2)
  return { baselineValue: baseline, observedValue: observed, changeAbsolute, changePercent, measurementStatus: 'measured' }
}

export function compareExpectedToActual(expectedDirection, metric) {
  if (!metric || metric.measurementStatus === 'pending') return 'pending'
  if (metric.measurementStatus === 'inconclusive') return 'inconclusive'
  const expected = normalizeTaxonomyValue(expectedDirection)
  const actual = metric.changeAbsolute > 0 ? 'increase' : metric.changeAbsolute < 0 ? 'decrease' : 'no_change'
  const equivalent = new Map([
    ['positive', 'increase'],
    ['negative', 'decrease'],
    ['neutral', 'no_change'],
    ['maintain', 'no_change'],
  ])
  return (equivalent.get(expected) || expected) === actual ? 'matched' : 'missed'
}

export function calculateStructuralSimilarity(left, right, weights = STRUCTURAL_SCORING_POLICY.weights) {
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + Number(weight), 0)
  if (!(totalWeight > 0)) throw new TypeError('Structural similarity weights must have a positive total.')
  let matchedWeight = 0
  for (const field of DECISION_VECTOR_FIELDS) {
    const weight = Number(weights[field] || 0)
    const leftValue = normalizeTaxonomyValue(left?.[field])
    const rightValue = normalizeTaxonomyValue(right?.[field])
    if (weight > 0 && leftValue && rightValue && leftValue === rightValue) matchedWeight += weight
  }
  return round(Math.max(0, Math.min(1, matchedWeight / totalWeight)))
}

export function calculateComparisonConfidence(values, policy = COMPARISON_CONFIDENCE_POLICY) {
  let total = 0
  for (const [field, weight] of Object.entries(policy.weights)) {
    const value = values?.[field] === null || values?.[field] === undefined ? 0 : boundedConfidence(values[field], field)
    total += value * weight
  }
  return round(Math.max(0, Math.min(1, total)))
}

export function adjustEvidenceConfidence(baseConfidence, evidence = [], policy = EVIDENCE_CONFIDENCE_POLICY) {
  const base = boundedConfidence(baseConfidence, 'evidenceConfidence')
  const contradictionWeight = evidence
    .filter((item) => normalizeTaxonomyValue(item.relation) === 'contradicts')
    .reduce((sum, item) => sum + boundedConfidence(item.weight, 'evidence.weight'), 0)
  const penalty = Math.min(policy.maximumPenalty, contradictionWeight * policy.contradictionPenalty)
  return round(base * (1 - penalty))
}

export function adjustCausalConfidence(baseConfidence, confounders = [], policy = CAUSAL_CONFIDENCE_POLICY) {
  if (baseConfidence === null || baseConfidence === undefined) return null
  const base = boundedConfidence(baseConfidence, 'causalConfidence')
  const significance = confounders.reduce(
    (sum, item) => sum + boundedConfidence(item.significance, 'confounder.significance'),
    0,
  )
  const penalty = Math.min(policy.maximumPenalty, significance * policy.confounderPenalty)
  return round(base * (1 - penalty))
}

function outcomeDirection(metric) {
  if (metric.measurementStatus !== 'measured') return metric.measurementStatus
  if (metric.changeAbsolute > 0) return 'positive'
  if (metric.changeAbsolute < 0) return 'negative'
  return 'neutral'
}

function sharedAndDifferentFactors(left, right) {
  const sharedFactors = []
  const materialDifferences = []
  for (const field of DECISION_VECTOR_FIELDS) {
    const leftValue = left[field]
    const rightValue = right[field]
    if (leftValue && rightValue && leftValue === rightValue) {
      sharedFactors.push({ field, value: leftValue })
    } else if (leftValue || rightValue) {
      materialDifferences.push({ field, newDecision: leftValue || null, historicalDecision: rightValue || null })
    }
  }
  return { sharedFactors, materialDifferences }
}

function recencyRelevance(newDate, historicalDate) {
  const difference = Math.abs(new Date(newDate).getTime() - new Date(historicalDate).getTime())
  return round(Math.max(0, 1 - difference / (5 * 365 * 24 * 60 * 60 * 1_000)))
}

function clipped(value, maxLength) {
  if (value === null || value === undefined) return null
  return String(value).slice(0, maxLength)
}

function boundedCollection(items, limit, mapper) {
  const values = Array.isArray(items) ? items : []
  return {
    items: values.slice(0, limit).map(mapper),
    totalCount: values.length,
    truncated: values.length > limit,
  }
}

function compactOutcome(value) {
  const outcome = value?.outcome
    ? {
        outcomeDirection: value.outcome.outcomeDirection,
        outcomeClass: clipped(value.outcome.outcomeClass, 120),
        observedReason: clipped(value.outcome.observedReason, 400),
        evidenceConfidence: value.outcome.evidenceConfidence,
        causalConfidence: value.outcome.causalConfidence,
        confidenceVersion: clipped(value.outcome.confidenceVersion, 200),
        reviewedAt: value.outcome.reviewedAt,
      }
    : null
  return {
    outcome,
    metrics: boundedCollection(
      value?.metrics,
      DECISION_EVIDENCE_PACK_POLICY.maxMetricsPerDecision,
      (metric) => ({
        metricKey: clipped(metric.metricKey, 120),
        unit: clipped(metric.unit, 80),
        baselineValue: metric.baselineValue,
        baselineWindowStart: metric.baselineWindowStart,
        baselineWindowEnd: metric.baselineWindowEnd,
        observedValue: metric.observedValue,
        observationWindowStart: metric.observationWindowStart,
        observationWindowEnd: metric.observationWindowEnd,
        changeAbsolute: metric.changeAbsolute,
        changePercent: metric.changePercent,
        measurementStatus: metric.measurementStatus,
      }),
    ),
    expectedVsActual: boundedCollection(value?.expectedVsActual, 2, (item) => ({
      metricKey: clipped(item.metricKey, 120),
      expectedDirection: clipped(item.expectedDirection, 120),
      result: clipped(item.result, 40),
    })),
  }
}

function compactDecisionForEvidencePack(decision, outcome, evidence) {
  return {
    decision: {
      id: decision.id,
      title: clipped(decision.title, 200),
      status: clipped(decision.status, 40),
      decidedAt: decision.decidedAt,
      originalDecisionLanguage: clipped(decision.decisionText, 800),
      rationale: clipped(decision.rationale, 400),
      intent: clipped(decision.intent, 200),
      decisionVector: Object.fromEntries(
        [...DECISION_VECTOR_FIELDS, 'vectorVersion'].map((field) => [
          field,
          clipped(decision.vector?.[field], 80),
        ]),
      ),
      expectedReactions: boundedCollection(decision.expectedReactions, 2, (reaction) => ({
        metricKey: clipped(reaction.metricKey, 120),
        direction: clipped(reaction.direction, 120),
        expectedChange: reaction.expectedChange,
        confidence: reaction.confidence,
      })),
    },
    measuredOutcome: compactOutcome(outcome),
    evidence: boundedCollection(
      evidence,
      DECISION_EVIDENCE_PACK_POLICY.maxEvidencePerDecision,
      (item) => ({
        id: clipped(item.id, 120),
        sourceType: clipped(item.sourceType, 80),
        sourceId: clipped(item.sourceId, 120),
        relation: clipped(item.relation, 80),
        summary: clipped(item.summary, 200),
        weight: item.weight,
      }),
    ),
    knownConfounders: boundedCollection(
      outcome?.confounders,
      DECISION_EVIDENCE_PACK_POLICY.maxConfoundersPerDecision,
      (item) => ({
        factorType: clipped(item.factorType, 80),
        factorValue: clipped(item.factorValue, 200),
        significance: item.significance,
        evidenceSourceId: clipped(item.evidenceSourceId, 120),
      }),
    ),
    relevantBusinessContext: {
      objectType: clipped(decision.objectType, 120),
      objectId: clipped(decision.objectId, 120),
      clientId: clipped(decision.clientId, 120),
      projectId: clipped(decision.projectId, 120),
      conversationId: clipped(decision.conversationId, 120),
    },
  }
}

export function buildDecisionEvidencePack({
  newDecision,
  historicalDecision,
  newOutcome,
  historicalOutcome,
  newEvidence,
  historicalEvidence,
}) {
  const pack = {
    contractVersion: SEMANTIC_REALITY_CHECK_CONTRACT.version,
    evidencePackVersion: DECISION_EVIDENCE_PACK_POLICY.version,
    authority: {
      metricsAndOutcomesAreAuthoritative: true,
      semanticAssessmentMayNotClaimCausality: true,
    },
    newDecision: compactDecisionForEvidencePack(newDecision, newOutcome, newEvidence),
    historicalDecision: compactDecisionForEvidencePack(
      historicalDecision,
      historicalOutcome,
      historicalEvidence,
    ),
  }
  if (JSON.stringify(pack).length > DECISION_EVIDENCE_PACK_POLICY.maxSerializedCharacters) {
    throw new DecisionDynamicsError('DECISION_EVIDENCE_PACK_TOO_LARGE', 'The bounded evidence pack exceeded its limit.')
  }
  return pack
}

function normalizeSemanticAssessment(value) {
  if (typeof value?.comparable !== 'boolean') {
    throw new DecisionDynamicsError('HERMES_SEMANTIC_INVALID_RESPONSE', 'Hermes returned an invalid comparable status.')
  }
  const list = (items, field) => {
    if (!Array.isArray(items) || items.length > 20) {
      throw new DecisionDynamicsError('HERMES_SEMANTIC_INVALID_RESPONSE', `Hermes returned invalid ${field}.`)
    }
    return items.map((item) => {
      if (typeof item !== 'string') {
        throw new DecisionDynamicsError('HERMES_SEMANTIC_INVALID_RESPONSE', `Hermes returned invalid ${field}.`)
      }
      const text = item.trim()
      if (!text || text.length > 500) {
        throw new DecisionDynamicsError('HERMES_SEMANTIC_INVALID_RESPONSE', `Hermes returned invalid ${field}.`)
      }
      return text
    })
  }
  if (
    typeof value.contextualSimilarity !== 'number' ||
    typeof value.explanation !== 'string' ||
    typeof value.modelVersion !== 'string' ||
    typeof value.assessmentVersion !== 'string'
  ) {
    throw new DecisionDynamicsError('HERMES_SEMANTIC_INVALID_RESPONSE', 'Hermes returned invalid semantic fields.')
  }
  return {
    comparable: value.comparable,
    contextualSimilarity: boundedConfidence(value.contextualSimilarity, 'contextualSimilarity'),
    sharedFactors: list(value.sharedFactors, 'shared factors'),
    materialDifferences: list(value.materialDifferences, 'material differences'),
    explanation: bounded(value.explanation, 'explanation', 2_000, { required: true }),
    modelVersion: bounded(value.modelVersion, 'modelVersion', 200, { required: true }),
    assessmentVersion: bounded(value.assessmentVersion, 'assessmentVersion', 200, { required: true }),
  }
}

function normalizeComparisonReviewFactors(items, field) {
  if (!Array.isArray(items) || items.length > COMPARISON_REVIEW_POLICY.maxFactors) {
    throw new DecisionDynamicsError('INVALID_COMPARISON_REVIEW', `${field} must be a bounded list.`)
  }
  return items.map((item) => {
    if (typeof item !== 'string') {
      throw new DecisionDynamicsError('INVALID_COMPARISON_REVIEW', `${field} must contain text values.`)
    }
    const text = item.trim()
    if (!text || text.length > COMPARISON_REVIEW_POLICY.maxFactorLength) {
      throw new DecisionDynamicsError('INVALID_COMPARISON_REVIEW', `${field} contains an invalid value.`)
    }
    return text
  })
}

export function createDecisionDynamicsService({
  database,
  structuralPolicy = STRUCTURAL_SCORING_POLICY,
  semanticAssessor = null,
  now = () => new Date(),
} = {}) {
  if (!database?.query || !database?.transaction) {
    throw new TypeError('Decision Dynamics requires the Lancee database adapter.')
  }
  if (semanticAssessor !== null && typeof semanticAssessor?.assess !== 'function') {
    throw new TypeError('Decision Dynamics semantic assessor must expose assess().')
  }
  const timestamp = () => {
    const value = now()
    const date = value instanceof Date ? value : new Date(value)
    if (!Number.isFinite(date.getTime())) throw new TypeError('Decision Dynamics now() returned an invalid date.')
    return date.toISOString()
  }
  const createId = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '')}`
  const learning = createDecisionLearningService({
    database,
    baseStructuralPolicy: structuralPolicy,
    now,
  })

  function observationDueAt(value) {
    const dueAt = isoDate(value, 'dueAt', { nullable: false })
    const current = new Date(timestamp()).getTime()
    const due = new Date(dueAt).getTime()
    const maximum = current + OUTCOME_OBSERVATION_POLICY.maxHorizonDays * 24 * 60 * 60 * 1_000
    if (due <= current || due > maximum) {
      throw new DecisionDynamicsError(
        'INVALID_OBSERVATION_REVIEW',
        `dueAt must be in the future and within ${OUTCOME_OBSERVATION_POLICY.maxHorizonDays} days.`,
      )
    }
    return dueAt
  }

  async function requireReference(workspaceId, table, id, label) {
    if (!id) return
    const rows = await database.query(`SELECT id FROM ${table} WHERE workspace_id = $1 AND id = $2`, [workspaceId, id])
    if (!rows[0]) throw new DecisionDynamicsError('DECISION_REFERENCE_NOT_FOUND', `${label} not found.`, 404)
  }

  async function requireDecision(context, decisionId) {
    const decision = await getDecision(context, decisionId)
    if (!decision) throw new DecisionDynamicsError('DECISION_NOT_FOUND', 'Decision not found.', 404)
    return decision
  }

  async function validateEvidenceSource(workspaceId, decisionId, sourceType, sourceId) {
    const type = normalizeTaxonomyValue(sourceType, { required: true, field: 'sourceType' })
    const knownTables = {
      event: 'workspace_events',
      project: 'projects',
      client: 'clients',
      invoice: 'invoices',
      conversation: 'ai_conversations',
      decision: 'decisions',
    }
    if (knownTables[type]) {
      const rows = await database.query(
        `SELECT id FROM ${knownTables[type]} WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, sourceId],
      )
      if (!rows[0]) throw new DecisionDynamicsError('EVIDENCE_SOURCE_NOT_FOUND', 'Evidence source not found.', 404)
    }
    if (type === 'metric' && !String(sourceId).startsWith(`${decisionId}:`)) {
      throw new DecisionDynamicsError('EVIDENCE_SOURCE_NOT_FOUND', 'Metric evidence must reference this decision.', 404)
    }
    return type
  }

  async function insertEvidence(context, decisionId, input) {
    const { workspaceId } = trustedScope(context, { write: true })
    const sourceId = bounded(input.sourceId, 'sourceId', 240, { required: true })
    const sourceType = await validateEvidenceSource(workspaceId, decisionId, input.sourceType, sourceId)
    const id = createId('devd')
    const createdAt = timestamp()
    await database.query(
      `INSERT INTO decision_evidence (
         id, workspace_id, decision_id, source_type, source_id, relation,
         summary, weight, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        workspaceId,
        decisionId,
        sourceType,
        sourceId,
        normalizeTaxonomyValue(input.relation, { required: true, field: 'relation' }),
        bounded(input.summary, 'summary', 2_000, { required: true }),
        boundedConfidence(input.weight ?? 1, 'evidence.weight'),
        createdAt,
      ],
    )
    const rows = await database.query(
      `SELECT * FROM decision_evidence WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, id],
    )
    return mapEvidence(rows[0])
  }

  async function insertConfounder(context, decisionId, input) {
    const { workspaceId } = trustedScope(context, { write: true })
    const id = createId('dcon')
    const createdAt = timestamp()
    await database.query(
      `INSERT INTO decision_confounders (
         id, workspace_id, decision_id, factor_type, factor_value,
         significance, evidence_source_id, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        workspaceId,
        decisionId,
        normalizeTaxonomyValue(input.factorType, { required: true, field: 'factorType' }),
        bounded(input.factorValue, 'factorValue', 500, { required: true }),
        boundedConfidence(input.significance, 'confounder.significance'),
        bounded(input.evidenceSourceId, 'evidenceSourceId', 240),
        createdAt,
      ],
    )
    const rows = await database.query(
      `SELECT * FROM decision_confounders WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, id],
    )
    return mapConfounder(rows[0])
  }

  async function getDecision(context, decisionId) {
    const { workspaceId } = trustedScope(context)
    const decisionRows = await database.query(
      `SELECT * FROM decisions WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, String(decisionId || '')],
    )
    if (!decisionRows[0]) return null
    const vectorRows = await database.query(
      `SELECT * FROM decision_vectors WHERE workspace_id = $1 AND decision_id = $2`,
      [workspaceId, decisionId],
    )
    const expectedRows = await database.query(
      `SELECT * FROM decision_expected_reactions
       WHERE workspace_id = $1 AND decision_id = $2 ORDER BY metric_key`,
      [workspaceId, decisionId],
    )
    const observationRows = await database.query(
      `SELECT * FROM decision_observation_reviews
       WHERE workspace_id = $1 AND decision_id = $2 ORDER BY due_at`,
      [workspaceId, decisionId],
    )
    const observationReviews = observationRows.map(mapObservationReview)
    return {
      ...mapDecision(decisionRows[0]),
      vector: mapVector(vectorRows[0]),
      expectedReactions: expectedRows.map((row) => {
        const expected = mapExpectedReaction(row)
        const observationReview = observationReviews.find((review) => review.metricKey === expected.metricKey)
        return {
          ...expected,
          observationReview: observationReview ? { ...observationReview } : null,
        }
      }),
      observationReviews,
    }
  }

  async function listDecisions(context, { status = null, limit = 50 } = {}) {
    const { workspaceId } = trustedScope(context)
    const boundedLimit = Math.min(100, Math.max(1, Number.isInteger(limit) ? limit : 50))
    const params = [workspaceId]
    let filter = ''
    if (status) {
      params.push(String(status))
      filter = ` AND status = $${params.length}`
    }
    params.push(boundedLimit)
    const rows = await database.query(
      `SELECT * FROM decisions WHERE workspace_id = $1${filter}
       ORDER BY decided_at DESC, created_at DESC LIMIT $${params.length}`,
      params,
    )
    return Promise.all(rows.map((row) => getDecision(context, row.id)))
  }

  async function scheduleDecisionReview(context, decisionId, input) {
    const { workspaceId, userId } = trustedScope(context, { write: true })
    const decision = await requireDecision(context, decisionId)
    const metricKey = normalizeTaxonomyValue(input.metricKey, { required: true, field: 'metricKey' })
    if (!decision.expectedReactions.some((reaction) => reaction.metricKey === metricKey)) {
      throw new DecisionDynamicsError(
        'EXPECTED_REACTION_NOT_FOUND',
        'Schedule an outcome review only for a recorded expected metric.',
        404,
      )
    }
    const dueAt = observationDueAt(input.dueAt)
    const updatedAt = timestamp()
    await database.query(
      `INSERT INTO decision_observation_reviews (
         id, workspace_id, decision_id, metric_key, scheduled_by, due_at,
         status, notified_at, completed_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', NULL, NULL, $7, $8)
       ON CONFLICT (workspace_id, decision_id, metric_key) DO UPDATE SET
         scheduled_by = EXCLUDED.scheduled_by,
         due_at = EXCLUDED.due_at,
         status = 'scheduled',
         notified_at = NULL,
         completed_at = NULL,
         updated_at = EXCLUDED.updated_at`,
      [createId('dobs'), workspaceId, decisionId, metricKey, userId, dueAt, updatedAt, updatedAt],
    )
    await recordWorkspaceEvent({
      database,
      context,
      eventType: 'outcome.observation_started',
      entityType: 'decision',
      entityId: decisionId,
      payload: { metricKey, dueAt, observationPolicyVersion: OUTCOME_OBSERVATION_POLICY.version },
      importance: 80,
      occurredAt: updatedAt,
    })
    const rows = await database.query(
      `SELECT * FROM decision_observation_reviews
       WHERE workspace_id = $1 AND decision_id = $2 AND metric_key = $3`,
      [workspaceId, decisionId, metricKey],
    )
    return mapObservationReview(rows[0])
  }

  async function listDecisionReviews(context, { status = 'open', limit = 50 } = {}) {
    const { workspaceId } = trustedScope(context)
    const selectedStatus = String(status || 'open')
    if (!['open', 'scheduled', 'due', 'completed', 'cancelled'].includes(selectedStatus)) {
      throw new DecisionDynamicsError('INVALID_OBSERVATION_REVIEW', 'Use a supported review status.')
    }
    const boundedLimit = Math.min(
      OUTCOME_OBSERVATION_POLICY.maxListResults,
      Math.max(1, Number.isInteger(limit) ? limit : 50),
    )
    const statusFilter = selectedStatus === 'open'
      ? `r.status IN ('scheduled', 'due')`
      : 'r.status = $2'
    const params = selectedStatus === 'open'
      ? [workspaceId, boundedLimit]
      : [workspaceId, selectedStatus, boundedLimit]
    const limitParameter = selectedStatus === 'open' ? '$2' : '$3'
    const rows = await database.query(
      `SELECT r.*, d.title AS decision_title
       FROM decision_observation_reviews r
       JOIN decisions d ON d.id = r.decision_id AND d.workspace_id = r.workspace_id
       WHERE r.workspace_id = $1 AND ${statusFilter}
       ORDER BY r.due_at, r.created_at LIMIT ${limitParameter}`,
      params,
    )
    return rows.map(mapObservationReview)
  }

  async function dispatchDueObservationReviews({ limit = 50 } = {}) {
    const selectedAt = timestamp()
    const boundedLimit = Math.min(
      OUTCOME_OBSERVATION_POLICY.maxListResults,
      Math.max(1, Number.isInteger(limit) ? limit : 50),
    )
    const dueRows = await database.query(
      `SELECT r.*, d.title AS decision_title
       FROM decision_observation_reviews r
       JOIN decisions d ON d.id = r.decision_id AND d.workspace_id = r.workspace_id
       WHERE r.status = 'scheduled' AND r.due_at <= $1
       ORDER BY r.due_at, r.created_at LIMIT $2`,
      [selectedAt, boundedLimit],
    )
    const dispatched = []
    for (const due of dueRows) {
      await database.transaction(async () => {
        const claimedRows = await database.query(
          `UPDATE decision_observation_reviews
           SET status = 'due', notified_at = $1, updated_at = $2
           WHERE workspace_id = $3 AND id = $4 AND status = 'scheduled'
           RETURNING *`,
          [selectedAt, selectedAt, due.workspace_id, due.id],
        )
        if (!claimedRows[0]) return
        await database.createWorkspaceNotification({
          workspaceId: due.workspace_id,
          kind: 'decision.outcome_review_due',
          title: 'Decision outcome ready for review',
          body: `Review “${String(due.decision_title || 'Decision').slice(0, 200)}” against ${due.metric_key}.`,
          entityType: 'decision',
          entityId: due.decision_id,
        })
        dispatched.push(mapObservationReview({
          ...claimedRows[0],
          decision_title: due.decision_title,
        }))
      })
    }
    return dispatched
  }

  async function createDecision(context, input) {
    const { workspaceId, userId } = trustedScope(context, { write: true })
    const objectType = normalizeTaxonomyValue(input.objectType, { required: true, field: 'objectType' })
    const objectId = bounded(input.objectId, 'objectId', 240)
    const vector = normalizeDecisionVector(input.vector || {}, objectType)
    const status = String(input.status || 'active')
    if (!['draft', 'active', 'reviewed', 'archived'].includes(status)) {
      throw new DecisionDynamicsError('INVALID_DECISION', 'Use a supported decision status.')
    }
    await requireReference(workspaceId, 'clients', input.clientId, 'Client')
    await requireReference(workspaceId, 'projects', input.projectId, 'Project')
    await requireReference(workspaceId, 'ai_conversations', input.conversationId, 'Conversation')
    await requireReference(workspaceId, 'decision_candidates', input.sourceCandidateId, 'Decision candidate')
    const id = createId('dec')
    const createdAt = timestamp()
    const decidedAt = isoDate(input.decidedAt || createdAt, 'decidedAt', { nullable: false })
    await database.transaction(async () => {
      await database.query(
        `INSERT INTO decisions (
           id, workspace_id, actor_id, object_type, object_id, client_id,
           project_id, conversation_id, source_candidate_id, title,
           decision_text, rationale, intent, decided_at, status, created_at,
           updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          id,
          workspaceId,
          userId,
          objectType,
          objectId,
          input.clientId || null,
          input.projectId || null,
          input.conversationId || null,
          input.sourceCandidateId || null,
          bounded(input.title, 'title', 200, { required: true }),
          bounded(input.decisionText, 'decisionText', 5_000, { required: true }),
          bounded(input.rationale, 'rationale', 5_000),
          bounded(input.intent, 'intent', 2_000, { required: true }),
          decidedAt,
          status,
          createdAt,
          createdAt,
        ],
      )
      await database.query(
        `INSERT INTO decision_vectors (
           decision_id, workspace_id, object_type, action_type, target_type,
           source_state, destination_state, intent_type, expected_direction,
           vector_version, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id,
          workspaceId,
          vector.objectType,
          vector.actionType,
          vector.targetType,
          vector.sourceState,
          vector.destinationState,
          vector.intentType,
          vector.expectedDirection,
          vector.vectorVersion,
          createdAt,
        ],
      )
      for (const reaction of input.expectedReactions || []) {
        const metricKey = normalizeTaxonomyValue(reaction.metricKey, { required: true, field: 'metricKey' })
        await database.query(
          `INSERT INTO decision_expected_reactions (
             decision_id, workspace_id, metric_key, direction, expected_change,
             confidence, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            id,
            workspaceId,
            metricKey,
            normalizeTaxonomyValue(reaction.direction, { required: true, field: 'direction' }),
            numeric(reaction.expectedChange, 'expectedChange'),
            boundedConfidence(reaction.confidence, 'expectedReaction.confidence'),
            createdAt,
          ],
        )
        if (reaction.reviewDueAt) {
          const dueAt = observationDueAt(reaction.reviewDueAt)
          await database.query(
            `INSERT INTO decision_observation_reviews (
               id, workspace_id, decision_id, metric_key, scheduled_by, due_at,
               status, notified_at, completed_at, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', NULL, NULL, $7, $8)`,
            [createId('dobs'), workspaceId, id, metricKey, userId, dueAt, createdAt, createdAt],
          )
          await recordWorkspaceEvent({
            database,
            context,
            eventType: 'outcome.observation_started',
            entityType: 'decision',
            entityId: id,
            payload: { metricKey, dueAt, observationPolicyVersion: OUTCOME_OBSERVATION_POLICY.version },
            importance: 80,
            occurredAt: createdAt,
          })
        }
      }
      for (const evidence of input.evidence || []) await insertEvidence(context, id, evidence)
      for (const confounder of input.confounders || []) await insertConfounder(context, id, confounder)
      await recordWorkspaceEvent({
        database,
        context,
        eventType: 'decision.created',
        entityType: 'decision',
        entityId: id,
        clientId: input.clientId || null,
        projectId: input.projectId || null,
        conversationId: input.conversationId || null,
        payload: { title: input.title, vectorVersion: vector.vectorVersion, sourceCandidateId: input.sourceCandidateId || null },
        importance: 95,
        occurredAt: decidedAt,
      })
    })
    return getDecision(context, id)
  }

  async function addDecisionEvidence(context, decisionId, input) {
    await requireDecision(context, decisionId)
    return insertEvidence(context, decisionId, input)
  }

  async function addDecisionConfounder(context, decisionId, input) {
    await requireDecision(context, decisionId)
    return insertConfounder(context, decisionId, input)
  }

  async function getDecisionEvidence(context, decisionId) {
    const { workspaceId } = trustedScope(context)
    if (!(await getDecision(context, decisionId))) return null
    const rows = await database.query(
      `SELECT * FROM decision_evidence
       WHERE workspace_id = $1 AND decision_id = $2 ORDER BY created_at`,
      [workspaceId, decisionId],
    )
    return rows.map(mapEvidence)
  }

  async function getDecisionConfounders(context, decisionId) {
    const { workspaceId } = trustedScope(context)
    if (!(await getDecision(context, decisionId))) return null
    const rows = await database.query(
      `SELECT * FROM decision_confounders
       WHERE workspace_id = $1 AND decision_id = $2 ORDER BY created_at`,
      [workspaceId, decisionId],
    )
    return rows.map(mapConfounder)
  }

  async function getDecisionOutcome(context, decisionId) {
    const { workspaceId } = trustedScope(context)
    const decision = await getDecision(context, decisionId)
    if (!decision) return null
    const outcomeRows = await database.query(
      `SELECT * FROM decision_outcomes WHERE workspace_id = $1 AND decision_id = $2`,
      [workspaceId, decisionId],
    )
    const metricRows = await database.query(
      `SELECT * FROM decision_metrics
       WHERE workspace_id = $1 AND decision_id = $2 ORDER BY metric_key`,
      [workspaceId, decisionId],
    )
    const confounders = await getDecisionConfounders(context, decisionId)
    const causalAssessment = await learning.getCausalAssessment(context, decisionId)
    const metrics = metricRows.map(mapMetric)
    return {
      decisionId,
      outcome: mapOutcome(outcomeRows[0]),
      metrics,
      expectedVsActual: decision.expectedReactions.map((expected) => ({
        metricKey: expected.metricKey,
        expectedDirection: expected.direction,
        result: compareExpectedToActual(
          expected.direction,
          metrics.find((metric) => metric.metricKey === expected.metricKey),
        ),
      })),
      confounders,
      causalAssessment,
    }
  }

  async function recordOutcome(context, decisionId, input) {
    const { workspaceId } = trustedScope(context, { write: true })
    await requireDecision(context, decisionId)
    const metricInput = input.metric || {}
    const calculated = calculateDecisionMetric(metricInput)
    const metricKey = normalizeTaxonomyValue(metricInput.metricKey, { required: true, field: 'metricKey' })
    await database.transaction(async () => {
      const observationRows = await database.query(
        `SELECT * FROM decision_observation_reviews
         WHERE workspace_id = $1 AND decision_id = $2 AND metric_key = $3
           AND status IN ('scheduled', 'due')`,
        [workspaceId, decisionId, metricKey],
      )
      for (const evidence of input.evidence || []) await insertEvidence(context, decisionId, evidence)
      for (const confounder of input.confounders || []) await insertConfounder(context, decisionId, confounder)
      const evidence = await getDecisionEvidence(context, decisionId)
      const confounders = await getDecisionConfounders(context, decisionId)
      const evidenceConfidence = adjustEvidenceConfidence(input.evidenceConfidence, evidence || [])
      const causalConfidence = adjustCausalConfidence(input.causalConfidence, confounders || [])
      const reviewedAt = isoDate(input.reviewedAt || timestamp(), 'reviewedAt', { nullable: false })
      await database.query(
        `INSERT INTO decision_metrics (
           decision_id, workspace_id, metric_key, unit, baseline_value,
           baseline_window_start, baseline_window_end, observed_value,
           observation_window_start, observation_window_end, change_absolute,
           change_percent, measurement_status, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (decision_id, metric_key) DO UPDATE SET
           unit = EXCLUDED.unit,
           baseline_value = EXCLUDED.baseline_value,
           baseline_window_start = EXCLUDED.baseline_window_start,
           baseline_window_end = EXCLUDED.baseline_window_end,
           observed_value = EXCLUDED.observed_value,
           observation_window_start = EXCLUDED.observation_window_start,
           observation_window_end = EXCLUDED.observation_window_end,
           change_absolute = EXCLUDED.change_absolute,
           change_percent = EXCLUDED.change_percent,
           measurement_status = EXCLUDED.measurement_status`,
        [
          decisionId,
          workspaceId,
          metricKey,
          bounded(metricInput.unit, 'unit', 80),
          calculated.baselineValue,
          isoDate(metricInput.baselineWindowStart, 'baselineWindowStart'),
          isoDate(metricInput.baselineWindowEnd, 'baselineWindowEnd'),
          calculated.observedValue,
          isoDate(metricInput.observationWindowStart, 'observationWindowStart'),
          isoDate(metricInput.observationWindowEnd, 'observationWindowEnd'),
          calculated.changeAbsolute,
          calculated.changePercent,
          calculated.measurementStatus,
          timestamp(),
        ],
      )
      const direction = outcomeDirection(calculated)
      const defaultClass = direction === 'positive' ? 'successful' : direction
      await database.query(
        `INSERT INTO decision_outcomes (
           decision_id, workspace_id, outcome_direction, outcome_class,
           observed_reason, evidence_confidence, causal_confidence,
           confidence_version, reviewed_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (decision_id) DO UPDATE SET
           outcome_direction = EXCLUDED.outcome_direction,
           outcome_class = EXCLUDED.outcome_class,
           observed_reason = EXCLUDED.observed_reason,
           evidence_confidence = EXCLUDED.evidence_confidence,
           causal_confidence = EXCLUDED.causal_confidence,
           confidence_version = EXCLUDED.confidence_version,
           reviewed_at = EXCLUDED.reviewed_at,
           updated_at = EXCLUDED.updated_at`,
        [
          decisionId,
          workspaceId,
          direction,
          normalizeTaxonomyValue(input.outcomeClass || defaultClass, { required: true, field: 'outcomeClass' }),
          bounded(input.observedReason, 'observedReason', 5_000),
          evidenceConfidence,
          causalConfidence,
          `${EVIDENCE_CONFIDENCE_POLICY.version}+${CAUSAL_CONFIDENCE_POLICY.version}`,
          reviewedAt,
          timestamp(),
          timestamp(),
        ],
      )
      if (calculated.measurementStatus !== 'pending') {
        const recordedMetric = {
          metricKey,
          unit: bounded(metricInput.unit, 'unit', 80),
          ...calculated,
        }
        await learning.recordCausalAssessment(
          workspaceId,
          decisionId,
          recordedMetric,
          { evidenceConfidence, causalConfidence },
          input.causalAnalysis,
        )
        await learning.completePrediction(workspaceId, decisionId, metricKey, recordedMetric, reviewedAt)
        await database.query(
          `UPDATE decisions SET status = 'reviewed', updated_at = $1
           WHERE workspace_id = $2 AND id = $3`,
          [timestamp(), workspaceId, decisionId],
        )
        if (observationRows[0]) {
          await database.query(
            `UPDATE decision_observation_reviews
             SET status = 'completed', completed_at = $1, updated_at = $2
             WHERE workspace_id = $3 AND decision_id = $4 AND metric_key = $5
               AND status IN ('scheduled', 'due')`,
            [reviewedAt, timestamp(), workspaceId, decisionId, metricKey],
          )
          await recordWorkspaceEvent({
            database,
            context,
            eventType: 'outcome.observation_completed',
            entityType: 'decision',
            entityId: decisionId,
            payload: { metricKey, measurementStatus: calculated.measurementStatus },
            importance: 90,
            occurredAt: reviewedAt,
          })
        }
      }
      await recordWorkspaceEvent({
        database,
        context,
        eventType: 'outcome.recorded',
        entityType: 'decision',
        entityId: decisionId,
        payload: {
          metricKey,
          measurementStatus: calculated.measurementStatus,
          outcomeDirection: direction,
          evidenceConfidence,
          causalConfidence,
        },
        importance: 95,
        occurredAt: reviewedAt,
      })
      if (calculated.measurementStatus !== 'pending') {
        await recordWorkspaceEvent({
          database,
          context,
          eventType: 'decision.reviewed',
          entityType: 'decision',
          entityId: decisionId,
          payload: { outcomeDirection: direction },
          importance: 90,
          occurredAt: reviewedAt,
        })
      }
    })
    return getDecisionOutcome(context, decisionId)
  }

  async function getDecisionComparison(context, comparisonId) {
    const { workspaceId } = trustedScope(context)
    const rows = await database.query(
      `SELECT * FROM decision_comparisons WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, String(comparisonId || '')],
    )
    const row = rows[0]
    if (!row) return null
    const reviewRows = await database.query(
      `SELECT * FROM decision_comparison_reviews
       WHERE workspace_id = $1 AND comparison_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [workspaceId, row.id],
    )
    const humanReview = mapComparisonReview(reviewRows[0])
    const machineAssessment = {
      status: row.semantic_status,
      contextualSimilarity: row.contextual_similarity === null
        ? null
        : Number(row.contextual_similarity),
      comparable: row.comparable === null ? null : Boolean(row.comparable),
      sharedFactors: parseJson(row.shared_factors_json, []),
      materialDifferences: parseJson(row.material_differences_json, []),
      explanation: row.semantic_explanation,
      errorCode: row.semantic_error_code,
      modelVersion: row.model_version,
      assessmentVersion: row.semantic_assessment_version,
    }
    const contextualSimilarity = humanReview
      ? humanReview.contextualSimilarity
      : machineAssessment.contextualSimilarity
    const comparisonConfidence = humanReview
      ? calculateComparisonConfidence({
          structuralSimilarity: Number(row.structural_similarity),
          contextualSimilarity,
          evidenceConfidence: Number(row.evidence_confidence),
          recencyRelevance: Number(row.recency_relevance),
        })
      : Number(row.comparison_confidence)
    return {
      id: row.id,
      decisionAId: row.decision_a_id,
      decisionBId: row.decision_b_id,
      structuralSimilarity: Number(row.structural_similarity),
      contextualSimilarity,
      evidenceConfidence: Number(row.evidence_confidence),
      recencyRelevance: Number(row.recency_relevance),
      comparisonConfidence,
      comparable: humanReview ? humanReview.comparable : machineAssessment.comparable,
      sharedFactors: humanReview ? humanReview.sharedFactors : machineAssessment.sharedFactors,
      materialDifferences: humanReview
        ? humanReview.materialDifferences
        : machineAssessment.materialDifferences,
      comparisonVersion: row.comparison_version,
      confidenceModelVersion: row.confidence_model_version,
      evidencePackVersion: row.evidence_pack_version,
      assessmentSource: humanReview
        ? 'human_review'
        : row.semantic_status === 'completed'
          ? 'hermes'
          : 'structural',
      machineAssessment,
      humanReview,
      semanticAssessment: {
        status: row.semantic_status,
        explanation: row.semantic_explanation,
        errorCode: row.semantic_error_code,
        assessmentVersion: row.semantic_assessment_version,
      },
      modelVersion: row.model_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  async function reviewDecisionComparison(context, comparisonId, input) {
    const { workspaceId, userId } = trustedScope(context, { write: true })
    const comparison = await getDecisionComparison(context, comparisonId)
    if (!comparison) {
      throw new DecisionDynamicsError('DECISION_COMPARISON_NOT_FOUND', 'Decision comparison not found.', 404)
    }
    const action = String(input.action || '').trim().toLowerCase()
    if (!['confirmed', 'corrected', 'rejected'].includes(action)) {
      throw new DecisionDynamicsError('INVALID_COMPARISON_REVIEW', 'Use confirmed, corrected, or rejected.')
    }
    if (action === 'confirmed' && comparison.machineAssessment.status !== 'completed') {
      throw new DecisionDynamicsError(
        'INVALID_COMPARISON_REVIEW',
        'Only a completed semantic assessment can be confirmed.',
      )
    }
    const comparable = action === 'confirmed'
      ? comparison.machineAssessment.comparable
      : action === 'rejected'
        ? false
        : input.comparable
    if (typeof comparable !== 'boolean') {
      throw new DecisionDynamicsError('INVALID_COMPARISON_REVIEW', 'comparable must be explicitly true or false.')
    }
    const contextualSimilarity = action === 'confirmed'
      ? comparison.machineAssessment.contextualSimilarity
      : action === 'rejected' && input.contextualSimilarity === undefined
        ? 0
        : boundedConfidence(input.contextualSimilarity, 'contextualSimilarity')
    const sharedFactors = action === 'confirmed'
      ? comparison.machineAssessment.sharedFactors
      : normalizeComparisonReviewFactors(
          input.sharedFactors ?? comparison.machineAssessment.sharedFactors,
          'sharedFactors',
        )
    const materialDifferences = action === 'confirmed'
      ? comparison.machineAssessment.materialDifferences
      : normalizeComparisonReviewFactors(
          input.materialDifferences ?? comparison.machineAssessment.materialDifferences,
          'materialDifferences',
        )
    const explanation = action === 'confirmed'
      ? comparison.machineAssessment.explanation
      : bounded(
          input.explanation,
          'explanation',
          COMPARISON_REVIEW_POLICY.maxExplanationLength,
          { required: true },
        )
    const comparisonConfidence = calculateComparisonConfidence({
      structuralSimilarity: comparison.structuralSimilarity,
      contextualSimilarity,
      evidenceConfidence: comparison.evidenceConfidence,
      recencyRelevance: comparison.recencyRelevance,
    })
    const createdAt = timestamp()
    await database.transaction(async () => {
      await database.query(
        `INSERT INTO decision_comparison_reviews (
           id, workspace_id, comparison_id, reviewed_by, review_action,
           comparable, contextual_similarity, shared_factors_json,
           material_differences_json, explanation, comparison_confidence,
           confidence_model_version, review_version, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          createId('dcrv'),
          workspaceId,
          comparison.id,
          userId,
          action,
          comparable ? 1 : 0,
          contextualSimilarity,
          JSON.stringify(sharedFactors),
          JSON.stringify(materialDifferences),
          explanation,
          comparisonConfidence,
          COMPARISON_CONFIDENCE_POLICY.version,
          COMPARISON_REVIEW_POLICY.version,
          createdAt,
        ],
      )
      await recordWorkspaceEvent({
        database,
        context,
        eventType: 'decision.comparison_reviewed',
        entityType: 'decision_comparison',
        entityId: comparison.id,
        payload: {
          action,
          comparable,
          contextualSimilarity,
          comparisonConfidence,
          reviewVersion: COMPARISON_REVIEW_POLICY.version,
        },
        importance: 90,
        occurredAt: createdAt,
      })
    })
    return getDecisionComparison(context, comparison.id)
  }

  async function compareDecision(context, decisionId, { limit, threshold } = {}) {
    const { workspaceId } = trustedScope(context)
    const decision = await requireDecision(context, decisionId)
    const comparisonStructuralPolicy = await learning.structuralPolicyForWorkspace(workspaceId)
    const boundedLimit = Math.min(
      comparisonStructuralPolicy.maxCandidates,
      Math.max(1, Number.isInteger(limit) ? limit : comparisonStructuralPolicy.maxCandidates),
    )
    const selectedThreshold = threshold === undefined ? comparisonStructuralPolicy.threshold : Number(threshold)
    if (!Number.isFinite(selectedThreshold) || selectedThreshold < 0 || selectedThreshold > 1) {
      throw new DecisionDynamicsError('INVALID_COMPARISON', 'threshold must be from 0 to 1.')
    }
    const rows = await database.query(
      `SELECT d.*, v.decision_id AS vector_decision_id, v.object_type AS vector_object_type,
              v.action_type, v.target_type, v.source_state, v.destination_state,
              v.intent_type, v.expected_direction, v.vector_version, v.created_at AS vector_created_at
       FROM decisions d
       JOIN decision_vectors v ON v.decision_id = d.id AND v.workspace_id = d.workspace_id
       WHERE d.workspace_id = $1 AND d.id <> $2 AND d.decided_at <= $3
       ORDER BY d.decided_at DESC
       LIMIT $4`,
      [workspaceId, decisionId, decision.decidedAt, comparisonStructuralPolicy.retrievalLimit],
    )
    const structural = rows
      .map((row) => {
        const vector = {
          decisionId: row.vector_decision_id,
          objectType: row.vector_object_type,
          actionType: row.action_type,
          targetType: row.target_type,
          sourceState: row.source_state,
          destinationState: row.destination_state,
          intentType: row.intent_type,
          expectedDirection: row.expected_direction,
          vectorVersion: row.vector_version,
          createdAt: row.vector_created_at,
        }
        return {
          decision: mapDecision(row),
          vector,
          structuralSimilarity: calculateStructuralSimilarity(decision.vector, vector, comparisonStructuralPolicy.weights),
        }
      })
      .filter((candidate) => candidate.structuralSimilarity >= selectedThreshold)
      .sort((left, right) => right.structuralSimilarity - left.structuralSimilarity)
      .slice(0, boundedLimit)

    const [newOutcome, newEvidence] = await Promise.all([
      getDecisionOutcome(context, decision.id),
      getDecisionEvidence(context, decision.id),
    ])
    const candidates = []
    for (const item of structural) {
      const historicalDecision = await getDecision(context, item.decision.id)
      const [outcome, evidence] = await Promise.all([
        getDecisionOutcome(context, item.decision.id),
        getDecisionEvidence(context, item.decision.id),
      ])
      const evidenceConfidence = outcome?.outcome?.evidenceConfidence ?? 0
      const recency = recencyRelevance(decision.decidedAt, historicalDecision.decidedAt)
      const comparisonConfidence = calculateComparisonConfidence({
        structuralSimilarity: item.structuralSimilarity,
        contextualSimilarity: null,
        evidenceConfidence,
        recencyRelevance: recency,
      })
      const factors = sharedAndDifferentFactors(decision.vector, historicalDecision.vector)
      const evidencePack = buildDecisionEvidencePack({
        newDecision: decision,
        historicalDecision,
        newOutcome,
        historicalOutcome: outcome,
        newEvidence,
        historicalEvidence: evidence,
      })
      const comparisonId = createId('dcmp')
      const createdAt = timestamp()
      await database.query(
        `INSERT INTO decision_comparisons (
           id, workspace_id, decision_a_id, decision_b_id, structural_similarity,
           contextual_similarity, evidence_confidence, recency_relevance,
           comparison_confidence, comparable, shared_factors_json,
           material_differences_json, comparison_version, model_version,
           semantic_status, semantic_explanation, semantic_error_code,
           evidence_pack_version, semantic_assessment_version,
           confidence_model_version, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, NULL, $6, $7, $8, NULL, $9, $10, $11, NULL,
           'pending', NULL, NULL, $12, $13, $14, $15, $16
         )
         ON CONFLICT (workspace_id, decision_a_id, decision_b_id, comparison_version)
         DO UPDATE SET
           structural_similarity = EXCLUDED.structural_similarity,
           contextual_similarity = NULL,
           evidence_confidence = EXCLUDED.evidence_confidence,
           recency_relevance = EXCLUDED.recency_relevance,
           comparison_confidence = EXCLUDED.comparison_confidence,
           comparable = NULL,
           shared_factors_json = EXCLUDED.shared_factors_json,
           material_differences_json = EXCLUDED.material_differences_json,
           model_version = NULL,
           semantic_status = 'pending',
           semantic_explanation = NULL,
           semantic_error_code = NULL,
           evidence_pack_version = EXCLUDED.evidence_pack_version,
           semantic_assessment_version = EXCLUDED.semantic_assessment_version,
           confidence_model_version = EXCLUDED.confidence_model_version,
           updated_at = EXCLUDED.updated_at`,
        [
          comparisonId,
          workspaceId,
          decisionId,
          historicalDecision.id,
          item.structuralSimilarity,
          evidenceConfidence,
          recency,
          comparisonConfidence,
          JSON.stringify(factors.sharedFactors),
          JSON.stringify(factors.materialDifferences),
          comparisonStructuralPolicy.version,
          DECISION_EVIDENCE_PACK_POLICY.version,
          SEMANTIC_REALITY_CHECK_CONTRACT.version,
          COMPARISON_CONFIDENCE_POLICY.version,
          createdAt,
          createdAt,
        ],
      )
      let semanticAssessment = null
      let semanticErrorCode = null
      if (semanticAssessor) {
        try {
          semanticAssessment = normalizeSemanticAssessment(await semanticAssessor.assess(evidencePack))
        } catch (error) {
          semanticErrorCode = /^[A-Z0-9_]{1,80}$/.test(String(error?.code || ''))
            ? String(error.code)
            : 'HERMES_SEMANTIC_FAILED'
        }
      } else {
        semanticErrorCode = 'HERMES_SEMANTIC_UNAVAILABLE'
      }
      if (semanticAssessment) {
        const finalConfidence = calculateComparisonConfidence({
          structuralSimilarity: item.structuralSimilarity,
          contextualSimilarity: semanticAssessment.contextualSimilarity,
          evidenceConfidence,
          recencyRelevance: recency,
        })
        await database.query(
          `UPDATE decision_comparisons SET
             contextual_similarity = $1,
             comparison_confidence = $2,
             comparable = $3,
             shared_factors_json = $4,
             material_differences_json = $5,
             model_version = $6,
             semantic_status = 'completed',
             semantic_explanation = $7,
             semantic_error_code = NULL,
             semantic_assessment_version = $8,
             updated_at = $9
           WHERE workspace_id = $10 AND decision_a_id = $11 AND decision_b_id = $12
             AND comparison_version = $13`,
          [
            semanticAssessment.contextualSimilarity,
            finalConfidence,
            semanticAssessment.comparable ? 1 : 0,
            JSON.stringify(semanticAssessment.sharedFactors),
            JSON.stringify(semanticAssessment.materialDifferences),
            semanticAssessment.modelVersion,
            semanticAssessment.explanation,
            semanticAssessment.assessmentVersion,
            timestamp(),
            workspaceId,
            decisionId,
            historicalDecision.id,
            comparisonStructuralPolicy.version,
          ],
        )
      } else {
        await database.query(
          `UPDATE decision_comparisons SET
             semantic_status = 'unavailable', semantic_error_code = $1, updated_at = $2
           WHERE workspace_id = $3 AND decision_a_id = $4 AND decision_b_id = $5
             AND comparison_version = $6`,
          [semanticErrorCode, timestamp(), workspaceId, decisionId, historicalDecision.id, comparisonStructuralPolicy.version],
        )
      }
      const persistedRows = await database.query(
        `SELECT * FROM decision_comparisons
         WHERE workspace_id = $1 AND decision_a_id = $2 AND decision_b_id = $3
           AND comparison_version = $4`,
        [workspaceId, decisionId, historicalDecision.id, comparisonStructuralPolicy.version],
      )
      const persisted = persistedRows[0]
      const effectiveComparison = await getDecisionComparison(context, persisted.id)
      candidates.push({
        ...effectiveComparison,
        decisionId: historicalDecision.id,
        decision: historicalDecision,
        causalConfidence: outcome?.outcome?.causalConfidence ?? null,
        outcome,
        semanticRealityCheck: evidencePack,
        provenance: {
          newDecisionId: decision.id,
          historicalDecisionId: historicalDecision.id,
          evidenceIds: (evidence || []).map((itemEvidence) => itemEvidence.id),
          newDecisionEvidenceIds: (newEvidence || []).map((itemEvidence) => itemEvidence.id),
          historicalDecisionEvidenceIds: (evidence || []).map((itemEvidence) => itemEvidence.id),
        },
      })
    }
    candidates.sort((left, right) => (
      right.comparisonConfidence - left.comparisonConfidence ||
      right.structuralSimilarity - left.structuralSimilarity
    ))
    return {
      decisionId,
      structuralScoringVersion: comparisonStructuralPolicy.version,
      comparisonConfidenceVersion: COMPARISON_CONFIDENCE_POLICY.version,
      threshold: selectedThreshold,
      semanticStage: candidates.length === 0
        ? 'not_applicable'
        : candidates.every((candidate) => candidate.semanticAssessment.status === 'completed')
          ? 'completed'
          : candidates.every((candidate) => candidate.semanticAssessment.status === 'unavailable')
            ? 'unavailable'
            : 'partial',
      candidates: candidates.slice(0, boundedLimit),
      total: Math.min(candidates.length, boundedLimit),
    }
  }

  return {
    vectorVersion: DECISION_VECTOR_VERSION,
    structuralPolicy,
    createDecision,
    getDecision,
    listDecisions,
    scheduleDecisionReview,
    listDecisionReviews,
    dispatchDueObservationReviews,
    addDecisionEvidence,
    addDecisionConfounder,
    getDecisionEvidence,
    getDecisionConfounders,
    recordOutcome,
    getDecisionOutcome,
    getDecisionComparison,
    reviewDecisionComparison,
    compareDecision,
    refreshDecisionIntelligence: learning.refreshWorkspace,
    runAutonomousDecisionIntelligence: learning.runAutonomousCycle,
    listDecisionPatterns: learning.listPatterns,
    listDecisionPredictions: learning.listPredictions,
    listDecisionWarnings: learning.listWarnings,
    reviewDecisionWarning: learning.reviewWarning,
    getDecisionCausalAssessment: learning.getCausalAssessment,
    getDecisionLearningModel: learning.getLearningModel,
    getDecisionIntelligenceOverview: learning.getIntelligenceOverview,
  }
}
