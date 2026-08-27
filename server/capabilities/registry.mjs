import { createHash, randomUUID } from 'node:crypto'
import {
  LANCEE_MCP_RESULT_CONTRACT_VERSION,
  normalizeCapabilityResult,
} from './result-contract.mjs'

const capabilityIdPattern = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/
const riskLevels = new Set(['read', 'internal-write', 'external-action', 'destructive', 'administrative'])

/**
 * @typedef {'read'|'internal-write'|'external-action'|'destructive'|'administrative'} LanceeCapabilityRisk
 *
 * @typedef {object} LanceeCapabilityDefinition
 * @property {string} id
 * @property {string} namespace
 * @property {string} version
 * @property {string} description
 * @property {string} provider
 * @property {Record<string, unknown>} inputSchema
 * @property {Record<string, unknown>} outputSchema
 * @property {string[]} requiredPermissions
 * @property {LanceeCapabilityRisk} riskLevel
 * @property {boolean} requiresApproval
 * @property {number} timeoutMs
 * @property {boolean} supportsAsync
 * @property {string[]} tags
 * @property {boolean} [enabled]
 * @property {number} [estimatedCost]
 * @property {number} [concurrencyLimit]
 * @property {(context: Record<string, unknown>) => boolean|Promise<boolean>} [isAvailable]
 * @property {(request: {input: Record<string, unknown>, context: Record<string, unknown>, signal: AbortSignal, invocation: Record<string, unknown>}) => Promise<unknown>} execute
 */

export class LanceeCapabilityError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message)
    this.name = 'LanceeCapabilityError'
    this.code = code
    this.status = status
    Object.assign(this, details)
  }
}

export function textInput(input, key, { required = false, maxLength = 200 } = {}) {
  const value = String(input[key] ?? '').trim()
  if (required && !value) {
    throw new LanceeCapabilityError('INVALID_ARGUMENTS', `${key} is required.`)
  }
  if (value.length > maxLength) {
    throw new LanceeCapabilityError('INVALID_ARGUMENTS', `${key} must be ${maxLength} characters or fewer.`)
  }
  return value
}

