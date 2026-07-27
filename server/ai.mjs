const PROVIDER_ENDPOINTS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
}

function getAiConfig() {
  const provider = (process.env.AI_PROVIDER || 'openai').trim().toLowerCase()
  const apiKey = (process.env.AI_API_KEY || '').trim()
  const model = (process.env.AI_MODEL || 'gpt-4o').trim()
  const maxTokens = Number.parseInt(process.env.AI_MAX_TOKENS || '2048', 10)
  const temperature = Number.parseFloat(process.env.AI_TEMPERATURE || '0.3')
  const endpointUrl = (process.env.AI_ENDPOINT_URL || '').trim()
  return {
    configured: Boolean(apiKey),
    provider,
    apiKey,
    model,
    maxTokens: Number.isFinite(maxTokens) ? Math.min(8192, Math.max(128, maxTokens)) : 2048,
    temperature: Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : 0.3,
    baseUrl: endpointUrl || PROVIDER_ENDPOINTS[provider] || PROVIDER_ENDPOINTS.openai,
  }
}

export async function completeChat({ messages, systemPrompt }) {
  const config = getAiConfig()
  if (!config.configured) {
    throw new AiError('AI_NOT_CONFIGURED', 'AI provider is not configured.', 503)
  }

  const body = {
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    ],
  }

  const response = await fetch(config.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...(config.provider === 'anthropic' ? { 'anthropic-version': '2023-06-01' } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new AiError('AI_REQUEST_FAILED', `AI request failed: ${text}`, response.status)
  }

  const data = await response.json()
  const content = config.provider === 'anthropic'
    ? data.content?.[0]?.text || ''
    : data.choices?.[0]?.message?.content || ''

  return {
    content,
    model: data.model || config.model,
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  }
}

export function getAiStatus() {
  const config = getAiConfig()
  return {
    configured: config.configured,
    provider: config.provider,
    model: config.model,
  }
}

export class AiError extends Error {
  constructor(code, message, status = 502) {
    super(message)
    this.code = code
    this.status = status
  }
}