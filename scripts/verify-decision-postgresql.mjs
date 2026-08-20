import assert from 'node:assert/strict'
import { openDatabase } from '../server/database.mjs'
import { createDecisionDynamicsService } from '../server/decision-dynamics.mjs'
import { recordWorkspaceEvent } from '../server/workspace-events.mjs'

const verificationDatabase = String(process.env.DECISION_PG_VERIFY_DATABASE || '')
const configuredDatabase = String(process.env.PGDATABASE || '')
if (
  !/^lancee_decision_verify_[a-z0-9_]+$/.test(verificationDatabase) ||
  configuredDatabase !== verificationDatabase ||
  process.env.DATABASE_URL
) {
  throw new Error(
    'Decision PostgreSQL verification requires a guarded lancee_decision_verify_* PGDATABASE and no DATABASE_URL.',
  )
}

const workspaceA = 'wsp_decision_pg_verify_a'
const workspaceB = 'wsp_decision_pg_verify_b'
const expectedTables = [
  'hermes_user_preferences',
  'workspace_events',
  'decision_candidates',
  'decisions',
  'decision_vectors',
  'decision_expected_reactions',
  'decision_metrics',
  'decision_outcomes',
  'decision_evidence',
  'decision_confounders',
  'decision_comparisons',
]
const expectedIndexes = [
  'idx_hermes_preferences_user_category',
  'idx_workspace_events_workspace_occurred',
  'idx_workspace_events_entity',
  'idx_workspace_events_unprocessed',
  'idx_decision_candidates_workspace_status',
  'idx_decisions_workspace_decided',
  'idx_decision_vectors_structural',
  'idx_decision_evidence_decision',
  'idx_decision_confounders_decision',
  'idx_decision_comparisons_decision',
]
const databaseOptions = {
  adminEmail: 'decision-pg-a@example.test',
  adminName: 'Decision PostgreSQL A',
  adminPasswordSalt: 'decision-pg-a-salt',
  adminPasswordHash: 'decision-pg-a-hash',
  workspaceId: workspaceA,
  workspaceName: 'Decision PostgreSQL A',
}

