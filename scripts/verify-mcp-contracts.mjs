import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/database.mjs'
import { createLanceeMcpRuntime } from '../server/lancee-mcp.mjs'
import { createLanceeMcpProtocolServer } from '../server/lancee-mcp-protocol.mjs'

const directory = mkdtempSync(join(tmpdir(), 'lancee-mcp-contracts-'))
let database

try {
  database = await openDatabase({
    databasePath: join(directory, 'contracts.sqlite'),
    adminEmail: 'contracts@example.test',
    adminName: 'MCP Contract Test',
    adminPasswordSalt: 'contracts-salt',
    adminPasswordHash: 'contracts-hash',
    workspaceId: 'wsp_contracts',
    workspaceName: 'MCP Contract Workspace',
  })
  const context = await database.getContextByEmail('contracts@example.test')
  const auditEvents = []
  const runtime = createLanceeMcpRuntime({
    database,
    env: { NODE_ENV: 'test' },
    coreToolIds: ['workspace.summary'],
    executeAutomationRun: async () => {},
    semanticDecisionAssessor: {
      async assess() {
        return {
          comparable: true,
          contextualSimilarity: 0.87,
          sharedFactors: ['same intervention'],
          materialDifferences: ['different market period'],
          explanation: 'Comparable with a material timing difference.',
          modelVersion: 'hermes-mcp-contract-test',
          assessmentVersion: 'hermes-decision-assessment-v1',
        }
      },
    },
    audit: async (event) => auditEvents.push(event),
  })
  const server = createLanceeMcpProtocolServer({ runtime })

  const tools = runtime.listTools()
  assert.equal(tools.length, 61)
  for (const tool of tools) {
    assert.deepEqual(tool.outputSchema.required, ['success', 'ok', 'data', 'error'])
  }

  let requestId = 1
  async function call(name, args, invocationContext = context) {
    const response = await server.handleMessage({
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: { name, arguments: args },
    }, invocationContext)
    assert.equal(response.error, undefined)
    return response.result
  }

  const createdFile = await call('create_file', {
    name: 'wine-chapters.txt',
    content: 'Chapter one',
  })
  assert.equal(createdFile.structuredContent.ok, true)
  assert.equal(createdFile.structuredContent.data.resource.type, 'file')
  const fileId = createdFile.structuredContent.data.resource.id
  assert.match(fileId, /^doc_[a-f0-9]{16}$/)
  assert.equal(createdFile.structuredContent.data.resource.body, undefined)

  const duplicateFile = await call('create_file', {
    name: 'wine-chapters.txt',
    content: 'Chapter two',
  })
  const duplicateFileId = duplicateFile.structuredContent.data.resource.id
  assert.notEqual(duplicateFileId, fileId)

  const searched = await call('search_files', { query: 'wine-chapters' })
  const fileResults = searched.structuredContent.data.results
  assert.equal(searched.structuredContent.data.files, undefined)
  assert.equal(fileResults.length, 2)
  assert.deepEqual(new Set(fileResults.map((file) => file.id)), new Set([fileId, duplicateFileId]))
  assert(fileResults.every((file) => file.type === 'file' && file.name === 'wine-chapters.txt'))

  const read = await call('read_file', { file_id: fileId })
  assert.equal(read.structuredContent.data.resource.id, fileId)
  assert.equal(read.structuredContent.data.content, 'Chapter one')
  const duplicateRead = await call('read_file', { file_id: duplicateFileId })
  assert.equal(duplicateRead.structuredContent.data.resource.id, duplicateFileId)
  assert.equal(duplicateRead.structuredContent.data.content, 'Chapter two')

  const metadata = await call('get_file_metadata', { file_id: fileId })
  assert.equal(metadata.structuredContent.data.resource.id, fileId)

  const artifacts = await call('list_artifacts', {})
  assert.equal(artifacts.structuredContent.data.artifacts, undefined)
  assert(artifacts.structuredContent.data.results.every((item) => item.id && item.type === 'artifact'))

  const client = await call('create_client', { name: 'Contract Client' })
  const clientId = client.structuredContent.data.resource.id
  assert.equal(client.structuredContent.data.client.id, clientId)
  const clientList = await call('query_dashboard', { resource: 'clients' })
  assert.equal(clientList.structuredContent.data.rows, undefined)
  assert(clientList.structuredContent.data.results.some((item) => item.id === clientId))

  const project = await call('create_project', { name: 'Contract Project', client_id: clientId })
  const projectId = project.structuredContent.data.resource.id
  const projectList = await call('query_dashboard', { resource: 'projects' })
  assert(projectList.structuredContent.data.results.some((item) => item.id === projectId))
  const changed = await call('set_project_status', { project_id: projectId, status: 'Ready' })
  assert.equal(changed.structuredContent.data.resource.id, projectId)
  assert.equal(changed.structuredContent.data.resource.type, 'project')

  const invoiceList = await call('query_dashboard', { resource: 'invoices' })
  assert(Array.isArray(invoiceList.structuredContent.data.results))

  const createdWorkflow = await call('create_workflow', {
    name: 'Contract Workflow',
    description: 'Workflow contract regression test.',
    tools: ['workspace.summary'],
  })
  const workflowId = createdWorkflow.structuredContent.data.resource.id
  const workflowList = await call('search_workflows', { query: 'Contract Workflow' })
  assert.equal(workflowList.structuredContent.data.workflows, undefined)
  assert(workflowList.structuredContent.data.results.some((item) => item.id === workflowId))
  const workflowStatus = await call('get_workflow_status', {
    workflow_id: workflowId,
    include_runs: false,
  })
  assert.equal(workflowStatus.structuredContent.data.resource.id, workflowId)

  const jobs = await call('list_jobs', {})
  assert(Array.isArray(jobs.structuredContent.data.results))

  const historicalDecisionResult = await call('create_decision', {
    title: 'Historical bumper decision',
    decision_text: 'Use the previous-generation bumper on the 2026 Polo Vivo.',
    intent: 'Increase or preserve sales.',
    object_type: 'product',
    object_id: 'polo_vivo_2026',
    decided_at: '2026-01-05T00:00:00.000Z',
    vector: {
      action_type: 'reuse_component',
      target_type: 'bumper',
      source_state: 'previous_generation',
      destination_state: 'current_generation',
      intent_type: 'increase_or_preserve_sales',
      expected_direction: 'positive',
    },
    expected_reaction: {
      metric_key: 'avg_monthly_sales',
      direction: 'increase',
      confidence: 0.6,
    },
  })
  const historicalDecisionId = historicalDecisionResult.structuredContent.data.resource.id
  assert.match(historicalDecisionId, /^dec_[a-f0-9]{32}$/)
  const recordedOutcome = await call('record_outcome', {
    decision_id: historicalDecisionId,
    metric_key: 'avg_monthly_sales',
    unit: 'vehicles_per_month',
    baseline_value: 1420,
    observed_value: 1221,
    outcome_class: 'sales_declined',
    observed_reason: 'Sales declined after the change.',
    evidence_confidence: 0.91,
    causal_confidence: 0.2,
  })
  assert.equal(recordedOutcome.structuredContent.data.resource.id, historicalDecisionId)
  assert.equal(recordedOutcome.structuredContent.data.resource.metrics[0].changePercent, -14.01)
  await assert.rejects(
    runtime.invoke('record_outcome', {
      decision_id: historicalDecisionId,
      metric_key: 'avg_monthly_sales',
      baseline_value: 1420,
      observed_value: 1221,
      evidence_confidence: 0.91,
    }, context, { autonomous: true }),
    (error) => error.code === 'MCP_APPROVAL_REQUIRED',
  )

  const currentDecisionResult = await call('create_decision', {
    title: 'Mini Van XT bumper decision',
    decision_text: 'Use the 2024 bumper on Mini Van XT and see if sales improve.',
    intent: 'Increase sales.',
    object_type: 'product',
    object_id: 'mini_van_xt',
    decided_at: '2026-08-10T00:00:00.000Z',
    vector: {
      action_type: 'reuse_component',
      target_type: 'bumper',
      source_state: '2024_generation',
      destination_state: 'current_generation',
      intent_type: 'increase_sales',
      expected_direction: 'positive',
    },
    expected_reaction: {
      metric_key: 'avg_monthly_sales',
      direction: 'increase',
      confidence: 0.6,
      review_due_at: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
    },
  })
  const currentDecisionId = currentDecisionResult.structuredContent.data.resource.id
  const decisionList = await call('list_decisions', {})
  assert.equal(decisionList.structuredContent.data.decisions, undefined)
  assert(decisionList.structuredContent.data.results.some((decision) => decision.id === currentDecisionId))
  const selectedDecision = await call('get_decision', { decision_id: currentDecisionId })
  assert.equal(selectedDecision.structuredContent.data.resource.id, currentDecisionId)
  assert.equal(selectedDecision.structuredContent.data.resource.observationReviews.length, 1)
  assert.equal(selectedDecision.structuredContent.data.resource.observationReviews[0].status, 'scheduled')
  const scheduledDecisionReview = await call('schedule_decision_review', {
    decision_id: currentDecisionId,
    metric_key: 'avg_monthly_sales',
    due_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1_000).toISOString(),
  })
  assert.equal(scheduledDecisionReview.structuredContent.data.resource.decisionId, currentDecisionId)
  const decisionReviews = await call('list_decision_reviews', { status: 'open' })
  assert(decisionReviews.structuredContent.data.results.some((review) => review.decisionId === currentDecisionId))
  assert.equal(decisionReviews.structuredContent.data.resultScope, 'decision_outcome_reviews')
  assert.match(decisionReviews.structuredContent.data.emptyResultMeaning, /does not establish whether decisions/i)
  const selectedOutcome = await call('get_decision_outcome', { decision_id: historicalDecisionId })
  assert.equal(selectedOutcome.structuredContent.data.resource.id, historicalDecisionId)
  const selectedEvidence = await call('get_decision_evidence', { decision_id: historicalDecisionId })
  assert.deepEqual(selectedEvidence.structuredContent.data.results, [])
  const comparedDecision = await call('compare_decision', { decision_id: currentDecisionId })
  assert.equal(comparedDecision.structuredContent.data.candidates, undefined)
  assert(comparedDecision.structuredContent.data.results.some((candidate) => (
    candidate.decisionId === historicalDecisionId &&
    candidate.outcome.metrics[0].changePercent === -14.01 &&
    candidate.contextualSimilarity === 0.87 &&
    candidate.semanticAssessment.status === 'completed' &&
    candidate.modelVersion === 'hermes-mcp-contract-test'
  )))
  const comparisonId = comparedDecision.structuredContent.data.results.find(
    (candidate) => candidate.decisionId === historicalDecisionId,
  ).id
  const selectedComparison = await call('get_decision_comparison', { comparison_id: comparisonId })
  assert.equal(selectedComparison.structuredContent.data.resource.machineAssessment.comparable, true)
  const correctedComparison = await call('review_decision_comparison', {
    comparison_id: comparisonId,
    action: 'corrected',
    comparable: false,
    contextual_similarity: 0.2,
    shared_factors: ['Same component intervention.'],
    material_differences: ['Different procurement constraints.'],
    explanation: 'The procurement constraint makes this comparison materially weaker.',
  })
  assert.equal(correctedComparison.structuredContent.data.resource.assessmentSource, 'human_review')
  assert.equal(correctedComparison.structuredContent.data.resource.comparable, false)
  assert.equal(correctedComparison.structuredContent.data.resource.machineAssessment.comparable, true)
  await assert.rejects(
    runtime.invoke('review_decision_comparison', {
      comparison_id: comparisonId,
      action: 'rejected',
      explanation: 'Not comparable.',
    }, context, { autonomous: true }),
    (error) => error.code === 'MCP_APPROVAL_REQUIRED',
  )

  const refreshedIntelligence = await call('refresh_decision_intelligence', {})
  assert.equal(refreshedIntelligence.structuredContent.data.refresh.workspaceId, context.workspace.id)
  assert.deepEqual((await call('list_decision_patterns', {})).structuredContent.data.results, [])
  assert.deepEqual((await call('list_decision_predictions', {})).structuredContent.data.results, [])
  const causalAssessment = await call('get_decision_causal_assessment', {
    decision_id: historicalDecisionId,
    metric_key: 'avg_monthly_sales',
  })
  assert.equal(causalAssessment.structuredContent.data.resource.claimLevel, 'association_only')
  assert.equal(causalAssessment.structuredContent.data.resource.modelVersion, 'causal-assessment-v1')
  await assert.rejects(
    runtime.invoke('refresh_decision_intelligence', {}, context, { autonomous: true }),
    (error) => error.code === 'MCP_APPROVAL_REQUIRED',
  )

  const warningId = `dwrn_${'1'.repeat(32)}`
  const warningTimestamp = new Date().toISOString()
  await database.query(
    `INSERT INTO decision_warnings (
       id, workspace_id, decision_id, metric_key, warning_type, severity,
       summary, warning_confidence, evidence_json, policy_version, status,
       created_at, updated_at
     ) VALUES ($1, $2, $3, 'avg_monthly_sales', 'contract_warning', 'medium',
       'Contract warning.', 0.7, '{}', 'decision-warning-v1', 'active', $4, $5)`,
    [warningId, context.workspace.id, currentDecisionId, warningTimestamp, warningTimestamp],
  )
  const decisionWarnings = await call('list_decision_warnings', {})
  assert.equal(decisionWarnings.structuredContent.data.results[0].id, warningId)
  const reviewedWarning = await call('review_decision_warning', {
    warning_id: warningId,
    action: 'acknowledged',
  })
  assert.equal(reviewedWarning.structuredContent.data.resource.status, 'acknowledged')

  await database.query(
    `INSERT INTO decision_learning_models (
       id, workspace_id, model_type, model_version, parameters_json,
       training_metrics_json, training_data_hash, sample_size, status,
       active_key, created_at
     ) VALUES ('dlm_contract_model', $1, 'structural_similarity',
       'structural-calibration-v1-contract', $2, '{}', 'contract-hash', 8,
       'active', 'active', $3)`,
    [context.workspace.id, JSON.stringify({ weights: {} }), warningTimestamp],
  )
  const learningModel = await call('get_decision_learning_model', {
    model_type: 'structural_similarity',
  })
  assert.equal(learningModel.structuredContent.data.resource.modelVersion, 'structural-calibration-v1-contract')
  const intelligenceOverview = await call('get_decision_intelligence_overview', {})
  assert.equal(intelligenceOverview.structuredContent.data.overview.metrics.decisionsObserved, 2)
  assert.equal(intelligenceOverview.structuredContent.data.overview.metrics.measuredOutcomes, 1)
  assert.equal(intelligenceOverview.structuredContent.data.overview.thresholds.minimumPatternSamples, 3)
  assert(intelligenceOverview.structuredContent.data.overview.categories.some((category) => category.objectType === 'product'))

  const foreignDecision = await call('get_decision', { decision_id: currentDecisionId }, {
    ...context,
    workspace: { ...context.workspace, id: 'wsp_other' },
  })
  assert.equal(foreignDecision.isError, true)
  assert.equal(foreignDecision.structuredContent.error.code, 'MCP_RESOURCE_NOT_FOUND')

  const foreignRead = await call('read_file', { file_id: fileId }, {
    ...context,
    workspace: { ...context.workspace, id: 'wsp_other' },
  })
  assert.equal(foreignRead.isError, true)
  assert.equal(foreignRead.structuredContent.ok, false)
  assert.equal(foreignRead.structuredContent.data, null)
  assert.equal(foreignRead.structuredContent.error.code, 'MCP_NOT_FOUND')

  const failed = await call('read_file', { file_id: 'doc_0000000000000000' })
  assert.equal(failed.isError, true)
  assert.equal(failed.structuredContent.ok, false)
  assert.equal(failed.structuredContent.error.code, 'MCP_NOT_FOUND')
  assert.match(failed.structuredContent.error.message, /not found/i)

  const completed = auditEvents.filter((event) => event.status === 'completed')
  assert(completed.some((event) => event.capabilityId === 'file.search' && event.canonicalIdPresent === true))
  assert(completed.every((event) => event.schemaValidationPassed === true))

  console.log('MCP result contracts verified: canonical list/single resources, Decision Dynamics composition, Hermes-compatible references, create/use and list/select/mutate chains, normalized errors, tenant isolation, output schemas, and audit diagnostics.')
} finally {
  await database?.close()
  rmSync(directory, { recursive: true, force: true })
}
