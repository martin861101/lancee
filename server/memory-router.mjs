import { randomUUID } from 'node:crypto'
import { normalizeTaxonomyValue } from './decision-taxonomy.mjs'
import { recordWorkspaceEvent, WORKSPACE_EVENT_TAXONOMY } from './workspace-events.mjs'

export const MEMORY_ARCHITECTURE_VERSION = 'memory-router-v1'

export const MEMORY_BOUNDARIES = Object.freeze({
  session: Object.freeze([
    'temporary_context',
    'current_context',
    'task_context',
    'conversation_context',
  ]),
  hermes: Object.freeze([
    'user_preference',
    'response_preference',
    'communication_style',
    'approval_preference',
    'working_convention',
  ]),
  lancee: Object.freeze([
    'workspace_event',
    'decision',
    'evidence',
    'outcome',
    'business_fact',
    'organisational_learning',
    'organizational_learning',
  ]),
})

const sessionKinds = new Set(MEMORY_BOUNDARIES.session)
const hermesKinds = new Set(MEMORY_BOUNDARIES.hermes)
const lanceeKinds = new Set(MEMORY_BOUNDARIES.lancee)
const knownWorkspaceEvents = new Set(WORKSPACE_EVENT_TAXONOMY)
const hermesCategories = new Set([
  'response_preference',
  'communication_style',
  'approval_preference',
  'working_convention',
])
const sensitiveKeyPattern = /(?:password|secret|token|authorization|cookie|api[_-]?key|private[_-]?key)/i

export class MemoryRouterError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'MemoryRouterError'
    this.code = code
    this.status = status
  }
}

function trustedScope(context) {
  const workspaceId = String(context?.workspace?.id || '').trim()
  const userId = String(context?.user?.id || '').trim()
  if (!workspaceId || !userId) {
    throw new MemoryRouterError('MEMORY_CONTEXT_REQUIRED', 'Trusted workspace and user context is required.', 401)
  }
  return { workspaceId, userId }
}

function confidence(value) {
  const parsed = Number(value ?? 1)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new MemoryRouterError('INVALID_MEMORY', 'confidence must be from 0 to 1.')
  }
  return parsed
}

function serializeValue(value) {
  const json = JSON.stringify(value)
  if (json === undefined || Buffer.byteLength(json, 'utf8') > 20_000) {
    throw new MemoryRouterError('INVALID_MEMORY', 'Memory value must be bounded JSON.')
  }
  return json
}