let database
try {
  database = await openDatabase(databaseOptions)
  const migrationContext = await database.getContextByEmail('decision-pg-a@example.test')
  const migrationDynamics = createDecisionDynamicsService({ database })
  const migrationVector = {
    actionType: 'verify_schema_migration',
    targetType: 'comparison_row',
    sourceState: 'phase_1',
    destinationState: 'semantic_layer',
    intentType: 'verify_compatibility',
    expectedDirection: 'neutral',
  }
  const migrationHistorical = await migrationDynamics.createDecision(migrationContext, {
    title: 'Migration historical decision',
    decisionText: 'Preserve this Phase 1 comparison during schema migration.',
    intent: 'Verify compatibility.',
    objectType: 'schema_test',
    decidedAt: '2024-01-01T00:00:00.000Z',
    vector: migrationVector,
  })
  const migrationCurrent = await migrationDynamics.createDecision(migrationContext, {
    title: 'Migration current decision',
    decisionText: 'Compare this row before adding semantic columns.',
    intent: 'Verify compatibility.',
    objectType: 'schema_test',
    decidedAt: '2024-02-01T00:00:00.000Z',
    vector: migrationVector,
  })
  const migrationComparison = await migrationDynamics.compareDecision(
    migrationContext,
    migrationCurrent.id,
  )
  assert.equal(migrationComparison.candidates[0].decisionId, migrationHistorical.id)
  const migrationComparisonId = migrationComparison.candidates[0].id
  for (const column of [
    'semantic_status',
    'semantic_explanation',
    'semantic_error_code',
    'evidence_pack_version',
    'semantic_assessment_version',
    'confidence_model_version',
  ]) {
    await database.query(`ALTER TABLE decision_comparisons DROP COLUMN ${column}`)
  }
  await database.close()
  database = await openDatabase(databaseOptions)
  const migratedComparison = await database.query(
    `SELECT * FROM decision_comparisons WHERE id = $1`,
    [migrationComparisonId],
  )
  assert.equal(migratedComparison[0].semantic_status, 'unavailable')
  assert.equal(migratedComparison[0].confidence_model_version, 'comparison-confidence-v1')

  const info = await database.getDatabaseInfo()
  assert.equal(info.provider, 'PostgreSQL')
  assert.match(info.version, /^PostgreSQL 16\./)

  const tableRows = await database.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1)
     ORDER BY table_name`,
    [expectedTables],
  )
  assert.deepEqual(tableRows.map((row) => row.table_name), [...expectedTables].sort())

  const workspaceColumns = await database.query(
    `SELECT table_name, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'workspace_id'
       AND table_name = ANY($1)`,
    [expectedTables.filter((table) => table !== 'hermes_user_preferences')],
  )
  assert.equal(workspaceColumns.length, expectedTables.length - 1)
  assert(workspaceColumns.every((column) => column.is_nullable === 'NO'))

  const semanticColumns = await database.query(
    `SELECT column_name, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'decision_comparisons'
       AND column_name = ANY($1)`,
    [[
      'semantic_status',
      'semantic_explanation',
      'semantic_error_code',
      'evidence_pack_version',
      'semantic_assessment_version',
      'confidence_model_version',
    ]],
  )
  assert.equal(semanticColumns.length, 6)
  assert.equal(
    semanticColumns.find((column) => column.column_name === 'semantic_status').is_nullable,
    'NO',
  )

  const indexRows = await database.query(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = ANY($1)
     ORDER BY indexname`,
    [expectedIndexes],
  )
  assert.deepEqual(indexRows.map((row) => row.indexname), [...expectedIndexes].sort())

  const foreignKeys = await database.query(
    `SELECT tc.table_name, kcu.column_name, ccu.table_name AS referenced_table
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_name = tc.constraint_name
      AND kcu.constraint_schema = tc.constraint_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name
      AND ccu.constraint_schema = tc.constraint_schema
     WHERE tc.constraint_schema = 'public'
       AND tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_name = ANY($1)`,
    [expectedTables],
  )
  assert(foreignKeys.some((key) => (
    key.table_name === 'decision_vectors' &&
    key.column_name === 'decision_id' &&
    key.referenced_table === 'decisions'
  )))
  assert(foreignKeys.some((key) => (
    key.table_name === 'decision_evidence' &&
    key.column_name === 'workspace_id' &&
    key.referenced_table === 'workspaces'
  )))
  assert(foreignKeys.some((key) => (
    key.table_name === 'decision_comparisons' &&
    key.column_name === 'decision_b_id' &&
    key.referenced_table === 'decisions'
  )))

  const constraints = await database.query(
    `SELECT conrelid::regclass::text AS table_name, pg_get_constraintdef(oid) AS definition
     FROM pg_constraint
     WHERE connamespace = 'public'::regnamespace
       AND conrelid::regclass::text = ANY($1)`,
    [expectedTables],
  )
  assert(constraints.some((constraint) => (
    constraint.table_name === 'decision_candidates' &&
    constraint.definition.includes('detection_confidence')
  )))
  assert(constraints.some((constraint) => (
    constraint.table_name === 'decision_outcomes' &&
    constraint.definition.includes('causal_confidence')
  )))
  assert(constraints.some((constraint) => (
    constraint.table_name === 'decision_comparisons' &&
    constraint.definition.includes('comparison_confidence')
  )))
  assert(constraints.some((constraint) => (
    constraint.table_name === 'decision_comparisons' &&
    constraint.definition.includes('semantic_status')
  )))

  const timestamp = new Date().toISOString()
  await database.query(
    `INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
    [workspaceB, 'Decision PostgreSQL B', timestamp, timestamp],
  )
  await database.query(
    `INSERT INTO users (
       id, email, name, password_salt, password_hash, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    ['usr_decision_pg_b', 'decision-pg-b@example.test', 'Decision PostgreSQL B', 'salt', 'hash', timestamp, timestamp],
  )
  await database.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
     VALUES ($1, $2, 'owner', $3)`,
    [workspaceB, 'usr_decision_pg_b', timestamp],
  )
  const contextA = await database.getContextByEmail('decision-pg-a@example.test')
  const contextB = await database.getContextByIds('usr_decision_pg_b', workspaceB)
  const dynamics = createDecisionDynamicsService({
    database,
    semanticAssessor: {
      async assess() {
        return {
          comparable: true,
          contextualSimilarity: 0.87,
          sharedFactors: ['same component reuse intervention'],
          materialDifferences: ['different vehicle segment'],
          explanation: 'Comparable intervention with a material segment difference.',
          modelVersion: 'hermes-postgresql-verifier',
          assessmentVersion: 'hermes-decision-assessment-v1',
        }
      },
    },
  })

  const event = await recordWorkspaceEvent({
    database,
    context: contextA,
    eventType: 'project.updated',
    entityType: 'product',
    entityId: 'pg_polo_vivo',
    payload: { change: 'Previous-generation bumper selected.' },
    occurredAt: '2026-01-05T00:00:00.000Z',
  })
  const historical = await dynamics.createDecision(contextA, {
    title: 'PostgreSQL historical bumper decision',
    decisionText: 'Use the previous-generation bumper on the 2026 Polo Vivo.',
    intent: 'Increase or preserve sales.',
    objectType: 'product',
    objectId: 'pg_polo_vivo',
    decidedAt: '2026-01-05T00:00:00.000Z',
    vector: {
      actionType: 'reuse_component',
      targetType: 'bumper',
      sourceState: 'previous_generation',
      destinationState: 'current_generation',
      intentType: 'increase_or_preserve_sales',
      expectedDirection: 'positive',
    },
    evidence: [{
      sourceType: 'event',
      sourceId: event.id,
      relation: 'observed_action',
      summary: 'PostgreSQL provenance check.',
      weight: 1,
    }],
  })
  const outcome = await dynamics.recordOutcome(contextA, historical.id, {
    metric: { metricKey: 'avg_monthly_sales', baselineValue: 1420, observedValue: 1221 },
    outcomeClass: 'sales_declined',
    evidenceConfidence: 0.91,
    causalConfidence: 0.2,
  })
  assert.equal(outcome.metrics[0].changePercent, -14.01)

  const current = await dynamics.createDecision(contextA, {
    title: 'PostgreSQL current bumper decision',
    decisionText: 'Use the 2024 bumper on Mini Van XT and see if sales improve.',
    intent: 'Increase sales.',
    objectType: 'product',
    objectId: 'pg_mini_van_xt',
    decidedAt: '2026-08-10T00:00:00.000Z',
    vector: {
      actionType: 'reuse_component',
      targetType: 'bumper',
      sourceState: '2024_generation',
      destinationState: 'current_generation',
      intentType: 'increase_sales',
      expectedDirection: 'positive',
    },
  })
  const comparison = await dynamics.compareDecision(contextA, current.id)
  assert(comparison.candidates.some((candidate) => (
    candidate.decisionId === historical.id &&
    candidate.outcome.metrics[0].changePercent === -14.01 &&
    candidate.semanticAssessment.status === 'completed' &&
    candidate.contextualSimilarity === 0.87 &&
    candidate.confidenceModelVersion === 'comparison-confidence-v1'
  )))
  const comparisonRows = await database.query(
    `SELECT * FROM decision_comparisons
     WHERE workspace_id = $1 AND decision_a_id = $2 AND decision_b_id = $3`,
    [workspaceA, current.id, historical.id],
  )
  assert.equal(comparisonRows[0].semantic_status, 'completed')
  assert.equal(comparisonRows[0].model_version, 'hermes-postgresql-verifier')
  assert.equal(comparisonRows[0].semantic_assessment_version, 'hermes-decision-assessment-v1')
  assert.equal(comparisonRows[0].evidence_pack_version, 'decision-evidence-pack-v1')
  assert.equal(comparisonRows[0].confidence_model_version, 'comparison-confidence-v1')
  assert.equal(await dynamics.getDecision(contextB, historical.id), null)
  assert.equal(await database.query(
    `SELECT COUNT(*)::integer AS count FROM decisions WHERE workspace_id = $1`,
    [workspaceB],
  ).then((rows) => rows[0].count), 0)

  await assert.rejects(
    database.query(
      `INSERT INTO decision_vectors (
         decision_id, workspace_id, object_type, action_type, target_type,
         intent_type, expected_direction, vector_version, created_at
       ) VALUES ('dec_missing', $1, 'product', 'reuse', 'part', 'test', 'positive', 'v1', $2)`,
      [workspaceA, timestamp],
    ),
    /foreign key|violates/i,
  )

  console.log(
    'Real PostgreSQL Decision Intelligence verified: Phase 1 migration preservation, semantic columns, constraints, indexes, foreign keys, deterministic/final comparisons, and workspace isolation.',
  )
} finally {
  if (database) {
    await database.query('DELETE FROM workspaces WHERE id IN ($1, $2)', [workspaceA, workspaceB])
      .catch(() => {})
    await database.close()
  }
}
