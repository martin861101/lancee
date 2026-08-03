import assert from 'node:assert/strict'
import { completeChat } from '../server/ai.mjs'

const originalFetch = globalThis.fetch
const originalEnvironment = {
  provider: process.env.AI_PROVIDER,
  apiKey: process.env.AI_API_KEY,
  model: process.env.AI_MODEL,
  endpoint: process.env.AI_ENDPOINT_URL,
  hermesEndpoint: process.env.HERMES_ENDPOINT_URL,
  hermesKey: process.env.HERMES_API_KEY,
  hermesModel: process.env.HERMES_MODEL,
  legacyHermesUrl: process.env.HERMES_API_URL,
  legacyHermesKey: process.env.HERMESW_API_KEY,
}

const calls = []
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body)
  calls.push({ url: String(url), headers: init.headers, body })
  if (body.tools?.length && process.env.AI_PROVIDER === 'anthropic') {
    return new Response(JSON.stringify({
      model: process.env.AI_MODEL,
      content: [{ type: 'tool_use', id: 'toolu_test', name: 'create_workflow', input: { name: 'Provider workflow' } }],
      usage: { input_tokens: 8, output_tokens: 4 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  if (body.tools?.length && process.env.AI_PROVIDER === 'gemini') {
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ functionCall: { name: 'create_workflow', args: { name: 'Provider workflow' } } }] } }],
      usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 4, totalTokenCount: 12 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  if (body.tools?.length) {
    return new Response(JSON.stringify({
      model: process.env.AI_MODEL,
      choices: [{ message: { content: null, tool_calls: [{ id: 'call_test', type: 'function', function: { name: 'create_workflow', arguments: '{"name":"Provider workflow"}' } }] } }],
      usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  if (String(url) === 'https://primary-fail.example') {
    return new Response(JSON.stringify({ error: { message: 'Primary unavailable' } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (String(url).includes('hermes.example')) {
    return new Response(JSON.stringify({
      model: 'hermes-agent',
      choices: [{ message: { content: 'Hermes ready' } }],
      usage: { prompt_tokens: 6, completion_tokens: 3, total_tokens: 9 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  if (process.env.AI_PROVIDER === 'anthropic') {
    return new Response(JSON.stringify({
      model: process.env.AI_MODEL,
      content: [{ type: 'text', text: 'Anthropic ready' }],
      usage: { input_tokens: 4, output_tokens: 2 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  if (process.env.AI_PROVIDER === 'gemini') {
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Gemini ready' }] } }],
      usageMetadata: {
        promptTokenCount: 3,
        candidatesTokenCount: 2,
        totalTokenCount: 5,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({
    model: process.env.AI_MODEL,
    choices: [{ message: { content: 'OpenAI ready' } }],
    usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

try {
  process.env.AI_API_KEY = 'provider-test-key'
  process.env.AI_ENDPOINT_URL = 'https://stub.example'

  process.env.AI_PROVIDER = 'openai'
  process.env.AI_MODEL = 'openai-test-model'
  const openai = await completeChat({
    systemPrompt: 'Be concise.',
    messages: [{ role: 'user', content: 'Test OpenAI.' }],
  })
  assert.equal(openai.content, 'OpenAI ready')
  assert.equal(calls[0].url, 'https://stub.example')
  assert.equal(calls[0].headers.Authorization, 'Bearer provider-test-key')
  assert.equal(calls[0].body.messages[0].role, 'system')

  process.env.AI_PROVIDER = 'anthropic'
  process.env.AI_MODEL = 'anthropic-test-model'
  const anthropic = await completeChat({
    systemPrompt: 'Be concise.',
    messages: [{ role: 'user', content: 'Test Anthropic.' }],
  })
  assert.equal(anthropic.content, 'Anthropic ready')
  assert.equal(calls[1].headers['x-api-key'], 'provider-test-key')
  assert.equal(calls[1].body.system, 'Be concise.')
  assert.equal(calls[1].body.messages.length, 1)

  process.env.AI_PROVIDER = 'gemini'
  process.env.AI_MODEL = 'gemini-test-model'
  const gemini = await completeChat({
    systemPrompt: 'Be concise.',
    messages: [{ role: 'assistant', content: 'Previous answer.' }],
  })
  assert.equal(gemini.content, 'Gemini ready')
  assert.match(calls[2].url, /gemini-test-model:generateContent\?key=provider-test-key$/)
  assert.equal(calls[2].body.contents[0].role, 'model')
  assert.equal(gemini.usage.totalTokens, 5)

  process.env.AI_ENDPOINT_URL = 'https://stub.example/v1beta'
  const geminiWithVersionedEndpoint = await completeChat({
    messages: [{ role: 'user', content: 'Test versioned endpoint.' }],
  })
  assert.equal(geminiWithVersionedEndpoint.content, 'Gemini ready')
  assert.equal(
    calls[3].url,
    'https://stub.example/v1beta/models/gemini-test-model:generateContent?key=provider-test-key',
  )

  process.env.AI_PROVIDER = 'hermes'
  process.env.AI_MODEL = ''
  process.env.HERMES_ENDPOINT_URL = 'https://hermes.example'
  process.env.HERMES_API_KEY = 'hermes-test-key'
  delete process.env.HERMES_API_URL
  delete process.env.HERMESW_API_KEY
  const hermes = await completeChat({
    systemPrompt: 'Manage this workspace.',
    messages: [{ role: 'user', content: 'Summarize this client.' }],
  })
  assert.equal(hermes.content, 'Hermes ready')
  assert.equal(calls[4].url, 'https://hermes.example/v1/chat/completions')
  assert.equal(calls[4].headers.Authorization, 'Bearer hermes-test-key')
  assert.equal(calls[4].body.model, 'hermes-agent')

  process.env.AI_PROVIDER = 'openai'
  process.env.AI_API_KEY = 'primary-test-key'
  process.env.AI_MODEL = 'primary-test-model'
  process.env.AI_ENDPOINT_URL = 'https://primary-fail.example'
  const fallbackStart = calls.length
  const fallback = await completeChat({
    messages: [{ role: 'user', content: 'Use the fallback.' }],
  })
  assert.equal(fallback.content, 'Hermes ready')
  assert.equal(calls[fallbackStart].url, 'https://primary-fail.example')
  assert.equal(calls[fallbackStart + 1].url, 'https://hermes.example/v1/chat/completions')

  const tools = [{
    name: 'create_workflow',
    description: 'Create a workflow after user approval.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    },
  }]

  process.env.AI_PROVIDER = 'openai'
  process.env.AI_API_KEY = 'provider-test-key'
  process.env.AI_MODEL = 'openai-test-model'
  process.env.AI_ENDPOINT_URL = 'https://stub.example'
  const openaiToolStart = calls.length
  const openaiTool = await completeChat({
    messages: [{ role: 'user', content: 'Create a workflow.' }],
    tools,
  })
  assert.deepEqual(openaiTool.toolCall, {
    name: 'create_workflow',
    arguments: { name: 'Provider workflow' },
  })
  assert.equal(calls[openaiToolStart].body.tools[0].function.name, 'create_workflow')

  process.env.AI_PROVIDER = 'anthropic'
  process.env.AI_MODEL = 'anthropic-test-model'
  const anthropicToolStart = calls.length
  const anthropicTool = await completeChat({
    messages: [{ role: 'user', content: 'Create a workflow.' }],
    tools,
  })
  assert.equal(anthropicTool.toolCall.name, 'create_workflow')
  assert.equal(calls[anthropicToolStart].body.tools[0].input_schema.type, 'object')

  process.env.AI_PROVIDER = 'gemini'
  process.env.AI_MODEL = 'gemini-test-model'
  const geminiToolStart = calls.length
  const geminiTool = await completeChat({
    messages: [{ role: 'user', content: 'Create a workflow.' }],
    tools,
  })
  assert.equal(geminiTool.toolCall.name, 'create_workflow')
  assert.equal(calls[geminiToolStart].body.tools[0].functionDeclarations[0].name, 'create_workflow')
  assert.equal(
    Object.hasOwn(calls[geminiToolStart].body.tools[0].functionDeclarations[0].parameters, 'additionalProperties'),
    false,
  )

  await assert.rejects(
    completeChat({ messages: [] }),
    (error) => error.code === 'AI_INVALID_MESSAGES' && error.status === 400,
  )

  console.log(
    'AI providers verified: OpenAI, Anthropic, Gemini, and Hermes authentication, native tool calls, request formats, response parsing, usage, and validation.',
  )
} finally {
  globalThis.fetch = originalFetch
  const restore = (key, value) => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  restore('AI_PROVIDER', originalEnvironment.provider)
  restore('AI_API_KEY', originalEnvironment.apiKey)
  restore('AI_MODEL', originalEnvironment.model)
  restore('AI_ENDPOINT_URL', originalEnvironment.endpoint)
  restore('HERMES_ENDPOINT_URL', originalEnvironment.hermesEndpoint)
  restore('HERMES_API_KEY', originalEnvironment.hermesKey)
  restore('HERMES_MODEL', originalEnvironment.hermesModel)
  restore('HERMES_API_URL', originalEnvironment.legacyHermesUrl)
  restore('HERMESW_API_KEY', originalEnvironment.legacyHermesKey)
}
