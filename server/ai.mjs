const PROVIDER_ENDPOINTS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com',
}

function normalizedEndpoint(value) {
  return value.replace(/\/+$/, '')
}

function hermesCompletionEndpoint(value) {
  const baseUrl = normalizedEndpoint(value)
  if (baseUrl.endsWith('/chat/completions')) return baseUrl
  if (baseUrl.endsWith('/v1')) return `${baseUrl}/chat/completions`
  return `${baseUrl}/v1/chat/completions`
}

function hermesEndpoint() {
  return (process.env.HERMES_ENDPOINT_URL || process.env.HERMES_API_URL || '').trim()
}

function hermesApiKey() {
  return (process.env.HERMES_API_KEY || process.env.HERMESW_API_KEY || '').trim()
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

function validateTools(tools) {
  if (tools === undefined) return []
  if (!Array.isArray(tools) || tools.length > 64) {
    throw new AiError('AI_INVALID_TOOLS', 'Provide no more than 64 AI tools.', 400)
  }
  const names = new Set()
  return tools.map((tool) => {
    const name = String(tool?.name || '').trim()
    const description = String(tool?.description || '').trim()
    const inputSchema = tool?.inputSchema
    if (
      !/^[a-zA-Z0-9_-]{1,64}$/.test(name) ||
      !description ||
      description.length > 1_000 ||
      !inputSchema ||
      typeof inputSchema !== 'object' ||
      Array.isArray(inputSchema)
    ) {
      throw new AiError('AI_INVALID_TOOLS', 'Each AI tool needs a unique name, description, and input schema.', 400)
    }
    if (names.has(name)) {
      throw new AiError('AI_INVALID_TOOLS', `Duplicate AI tool name: ${name}`, 400)
    }
    names.add(name)
    return { name, description, inputSchema }
  })
}

function geminiSchema(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const schema = {}
  for (const key of ['type', 'description', 'format', 'enum', 'required']) {
    if (value[key] !== undefined) schema[key] = value[key]
  }
  if (value.properties && typeof value.properties === 'object') {
    schema.properties = Object.fromEntries(
      Object.entries(value.properties).map(([key, child]) => [key, geminiSchema(child)]),
    )
  }
  if (value.items) schema.items = geminiSchema(value.items)
  return schema
}

function toolArguments(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    throw new AiError('AI_INVALID_TOOL_CALL', 'AI provider returned invalid tool arguments.', 502)
  }
}

function getProviderConfig(provider, { explicitHermes = false } = {}) {
  const normalizedProvider = String(provider || '').trim().toLowerCase()
  const apiKey = normalizedProvider === 'hermes'
    ? hermesApiKey()
    : (process.env.AI_API_KEY || '').trim()
  const defaultModels = {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-latest',
    gemini: 'gemini-2.0-flash',
    hermes: 'hermes-agent',
  }
  const model = (
    normalizedProvider === 'hermes'
      ? (explicitHermes ? process.env.AI_MODEL : process.env.HERMES_MODEL) || defaultModels.hermes
      : process.env.AI_MODEL || defaultModels[normalizedProvider] || ''
  ).trim()
  const maxTokens = Number.parseInt(process.env.AI_MAX_TOKENS || '2048', 10)
  const temperature = Number.parseFloat(process.env.AI_TEMPERATURE || '0.3')
  const endpointUrl = normalizedProvider === 'hermes'
    ? hermesEndpoint()
    : (process.env.AI_ENDPOINT_URL || '').trim()
  const timeoutMilliseconds = Number.parseInt(process.env.AI_TIMEOUT_MS || '30000', 10)
  if (!['openai', 'anthropic', 'gemini', 'hermes'].includes(normalizedProvider)) {
    return {
      configured: false,
      provider: normalizedProvider,
      model,
      configurationError: `Unsupported AI provider: ${normalizedProvider}`,
    }
  }
  return {
    configured: Boolean(apiKey && model && (normalizedProvider !== 'hermes' || endpointUrl)),
    provider: normalizedProvider,
    apiKey,
    model,
    maxTokens: Number.isFinite(maxTokens) ? Math.min(8192, Math.max(128, maxTokens)) : 2048,
    temperature: Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : 0.3,
    baseUrl:
      normalizedProvider === 'hermes'
        ? hermesCompletionEndpoint(endpointUrl)
        : normalizedEndpoint(
            endpointUrl || PROVIDER_ENDPOINTS[normalizedProvider] || PROVIDER_ENDPOINTS.openai,
          ),
    timeoutMilliseconds: Number.isFinite(timeoutMilliseconds)
      ? Math.min(120_000, Math.max(1_000, timeoutMilliseconds))
      : 30_000,
    configurationError: null,
  }
}

