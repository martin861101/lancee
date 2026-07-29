const PROVIDER_ENDPOINTS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com',
}

function normalizedEndpoint(value) {
  return value.replace(/\/+$/, '')
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) {
    throw new AiError('AI_INVALID_MESSAGES', 'Provide between 1 and 50 messages.', 400)
  }
  return messages.map((message) => {
    const role = String(message?.role || '').trim().toLowerCase()
    const content = String(message?.content || '').trim()
    if (!['user', 'assistant'].includes(role) || !content || content.length > 20_000) {
      throw new AiError(
        'AI_INVALID_MESSAGES',
        'Each message needs a user or assistant role and bounded text content.',
        400,
      )
    }
    return { role, content }
  })
}

function getAiConfig() {
  const provider = (process.env.AI_PROVIDER || 'openai').trim().toLowerCase()
  const apiKey = (process.env.AI_API_KEY || '').trim()
  const defaultModels = {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-latest',
    gemini: 'gemini-2.0-flash',
  }
  const model = (process.env.AI_MODEL || defaultModels[provider] || '').trim()
  const maxTokens = Number.parseInt(process.env.AI_MAX_TOKENS || '2048', 10)
  const temperature = Number.parseFloat(process.env.AI_TEMPERATURE || '0.3')
  const endpointUrl = (process.env.AI_ENDPOINT_URL || '').trim()
  const timeoutMilliseconds = Number.parseInt(process.env.AI_TIMEOUT_MS || '30000', 10)
  if (!['openai', 'anthropic', 'gemini'].includes(provider)) {
    return {
      configured: false,
      provider,
      model,
      configurationError: `Unsupported AI provider: ${provider}`,
    }
  }
  return {
    configured: Boolean(apiKey && model),
    provider,
    apiKey,
    model,
    maxTokens: Number.isFinite(maxTokens) ? Math.min(8192, Math.max(128, maxTokens)) : 2048,
    temperature: Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : 0.3,
    baseUrl: normalizedEndpoint(
      endpointUrl || PROVIDER_ENDPOINTS[provider] || PROVIDER_ENDPOINTS.openai,
    ),
    timeoutMilliseconds: Number.isFinite(timeoutMilliseconds)
      ? Math.min(120_000, Math.max(1_000, timeoutMilliseconds))
      : 30_000,
    configurationError: null,
  }
}

export async function completeChat({ messages, systemPrompt }) {
  const config = getAiConfig()
  if (!config.configured) {
    throw new AiError(
      'AI_NOT_CONFIGURED',
      config.configurationError || 'AI provider is not configured.',
      503,
    )
  }
  const normalizedMessages = validateMessages(messages)
  const normalizedSystemPrompt = String(systemPrompt || '').trim()
  if (normalizedSystemPrompt.length > 20_000) {
    throw new AiError('AI_INVALID_SYSTEM_PROMPT', 'System prompt is too long.', 400)
  }

  let url = config.baseUrl
  let headers
  let body

  if (config.provider === 'gemini') {
    url = `${config.baseUrl}/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`
    headers = { 'Content-Type': 'application/json' }
    body = {
      ...(normalizedSystemPrompt
        ? { systemInstruction: { parts: [{ text: normalizedSystemPrompt }] } }
        : {}),
      contents: normalizedMessages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
      generationConfig: {
        maxOutputTokens: config.maxTokens,
        temperature: config.temperature,
      },
    }
  } else if (config.provider === 'anthropic') {
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    }
    body = {
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      ...(normalizedSystemPrompt ? { system: normalizedSystemPrompt } : {}),
      messages: normalizedMessages,
    }
  } else {
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    }
    body = {
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      messages: [
        ...(normalizedSystemPrompt
          ? [{ role: 'system', content: normalizedSystemPrompt }]
          : []),
        ...normalizedMessages,
      ],
    }
  }

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMilliseconds),
    })
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      throw new AiError('AI_TIMEOUT', 'AI provider request timed out.', 504)
    }
    throw new AiError('AI_UNREACHABLE', 'AI provider could not be reached.', 502)
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const providerMessage =
      payload?.error?.message ||
      payload?.error_description ||
      payload?.message ||
      `AI provider returned HTTP ${response.status}.`
    throw new AiError(
      'AI_REQUEST_FAILED',
      String(providerMessage).slice(0, 500),
      response.status >= 400 && response.status < 600 ? response.status : 502,
    )
  }

  const data = await response.json().catch(() => {
    throw new AiError('AI_INVALID_RESPONSE', 'AI provider returned invalid JSON.', 502)
  })
  const content =
    config.provider === 'gemini'
      ? (data.candidates?.[0]?.content?.parts || [])
          .map((part) => part?.text || '')
          .join('')
      : config.provider === 'anthropic'
        ? (data.content || []).map((part) => part?.text || '').join('')
        : data.choices?.[0]?.message?.content || ''
  if (!content) {
    throw new AiError('AI_EMPTY_RESPONSE', 'AI provider returned no text.', 502)
  }

  const usage =
    config.provider === 'gemini'
      ? {
          promptTokens: data.usageMetadata?.promptTokenCount || 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: data.usageMetadata?.totalTokenCount || 0,
        }
      : config.provider === 'anthropic'
        ? {
            promptTokens: data.usage?.input_tokens || 0,
            completionTokens: data.usage?.output_tokens || 0,
            totalTokens:
              (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
          }
        : {
            promptTokens: data.usage?.prompt_tokens || 0,
            completionTokens: data.usage?.completion_tokens || 0,
            totalTokens: data.usage?.total_tokens || 0,
          }

  return {
    content,
    model: data.model || config.model,
    usage,
  }
}

export function getAiStatus() {
  const config = getAiConfig()
  return {
    configured: config.configured,
    provider: config.provider,
    model: config.model,
    error: config.configurationError,
  }
}

export class AiError extends Error {
  constructor(code, message, status = 502) {
    super(message)
    this.code = code
    this.status = status
  }
}
