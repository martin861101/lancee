const MAX_RESPONSE_BYTES = 1_048_576

export class OpenConnectorAdapterError extends Error {
  constructor(code, message, status = 502, { retryable = false, upstreamCode = null } = {}) {
    super(message)
    this.name = 'OpenConnectorAdapterError'
    this.code = code
    this.status = status
    this.retryable = retryable
    this.upstreamCode = upstreamCode
  }
}

function configuredTimeout(env) {
  const value = Number.parseInt(env.OPENCONNECTOR_TIMEOUT_MS || '10000', 10)
  return Number.isFinite(value) ? Math.min(30_000, Math.max(500, value)) : 10_000
}

function normalizeBaseUrl(value) {
  const url = new URL(String(value || 'http://openconnector:3000'))
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('OPENCONNECTOR_URL must be an HTTP(S) origin without credentials, query, or fragment.')
  }
  return url.toString().replace(/\/$/, '')
}

function normalizedFailure(status, upstreamCode) {
  if (status === 401 || status === 403) return ['INTEGRATION_PERMISSION_DENIED', 403, false]
  if (upstreamCode === 'connection_not_found') return ['INTEGRATION_NOT_CONNECTED', 404, false]
  if (status === 404) return ['INTEGRATION_ACTION_NOT_FOUND', 404, false]
  if (status === 409 && ['oauth_token_expired', 'oauth_refresh_unavailable'].includes(upstreamCode)) {
    return ['INTEGRATION_AUTH_EXPIRED', 409, false]
  }
  if (status === 429) return ['INTEGRATION_RATE_LIMITED', 429, true]
  if (status === 400 && /scope/i.test(String(upstreamCode))) return ['INTEGRATION_SCOPE_REQUIRED', 409, false]
  if (status === 400) return ['INTEGRATION_INVALID_INPUT', 400, false]
  if (status >= 500) return ['INTEGRATION_PROVIDER_ERROR', 502, true]
  return ['INTEGRATION_PROVIDER_ERROR', 502, false]
}

function wait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new OpenConnectorAdapterError('INTEGRATION_GATEWAY_UNAVAILABLE', 'The integration gateway request was cancelled.', 503))
    }, { once: true })
  })
}

