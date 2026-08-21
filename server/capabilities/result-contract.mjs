export const LANCEE_MCP_RESULT_CONTRACT_VERSION = '1.0'

const canonicalIdFields = Object.freeze([
  'id',
  'fileId',
  'artifactId',
  'clientId',
  'projectId',
  'invoiceId',
  'automationId',
  'workflowId',
  'runId',
  'jobId',
  'approvalId',
  'scheduleId',
  'connectionId',
  'executionId',
  'resourceId',
  'notificationId',
  'memberId',
  'userId',
  'action',
  'slug',
  'key',
  'url',
])

const sensitiveKeyPattern = /(?:password|secret|token|authorization|cookie|api[_-]?key|access[_-]?key|refresh[_-]?key|private[_-]?key)/i
const internalKeyPattern = /^(?:body|storageKey|contentBase64|content_base64|temporaryDirectory|tempPath|storagePath|filePath|filesystemPath|cwd)$/i
const internalPathPattern = /(?:^|[\\/])(?:tmp|var[\\/]tmp)[\\/]/i

const resultContracts = Object.freeze({
  'file.write': { mode: 'single', resourceKey: 'file', resourceType: 'file' },
  'file.read': { mode: 'single', resourceKey: 'file', resourceType: 'file' },
  'file.search': { mode: 'list', collection: 'files', resourceType: 'file' },
  'file.metadata': { mode: 'single', resourceKey: 'file', resourceType: 'file' },
  'pdf.create': { mode: 'single', resourceKey: 'file', resourceType: 'file' },
  'document.create': { mode: 'single', resourceKey: 'file', resourceType: 'file' },
  'document.merge': { mode: 'single', resourceKey: 'file', resourceType: 'file' },
  'web.search': { mode: 'list', collection: 'results', resourceType: 'web-source' },
  'web.access': { mode: 'single', resourceType: 'web-page' },
  'web.extract': { mode: 'page-extract', resourceType: 'web-page' },
  'web.crawl': { mode: 'list', collection: 'pages', resourceType: 'web-page' },
  'browser.read': { mode: 'single', resourceType: 'web-page' },
  'browser.snapshot': { mode: 'single', resourceType: 'web-page' },
  'browser.screenshot': { mode: 'single', resourceKey: 'file', resourceType: 'file' },
  'browser.pdf': { mode: 'single', resourceKey: 'file', resourceType: 'file' },
  'browser.research': { mode: 'list', collection: 'pages', resourceType: 'web-page' },
  'visual.inspect': { mode: 'visual', resourceType: 'file' },
  'visual.extract-palette': { mode: 'visual', resourceType: 'file' },
  'artifact.list': { mode: 'list', collection: 'artifacts', resourceType: 'artifact' },
  'artifact.get': { mode: 'single', resourceKey: 'artifact', resourceType: 'artifact' },
  'artifact.register': { mode: 'single', resourceKey: 'artifact', resourceType: 'artifact' },
  'job.get': { mode: 'single', resourceKey: 'job', resourceType: 'job' },
  'job.list': { mode: 'list', collection: 'jobs', resourceType: 'job' },
  'job.cancel': { mode: 'single', resourceKey: 'job', resourceType: 'job' },
  'approval.list': { mode: 'list', collection: 'approvals', resourceType: 'approval' },
  'approval.get': { mode: 'single', resourceKey: 'approval', resourceType: 'approval' },
  'approval.decide': { mode: 'single', resourceKey: 'approval', resourceType: 'approval' },
  'integration.search': { mode: 'direct-list', resourceType: 'integration-action' },
  'integration.describe': { mode: 'single', resourceType: 'integration-action', allowMissingId: true },
  'integration.connections': { mode: 'direct-list', resourceType: 'integration-connection' },
  'integration.execute': { mode: 'optional-single', resourceType: 'integration-execution' },
  'integration.http.request': { mode: 'terminal' },
  'client.create': { mode: 'single', resourceKey: 'client', resourceType: 'client' },
  'project.create': { mode: 'single', resourceKey: 'project', resourceType: 'project' },
  'project.set-status': { mode: 'single', resourceKey: 'project', resourceType: 'project' },
  'integration.request-connector': { mode: 'single', resourceKey: 'connector', resourceType: 'connector' },
  'workspace.delete-resource': { mode: 'deleted' },
  'automation.run': { mode: 'automation-run' },
  'automation.create': { mode: 'single', resourceKey: 'workflow', resourceType: 'workflow' },
  'automation.status': { mode: 'automation-status' },
  'automation.search': { mode: 'list', collection: 'workflows', resourceType: 'workflow' },
  'system.execute-python': { mode: 'terminal' },
  'system.execute-javascript': { mode: 'terminal' },
  'job.schedule-automation': { mode: 'single', resourceKey: 'schedule', resourceType: 'schedule' },
  'automation.logs': { mode: 'list', collection: 'logs', resourceType: 'automation-event' },
  'decision.create': { mode: 'single', resourceKey: 'decision', resourceType: 'decision' },
  'decision.list': { mode: 'list', collection: 'decisions', resourceType: 'decision' },
  'decision.get': { mode: 'single', resourceKey: 'decision', resourceType: 'decision' },
  'decision.schedule-review': { mode: 'single', resourceKey: 'review', resourceType: 'decision-review' },
  'decision.list-reviews': { mode: 'list', collection: 'reviews', resourceType: 'decision-review' },
  'decision.record-outcome': { mode: 'single', resourceKey: 'outcome', resourceType: 'decision-outcome' },
  'decision.get-outcome': { mode: 'single', resourceKey: 'outcome', resourceType: 'decision-outcome' },
  'decision.get-evidence': { mode: 'list', collection: 'evidence', resourceType: 'decision-evidence' },
  'decision.compare': { mode: 'list', collection: 'candidates', resourceType: 'decision-comparison' },
  'decision.get-comparison': { mode: 'single', resourceKey: 'comparison', resourceType: 'decision-comparison' },
  'decision.review-comparison': { mode: 'single', resourceKey: 'comparison', resourceType: 'decision-comparison' },
  'decision.refresh-intelligence': { mode: 'terminal' },
  'decision.list-patterns': { mode: 'list', collection: 'patterns', resourceType: 'decision-pattern' },
  'decision.list-predictions': { mode: 'list', collection: 'predictions', resourceType: 'decision-prediction' },
  'decision.list-warnings': { mode: 'list', collection: 'warnings', resourceType: 'decision-warning' },
  'decision.review-warning': { mode: 'single', resourceKey: 'warning', resourceType: 'decision-warning' },
  'decision.get-causal-assessment': { mode: 'single', resourceKey: 'assessment', resourceType: 'decision-causal-assessment' },
  'decision.get-learning-model': { mode: 'single', resourceKey: 'model', resourceType: 'decision-learning-model' },
  'workspace.query': { mode: 'dashboard' },
})

