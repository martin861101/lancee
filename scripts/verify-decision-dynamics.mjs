import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/database.mjs'
import {
  adjustCausalConfidence,
  adjustEvidenceConfidence,
  calculateComparisonConfidence,
  calculateDecisionMetric,
  calculateStructuralSimilarity,
  compareExpectedToActual,
  createDecisionDynamicsService,
} from '../server/decision-dynamics.mjs'
import { normalizeDecisionVector } from '../server/decision-taxonomy.mjs'
import { createSignalEngine } from '../server/signal-engine.mjs'
import { recordWorkspaceEvent } from '../server/workspace-events.mjs'

const directory = mkdtempSync(join(tmpdir(), 'lancee-decision-dynamics-'))
let database

try {
  database = await openDatabase({
    databasePath: join(directory, 'decision-dynamics.sqlite'),
    adminEmail: 'dynamics@example.test',
    adminName: 'Decision Dynamics Test',
    adminPasswordSalt: 'dynamics-salt',
    adminPasswordHash: 'dynamics-hash',
    workspaceId: 'wsp_dynamics_a',
    workspaceName: 'Dynamics Workspace A',
  })
  const contextA = await database.getContextByEmail('dynamics@example.test')
  const createdAt = new Date().toISOString()
  await database.query(
    `INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
    ['wsp_dynamics_b', 'Dynamics Workspace B', createdAt, createdAt],
  )
  await database.query(
    `INSERT INTO users (id, email, name, password_salt, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    ['usr_dynamics_b', 'dynamics-b@example.test', 'Dynamics B', 'salt', 'hash', createdAt, createdAt],
  )
  await database.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
     VALUES ($1, $2, 'owner', $3)`,
    ['wsp_dynamics_b', 'usr_dynamics_b', createdAt],
  )
  const contextB = await database.getContextByIds('usr_dynamics_b', 'wsp_dynamics_b')
  const dynamics = createDecisionDynamicsService({ database })

  const normalized = normalizeDecisionVector({
    object_type: 'Product',
    action_type: 'Reuse Component',
    target_type: 'Bumper',
    source_state: 'Previous Generation',
    destination_state: 'Current Generation',
    intent_type: 'Increase Sales',
    expected_direction: 'Positive',
  })
  assert.deepEqual(normalized, {
    objectType: 'product',
    actionType: 'reuse_component',
    targetType: 'bumper',
    sourceState: 'previous_generation',
    destinationState: 'current_generation',
    intentType: 'increase_sales',
    expectedDirection: 'positive',
    vectorVersion: 'decision-vector-v1',
  })
  assert.equal(calculateDecisionMetric({ baselineValue: 1420, observedValue: 1221 }).changeAbsolute, -199)
  assert.equal(calculateDecisionMetric({ baselineValue: 1420, observedValue: 1221 }).changePercent, -14.01)
  assert.equal(calculateDecisionMetric({ baselineValue: null, observedValue: 1221 }).measurementStatus, 'inconclusive')
  assert.equal(calculateDecisionMetric({ baselineValue: 1420, observedValue: null }).measurementStatus, 'pending')
  assert.equal(compareExpectedToActual('increase', calculateDecisionMetric({ baselineValue: 1420, observedValue: 1221 })), 'missed')
  assert.equal(adjustEvidenceConfidence(0.8, [{ relation: 'contradicts', weight: 1 }]), 0.6)
  assert.equal(adjustCausalConfidence(0.4, [{ significance: 0.8 }]), 0.32)
  assert.equal(calculateComparisonConfidence({
    structuralSimilarity: 0.9,
    contextualSimilarity: 0.8,
    evidenceConfidence: 0.7,
    recencyRelevance: 0.6,
  }), 0.79)

  const historicalEvent = await recordWorkspaceEvent({
    database,
    context: contextA,
    eventType: 'project.updated',
    entityType: 'product',
    entityId: 'vw_polo_vivo_2026',
    payload: { change: 'Previous-generation bumper selected.' },
    occurredAt: '2026-01-05T00:00:00.000Z',
  })
  const historical = await dynamics.createDecision(contextA, {
    title: 'Reuse previous-generation bumper on 2026 Polo Vivo',
    decisionText: 'Use the previous-generation bumper on the 2026 VW Polo Vivo.',
    rationale: 'Test whether styling can maintain or increase demand.',
    intent: 'Increase or preserve sales.',
    objectType: 'product',
    objectId: 'vw_polo_vivo_2026',
    decidedAt: '2026-01-05T00:00:00.000Z',
    vector: {
      objectType: 'product',
      actionType: 'reuse_component',
      targetType: 'bumper',
      sourceState: 'previous_generation',
      destinationState: 'current_generation',
      intentType: 'increase_or_preserve_sales',
      expectedDirection: 'positive',
    },
    expectedReactions: [{
      metricKey: 'avg_monthly_sales',
      direction: 'increase',
      confidence: 0.6,
    }],
    evidence: [{
      sourceType: 'event',
      sourceId: historicalEvent.id,
      relation: 'observed_action',
      summary: 'Workspace activity records the component selection.',
      weight: 1,
    }],
  })
  assert.equal(historical.workspaceId, contextA.workspace.id)
  assert.equal(historical.vector.actionType, 'reuse_component')

  const outcome = await dynamics.recordOutcome(contextA, historical.id, {
    metric: {
      metricKey: 'avg_monthly_sales',
      unit: 'vehicles_per_month',
      baselineValue: 1420,
      baselineWindowStart: '2025-09-01T00:00:00.000Z',
      baselineWindowEnd: '2025-12-31T23:59:59.000Z',
      observedValue: 1221,
      observationWindowStart: '2026-02-01T00:00:00.000Z',
      observationWindowEnd: '2026-05-31T23:59:59.000Z',
    },
    outcomeClass: 'sales_declined',
    observedReason: 'Average monthly sales declined after the component change.',
    evidenceConfidence: 0.91,
    causalConfidence: 0.4,
    confounders: [{
      factorType: 'seasonality',
      factorValue: 'Observation crossed a different seasonal sales period.',
      significance: 0.8,
      evidenceSourceId: historicalEvent.id,
    }],
  })
  assert.equal(outcome.metrics[0].changePercent, -14.01)
  assert.equal(outcome.outcome.outcomeDirection, 'negative')
  assert.equal(outcome.outcome.evidenceConfidence, 0.91)
  assert.equal(outcome.outcome.causalConfidence, 0.32)
  assert.equal(outcome.expectedVsActual[0].result, 'missed')
  assert.equal(outcome.confounders[0].factorType, 'seasonality')

  const lowEvidenceEvent = await recordWorkspaceEvent({
    database,
    context: contextA,
    eventType: 'project.updated',
    entityType: 'product',
    entityId: 'older_product',
    payload: { change: 'Bumper reuse test.' },
    occurredAt: '2025-12-01T00:00:00.000Z',
  })
  const lowEvidence = await dynamics.createDecision(contextA, {
    title: 'Older low-evidence bumper decision',
    decisionText: 'Reuse a prior bumper on the older product.',
    intent: 'Increase sales.',
    objectType: 'product',
    objectId: 'older_product',
    decidedAt: '2025-12-01T00:00:00.000Z',
    vector: {
      objectType: 'product',
      actionType: 'reuse_component',
      targetType: 'bumper',
      sourceState: '2024_generation',
      destinationState: 'current_generation',
      intentType: 'increase_sales',
      expectedDirection: 'positive',
    },
    evidence: [{ sourceType: 'event', sourceId: lowEvidenceEvent.id, relation: 'observed_action', summary: 'Recorded change.', weight: 0.2 }],
  })
  await dynamics.recordOutcome(contextA, lowEvidence.id, {
    metric: { metricKey: 'avg_monthly_sales', baselineValue: 100, observedValue: 101 },
    evidenceConfidence: 0.2,
    causalConfidence: 0.1,
  })

  const different = await dynamics.createDecision(contextA, {
    title: 'Hire a designer',
    decisionText: 'Hire a designer for the new campaign.',
    intent: 'Increase delivery capacity.',
    objectType: 'team',
    objectId: 'design_team',
    decidedAt: '2026-03-01T00:00:00.000Z',
    vector: {
      objectType: 'team',
      actionType: 'hire',
      targetType: 'designer',
      sourceState: 'understaffed',
      destinationState: 'staffed',
      intentType: 'increase_capacity',
      expectedDirection: 'positive',
    },
  })
  assert(different.id)

  const newDecision = await dynamics.createDecision(contextA, {
    title: 'Use 2024 bumper on Mini Van XT',
    decisionText: 'Use the 2024 bumper on Mini Van XT from September and see if sales improve.',
    rationale: 'Test whether component reuse can increase sales.',
    intent: 'Increase sales.',
    objectType: 'product',
    objectId: 'mini_van_xt',
    decidedAt: '2026-08-10T00:00:00.000Z',
    vector: {
      objectType: 'product',
      actionType: 'reuse_component',
      targetType: 'bumper',
      sourceState: '2024_generation',
      destinationState: 'current_generation',
      intentType: 'increase_sales',
      expectedDirection: 'positive',
    },
    expectedReactions: [{ metricKey: 'avg_monthly_sales', direction: 'increase', confidence: 0.6 }],
  })
  assert.equal(calculateStructuralSimilarity(newDecision.vector, historical.vector), 0.7)
  assert.equal(calculateStructuralSimilarity(newDecision.vector, different.vector), 0.1)

  const comparison = await dynamics.compareDecision(contextA, newDecision.id, { limit: 5 })
  const historicalCandidate = comparison.candidates.find((candidate) => candidate.decisionId === historical.id)
  const lowEvidenceCandidate = comparison.candidates.find((candidate) => candidate.decisionId === lowEvidence.id)
  assert(historicalCandidate)
  assert(lowEvidenceCandidate)
  assert(!comparison.candidates.some((candidate) => candidate.decisionId === different.id))
  assert.equal(historicalCandidate.outcome.metrics[0].changePercent, -14.01)
  assert.equal(historicalCandidate.causalConfidence, 0.32)
  assert.equal(historicalCandidate.comparable, null)
  assert.equal(historicalCandidate.modelVersion, null)
  assert.equal(historicalCandidate.semanticRealityCheck.contractVersion, 'semantic-reality-check-v1')
  assert.equal(historicalCandidate.semanticRealityCheck.evidencePackVersion, 'decision-evidence-pack-v1')
  assert.equal(historicalCandidate.semanticRealityCheck.historicalDecision.measuredOutcome.metrics.items[0].changePercent, -14.01)
  assert.equal(historicalCandidate.semanticRealityCheck.historicalDecision.knownConfounders.items[0].factorType, 'seasonality')
  assert(JSON.stringify(historicalCandidate.semanticRealityCheck).length <= 19_000)
  assert.equal(historicalCandidate.semanticAssessment.status, 'unavailable')
  assert.equal(historicalCandidate.semanticAssessment.errorCode, 'HERMES_SEMANTIC_UNAVAILABLE')
  assert.equal(comparison.semanticStage, 'unavailable')
  assert(historicalCandidate.sharedFactors.some((factor) => factor.field === 'actionType'))
  assert(historicalCandidate.materialDifferences.some((factor) => factor.field === 'sourceState'))
  assert(historicalCandidate.provenance.evidenceIds.length > 0)
  assert(historicalCandidate.comparisonConfidence > lowEvidenceCandidate.comparisonConfidence)
  assert(!JSON.stringify(historicalCandidate).toLowerCase().includes('bumper caused'))

  const assessedPacks = []
  const semanticDynamics = createDecisionDynamicsService({
    database,
    semanticAssessor: {
      async assess(evidencePack) {
        assessedPacks.push(evidencePack)
        return {
          comparable: true,
          contextualSimilarity: 0.87,
          sharedFactors: [
            'previous-generation component reused',
            'sales performance was the intended outcome',
          ],
          materialDifferences: ['different vehicle segment', 'different market period'],
          explanation: 'The decisions share the intervention and intended metric, with material segment and timing differences.',
          modelVersion: 'hermes-test-model',
          assessmentVersion: 'hermes-decision-assessment-v1',
        }
      },
    },
  })
  const assessedComparison = await semanticDynamics.compareDecision(contextA, newDecision.id, { limit: 5 })
  const assessedHistorical = assessedComparison.candidates.find((candidate) => candidate.decisionId === historical.id)
  assert(assessedHistorical)
  assert.equal(assessedComparison.semanticStage, 'completed')
  assert.equal(assessedHistorical.comparable, true)
  assert.equal(assessedHistorical.contextualSimilarity, 0.87)
  assert.equal(assessedHistorical.semanticAssessment.status, 'completed')
  assert.equal(assessedHistorical.semanticAssessment.explanation.includes('material segment'), true)
  assert.equal(assessedHistorical.modelVersion, 'hermes-test-model')
  assert.equal(assessedHistorical.confidenceModelVersion, 'comparison-confidence-v1')
  assert.equal(assessedHistorical.evidencePackVersion, 'decision-evidence-pack-v1')
  assert.deepEqual(assessedHistorical.sharedFactors, [
    'previous-generation component reused',
    'sales performance was the intended outcome',
  ])
  assert.equal(assessedHistorical.comparisonConfidence, calculateComparisonConfidence({
    structuralSimilarity: assessedHistorical.structuralSimilarity,
    contextualSimilarity: 0.87,
    evidenceConfidence: assessedHistorical.evidenceConfidence,
    recencyRelevance: assessedHistorical.recencyRelevance,
  }))
  assert(assessedPacks.some((pack) => (
    pack.newDecision.decision.id === newDecision.id &&
    pack.historicalDecision.decision.id === historical.id
  )))
  const persistedCompleted = await database.query(
    `SELECT * FROM decision_comparisons
     WHERE workspace_id = $1 AND decision_a_id = $2 AND decision_b_id = $3`,
    [contextA.workspace.id, newDecision.id, historical.id],
  )
  assert.equal(persistedCompleted[0].semantic_status, 'completed')
  assert.equal(persistedCompleted[0].confidence_model_version, 'comparison-confidence-v1')
  assert.equal(persistedCompleted[0].semantic_assessment_version, 'hermes-decision-assessment-v1')
  assert.equal((await dynamics.getDecisionOutcome(contextA, historical.id)).metrics[0].changePercent, -14.01)

  const timeoutDynamics = createDecisionDynamicsService({
    database,
    semanticAssessor: {
      async assess() {
        const error = new Error('Hermes timed out.')
        error.code = 'AI_TIMEOUT'
        throw error
      },
    },
  })
  const timeoutComparison = await timeoutDynamics.compareDecision(contextA, newDecision.id, { limit: 5 })
  const timeoutHistorical = timeoutComparison.candidates.find((candidate) => candidate.decisionId === historical.id)
  assert(timeoutHistorical)
  assert.equal(timeoutComparison.semanticStage, 'unavailable')
  assert.equal(timeoutHistorical.structuralSimilarity, historicalCandidate.structuralSimilarity)
  assert.equal(timeoutHistorical.contextualSimilarity, null)
  assert.equal(timeoutHistorical.comparable, null)
  assert.equal(timeoutHistorical.semanticAssessment.status, 'unavailable')
  assert.equal(timeoutHistorical.semanticAssessment.errorCode, 'AI_TIMEOUT')
  const persistedUnavailable = await database.query(
    `SELECT * FROM decision_comparisons
     WHERE workspace_id = $1 AND decision_a_id = $2 AND decision_b_id = $3`,
    [contextA.workspace.id, newDecision.id, historical.id],
  )
  assert.equal(persistedUnavailable[0].semantic_status, 'unavailable')
  assert.equal(persistedUnavailable[0].structural_similarity, historicalCandidate.structuralSimilarity)
  assert.equal(persistedUnavailable[0].contextual_similarity, null)

  const foreignEvent = await recordWorkspaceEvent({
    database,
    context: contextB,
    eventType: 'project.updated',
    entityType: 'product',
    entityId: 'foreign_product',
    payload: { change: 'Foreign event.' },
  })
  await assert.rejects(
    dynamics.addDecisionEvidence(contextA, newDecision.id, {
      sourceType: 'event',
      sourceId: foreignEvent.id,
      relation: 'context',
      summary: 'Must not cross workspaces.',
      weight: 1,
    }),
    (error) => error.code === 'EVIDENCE_SOURCE_NOT_FOUND',
  )
  assert.equal(await dynamics.getDecision(contextB, newDecision.id), null)
  assert(!(await dynamics.listDecisions(contextB)).some((decision) => decision.id === newDecision.id))

  const signalEvent = await recordWorkspaceEvent({
    database,
    context: contextA,
    eventType: 'quote.updated',
    entityType: 'quote',
    entityId: 'quote_signal_dynamics',
    payload: {
      previousAmount: 50_000,
      currentAmount: 42_000,
      reason: 'Client price objection.',
      intentType: 'increase deal conversion',
    },
  })
  const signalEngine = createSignalEngine({ database, decisionDynamics: dynamics })
  const promoted = await signalEngine.processWorkspaceEvent(signalEvent.id, contextA)
  assert.equal(promoted.action, 'auto_promote')
  assert.equal(promoted.decision.sourceCandidateId, promoted.candidate.id)
  assert.equal(promoted.decision.vector.actionType, 'reduce_price')
  assert((await dynamics.getDecisionEvidence(contextA, promoted.decision.id)).some((evidence) => evidence.sourceId === signalEvent.id))

  console.log('Decision Dynamics verified: Signal-to-Decision promotion, normalized vectors, deterministic outcomes, evidence/confounders, bounded comparison ranking, causal separation, provenance, and workspace isolation.')
} finally {
  await database?.close()
  rmSync(directory, { recursive: true, force: true })
}
