import assert from 'node:assert/strict'
import { completeChat } from '../server/ai.mjs'

const originalFetch = globalThis.fetch
const originalEnvironment = {
  provider: process.env.AI_PROVIDER,
  apiKey: process.env.AI_API_KEY,
  model: process.env.AI_MODEL,
  endpoint: process.env.AI_ENDPOINT_URL,
  hermesUrl: process.env.HERMES_API_URL,
  hermesKey: process.env.HERMESW_API_KEY,
}

const calls = []
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body)
  calls.push({ url: String(url), headers: init.headers, body })
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

  process.env.AI_PROVIDER = 'hermes'
  process.env.AI_MODEL = ''
  process.env.HERMES_API_URL = 'https://hermes.example'
  process.env.HERMESW_API_KEY = 'hermes-test-key'
  const hermes = await completeChat({
    systemPrompt: 'Manage this workspace.',
    messages: [{ role: 'user', content: 'Summarize this client.' }],
  })
  assert.equal(hermes.content, 'OpenAI ready')
  assert.equal(calls[3].url, 'https://hermes.example/v1/chat/completions')
  assert.equal(calls[3].headers.Authorization, 'Bearer hermes-test-key')
  assert.equal(calls[3].body.model, 'hermes-agent')

  await assert.rejects(
    completeChat({ messages: [] }),
    (error) => error.code === 'AI_INVALID_MESSAGES' && error.status === 400,
  )

  console.log(
    'AI providers verified: OpenAI, Anthropic, Gemini, and Hermes authentication, request formats, response parsing, usage, and validation.',
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
  restore('HERMES_API_URL', originalEnvironment.hermesUrl)
  restore('HERMESW_API_KEY', originalEnvironment.hermesKey)
}
