import { previewWorkflow, validateWorkflowDefinition } from './workflow-builder.mjs'

export const ASSISTANT_RESPONSE_TYPES = Object.freeze([
  'message',
  'workflow_preview',
  'confirmation',
  'error',
  'data',
  'artifact',
])

const RESPONSE_TYPES = new Set(ASSISTANT_RESPONSE_TYPES)
const SENSITIVE_KEYS = /(?:api[_-]?key|authorization|credential|password|prompt|secret|token)/i

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function requestedStructuredText(objective) {
  return /\b(?:show|display|print|return|respond|reply|format|give|provide|write|output)\b[\s\S]{0,40}\b(?:json|code|schema|object|payload)\b|\b(?:json|code)\b[\s\S]{0,24}\b(?:only|format|block|example)\b/i.test(String(objective || ''))
}

function jsonCandidate(value) {
  if (record(value) || Array.isArray(value)) return { parsed: value, structured: true, malformed: false }
  const text = String(value ?? '').trim()
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const candidate = fenced?.[1]?.trim() || text
  const structured = Boolean(fenced) || /^\{\s*["}]|^\[\s*(?:\[|\{|"|\d|true|false|null|-)/.test(candidate)
  if (!structured) return { parsed: null, structured: false, malformed: false }
  try {
    return { parsed: JSON.parse(candidate), structured: true, malformed: false }
  } catch {
    return { parsed: null, structured: true, malformed: true }
  }
}

function safeDebugValue(value, depth = 0) {
  if (depth > 6) return '[truncated]'
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => safeDebugValue(item, depth + 1))
  if (!record(value)) return typeof value === 'string'
    ? value.slice(0, 8_000)
      .replace(/(["']?(?:api[_-]?key|authorization|credential|password|prompt|secret|token)["']?\s*[:=]\s*)(["'][^"']*["']|[^,\s}]+)/gi, '$1[redacted]')
      .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    : value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SENSITIVE_KEYS.test(key))
    .slice(0, 80)
    .map(([key, child]) => [key, safeDebugValue(child, depth + 1)]))
}

function debugMetadata(rawOutput, model, enabled) {
  if (!enabled) return undefined
  return {
    ...(model ? { model: String(model).slice(0, 160) } : {}),
    rawOutput: safeDebugValue(rawOutput),
  }
}

function actions(value) {
  if (!Array.isArray(value)) return undefined
  const normalized = value.slice(0, 8).flatMap((item) => {
    const action = record(item)
    const id = String(action?.id || '').trim().slice(0, 80)
    const label = String(action?.label || '').trim().slice(0, 120)
    if (!id || !label) return []
    const variant = ['primary', 'secondary', 'danger'].includes(action.variant) ? action.variant : undefined
    return [{ id, label, ...(variant ? { variant } : {}), ...(action.payload !== undefined ? { payload: action.payload } : {}) }]
  })
  return normalized.length ? normalized : undefined
}

function canonicalResponse(value, options) {
  const candidate = record(value)
  if (!candidate || !RESPONSE_TYPES.has(candidate.type) || typeof candidate.message !== 'string') return null
  const message = candidate.message.trim()
  const messageJson = jsonCandidate(message)
  return {
    type: candidate.type,
    message: messageJson.structured && !requestedStructuredText(options.objective)
      ? 'I received a structured response. It is available below.'
      : message || 'The assistant completed the request.',
    ...(candidate.data !== undefined ? { data: candidate.data } : {}),
    ...(actions(candidate.actions) ? { actions: actions(candidate.actions) } : {}),
    ...(debugMetadata(options.rawOutput, options.model, options.debug) ? { debug: debugMetadata(options.rawOutput, options.model, options.debug) } : {}),
  }
}

function workflowResponse(workflowValue, parsed, options) {
  let workflow
  try {
    workflow = validateWorkflowDefinition(workflowValue)
  } catch (error) {
    options.log?.('assistant.workflow.invalid', {
      code: error?.code || 'WORKFLOW_INVALID_DEFINITION',
      message: String(error?.message || 'Invalid workflow definition.').slice(0, 500),
      rawOutput: safeDebugValue(options.rawOutput),
    })
    return {
      type: 'error',
      message: 'I could not prepare a safe workflow preview. Please try refining the request.',
      ...(debugMetadata(options.rawOutput, options.model, options.debug) ? { debug: debugMetadata(options.rawOutput, options.model, options.debug) } : {}),
    }
  }
  const assumptions = Array.isArray(parsed?.assumptions) ? parsed.assumptions.map(String) : []
  const warnings = Array.isArray(parsed?.warnings) ? parsed.warnings.map(String) : []
  const preview = options.preview || previewWorkflow(workflow, { assumptions, warnings })
  return {
    type: 'workflow_preview',
    message: "I've prepared the workflow.",
    data: { workflow, preview },
    actions: [
      { id: 'create_workflow', label: 'Create workflow', variant: 'primary', payload: { workflow } },
      { id: 'edit_workflow', label: 'Edit', variant: 'secondary' },
    ],
    ...(debugMetadata(options.rawOutput, options.model, options.debug) ? { debug: debugMetadata(options.rawOutput, options.model, options.debug) } : {}),
  }
}

export function normalizeAssistantError(error, { model, debug = false, log } = {}) {
  const code = String(error?.code || 'ASSISTANT_ERROR').slice(0, 160)
  log?.('assistant.response.error', { code, message: safeDebugValue(String(error?.message || '').slice(0, 500)) })
  return {
    type: 'error',
    message: code === 'APPROVAL_DENIED'
      ? 'The requested action was not approved.'
      : 'I could not complete that request. Please try again.',
    ...(debugMetadata({ code }, model, debug) ? { debug: debugMetadata({ code }, model, debug) } : {}),
  }
}

export function normalizeAssistantResponse(rawOutput, options = {}) {
  const normalizedOptions = { ...options, rawOutput }
  if (options.status && ['failed', 'budget_exceeded'].includes(options.status)) {
    return normalizeAssistantError({ code: options.errorCode }, normalizedOptions)
  }

  const parsedCandidate = jsonCandidate(rawOutput)
  const parsed = parsedCandidate.parsed
  const parsedRecord = record(parsed)
  if (parsedRecord?.type === 'workflow_preview') {
    const canonicalWorkflow = record(parsedRecord.data)?.workflow
    return workflowResponse(canonicalWorkflow, record(parsedRecord.data), normalizedOptions)
  }
  const canonical = canonicalResponse(parsed, normalizedOptions)
  if (canonical) return canonical

  const explicitWorkflow = options.workflow
  const parsedWorkflow = parsedRecord?.workflow || record(parsedRecord?.data)?.workflow
  if (explicitWorkflow || parsedWorkflow) {
    return workflowResponse(explicitWorkflow || parsedWorkflow, parsedRecord, normalizedOptions)
  }

  if (parsedRecord?.status === 'needs_clarification') {
    const questions = Array.isArray(parsedRecord.questions)
      ? parsedRecord.questions.map((item) => String(record(item)?.question || item || '').trim()).filter(Boolean)
      : []
    return {
      type: 'message',
      message: questions.join('\n\n') || 'I need a little more information before I can prepare that workflow.',
      ...(debugMetadata(rawOutput, options.model, options.debug) ? { debug: debugMetadata(rawOutput, options.model, options.debug) } : {}),
    }
  }

  if (options.proposedAction) {
    return {
      type: 'confirmation',
      message: String(options.message || 'Please confirm the action below before I continue.'),
      data: { action: options.proposedAction },
      actions: [
        { id: 'confirm_action', label: 'Confirm', variant: 'primary' },
        { id: 'deny_action', label: 'Deny', variant: 'secondary' },
      ],
      ...(debugMetadata(rawOutput, options.model, options.debug) ? { debug: debugMetadata(rawOutput, options.model, options.debug) } : {}),
    }
  }

  if (parsedCandidate.structured) {
    if (requestedStructuredText(options.objective)) {
      return { type: 'message', message: String(rawOutput).trim() }
    }
    if (parsedCandidate.malformed) {
      options.log?.('assistant.response.malformed', { rawOutput: safeDebugValue(rawOutput) })
      return {
        type: 'error',
        message: 'I could not interpret the assistant response. Please try again.',
        ...(debugMetadata(rawOutput, options.model, options.debug) ? { debug: debugMetadata(rawOutput, options.model, options.debug) } : {}),
      }
    }
    return {
      type: 'data',
      message: 'I received structured data for this request.',
      data: parsed,
      ...(debugMetadata(rawOutput, options.model, options.debug) ? { debug: debugMetadata(rawOutput, options.model, options.debug) } : {}),
    }
  }

  const files = Array.isArray(options.artifacts) ? options.artifacts : []
  if (files.length) {
    return {
      type: 'artifact',
      message: String(rawOutput || 'I created the requested file.'),
      data: { artifacts: files },
      ...(debugMetadata(rawOutput, options.model, options.debug) ? { debug: debugMetadata(rawOutput, options.model, options.debug) } : {}),
    }
  }

  return {
    type: 'message',
    message: String(rawOutput || options.message || 'The assistant completed the request.').trim(),
    ...(debugMetadata(rawOutput, options.model, options.debug) ? { debug: debugMetadata(rawOutput, options.model, options.debug) } : {}),
  }
}
