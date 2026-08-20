import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/database.mjs'
import {
  createSignalEngine,
  decisionCandidateAction,
  hasDecisionLanguage,
} from '../server/signal-engine.mjs'
import {
  getWorkspaceEvent,
  listWorkspaceEvents,
  recordWorkspaceEvent,
  WorkspaceEventError,
} from '../server/workspace-events.mjs'

const directory = mkdtempSync(join(tmpdir(), 'lancee-signal-engine-'))
let database

try {
  database = await openDatabase({
    databasePath: join(directory, 'signal-engine.sqlite'),
    adminEmail: 'signals@example.test',
    adminName: 'Signal Engine Test',
    adminPasswordSalt: 'signal-salt',
    adminPasswordHash: 'signal-hash',
    workspaceId: 'wsp_signals_a',
    workspaceName: 'Signal Workspace A',
  })
  const contextA = await database.getContextByEmail('signals@example.test')
  const createdAt = new Date().toISOString()
  await database.query(
    `INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
    ['wsp_signals_b', 'Signal Workspace B', createdAt, createdAt],
  )
  await database.query(
    `INSERT INTO users (id, email, name, password_salt, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    ['usr_signals_b', 'signals-b@example.test', 'Signal B', 'salt', 'hash', createdAt, createdAt],
  )
  await database.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
     VALUES ($1, $2, 'owner', $3)`,
    ['wsp_signals_b', 'usr_signals_b', createdAt],
  )
  const contextB = await database.getContextByIds('usr_signals_b', 'wsp_signals_b')

  assert.equal(hasDecisionLanguage('Agreed. Let’s use the revised bumper.'), true)
  assert.equal(hasDecisionLanguage('The weekly status report is attached.'), false)
  assert.equal(decisionCandidateAction({ detectionConfidence: 0.9 }), 'auto_promote')
  assert.equal(decisionCandidateAction({ detectionConfidence: 0.78 }), 'request_review')
  assert.equal(decisionCandidateAction({ detectionConfidence: 0.4 }), 'activity_only')

  const structuredEvent = await recordWorkspaceEvent({
    database,
    context: contextA,
    eventType: 'quote.updated',
    entityType: 'quote',
    entityId: 'quote_231',
    payload: {
      previousAmount: 50_000,
      currentAmount: 42_000,
      reason: 'Client price objection.',
      intentType: 'increase deal conversion',
    },
    importance: 90,
  })
  assert.equal(structuredEvent.workspaceId, contextA.workspace.id)
  assert.equal((await listWorkspaceEvents(database, contextA)).length, 1)
  assert.equal(await getWorkspaceEvent(database, contextB, structuredEvent.id), null)

  const promotedDecisions = []
  let semanticCalls = 0
  const semanticClassifier = async () => {
    semanticCalls += 1
    return {
      classification: 'decision_candidate',
      confidence: 0.78,
      decision: {
        object_type: 'product',
        object_reference: 'Mini Van XT',
        action_type: 'reuse_component',
        target_type: 'bumper',
        source_state: '2024_generation',
        destination_state: 'current_product',
        intent_type: 'increase_sales',
        expected_metric: 'monthly_sales',
        expected_direction: 'increase',
      },
      evidence: {
        supporting_text: 'Agreed. Let us use the 2024 bumper and see if sales improve.',
        reason: 'Explicit agreement and measurable intent.',
      },
    }
  }
  const signalEngine = createSignalEngine({
    database,
    semanticClassifier,
    decisionDynamics: {
      async createDecision(_context, input) {
        const decision = { id: `dec_test_${promotedDecisions.length + 1}`, ...input }
        promotedDecisions.push(decision)
        return decision
      },
    },
  })

  const structuredResult = await signalEngine.processWorkspaceEvent(structuredEvent.id, contextA)
  assert.equal(structuredResult.action, 'auto_promote')
  assert.equal(structuredResult.candidate.status, 'auto_promoted')
  assert.equal(structuredResult.candidate.actionType, 'reduce_price')
  assert.equal(promotedDecisions[0].evidence[0].sourceId, structuredEvent.id)
  assert.equal(promotedDecisions[0].vector.actionType, 'reduce_price')

  await assert.rejects(
    recordWorkspaceEvent({
      database,
      context: contextA,
      eventType: 'communication.received',
      entityType: 'message',
      entityId: 'msg_untrusted',
      connectionId: 'con_missing',
      sourceChannel: 'email',
      sourceIdentifier: 'msg_untrusted',
      payload: { text: 'We agreed to change the quote.' },
    }),
    (error) => error instanceof WorkspaceEventError && error.code === 'COMMUNICATION_CONNECTION_NOT_AUTHORIZED',
  )
  await database.query(
    `INSERT INTO integration_connections (
       id, workspace_id, user_id, provider, external_connection_name,
       display_name, status, scopes_json, last_error, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 'connected', '[]', '', $7, $8)`,
    ['con_mail_a', contextA.workspace.id, contextA.user.id, 'gmail', 'signal-test', 'Signal Test', createdAt, createdAt],
  )
  const semanticEvent = await recordWorkspaceEvent({
    database,
    context: contextA,
    eventType: 'communication.received',
    entityType: 'message',
    entityId: 'msg_981',
    connectionId: 'con_mail_a',
    sourceChannel: 'email',
    sourceIdentifier: 'msg_981',
    participantRefs: [{ type: 'email', value: 'client@example.test' }],
    payload: { text: 'Agreed. Let us use the 2024 bumper and see if sales improve.' },
    importance: 85,
  })
  const semanticResult = await signalEngine.processWorkspaceEvent(semanticEvent, contextA)
  assert.equal(semanticResult.action, 'request_review')
  assert.equal(semanticResult.candidate.status, 'pending')
  assert.equal(semanticResult.candidate.sourceId, 'msg_981')
  assert.equal(semanticCalls, 1)

  const rejected = await signalEngine.reviewDecisionCandidate(
    contextA,
    semanticResult.candidate.id,
    'reject',
  )
  assert.equal(rejected.candidate.status, 'rejected')
  assert.equal(rejected.candidate.machineClassification, 'decision_candidate')
  assert.equal(rejected.candidate.humanClassification, 'not_a_decision')
  assert.equal(await signalEngine.getDecisionCandidate(contextB, rejected.candidate.id), null)

  const routineEvent = await recordWorkspaceEvent({
    database,
    context: contextA,
    eventType: 'project.updated',
    entityType: 'project',
    entityId: 'external_project_reference',
    payload: { text: 'Weekly project status refreshed.' },
  })
  const routineResult = await signalEngine.processWorkspaceEvent(routineEvent.id, contextA)
  assert.equal(routineResult.classification, 'activity_only')
  assert.equal(semanticCalls, 1)

  const lowEngine = createSignalEngine({
    database,
    semanticClassifier: async () => ({
      classification: 'decision_candidate',
      confidence: 0.4,
      decision: {},
    }),
  })
  const lowEvent = await recordWorkspaceEvent({
    database,
    context: contextA,
    eventType: 'ai.responded',
    entityType: 'conversation',
    entityId: 'ai_signal_test',
    payload: { text: 'Maybe we agreed to change something.' },
  })
  const lowResult = await lowEngine.processWorkspaceEvent(lowEvent.id, contextA)
  assert.equal(lowResult.classification, 'activity_only')
  assert.equal((await signalEngine.listDecisionCandidates(contextA)).length, 2)

  await assert.rejects(
    signalEngine.processWorkspaceEvent(structuredEvent.id, contextB),
    (error) => error.code === 'WORKSPACE_EVENT_NOT_FOUND',
  )

  console.log('Signal Engine verified: authoritative event ledger, connection boundary, deterministic and semantic filtering, confidence gate, promotion/review history, provenance, and workspace isolation.')
} finally {
  await database?.close()
  rmSync(directory, { recursive: true, force: true })
}
