import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'

const SUPPORTED_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'openai_compatible', 'openai-compatible'])
const NORMALIZED_PROVIDERS = {
  openai: 'openai',
  anthropic: 'anthropic',
  gemini: 'gemini',
  openai_compatible: 'openai_compatible',
  'openai-compatible': 'openai_compatible',
}

export const BYO_PROVIDER_OPTIONS = Object.freeze([
  { id: 'openai', label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'o1-mini'] },
  { id: 'anthropic', label: 'Anthropic', models: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'] },
  { id: 'gemini', label: 'Google Gemini', models: ['gemini-2.0-flash', 'gemini-1.5-pro'] },
  { id: 'openai_compatible', label: 'OpenAI-compatible', models: [] },
])

export class WorkspaceAiError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'WorkspaceAiError'
    this.code = code
    this.status = status
  }
}

function encryptionKey(serverSecret) {
  return createHmac('sha256', serverSecret)
    .update('lancee:workspace-ai:credential-encryption:v1')
    .digest()
}

export function encryptAiSecret(secret, serverSecret) {
  if (!secret) throw new WorkspaceAiError('AI_SECRET_REQUIRED', 'API key is required.', 400)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(serverSecret), iv)
  const ciphertext = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()])
  return JSON.stringify({
    v: 1,
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  })
}

