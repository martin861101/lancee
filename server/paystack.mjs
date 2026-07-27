import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export class PaystackError extends Error {
  constructor(code, message, status = 502) {
    super(message)
    this.code = code
    this.status = status
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

export function paystackConfiguration(secretKey) {
  if (!secretKey) {
    return {
      configured: false,
      mode: 'none',
      keyFingerprint: null,
    }
  }
  if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(secretKey)) {
    throw new Error('PAYSTACK_SECRET_KEY must use a valid sk_test_ or sk_live_ value.')
  }
  return {
    configured: true,
    mode: secretKey.startsWith('sk_live_') ? 'live' : 'test',
    keyFingerprint: createHash('sha256').update(secretKey).digest('hex').slice(0, 12),
  }
}

export function createPaystackClient({
  secretKey,
  baseUrl = 'https://api.paystack.co',
  allowInsecure = false,
  fetchImplementation = fetch,
  timeoutMilliseconds = 10_000,
}) {
  const configuration = paystackConfiguration(secretKey)
  const parsedBaseUrl = new URL(baseUrl)
  if (parsedBaseUrl.protocol !== 'https:' && !allowInsecure) {
    throw new Error('PAYSTACK_BASE_URL must use HTTPS.')
  }
  const normalizedBaseUrl = parsedBaseUrl.toString().replace(/\/$/, '')

  return {
    ...configuration,
    baseUrl: normalizedBaseUrl,

    verifyWebhook(rawBody, signature) {
      if (!configuration.configured || !signature) return false
      const expected = createHmac('sha512', secretKey).update(rawBody).digest('hex')
      return safeEqualHex(expected, String(signature))
    },

    async initializeTransaction({
      email,
      amountMinor,
      currency,
      reference,
      callbackUrl,
      metadata,
    }) {
      if (!configuration.configured) {
        throw new PaystackError(
          'PAYSTACK_NOT_CONFIGURED',
          'Paystack is not configured.',
          503,
        )
      }

      let response
      try {
        response = await fetchImplementation(`${normalizedBaseUrl}/transaction/initialize`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            amount: String(amountMinor),
            currency,
            reference,
            callback_url: callbackUrl,
            metadata: JSON.stringify(metadata),
          }),
          signal: AbortSignal.timeout(timeoutMilliseconds),
        })
      } catch (error) {
        if (error?.name === 'TimeoutError') {
          throw new PaystackError(
            'PAYSTACK_TIMEOUT',
            'Paystack did not respond before the request timeout.',
            504,
          )
        }
        throw new PaystackError(
          'PAYSTACK_UNREACHABLE',
          'Paystack could not be reached.',
          502,
        )
      }

      let payload
      try {
        payload = await response.json()
      } catch {
        throw new PaystackError(
          'PAYSTACK_INVALID_RESPONSE',
          'Paystack returned an invalid response.',
          502,
        )
      }

      if (
        !response.ok ||
        payload?.status !== true ||
        typeof payload?.data?.authorization_url !== 'string' ||
        typeof payload?.data?.access_code !== 'string' ||
        payload?.data?.reference !== reference
      ) {
        throw new PaystackError(
          'PAYSTACK_INITIALIZE_REJECTED',
          'Paystack rejected transaction initialization.',
          502,
        )
      }

      return {
        authorizationUrl: payload.data.authorization_url,
        accessCode: payload.data.access_code,
        reference: payload.data.reference,
      }
    },
  }
}