export const lanceeMcpResultContracts = resultContracts

export class LanceeMcpResultError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'LanceeMcpResultError'
    this.code = 'INVALID_RESULT'
    Object.assign(this, details)
  }
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function safeKey(key) {
  return !sensitiveKeyPattern.test(key) && !internalKeyPattern.test(key)
}

function sanitizeValue(value, seen = new WeakSet()) {
  if (value === undefined) return undefined
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return internalPathPattern.test(value) ? '[internal path omitted]' : value
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return undefined
  if (typeof value !== 'object') return undefined
  if (seen.has(value)) return undefined
  seen.add(value)
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen)).filter((item) => item !== undefined)
  }
  const result = {}
  for (const [key, child] of Object.entries(value)) {
    if (!safeKey(key)) continue
    const sanitized = sanitizeValue(child, seen)
    if (sanitized !== undefined) result[key] = sanitized
  }
  return result
}

function firstText(value, fields) {
  for (const field of fields) {
    const candidate = value?.[field]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return ''
}

export function extractCanonicalId(value, { fields = canonicalIdFields } = {}) {
  if (typeof value === 'string' || typeof value === 'number') {
    const id = String(value).trim()
    return id || null
  }
  if (!isObject(value)) return null
  for (const field of fields) {
    const candidate = value[field]
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      const id = String(candidate).trim()
      if (id) return id
    }
  }
  if (isObject(value.source)) return extractCanonicalId(value.source, { fields })
  return null
}

function resourceName(value, id) {
  return firstText(value, ['name', 'title', 'label', 'filename', 'action']) || id
}

export function normalizeResource(value, type, { allowMissingId = false } = {}) {
  const id = extractCanonicalId(value)
  if (!id && !allowMissingId) {
    throw new LanceeMcpResultError(`The ${type} result did not include a canonical id.`)
  }
  const sanitized = sanitizeValue(value)
  const resource = isObject(sanitized) ? sanitized : {}
  if (id) resource.id = id
  resource.type = type
  if (!resource.name && id) resource.name = resourceName(value, id)
  if (typeof value === 'object' && value !== null && typeof value.url === 'string' && !resource.url) {
    resource.url = value.url
  }
  return resource
}

function normalizeCollection(items, type, options = {}) {
  if (!Array.isArray(items)) {
    throw new LanceeMcpResultError(`The ${type} result did not include a result list.`)
  }
  return items.map((item) => normalizeResource(item, type, options))
}

