import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/database.mjs'
import { createDecisionDynamicsService } from '../server/decision-dynamics.mjs'

const directory = mkdtempSync(join(tmpdir(), 'lancee-decision-ui-'))
let database

try {
  database = await openDatabase({
    databasePath: join(directory, 'decision-ui.sqlite'),
    adminEmail: 'decision-ui@example.test',
    adminName: 'Decision UI Test',
    adminPasswordSalt: 'decision-ui-salt',
    adminPasswordHash: 'decision-ui-hash',
    workspaceId: 'wsp_decision_ui_a',
    workspaceName: 'Decision UI A',
  })
  const contextA = await database.getContextByEmail('decision-ui@example.test')
  const createdAt = '2026-08-21T08:00:00.000Z'
  await database.query(
    `INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
    ['wsp_decision_ui_b', 'Decision UI B', createdAt, createdAt],
  )
  await database.query(
    `INSERT INTO users (id, email, name, password_salt, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    ['usr_decision_ui_b', 'decision-ui-b@example.test', 'Decision UI B', 'salt', 'hash', createdAt, createdAt],
  )
  await database.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
     VALUES ($1, $2, 'owner', $3)`,
    ['wsp_decision_ui_b', 'usr_decision_ui_b', createdAt],
  )
  const contextB = await database.getContextByIds('usr_decision_ui_b', 'wsp_decision_ui_b')
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

  const emptyOverview = await dynamics.getDecisionIntelligenceOverview(contextA)
  assert.equal(emptyOverview.metrics.decisionsObserved, 0)
  assert.equal(emptyOverview.metrics.measuredOutcomes, 0)
  assert.equal(emptyOverview.metrics.patternsByStatus.active, 0)
  assert.equal(emptyOverview.metrics.predictionsByStatus.active, 0)
  assert.equal(emptyOverview.metrics.warningsByStatus.active, 0)
  assert.deepEqual(emptyOverview.categories, [])
  assert.deepEqual(emptyOverview.timeline, [])
  assert.equal(emptyOverview.thresholds.minimumPatternSamples, 3)

  const createDecision = async (index, { expected = false, context = contextA } = {}) => dynamics.createDecision(context, {
    title: `${context.workspace.name} retainer decision ${index}`,
    decisionText: 'Reduce the retainer price to increase proposal acceptance.',
    rationale: 'Test whether a lower retainer improves acceptance.',
    intent: 'Increase proposal acceptance.',
    objectType: 'proposal',
    objectId: `retainer_${context.workspace.id}_${index}`,
    decidedAt: `2026-08-${String(Math.min(index, 28)).padStart(2, '0')}T08:00:00.000Z`,
    vector: commonVector,
    expectedReactions: expected ? [{
      metricKey: 'proposal_acceptance',
      direction: 'increase',
      confidence: 0.75,
    }] : [],
  })
  const recordNegativeOutcome = (decision, observedValue = 85) => dynamics.recordOutcome(contextA, decision.id, {
    metric: { metricKey: 'proposal_acceptance', baselineValue: 100, observedValue },
    outcomeClass: 'acceptance_declined',
    observedReason: 'Acceptance was lower after the recorded decision.',
    evidenceConfidence: 0.9,
    causalConfidence: 0.25,
  })

  const first = await createDecision(1, { expected: true })
  const ledgerOnlyOverview = await dynamics.getDecisionIntelligenceOverview(contextA)
  assert.equal(ledgerOnlyOverview.metrics.decisionsObserved, 1)
  assert.equal(ledgerOnlyOverview.metrics.measuredOutcomes, 0)
  assert.equal(ledgerOnlyOverview.metrics.outcomesAwaitingMeasurement, 1)
  assert.equal(ledgerOnlyOverview.metrics.patternsByStatus.active, 0)
  assert.equal(ledgerOnlyOverview.metrics.predictionsByStatus.active, 0)
  assert.equal(ledgerOnlyOverview.metrics.warningsByStatus.active, 0)

  await dynamics.addDecisionEvidence(contextA, first.id, {
    sourceType: 'metric',
    sourceId: `${first.id}:proposal_acceptance`,
    relation: 'supports',
    summary: 'Proposal acceptance was selected as the measured business outcome.',
    weight: 0.85,
  })
  await recordNegativeOutcome(first, 82)
  const oneMeasuredOverview = await dynamics.getDecisionIntelligenceOverview(contextA)
  assert.equal(oneMeasuredOverview.metrics.measuredOutcomes, 1)
  assert.equal(oneMeasuredOverview.metrics.patternsByStatus.active, 0)
  assert.equal(oneMeasuredOverview.metrics.evidenceRecords, 1)

  const second = await createDecision(2)
  await recordNegativeOutcome(second, 86)
  let insufficientOverview = await dynamics.getDecisionIntelligenceOverview(contextA)
  assert.equal(insufficientOverview.metrics.measuredOutcomes, 2)
  assert.equal(insufficientOverview.metrics.patternsByStatus.active, 0)

  const third = await createDecision(3)
  await recordNegativeOutcome(third, 88)
  await dynamics.refreshDecisionIntelligence(contextA)
  let learnedOverview = await dynamics.getDecisionIntelligenceOverview(contextA)
  assert.equal(learnedOverview.metrics.measuredOutcomes, 3)
  assert.equal(learnedOverview.metrics.patternsByStatus.active, 1)
  assert.equal(learnedOverview.metrics.predictionsByStatus.active, 0)
  assert(learnedOverview.timeline.some((event) => event.eventType === 'decision.pattern_detected'))

  const fourth = await createDecision(4)
  await recordNegativeOutcome(fourth, 84)
  const fifth = await createDecision(5)
  await recordNegativeOutcome(fifth, 80)
  const current = await createDecision(20, { expected: true })
  await dynamics.refreshDecisionIntelligence(contextA)
  let warningOverview = await dynamics.getDecisionIntelligenceOverview(contextA)
  assert.equal(warningOverview.metrics.predictionsByStatus.active, 1)
  assert.equal(warningOverview.metrics.warningsByStatus.active, 1)
  assert.equal(warningOverview.categories[0].objectType, 'proposal')
  assert.equal(warningOverview.categories[0].decisions, 6)
  assert.equal(warningOverview.categories[0].patterns, 1)
  assert.equal(warningOverview.categories[0].predictions, 1)
  assert.equal(warningOverview.categories[0].warnings, 1)

  const activeWarning = (await dynamics.listDecisionWarnings(contextA))[0]
  assert.equal(activeWarning.evidence.causalClaim, false)
  await dynamics.reviewDecisionWarning(contextA, activeWarning.id, 'acknowledged')
  warningOverview = await dynamics.getDecisionIntelligenceOverview(contextA)
  assert.equal(warningOverview.metrics.warningsByStatus.active, 0)
  assert.equal(warningOverview.metrics.warningsByStatus.acknowledged, 1)

  const dismissedDecision = await createDecision(21, { expected: true })
  await dynamics.refreshDecisionIntelligence(contextA)
  const dismissibleWarning = (await dynamics.listDecisionWarnings(contextA)).find((warning) => warning.decisionId === dismissedDecision.id)
  assert(dismissibleWarning)
  await dynamics.reviewDecisionWarning(contextA, dismissibleWarning.id, 'dismissed')
  warningOverview = await dynamics.getDecisionIntelligenceOverview(contextA)
  assert.equal(warningOverview.metrics.warningsByStatus.dismissed, 1)

  clock = new Date('2026-08-22T08:00:00.000Z')
  const resolvedDecision = await createDecision(22, { expected: true })
  await dynamics.refreshDecisionIntelligence(contextA)
  assert((await dynamics.listDecisionWarnings(contextA)).some((warning) => warning.decisionId === resolvedDecision.id))
  await recordNegativeOutcome(resolvedDecision, 83)
  warningOverview = await dynamics.getDecisionIntelligenceOverview(contextA)
  assert.equal(warningOverview.metrics.warningsByStatus.resolved, 1)
  assert.equal(warningOverview.metrics.predictionsByStatus.measured, 1)

  const unavailableSemantic = await dynamics.compareDecision(contextA, current.id, { limit: 1 })
  assert.equal(unavailableSemantic.semanticStage, 'unavailable')
  assert.equal((await dynamics.getDecisionIntelligenceOverview(contextA)).metrics.decisionsObserved, 8)

  const workspaceBDecision = await createDecision(6, { context: contextB })
  const workspaceBOverview = await dynamics.getDecisionIntelligenceOverview(contextB)
  assert.equal(workspaceBOverview.metrics.decisionsObserved, 1)
  assert.equal(workspaceBOverview.metrics.measuredOutcomes, 0)
  assert.equal(workspaceBOverview.metrics.patternsByStatus.active, 0)
  assert.equal(workspaceBOverview.metrics.predictionsByStatus.active, 0)
  assert.equal(workspaceBOverview.metrics.warningsByStatus.active, 0)
  assert.equal(await dynamics.getDecision(contextB, first.id), null)
  assert.equal((await dynamics.getDecisionIntelligenceOverview(contextA)).metrics.decisionsObserved, 8)
  assert.equal((await dynamics.getDecision(contextB, workspaceBDecision.id)).id, workspaceBDecision.id)

  const pageSource = readFileSync(new URL('../src/components/intelligence/ConnectedIntelligencePage.tsx', import.meta.url), 'utf8')
  const chatSource = readFileSync(new URL('../src/components/dashboard/WorkspaceChat.tsx', import.meta.url), 'utf8')
  for (const requiredState of [
    'Your work knows more than you think.',
    'What Lancee Found',
    'project_meeting_load',
    'client_attention_load',
    'Deterministic evidence chain',
    'Connection Map',
    'Why is this client taking so much attention?',
    'Decision Intelligence history',
    'No structured decisions recorded',
    'No reliable pattern yet',
    'No active predictions',
    "['active', 'acknowledged', 'dismissed', 'resolved', 'all']",
    'causal claim: false',
    'Refresh failed:',
    'An empty warning collection does not mean the decision ledger is empty',
    'DASHBOARD_ASSISTANT_QUERY_EVENT',
  ]) assert(pageSource.includes(requiredState), `Missing Decision Intelligence UI state: ${requiredState}`)
  assert(chatSource.includes("export const DASHBOARD_ASSISTANT_QUERY_EVENT"))

  console.log('Intelligence UI verified: Connected Intelligence headline, persisted detector cards, deterministic evidence chain, connection map, Hermes prompts, secondary Decision Intelligence history, measured-outcome thresholds, patterns, predictions, warnings, evidence provenance, workspace isolation, and bounded empty/error states.')
} finally {
  await database?.close()
  rmSync(directory, { recursive: true, force: true })
}