function parseValue(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/** Deterministic routing only. Ambiguous input intentionally stays in Session. */
export function routeMemory(input = {}) {
  const explicit = normalizeTaxonomyValue(input.memoryType ?? input.memory_type)
  if (['session', 'hermes', 'lancee'].includes(explicit)) {
    return { destination: explicit, reason: 'explicit_memory_type', version: MEMORY_ARCHITECTURE_VERSION }
  }
  const kind = normalizeTaxonomyValue(input.kind ?? input.type)
  if (sessionKinds.has(kind)) return { destination: 'session', reason: `kind:${kind}`, version: MEMORY_ARCHITECTURE_VERSION }
  if (hermesKinds.has(kind)) return { destination: 'hermes', reason: `kind:${kind}`, version: MEMORY_ARCHITECTURE_VERSION }
  if (lanceeKinds.has(kind)) return { destination: 'lancee', reason: `kind:${kind}`, version: MEMORY_ARCHITECTURE_VERSION }
  const source = normalizeTaxonomyValue(input.source)
  if (['user_preference', 'hermes_preference'].includes(source)) {
    return { destination: 'hermes', reason: `source:${source}`, version: MEMORY_ARCHITECTURE_VERSION }
  }
  if (source === 'workspace_event' || knownWorkspaceEvents.has(String(input.eventType ?? input.event_type ?? ''))) {
    return { destination: 'lancee', reason: 'authoritative_workspace_event', version: MEMORY_ARCHITECTURE_VERSION }
  }
  return { destination: 'session', reason: 'ambiguous_default', version: MEMORY_ARCHITECTURE_VERSION }
}

export function createMemoryRouter({
  database,
  lanceeHandlers = {},
  now = () => new Date(),
} = {}) {
  if (!database?.query) throw new TypeError('The Memory Router requires the Lancee database adapter.')
  const sessions = new Map()

  const timestamp = () => {
    const value = now()
    const date = value instanceof Date ? value : new Date(value)
    if (!Number.isFinite(date.getTime())) throw new TypeError('Memory Router now() returned an invalid date.')
    return date.toISOString()
  }

  function sessionKey(context, sessionId) {
    const { workspaceId, userId } = trustedScope(context)
    const id = String(sessionId || 'current').trim().slice(0, 160) || 'current'
    return `${workspaceId}:${userId}:${id}`
  }

  function rememberSession(context, input, route) {
    const key = sessionKey(context, input.sessionId ?? input.session_id)
    const entries = sessions.get(key) || []
    const entry = {
      id: `smem_${randomUUID().replaceAll('-', '')}`,
      kind: normalizeTaxonomyValue(input.kind ?? input.type) || 'current_context',
      value: input.value,
      route,
      createdAt: timestamp(),
    }
    entries.push(entry)
    sessions.set(key, entries.slice(-100))
    return { destination: 'session', persisted: false, memory: entry }
  }

  async function rememberHermes(context, input, route) {
    const { userId } = trustedScope(context)
    const requestedCategory = normalizeTaxonomyValue(input.category ?? input.kind ?? input.type)
    const category = requestedCategory === 'user_preference' ? 'working_convention' : requestedCategory
    if (!hermesCategories.has(category)) {
      throw new MemoryRouterError(
        'INVALID_HERMES_MEMORY',
        'Hermes memory only accepts stable response, communication, approval, or working preferences.',
      )
    }
    const preferenceKey = normalizeTaxonomyValue(input.key, { required: true, field: 'key' })
    if (sensitiveKeyPattern.test(preferenceKey)) {
      throw new MemoryRouterError('SENSITIVE_MEMORY_REJECTED', 'Credentials and secrets cannot be stored as Hermes preferences.')
    }
    const valueJson = serializeValue(input.value)
    const source = String(input.source || 'user_preference').trim().slice(0, 120)
    const storedConfidence = confidence(input.confidence)
    const updatedAt = timestamp()
    await database.query(
      `INSERT INTO hermes_user_preferences (
         user_id, preference_key, category, value_json, source, confidence,
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, preference_key) DO UPDATE SET
         category = EXCLUDED.category,
         value_json = EXCLUDED.value_json,
         source = EXCLUDED.source,
         confidence = EXCLUDED.confidence,
         updated_at = EXCLUDED.updated_at`,
      [userId, preferenceKey, category, valueJson, source, storedConfidence, updatedAt, updatedAt],
    )
    return {
      destination: 'hermes',
      persisted: true,
      memory: {
        key: preferenceKey,
        category,
        value: input.value,
        source,
        confidence: storedConfidence,
        route,
        updatedAt,
      },
    }
  }

  async function rememberLancee(context, input, route) {
    trustedScope(context)
    const kind = normalizeTaxonomyValue(input.kind ?? input.type) || 'workspace_event'
    if (kind === 'workspace_event') {
      const event = await recordWorkspaceEvent({
        database,
        context,
        ...(input.record || input.value || {}),
      })
      return { destination: 'lancee', persisted: true, resource: event, route }
    }
    const handler = lanceeHandlers[kind]
    if (typeof handler !== 'function') {
      throw new MemoryRouterError(
        'LANCEE_DOMAIN_HANDLER_REQUIRED',
        `${kind} must be stored through its authoritative Lancee domain service.`,
        409,
      )
    }
    const resource = await handler(context, input.value, input)
    return { destination: 'lancee', persisted: true, resource, route }
  }

  async function remember(context, input = {}) {
    trustedScope(context)
    const route = routeMemory(input)
    if (route.destination === 'hermes') return rememberHermes(context, input, route)
    if (route.destination === 'lancee') return rememberLancee(context, input, route)
    return rememberSession(context, input, route)
  }

  function getSessionMemory(context, sessionId = 'current') {
    return [...(sessions.get(sessionKey(context, sessionId)) || [])]
  }

  function clearSessionMemory(context, sessionId = 'current') {
    return sessions.delete(sessionKey(context, sessionId))
  }

  async function getHermesPreferences(context) {
    const { userId } = trustedScope(context)
    const rows = await database.query(
      `SELECT preference_key, category, value_json, source, confidence, created_at, updated_at
       FROM hermes_user_preferences WHERE user_id = $1 ORDER BY preference_key`,
      [userId],
    )
    return rows.map((row) => ({
      key: row.preference_key,
      category: row.category,
      value: parseValue(row.value_json),
      source: row.source,
      confidence: Number(row.confidence),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  return Object.freeze({
    version: MEMORY_ARCHITECTURE_VERSION,
    remember,
    getSessionMemory,
    clearSessionMemory,
    getHermesPreferences,
  })
}