function baseObject(value) {
  const sanitized = sanitizeValue(value)
  if (Array.isArray(sanitized)) return {}
  if (isObject(sanitized)) return sanitized
  return { value: sanitized }
}

function normalizeDashboard(value) {
  const resource = String(value?.resource || '')
  if (!Array.isArray(value?.rows)) {
    return {
      data: baseObject(value),
      diagnostics: { resourceType: null, resultCount: 0, canonicalIdPresent: true },
    }
  }
  const typeByResource = {
    projects: 'project',
    clients: 'client',
    invoices: 'invoice',
    draft_invoices: 'invoice',
    automations: 'workflow',
    automation_runs: 'automation-run',
    files: 'file',
    connections: 'integration-connection',
    connector_requests: 'connector-request',
    notifications: 'notification',
    team: 'workspace-member',
  }
  const resourceType = typeByResource[resource]
  if (!resourceType) {
    throw new LanceeMcpResultError(`The dashboard resource ${resource || 'unknown'} has no result contract.`)
  }
  const results = normalizeCollection(value.rows, resourceType)
  return {
    data: {
      resource,
      results,
      total: Number.isInteger(value.total) ? value.total : results.length,
    },
    diagnostics: {
      resourceType,
      resultCount: results.length,
      canonicalIdPresent: results.every((item) => Boolean(item.id)),
    },
  }
}

function normalizeAutomationRun(value) {
  const data = baseObject(value)
  const workflow = normalizeResource(value?.workflow, 'workflow')
  const run = normalizeResource(value?.run, 'automation-run')
  data.workflow = workflow
  data.run = run
  data.resource = run
  data.resources = [workflow, run]
  return {
    data,
    diagnostics: { resourceType: 'automation-run', resultCount: 2, canonicalIdPresent: true },
  }
}

function normalizeAutomationStatus(value) {
  const data = baseObject(value)
  const primary = value?.workflow
    ? normalizeResource(value.workflow, 'workflow')
    : normalizeResource(value?.run, 'automation-run')
  if (value?.workflow) data.workflow = primary
  if (value?.run) data.run = normalizeResource(value.run, 'automation-run')
  data.resource = primary
  return {
    data,
    diagnostics: { resourceType: primary.type, resultCount: 1, canonicalIdPresent: true },
  }
}

function normalizeDeleted(value) {
  const resourceType = value?.resource === 'automation' ? 'workflow' : value?.resource === 'file' ? 'file' : null
  if (!resourceType || !value?.id) throw new LanceeMcpResultError('The delete result did not include a supported resource id.')
  const data = baseObject(value)
  data.resource = normalizeResource({ id: value.id, name: value.id }, resourceType)
  data.status = 'deleted'
  return {
    data,
    diagnostics: { resourceType, resultCount: 1, canonicalIdPresent: true },
  }
}

function normalizePageExtract(value) {
  const data = baseObject(value)
  const resource = normalizeResource({
    id: value?.url,
    url: value?.url,
    title: value?.data?.title,
  }, 'web-page')
  data.resource = resource
  return {
    data,
    diagnostics: { resourceType: 'web-page', resultCount: 1, canonicalIdPresent: true },
  }
}

function normalizeVisual(value) {
  const data = baseObject(value)
  const resource = normalizeResource({
    id: value?.fileId,
    name: value?.name || value?.fileId,
    mimeType: value?.mimeType,
    size: value?.size,
    sha256: value?.sha256,
  }, 'file')
  data.resource = resource
  return {
    data,
    diagnostics: { resourceType: 'file', resultCount: 1, canonicalIdPresent: true },
  }
}

