import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/database.mjs'
import { createDecisionDynamicsService, STRUCTURAL_SCORING_POLICY } from '../server/decision-dynamics.mjs'

const directory = mkdtempSync(join(tmpdir(), 'lancee-decision-phase3-'))
let database

try {
  database = await openDatabase({
    databasePath: join(directory, 'decision-phase3.sqlite'),
    adminEmail: 'decision-phase3@example.test',
    adminName: 'Decision Phase 3 Test',
    adminPasswordSalt: 'decision-phase3-salt',
    adminPasswordHash: 'decision-phase3-hash',
    workspaceId: 'wsp_decision_phase3_a',
    workspaceName: 'Decision Phase 3 A',
  })
  const contextA = await database.getContextByEmail('decision-phase3@example.test')
  const createdAt = '2026-08-21T01:00:00.000Z'
  await database.query(
    `INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
    ['wsp_decision_phase3_b', 'Decision Phase 3 B', createdAt, createdAt],
  )
  await database.query(
    `INSERT INTO users (id, email, name, password_salt, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    ['usr_decision_phase3_b', 'decision-phase3-b@example.test', 'Decision Phase 3 B', 'salt', 'hash', createdAt, createdAt],
  )
  await database.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
     VALUES ($1, $2, 'owner', $3)`,
    ['wsp_decision_phase3_b', 'usr_decision_phase3_b', createdAt],
  )
  const contextB = await database.getContextByIds('usr_decision_phase3_b', 'wsp_decision_phase3_b')
  let clock = new Date(createdAt)
  const dynamics = createDecisionDynamicsService({ database, now: () => new Date(clock) })
  const commonVector = {
    actionType: 'reduce_price',
    targetType: 'retainer',
    sourceState: 'higher_price',
    destinationState: 'lower_price',
    intentType: 'increase_acceptance',
    expectedDirection: 'positive',
  }

  const historical = []
  const observedValues = [80, 85, 90, 82, 88]
  for (let index = 0; index < observedValues.length; index += 1) {
    const decision = await dynamics.createDecision(contextA, {
      title: `Historical retainer decision ${index + 1}`,
      decisionText: 'Reduce the retainer price to increase proposal acceptance.',
      intent: 'Increase proposal acceptance.',
      objectType: 'proposal',
      objectId: `historical_${index + 1}`,
      decidedAt: `2026-0${index + 1}-10T00:00:00.000Z`,
      vector: commonVector,
    })
    await dynamics.recordOutcome(contextA, decision.id, {
      metric: { metricKey: 'proposal_acceptance', baselineValue: 100, observedValue: observedValues[index] },
      outcomeClass: 'acceptance_declined',
      evidenceConfidence: 0.9,
      causalConfidence: 0.25,
    })
    historical.push(decision)
  }

  const current = await dynamics.createDecision(contextA, {
    title: 'Current retainer decision',
    decisionText: 'Reduce the current retainer price to increase acceptance.',
    intent: 'Increase proposal acceptance.',
    objectType: 'proposal',
    objectId: 'current_retainer',
    decidedAt: '2026-08-20T00:00:00.000Z',
    vector: commonVector,
    expectedReactions: [{
      metricKey: 'proposal_acceptance',
      direction: 'increase',
      confidence: 0.7,
    }],
  })

  const firstRefresh = await dynamics.refreshDecisionIntelligence(contextA)
  assert.equal(firstRefresh.patternCount, 1)
  assert.equal(firstRefresh.warningCount, 1)
  const patterns = await dynamics.listDecisionPatterns(contextA)
  assert.equal(patterns.length, 1)
  assert.equal(patterns[0].dominantDirection, 'negative')
  assert.equal(patterns[0].sampleSize, 5)
  assert(patterns[0].patternConfidence >= 0.65)
  const predictions = await dynamics.listDecisionPredictions(contextA, { decisionId: current.id })
  assert.equal(predictions.length, 1)
  assert.equal(predictions[0].predictedDirection, 'negative')
  assert(predictions[0].intervalLow <= predictions[0].predictedChangePercent)
  assert(predictions[0].intervalHigh >= predictions[0].predictedChangePercent)
  assert.equal(predictions[0].sourceDecisionIds.length, 5)
  const warnings = await dynamics.listDecisionWarnings(contextA)
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0].decisionId, current.id)
  assert.equal(warnings[0].evidence.causalClaim, false)
  assert.deepEqual(await dynamics.listDecisionPatterns(contextB), [])
  assert.deepEqual(await dynamics.listDecisionPredictions(contextB), [])
  assert.deepEqual(await dynamics.listDecisionWarnings(contextB), [])
  await assert.rejects(
    dynamics.reviewDecisionWarning(contextB, warnings[0].id, 'acknowledged'),
    (error) => error.code === 'DECISION_WARNING_NOT_FOUND',
  )

  await dynamics.refreshDecisionIntelligence(contextA)
  const notifications = await database.listWorkspaceNotifications(contextA.workspace.id)
  assert.equal(notifications.filter((notification) => notification.kind === 'decision.proactive_warning').length, 1)

  clock = new Date('2026-08-22T00:00:00.000Z')
  const currentOutcome = await dynamics.recordOutcome(contextA, current.id, {
    metric: { metricKey: 'proposal_acceptance', baselineValue: 100, observedValue: 90 },
    outcomeClass: 'acceptance_declined',
    evidenceConfidence: 0.9,
    causalConfidence: 0.8,
    causalAnalysis: {
      designType: 'controlled_before_after',
      controlBaselineValue: 100,
      controlObservedValue: 80,
    },
  })
  assert.equal(currentOutcome.causalAssessment.claimLevel, 'controlled_estimate')
  assert.equal(currentOutcome.causalAssessment.effectEstimate, 10)
  assert.match(currentOutcome.causalAssessment.assumptions.at(-1), /not proof/i)
  const measuredPrediction = (await dynamics.listDecisionPredictions(contextA, {
    decisionId: current.id,
    status: 'measured',
  }))[0]
  assert.equal(measuredPrediction.actualDirection, 'negative')
  assert(Number.isFinite(measuredPrediction.absoluteError))
  assert.equal((await dynamics.listDecisionWarnings(contextA, { status: 'resolved' }))[0].decisionId, current.id)

  const differentDecisions = []
  for (let index = 0; index < 3; index += 1) {
    differentDecisions.push(await dynamics.createDecision(contextA, {
      title: `Different action ${index + 1}`,
      decisionText: 'Use a different commercial intervention.',
      intent: 'Increase proposal acceptance.',
      objectType: 'proposal',
      objectId: `different_${index + 1}`,
      decidedAt: `2026-08-${10 + index}T00:00:00.000Z`,
      vector: { ...commonVector, actionType: `different_action_${index + 1}` },
    }))
  }
  const labelledDecisions = [...historical, ...differentDecisions]
  for (let index = 0; index < labelledDecisions.length; index += 1) {
    const comparable = index < historical.length
    const comparisonId = `dcmp_${String(index + 1).padStart(32, '0')}`
    const reviewId = `dcrv_${String(index + 1).padStart(32, '0')}`
    await database.query(
      `INSERT INTO decision_comparisons (
         id, workspace_id, decision_a_id, decision_b_id, structural_similarity,
         contextual_similarity, evidence_confidence, recency_relevance,
         comparison_confidence, comparable, shared_factors_json,
         material_differences_json, comparison_version, model_version,
         semantic_status, semantic_explanation, semantic_error_code,
         evidence_pack_version, semantic_assessment_version,
         confidence_model_version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, 0.8, 0.9, 0.8, 0.8, $6, '[]', '[]',
         'structural-similarity-v1', 'phase3-label', 'completed', 'Reviewed label',
         NULL, 'decision-evidence-pack-v1', 'semantic-reality-check-v1',
         'comparison-confidence-v1', $7, $8)`,
      [comparisonId, contextA.workspace.id, current.id, labelledDecisions[index].id, comparable ? 1 : 0.5, comparable ? 1 : 0, createdAt, createdAt],
    )
    await database.query(
      `INSERT INTO decision_comparison_reviews (
         id, workspace_id, comparison_id, reviewed_by, review_action,
         comparable, contextual_similarity, shared_factors_json,
         material_differences_json, explanation, comparison_confidence,
         confidence_model_version, review_version, created_at
       ) VALUES ($1, $2, $3, $4, 'corrected', $5, $6, '[]', '[]', $7, 0.8,
         'comparison-confidence-v1', 'decision-comparison-review-v1', $8)`,
      [reviewId, contextA.workspace.id, comparisonId, contextA.user.id, comparable ? 1 : 0, comparable ? 0.8 : 0.2, comparable ? 'Comparable.' : 'Not comparable.', createdAt],
    )
  }

  const calibrated = await dynamics.refreshDecisionIntelligence(contextA)
  assert(calibrated.model)
  assert.match(calibrated.model.modelVersion, /^structural-calibration-v1-/)
  assert(calibrated.model.parameters.weights.actionType > STRUCTURAL_SCORING_POLICY.weights.actionType)
  const comparisonAfterLearning = await dynamics.compareDecision(contextA, current.id)
  assert.equal(comparisonAfterLearning.structuralScoringVersion, calibrated.model.modelVersion)
  assert.equal((await dynamics.getDecisionLearningModel(contextA)).modelVersion, calibrated.model.modelVersion)
  assert.equal(await dynamics.getDecisionLearningModel(contextB), null)

  const autonomous = await dynamics.runAutonomousDecisionIntelligence()
  assert(autonomous.some((result) => result.workspaceId === contextA.workspace.id && !result.errorCode))
  assert.equal(await database.query(
    `SELECT COUNT(*) AS count FROM decision_patterns WHERE workspace_id = $1`,
    [contextB.workspace.id],
  ).then((rows) => Number(rows[0].count)), 0)

  console.log('Decision Intelligence Phase 3 verified: evidence-thresholded autonomous patterns, empirical predictions and errors, deduplicated proactive warnings, controlled causal estimates, bounded adaptive structural weights, model provenance, and workspace isolation.')
} finally {
  await database?.close()
  rmSync(directory, { recursive: true, force: true })
}
