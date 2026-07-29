#!/usr/bin/env node

import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'

const clientId = 'lancee-codex-plugin'
const scope = 'ai:invoke'
const baseUrl = String(
  process.env.LANCEE_BASE_URL || 'https://agents.hygridtech.co.za',
).replace(/\/+$/, '')
const dataDirectory =
  process.env.PLUGIN_DATA || join(homedir(), '.lancee-codex')
const statePath = join(dataDirectory, 'device-auth.json')

if (!/^https?:\/\//.test(baseUrl)) {
  throw new Error('LANCEE_BASE_URL must be an HTTP or HTTPS origin.')
}

async function readState() {
  try {
    return JSON.parse(await readFile(statePath, 'utf8'))
  } catch {
    return {}
  }
}

async function saveState(state) {
  await mkdir(dirname(statePath), { recursive: true, mode: 0o700 })
  const temporaryPath = `${statePath}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  })
  await rename(temporaryPath, statePath)
  await chmod(statePath, 0o600)
}

async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(125_000),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(
      payload.error_description || payload.error || `HTTP ${response.status}`,
    )
    error.status = response.status
    error.code = payload.error
    throw error
  }
  return payload
}

function toolResult(value, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    ...(isError ? { isError: true } : {}),
  }
}

async function beginDeviceAuthorization() {
  const authorization = await request('/api/codex/device/code', {
    method: 'POST',
    body: { client_id: clientId, scope },
  })
  await saveState({
    pending: {
      deviceCode: authorization.device_code,
      userCode: authorization.user_code,
      verificationUri: authorization.verification_uri_complete,
      expiresAt: new Date(
        Date.now() + authorization.expires_in * 1000,
      ).toISOString(),
    },
  })
  return {
    connected: false,
    status: 'authorization_required',
    userCode: authorization.user_code,
    verificationUri: authorization.verification_uri_complete,
    instructions:
      'Open verificationUri, sign in to lancee, approve the matching code, then call connect again.',
  }
}

async function connect() {
  const state = await readState()
  if (state.accessToken) {
    try {
      const status = await request('/api/codex/ai/status', {
        token: state.accessToken,
      })
      return {
        connected: true,
        status: 'connected',
        workspace: status.workspace,
        provider: status.provider,
        model: status.model,
        tokenExpiresAt: status.tokenExpiresAt,
      }
    } catch (error) {
      if (error.status !== 401) throw error
      await saveState({})
    }
  }

  if (!state.pending) return beginDeviceAuthorization()
  if (Date.parse(state.pending.expiresAt) <= Date.now()) {
    await saveState({})
    return beginDeviceAuthorization()
  }

  try {
    const token = await request('/api/codex/device/token', {
      method: 'POST',
      body: {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: state.pending.deviceCode,
        client_id: clientId,
      },
    })
    const tokenState = {
      accessToken: token.access_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    }
    await saveState(tokenState)
    const status = await request('/api/codex/ai/status', {
      token: tokenState.accessToken,
    })
    return {
      connected: true,
      status: 'connected',
      workspace: status.workspace,
      provider: status.provider,
      model: status.model,
      tokenExpiresAt: status.tokenExpiresAt,
    }
  } catch (error) {
    if (error.code === 'authorization_pending') {
      return {
        connected: false,
        status: 'authorization_pending',
        userCode: state.pending.userCode,
        verificationUri: state.pending.verificationUri,
        instructions:
          'Approve the matching code in lancee, then call connect again.',
      }
    }
    if (error.code === 'access_denied' || error.code === 'expired_token') {
      await saveState({})
    }
    throw error
  }
}

async function authenticatedState() {
  const state = await readState()
  if (!state.accessToken) {
    return {
      error: toolResult(
        {
          connected: false,
          error: 'not_connected',
          instructions: 'Call connect to begin device authorization.',
        },
        true,
      ),
    }
  }
  return { token: state.accessToken }
}

const tools = [
  {
    name: 'connect',
    title: 'Connect lancee AI',
    description:
      'Start or finish device-code authorization for the lancee AI connector.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, idempotentHint: false },
  },
  {
    name: 'ai_status',
    title: 'Get lancee AI status',
    description:
      'Show the configured AI provider, model, workspace, and connector token expiry.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: 'complete',
    title: 'Complete with lancee AI',
    description:
      'Send a text prompt through the AI provider configured in the authorized lancee workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          minLength: 1,
          maxLength: 20000,
          description: 'The prompt to complete.',
        },
        system_prompt: {
          type: 'string',
          maxLength: 20000,
          description: 'Optional system instruction.',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, idempotentHint: false },
  },
]

async function callTool(name, argumentsValue = {}) {
  if (name === 'connect') {
    try {
      return toolResult(await connect())
    } catch (error) {
      return toolResult(
        { connected: false, error: error.code || 'connection_failed', message: error.message },
        true,
      )
    }
  }

  const auth = await authenticatedState()
  if (auth.error) return auth.error
  try {
    if (name === 'ai_status') {
      return toolResult(
        await request('/api/codex/ai/status', { token: auth.token }),
      )
    }
    if (name === 'complete') {
      const prompt = String(argumentsValue.prompt || '').trim()
      const systemPrompt = String(argumentsValue.system_prompt || '').trim()
      if (!prompt || prompt.length > 20_000 || systemPrompt.length > 20_000) {
        return toolResult(
          { error: 'invalid_arguments', message: 'Prompt input is invalid.' },
          true,
        )
      }
      return toolResult(
        await request('/api/codex/ai/complete', {
          token: auth.token,
          method: 'POST',
          body: {
            messages: [{ role: 'user', content: prompt }],
            ...(systemPrompt ? { systemPrompt } : {}),
          },
        }),
      )
    }
    return toolResult({ error: 'tool_not_found', name }, true)
  } catch (error) {
    if (error.status === 401) await saveState({})
    return toolResult(
      { error: error.code || 'request_failed', message: error.message },
      true,
    )
  }
}

async function handleMessage(message) {
  if (!Object.hasOwn(message, 'id')) return null
  if (message.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'lancee-ai', version: '0.1.0' },
      },
    }
  }
  if (message.method === 'ping') {
    return { jsonrpc: '2.0', id: message.id, result: {} }
  }
  if (message.method === 'tools/list') {
    return { jsonrpc: '2.0', id: message.id, result: { tools } }
  }
  if (message.method === 'tools/call') {
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: await callTool(
        message.params?.name,
        message.params?.arguments || {},
      ),
    }
  }
  return {
    jsonrpc: '2.0',
    id: message.id,
    error: { code: -32601, message: `Method not found: ${message.method}` },
  }
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
for await (const line of lines) {
  if (!line.trim()) continue
  let response
  try {
    response = await handleMessage(JSON.parse(line))
  } catch (error) {
    response = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: error.message || 'Internal error' },
    }
  }
  if (response) process.stdout.write(`${JSON.stringify(response)}\n`)
}
