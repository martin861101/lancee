import { createBrowserCapabilities } from './browser.mjs'
import { createDocumentCapabilities } from './documents.mjs'
import { createFileCapabilities } from './files.mjs'
import { createIntegrationCapabilities } from './integrations.mjs'
import { createCapabilityRegistry } from './registry.mjs'
import { createRuntimeCapabilities } from './runtime.mjs'
import { createVisualCapabilities } from './visual.mjs'
import { createWebCapabilities } from './web.mjs'

export { LanceeCapabilityError } from './registry.mjs'

export const lanceeMcpCapabilityBindings = Object.freeze({
  run_workflow: 'automation.run',
  create_workflow: 'automation.create',
  query_dashboard: 'workspace.query',
  create_client: 'client.create',
  create_project: 'project.create',
  set_project_status: 'project.set-status',
  create_file: 'file.write',
  read_file: 'file.read',
  search_files: 'file.search',
  get_file_metadata: 'file.metadata',
  web_search: 'web.search',
  access_webpage: 'web.access',
  extract_web_content: 'web.extract',
  crawl_website: 'web.crawl',
  browser_read: 'browser.read',
  browser_snapshot: 'browser.snapshot',
  browser_screenshot: 'browser.screenshot',
  analyze_visual: 'visual.inspect',
  extract_visual_palette: 'visual.extract-palette',
  create_pdf: 'pdf.create',
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
  delete_workspace_resource: 'workspace.delete-resource',
  get_workflow_status: 'automation.status',
  search_workflows: 'automation.search',
  execute_python: 'system.execute-python',
  execute_javascript: 'system.execute-javascript',
  schedule_job: 'job.schedule-automation',
  get_logs: 'automation.logs',
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
    ...createWebCapabilities({ requestImpl, dnsLookup, env, now }),
    ...createFileCapabilities({ database }),
    ...createDocumentCapabilities({ database, renderPdf, renderDocx }),
    ...createIntegrationCapabilities({ requestImpl, dnsLookup, env }),
    ...createBrowserCapabilities({ database, browserWorker }),
    ...createVisualCapabilities({ database, sharpImpl }),
    ...createRuntimeCapabilities({ database, executionWorker }),
    ...additionalCapabilities,
  ]
  return createCapabilityRegistry(definitions, { authorize: authorizeCapability, audit: auditCapability, now: registryNow })
}
