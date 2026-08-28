import type { AssistantResponse } from './api'

const RESPONSE_TYPES = new Set(['message', 'workflow_preview', 'confirmation', 'error', 'data', 'artifact'])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function requestedJsonOrCode(objective: string) {
  return /\b(?:show|display|print|return|respond|reply|format|give|provide|write|output)\b[\s\S]{0,40}\b(?:json|code|schema|object|payload)\b|\b(?:json|code)\b[\s\S]{0,24}\b(?:only|format|block|example)\b/i.test(objective)
}

function parseStructuredText(content: string) {
  const text = content.trim()
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const candidate = fenced?.[1]?.trim() || text
  if (!fenced && !/^\{\s*["}]|^\[\s*(?:\[|\{|"|\d|true|false|null|-)/.test(candidate)) return null
  try {
    return { value: JSON.parse(candidate) as unknown, malformed: false }
  } catch {
    return { value: null, malformed: true }
  }
}

export function safeAssistantResponse(value: unknown, content: string, objective = ''): AssistantResponse {
  const candidate = record(value)
  const valid = RESPONSE_TYPES.has(String(candidate.type)) && typeof candidate.message === 'string'
  const response = valid ? candidate as AssistantResponse : null
  const message = response?.message || content
  const structured = parseStructuredText(message)
  if (!structured || requestedJsonOrCode(objective)) return response || { type: 'message', message }
  if (structured.malformed) return { type: 'error', message: 'I could not display that assistant response safely. Please try again.' }
  const parsed = record(structured.value)
  const workflow = record(parsed.workflow || record(parsed.data).workflow)
  if (workflow.version === 1 && typeof workflow.name === 'string' && Array.isArray(workflow.steps)) {
    return {
      type: 'workflow_preview',
      message: "I've prepared the workflow.",
      data: { workflow, preview: parsed.preview },
    }
  }
  return { type: 'data', message: 'I received structured data for this request.', data: structured.value }
}