function publicContract(definition) {
  const { execute: _execute, isAvailable: _isAvailable, ...contract } = definition
  return Object.freeze(contract)
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

function validateDefinition(definition) {
  if (!definition || typeof definition !== 'object') {
    throw new TypeError('Capability definitions must be objects.')
  }
  if (!capabilityIdPattern.test(definition.id) || definition.namespace !== definition.id.split('.')[0]) {
    throw new TypeError(`Invalid Lancee capability id: ${definition.id}`)
  }
  if (!/^\d+\.\d+\.\d+$/.test(definition.version)) {
    throw new TypeError(`Capability ${definition.id} must use a semantic version.`)
  }
  if (!definition.description || !definition.provider || typeof definition.execute !== 'function') {
    throw new TypeError(`Capability ${definition.id} is missing its description, provider, or executor.`)
  }
  if (!definition.inputSchema || !definition.outputSchema) {
    throw new TypeError(`Capability ${definition.id} must declare input and output schemas.`)
  }
  if (!Array.isArray(definition.requiredPermissions) || !riskLevels.has(definition.riskLevel)) {
    throw new TypeError(`Capability ${definition.id} has invalid permission or risk metadata.`)
  }
  if (!Number.isInteger(definition.timeoutMs) || definition.timeoutMs < 1 || !Array.isArray(definition.tags)) {
    throw new TypeError(`Capability ${definition.id} has invalid execution metadata.`)
  }
  if (
    typeof definition.enabled !== 'boolean' ||
    !Number.isFinite(definition.estimatedCost) ||
    !Number.isInteger(definition.concurrencyLimit) ||
    definition.concurrencyLimit < 1
  ) {
    throw new TypeError(`Capability ${definition.id} has invalid availability, cost, or concurrency metadata.`)
  }
}

function schemaFailure(path, message) {
  throw new LanceeCapabilityError('INVALID_ARGUMENTS', `${path} ${message}`)
}

export function validateCapabilitySchema(value, schema, path = 'input') {
  if (!schema || typeof schema !== 'object') return
  if (Array.isArray(schema.anyOf)) {
    const valid = schema.anyOf.some((candidate) => {
      try {
        validateCapabilitySchema(value, candidate, path)
        return true
      } catch {
        return false
      }
    })
    if (!valid) schemaFailure(path, 'does not match an allowed shape.')
    return
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) {
    schemaFailure(path, 'must use an allowed value.')
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) schemaFailure(path, 'must be an object.')
    const properties = schema.properties || {}
    for (const required of schema.required || []) {
      if (!Object.hasOwn(value, required)) schemaFailure(`${path}.${required}`, 'is required.')
    }
    const entries = Object.entries(value)
    if (Number.isInteger(schema.maxProperties) && entries.length > schema.maxProperties) {
      schemaFailure(path, `must have at most ${schema.maxProperties} properties.`)
    }
    for (const [key, child] of entries) {
      if (properties[key]) validateCapabilitySchema(child, properties[key], `${path}.${key}`)
      else if (schema.additionalProperties === false) schemaFailure(`${path}.${key}`, 'is not supported.')
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validateCapabilitySchema(child, schema.additionalProperties, `${path}.${key}`)
      }
    }
    return
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) schemaFailure(path, 'must be an array.')
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) schemaFailure(path, `must contain at least ${schema.minItems} items.`)
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) schemaFailure(path, `must contain at most ${schema.maxItems} items.`)
    for (let index = 0; index < value.length; index += 1) {
      validateCapabilitySchema(value[index], schema.items || {}, `${path}[${index}]`)
    }
    return
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') schemaFailure(path, 'must be a string.')
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) schemaFailure(path, `must be at least ${schema.minLength} characters.`)
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) schemaFailure(path, `must be at most ${schema.maxLength} characters.`)
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) schemaFailure(path, 'has an invalid format.')
    if (schema.format === 'uri') {
      try {
        new URL(value)
      } catch {
        schemaFailure(path, 'must be a valid URI.')
      }
    }
    if (schema.format === 'date-time' && !Number.isFinite(Date.parse(value))) schemaFailure(path, 'must be a valid date-time.')
    return
  }
  if (schema.type === 'integer' && !Number.isInteger(value)) schemaFailure(path, 'must be an integer.')
  if (schema.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) schemaFailure(path, 'must be a finite number.')
  if (schema.type === 'boolean' && typeof value !== 'boolean') schemaFailure(path, 'must be a boolean.')
  if (['integer', 'number'].includes(schema.type)) {
    if (Number.isFinite(schema.minimum) && value < schema.minimum) schemaFailure(path, `must be at least ${schema.minimum}.`)
    if (Number.isFinite(schema.maximum) && value > schema.maximum) schemaFailure(path, `must be at most ${schema.maximum}.`)
  }
}

function inputHash(input) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

function normalizedError(error) {
  if (error instanceof LanceeCapabilityError) {
    const base = { code: error.code, message: error.message, retryable: Boolean(error.retryable) }
    if (error.action) base.action = String(error.action)
    if (error.details?.action) base.action = String(error.details.action)
    return base
  }
  if (/^(?:WORKFLOW|EXTRACTION|AUTOMATION)_[A-Z0-9_]+$/.test(String(error?.code || '')) || error?.code === 'TIMEOUT') {
    const base = { code: error.code, message: String(error.message || 'The workflow capability failed.').slice(0, 500), retryable: false }
    if (error.action) base.action = String(error.action)
    return base
  }
  return { code: 'PROVIDER_ERROR', message: 'The capability provider failed.', retryable: false }
}

/**
 * @param {LanceeCapabilityDefinition[]} definitions
 * @param {{authorize?: Function, audit?: Function, now?: () => number, maxInvocationsPerMinute?: number}} options
 */