export function decryptAiSecret(encrypted, serverSecret) {
  if (!encrypted) return null
  let payload
  try {
    payload = typeof encrypted === 'string' ? JSON.parse(encrypted) : encrypted
  } catch {
    throw new WorkspaceAiError('AI_SECRET_DECRYPT_FAILED', 'Stored AI credential could not be read.', 500)
  }
  if (!payload?.ciphertext || !payload?.iv || !payload?.tag) {
    throw new WorkspaceAiError('AI_SECRET_DECRYPT_FAILED', 'Stored AI credential is incomplete.', 500)
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(serverSecret), Buffer.from(payload.iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    throw new WorkspaceAiError('AI_SECRET_DECRYPT_FAILED', 'Stored AI credential could not be opened.', 500)
  }
}

export function fingerprintSecret(secret) {
  return createHash('sha256').update(String(secret)).digest('hex').slice(0, 12)
}

export function maskSecret(secret) {
  const value = String(secret || '')
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`
}

export function normalizeProvider(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) throw new WorkspaceAiError('AI_PROVIDER_REQUIRED', 'Select an AI provider.', 400)
  const normalized = NORMALIZED_PROVIDERS[raw]
  if (!normalized || !SUPPORTED_PROVIDERS.has(raw) && !SUPPORTED_PROVIDERS.has(normalized)) {
    throw new WorkspaceAiError('AI_PROVIDER_UNSUPPORTED', `Unsupported AI provider: ${value}. Supported: openai, anthropic, gemini, openai_compatible.`, 400)
  }
  return normalized
}

export function validateProviderConfig(input) {
  const provider = normalizeProvider(input?.provider)
  const apiKey = String(input?.apiKey || input?.api_key || '').trim()
  const model = String(input?.model || '').trim().slice(0, 120)
  const endpointUrl = String(input?.endpointUrl || input?.endpoint_url || '').trim().slice(0, 2048)

  if (!apiKey || apiKey.length < 8 || apiKey.length > 500) {
    throw new WorkspaceAiError('AI_API_KEY_INVALID', 'API key must be between 8 and 500 characters.', 400)
  }
  if (!model || model.length < 2) {
    throw new WorkspaceAiError('AI_MODEL_REQUIRED', 'Model name is required.', 400)
  }
  if (provider === 'openai_compatible') {
    if (!endpointUrl) throw new WorkspaceAiError('AI_ENDPOINT_REQUIRED', 'Endpoint URL is required for OpenAI-compatible providers.', 400)
    let parsed
    try { parsed = new URL(endpointUrl) } catch { throw new WorkspaceAiError('AI_ENDPOINT_INVALID', 'Endpoint URL must be a valid http(s) URL.', 400) }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new WorkspaceAiError('AI_ENDPOINT_INVALID', 'Endpoint URL must use http or https.', 400)
  } else if (endpointUrl) {
    let parsed
    try { parsed = new URL(endpointUrl) } catch { throw new WorkspaceAiError('AI_ENDPOINT_INVALID', 'Endpoint URL must be a valid http(s) URL.', 400) }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new WorkspaceAiError('AI_ENDPOINT_INVALID', 'Endpoint URL must use http or https.', 400)
  }

  return { provider, apiKey, model, endpointUrl: endpointUrl || null }
}

export function sanitizeConfigForResponse(row, serverSecret) {
  if (!row) return { configured: false, provider: null, model: null, endpointUrl: null, maskedKey: null, updatedAt: null }
  let maskedKey = null
  if (row.encrypted_api_key) {
    try {
      const secret = decryptAiSecret(row.encrypted_api_key, serverSecret)
      maskedKey = maskSecret(secret)
    } catch {
      maskedKey = '••••••••'
    }
  }
  return {
    configured: true,
    provider: row.provider,
    model: row.model,
    endpointUrl: row.endpoint_url || null,
    maskedKey,
    keyFingerprint: row.api_key_fingerprint || null,
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null,
  }
}

// BYO AI must remain chat-only – no MCP/tool access
// This helper intentionally does NOT load workspace snapshot, Connected Intelligence, or MCP tools.
export async function completeCustomAiChat({ provider, apiKey, model, endpointUrl, messages, timeoutMs = 30000 }) {
  const normalizedProvider = normalizeProvider(provider)
  const normalizedMessages = validateCustomMessages(messages)

  let url
  let headers = {}
  let body

  if (normalizedProvider === 'anthropic') {
    url = endpointUrl || 'https://api.anthropic.com/v1/messages'
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }
    body = {
      model,
      max_tokens: 2048,
      messages: normalizedMessages.map(m => ({ role: m.role, content: m.content })),
    }
  } else if (normalizedProvider === 'gemini') {
    const base = (endpointUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '').replace(/\/v1beta\/?$/, '').replace(/\/v1\/?$/, '')
    url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
    headers = { 'Content-Type': 'application/json' }
    body = {
      contents: normalizedMessages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
    }
  } else {
    // openai or openai_compatible
    const base = endpointUrl ? String(endpointUrl).replace(/\/+$/, '') : 'https://api.openai.com/v1'
    url = base.endsWith('/chat/completions') ? base : base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }
    body = {
      model,
      messages: normalizedMessages,
      max_tokens: 2048,
      temperature: 0.7,
    }
  }

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.min(30000, Math.max(1000, timeoutMs))),
    })
  } catch (error) {
    if (error?.name === 'TimeoutError') throw new WorkspaceAiError('AI_TIMEOUT', 'Custom AI provider request timed out.', 504)
    throw new WorkspaceAiError('AI_UNREACHABLE', 'Custom AI provider could not be reached.', 502)
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const msg = payload?.error?.message || payload?.error_description || payload?.message || `Custom AI provider returned HTTP ${response.status}.`
    throw new WorkspaceAiError('AI_REQUEST_FAILED', String(msg).slice(0, 500), response.status >= 400 && response.status < 600 ? response.status : 502)
  }

  const data = await response.json().catch(() => { throw new WorkspaceAiError('AI_INVALID_RESPONSE', 'Custom AI provider returned invalid JSON.', 502) })

  let content = ''
  if (normalizedProvider === 'gemini') {
    content = (data.candidates?.[0]?.content?.parts || []).map(p => p?.text || '').join('')
  } else if (normalizedProvider === 'anthropic') {
    content = (data.content || []).map(p => p?.text || '').join('')
  } else {
    content = data.choices?.[0]?.message?.content || ''
  }

  // Never expose tool calls, MCP, or workspace internals for BYO AI
  if (!content) throw new WorkspaceAiError('AI_EMPTY_RESPONSE', 'Custom AI provider returned no text.', 502)

  return {
    content,
    model: data.model || model,
    usage: {
      promptTokens: data.usage?.prompt_tokens || data.usage?.input_tokens || data.usageMetadata?.promptTokenCount || 0,
      completionTokens: data.usage?.completion_tokens || data.usage?.output_tokens || data.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: data.usage?.total_tokens || (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) || data.usageMetadata?.totalTokenCount || 0,
    },
  }
}

function validateCustomMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
    throw new WorkspaceAiError('AI_INVALID_MESSAGES', 'Provide between 1 and 20 messages.', 400)
  }
  return messages.map(m => {
    const role = String(m?.role || '').trim().toLowerCase()
    const content = String(m?.content || '').trim()
    if (!['user', 'assistant'].includes(role) || !content || content.length > 8000) {
      throw new WorkspaceAiError('AI_INVALID_MESSAGES', 'Each message needs user/assistant role and bounded content.', 400)
    }
    return { role, content }
  })
}
