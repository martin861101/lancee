import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export class N8nError extends Error {
  constructor(code, message, status = 502, details = {}) {
    super(message)
    this.code = code
    this.status = status
    Object.assign(this, details)
  }
}

function safeEqualHex(left, right) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

function privateIpv4(address) {
  const octets = address.split('.').map(Number)
  return (
    octets[0] === 0 ||
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
    octets[0] >= 224
  )
}

function privateIpv6(address) {
  const normalized = address.toLowerCase()
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff')
  )
}

function isPrivateAddress(address) {
  const version = isIP(address)
  return version === 4
    ? privateIpv4(address)
    : version === 6
      ? privateIpv6(address)
      : true
}

function encryptionKey(serverSecret) {
  return createHmac('sha256', serverSecret)
    .update('lancee:n8n:credential-encryption:v1')
    .digest()
}

export function encryptN8nSecret(secret, serverSecret) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(serverSecret), iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return {
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  }
}

export function decryptN8nSecret(encrypted, serverSecret) {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(serverSecret),
    Buffer.from(encrypted.iv, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64url'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}

export function hashBody(body) {
  return createHash('sha256').update(body).digest('hex')
}

export function canonicalN8nRequest({
  timestamp,
  nonce,
  method,
  path,
  bodyHash,
}) {
  return [timestamp, nonce, method.toUpperCase(), path, bodyHash].join('\n')
}

export function signN8nRequest({ secret, ...request }) {
  return createHmac('sha256', secret)
    .update(canonicalN8nRequest(request))
    .digest('hex')
}

export function verifyN8nRequest({ secret, signature, ...request }) {
  if (!signature) return false
  return safeEqualHex(signN8nRequest({ secret, ...request }), String(signature))
}

export function validateN8nTimestamp(timestamp, now = Date.now()) {
  if (!/^\d{10,13}$/.test(String(timestamp))) return false
  const numeric = Number(timestamp)
  const milliseconds = String(timestamp).length === 10 ? numeric * 1000 : numeric
  return Math.abs(now - milliseconds) <= 5 * 60 * 1000
}

export async function validateN8nWebhookUrl({
  value,
  allowedBaseUrl,
  allowInsecure = false,
  allowPrivate = false,
}) {
  let target
  let allowed
  try {
    target = new URL(value)
    allowed = new URL(allowedBaseUrl)
  } catch {
    throw new N8nError('N8N_INVALID_URL', 'Enter a valid n8n webhook URL.', 400)
  }
  if (target.username || target.password || target.hash) {
    throw new N8nError(
      'N8N_INVALID_URL',
      'The n8n webhook URL cannot contain credentials or a fragment.',
      400,
    )
  }
  if (target.protocol !== 'https:' && !allowInsecure) {
    throw new N8nError(
      'N8N_HTTPS_REQUIRED',
      'The n8n webhook URL must use HTTPS.',
      400,
    )
  }
  if (target.origin !== allowed.origin) {
    throw new N8nError(
      'N8N_ORIGIN_NOT_ALLOWED',
      `The webhook must use the configured n8n origin ${allowed.origin}.`,
      400,
    )
  }

  if (!allowPrivate) {
    const addresses = isIP(target.hostname)
      ? [{ address: target.hostname }]
      : await lookup(target.hostname, { all: true, verbatim: true }).catch(() => [])
    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => isPrivateAddress(address))
    ) {
      throw new N8nError(
        'N8N_ADDRESS_NOT_ALLOWED',
        'The n8n hostname must resolve only to public addresses.',
        400,
      )
    }
  }
  return target
}

export function createN8nDeliveryClient({
  fetchImplementation = fetch,
  timeoutMilliseconds = 10_000,
}) {
  return {
    async deliver({
      targetUrl,
      method,
      secret,
      correlationId,
      deliveryId,
      event,
    }) {
      const startedAt = performance.now()
      const nonce = randomBytes(18).toString('base64url')
      const timestamp = String(Date.now())
      const url = new URL(targetUrl)
      let body = Buffer.alloc(0)
      if (method === 'GET') {
        url.searchParams.set('lancee_event', event.type)
        url.searchParams.set('correlation_id', correlationId)
      } else {
        body = Buffer.from(JSON.stringify(event))
      }
      const path = `${url.pathname}${url.search}`
      const bodyDigest = hashBody(body)
      const signature = signN8nRequest({
        secret,
        timestamp,
        nonce,
        method,
        path,
        bodyHash: bodyDigest,
      })

      let response
      try {
        response = await fetchImplementation(url, {
          method,
          headers: {
            ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
            'X-Lancee-Timestamp': timestamp,
            'X-Lancee-Nonce': nonce,
            'X-Lancee-Signature': signature,
            'X-Lancee-Correlation-Id': correlationId,
            'X-Lancee-Delivery-Id': deliveryId,
          },
          body: method === 'POST' ? body : undefined,
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMilliseconds),
        })
      } catch (error) {
        const duration = Math.max(0, Math.round(performance.now() - startedAt))
        const details = {
          duration,
          nonce,
          requestHash: bodyDigest,
          targetUrl: url.toString(),
        }
        if (error?.name === 'TimeoutError') {
          throw new N8nError(
            'N8N_TIMEOUT',
            'The n8n webhook did not respond before the timeout.',
            504,
            details,
          )
        }
        throw new N8nError(
          'N8N_UNREACHABLE',
          'The n8n webhook could not be reached.',
          502,
          details,
        )
      }

      const duration = Math.max(0, Math.round(performance.now() - startedAt))
      await response.body?.cancel()
      if (!response.ok) {
        throw new N8nError(
          'N8N_REJECTED',
          `The n8n webhook returned HTTP ${response.status}.`,
          502,
          {
            duration,
            nonce,
            requestHash: bodyDigest,
            targetUrl: url.toString(),
            responseStatus: response.status,
          },
        )
      }
      return {
        status: response.status,
        duration,
        nonce,
        timestamp,
        requestHash: bodyDigest,
        targetUrl: url.toString(),
      }
    },
  }
}