export function createCapabilityRegistry(definitions, {
  authorize = null,
  audit = null,
  now = () => Date.now(),
  maxInvocationsPerMinute = 120,
} = {}) {
  const capabilities = new Map()
  const activeExecutions = new Map()
  const invocationWindows = new Map()
  for (const definition of definitions) {
    const normalizedDefinition = {
      enabled: true,
      estimatedCost: 0,
      concurrencyLimit: 4,
      ...definition,
    }
    validateDefinition(normalizedDefinition)
    if (capabilities.has(normalizedDefinition.id)) {
      throw new TypeError(`Duplicate Lancee capability: ${normalizedDefinition.id}`)
    }
    capabilities.set(normalizedDefinition.id, Object.freeze({
      ...normalizedDefinition,
      inputSchema: deepFreeze(normalizedDefinition.inputSchema),
      outputSchema: deepFreeze(normalizedDefinition.outputSchema),
      requiredPermissions: Object.freeze([...normalizedDefinition.requiredPermissions]),
      tags: Object.freeze([...normalizedDefinition.tags]),
    }))
  }

  async function recordAudit(event) {
    if (typeof audit !== 'function') return
    try {
      await audit(event)
    } catch {
      // Auditing is best-effort at this layer; durable callers can enforce it separately.
    }
  }

  async function execute(id, input, context, invocation = {}) {
    const definition = capabilities.get(id)
    if (!definition) {
      throw new LanceeCapabilityError('NOT_FOUND', `Unknown Lancee capability: ${id}.`, 404)
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new LanceeCapabilityError('INVALID_ARGUMENTS', 'Capability input must be an object.')
    }
    if (!context?.workspace?.id || !context?.user?.id) {
      throw new LanceeCapabilityError('CONTEXT_UNAVAILABLE', 'The capability workspace context is unavailable.', 401)
    }
    validateCapabilitySchema(input, definition.inputSchema)
    const available = definition.enabled && (
      typeof definition.isAvailable !== 'function' || await definition.isAvailable(context)
    )
    if (!available) throw new LanceeCapabilityError('UNAVAILABLE', `${definition.id} is not available.`, 503)

    const declaredPermissions = Array.isArray(context.permissions) ? context.permissions : null
    if (declaredPermissions && definition.requiredPermissions.some((permission) => !declaredPermissions.includes(permission))) {
      throw new LanceeCapabilityError('PERMISSION_DENIED', `Permission is required for ${definition.id}.`, 403)
    }
    if (
      (definition.id === 'workflow.activate-proposal' && !invocation.approval?.serverIssued)
      || (definition.id !== 'workflow.activate-proposal' && invocation.autonomous && definition.requiresApproval && !invocation.approval?.approved)
    ) {
      throw new LanceeCapabilityError('APPROVAL_REQUIRED', `${definition.id} requires human approval.`, 409, {
        capabilityId: definition.id,
        riskLevel: definition.riskLevel,
      })
    }
    if (typeof authorize === 'function') {
      const authorized = await authorize({ definition: publicContract(definition), input, context, invocation })
      if (authorized === false) throw new LanceeCapabilityError('PERMISSION_DENIED', `Access to ${definition.id} was denied.`, 403)
    }

    const rateKey = `${context.workspace.id}:${context.user.id}`
    const rateNow = now()
    const recentInvocations = (invocationWindows.get(rateKey) || []).filter((timestamp) => timestamp > rateNow - 60_000)
    if (recentInvocations.length >= maxInvocationsPerMinute) {
      invocationWindows.set(rateKey, recentInvocations)
      throw new LanceeCapabilityError('RATE_LIMITED', 'The workspace capability rate limit was reached.', 429, { retryable: true })
    }
    recentInvocations.push(rateNow)
    invocationWindows.set(rateKey, recentInvocations)

    const externalSignal = invocation.signal
    if (externalSignal?.aborted) {
      throw new LanceeCapabilityError('CANCELLED', `${definition.id} was cancelled.`, 409)
    }
    const concurrencyKey = `${context.workspace.id}:${definition.id}`
    const active = activeExecutions.get(concurrencyKey) || 0
    if (active >= definition.concurrencyLimit) {
      throw new LanceeCapabilityError('RATE_LIMITED', `${definition.id} has reached its concurrency limit.`, 429, { retryable: true })
    }
    activeExecutions.set(concurrencyKey, active + 1)

    const requestId = String(invocation.requestId || randomUUID())
    const startedAt = now()
    const controller = new AbortController()
    let timedOut = false
    const cancelExecution = () => controller.abort()
    externalSignal?.addEventListener('abort', cancelExecution, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, definition.timeoutMs)
    let normalizedResult = null
    let normalizedDiagnostics = {
      resourceType: null,
      resultCount: null,
      canonicalIdPresent: null,
      schemaValidationPassed: true,
    }
    try {
      const result = await Promise.race([
        definition.execute({ input, context, signal: controller.signal, invocation }),
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(timedOut
              ? new LanceeCapabilityError('TIMEOUT', `${definition.id} exceeded its ${definition.timeoutMs} ms timeout.`, 504, { retryable: true })
              : new LanceeCapabilityError('CANCELLED', `${definition.id} was cancelled.`, 409))
          }, { once: true })
        }),
      ])
      try {
        validateCapabilitySchema(result, definition.outputSchema, 'output')
      } catch {
        throw new LanceeCapabilityError(
          'INVALID_RESULT',
          `${definition.id} returned a result that does not match its declared contract.`,
          502,
        )
      }
      if (invocation.normalizeResult) {
        try {
          normalizedResult = normalizeCapabilityResult(definition.id, result)
          normalizedDiagnostics = normalizedResult.diagnostics
        } catch (error) {
          throw new LanceeCapabilityError('INVALID_RESULT', error.message || `${definition.id} returned an invalid result.`, 502)
        }
      }
      const durationMs = Math.max(0, Math.round(now() - startedAt))
      await recordAudit({
        requestId,
        workspaceId: context.workspace.id,
        userId: context.user.id,
        runId: invocation.runId || null,
        origin: invocation.origin || 'runtime',
        capabilityId: definition.id,
        provider: definition.provider,
        riskLevel: definition.riskLevel,
        status: 'completed',
        durationMs,
        inputHash: inputHash(input),
        artifactIds: Array.isArray(result?.artifacts)
          ? result.artifacts.map((artifact) => artifact?.id).filter(Boolean)
          : [],
        errorCode: null,
        ...normalizedDiagnostics,
      })
      return { result, normalizedResult, requestId, durationMs, definition }
    } catch (error) {
      const durationMs = Math.max(0, Math.round(now() - startedAt))
      const failure = normalizedError(error)
      await recordAudit({
        requestId,
        workspaceId: context.workspace.id,
        userId: context.user.id,
        runId: invocation.runId || null,
        origin: invocation.origin || 'runtime',
        capabilityId: definition.id,
        provider: definition.provider,
        riskLevel: definition.riskLevel,
        status: 'failed',
        durationMs,
        inputHash: inputHash(input),
        artifactIds: [],
        errorCode: failure.code,
        ...normalizedDiagnostics,
      })
      throw error
    } finally {
      clearTimeout(timeout)
      externalSignal?.removeEventListener('abort', cancelExecution)
      const remaining = (activeExecutions.get(concurrencyKey) || 1) - 1
      if (remaining > 0) activeExecutions.set(concurrencyKey, remaining)
      else activeExecutions.delete(concurrencyKey)
    }
  }

  return Object.freeze({
    has(id) {
      return capabilities.has(id)
    },
    get(id) {
      const definition = capabilities.get(id)
      return definition ? publicContract(definition) : null
    },
    list() {
      return [...capabilities.values()].map(publicContract)
    },
    search(query = '', { tags = [], limit = 20 } = {}) {
      const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean)
      const requiredTags = Array.isArray(tags) ? tags.map((tag) => String(tag).toLowerCase()) : []
      return [...capabilities.values()]
        .filter((definition) => definition.enabled)
        .filter((definition) => requiredTags.every((tag) => definition.tags.includes(tag)))
        .map((definition) => {
          const fields = [
            definition.id,
            definition.namespace,
            definition.description,
            definition.provider,
            ...definition.tags,
          ].join(' ').toLowerCase()
          const score = terms.reduce((total, term) => total + (fields.includes(term) ? 1 : 0), 0)
          return { definition, score }
        })
        .filter(({ score }) => terms.length === 0 || score > 0)
        .sort((left, right) => right.score - left.score || left.definition.id.localeCompare(right.definition.id))
        .slice(0, Math.min(100, Math.max(1, Number(limit) || 20)))
        .map(({ definition }) => publicContract(definition))
    },
    async invoke(id, input, context, invocation = {}) {
      return (await execute(id, input, context, invocation)).result
    },
    async invokeNormalized(id, input, context, invocation = {}) {
      try {
        const execution = await execute(id, input, context, { ...invocation, normalizeResult: true })
        const normalized = execution.normalizedResult
        return {
          success: true,
          ok: true,
          data: normalized.data,
          artifacts: normalized.artifacts,
          warnings: normalized.warnings,
          error: null,
          metadata: {
            contractVersion: LANCEE_MCP_RESULT_CONTRACT_VERSION,
            tool: id,
            provider: execution.definition.provider,
            duration: execution.durationMs,
            cost: execution.definition.estimatedCost,
            request_id: execution.requestId,
            ...normalized.diagnostics,
          },
        }
      } catch (error) {
        const failure = normalizedError(error)
        return {
          success: false,
          ok: false,
          data: null,
          artifacts: [],
          warnings: [],
          error: failure,
          metadata: {
            contractVersion: LANCEE_MCP_RESULT_CONTRACT_VERSION,
            tool: id,
            provider: capabilities.get(id)?.provider || null,
            resourceType: null,
            resultCount: 0,
            canonicalIdPresent: false,
            schemaValidationPassed: false,
          },
        }
      }
    },
  })
}
