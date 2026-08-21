import { createHash, randomUUID } from 'node:crypto'

export const DECISION_LEARNING_POLICY = Object.freeze({
  version: 'decision-learning-v1',
  patternVersion: 'decision-pattern-v1',
  predictionVersion: 'outcome-prediction-v1',
  warningVersion: 'decision-warning-v1',
  causalVersion: 'causal-assessment-v1',
  structuralCalibrationVersion: 'structural-calibration-v1',
  minimumPatternSamples: 3,
  minimumCalibrationSamples: 8,
  minimumCalibrationClassSamples: 2,
  maximumTrainingSamples: 500,
  maximumSourceDecisions: 100,
  warningThreshold: 0.65,
  activePatternThreshold: 0.65,
  maximumListResults: 100,
})

export class DecisionLearningError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'DecisionLearningError'
    this.code = code
    this.status = status
  }
}

const structuralFieldColumns = Object.freeze({
  actionType: 'action_type',
  objectType: 'object_type',
  targetType: 'target_type',
  sourceState: 'source_state',
  destinationState: 'destination_state',
  intentType: 'intent_type',
  expectedDirection: 'expected_direction',
})

function round(value, precision = 6) {
  const multiplier = 10 ** precision
  return Math.round((Number(value) + Number.EPSILON) * multiplier) / multiplier
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, Number(value)))
}

