import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { openDatabase } from './database.mjs'
import { getSmtpStatus, sendNotification } from './notifications.mjs'
import {
  createPaystackClient,
  PaystackError,
} from './paystack.mjs'
import {
  createN8nDeliveryClient,
  decryptN8nSecret,
  encryptN8nSecret,
  hashBody,
  N8nError,
  signN8nRequest,
  validateN8nTimestamp,
  validateN8nWebhookUrl,
  verifyN8nRequest,
} from './n8n.mjs'
import {
  completeChat,
  getAiStatus,
  AiError,
} from './ai.mjs'

function nowIso() {
  return new Date().toISOString()
}

function stableId(prefix, value) {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 20)}`
}

const serverDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = dirname(serverDirectory)
const distDirectory = join(projectDirectory, 'dist')
const runtimeDirectory = join(projectDirectory, '.runtime')
const sessionSecretPath = join(runtimeDirectory, 'session-secret')
const configuredDatabasePath = process.env.DATABASE_PATH || ''
const databasePath = configuredDatabasePath
  ? isAbsolute(configuredDatabasePath)
    ? configuredDatabasePath
    : resolve(projectDirectory, configuredDatabasePath)
  : join(runtimeDirectory, 'lancee.sqlite')
const port = Number.parseInt(process.env.PORT || '5177', 10)
const production =
  process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production'
const publicOrigin = process.env.PUBLIC_ORIGIN || 'https://agents.hygridtech.co.za'
const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const adminName = (process.env.ADMIN_NAME || 'Workspace Admin').trim()
const workspaceId = (process.env.WORKSPACE_ID || 'wsp_primary').trim()
const workspaceName = (process.env.WORKSPACE_NAME || 'Hookitup Solutions').trim()
const mcpGatewayUrl =
  process.env.MCP_GATEWAY_URL || 'https://mcp.hygridtech.co.za'
const n8nBaseUrl =
  process.env.N8N_BASE_URL || 'https://n8n.hygridtech.co.za'
const n8nDefaultSigningSecret = (process.env.N8N_SIGNING_SECRET || '').trim()
const n8nAllowPrivate =
  !production && process.env.N8N_ALLOW_PRIVATE === 'true'
const configuredN8nTimeout = Number.parseInt(
  process.env.N8N_TIMEOUT_MS || '10000',
  10,
)
const n8nTimeoutMilliseconds = Number.isFinite(configuredN8nTimeout)
  ? Math.min(30_000, Math.max(250, configuredN8nTimeout))
  : 10_000
const paystackSecretKey = (process.env.PAYSTACK_SECRET_KEY || '').trim()
const paystackBaseUrl =
  process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co'
const sessionTtlSeconds =
  Number.parseInt(process.env.SESSION_TTL_HOURS || '12', 10) * 60 * 60
const loginAttempts = new Map()
const apiKeyPermissions = new Set(['workspace:read', 'mcp:read'])

for (const variable of ['ADMIN_EMAIL', 'ADMIN_PASSWORD_SALT', 'ADMIN_PASSWORD_HASH']) {
  if (!process.env[variable]) {
    throw new Error(`${variable} must be configured in the server-only .env file.`)
  }
}

function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
  if (existsSync(sessionSecretPath)) return readFileSync(sessionSecretPath, 'utf8').trim()

  mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 })
  const secret = randomBytes(48).toString('base64url')
  writeFileSync(sessionSecretPath, `${secret}\n`, {
    mode: 0o600,
    flag: 'wx',
  })
  return secret
}

const sessionSecret = getSessionSecret()
const database = await openDatabase({
  databasePath,
  adminEmail,
  adminName,
  adminPasswordSalt: process.env.ADMIN_PASSWORD_SALT,
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH,
  workspaceId,
  workspaceName,
})
const paystack = createPaystackClient({
  secretKey: paystackSecretKey,
  baseUrl: paystackBaseUrl,
  allowInsecure: !production,
})
const n8nDeliveryClient = createN8nDeliveryClient({
  timeoutMilliseconds: n8nTimeoutMilliseconds,
})
const paystackCallbackUrl =
  process.env.PAYSTACK_CALLBACK_URL || `${publicOrigin}/?payment=paystack`
const parsedPaystackCallbackUrl = new URL(paystackCallbackUrl)
if (production && parsedPaystackCallbackUrl.protocol !== 'https:') {
  throw new Error('PAYSTACK_CALLBACK_URL must use HTTPS in production.')
}
await database.upsertPaymentConnection({
  selectedWorkspaceId: workspaceId,
  provider: 'paystack',
  configured: paystack.configured,
  mode: paystack.mode,
  credentialSource: paystack.configured ? 'environment' : 'none',
  keyFingerprint: paystack.keyFingerprint,
})

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function sign(value) {
  return createHmac('sha256', sessionSecret).update(value).digest('base64url')
}

function hashSecret(value) {
  return createHash('sha256').update(value).digest('hex')
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

function initialsFor(name) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function userResponse(context) {
  return {
    id: context.user.id,
    name: context.user.name,
    email: context.user.email,
    workspaceId: context.workspace.id,
    workspace: context.workspace.name,
    role: context.membership.role,
    initials: initialsFor(context.user.name),
  }
}

function createSessionToken(context) {
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(
    JSON.stringify({
      sub: context.user.id,
      wsp: context.workspace.id,
      iat: now,
      exp: now + sessionTtlSeconds,
      nonce: randomBytes(12).toString('base64url'),
    }),
  ).toString('base64url')
  return `${payload}.${sign(payload)}`
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=')
        if (separator === -1) return [part, '']
        return [
          decodeURIComponent(part.slice(0, separator)),
          decodeURIComponent(part.slice(separator + 1)),
        ]
      }),
  )
}

async function readSession(request) {
  const cookies = parseCookies(request.headers.cookie)
  const token = cookies.lancee_session || cookies.nexus_session
  if (!token) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature || !safeEqual(sign(payload), signature)) return null

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (parsed.exp <= Math.floor(Date.now() / 1000)) return null

    // Sessions issued before durable workspaces used the administrator email as
    // `sub` and did not carry a workspace id. Keep them valid through migration.
    const context = parsed.wsp
      ? await database.getContextByIds(parsed.sub, parsed.wsp)
      : await database.getContextByEmail(parsed.sub)
    return context ? { claims: parsed, context } : null
  } catch {
    return null
  }
}

async function requireAuth(request, response, next) {
  response.set('Cache-Control', 'no-store')
  const session = await readSession(request)
  if (!session) {
    response.status(401).json({ error: 'Authentication required.' })
    return
  }
  request.auth = session
  next()
}

function verifyPassword(password, context) {
  const expected = Buffer.from(context.user.passwordHash, 'hex')
  if (expected.length !== 64) return false
  const candidate = scryptSync(password, context.user.passwordSalt, expected.length)
  return timingSafeEqual(candidate, expected)
}

function clientAddress(request) {
  return request.ip || request.socket.remoteAddress || 'unknown'
}

function rateLimitLogin(request, response, next) {
  const now = Date.now()
  const windowMilliseconds = 15 * 60 * 1000
  const address = clientAddress(request)
  const attempts = (loginAttempts.get(address) || []).filter(
    (timestamp) => now - timestamp < windowMilliseconds,
  )
  loginAttempts.set(address, attempts)

  if (attempts.length >= 5) {
    response
      .status(429)
      .set('Retry-After', '900')
      .json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' })
    return
  }
  next()
}

function secureMutations(request, response, next) {
  const origin = request.headers.origin
  if (origin && origin !== publicOrigin) {
    response.status(403).json({ error: 'Origin not allowed.' })
    return
  }
  next()
}

async function mcpAccessResponse(context) {
  const access = await database.getMcpAccess(context.workspace.id)
  return {
    platformFeature: true,
    status: access.status,
    gatewayUrl: mcpGatewayUrl,
    requestedAt: access.requestedAt,
    approvalMode: process.env.MCP_API_TOKEN ? 'automatic' : 'manual',
    serviceActivationEnabled: access.status === 'approved',
  }
}

function readIdempotencyKey(request) {
  const key = String(request.get('Idempotency-Key') || '').trim()
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
    throw new HttpError(
      400,
      'A valid Idempotency-Key header is required for this mutation.',
    )
  }
  return key
}

async function executeIdempotentMutation({
  request,
  route,
  input,
  operation,
}) {
  const selectedWorkspaceId = request.auth.context.workspace.id
  const key = readIdempotencyKey(request)
  const requestHash = hashSecret(JSON.stringify(input))
  await database.deleteExpiredIdempotency()

  return await database.transaction(async () => {
    const existing = await database.getIdempotency(selectedWorkspaceId, route, key)
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new HttpError(
          409,
          'This Idempotency-Key was already used with a different request.',
        )
      }
      return {
        key,
        replayed: true,
        status: existing.responseStatus,
        response: existing.response,
      }
    }

    const result = await operation(key)
    await database.saveIdempotency({
      workspaceId: selectedWorkspaceId,
      route,
      idempotencyKey: key,
      requestHash,
      responseStatus: result.status,
      responseJson: result.response,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    return {
      key,
      replayed: false,
      ...result,
    }
  })
}

function sendMutationResponse(response, result, payload = result.response) {
  response
    .status(result.status)
    .set({
      'Cache-Control': 'no-store',
      'Idempotency-Key': result.key,
      'Idempotency-Replayed': String(result.replayed),
    })
    .json(payload)
}

function deriveApiKeySecret(selectedWorkspaceId, idempotencyKey, createdAt) {
  const value = createHmac('sha256', sessionSecret)
    .update(`api-key:${selectedWorkspaceId}:${idempotencyKey}:${createdAt}`)
    .digest('base64url')
  return `lnc_live_${value}`
}

function validateApiKeyPermissions(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, 'Select at least one API-key permission.')
  }
  const permissions = [...new Set(value.map((permission) => String(permission)))]
  if (
    permissions.length > apiKeyPermissions.size ||
    permissions.some((permission) => !apiKeyPermissions.has(permission))
  ) {
    throw new HttpError(400, 'One or more API-key permissions are invalid.')
  }
  return permissions
}

function validateIdeaBoardId(value) {
  const boardId = String(value || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(boardId)) {
    throw new HttpError(400, 'A valid idea-board id is required.')
  }
  return boardId
}

function validateIdeaNoteContent(value) {
  const content = String(value || '').trim()
  if (content.length < 1 || content.length > 500) {
    throw new HttpError(
      400,
      'Idea-note content must be between 1 and 500 characters.',
    )
  }
  return content
}

function validateIdeaNoteId(value) {
  const id = String(value || '').trim().toLowerCase()
  if (!/^note_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) {
    throw new HttpError(400, 'A valid idea-note id is required.')
  }
  return id
}

async function paystackConnectionResponse(context) {
  const connection = await database.getPaymentConnection(context.workspace.id, 'paystack')
  return {
    provider: 'paystack',
    configured: Boolean(connection?.configured),
    mode: connection?.mode || 'none',
    credentialSource: connection?.credentialSource || 'none',
    configuredAt: connection?.configuredAt || null,
    updatedAt: connection?.updatedAt || null,
    currency: 'ZAR',
  }
}

function validatePaystackInvoiceInput(body) {
  const clientName = String(body?.clientName || '').trim()
  const clientEmail = String(body?.clientEmail || '').trim().toLowerCase()
  const projectName = String(body?.projectName || '').trim()
  const description = String(body?.description || projectName).trim()
  const amountMinor = Number(body?.amountMinor)
  const currency = String(body?.currency || 'ZAR').trim().toUpperCase()
  const dueDate = body?.dueDate ? String(body.dueDate).trim() : null

  if (clientName.length < 2 || clientName.length > 120) {
    throw new HttpError(400, 'Client name must be between 2 and 120 characters.')
  }
  if (
    clientEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)
  ) {
    throw new HttpError(400, 'A valid client email is required.')
  }
  if (projectName.length < 2 || projectName.length > 160) {
    throw new HttpError(400, 'Project name must be between 2 and 160 characters.')
  }
  if (description.length < 2 || description.length > 500) {
    throw new HttpError(400, 'Description must be between 2 and 500 characters.')
  }
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 100 ||
    amountMinor > 100_000_000_00
  ) {
    throw new HttpError(400, 'Amount must be a valid value in currency subunits.')
  }
  if (currency !== 'ZAR') {
    throw new HttpError(400, 'This Paystack flow currently supports ZAR only.')
  }
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new HttpError(400, 'Due date must use YYYY-MM-DD.')
  }

  return {
    clientName,
    clientEmail,
    projectName,
    description,
    amountMinor,
    currency,
    dueDate,
  }
}

function paymentLinkResponse(paymentLink) {
  return {
    invoice: {
      id: paymentLink.invoiceId,
      invoiceNumber: paymentLink.invoiceNumber,
      clientName: paymentLink.clientName,
      clientEmail: paymentLink.clientEmail,
      projectName: paymentLink.projectName,
      description: paymentLink.description,
      amountMinor: paymentLink.amountMinor,
      currency: paymentLink.currency,
      dueDate: paymentLink.dueDate,
      status: paymentLink.invoiceStatus,
      provider: paymentLink.provider,
      providerReference: paymentLink.providerReference,
      paymentUrl: paymentLink.authorizationUrl,
      createdAt: paymentLink.createdAt,
      updatedAt: paymentLink.updatedAt,
      paidAt: paymentLink.paidAt,
    },
    paymentLink: {
      id: paymentLink.id,
      provider: paymentLink.provider,
      providerReference: paymentLink.providerReference,
      authorizationUrl: paymentLink.authorizationUrl,
      status: paymentLink.paymentStatus,
      createdAt: paymentLink.createdAt,
      updatedAt: paymentLink.updatedAt,
      paidAt: paymentLink.paidAt,
    },
  }
}

function n8nCallbackPath(selectedWorkspaceId) {
  return `/api/hooks/n8n/${encodeURIComponent(selectedWorkspaceId)}`
}

async function n8nConnectionResponse(context) {
  const connection = await database.getN8nConnection(context.workspace.id)
  const callbackPath =
    connection?.callbackPath || n8nCallbackPath(context.workspace.id)
  return {
    connected: Boolean(connection?.connected),
    outboundUrl: connection?.outboundUrl || '',
    callbackUrl: new URL(callbackPath, publicOrigin).toString(),
    methods: connection?.methods || ['GET', 'POST'],
    signingSecretConfigured: Boolean(connection?.secretCiphertext || connection?.encryptedSecret),
    updatedAt: connection?.updatedAt || null,
    lastDeliveryAt: connection?.lastDeliveryAt || null,
  }
}

function n8nDeliveryResponse(delivery) {
  return {
    id: delivery.id,
    direction: delivery.direction,
    method: delivery.method,
    eventType: delivery.eventType,
    status: delivery.status,
    responseStatus: delivery.responseStatus,
    duration: delivery.duration,
    errorCode: delivery.errorCode,
    attemptNumber: delivery.attemptNumber,
    retryOf: delivery.retryOf,
    correlationId: delivery.correlationId,
    createdAt: delivery.createdAt,
    completedAt: delivery.completedAt,
  }
}

function n8nConnectionSecret(connection) {
  const encrypted =
    connection.encryptedSecret ||
    (connection.secretCiphertext
      ? { ciphertext: connection.secretCiphertext, iv: connection.secretIv, tag: connection.secretTag }
      : null)
  if (!connection?.connected || !encrypted) {
    throw new N8nError(
      'N8N_NOT_CONFIGURED',
      'Configure the n8n connection before sending a delivery.',
      409,
    )
  }
  try {
    return decryptN8nSecret(encrypted, sessionSecret)
  } catch {
    throw new N8nError(
      'N8N_SECRET_UNAVAILABLE',
      'The encrypted n8n signing secret could not be opened.',
      500,
    )
  }
}

async function performN8nOutboundDelivery(context, delivery) {
  const selectedWorkspaceId = context.workspace.id
  const connection = await database.getN8nConnection(selectedWorkspaceId)
  const secret = n8nConnectionSecret(connection)
  const target = await validateN8nWebhookUrl({
    value: connection.outboundUrl,
    allowedBaseUrl: n8nBaseUrl,
    allowInsecure: !production,
    allowPrivate: n8nAllowPrivate,
  })

  try {
    const delivered = await n8nDeliveryClient.deliver({
      targetUrl: target.toString(),
      method: delivery.method,
      secret,
      correlationId: delivery.correlationId,
      deliveryId: delivery.id,
      event: delivery.event,
    })
    return await database.transaction(async () =>
      await database.completeN8nDelivery({
        selectedWorkspaceId,
        id: delivery.id,
        status: 'succeeded',
        nonce: delivered.nonce,
        bodyHash: delivered.requestHash,
        targetUrl: delivered.targetUrl,
        responseStatus: delivered.status,
        duration: delivered.duration,
      }),
    )
  } catch (error) {
    const n8nError =
      error instanceof N8nError
        ? error
        : new N8nError('N8N_DELIVERY_FAILED', 'The n8n delivery failed.')
    await database.transaction(async () => {
      await database.completeN8nDelivery({
        selectedWorkspaceId,
        id: delivery.id,
        status: 'failed',
        nonce: n8nError.nonce || null,
        bodyHash: n8nError.requestHash || hashBody(Buffer.alloc(0)),
        targetUrl: n8nError.targetUrl || connection.outboundUrl,
        responseStatus: n8nError.responseStatus || null,
        duration: n8nError.duration || null,
        errorCode: n8nError.code,
      })
    })
    throw n8nError
  }
}

function requireApiPermission(permission) {
  return async (request, response, next) => {
    response.set('Cache-Control', 'no-store')
    const authorization = String(request.get('Authorization') || '')
    const match = authorization.match(/^Bearer (lnc_live_[A-Za-z0-9_-]+)$/)
    if (!match) {
      response.status(401).json({ error: 'A valid lancee API key is required.' })
      return
    }

    const apiKey = await database.getApiKeyByHash(hashSecret(match[1]))
    if (!apiKey) {
      response.status(401).json({ error: 'A valid lancee API key is required.' })
      return
    }
    if (!apiKey.permissions.includes(permission)) {
      response.status(403).json({ error: `API key lacks ${permission} permission.` })
      return
    }

    const context = await database.getContextByIds(apiKey.createdBy, apiKey.workspaceId)
    if (!context) {
      response.status(401).json({ error: 'The API key workspace is unavailable.' })
      return
    }

    await database.touchApiKey(apiKey.id)
    request.apiAuth = { apiKey, context }
    next()
  }
}

async function handleInboundN8n(request, response) {
  response.set('Cache-Control', 'no-store')
  const selectedWorkspaceId = String(request.params.workspaceId || '')
  if (!/^[A-Za-z0-9._-]{3,80}$/.test(selectedWorkspaceId)) {
    response.status(404).json({ error: 'n8n callback not found.' })
    return
  }
  const connection = await database.getN8nConnection(selectedWorkspaceId)
  if (
    !connection?.connected ||
    connection.callbackPath !== n8nCallbackPath(selectedWorkspaceId) ||
    !connection.methods.includes(request.method)
  ) {
    response.status(404).json({ error: 'n8n callback not found.' })
    return
  }

  const body =
    request.method === 'POST' && Buffer.isBuffer(request.body)
      ? request.body
      : Buffer.alloc(0)
  if (request.method === 'POST' && !Buffer.isBuffer(request.body)) {
    response.status(415).json({ error: 'n8n POST callbacks require JSON.' })
    return
  }
  const timestamp = String(request.get('X-Lancee-Timestamp') || '')
  const nonce = String(request.get('X-Lancee-Nonce') || '')
  const signature = String(request.get('X-Lancee-Signature') || '')
  if (
    !validateN8nTimestamp(timestamp) ||
    !/^[A-Za-z0-9_-]{16,64}$/.test(nonce)
  ) {
    response.status(401).json({ error: 'Invalid or expired n8n signature metadata.' })
    return
  }

  const bodyDigest = hashBody(body)
  const secret = n8nConnectionSecret(connection)
  if (
    !verifyN8nRequest({
      secret,
      signature,
      timestamp,
      nonce,
      method: request.method,
      path: request.originalUrl,
      bodyHash: bodyDigest,
    })
  ) {
    response.status(401).json({ error: 'Invalid n8n signature.' })
    return
  }

  let event
  try {
    event =
      request.method === 'POST'
        ? JSON.parse(body.toString('utf8'))
        : {
            type: String(request.query.event || 'n8n.inbound'),
            query: Object.fromEntries(
              Object.entries(request.query)
                .slice(0, 20)
                .map(([key, value]) => [key, String(value).slice(0, 500)]),
            ),
          }
  } catch {
    response.status(400).json({ error: 'Invalid n8n JSON payload.' })
    return
  }
  const eventType = String(event?.type || 'n8n.inbound').slice(0, 120)
  const requestedCorrelation = String(
    request.get('X-Lancee-Correlation-Id') ||
      request.query.correlation_id ||
      '',
  )
  const correlationId = /^[A-Za-z0-9._:-]{8,100}$/.test(requestedCorrelation)
    ? requestedCorrelation
    : `cor_${randomBytes(12).toString('hex')}`
  const timestampMilliseconds =
    timestamp.length === 10 ? Number(timestamp) * 1000 : Number(timestamp)
  const deliveryId = `dlv_${createHash('sha256')
    .update(
      `inbound:${selectedWorkspaceId}:${nonce}:${timestamp}:${bodyDigest}`,
    )
    .digest('hex')
    .slice(0, 24)}`

  let delivery
  try {
    delivery = await database.transaction(async () => {
      await database.deleteExpiredN8nNonces(
        new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      )
      if (
        !(await database.consumeN8nNonce({
          selectedWorkspaceId,
          nonce,
          timestampMilliseconds,
        }))
      ) {
        throw new HttpError(409, 'This n8n request nonce was already used.')
      }
      return await database.createN8nDelivery({
        id: deliveryId,
        selectedWorkspaceId,
        direction: 'inbound',
        method: request.method,
        targetUrl: new URL(request.originalUrl, publicOrigin).toString(),
        correlationId,
        nonce,
        requestHash: bodyDigest,
        eventType,
        event,
        status: 'accepted',
      })
    })
  } catch (error) {
    if (error instanceof HttpError) {
      response.status(error.status).json({ error: error.message })
      return
    }
    throw error
  }

  response.status(202).json({
    accepted: true,
    delivery: n8nDeliveryResponse(delivery),
  })
}

const app = express()
app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use((_request, response, next) => {
  response.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  })
  next()
})

app.post(
  '/api/webhooks/paystack',
  express.raw({ type: 'application/json', limit: '256kb' }),
  async (request, response) => {
    response.set('Cache-Control', 'no-store')
    if (!paystack.configured) {
      response.status(503).json({ error: 'Paystack is not configured.' })
      return
    }
    if (
      !Buffer.isBuffer(request.body) ||
      !paystack.verifyWebhook(request.body, request.get('x-paystack-signature'))
    ) {
      response.status(401).json({ error: 'Invalid Paystack webhook signature.' })
      return
    }

    let event
    try {
      event = JSON.parse(request.body.toString('utf8'))
    } catch {
      response.status(400).json({ error: 'Invalid Paystack webhook payload.' })
      return
    }

    const payloadHash = hashSecret(request.body)
    const eventType = String(event?.event || 'unknown')
    const providerReference =
      typeof event?.data?.reference === 'string' ? event.data.reference : null
    const transactionIdentity =
      typeof event?.data?.id === 'string'
        ? event.data.id
        : Number.isSafeInteger(event?.data?.id)
          ? String(event.data.id)
          : payloadHash
    const eventKey = `${eventType}:${providerReference || 'none'}:${transactionIdentity}`
    const eventId = `evt_${createHash('sha256')
      .update(`paystack:${eventKey}:${payloadHash}`)
      .digest('hex')
      .slice(0, 24)}`
    const record = (result, processedAt = null) =>
      database.recordPaymentEvent({
        id: eventId,
        provider: 'paystack',
        eventKey,
        eventType,
        providerReference,
        payloadHash,
        result,
        processedAt,
      })

    if (eventType !== 'charge.success' || !providerReference) {
      await record('ignored')
      response.status(200).json({ received: true, processed: false })
      return
    }

    const paymentLink = await database.getPaymentLinkByReference(
      'paystack',
      providerReference,
    )
    if (!paymentLink) {
      await record('unmatched')
      response.status(200).json({ received: true, processed: false })
      return
    }

    const eventAmount = Number(event.data.amount)
    const eventCurrency = String(event.data.currency || '').toUpperCase()
    if (
      event.data.status !== 'success' ||
      !Number.isSafeInteger(eventAmount) ||
      eventAmount !== paymentLink.amountMinor ||
      eventCurrency !== paymentLink.currency
    ) {
      await record('rejected')
      response.status(200).json({ received: true, processed: false })
      return
    }

    const paidAtValue = Date.parse(event.data.paid_at || event.data.paidAt || '')
    const paidAt = Number.isFinite(paidAtValue)
      ? new Date(paidAtValue).toISOString()
      : new Date().toISOString()
    const providerTransactionId =
      typeof event.data.id === 'string'
        ? event.data.id
        : Number.isSafeInteger(event.data.id)
          ? String(event.data.id)
          : null

    const processed = await database.transaction(async () => {
      const inserted = await record('processed', paidAt)
      if (!inserted) return false
      await database.markPaymentPaid({
        provider: 'paystack',
        providerReference,
        providerTransactionId,
        timestamp: paidAt,
      })
      return true
    })

    response.status(200).json({
      received: true,
      processed,
      duplicate: !processed,
    })
  },
)

app.get('/api/hooks/n8n/:workspaceId', handleInboundN8n)
app.post(
  '/api/hooks/n8n/:workspaceId',
  express.raw({ type: 'application/json', limit: '256kb' }),
  handleInboundN8n,
)

app.use(express.json({ limit: '24kb' }))

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'lancee-agents-platform' })
})

app.get('/api/auth/session', async (request, response) => {
  response.set('Cache-Control', 'no-store')
  const session = await readSession(request)
  if (!session) {
    response.status(401).json({ error: 'No active session.' })
    return
  }
  response.json({ user: userResponse(session.context) })
})

app.post('/api/auth/login', secureMutations, rateLimitLogin, async (request, response) => {
  response.set('Cache-Control', 'no-store')
  const email = String(request.body?.email || '').trim().toLowerCase()
  const password = String(request.body?.password || '')
  const address = clientAddress(request)
  const context = await database.getContextByEmail(email)

  if (!context || !verifyPassword(password, context)) {
    loginAttempts.set(address, [...(loginAttempts.get(address) || []), Date.now()])
    response.status(401).json({ error: 'Invalid email or password.' })
    return
  }

  loginAttempts.delete(address)
  const cookie = [
    `lancee_session=${encodeURIComponent(createSessionToken(context))}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${sessionTtlSeconds}`,
    production ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
  response.setHeader('Set-Cookie', cookie)
  response.json({ user: userResponse(context) })
})

app.post('/api/auth/register', secureMutations, rateLimitLogin, async (request, response) => {
  response.set('Cache-Control', 'no-store')
  const email = String(request.body?.email || '').trim().toLowerCase()
  const password = String(request.body?.password || '')
  const name = String(request.body?.name || email.split('@')[0]).trim()
  const workspaceName = String(request.body?.workspace || `${name}'s Workspace`).trim()

  if (email.length < 5 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    response.status(400).json({ error: 'A valid email address is required.' })
    return
  }
  if (password.length < 8 || password.length > 128) {
    response.status(400).json({ error: 'Password must be between 8 and 128 characters.' })
    return
  }
  if (name.length < 1 || name.length > 120) {
    response.status(400).json({ error: 'Name must be between 1 and 120 characters.' })
    return
  }

  const existing = await database.getContextByEmail(email)
  if (existing) {
    response.status(409).json({ error: 'An account with this email already exists.' })
    return
  }

  const now = nowIso()
  const passwordSalt = randomBytes(16).toString('hex')
  const passwordHash = scryptSync(password, passwordSalt, 64).toString('hex')
  const userId = stableId('usr', email)
  const wspId = `wsp_${createHash('sha256').update(`${email}:${now}`).digest('hex').slice(0, 20)}`

  await database.transaction(async () => {
    await database.query(
      `INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
      [wspId, workspaceName, now, now],
    )
    await database.query(
      `INSERT INTO users (id, email, name, password_salt, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, email, name, passwordSalt, passwordHash, now, now],
    )
    await database.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES ($1, $2, 'owner', $3)`,
      [wspId, userId, now],
    )
    await database.query(
      `INSERT INTO mcp_access (workspace_id, status, updated_at) VALUES ($1, 'available', $2)`,
      [wspId, now],
    )
    await database.query(
      `INSERT INTO workspace_settings (workspace_id, name, updated_at) VALUES ($1, $2, $3)`,
      [wspId, workspaceName, now],
    )
    const defaultIntegrations = [
      { id: 'figma', connected: 1 },
      { id: 'email', connected: 1 },
      { id: 'drive', connected: 1 },
      { id: 'stripe', connected: 0 },
      { id: 'paypal', connected: 0 },
      { id: 'paystack', connected: 0 },
      { id: 'n8n', connected: 0 },
      { id: 'mcp-grid', connected: 1 },
      { id: 'dropbox', connected: 0 },
    ]
    for (const integration of defaultIntegrations) {
      await database.query(
        `INSERT INTO workspace_integrations (workspace_id, integration_id, connected, updated_at) VALUES ($1, $2, $3, $4)`,
        [wspId, integration.id, integration.connected, now],
      )
    }
  })

  const context = await database.getContextByIds(userId, wspId)
  const cookie = [
    `lancee_session=${encodeURIComponent(createSessionToken(context))}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${sessionTtlSeconds}`,
    production ? 'Secure' : '',
  ].filter(Boolean).join('; ')
  response.setHeader('Set-Cookie', cookie)
  response.status(201).json({ user: userResponse(context) })
})

app.post('/api/auth/logout', secureMutations, (_request, response) => {
  response.set('Cache-Control', 'no-store')
  response.setHeader(
    'Set-Cookie',
    ['lancee_session', 'nexus_session'].map(
      (name) =>
        `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${production ? '; Secure' : ''}`,
    ),
  )
  response.status(204).end()
})

app.get('/api/ideas/notes', requireAuth, async (request, response) => {
  const boardId = validateIdeaBoardId(request.query.boardId)
  response.json({
    notes: await database.listIdeaNotes(
      request.auth.context.workspace.id,
      boardId,
    ),
  })
})

app.post(
  '/api/ideas/notes',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const input = {
      id: validateIdeaNoteId(request.body?.id),
      boardId: validateIdeaBoardId(request.body?.boardId),
      content: validateIdeaNoteContent(request.body?.content),
    }
    const selectedWorkspaceId = request.auth.context.workspace.id
    const result = await executeIdempotentMutation({
      request,
      route: 'POST /api/ideas/notes',
      input,
      operation: async () => {
        const existing = await database.getIdeaNote(selectedWorkspaceId, input.id)
        if (existing) {
          return {
            status: 409,
            response: {
              error: 'This idea-note id already exists.',
              conflict: { current: existing },
            },
          }
        }
        return {
          status: 201,
          response: {
            note: await database.createIdeaNote({
              ...input,
              selectedWorkspaceId,
              createdBy: request.auth.context.user.id,
            }),
          },
        }
      },
    })
    sendMutationResponse(response, result)
  },
)

app.patch(
  '/api/ideas/notes/:noteId',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const id = validateIdeaNoteId(request.params.noteId)
    const content = validateIdeaNoteContent(request.body?.content)
    const expectedVersion = request.body?.expectedVersion
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new HttpError(400, 'A positive expectedVersion is required.')
    }
    const input = { content, expectedVersion }
    const selectedWorkspaceId = request.auth.context.workspace.id
    const result = await executeIdempotentMutation({
      request,
      route: `PATCH /api/ideas/notes/${id}`,
      input,
      operation: async () => {
        const existing = await database.getIdeaNote(selectedWorkspaceId, id)
        if (!existing) {
          return {
            status: 404,
            response: { error: 'Idea note not found.' },
          }
        }
        const update = await database.updateIdeaNote({
          selectedWorkspaceId,
          id,
          content,
          expectedVersion,
        })
        if (!update.updated) {
          return {
            status: 409,
            response: {
              error: 'The idea note changed on another device.',
              conflict: { current: update.note },
            },
          }
        }
        return {
          status: 200,
          response: { note: update.note },
        }
      },
    })
    sendMutationResponse(response, result)
  },
)

function validateBoardLabel(value) {
  const label = String(value || '').trim()
  if (label.length < 1 || label.length > 100) {
    throw new HttpError(400, 'Board label must be between 1 and 100 characters.')
  }
  return label
}

function validateBoardId(value) {
  const id = String(value || '').trim().toLowerCase()
  if (!/^board_[a-z0-9_-]+$/.test(id)) {
    throw new HttpError(400, 'A valid board id is required.')
  }
  return id
}

function validateCanvasElementId(value) {
  const id = String(value || '').trim().toLowerCase()
  if (!/^elem_[a-z0-9_-]+$/.test(id)) {
    throw new HttpError(400, 'A valid canvas element id is required.')
  }
  return id
}

function validateCanvasElementKind(value) {
  const allowed = new Set(['sticky', 'image', 'shape', 'text', 'link'])
  const kind = String(value || '').trim().toLowerCase()
  if (!allowed.has(kind)) {
    throw new HttpError(400, `Canvas element kind must be one of: ${[...allowed].join(', ')}`)
  }
  return kind
}

app.get('/api/ideas/boards', requireAuth, async (request, response) => {
  response.json({
    boards: await database.listIdeaBoards(request.auth.context.workspace.id),
  })
})

app.post('/api/ideas/boards', requireAuth, async (request, response) => {
  const selectedWorkspaceId = request.auth.context.workspace.id
  const board = await database.createIdeaBoard({
    selectedWorkspaceId,
    id: request.body?.id || `board_${randomUUID()}`,
    label: validateBoardLabel(request.body?.label),
    createdBy: request.auth.context.user.id,
  })
  response.status(201).json({ board })
})

app.delete('/api/ideas/boards/:boardId', requireAuth, async (request, response) => {
  const boardId = validateBoardId(request.params.boardId)
  await database.deleteIdeaBoard(request.auth.context.workspace.id, boardId)
  response.status(204).end()
})

app.get('/api/ideas/elements', requireAuth, async (request, response) => {
  const boardId = validateIdeaBoardId(request.query.boardId)
  response.json({
    elements: await database.listCanvasElements(request.auth.context.workspace.id, boardId),
  })
})

app.post('/api/ideas/elements', requireAuth, async (request, response) => {
  const selectedWorkspaceId = request.auth.context.workspace.id
  const element = await database.saveCanvasElement({
    selectedWorkspaceId,
    boardId: validateIdeaBoardId(request.body?.boardId),
    id: validateCanvasElementId(request.body?.id),
    kind: validateCanvasElementKind(request.body?.kind),
    x: Number(request.body?.x) || 0,
    y: Number(request.body?.y) || 0,
    dataJson: JSON.stringify(request.body?.data || {}),
  })
  response.status(201).json({ element })
})

app.put('/api/ideas/elements/:elementId', requireAuth, async (request, response) => {
  const selectedWorkspaceId = request.auth.context.workspace.id
  const element = await database.saveCanvasElement({
    selectedWorkspaceId,
    boardId: validateIdeaBoardId(request.body?.boardId),
    id: validateCanvasElementId(request.params.elementId),
    kind: validateCanvasElementKind(request.body?.kind),
    x: Number(request.body?.x) || 0,
    y: Number(request.body?.y) || 0,
    dataJson: JSON.stringify(request.body?.data || {}),
  })
  response.json({ element })
})

app.delete('/api/ideas/elements/:elementId', requireAuth, async (request, response) => {
  const elementId = validateCanvasElementId(request.params.elementId)
  await database.deleteCanvasElement(request.auth.context.workspace.id, elementId)
  response.status(204).end()
})

app.get('/api/n8n/config', requireAuth, async (request, response) => {
  response.json(await n8nConnectionResponse(request.auth.context))
})

app.get('/api/n8n/deliveries', requireAuth, async (request, response) => {
  const deliveries = await database
    .listN8nDeliveries(request.auth.context.workspace.id)
  response.json({
    deliveries: deliveries.map(n8nDeliveryResponse),
  })
})

app.post(
  '/api/n8n/config',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const outboundUrl = String(request.body?.outboundUrl || '').trim()
    const methods = Array.isArray(request.body?.methods)
      ? [...new Set(request.body.methods.map((method) => String(method).toUpperCase()))]
      : []
    if (
      methods.length !== 2 ||
      !methods.includes('GET') ||
      !methods.includes('POST')
    ) {
      throw new HttpError(400, 'Both GET and POST must remain enabled.')
    }
    const target = await validateN8nWebhookUrl({
      value: outboundUrl,
      allowedBaseUrl: n8nBaseUrl,
      allowInsecure: !production,
      allowPrivate: n8nAllowPrivate,
    })
    const selectedWorkspaceId = request.auth.context.workspace.id
    const existing = await database.getN8nConnection(selectedWorkspaceId)
    const providedSecret = String(request.body?.signingSecret || '').trim()
    let signingSecret = providedSecret
    if (!signingSecret && existing?.encryptedSecret) {
      signingSecret = n8nConnectionSecret(existing)
    }
    if (!signingSecret && n8nDefaultSigningSecret) {
      signingSecret = n8nDefaultSigningSecret
    }
    if (signingSecret.length < 32 || signingSecret.length > 256) {
      throw new HttpError(
        400,
        'The n8n signing secret must be between 32 and 256 characters.',
      )
    }
    const encryptedSecret = providedSecret || !existing?.encryptedSecret
      ? encryptN8nSecret(signingSecret, sessionSecret)
      : existing.encryptedSecret

    const encData = typeof encryptedSecret === 'object' && encryptedSecret !== null
      ? encryptedSecret
      : { ciphertext: encryptedSecret, iv: '', tag: '' }
    const result = await executeIdempotentMutation({
      request,
      route: 'POST /api/n8n/config',
      input: {
        outboundUrl: target.toString(),
        methods,
        signingSecretHash: hashSecret(signingSecret),
      },
      operation: async () => {
        await database.saveN8nConnection({
          workspaceId: selectedWorkspaceId,
          status: 'connected',
          outboundUrl: target.toString(),
          callbackPath: n8nCallbackPath(selectedWorkspaceId),
          methods,
          secretCiphertext: encData.ciphertext,
          secretIv: encData.iv,
          secretTag: encData.tag,
        })
        return {
          status: 200,
          response: await n8nConnectionResponse(request.auth.context),
        }
      },
    })
    sendMutationResponse(response, result)
  },
)

app.post(
  '/api/n8n/disconnect',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const result = await executeIdempotentMutation({
      request,
      route: 'POST /api/n8n/disconnect',
      input: {},
      operation: async () => {
        await database.disconnectN8n(request.auth.context.workspace.id)
        return {
          status: 200,
          response: await n8nConnectionResponse(request.auth.context),
        }
      },
    })
    sendMutationResponse(response, result)
  },
)

app.post(
  '/api/n8n/deliveries',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const method = String(request.body?.method || '').toUpperCase()
    if (!['GET', 'POST'].includes(method)) {
      throw new HttpError(400, 'n8n delivery method must be GET or POST.')
    }
    const event =
      request.body?.event &&
      typeof request.body.event === 'object' &&
      !Array.isArray(request.body.event)
        ? request.body.event
        : { type: 'lancee.connection_test' }
    const eventType = String(event.type || 'lancee.connection_test').slice(0, 120)
    const normalizedEvent = {
      ...event,
      type: eventType,
    }
    const idempotencyKey = readIdempotencyKey(request)
    const selectedWorkspaceId = request.auth.context.workspace.id
    const requestHash = hashSecret(
      JSON.stringify({ method, event: normalizedEvent }),
    )
    const existing = await database.getN8nDeliveryByIdempotency(
      selectedWorkspaceId,
      idempotencyKey,
    )
    if (existing && existing.requestHash !== requestHash) {
      throw new HttpError(
        409,
        'This Idempotency-Key was already used with a different request.',
      )
    }
    if (existing?.status === 'pending') {
      throw new HttpError(409, 'This n8n delivery is already in progress.')
    }
    if (existing) {
      response
        .status(existing.status === 'succeeded' ? 200 : 502)
        .set({
          'Cache-Control': 'no-store',
          'Idempotency-Key': idempotencyKey,
          'Idempotency-Replayed': 'true',
        })
        .json({
          ...(existing.status === 'failed'
            ? {
                error: 'The original n8n delivery failed.',
                code: existing.errorCode,
              }
            : { ok: true }),
          delivery: n8nDeliveryResponse(existing),
        })
      return
    }

    const connection = await database.getN8nConnection(selectedWorkspaceId)
    n8nConnectionSecret(connection)
    const createdAt = new Date().toISOString()
    const identity = createHmac('sha256', sessionSecret)
      .update(
        `n8n-delivery:${selectedWorkspaceId}:${idempotencyKey}:${createdAt}`,
      )
      .digest('hex')
    const delivery = await database.createN8nDelivery({
      id: `dlv_${identity.slice(0, 24)}`,
      selectedWorkspaceId,
      direction: 'outbound',
      method,
      targetUrl: connection.outboundUrl,
      correlationId: `cor_${identity.slice(24, 48)}`,
      requestHash,
      eventType,
      event: normalizedEvent,
      idempotencyKey,
    })

    try {
      const completed = await performN8nOutboundDelivery(
        request.auth.context,
        delivery,
      )
      response
        .status(200)
        .set({
          'Cache-Control': 'no-store',
          'Idempotency-Key': idempotencyKey,
          'Idempotency-Replayed': 'false',
        })
        .json({ ok: true, delivery: n8nDeliveryResponse(completed) })
    } catch (error) {
      const failed = await database.getN8nDelivery(selectedWorkspaceId, delivery.id)
      const n8nError =
        error instanceof N8nError
          ? error
          : new N8nError('N8N_DELIVERY_FAILED', 'The n8n delivery failed.')
      response
        .status(n8nError.status)
        .set({
          'Cache-Control': 'no-store',
          'Idempotency-Key': idempotencyKey,
          'Idempotency-Replayed': 'false',
        })
        .json({
          error: n8nError.message,
          code: n8nError.code,
          delivery: n8nDeliveryResponse(failed),
        })
    }
  },
)

app.post(
  '/api/n8n/deliveries/:deliveryId/retry',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const selectedWorkspaceId = request.auth.context.workspace.id
    const source = await database.getN8nDelivery(
      selectedWorkspaceId,
      String(request.params.deliveryId || ''),
    )
    if (!source || source.direction !== 'outbound' || source.status !== 'failed') {
      throw new HttpError(404, 'A failed outbound n8n delivery is required.')
    }
    if (source.attemptNumber >= 5) {
      throw new HttpError(409, 'This n8n delivery reached the retry limit.')
    }
    const idempotencyKey = readIdempotencyKey(request)
    const requestHash = hashSecret(JSON.stringify({ retryOf: source.id }))
    const existing = await database.getN8nDeliveryByIdempotency(
      selectedWorkspaceId,
      idempotencyKey,
    )
    if (existing && existing.requestHash !== requestHash) {
      throw new HttpError(
        409,
        'This Idempotency-Key was already used with a different request.',
      )
    }
    if (existing) {
      response
        .status(existing.status === 'succeeded' ? 200 : 502)
        .set({
          'Cache-Control': 'no-store',
          'Idempotency-Key': idempotencyKey,
          'Idempotency-Replayed': 'true',
        })
        .json({
          ...(existing.status === 'succeeded'
            ? { ok: true }
            : { error: 'The retry failed.', code: existing.errorCode }),
          delivery: n8nDeliveryResponse(existing),
        })
      return
    }

    const connection = await database.getN8nConnection(selectedWorkspaceId)
    n8nConnectionSecret(connection)
    const createdAt = new Date().toISOString()
    const identity = createHmac('sha256', sessionSecret)
      .update(`n8n-retry:${selectedWorkspaceId}:${idempotencyKey}:${createdAt}`)
      .digest('hex')
    const retry = await database.createN8nDelivery({
      id: `dlv_${identity.slice(0, 24)}`,
      selectedWorkspaceId,
      direction: 'outbound',
      method: source.method,
      targetUrl: connection.outboundUrl,
      correlationId: source.correlationId,
      requestHash,
      eventType: source.eventType,
      event: source.event,
      attemptNumber: source.attemptNumber + 1,
      retryOf: source.id,
      idempotencyKey,
    })
    try {
      const completed = await performN8nOutboundDelivery(
        request.auth.context,
        retry,
      )
      response
        .status(200)
        .set({
          'Cache-Control': 'no-store',
          'Idempotency-Key': idempotencyKey,
          'Idempotency-Replayed': 'false',
        })
        .json({ ok: true, delivery: n8nDeliveryResponse(completed) })
    } catch (error) {
      const failed = await database.getN8nDelivery(selectedWorkspaceId, retry.id)
      const n8nError =
        error instanceof N8nError
          ? error
          : new N8nError('N8N_DELIVERY_FAILED', 'The n8n retry failed.')
      response
        .status(n8nError.status)
        .set({
          'Cache-Control': 'no-store',
          'Idempotency-Key': idempotencyKey,
          'Idempotency-Replayed': 'false',
        })
        .json({
          error: n8nError.message,
          code: n8nError.code,
          delivery: n8nDeliveryResponse(failed),
        })
    }
  },
)

app.post(
  '/api/n8n/inbound-self-test',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const method = String(request.body?.method || '').toUpperCase()
    if (!['GET', 'POST'].includes(method)) {
      throw new HttpError(400, 'n8n self-test method must be GET or POST.')
    }
    const selectedWorkspaceId = request.auth.context.workspace.id
    const connection = await database.getN8nConnection(selectedWorkspaceId)
    const secret = n8nConnectionSecret(connection)
    const result = await executeIdempotentMutation({
      request,
      route: 'POST /api/n8n/inbound-self-test',
      input: { method },
      operation: async () => {
        const started = performance.now()
        const nonce = randomBytes(18).toString('base64url')
        const timestamp = String(Date.now())
        const event = { type: 'lancee.inbound_signature_test' }
        const body = method === 'POST'
          ? Buffer.from(JSON.stringify(event))
          : Buffer.alloc(0)
        const path = method === 'GET'
          ? `${connection.callbackPath}?event=lancee.inbound_signature_test`
          : connection.callbackPath
        const bodyDigest = hashBody(body)
        const signature = signN8nRequest({
          secret,
          timestamp,
          nonce,
          method,
          path,
          bodyHash: bodyDigest,
        })
        if (
          !verifyN8nRequest({
            secret,
            signature,
            timestamp,
            nonce,
            method,
            path,
            bodyHash: bodyDigest,
          })
        ) {
          throw new N8nError(
            'N8N_SIGNATURE_SELF_TEST_FAILED',
            'The n8n signature self-test failed.',
            500,
          )
        }
        await database.consumeN8nNonce({
          selectedWorkspaceId,
          nonce,
          timestampMilliseconds: Number(timestamp),
        })
        const identity = createHash('sha256')
          .update(`self-test:${selectedWorkspaceId}:${nonce}:${timestamp}`)
          .digest('hex')
        const delivery = await database.createN8nDelivery({
          id: `dlv_${identity.slice(0, 24)}`,
          selectedWorkspaceId,
          direction: 'inbound',
          method,
          targetUrl: new URL(path, publicOrigin).toString(),
          correlationId: `cor_${identity.slice(24, 48)}`,
          nonce,
          requestHash: bodyDigest,
          eventType: event.type,
          event,
          status: 'accepted',
        })
        return {
          status: 200,
          response: {
            ok: true,
            direction: 'from-n8n',
            method,
            status: 202,
            latency: Math.max(0, Math.round(performance.now() - started)),
            message: 'Inbound signature and nonce storage verified',
            delivery: n8nDeliveryResponse(delivery),
          },
        }
      },
    })
    sendMutationResponse(response, result)
  },
)

const MCP_SERVICE_DEFINITIONS = [
  { id: 'browser-worker', name: 'Browser & documents', description: 'Guarded browser automation, web audits, extraction, screenshots, and PDFs.', category: 'Browser', status: 'live', credentialMode: 'Workspace vault', tools: [
    { id: 'playwright_screenshot', name: 'Playwright screenshot', description: 'Capture a public webpage at a configured viewport.' },
    { id: 'playwright_responsive_capture', name: 'Responsive capture', description: 'Capture mobile, tablet, and desktop evidence.' },
    { id: 'playwright_webpage_pdf', name: 'Webpage to PDF', description: 'Publish a public webpage as a PDF.' },
    { id: 'puppeteer_html_pdf', name: 'HTML to PDF', description: 'Render sanitized supplied HTML to PDF.' },
    { id: 'modern_document_pdf', name: 'Modern document PDF', description: 'Turn sanitized Markdown into a styled PDF.' },
    { id: 'web_quality_audit', name: 'Web quality audit', description: 'Inspect metadata, headings, image alts, and browser errors.' },
    { id: 'extract_web_content', name: 'Extract web content', description: 'Return structured metadata, links, headings, and readable text.' },
    { id: 'website_smoke_test', name: 'Website smoke test', description: 'Run deterministic title, text, and selector assertions.' },
    { id: 'extract_table_data', name: 'Extract table data', description: 'Read bounded table rows into structured JSON.' },
    { id: 'seo_metadata_audit', name: 'SEO metadata audit', description: 'Inspect canonical, robots, social cards, and JSON-LD.' },
  ] },
  { id: 'text-worker', name: 'Text processing', description: 'Deterministic text transformation, statistics, and literal replacement.', category: 'Text', status: 'live', credentialMode: 'Credential-free', tools: [
    { id: 'transform_text', name: 'Transform text', description: 'Apply case and formatting transformations.' },
    { id: 'text_stats', name: 'Text statistics', description: 'Count characters, words, bytes, and lines.' },
    { id: 'find_replace', name: 'Find and replace', description: 'Apply ordered literal replacements.' },
  ] },
  { id: 'data-worker', name: 'Structured data', description: 'Bounded CSV and JSON conversion with safe field projection.', category: 'Data', status: 'live', credentialMode: 'Credential-free', tools: [
    { id: 'csv_to_json', name: 'CSV to JSON', description: 'Parse a bounded delimited document.' },
    { id: 'json_to_csv', name: 'JSON to CSV', description: 'Serialize bounded records with ordered fields.' },
    { id: 'select_fields', name: 'Select fields', description: 'Project records onto an approved field list.' },
  ] },
  { id: 'utility-worker', name: 'Encoding & identifiers', description: 'Hashing, Base64 transport encoding, and UUID generation.', category: 'Utilities', status: 'live', credentialMode: 'Credential-free', tools: [
    { id: 'hash_text', name: 'Hash text', description: 'Create SHA-256, SHA-512, or BLAKE2b digests.' },
    { id: 'base64_encode', name: 'Base64 encode', description: 'Encode UTF-8 content for transport.' },
    { id: 'base64_decode', name: 'Base64 decode', description: 'Decode and validate Base64 as UTF-8.' },
    { id: 'generate_uuids', name: 'Generate UUIDs', description: 'Generate up to 100 UUIDv4 identifiers.' },
  ] },
]

app.get('/api/mcp/access', requireAuth, async (request, response) => {
  response.json(await mcpAccessResponse(request.auth.context))
})

app.get('/api/mcp/services', requireAuth, async (request, response) => {
  const states = await database.listMcpServiceStates(request.auth.context.workspace.id)
  const stateMap = {}
  for (const s of states) stateMap[s.serviceId] = s.active
  const services = MCP_SERVICE_DEFINITIONS.map((def) => ({
    ...def,
    active: stateMap[def.id] || false,
  }))
  response.json({ services })
})

app.post('/api/mcp/sync', requireAuth, async (request, response) => {
  const access = await database.getMcpAccess(request.auth.context.workspace.id)
  if (access.status !== 'approved') {
    throw new HttpError(409, 'Bearer access must be approved before services can sync.')
  }
  const now = nowIso()
  await database.touchMcpAccess(request.auth.context.workspace.id, now)
  const states = await database.listMcpServiceStates(request.auth.context.workspace.id)
  const stateMap = {}
  for (const s of states) stateMap[s.serviceId] = s.active
  const services = MCP_SERVICE_DEFINITIONS.map((def) => ({
    ...def,
    active: stateMap[def.id] || false,
  }))
  response.json({
    connection: { ...access, lastSync: now },
    services,
  })
})

app.post('/api/mcp/invoke', secureMutations, requireAuth, async (request, response) => {
  const { serviceId, toolId } = request.body || {}
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(serviceId) || typeof toolId !== 'string') {
    throw new HttpError(400, 'A valid MCP service id and tool id are required.')
  }
  const access = await database.getMcpAccess(request.auth.context.workspace.id)
  if (access.status !== 'approved') {
    throw new HttpError(409, 'Bearer access must be approved before invoking MCP tools.')
  }
  const states = await database.listMcpServiceStates(request.auth.context.workspace.id)
  const stateMap = {}
  for (const s of states) stateMap[s.serviceId] = s.active
  const service = MCP_SERVICE_DEFINITIONS.find((s) => s.id === serviceId)
  if (!service || !stateMap[serviceId]) {
    throw new HttpError(409, 'Activate a live MCP service before invoking its tools.')
  }
  const tool = service.tools.find((t) => t.id === toolId)
  if (!tool) throw new HttpError(404, 'MCP tool not found.')
  const result = await executeIdempotentMutation({
    request,
    route: `POST /api/mcp/invoke/${serviceId}/${toolId}`,
    input: { serviceId, toolId },
    operation: async () => ({
      status: 200,
      response: await database.createMcpInvocation(request.auth.context.workspace.id, serviceId, toolId),
    }),
  })
  sendMutationResponse(response, result)
})

app.post(
  '/api/mcp/access-request',
  secureMutations,
  requireAuth,
  async (request, response) => {
    let shouldNotify = false
    const result = await executeIdempotentMutation({
      request,
      route: 'POST /api/mcp/access-request',
      input: {},
      operation: async () => {
        const current = await database.getMcpAccess(request.auth.context.workspace.id)
        if (current.status === 'available') {
          shouldNotify = true
          await database.setMcpAccess(
            request.auth.context.workspace.id,
            process.env.MCP_API_TOKEN ? 'approved' : 'pending',
          )
        }
        const payload = await mcpAccessResponse(request.auth.context)
        return {
          status: payload.status === 'pending' ? 202 : 200,
          response: payload,
        }
      },
    })

    if (shouldNotify && !result.replayed) {
      void sendNotification({
        to: process.env.SMTP_TEST_TO || request.auth.context.user.email,
        subject: 'lancee MCP bearer access request',
        text: `${request.auth.context.user.name} requested bearer access to the MCP Service Grid.`,
        html: `<p><strong>${request.auth.context.user.name}</strong> requested bearer access to the lancee MCP Service Grid.</p>`,
      }).catch(() => undefined)
    }

    sendMutationResponse(response, result)
  },
)

app.post(
  '/api/mcp/access/revoke',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const result = await executeIdempotentMutation({
      request,
      route: 'POST /api/mcp/access/revoke',
      input: {},
      operation: async () => {
        await database.setMcpAccess(request.auth.context.workspace.id, 'available')
        await database.deactivateMcpServices(request.auth.context.workspace.id)
        return {
          status: 200,
          response: await mcpAccessResponse(request.auth.context),
        }
      },
    })
    sendMutationResponse(response, result)
  },
)

app.post(
  '/api/mcp/services/:serviceId',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const serviceId = String(request.params.serviceId || '')
    const active = request.body?.active
    if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(serviceId) || typeof active !== 'boolean') {
      throw new HttpError(400, 'A valid MCP service id and active state are required.')
    }
    if ((await database.getMcpAccess(request.auth.context.workspace.id)).status !== 'approved') {
      throw new HttpError(409, 'Bearer access must be approved before services can change.')
    }

    const result = await executeIdempotentMutation({
      request,
      route: `POST /api/mcp/services/${serviceId}`,
      input: { active },
      operation: async () => ({
        status: 200,
        response: await database.setMcpServiceState(
          request.auth.context.workspace.id,
          serviceId,
          active,
        ),
      }),
    })
    sendMutationResponse(response, result)
  },
)

app.get('/api/money/paystack/status', requireAuth, async (request, response) => {
  response.json(await paystackConnectionResponse(request.auth.context))
})

app.get('/api/money/invoices', requireAuth, async (request, response) => {
  response.json({
    invoices: await database.listInvoices(request.auth.context.workspace.id),
  })
})

app.post(
  '/api/money/paystack/payment-links',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const connection = paystackConnectionResponse(request.auth.context)
    if (!connection.configured) {
      throw new HttpError(
        503,
        'Paystack is not configured for this workspace.',
      )
    }

    const input = validatePaystackInvoiceInput(request.body)
    const idempotencyKey = readIdempotencyKey(request)
    const requestHash = hashSecret(JSON.stringify(input))
    const selectedWorkspaceId = request.auth.context.workspace.id
    let paymentLink = await database.getPaymentLinkByIdempotency(
      selectedWorkspaceId,
      'paystack',
      idempotencyKey,
    )

    if (paymentLink && paymentLink.requestHash !== requestHash) {
      throw new HttpError(
        409,
        'This Idempotency-Key was already used with a different request.',
      )
    }
    if (
      paymentLink &&
      ['pending', 'paid'].includes(paymentLink.paymentStatus) &&
      paymentLink.authorizationUrl
    ) {
      response
        .status(200)
        .set({
          'Cache-Control': 'no-store',
          'Idempotency-Key': idempotencyKey,
          'Idempotency-Replayed': 'true',
        })
        .json(paymentLinkResponse(paymentLink))
      return
    }
    if (paymentLink?.paymentStatus === 'initializing') {
      throw new HttpError(
        409,
        'Paystack initialization is already in progress for this request.',
      )
    }

    let created = false
    if (!paymentLink) {
      created = true
      const createdAt = new Date().toISOString()
      const identity = createHmac('sha256', sessionSecret)
        .update(
          `paystack:${selectedWorkspaceId}:${idempotencyKey}:${createdAt}`,
        )
        .digest('hex')
      const providerReference = `lnc-${identity.slice(0, 32)}`
      paymentLink = await database.transaction(async () =>
        await database.createInvoiceAndPaymentLink({
          invoice: {
            id: `inv_${identity.slice(0, 20)}`,
            workspaceId: selectedWorkspaceId,
            invoiceNumber: `INV-${createdAt
              .slice(0, 10)
              .replaceAll('-', '')}-${identity.slice(0, 6).toUpperCase()}`,
            ...input,
            provider: 'paystack',
            providerReference,
            createdAt,
          },
          paymentLink: {
            id: `pln_${identity.slice(20, 40)}`,
            idempotencyKey,
            requestHash,
          },
        }),
      )
    } else if (
      !(await database.claimFailedPaymentLink({
        selectedWorkspaceId,
        paymentLinkId: paymentLink.id,
      }))
    ) {
      throw new HttpError(409, 'This payment-link request cannot be retried.')
    }

    try {
      const initialized = await paystack.initializeTransaction({
        email: paymentLink.clientEmail,
        amountMinor: paymentLink.amountMinor,
        currency: paymentLink.currency,
        reference: paymentLink.providerReference,
        callbackUrl: parsedPaystackCallbackUrl.toString(),
        metadata: {
          invoice_id: paymentLink.invoiceId,
          invoice_number: paymentLink.invoiceNumber,
          workspace_id: selectedWorkspaceId,
        },
      })
      await database.transaction(async () => {
        await database.markPaymentLinkPending({
          selectedWorkspaceId,
          paymentLinkId: paymentLink.id,
          authorizationUrl: initialized.authorizationUrl,
          accessCode: initialized.accessCode,
        })
      })
    } catch (error) {
      await database.transaction(async () => {
        await database.markPaymentLinkFailed({
          selectedWorkspaceId,
          paymentLinkId: paymentLink.id,
          errorCode:
            error instanceof PaystackError
              ? error.code
              : 'PAYSTACK_INITIALIZE_FAILED',
        })
      })
      throw error
    }

    paymentLink = await database.getPaymentLinkByIdempotency(
      selectedWorkspaceId,
      'paystack',
      idempotencyKey,
    )
    response
      .status(created ? 201 : 200)
      .set({
        'Cache-Control': 'no-store',
        'Idempotency-Key': idempotencyKey,
        'Idempotency-Replayed': 'false',
      })
      .json(paymentLinkResponse(paymentLink))
  },
)

app.get('/api/api-keys', requireAuth, async (request, response) => {
  response.json({
    keys: await database.listApiKeys(request.auth.context.workspace.id),
  })
})

app.post('/api/api-keys', secureMutations, requireAuth, async (request, response) => {
  const name = String(request.body?.name || '').trim()
  if (name.length < 2 || name.length > 80) {
    throw new HttpError(400, 'API-key name must be between 2 and 80 characters.')
  }
  const permissions = validateApiKeyPermissions(request.body?.permissions)

  const result = await executeIdempotentMutation({
    request,
    route: 'POST /api/api-keys',
    input: { name, permissions },
    operation: async (idempotencyKey) => {
      const createdAt = new Date().toISOString()
      const secret = deriveApiKeySecret(
        request.auth.context.workspace.id,
        idempotencyKey,
        createdAt,
      )
      const secretValue = secret.slice('lnc_live_'.length)
      const key = await database.createApiKey({
        id: `key_${createHmac('sha256', sessionSecret)
          .update(
            `api-key-id:${request.auth.context.workspace.id}:${idempotencyKey}:${createdAt}`,
          )
          .digest('hex')
          .slice(0, 20)}`,
        selectedWorkspaceId: request.auth.context.workspace.id,
        createdBy: request.auth.context.user.id,
        name,
        maskedPrefix: `lnc_live_${secretValue.slice(0, 6)}••••${secretValue.slice(-4)}`,
        secretHash: hashSecret(secret),
        permissions,
        createdAt,
      })
      return {
        status: 201,
        response: { key },
      }
    },
  })

  const secret = deriveApiKeySecret(
    request.auth.context.workspace.id,
    result.key,
    result.response.key.createdAt,
  )
  sendMutationResponse(response, result, { ...result.response, secret })
})

app.delete(
  '/api/api-keys/:keyId',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const keyId = String(request.params.keyId || '')
    if (!/^key_[a-f0-9]{20}$/.test(keyId)) {
      throw new HttpError(400, 'A valid API-key id is required.')
    }

    const result = await executeIdempotentMutation({
      request,
      route: `DELETE /api/api-keys/${keyId}`,
      input: {},
      operation: async () => {
        if (!(await database.revokeApiKey(request.auth.context.workspace.id, keyId))) {
          throw new HttpError(404, 'API key not found.')
        }
        return {
          status: 200,
          response: { ok: true, revokedAt: new Date().toISOString() },
        }
      },
    })
    sendMutationResponse(response, result)
  },
)

app.get(
  '/api/v1/workspace',
  requireApiPermission('workspace:read'),
  (request, response) => {
    response.json({
      workspace: {
        id: request.apiAuth.context.workspace.id,
        name: request.apiAuth.context.workspace.name,
      },
      authenticatedBy: {
        keyId: request.apiAuth.apiKey.id,
        permissions: request.apiAuth.apiKey.permissions,
      },
    })
  },
)

app.get('/api/v1/mcp/access', requireApiPermission('mcp:read'), async (request, response) => {
  response.json(await mcpAccessResponse(request.apiAuth.context))
})

app.get('/api/notifications/status', requireAuth, (_request, response) => {
  response.json(getSmtpStatus())
})

app.post(
  '/api/notifications/test',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const recipient = process.env.SMTP_TEST_TO || request.auth.context.user.email
    try {
      const result = await sendNotification({
        to: recipient,
        subject: 'lancee notification test',
        text: 'SMTP notifications are configured correctly for lancee.',
        html: '<p>SMTP notifications are configured correctly for <strong>lancee</strong>.</p>',
      })
      response.json({ ok: true, messageId: result.messageId })
    } catch (error) {
      if (error.code === 'SMTP_NOT_CONFIGURED') {
        response.status(503).json({ error: error.message })
        return
      }
      response.status(502).json({ error: 'The SMTP provider rejected the test message.' })
    }
  },
)

app.get('/api/ai/status', requireAuth, (_request, response) => {
  response.json(getAiStatus())
})

app.post(
  '/api/ai/complete',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const messages = request.body?.messages
    const systemPrompt = request.body?.systemPrompt
    if (!Array.isArray(messages) || messages.length === 0) {
      response.status(400).json({ error: 'Messages array is required.' })
      return
    }
    try {
      const result = await completeChat({ messages, systemPrompt })
      response.json(result)
    } catch (error) {
      if (error instanceof AiError) {
        response.status(error.status).json({ error: error.message, code: error.code })
        return
      }
      response.status(502).json({ error: 'AI request failed.' })
    }
  },
)

app.get('/api/integrations', requireAuth, async (request, response) => {
  response.json({
    integrations: await database.listIntegrations(request.auth.context.workspace.id),
  })
})

app.post(
  '/api/integrations/:id/toggle',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const id = String(request.params.id || '')
    const result = await executeIdempotentMutation({
      request,
      route: `POST /api/integrations/${id}/toggle`,
      input: {},
      operation: async () => {
        const updated = await database.toggleIntegration(request.auth.context.workspace.id, id)
        if (!updated) throw new HttpError(404, 'Integration not found.')
        return { status: 200, response: updated }
      },
    })
    sendMutationResponse(response, result)
  },
)

app.get('/api/workspace/settings', requireAuth, async (request, response) => {
  response.json(
    await database.getWorkspaceSettings(request.auth.context.workspace.id),
  )
})

app.patch(
  '/api/workspace/settings',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const name = String(request.body?.name || '').trim()
    const email = String(request.body?.email || '').trim()
    const timezone = String(request.body?.timezone || 'Africa/Johannesburg').trim()
    const travelMode = String(request.body?.travelMode || 'none').trim()
    const travelLocation = String(request.body?.travelLocation || '').trim()
    const result = await executeIdempotentMutation({
      request,
      route: 'PATCH /api/workspace/settings',
      input: { name, email, timezone, travelMode, travelLocation },
      operation: async () => ({
        status: 200,
        response: await database.updateWorkspaceSettings(request.auth.context.workspace.id, {
          name,
          email,
          timezone,
          travelMode,
          travelLocation,
        }),
      }),
    })
    sendMutationResponse(response, result)
  },
)

app.get('/api/database/info', requireAuth, async (request, response) => {
  response.json(await database.getDatabaseInfo())
})

app.get('/api/workspace/team', requireAuth, async (request, response) => {
  response.json({
    members: await database.listTeamMembers(request.auth.context.workspace.id),
  })
})

app.post('/api/workspace/team/invite', secureMutations, requireAuth, async (request, response) => {
  const email = String(request.body?.email || '').trim()
  const name = String(request.body?.name || '').trim()
  const role = String(request.body?.role || 'collaborator').trim()
  if (!email) {
    throw new HttpError(400, 'Email address is required.')
  }
  const result = await executeIdempotentMutation({
    request,
    route: 'POST /api/workspace/team/invite',
    input: { email, name, role },
    operation: async () => ({
      status: 201,
      response: await database.inviteTeamMember({
        workspaceId: request.auth.context.workspace.id,
        email,
        name,
        role,
      }),
    }),
  })
  sendMutationResponse(response, result)
})

app.get('/api/projects', requireAuth, async (request, response) => {
  response.json({
    projects: await database.listProjects(request.auth.context.workspace.id),
  })
})

app.post('/api/projects', secureMutations, requireAuth, async (request, response) => {
  const name = String(request.body?.name || '').trim()
  const client = String(request.body?.client || '').trim()
  const scope = String(request.body?.scope || 'New project · add deliverables').trim()
  const due = String(request.body?.due || 'Set date').trim()
  const status = String(request.body?.status || 'In progress').trim()
  if (!name || !client) {
    throw new HttpError(400, 'Project name and client name are required.')
  }
  const result = await executeIdempotentMutation({
    request,
    route: 'POST /api/projects',
    input: { name, client, scope, due, status },
    operation: async () => ({
      status: 201,
      response: await database.createProject({
        workspaceId: request.auth.context.workspace.id,
        name,
        client,
        scope,
        due,
        status,
      }),
    }),
  })
  sendMutationResponse(response, result)
})

app.patch('/api/projects/:id', secureMutations, requireAuth, async (request, response) => {
  const id = request.params.id
  const status = String(request.body?.status || '').trim()
  const name = String(request.body?.name || '').trim()
  const client = String(request.body?.client || '').trim()
  const scope = String(request.body?.scope || '').trim()
  const due = String(request.body?.due || '').trim()
  const updated = await database.updateProject(request.auth.context.workspace.id, id, { status, name, client, scope, due })
  if (!updated) {
    throw new HttpError(404, 'Project not found.')
  }
  response.json(updated)
})

app.delete('/api/projects/:id', requireAuth, async (request, response) => {
  await database.deleteProject(request.auth.context.workspace.id, request.params.id)
  response.status(204).end()
})

app.get('/api/projects/:id/links', requireAuth, async (request, response) => {
  const projectId = request.params.id
  response.json({
    links: await database.listProjectLinks(request.auth.context.workspace.id, projectId),
  })
})

app.post('/api/projects/:id/links', secureMutations, requireAuth, async (request, response) => {
  const projectId = request.params.id
  const url = String(request.body?.url || '').trim()
  const label = String(request.body?.label || '').trim()
  if (!url) throw new HttpError(400, 'URL is required.')
  const link = await database.createProjectLink({
    workspaceId: request.auth.context.workspace.id,
    projectId,
    url,
    label,
  })
  response.status(201).json({ link })
})

app.delete('/api/projects/links/:linkId', requireAuth, async (request, response) => {
  await database.deleteProjectLink(request.auth.context.workspace.id, request.params.linkId)
  response.status(204).end()
})

app.get('/api/projects/:id/files', requireAuth, async (request, response) => {
  const projectId = request.params.id
  response.json({
    files: await database.listProjectFiles(request.auth.context.workspace.id, projectId),
  })
})

app.post('/api/projects/:id/files', secureMutations, requireAuth, async (request, response) => {
  const projectId = request.params.id
  const { name, mimeType, size, storageKey } = request.body || {}
  if (!name || !storageKey) throw new HttpError(400, 'File name and storage key are required.')
  const file = await database.createProjectFile({
    workspaceId: request.auth.context.workspace.id,
    projectId,
    name,
    mimeType,
    size,
    storageKey,
  })
  response.status(201).json({ file })
})

app.delete('/api/projects/files/:fileId', requireAuth, async (request, response) => {
  await database.deleteProjectFile(request.auth.context.workspace.id, request.params.fileId)
  response.status(204).end()
})

app.get('/api/workspace/analytics', requireAuth, async (request, response) => {
  const workspaceId = request.auth.context.workspace.id
  const automations = await database.listAutomations(workspaceId)
  const runs = await database.listAutomationRuns(workspaceId)
  const integrations = await database.listIntegrations(workspaceId)
  const projects = await database.listProjects(workspaceId)
  const invoices = await database.listInvoices(workspaceId)

  const activeAutomations = automations.filter((a) => a.status === 'active').length
  const connectedIntegrations = integrations.filter((i) => i.connected).length
  const totalRuns = runs.length
  const successfulRuns = runs.filter((r) => r.status === 'completed').length
  const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 100
  const completedRuns = runs.filter((r) => r.status === 'completed')
  const totalDuration = completedRuns.reduce((sum, r) => sum + (r.duration_seconds || 0), 0)
  const averageRunDurationSec = completedRuns.length > 0 ? Math.round((totalDuration / completedRuns.length) * 10) / 10 : 0
  const totalMinutes = Math.round(totalRuns * averageRunDurationSec / 60)
  const savedHoursThisMonth = Math.round(totalMinutes / 60 * 10) / 10
  const weeklyRuns = {
    Mon: { runs: 0, success: 0 }, Tue: { runs: 0, success: 0 }, Wed: { runs: 0, success: 0 },
    Thu: { runs: 0, success: 0 }, Fri: { runs: 0, success: 0 }, Sat: { runs: 0, success: 0 }, Sun: { runs: 0, success: 0 },
  }
  for (const run of runs) {
    const day = new Date(run.startedAt).toLocaleDateString('en', { weekday: 'short' })
    if (weeklyRuns[day]) {
      weeklyRuns[day].runs++
      if (run.status === 'completed') weeklyRuns[day].success++
    }
  }
  const weeklyActivity = Object.entries(weeklyRuns).map(([day, data]) => ({ day, ...data }))

  const now = new Date()
  const weekEnd = new Date(now)
  weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()))
  const dueThisWeek = projects.filter((p) => {
    if (!p.dueDate) return false
    const due = new Date(p.dueDate)
    return due >= now && due <= weekEnd
  }).length
  const dueSoon = projects.filter((p) => {
    if (!p.dueDate) return false
    const due = new Date(p.dueDate)
    const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    return diff >= 0 && diff <= 14
  }).length

  const clientIds = new Set(projects.map((p) => p.client).filter(Boolean))
  const outstandingAmount = invoices
    .filter((inv) => inv.status === 'pending' || inv.status === 'overdue')
    .reduce((sum, inv) => sum + (inv.amountMinor || 0), 0)
  const pendingInvoices = invoices.filter((inv) => inv.status === 'pending' || inv.status === 'overdue').length

  response.json({
    metrics: {
      activeAutomations,
      connectedIntegrations,
      totalRuns,
      successRate,
      averageRunDurationSec,
      savedHoursThisMonth,
      apiCallsThisMonth: totalRuns * 3,
      databaseQueryTimeMs: 0.8,
      openProjects: projects.length,
      dueSoonProjects: dueSoon,
      totalClients: clientIds.size,
      outstandingAmount,
      pendingInvoices,
      dueThisWeek,
    },
    weeklyActivity,
  })
})


app.get('/api/automations', requireAuth, async (request, response) => {
  response.json({
    automations: await database.listAutomations(request.auth.context.workspace.id),
  })
})

app.post(
  '/api/automations',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const name = String(request.body?.name || '').trim()
    const description = String(request.body?.description || '').trim()
    const model = String(request.body?.model || 'Rules + connected tools').trim()
    if (name.length < 2 || name.length > 120) {
      throw new HttpError(400, 'Automation name must be between 2 and 120 characters.')
    }
    if (description.length < 2 || description.length > 500) {
      throw new HttpError(400, 'Description must be between 2 and 500 characters.')
    }
    const result = await executeIdempotentMutation({
      request,
      route: 'POST /api/automations',
      input: { name, description, model },
      operation: async () => {
        const automation = await database.createAutomation({
          workspaceId: request.auth.context.workspace.id,
          createdBy: request.auth.context.user.id,
          name,
          description,
          model,
        })
        return { status: 201, response: automation }
      },
    })
    sendMutationResponse(response, result)
  },
)

app.post(
  '/api/automations/:id/toggle',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const id = String(request.params.id || '')
    const result = await executeIdempotentMutation({
      request,
      route: `POST /api/automations/${id}/toggle`,
      input: {},
      operation: async () => {
        const updated = await database.toggleAutomation(
          request.auth.context.workspace.id,
          id,
        )
        if (!updated) throw new HttpError(404, 'Automation not found.')
        return { status: 200, response: updated }
      },
    })
    sendMutationResponse(response, result)
  },
)

app.get('/api/automations/runs', requireAuth, async (request, response) => {
  response.json({
    runs: await database.listAutomationRuns(request.auth.context.workspace.id),
  })
})

app.post(
  '/api/automations/runs',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const automationId = String(request.body?.automationId || '').trim()
    const instruction = String(request.body?.instruction || '').trim()
    if (!automationId || !instruction) {
      throw new HttpError(400, 'Automation ID and instruction are required.')
    }
    const result = await executeIdempotentMutation({
      request,
      route: 'POST /api/automations/runs',
      input: { automationId, instruction },
      operation: async () => {
        const run = await database.createAutomationRun({
          workspaceId: request.auth.context.workspace.id,
          automationId,
          triggeredBy: request.auth.context.user.id,
          instruction,
        })
        return { status: 201, response: run }
      },
    })
    sendMutationResponse(response, result)
  },
)

app.use(
  express.static(distDirectory, {
    index: false,
    maxAge: production ? '1h' : 0,
    immutable: false,
  }),
)

app.use((request, response, next) => {
  if (request.method !== 'GET' || request.path.startsWith('/api/')) {
    next()
    return
  }
  response.sendFile(join(distDirectory, 'index.html'))
})

app.use((_request, response) => {
  response.status(404).json({ error: 'Not found.' })
})

app.use((error, _request, response, _next) => {
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message })
    return
  }
  if (error instanceof PaystackError) {
    response.status(error.status).json({
      error: error.message,
      code: error.code,
    })
    return
  }
  if (error instanceof N8nError) {
    response.status(error.status).json({
      error: error.message,
      code: error.code,
    })
    return
  }
  if (error instanceof AiError) {
    response.status(error.status).json({
      error: error.message,
      code: error.code,
    })
    return
  }
  if (error?.type === 'entity.parse.failed') {
    response.status(400).json({ error: 'Invalid JSON request body.' })
    return
  }
  console.error(error)
  response.status(500).json({ error: 'Unexpected server error.' })
})

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`lancee server listening on port ${port}`)
})

function shutdown() {
  server.close(() => {
    database.close()
    process.exit(0)
  })
}

process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