function normalizeData(capabilityId, value) {
  const contract = resultContracts[capabilityId]
  if (!contract) {
    return {
      data: baseObject(value),
      diagnostics: { resourceType: null, resultCount: 0, canonicalIdPresent: true },
    }
  }
  if (contract.mode === 'dashboard') return normalizeDashboard(value)
  if (contract.mode === 'automation-run') return normalizeAutomationRun(value)
  if (contract.mode === 'automation-status') return normalizeAutomationStatus(value)
  if (contract.mode === 'deleted') return normalizeDeleted(value)
  if (contract.mode === 'page-extract') return normalizePageExtract(value)
  if (contract.mode === 'visual') return normalizeVisual(value)
  if (contract.mode === 'terminal') {
    return {
      data: baseObject(value),
      diagnostics: { resourceType: null, resultCount: 0, canonicalIdPresent: true },
    }
  }
  if (contract.mode === 'direct-list') {
    const results = normalizeCollection(value, contract.resourceType)
    return {
      data: { results, total: results.length },
      diagnostics: {
        resourceType: contract.resourceType,
        resultCount: results.length,
        canonicalIdPresent: results.every((item) => Boolean(item.id)),
      },
    }
  }
  if (contract.mode === 'list') {
    const rawItems = value?.[contract.collection]
    const results = normalizeCollection(rawItems, contract.resourceType)
    const resultSemantics = {}
    if (typeof value?.resultScope === 'string') resultSemantics.resultScope = value.resultScope
    if (typeof value?.emptyResultMeaning === 'string') resultSemantics.emptyResultMeaning = value.emptyResultMeaning
    return {
      data: {
        results,
        total: Number.isInteger(value?.total) ? value.total : results.length,
        ...resultSemantics,
      },
      diagnostics: {
        resourceType: contract.resourceType,
        resultCount: results.length,
        canonicalIdPresent: results.every((item) => Boolean(item.id)),
      },
    }
  }
  if (contract.mode === 'optional-single') {
    const id = extractCanonicalId(value)
    const data = baseObject(value)
    if (!id) {
      return {
        data,
        diagnostics: { resourceType: contract.resourceType, resultCount: 0, canonicalIdPresent: false },
      }
    }
    const resource = normalizeResource(value, contract.resourceType)
    data.resource = resource
    return {
      data,
      diagnostics: { resourceType: contract.resourceType, resultCount: 1, canonicalIdPresent: true },
    }
  }
  const data = baseObject(value)
  const source = contract.resourceKey ? value?.[contract.resourceKey] : value
  const resource = normalizeResource(source, contract.resourceType, { allowMissingId: contract.allowMissingId })
  if (!resource.id && contract.allowMissingId) {
    return {
      data,
      diagnostics: { resourceType: contract.resourceType, resultCount: 0, canonicalIdPresent: false },
    }
  }
  if (contract.resourceKey) data[contract.resourceKey] = resource
  data.resource = resource
  return {
    data,
    diagnostics: {
      resourceType: contract.resourceType,
      resultCount: 1,
      canonicalIdPresent: Boolean(resource.id),
    },
  }
}

function normalizeArtifacts(value) {
  if (!Array.isArray(value)) return []
  return value.map((artifact) => normalizeResource(artifact, 'artifact'))
}

export function normalizeCapabilityResult(capabilityId, value) {
  const normalized = normalizeData(capabilityId, value)
  const contract = resultContracts[capabilityId]
  const artifacts = contract?.mode === 'list' && contract.collection === 'artifacts'
    ? []
    : normalizeArtifacts(value?.artifacts)
  if (artifacts.length && isObject(normalized.data)) normalized.data.artifacts = artifacts
  const warnings = Array.isArray(value?.warnings) ? sanitizeValue(value.warnings) : []
  return {
    data: normalized.data,
    artifacts,
    warnings: Array.isArray(warnings) ? warnings : [],
    diagnostics: {
      ...normalized.diagnostics,
      schemaValidationPassed: true,
    },
  }
}

export function normalizeMcpError(error, { tool = null, capabilityId = null, provider = null } = {}) {
  const known = Boolean(error?.code)
  const failure = {
    code: known ? String(error.code) : 'MCP_TOOL_FAILED',
    message: known && error?.message ? String(error.message) : 'The Lancee MCP tool failed.',
    retryable: Boolean(error?.retryable),
  }
  return {
    success: false,
    ok: false,
    data: null,
    artifacts: [],
    warnings: [],
    error: failure,
    metadata: {
      contractVersion: LANCEE_MCP_RESULT_CONTRACT_VERSION,
      tool,
      capabilityId,
      provider,
      resourceType: null,
      resultCount: 0,
      canonicalIdPresent: false,
      schemaValidationPassed: false,
    },
  }
}

export function mcpOutputSchema() {
  const resource = {
    type: 'object',
    required: ['id', 'type'],
    properties: {
      id: { type: 'string' },
      type: { type: 'string' },
      name: { type: 'string' },
    },
    additionalProperties: true,
  }
  return {
    type: 'object',
    required: ['success', 'ok', 'data', 'error'],
    properties: {
      success: { type: 'boolean' },
      ok: { type: 'boolean' },
      data: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object',
            properties: {
              resource,
              results: { type: 'array', items: resource },
              resources: { type: 'array', items: resource },
              total: { type: 'integer', minimum: 0 },
            },
            additionalProperties: true,
          },
        ],
      },
      error: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              retryable: { type: 'boolean' },
            },
            additionalProperties: true,
          },
        ],
      },
    },
    additionalProperties: true,
  }
}