export function createOpenConnectorAdapter({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const enabled = env.OPENCONNECTOR_ENABLED === 'true'
  const baseUrl = enabled
    ? normalizeBaseUrl(env.OPENCONNECTOR_URL)
    : 'http://openconnector:3000'
  const runtimeToken = String(env.OPENCONNECTOR_RUNTIME_TOKEN || '').trim()
  const adminToken = String(env.OPENCONNECTOR_ADMIN_TOKEN || '').trim()
  const timeoutMs = configuredTimeout(env)

  async function request(path, {
    method = 'GET',
    body,
    admin = false,
    signal,
    idempotencyKey,
    retries = method === 'GET' ? 2 : 0,
  } = {}) {
    if (!enabled) {
      throw new OpenConnectorAdapterError('INTEGRATION_GATEWAY_UNAVAILABLE', 'External integrations are disabled.', 503)
    }
    const token = admin ? adminToken : runtimeToken
    const headers = { Accept: 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetchImpl(`${baseUrl}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        })
        const raw = await response.text()
        if (Buffer.byteLength(raw) > MAX_RESPONSE_BYTES) {
          throw new OpenConnectorAdapterError('INTEGRATION_PROVIDER_ERROR', 'The integration gateway response was too large.', 502)
        }
        let payload = null
        try {
          payload = raw ? JSON.parse(raw) : null
        } catch {
          throw new OpenConnectorAdapterError('INTEGRATION_PROVIDER_ERROR', 'The integration gateway returned an invalid response.', 502)
        }
        if (response.ok) return payload

        const upstreamCode = payload?.errorCode || payload?.error?.code || 'provider_error'
        const [code, status, retryable] = normalizedFailure(response.status, upstreamCode)
        const error = new OpenConnectorAdapterError(
          code,
          String(payload?.message || payload?.error?.message || 'The integration provider request failed.').slice(0, 500),
          status,
          { retryable, upstreamCode },
        )
        if (!retryable || attempt === retries) throw error
      } catch (error) {
        if (error instanceof OpenConnectorAdapterError && (!error.retryable || attempt === retries)) throw error
        if (attempt === retries) {
          const timedOut = error?.name === 'AbortError' && !signal?.aborted
          throw new OpenConnectorAdapterError(
            'INTEGRATION_GATEWAY_UNAVAILABLE',
            timedOut ? 'The integration gateway timed out.' : 'The integration gateway is unavailable.',
            timedOut ? 504 : 503,
            { retryable: true },
          )
        }
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
      await wait(Math.min(1_000, 150 * (2 ** attempt)), signal)
    }
    throw new OpenConnectorAdapterError('INTEGRATION_GATEWAY_UNAVAILABLE', 'The integration gateway is unavailable.', 503)
  }

  function runtimeData(payload) {
    if (!payload || payload.success !== true || !Object.hasOwn(payload, 'data')) {
      throw new OpenConnectorAdapterError('INTEGRATION_PROVIDER_ERROR', 'The integration gateway returned an invalid envelope.', 502)
    }
    return payload.data
  }

  return Object.freeze({
    enabled,
    baseUrl,
    timeoutMs,
    async health(options = {}) {
      const startedAt = performance.now()
      try {
        const data = runtimeData(await request('/v1/health', { ...options, retries: 0 }))
        return { status: data?.ok ? 'healthy' : 'degraded', latencyMs: Math.round(performance.now() - startedAt) }
      } catch (error) {
        return {
          status: enabled ? 'unavailable' : 'disabled',
          latencyMs: Math.round(performance.now() - startedAt),
          error: error.code || 'INTEGRATION_GATEWAY_UNAVAILABLE',
        }
      }
    },
    async listProviders(options = {}) {
      return runtimeData(await request('/v1/providers', options))
    },
    async listConnections(provider, options = {}) {
      const path = provider
        ? `/v1/apps/services/${encodeURIComponent(provider)}`
        : '/v1/apps'
      return runtimeData(await request(path, options))
    },
    async searchActions({ query, provider, limit }, options = {}) {
      const params = new URLSearchParams({ q: query, limit: String(limit) })
      if (provider) params.set('service', provider)
      return runtimeData(await request(`/v1/actions/search?${params}`, options))
    },
    async describeAction(actionId, options = {}) {
      return runtimeData(await request(`/v1/actions/${encodeURIComponent(actionId)}`, options))
    },
    async executeAction({ actionId, connectionName, input, idempotencyKey, retry }, options = {}) {
      const payload = await request(`/v1/actions/${encodeURIComponent(actionId)}`, {
        ...options,
        method: 'POST',
        body: { input, connectionName },
        idempotencyKey,
        retries: retry ? 1 : 0,
      })
      return { data: runtimeData(payload), meta: payload.meta || {} }
    },
    async startOAuth({ provider, connectionName }, options = {}) {
      return await request('/api/oauth/authorizations', {
        ...options,
        method: 'POST',
        admin: true,
        body: { service: provider, connectionName },
      })
    },
    async completeOAuthCallback(search = '', { signal } = {}) {
      if (!enabled) throw new OpenConnectorAdapterError('INTEGRATION_GATEWAY_UNAVAILABLE', 'External integrations are disabled.', 503)
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetchImpl(`${baseUrl}/oauth/callback${String(search).startsWith('?') ? search : ''}`, {
          headers: { Accept: 'text/html' },
          signal: controller.signal,
          redirect: 'manual',
        })
        const body = await response.text()
        if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) {
          throw new OpenConnectorAdapterError('INTEGRATION_PROVIDER_ERROR', 'The OAuth callback response was too large.', 502)
        }
        return {
          status: response.status,
          contentType: response.headers.get('content-type') || 'text/html; charset=utf-8',
          location: response.headers.get('location'),
          body,
        }
      } catch (error) {
        if (error instanceof OpenConnectorAdapterError) throw error
        throw new OpenConnectorAdapterError('INTEGRATION_GATEWAY_UNAVAILABLE', 'The integration OAuth callback is unavailable.', 503)
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
    },
    async disconnect({ provider, connectionName }, options = {}) {
      return await request(`/api/connections/${encodeURIComponent(provider)}`, {
        ...options,
        method: 'DELETE',
        admin: true,
        body: { connectionName },
      })
    },
  })
}