function parseJson(value, fallback) {
  try {
    return (typeof value === 'string' ? JSON.parse(value) : value) ?? fallback
  } catch {
    return fallback
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
}

function stableHash(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function createId(prefix) {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`
}

function trustedScope(context, { write = false } = {}) {
  const workspaceId = String(context?.workspace?.id || '').trim()
  const userId = String(context?.user?.id || '').trim()
  if (!workspaceId || !userId) {
    throw new DecisionLearningError('DECISION_CONTEXT_REQUIRED', 'Trusted workspace and user context is required.', 401)
  }
  if (write && context?.membership?.role === 'viewer') {
    throw new DecisionLearningError('DECISION_PERMISSION_DENIED', 'Workspace write permission is required.', 403)
  }
  return { workspaceId, userId }
}

function actualDirection(change) {
  if (!Number.isFinite(Number(change))) return null
  if (Number(change) > 0) return 'positive'
  if (Number(change) < 0) return 'negative'
  return 'neutral'
}

function normalizeLimit(limit) {
  return Math.min(
    DECISION_LEARNING_POLICY.maximumListResults,
    Math.max(1, Number.isInteger(limit) ? limit : 50),
  )
}

function mapLearningModel(row) {
  if (!row) return null
  return {
    id: row.id,
    modelType: row.model_type,
    modelVersion: row.model_version,
    parameters: parseJson(row.parameters_json, {}),
    trainingMetrics: parseJson(row.training_metrics_json, {}),
    trainingDataHash: row.training_data_hash,
    sampleSize: Number(row.sample_size),
    status: row.status,
    createdAt: row.created_at,
  }
}

function mapPattern(row) {
  if (!row) return null
  return {
    id: row.id,
    patternKey: row.pattern_key,
    objectType: row.object_type,
    actionType: row.action_type,
    targetType: row.target_type,
    intentType: row.intent_type,
    metricKey: row.metric_key,
    sampleSize: Number(row.sample_size),
    positiveCount: Number(row.positive_count),
    negativeCount: Number(row.negative_count),
    neutralCount: Number(row.neutral_count),
    meanChangePercent: Number(row.mean_change_percent),
    standardDeviation: Number(row.standard_deviation),
    dominantDirection: row.dominant_direction,
    evidenceConfidence: Number(row.evidence_confidence),
    causalConfidence: Number(row.causal_confidence),
    patternConfidence: Number(row.pattern_confidence),
    sourceDecisionIds: parseJson(row.source_decision_ids_json, []),
    detectorVersion: row.detector_version,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapPrediction(row) {
  if (!row) return null
  return {
    id: row.id,
    decisionId: row.decision_id,
    metricKey: row.metric_key,
    patternId: row.pattern_id,
    predictedDirection: row.predicted_direction,
    predictedChangePercent: Number(row.predicted_change_percent),
    intervalLow: Number(row.interval_low),
    intervalHigh: Number(row.interval_high),
    predictionConfidence: Number(row.prediction_confidence),
    sampleSize: Number(row.sample_size),
    sourceDecisionIds: parseJson(row.source_decision_ids_json, []),
    modelVersion: row.model_version,
    status: row.status,
    actualDirection: row.actual_direction,
    actualChangePercent: row.actual_change_percent === null ? null : Number(row.actual_change_percent),
    absoluteError: row.absolute_error === null ? null : Number(row.absolute_error),
    measuredAt: row.measured_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapWarning(row) {
  if (!row) return null
  return {
    id: row.id,
    decisionId: row.decision_id,
    decisionTitle: row.decision_title,
    metricKey: row.metric_key,
    patternId: row.pattern_id,
    predictionId: row.prediction_id,
    warningType: row.warning_type,
    severity: row.severity,
    summary: row.summary,
    warningConfidence: Number(row.warning_confidence),
    evidence: parseJson(row.evidence_json, {}),
    policyVersion: row.policy_version,
    status: row.status,
    notifiedAt: row.notified_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCausalAssessment(row) {
  if (!row) return null
  return {
    id: row.id,
    decisionId: row.decision_id,
    metricKey: row.metric_key,
    designType: row.design_type,
    claimLevel: row.claim_level,
    effectEstimate: row.effect_estimate === null ? null : Number(row.effect_estimate),
    effectUnit: row.effect_unit,
    controlBaselineValue: row.control_baseline_value === null ? null : Number(row.control_baseline_value),
    controlObservedValue: row.control_observed_value === null ? null : Number(row.control_observed_value),
    evidenceConfidence: Number(row.evidence_confidence),
    causalConfidence: Number(row.causal_confidence),
    inferenceConfidence: Number(row.inference_confidence),
    confounderCount: Number(row.confounder_count),
    assumptions: parseJson(row.assumptions_json, []),
    modelVersion: row.model_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function calculateAdaptiveStructuralWeights(samples, baseWeights) {
  const fields = Object.keys(baseWeights)
  const positives = samples.filter((sample) => sample.comparable === true)
  const negatives = samples.filter((sample) => sample.comparable === false)
  const rawWeights = {}
  const discrimination = {}
  for (const field of fields) {
    const positiveRate = (positives.filter((sample) => sample.matches[field]).length + 1) / (positives.length + 2)
    const negativeRate = (negatives.filter((sample) => sample.matches[field]).length + 1) / (negatives.length + 2)
    discrimination[field] = round(positiveRate - negativeRate)
    const boundedAdjustment = clamp(1 + discrimination[field] * 0.2, 0.8, 1.2)
    rawWeights[field] = Number(baseWeights[field]) * boundedAdjustment
  }
  const total = Object.values(rawWeights).reduce((sum, value) => sum + value, 0)
  const weights = Object.fromEntries(fields.map((field) => [field, round(rawWeights[field] / total)]))
  const roundedTotal = Object.values(weights).reduce((sum, value) => sum + value, 0)
  const finalField = fields.at(-1)
  weights[finalField] = round(weights[finalField] + (1 - roundedTotal))
  return {
    weights,
    discrimination,
    positiveSamples: positives.length,
    negativeSamples: negatives.length,
  }
}

export function detectDecisionPatterns(rows, policy = DECISION_LEARNING_POLICY) {
  const groups = new Map()
  for (const row of rows) {
    const change = Number(row.change_percent)
    if (row.measurement_status !== 'measured' || !Number.isFinite(change)) continue
    const signature = {
      objectType: row.object_type,
      actionType: row.action_type,
      targetType: row.target_type,
      intentType: row.intent_type,
      metricKey: row.metric_key,
    }
    const key = stableHash(signature)
    const group = groups.get(key) || { key, signature, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }
  const patterns = []
  for (const group of groups.values()) {
    if (group.rows.length < policy.minimumPatternSamples) continue
    const weights = group.rows.map((row) => Math.max(0.05, Number(row.evidence_confidence) || 0))
    const totalWeight = weights.reduce((sum, value) => sum + value, 0)
    const mean = group.rows.reduce((sum, row, index) => sum + Number(row.change_percent) * weights[index], 0) / totalWeight
    const variance = group.rows.reduce((sum, row) => sum + (Number(row.change_percent) - mean) ** 2, 0) / group.rows.length
    const counts = { positive: 0, negative: 0, neutral: 0 }
    for (const row of group.rows) counts[actualDirection(row.change_percent)] += 1
    const ordered = Object.entries(counts).sort((left, right) => right[1] - left[1])
    const dominantDirection = ordered[0][1] === ordered[1][1] ? 'mixed' : ordered[0][0]
    const consistency = ordered[0][1] / group.rows.length
    const evidenceConfidence = group.rows.reduce((sum, row) => sum + Number(row.evidence_confidence || 0), 0) / group.rows.length
    const causalConfidence = group.rows.reduce((sum, row) => sum + Number(row.causal_confidence || 0), 0) / group.rows.length
    const sampleScore = Math.min(1, group.rows.length / 10)
    const patternConfidence = clamp(sampleScore * 0.3 + consistency * 0.35 + evidenceConfidence * 0.35)
    patterns.push({
      patternKey: group.key,
      ...group.signature,
      sampleSize: group.rows.length,
      positiveCount: counts.positive,
      negativeCount: counts.negative,
      neutralCount: counts.neutral,
      meanChangePercent: round(mean),
      standardDeviation: round(Math.sqrt(variance)),
      dominantDirection,
      evidenceConfidence: round(evidenceConfidence),
      causalConfidence: round(causalConfidence),
      patternConfidence: round(patternConfidence),
      sourceDecisionIds: [...new Set(group.rows.map((row) => row.decision_id))].slice(0, policy.maximumSourceDecisions),
      status: patternConfidence >= policy.activePatternThreshold ? 'active' : 'emerging',
    })
  }
  return patterns.sort((left, right) => right.patternConfidence - left.patternConfidence || right.sampleSize - left.sampleSize)
}

export function createDecisionLearningService({ database, baseStructuralPolicy, now = () => new Date() } = {}) {
  if (!database?.query || !database?.transaction || !baseStructuralPolicy?.weights) {
    throw new TypeError('Decision learning requires the Lancee database adapter and structural policy.')
  }
  const timestamp = () => {
    const value = now()
    const date = value instanceof Date ? value : new Date(value)
    if (!Number.isFinite(date.getTime())) throw new TypeError('Decision learning now() returned an invalid date.')
    return date.toISOString()
  }

  async function recordDerivedEvent(workspaceId, eventType, entityType, entityId, payload, occurredAt = timestamp()) {
    const id = createId('evt')
    await database.query(
      `INSERT INTO workspace_events (
         id, workspace_id, actor_id, event_type, entity_type, entity_id,
         client_id, project_id, conversation_id, connection_id, source_channel,
         source_identifier, participant_refs_json, payload_json, importance,
         occurred_at, processed_at, created_at
       ) VALUES ($1, $2, NULL, $3, $4, $5, NULL, NULL, NULL, NULL, NULL,
         NULL, '[]', $6, 85, $7, NULL, $8)`,
      [id, workspaceId, eventType, entityType, entityId, JSON.stringify(payload), occurredAt, occurredAt],
    )
  }

  async function structuralPolicyForWorkspace(workspaceId) {
    const rows = await database.query(
      `SELECT * FROM decision_learning_models
       WHERE workspace_id = $1 AND model_type = 'structural_similarity'
         AND status = 'active' AND active_key = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [workspaceId],
    )
    const model = mapLearningModel(rows[0])
    const weights = model?.parameters?.weights
    const validWeights = weights && Object.keys(baseStructuralPolicy.weights).every((field) => (
      Number.isFinite(Number(weights[field])) && Number(weights[field]) > 0
    ))
    return validWeights
      ? { ...baseStructuralPolicy, version: model.modelVersion, weights }
      : baseStructuralPolicy
  }

  async function calibrateWorkspace(workspaceId) {
    const selectFields = Object.entries(structuralFieldColumns).flatMap(([field, column]) => [
      `va.${column} AS a_${field}`,
      `vb.${column} AS b_${field}`,
    ]).join(', ')
    const rows = await database.query(
      `SELECT r.id AS review_id, r.comparable, r.created_at, ${selectFields}
       FROM decision_comparison_reviews r
       JOIN decision_comparisons c
         ON c.workspace_id = r.workspace_id AND c.id = r.comparison_id
       JOIN decision_vectors va
         ON va.workspace_id = c.workspace_id AND va.decision_id = c.decision_a_id
       JOIN decision_vectors vb
         ON vb.workspace_id = c.workspace_id AND vb.decision_id = c.decision_b_id
       WHERE r.workspace_id = $1
         AND r.id = (
           SELECT latest.id FROM decision_comparison_reviews latest
           WHERE latest.workspace_id = r.workspace_id
             AND latest.comparison_id = r.comparison_id
           ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1
         )
       ORDER BY r.created_at DESC LIMIT $2`,
      [workspaceId, DECISION_LEARNING_POLICY.maximumTrainingSamples],
    )
    const samples = rows.map((row) => ({
      id: row.review_id,
      comparable: Boolean(row.comparable),
      matches: Object.fromEntries(Object.keys(structuralFieldColumns).map((field) => [
        field,
        row[`a_${field}`] === row[`b_${field}`],
      ])),
    }))
    const positiveSamples = samples.filter((sample) => sample.comparable).length
    const negativeSamples = samples.length - positiveSamples
    if (
      samples.length < DECISION_LEARNING_POLICY.minimumCalibrationSamples ||
      positiveSamples < DECISION_LEARNING_POLICY.minimumCalibrationClassSamples ||
      negativeSamples < DECISION_LEARNING_POLICY.minimumCalibrationClassSamples
    ) return null

    const calibration = calculateAdaptiveStructuralWeights(samples, baseStructuralPolicy.weights)
    const trainingDataHash = stableHash(samples)
    const modelVersion = `${DECISION_LEARNING_POLICY.structuralCalibrationVersion}-${trainingDataHash.slice(0, 12)}`
    const existing = await database.query(
      `SELECT * FROM decision_learning_models
       WHERE workspace_id = $1 AND model_type = 'structural_similarity' AND model_version = $2`,
      [workspaceId, modelVersion],
    )
    if (existing[0]?.status === 'active') return mapLearningModel(existing[0])
    const createdAt = timestamp()
    await database.transaction(async () => {
      await database.query(
        `UPDATE decision_learning_models
         SET status = 'superseded', active_key = NULL
         WHERE workspace_id = $1 AND model_type = 'structural_similarity' AND status = 'active'`,
        [workspaceId],
      )
      await database.query(
        `INSERT INTO decision_learning_models (
           id, workspace_id, model_type, model_version, parameters_json,
           training_metrics_json, training_data_hash, sample_size, status,
           active_key, created_at
         ) VALUES ($1, $2, 'structural_similarity', $3, $4, $5, $6, $7, 'active', 'active', $8)
         ON CONFLICT (workspace_id, model_type, model_version) DO UPDATE SET
           parameters_json = EXCLUDED.parameters_json,
           training_metrics_json = EXCLUDED.training_metrics_json,
           training_data_hash = EXCLUDED.training_data_hash,
           sample_size = EXCLUDED.sample_size,
           status = 'active', active_key = 'active', created_at = EXCLUDED.created_at`,
        [
          createId('dlm'), workspaceId, modelVersion,
          JSON.stringify({ weights: calibration.weights, baseVersion: baseStructuralPolicy.version }),
          JSON.stringify({
            discrimination: calibration.discrimination,
            positiveSamples: calibration.positiveSamples,
            negativeSamples: calibration.negativeSamples,
          }),
          trainingDataHash, samples.length, createdAt,
        ],
      )
      await recordDerivedEvent(workspaceId, 'decision.learning_model_updated', 'decision_learning_model', modelVersion, {
        modelType: 'structural_similarity',
        modelVersion,
        sampleSize: samples.length,
        trainingDataHash,
      }, createdAt)
    })
    const created = await database.query(
      `SELECT * FROM decision_learning_models
       WHERE workspace_id = $1 AND model_type = 'structural_similarity' AND model_version = $2`,
      [workspaceId, modelVersion],
    )
    return mapLearningModel(created[0])
  }

  async function refreshPatterns(workspaceId) {
    const sourceRows = await database.query(
      `SELECT d.id AS decision_id, v.object_type, v.action_type, v.target_type,
              v.intent_type, m.metric_key, m.change_percent, m.measurement_status,
              o.evidence_confidence, o.causal_confidence
       FROM decisions d
       JOIN decision_vectors v
         ON v.workspace_id = d.workspace_id AND v.decision_id = d.id
       JOIN decision_metrics m
         ON m.workspace_id = d.workspace_id AND m.decision_id = d.id
       JOIN decision_outcomes o
         ON o.workspace_id = d.workspace_id AND o.decision_id = d.id
       WHERE d.workspace_id = $1 AND m.measurement_status = 'measured'
         AND m.change_percent IS NOT NULL
       ORDER BY d.decided_at DESC LIMIT $2`,
      [workspaceId, DECISION_LEARNING_POLICY.maximumTrainingSamples],
    )
    const patterns = detectDecisionPatterns(sourceRows)
    const existingRows = await database.query(
      `SELECT * FROM decision_patterns
       WHERE workspace_id = $1 AND detector_version = $2`,
      [workspaceId, DECISION_LEARNING_POLICY.patternVersion],
    )
    const existingByKey = new Map(existingRows.map((row) => [row.pattern_key, row]))
    const updatedAt = timestamp()
    await database.transaction(async () => {
      await database.query(
        `UPDATE decision_patterns SET status = 'retired', updated_at = $1
         WHERE workspace_id = $2 AND detector_version = $3 AND status <> 'retired'`,
        [updatedAt, workspaceId, DECISION_LEARNING_POLICY.patternVersion],
      )
      for (const pattern of patterns) {
        const id = existingByKey.get(pattern.patternKey)?.id || `dpat_${pattern.patternKey.slice(0, 32)}`
        await database.query(
          `INSERT INTO decision_patterns (
             id, workspace_id, pattern_key, object_type, action_type, target_type,
             intent_type, metric_key, sample_size, positive_count, negative_count,
             neutral_count, mean_change_percent, standard_deviation,
             dominant_direction, evidence_confidence, causal_confidence,
             pattern_confidence, source_decision_ids_json, detector_version,
             status, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
           ON CONFLICT (workspace_id, pattern_key, detector_version) DO UPDATE SET
             sample_size = EXCLUDED.sample_size,
             positive_count = EXCLUDED.positive_count,
             negative_count = EXCLUDED.negative_count,
             neutral_count = EXCLUDED.neutral_count,
             mean_change_percent = EXCLUDED.mean_change_percent,
             standard_deviation = EXCLUDED.standard_deviation,
             dominant_direction = EXCLUDED.dominant_direction,
             evidence_confidence = EXCLUDED.evidence_confidence,
             causal_confidence = EXCLUDED.causal_confidence,
             pattern_confidence = EXCLUDED.pattern_confidence,
             source_decision_ids_json = EXCLUDED.source_decision_ids_json,
             status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at`,
          [
            id, workspaceId, pattern.patternKey, pattern.objectType, pattern.actionType,
            pattern.targetType, pattern.intentType, pattern.metricKey, pattern.sampleSize,
            pattern.positiveCount, pattern.negativeCount, pattern.neutralCount,
            pattern.meanChangePercent, pattern.standardDeviation,
            pattern.dominantDirection, pattern.evidenceConfidence,
            pattern.causalConfidence, pattern.patternConfidence,
            JSON.stringify(pattern.sourceDecisionIds), DECISION_LEARNING_POLICY.patternVersion,
            pattern.status, existingByKey.get(pattern.patternKey)?.created_at || updatedAt, updatedAt,
          ],
        )
        if (!existingByKey.has(pattern.patternKey)) {
          await recordDerivedEvent(workspaceId, 'decision.pattern_detected', 'decision_pattern', id, {
            detectorVersion: DECISION_LEARNING_POLICY.patternVersion,
            sampleSize: pattern.sampleSize,
            patternConfidence: pattern.patternConfidence,
          }, updatedAt)
        }
      }
    })
    return patterns
  }

  async function generatePredictionsAndWarnings(workspaceId) {
    const patternRows = await database.query(
      `SELECT * FROM decision_patterns
       WHERE workspace_id = $1 AND status IN ('active', 'emerging')
         AND pattern_confidence >= $2
       ORDER BY pattern_confidence DESC`,
      [workspaceId, 0.5],
    )
    const patternBySignature = new Map(patternRows.map((row) => [[
      row.object_type, row.action_type, row.target_type, row.intent_type, row.metric_key,
    ].join('|'), row]))
    const candidates = await database.query(
      `SELECT d.id AS decision_id, d.title AS decision_title, v.object_type,
              v.action_type, v.target_type, v.intent_type, e.metric_key,
              e.direction AS expected_direction
       FROM decisions d
       JOIN decision_vectors v
         ON v.workspace_id = d.workspace_id AND v.decision_id = d.id
       JOIN decision_expected_reactions e
         ON e.workspace_id = d.workspace_id AND e.decision_id = d.id
       LEFT JOIN decision_metrics m
         ON m.workspace_id = d.workspace_id AND m.decision_id = d.id
        AND m.metric_key = e.metric_key
       WHERE d.workspace_id = $1 AND d.status IN ('draft', 'active')
         AND (m.measurement_status IS NULL OR m.measurement_status = 'pending')
       ORDER BY d.decided_at DESC LIMIT $2`,
      [workspaceId, DECISION_LEARNING_POLICY.maximumTrainingSamples],
    )
    const existingPredictions = await database.query(
      `SELECT * FROM decision_predictions WHERE workspace_id = $1`,
      [workspaceId],
    )
    const existingPredictionKeys = new Set(existingPredictions.map((row) => `${row.decision_id}|${row.metric_key}|${row.model_version}`))
    const createdPredictions = []
    const createdWarnings = []
    for (const candidate of candidates) {
      const signature = [
        candidate.object_type, candidate.action_type, candidate.target_type,
        candidate.intent_type, candidate.metric_key,
      ].join('|')
      const patternRow = patternBySignature.get(signature)
      if (!patternRow) continue
      const pattern = mapPattern(patternRow)
      const predictedDirection = pattern.dominantDirection
      const standardError = pattern.standardDeviation / Math.sqrt(pattern.sampleSize)
      const margin = 1.96 * standardError
      const predictionConfidence = round(clamp(pattern.patternConfidence * Math.min(1, pattern.sampleSize / 5)))
      const predictionKey = `${candidate.decision_id}|${candidate.metric_key}|${DECISION_LEARNING_POLICY.predictionVersion}`
      const predictionId = `dpred_${stableHash(predictionKey).slice(0, 32)}`
      const createdAt = timestamp()
      const predictionRows = await database.query(
        `INSERT INTO decision_predictions (
           id, workspace_id, decision_id, metric_key, pattern_id,
           predicted_direction, predicted_change_percent, interval_low,
           interval_high, prediction_confidence, sample_size,
           source_decision_ids_json, model_version, status, actual_direction,
           actual_change_percent, absolute_error, measured_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
           'active', NULL, NULL, NULL, NULL, $14, $15)
         ON CONFLICT (workspace_id, decision_id, metric_key, model_version) DO UPDATE SET
           pattern_id = EXCLUDED.pattern_id,
           predicted_direction = EXCLUDED.predicted_direction,
           predicted_change_percent = EXCLUDED.predicted_change_percent,
           interval_low = EXCLUDED.interval_low,
           interval_high = EXCLUDED.interval_high,
           prediction_confidence = EXCLUDED.prediction_confidence,
           sample_size = EXCLUDED.sample_size,
           source_decision_ids_json = EXCLUDED.source_decision_ids_json,
           updated_at = EXCLUDED.updated_at
         WHERE decision_predictions.status = 'active'
         RETURNING *`,
        [
          predictionId, workspaceId, candidate.decision_id, candidate.metric_key,
          pattern.id, predictedDirection, pattern.meanChangePercent,
          round(pattern.meanChangePercent - margin), round(pattern.meanChangePercent + margin),
          predictionConfidence, pattern.sampleSize,
          JSON.stringify(pattern.sourceDecisionIds), DECISION_LEARNING_POLICY.predictionVersion,
          createdAt, createdAt,
        ],
      )
      if (!predictionRows[0]) continue
      const prediction = mapPrediction(predictionRows[0])
      createdPredictions.push(prediction)
      if (!existingPredictionKeys.has(predictionKey)) {
        await recordDerivedEvent(workspaceId, 'decision.prediction_created', 'decision_prediction', prediction.id, {
          decisionId: candidate.decision_id,
          metricKey: candidate.metric_key,
          predictionConfidence,
          modelVersion: DECISION_LEARNING_POLICY.predictionVersion,
        }, createdAt)
      }
      const expectedIncrease = /increase|positive|improve|grow|higher/.test(candidate.expected_direction)
      const expectedDecrease = /decrease|negative|reduce|lower/.test(candidate.expected_direction)
      const contradictsExpectation = (expectedIncrease && predictedDirection === 'negative') ||
        (expectedDecrease && predictedDirection === 'positive')
      if (!contradictsExpectation || predictionConfidence < DECISION_LEARNING_POLICY.warningThreshold) continue
      const warningType = 'historical_outcome_conflict'
      const warningId = `dwrn_${stableHash(`${candidate.decision_id}|${candidate.metric_key}|${warningType}|${DECISION_LEARNING_POLICY.warningVersion}`).slice(0, 32)}`
      const severity = predictionConfidence >= 0.8 && Math.abs(pattern.meanChangePercent) >= 10 ? 'high' : 'medium'
      const summary = `Historical outcomes for ${candidate.metric_key} point ${predictedDirection}, contrary to the recorded expectation.`
      await database.transaction(async () => {
        const warningRows = await database.query(
          `INSERT INTO decision_warnings (
             id, workspace_id, decision_id, metric_key, pattern_id, prediction_id,
             warning_type, severity, summary, warning_confidence, evidence_json,
             policy_version, status, notified_at, reviewed_by, reviewed_at,
             created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             'active', $13, NULL, NULL, $14, $15)
           ON CONFLICT (workspace_id, decision_id, metric_key, warning_type, policy_version)
           DO NOTHING RETURNING *`,
          [
            warningId, workspaceId, candidate.decision_id, candidate.metric_key,
            pattern.id, prediction.id, warningType, severity, summary,
            predictionConfidence, JSON.stringify({
              patternId: pattern.id,
              predictionId: prediction.id,
              sourceDecisionIds: pattern.sourceDecisionIds,
              predictedChangePercent: pattern.meanChangePercent,
              intervalLow: prediction.intervalLow,
              intervalHigh: prediction.intervalHigh,
              expectedDirection: candidate.expected_direction,
              causalClaim: false,
            }), DECISION_LEARNING_POLICY.warningVersion, createdAt, createdAt, createdAt,
          ],
        )
        if (!warningRows[0]) return
        await database.createWorkspaceNotification({
          workspaceId,
          kind: 'decision.proactive_warning',
          title: 'Decision evidence warning',
          body: String(summary).slice(0, 500),
          entityType: 'decision',
          entityId: candidate.decision_id,
        })
        await recordDerivedEvent(workspaceId, 'decision.warning_created', 'decision_warning', warningId, {
          decisionId: candidate.decision_id,
          metricKey: candidate.metric_key,
          severity,
          warningConfidence: predictionConfidence,
          policyVersion: DECISION_LEARNING_POLICY.warningVersion,
        }, createdAt)
        createdWarnings.push(mapWarning({ ...warningRows[0], decision_title: candidate.decision_title }))
      })
    }
    return { predictions: createdPredictions, warnings: createdWarnings }
  }

  async function recordCausalAssessment(workspaceId, decisionId, metric, outcome, causalAnalysis = {}) {
    const designType = String(causalAnalysis.designType || 'observational_pre_post')
    if (!['observational_pre_post', 'controlled_before_after'].includes(designType)) {
      throw new DecisionLearningError('INVALID_CAUSAL_DESIGN', 'Use observational_pre_post or controlled_before_after.')
    }
    const confounders = await database.query(
      `SELECT significance FROM decision_confounders
       WHERE workspace_id = $1 AND decision_id = $2`,
      [workspaceId, decisionId],
    )
    const maximumConfounder = confounders.reduce((maximum, row) => Math.max(maximum, Number(row.significance || 0)), 0)
    const evidenceConfidence = clamp(outcome.evidenceConfidence)
    const causalConfidence = clamp(outcome.causalConfidence || 0)
    let effectEstimate = metric.changePercent
    let effectUnit = 'percent_change'
    let claimLevel = 'association_only'
    let controlBaselineValue = null
    let controlObservedValue = null
    let assumptions = [
      'Before/after movement is an association and does not identify a counterfactual.',
      'Unrecorded confounders may explain some or all of the observed change.',
    ]
    let designFactor = 0.55
    if (designType === 'controlled_before_after') {
      controlBaselineValue = Number(causalAnalysis.controlBaselineValue)
      controlObservedValue = Number(causalAnalysis.controlObservedValue)
      if (!Number.isFinite(controlBaselineValue) || !Number.isFinite(controlObservedValue)) {
        throw new DecisionLearningError(
          'INVALID_CAUSAL_DESIGN',
          'controlled_before_after requires finite control baseline and observed values.',
        )
      }
      const treatmentBaseline = Number(metric.baselineValue)
      const treatmentObserved = Number(metric.observedValue)
      if (!Number.isFinite(treatmentBaseline) || !Number.isFinite(treatmentObserved)) {
        throw new DecisionLearningError('INVALID_CAUSAL_DESIGN', 'A controlled estimate requires measured treatment values.')
      }
      if (treatmentBaseline !== 0 && controlBaselineValue !== 0) {
        effectEstimate = round(((treatmentObserved - treatmentBaseline) / Math.abs(treatmentBaseline)) * 100 -
          ((controlObservedValue - controlBaselineValue) / Math.abs(controlBaselineValue)) * 100)
        effectUnit = 'percentage_points'
      } else {
        effectEstimate = round((treatmentObserved - treatmentBaseline) - (controlObservedValue - controlBaselineValue))
        effectUnit = metric.unit || 'absolute_delta'
      }
      claimLevel = 'controlled_estimate'
      assumptions = [
        'Treatment and control would have followed parallel trends without the decision.',
        'Measurement windows and metric definitions are comparable.',
        'No unrecorded time-varying confounder affected only one group.',
        'A controlled estimate is not proof of causality without design validation.',
      ]
      designFactor = 0.85
    }
    const inferenceConfidence = round(clamp(
      Math.min(evidenceConfidence, causalConfidence) * designFactor * (1 - maximumConfounder * 0.5),
    ))
    const updatedAt = timestamp()
    const id = `dcau_${stableHash(`${workspaceId}|${decisionId}|${metric.metricKey}|${DECISION_LEARNING_POLICY.causalVersion}`).slice(0, 32)}`
    await database.query(
      `INSERT INTO decision_causal_assessments (
         id, workspace_id, decision_id, metric_key, design_type, claim_level,
         effect_estimate, effect_unit, control_baseline_value,
         control_observed_value, evidence_confidence, causal_confidence,
         inference_confidence, confounder_count, assumptions_json, model_version,
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18)
       ON CONFLICT (workspace_id, decision_id, metric_key, model_version) DO UPDATE SET
         design_type = EXCLUDED.design_type,
         claim_level = EXCLUDED.claim_level,
         effect_estimate = EXCLUDED.effect_estimate,
         effect_unit = EXCLUDED.effect_unit,
         control_baseline_value = EXCLUDED.control_baseline_value,
         control_observed_value = EXCLUDED.control_observed_value,
         evidence_confidence = EXCLUDED.evidence_confidence,
         causal_confidence = EXCLUDED.causal_confidence,
         inference_confidence = EXCLUDED.inference_confidence,
         confounder_count = EXCLUDED.confounder_count,
         assumptions_json = EXCLUDED.assumptions_json,
         updated_at = EXCLUDED.updated_at`,
      [
        id, workspaceId, decisionId, metric.metricKey, designType, claimLevel,
        effectEstimate, effectUnit, controlBaselineValue, controlObservedValue,
        evidenceConfidence, causalConfidence, inferenceConfidence,
        confounders.length, JSON.stringify(assumptions),
        DECISION_LEARNING_POLICY.causalVersion, updatedAt, updatedAt,
      ],
    )
    await recordDerivedEvent(workspaceId, 'decision.causal_assessed', 'decision_causal_assessment', id, {
      decisionId,
      metricKey: metric.metricKey,
      designType,
      claimLevel,
      inferenceConfidence,
      causalClaimEstablished: false,
    }, updatedAt)
    return getCausalAssessmentByScope(workspaceId, decisionId, metric.metricKey)
  }

  async function completePrediction(workspaceId, decisionId, metricKey, metric, measuredAt = timestamp()) {
    const direction = actualDirection(metric.changePercent ?? metric.changeAbsolute)
    const rows = await database.query(
      `UPDATE decision_predictions SET
         status = 'measured', actual_direction = $1,
         actual_change_percent = CAST($2 AS REAL),
         absolute_error = CASE
           WHEN CAST($2 AS REAL) IS NULL THEN NULL
           ELSE ABS(predicted_change_percent - CAST($2 AS REAL))
         END,
         measured_at = $3, updated_at = $4
       WHERE workspace_id = $5 AND decision_id = $6 AND metric_key = $7
         AND status = 'active'
       RETURNING *`,
      [direction, metric.changePercent, measuredAt, measuredAt, workspaceId, decisionId, metricKey],
    )
    await database.query(
      `UPDATE decision_warnings SET status = 'resolved', updated_at = $1
       WHERE workspace_id = $2 AND decision_id = $3 AND metric_key = $4
         AND status = 'active'`,
      [measuredAt, workspaceId, decisionId, metricKey],
    )
    for (const row of rows) {
      await recordDerivedEvent(workspaceId, 'decision.prediction_measured', 'decision_prediction', row.id, {
        decisionId,
        metricKey,
        actualDirection: direction,
        actualChangePercent: metric.changePercent,
        absoluteError: row.absolute_error === null ? null : Number(row.absolute_error),
        modelVersion: row.model_version,
      }, measuredAt)
    }
    return rows.map(mapPrediction)
  }

  async function getCausalAssessmentByScope(workspaceId, decisionId, metricKey = null) {
    const params = [workspaceId, decisionId]
    const metricFilter = metricKey ? ' AND metric_key = $3' : ''
    if (metricKey) params.push(metricKey)
    const rows = await database.query(
      `SELECT * FROM decision_causal_assessments
       WHERE workspace_id = $1 AND decision_id = $2${metricFilter}
       ORDER BY updated_at DESC LIMIT 1`,
      params,
    )
    return mapCausalAssessment(rows[0])
  }

  async function runWorkspaceCycle(workspaceId) {
    const model = await calibrateWorkspace(workspaceId)
    const patterns = await refreshPatterns(workspaceId)
    const generated = await generatePredictionsAndWarnings(workspaceId)
    return {
      workspaceId,
      model,
      patternCount: patterns.length,
      predictionCount: generated.predictions.length,
      warningCount: generated.warnings.length,
    }
  }

  async function runAutonomousCycle({ limit = 20 } = {}) {
    const boundedLimit = Math.min(100, Math.max(1, Number.isInteger(limit) ? limit : 20))
    const workspaces = await database.query(
      `SELECT DISTINCT workspace_id FROM decisions ORDER BY workspace_id LIMIT $1`,
      [boundedLimit],
    )
    const results = []
    for (const row of workspaces) {
      try {
        results.push(await runWorkspaceCycle(row.workspace_id))
      } catch (error) {
        results.push({
          workspaceId: row.workspace_id,
          errorCode: String(error?.code || 'DECISION_LEARNING_FAILED').slice(0, 80),
        })
      }
    }
    return results
  }

  async function refreshWorkspace(context) {
    const { workspaceId } = trustedScope(context, { write: true })
    return runWorkspaceCycle(workspaceId)
  }

  async function listPatterns(context, { status = 'active', limit } = {}) {
    const { workspaceId } = trustedScope(context)
    const selectedStatus = String(status || 'active')
    if (!['all', 'active', 'emerging', 'retired'].includes(selectedStatus)) {
      throw new DecisionLearningError('INVALID_PATTERN_STATUS', 'Use all, active, emerging, or retired.')
    }
    const params = [workspaceId]
    const filter = selectedStatus === 'all' ? '' : ` AND status = $${params.push(selectedStatus)}`
    params.push(normalizeLimit(limit))
    const rows = await database.query(
      `SELECT * FROM decision_patterns WHERE workspace_id = $1${filter}
       ORDER BY pattern_confidence DESC, sample_size DESC LIMIT $${params.length}`,
      params,
    )
    return rows.map(mapPattern)
  }

  async function listPredictions(context, { decisionId = null, status = 'active', limit } = {}) {
    const { workspaceId } = trustedScope(context)
    const selectedStatus = String(status || 'active')
    if (!['all', 'active', 'measured', 'superseded'].includes(selectedStatus)) {
      throw new DecisionLearningError('INVALID_PREDICTION_STATUS', 'Use all, active, measured, or superseded.')
    }
    const params = [workspaceId]
    const filters = []
    if (decisionId) filters.push(`decision_id = $${params.push(String(decisionId))}`)
    if (selectedStatus !== 'all') filters.push(`status = $${params.push(selectedStatus)}`)
    params.push(normalizeLimit(limit))
    const rows = await database.query(
      `SELECT * FROM decision_predictions WHERE workspace_id = $1
       ${filters.length ? `AND ${filters.join(' AND ')}` : ''}
       ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    )
    return rows.map(mapPrediction)
  }

  async function listWarnings(context, { status = 'active', limit } = {}) {
    const { workspaceId } = trustedScope(context)
    const selectedStatus = String(status || 'active')
    if (!['all', 'active', 'acknowledged', 'dismissed', 'resolved'].includes(selectedStatus)) {
      throw new DecisionLearningError('INVALID_WARNING_STATUS', 'Use a supported warning status.')
    }
    const params = [workspaceId]
    const filter = selectedStatus === 'all' ? '' : ` AND w.status = $${params.push(selectedStatus)}`
    params.push(normalizeLimit(limit))
    const rows = await database.query(
      `SELECT w.*, d.title AS decision_title
       FROM decision_warnings w
       JOIN decisions d ON d.workspace_id = w.workspace_id AND d.id = w.decision_id
       WHERE w.workspace_id = $1${filter}
       ORDER BY CASE w.severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                w.created_at DESC LIMIT $${params.length}`,
      params,
    )
    return rows.map(mapWarning)
  }

  async function reviewWarning(context, warningId, action) {
    const { workspaceId, userId } = trustedScope(context, { write: true })
    const selectedAction = String(action || '')
    if (!['acknowledged', 'dismissed'].includes(selectedAction)) {
      throw new DecisionLearningError('INVALID_WARNING_REVIEW', 'Use acknowledged or dismissed.')
    }
    const reviewedAt = timestamp()
    const rows = await database.query(
      `UPDATE decision_warnings SET status = $1, reviewed_by = $2,
         reviewed_at = $3, updated_at = $4
       WHERE workspace_id = $5 AND id = $6 AND status = 'active'
       RETURNING *`,
      [selectedAction, userId, reviewedAt, reviewedAt, workspaceId, String(warningId || '')],
    )
    if (!rows[0]) throw new DecisionLearningError('DECISION_WARNING_NOT_FOUND', 'Active decision warning not found.', 404)
    return mapWarning(rows[0])
  }

  async function getCausalAssessment(context, decisionId, metricKey = null) {
    const { workspaceId } = trustedScope(context)
    return getCausalAssessmentByScope(workspaceId, decisionId, metricKey)
  }

  async function getLearningModel(context, modelType = 'structural_similarity') {
    const { workspaceId } = trustedScope(context)
    if (!['structural_similarity', 'outcome_prediction'].includes(modelType)) {
      throw new DecisionLearningError('INVALID_LEARNING_MODEL', 'Use a supported learning model type.')
    }
    const rows = await database.query(
      `SELECT * FROM decision_learning_models
       WHERE workspace_id = $1 AND model_type = $2 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [workspaceId, modelType],
    )
    return mapLearningModel(rows[0])
  }

  return {
    policy: DECISION_LEARNING_POLICY,
    structuralPolicyForWorkspace,
    calibrateWorkspace,
    refreshPatterns,
    generatePredictionsAndWarnings,
    recordCausalAssessment,
    completePrediction,
    runWorkspaceCycle,
    runAutonomousCycle,
    refreshWorkspace,
    listPatterns,
    listPredictions,
    listWarnings,
    reviewWarning,
    getCausalAssessment,
    getLearningModel,
  }
}
