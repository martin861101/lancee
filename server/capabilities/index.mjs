import { createDocumentCapabilities } from './documents.mjs'
import { createFileCapabilities } from './files.mjs'
import { createIntegrationCapabilities } from './integrations.mjs'
import { createCapabilityRegistry } from './registry.mjs'
import { createRuntimeCapabilities } from './runtime.mjs'
import { createVisualCapabilities } from './visual.mjs'

export { LanceeCapabilityError } from './registry.mjs'

export const lanceeMcpCapabilityBindings = Object.freeze({
  run_workflow: 'automation.run',
  create_workflow: 'automation.create',
  query_dashboard: 'workspace.query',
  create_client: 'client.create',
  create_project: 'project.create',
  set_project_status: 'project.set-status',
  create_file: 'file.write',
  rename_file: 'file.rename',
  read_file: 'file.read',
  search_files: 'file.search',
  get_file_metadata: 'file.metadata',
  analyze_visual: 'visual.inspect',
  extract_visual_palette: 'visual.extract-palette',
  create_document: 'document.create',
  merge_documents: 'document.merge',
  list_artifacts: 'artifact.list',
  get_artifact: 'artifact.get',
  register_artifact: 'artifact.register',
  get_job_status: 'job.get',
  list_jobs: 'job.list',
  cancel_job: 'job.cancel',
  list_approvals: 'approval.list',
  get_approval: 'approval.get',
  decide_approval: 'approval.decide',
  request_connector: 'integration.request-connector',
  integrations_search: 'integration.search',
  integrations_describe: 'integration.describe',
  integrations_execute: 'integration.execute',
  integrations_connections: 'integration.connections',
  delete_workspace_resource: 'workspace.delete-resource',
  get_workflow_status: 'automation.status',
  search_workflows: 'automation.search',
  schedule_job: 'job.schedule-automation',
  get_logs: 'automation.logs',
  create_decision: 'decision.create',
  list_decisions: 'decision.list',
  get_decision: 'decision.get',
  schedule_decision_review: 'decision.schedule-review',
  list_decision_reviews: 'decision.list-reviews',
  record_outcome: 'decision.record-outcome',
  get_decision_outcome: 'decision.get-outcome',
  get_decision_evidence: 'decision.get-evidence',
  compare_decision: 'decision.compare',
  get_decision_comparison: 'decision.get-comparison',
  review_decision_comparison: 'decision.review-comparison',
  refresh_decision_intelligence: 'decision.refresh-intelligence',
  list_decision_patterns: 'decision.list-patterns',
  list_decision_predictions: 'decision.list-predictions',
  list_decision_warnings: 'decision.list-warnings',
  review_decision_warning: 'decision.review-warning',
  get_decision_causal_assessment: 'decision.get-causal-assessment',
  get_decision_learning_model: 'decision.get-learning-model',
  get_decision_intelligence_overview: 'decision.get-intelligence-overview',
  get_connected_intelligence_summary: 'intelligence.summary',
  list_connected_opportunities: 'intelligence.list-findings',
  list_connected_intelligence_activity: 'intelligence.list-activity',
  get_connected_intelligence_activity: 'intelligence.get-activity',
  get_connected_opportunity_evidence: 'intelligence.get-evidence',
  call_external_api: 'integration.http.request',
})

export function createLanceeCapabilityRegistry({
  database,
  requestImpl,
  dnsLookup,
  env,
  now,
  renderPdf,
  renderDocx,
  browserWorker,
  executionWorker,
  sharpImpl,
  additionalCapabilities = [],
  integrationGateway,
  authorize,
  audit,
} = {}) {
  const auditCapability = audit || (typeof database?.recordMcpInvocation === 'function'
    ? async (event) => database.recordMcpInvocation({
        selectedWorkspaceId: event.workspaceId,
        serviceId: 'lancee',
        toolId: event.capabilityId,
        duration: event.durationMs,
        message: JSON.stringify({
          status: event.status,
          requestId: event.requestId,
          userId: event.userId,
          runId: event.runId,
          origin: event.origin,
          provider: event.provider,
          riskLevel: event.riskLevel,
          inputHash: event.inputHash,
          artifactIds: event.artifactIds || [],
          errorCode: event.errorCode,
          resourceType: event.resourceType || null,
          resultCount: event.resultCount ?? null,
          canonicalIdPresent: event.canonicalIdPresent ?? null,
          schemaValidationPassed: event.schemaValidationPassed ?? false,
        }),
      })
    : null)
  const authorizeCapability = authorize || (({ definition, context }) => {
    const role = context.membership?.role
    if (!['owner', 'collaborator', 'viewer'].includes(role)) return false
    if (definition.riskLevel === 'read') return true
    if (role === 'viewer') return false
    if (['external-action', 'destructive', 'administrative'].includes(definition.riskLevel)) {
      return role === 'owner'
    }
    return true
  })
  const registryNow = typeof now === 'function'
    ? () => {
        const value = now()
        return value instanceof Date ? value.getTime() : Number(value)
      }
    : undefined
  const definitions = [
    ...createFileCapabilities({ database }),
    ...createDocumentCapabilities({ database, renderPdf, renderDocx, browserWorker }),
    ...createIntegrationCapabilities({ requestImpl, dnsLookup, env, integrationGateway }),
    ...createVisualCapabilities({ database, sharpImpl }),
    ...createRuntimeCapabilities({ database, executionWorker }),
    ...additionalCapabilities,
  ]
  return createCapabilityRegistry(definitions, { authorize: authorizeCapability, audit: auditCapability, now: registryNow })
}