function getAiConfig() {
  const explicitProvider = (process.env.AI_PROVIDER || '').trim().toLowerCase()
  const provider = explicitProvider || (hermesEndpoint() ? 'hermes' : 'openai')
  const primary = getProviderConfig(provider, { explicitHermes: provider === 'hermes' })
  const fallback = provider !== 'hermes' && hermesEndpoint() && hermesApiKey()
    ? getProviderConfig('hermes')
    : null
  return { ...primary, fallback }
}

async function completeWithProvider(config, normalizedMessages, normalizedSystemPrompt, tools) {

  let url = config.baseUrl
  let headers
  let body

  if (config.provider === 'gemini') {
    const baseUrl = config.baseUrl.replace(/\/v1beta\/?$/, '').replace(/\/v1\/?$/, '')
    url = `${baseUrl}/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`
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
      ...(tools.length
        ? {
            tools: [{
              functionDeclarations: tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parameters: geminiSchema(tool.inputSchema),
              })),
            }],
          }
        : {}),
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
      ...(tools.length
        ? {
            tools: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.inputSchema,
            })),
          }
        : {}),
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
      ...(tools.length
        ? {
            tools: tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema,
              },
            })),
            tool_choice: 'auto',
          }
        : {}),
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
  const toolCall = config.provider === 'gemini'
    ? (() => {
        const part = (data.candidates?.[0]?.content?.parts || []).find((item) => item?.functionCall)
        return part?.functionCall
          ? { name: String(part.functionCall.name || ''), arguments: toolArguments(part.functionCall.args) }
          : null
      })()
    : config.provider === 'anthropic'
      ? (() => {
          const block = (data.content || []).find((item) => item?.type === 'tool_use')
          return block
            ? { name: String(block.name || ''), arguments: toolArguments(block.input) }
            : null
        })()
      : (() => {
          const call = (data.choices?.[0]?.message?.tool_calls || []).find(
            (item) => item?.type === 'function' && item?.function,
          )
          return call
            ? { name: String(call.function.name || ''), arguments: toolArguments(call.function.arguments) }
            : null
        })()
  if (!content && !toolCall?.name) {
    throw new AiError('AI_EMPTY_RESPONSE', 'AI provider returned neither text nor a tool call.', 502)
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
    toolCall,
    model: data.model || config.model,
    usage,
  }
}

export async function completeChat({ messages, systemPrompt, tools }) {
  const config = getAiConfig()
  const candidates = [config, config.fallback].filter((candidate) => candidate?.configured)
  if (candidates.length === 0) {
    throw new AiError(
      'AI_NOT_CONFIGURED',
      config.configurationError || 'AI provider is not configured.',
      503,
    )
  }
  const normalizedMessages = validateMessages(messages)
  const normalizedTools = validateTools(tools)
  const normalizedSystemPrompt = String(systemPrompt || '').trim()
  if (normalizedSystemPrompt.length > 20_000) {
    throw new AiError('AI_INVALID_SYSTEM_PROMPT', 'System prompt is too long.', 400)
  }

  let lastError = null
  for (const candidate of candidates) {
    try {
      return await completeWithProvider(
        candidate,
        normalizedMessages,
        normalizedSystemPrompt,
        normalizedTools,
      )
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new AiError('AI_REQUEST_FAILED', 'AI provider request failed.', 502)
}

export function getAiStatus() {
  const config = getAiConfig()
  return {
    configured: config.configured || Boolean(config.fallback?.configured),
    provider: config.provider,
    model: config.model,
    fallbackProvider: config.fallback?.provider || null,
    fallbackConfigured: Boolean(config.fallback?.configured),
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
