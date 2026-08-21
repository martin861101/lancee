import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/database.mjs'
import {
  calculateComparisonConfidence,
  createDecisionDynamicsService,
} from '../server/decision-dynamics.mjs'

const directory = mkdtempSync(join(tmpdir(), 'lancee-decision-phase2-'))
let database

try {
  database = await openDatabase({
    databasePath: join(directory, 'decision-phase2.sqlite'),
    adminEmail: 'decision-phase2@example.test',
    adminName: 'Decision Phase 2 Test',
    adminPasswordSalt: 'decision-phase2-salt',
    adminPasswordHash: 'decision-phase2-hash',
    workspaceId: 'wsp_decision_phase2_a',
    workspaceName: 'Decision Phase 2 A',
  })
  const contextA = await database.getContextByEmail('decision-phase2@example.test')
  const createdAt = '2026-08-21T00:00:00.000Z'
  await database.query(
    `INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
    ['wsp_decision_phase2_b', 'Decision Phase 2 B', createdAt, createdAt],
  )
  await database.query(
    `INSERT INTO users (id, email, name, password_salt, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    ['usr_decision_phase2_b', 'decision-phase2-b@example.test', 'Decision Phase 2 B', 'salt', 'hash', createdAt, createdAt],
  )
  await database.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
     VALUES ($1, $2, 'owner', $3)`,
    ['wsp_decision_phase2_b', 'usr_decision_phase2_b', createdAt],
  )
  const contextB = await database.getContextByIds('usr_decision_phase2_b', 'wsp_decision_phase2_b')

  let clock = new Date(createdAt)
  const dynamics = createDecisionDynamicsService({
    database,
    now: () => new Date(clock),
    semanticAssessor: {
      async assess() {
        return {
          comparable: true,
          contextualSimilarity: 0.85,
          sharedFactors: ['same pricing intervention'],
          materialDifferences: ['different client segment'],
          explanation: 'The pricing intervention is similar, with a material segment difference.',
          modelVersion: 'hermes-phase2-test',
          assessmentVersion: 'hermes-decision-assessment-v1',
        }
      },
    },
  })

  const historical = await dynamics.createDecision(contextA, {
    title: 'Reduce a prior retainer price',
    decisionText: 'Reduce the monthly retainer to improve acceptance.',
    intent: 'Increase proposal acceptance.',
    objectType: 'proposal',
    objectId: 'proposal_historical',
    decidedAt: '2026-01-10T00:00:00.000Z',
    vector: {
      actionType: 'reduce_price',
      targetType: 'retainer',
      sourceState: 'higher_price',
      destinationState: 'lower_price',
      intentType: 'increase_acceptance',
      expectedDirection: 'positive',
    },
  })
  await dynamics.recordOutcome(contextA, historical.id, {
    metric: { metricKey: 'proposal_acceptance', baselineValue: 0.4, observedValue: 0.55 },
    outcomeClass: 'acceptance_increased',
    evidenceConfidence: 0.8,
    causalConfidence: 0.3,
  })

  const current = await dynamics.createDecision(contextA, {
    title: 'Adjust the current retainer offer',
    decisionText: 'Reduce the current retainer price while preserving the service mix.',
    intent: 'Increase proposal acceptance.',
    objectType: 'proposal',
    objectId: 'proposal_current',
    decidedAt: '2026-08-20T00:00:00.000Z',
    vector: {
      actionType: 'reduce_price',
      targetType: 'retainer',
      sourceState: 'higher_price',
      destinationState: 'lower_price',
      intentType: 'increase_acceptance',
      expectedDirection: 'positive',
    },
    expectedReactions: [{
      metricKey: 'proposal_acceptance',
      direction: 'increase',
      confidence: 0.65,
      reviewDueAt: '2026-08-22T00:00:00.000Z',
    }],
  })
  assert.equal(current.observationReviews.length, 1)
  assert.equal(current.observationReviews[0].status, 'scheduled')
  assert.equal((await dynamics.listDecisionReviews(contextA)).length, 1)
  assert.deepEqual(await dynamics.listDecisionReviews(contextB), [])
  assert.deepEqual(await dynamics.dispatchDueObservationReviews(), [])

  clock = new Date('2026-08-23T00:00:00.000Z')
  const dispatched = await dynamics.dispatchDueObservationReviews()
  assert.equal(dispatched.length, 1)
  assert.equal(dispatched[0].status, 'due')
  assert.deepEqual(await dynamics.dispatchDueObservationReviews(), [])
  const notifications = await database.listWorkspaceNotifications(contextA.workspace.id)
  assert.equal(notifications.filter((notification) => notification.kind === 'decision.outcome_review_due').length, 1)
  assert.equal((await dynamics.listDecisionReviews(contextA, { status: 'due' }))[0].decisionId, current.id)

  await assert.rejects(
    dynamics.scheduleDecisionReview(contextB, current.id, {
      metricKey: 'proposal_acceptance',
      dueAt: '2026-08-24T00:00:00.000Z',
    }),
    (error) => error.code === 'DECISION_NOT_FOUND',
  )

  const comparison = await dynamics.compareDecision(contextA, current.id)
  const candidate = comparison.candidates.find((item) => item.decisionId === historical.id)
  assert(candidate)
  assert.equal(candidate.assessmentSource, 'hermes')
  assert.equal(candidate.machineAssessment.comparable, true)
  const corrected = await dynamics.reviewDecisionComparison(contextA, candidate.id, {
    action: 'corrected',
    comparable: false,
    contextualSimilarity: 0.2,
    sharedFactors: ['Both changed a retainer price.'],
    materialDifferences: ['The current client has a fixed procurement ceiling.'],
    explanation: 'The procurement constraint makes the historical decision a weak practical comparison.',
  })
  assert.equal(corrected.assessmentSource, 'human_review')
  assert.equal(corrected.comparable, false)
  assert.equal(corrected.contextualSimilarity, 0.2)
  assert.equal(corrected.machineAssessment.comparable, true)
  assert.equal(corrected.humanReview.action, 'corrected')
  assert.equal(corrected.comparisonConfidence, calculateComparisonConfidence({
    structuralSimilarity: corrected.structuralSimilarity,
    contextualSimilarity: 0.2,
    evidenceConfidence: corrected.evidenceConfidence,
    recencyRelevance: corrected.recencyRelevance,
  }))
  const machineRows = await database.query(
    `SELECT comparable, contextual_similarity FROM decision_comparisons
     WHERE workspace_id = $1 AND id = $2`,
    [contextA.workspace.id, candidate.id],
  )
  assert.equal(Boolean(machineRows[0].comparable), true)
  assert.equal(Number(machineRows[0].contextual_similarity), 0.85)
  assert.equal(await dynamics.getDecisionComparison(contextB, candidate.id), null)
  await assert.rejects(
    dynamics.reviewDecisionComparison(contextB, candidate.id, { action: 'rejected', explanation: 'Foreign.' }),
    (error) => error.code === 'DECISION_COMPARISON_NOT_FOUND',
  )

  const comparedAgain = await dynamics.compareDecision(contextA, current.id)
  const correctedAgain = comparedAgain.candidates.find((item) => item.id === candidate.id)
  assert.equal(correctedAgain.assessmentSource, 'human_review')
  assert.equal(correctedAgain.comparable, false)
  assert.equal(correctedAgain.machineAssessment.comparable, true)

  const outcome = await dynamics.recordOutcome(contextA, current.id, {
    metric: { metricKey: 'proposal_acceptance', baselineValue: 0.4, observedValue: 0.5 },
    outcomeClass: 'acceptance_increased',
    evidenceConfidence: 0.75,
    causalConfidence: 0.2,
  })
  assert.equal(outcome.metrics[0].changePercent, 25)
  assert.equal((await dynamics.listDecisionReviews(contextA, { status: 'completed' }))[0].decisionId, current.id)
  assert.equal((await dynamics.getDecision(contextA, current.id)).status, 'reviewed')

  console.log('Decision Intelligence Phase 2 verified: scheduled outcome reviews, one-time notifications, human semantic correction, machine provenance retention, effective confidence recalculation, and workspace isolation.')
} finally {
  await database?.close()
  rmSync(directory, { recursive: true, force: true })
}
