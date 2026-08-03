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
import { Readable } from 'node:stream'
import { resolveCname, resolveTxt } from 'node:dns/promises'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { openDatabase } from './database.mjs'
import {
  getSmtpStatus,
  sendNotification,
  registrationEmail,
  invitationEmail,
  clientReviewEmail,
  invoiceEmail,
  mcpAccessEmail,
  testEmail,
} from './notifications.mjs'
import {
  createPaystackClient,
  decryptPaystackSecret,
  encryptPaystackSecret,
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
import {
  coreToolCatalog,
  automationPlan,
  executeCoreAutomation,
  CoreAutomationError,
} from './core.mjs'
import {
  mailRuleInstruction,
  mailRuleMatches,
} from './mail-automation.mjs'
import { createRedisRuntime } from './redis.mjs'
import {
  createLanceeMcpRuntime,
  LanceeMcpError,
  lanceeMcpScope,
  lanceeMcpToolDefinitions,
} from './lancee-mcp.mjs'
import {
  createMcpGatewayClient,
  McpGatewayError,
} from './mcp.mjs'
import {
  createBaseboxMcpClient,
  BaseboxMcpError,
  defaultBaseboxMcpUrl,
} from './basebox-mcp.mjs'
import {
  decryptToken,
  encryptToken,
  VaultError,
} from './vault.mjs'
import {
  discoverMailSettings,
  fetchNewMailMessages,
  getMailMessage,
  listMailFolders,
  listMailMessages,
  MailConnectorError,
  normalizeMailSettings,
  sendMailMessage,
  testMailAccount,
} from './mail.mjs'
import {
  createCodexAppServerManager,
  CodexAppServerError,
} from './codex-app-server.mjs'
import {
  accessTokenIsFresh,
  buildGoogleAuthUrl,
  createOAuthState,
  decryptDriveSecret,
  driveStatusResponse,
  encryptDriveSecret,
  exchangeAuthorizationCode,
  getGoogleDriveConfig,
  GoogleDriveError,
  convertDriveEditorContent,
  fetchGoogleDriveFileContent,
  getGoogleDriveFileMetadata,
  listGoogleDriveFiles,
  loadGoogleDriveEditorDocument,
  loadEditorDocumentFromBuffer,
  parseOAuthState,
  refreshGoogleAccessToken,
  trashGoogleDriveFile,
  tokenHasDriveFileScope,
  updateGoogleDriveFileContent,
  uploadGoogleDriveFile,
} from './google-drive.mjs'

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
const codexRuntimeDirectory = join(runtimeDirectory, 'codex')
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
const registrationEnabled =
  process.env.ALLOW_REGISTRATION !== 'false'
const publicOrigin = process.env.PUBLIC_ORIGIN || 'https://lancee.hookitupservices.com'
const publicHostname = new URL(publicOrigin).hostname
const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const adminName = (process.env.ADMIN_NAME || 'Workspace Admin').trim()
const workspaceId = (process.env.WORKSPACE_ID || 'wsp_primary').trim()
const workspaceName = (process.env.WORKSPACE_NAME || 'Hookitup Solutions').trim()
const mcpGatewayUrl =
  process.env.MCP_GATEWAY_URL || 'https://mcp.hygridtech.co.za'
const configuredMcpTimeout = Number.parseInt(process.env.MCP_TIMEOUT_MS || '30000', 10)
const allowedMcpCategories = new Set(
  String(process.env.MCP_ALLOWED_CATEGORIES || 'Browser,Utilities')
    .split(',')
    .map((category) => category.trim())
    .filter(Boolean),
)
const n8nBaseUrl =
  process.env.N8N_BASE_URL || 'https://n8n.hygridtech.co.za'
const n8nDefaultSigningSecret = (process.env.N8N_SIGNING_SECRET || '').trim()
const n8nPrivateNetwork = process.env.N8N_PRIVATE_NETWORK === 'true'
const n8nAllowPrivate =
  process.env.N8N_ALLOW_PRIVATE === 'true' && (!production || n8nPrivateNetwork)
const n8nAllowInsecure = !production || n8nPrivateNetwork
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
const deviceAuthorizationAttempts = new Map()
const apiKeyPermissions = new Set(['workspace:read', 'mcp:read', 'ai:invoke'])
const codexClientId = 'lancee-codex-plugin'
const codexAiScope = 'ai:invoke'
const codexScopes = new Set([codexAiScope, lanceeMcpScope])
const deviceCodeTtlSeconds = 10 * 60
const codexTokenTtlSeconds = 30 * 24 * 60 * 60

function normalizeStorefrontDomain(value) {
  const candidate = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\.$/, '')
  if (
    !candidate ||
    candidate.length > 253 ||
    candidate.includes('/') ||
    candidate.includes(':') ||
    candidate === publicHostname
  ) {
    throw new HttpError(400, 'Enter a custom domain, such as shop.example.com.')
  }
  const labels = candidate.split('.')
  if (
    labels.length < 2 ||
    labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  ) {
    throw new HttpError(400, 'Enter a valid domain without spaces or a path.')
  }
  return candidate
}

function storefrontDomainResponse(record) {
  return {
    id: record.id,
    domain: record.domain,
    status: record.status,
    createdAt: record.createdAt,
    verifiedAt: record.verifiedAt,
    dns: {
      txtName: `_lancee.${record.domain}`,
      txtValue: `lancee-verify=${record.verificationToken}`,
      cnameName: record.domain,
      cnameTarget: publicHostname,
    },
  }
}
const codexBinary = (process.env.CODEX_BINARY || 'codex').trim()
const configuredCodexWorkspaceRoot = (
  process.env.CODEX_WORKSPACE_ROOT || projectDirectory
).trim()
const codexWorkspaceRoot = isAbsolute(configuredCodexWorkspaceRoot)
  ? resolve(configuredCodexWorkspaceRoot)
  : resolve(projectDirectory, configuredCodexWorkspaceRoot)

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
await database.scrubN8nDeliveryEvents()
const coreRedis = await createRedisRuntime()
if (!coreRedis.connected) {
  console.warn('Redis is unavailable; Core automation jobs will use the in-process fallback.')
}
const paystack = createPaystackClient({
  secretKey: paystackSecretKey,
  baseUrl: paystackBaseUrl,
  allowInsecure: !production,
})
const n8nDeliveryClient = createN8nDeliveryClient({
  timeoutMilliseconds: n8nTimeoutMilliseconds,
})
const mcpGateway = createMcpGatewayClient({
  gatewayUrl: mcpGatewayUrl,
  token: process.env.MCP_API_TOKEN,
  allowInsecure: !production,
  timeoutMilliseconds: Number.isFinite(configuredMcpTimeout)
    ? configuredMcpTimeout
    : 30_000,
})
const baseboxMcp = createBaseboxMcpClient({
  mcpUrl: process.env.BASEBOX_MCP_URL || defaultBaseboxMcpUrl,
  token:
    process.env.BASEBOX_MCP_ACCESS_KEY ||
    process.env.MCP_ACCESS_KEY ||
    process.env.BASEBOX_BEARER_KEY,
  allowInsecure: !production,
  timeoutMilliseconds: Number.isFinite(configuredMcpTimeout)
    ? configuredMcpTimeout
    : 30_000,
})
const mcpProvidersConfigured = mcpGateway.configured || baseboxMcp.configured
const primaryMcpUrl = mcpGateway.configured ? mcpGateway.gatewayUrl : baseboxMcp.mcpUrl
const primaryMcpCapabilityEndpoint = mcpGateway.configured ? '/api/v1/capabilities' : '/mcp'
const codexAppServer = createCodexAppServerManager({
  binary: codexBinary,
  dataDirectory: codexRuntimeDirectory,
  workspaceRoot: codexWorkspaceRoot,
})
const paystackCallbackUrl =
  process.env.PAYSTACK_CALLBACK_URL || `${publicOrigin}/?payment=paystack`
const parsedPaystackCallbackUrl = new URL(paystackCallbackUrl)
if (production && parsedPaystackCallbackUrl.protocol !== 'https:') {
  throw new Error('PAYSTACK_CALLBACK_URL must use HTTPS in production.')
}
const existingPaystackConnection = await database.getPaymentConnection(
  workspaceId,
  'paystack',
)
if (
  !existingPaystackConnection.updatedAt ||
  existingPaystackConnection.credentialSource === 'environment'
) {
  await database.upsertPaymentConnection({
    selectedWorkspaceId: workspaceId,
    provider: 'paystack',
    configured: paystack.configured,
    mode: paystack.mode,
    credentialSource: paystack.configured ? 'environment' : 'none',
    keyFingerprint: paystack.keyFingerprint,
  })
}

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
    avatarUrl: context.user.avatarUrl || '',
    workspaceId: context.workspace.id,
    workspace: context.workspace.name,
    role: context.membership.role,
    initials: initialsFor(context.user.name),
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function createWorkspaceAccount({ email, password, name, workspaceName }) {
  const now = nowIso()
  const passwordSalt = randomBytes(16).toString('hex')
  const passwordHash = scryptSync(password, passwordSalt, 64).toString('hex')
  const userId = stableId('usr', email)
  const workspaceIdForAccount = `wsp_${createHash('sha256').update(`${email}:${now}`).digest('hex').slice(0, 20)}`

  await database.transaction(async () => {
    await database.query(
      `INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
      [workspaceIdForAccount, workspaceName, now, now],
    )
    await database.query(
      `INSERT INTO users (id, email, name, password_salt, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, email, name, passwordSalt, passwordHash, now, now],
    )
    await database.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES ($1, $2, 'owner', $3)`,
      [workspaceIdForAccount, userId, now],
    )
    await database.query(
      `INSERT INTO mcp_access (workspace_id, status, updated_at) VALUES ($1, 'available', $2)`,
      [workspaceIdForAccount, now],
    )
    await database.query(
      `INSERT INTO workspace_settings (workspace_id, name, updated_at) VALUES ($1, $2, $3)`,
      [workspaceIdForAccount, workspaceName, now],
    )
    const defaultIntegrations = [
      { id: 'drive', connected: 0 },
      { id: 'paystack', connected: 0 },
      { id: 'n8n', connected: 0 },
      { id: 'mcp-grid', connected: 0 },
      { id: 'codex-ai', connected: 0 },
      { id: 'codex-runtime', connected: 0 },
      { id: 'mail', connected: 0 },
    ]
    for (const integration of defaultIntegrations) {
      await database.query(
        `INSERT INTO workspace_integrations (workspace_id, integration_id, connected, updated_at) VALUES ($1, $2, $3, $4)`,
        [workspaceIdForAccount, integration.id, integration.connected, now],
      )
    }
  })

  return await database.getContextByIds(userId, workspaceIdForAccount)
}

function codexRuntimeClient(request) {
  const { workspace, user } = request.auth.context
  return codexAppServer.clientFor(`${workspace.id}:${user.id}`)
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

function createSessionCookie(context) {
  return [
    `lancee_session=${encodeURIComponent(createSessionToken(context))}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${sessionTtlSeconds}`,
    production ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
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
  response.once('finish', () => {
    void database
      .recordApiRequest(session.context.workspace.id, response.statusCode >= 400)
      .catch(() => undefined)
  })
  next()
}

function requireOwner(request, response, next) {
  if (request.auth?.context?.membership?.role !== 'owner') {
    response.status(403).json({ error: 'Workspace owner access is required.' })
    return
  }
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

function rateLimitDeviceAuthorization(request, response, next) {
  const now = Date.now()
  const windowMilliseconds = 15 * 60 * 1000
  const address = clientAddress(request)
  const attempts = (deviceAuthorizationAttempts.get(address) || []).filter(
    (timestamp) => now - timestamp < windowMilliseconds,
  )
  if (attempts.length >= 60) {
    response
      .status(429)
      .set('Retry-After', '900')
      .json({ error: 'Device authorization rate limit exceeded.' })
    return
  }
  deviceAuthorizationAttempts.set(address, [...attempts, now])
  next()
}

function secureMutations(request, response, next) {
  const origin = request.headers.origin
  const requestOrigin = `${request.protocol}://${request.get('host')}`
  const allowedOrigins = new Set([
    new URL(publicOrigin).origin,
    new URL(requestOrigin).origin,
  ])
  if (origin && !allowedOrigins.has(origin)) {
    response.status(403).json({ error: 'Origin not allowed.' })
    return
  }
  next()
}

function normalizeDeviceUserCode(value) {
  const compact = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  return compact.length === 8
    ? `${compact.slice(0, 4)}-${compact.slice(4)}`
    : ''
}

function createDeviceUserCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(8)
  const compact = [...bytes]
    .map((byte) => alphabet[byte % alphabet.length])
    .join('')
  return `${compact.slice(0, 4)}-${compact.slice(4)}`
}

function oauthError(response, error, description, status = 400) {
  response.status(status).set('Cache-Control', 'no-store').json({
    error,
    error_description: description,
  })
}

function requireCodexScope(scope) {
  return async (request, response, next) => {
    response.set('Cache-Control', 'no-store')
    const authorization = String(request.get('Authorization') || '')
    const match = authorization.match(/^Bearer (lnc_codex_[A-Za-z0-9_-]+)$/)
    if (!match) {
      response.status(401).json({ error: 'A valid Codex connector token is required.' })
      return
    }
    const tokenRecord = await database.getCodexAccessToken(hashSecret(match[1]))
    if (!tokenRecord) {
      response.status(401).json({ error: 'The Codex connector token is invalid or expired.' })
      return
    }
    if (!tokenRecord.token.scopes.includes(scope)) {
      response.status(403).json({ error: `Connector token lacks ${scope} scope.` })
      return
    }
    const context = await database.getContextByIds(
      tokenRecord.user.id,
      tokenRecord.workspace.id,
    )
    if (!context) {
      response.status(401).json({ error: 'The connector workspace is unavailable.' })
      return
    }
    request.codexAuth = { token: tokenRecord.token, context }
    next()
  }
}

async function mcpAccessResponse(context) {
  const access = await database.getMcpAccess(context.workspace.id)
  return {
    platformFeature: true,
    status: access.status,
    gatewayUrl: primaryMcpUrl,
    requestedAt: access.requestedAt,
    approvalMode: mcpProvidersConfigured ? 'automatic' : 'manual',
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
    await database.lockIdempotency(selectedWorkspaceId, route, key)
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
    webhookUrl: new URL(
      `/api/webhooks/paystack/${encodeURIComponent(context.workspace.id)}`,
      publicOrigin,
    ).toString(),
  }
}

async function paystackClientForWorkspace(selectedWorkspaceId) {
  const connection = await database.getPaymentConnection(
    selectedWorkspaceId,
    'paystack',
  )
  let secretKey = ''
  if (
    connection.configured &&
    connection.credentialSource === 'workspace' &&
    connection.secretCiphertext
  ) {
    secretKey = decryptPaystackSecret(
      connection.secretCiphertext,
      sessionSecret,
    )
  } else if (
    connection.configured &&
    connection.credentialSource === 'environment'
  ) {
    secretKey = paystackSecretKey
  }
  return createPaystackClient({
    secretKey,
    baseUrl: paystackBaseUrl,
    allowInsecure: !production,
  })
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

const n8nSensitiveEventKeys = new Set([
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'api_key',
  'apikey',
  'client_secret',
  'clientsecret',
  'token',
  'bearertoken',
  'password',
  'secret',
  'auth',
  'authorization',
])

function sanitizeN8nEvent(value) {
  if (Array.isArray(value)) return value.map(sanitizeN8nEvent)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !n8nSensitiveEventKeys.has(key.toLowerCase()))
      .map(([key, child]) => [key, sanitizeN8nEvent(child)]),
  )
}

async function materializeN8nEvent(context, event) {
  const sanitized = sanitizeN8nEvent(event)
  if (
    sanitized?.type !== 'lancee.automation.run' ||
    !sanitized.provider
  ) {
    return sanitized
  }
  const auth = await resolveEdgeAuthToken(
    context.workspace.id,
    String(sanitized.provider),
  )
  return { ...sanitized, auth }
}

function isRetryableN8nError(error) {
  if (!(error instanceof N8nError)) return false
  if (['N8N_TIMEOUT', 'N8N_UNREACHABLE'].includes(error.code)) return true
  return error.responseStatus === 429 || error.responseStatus >= 500
}

async function deliverN8nWithRetry(deliveryOptions) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await n8nDeliveryClient.deliver(deliveryOptions)
    } catch (error) {
      lastError = error
      if (!isRetryableN8nError(error) || attempt === 2) throw error
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt))
    }
  }
  throw lastError
}

async function performN8nOutboundDelivery(context, delivery) {
  const selectedWorkspaceId = context.workspace.id
  const connection = await database.getN8nConnection(selectedWorkspaceId)
  const secret = n8nConnectionSecret(connection)
  const target = await validateN8nWebhookUrl({
    value: connection.outboundUrl,
    allowedBaseUrl: n8nBaseUrl,
    allowInsecure: n8nAllowInsecure,
    allowPrivate: n8nAllowPrivate,
  })

  try {
    const event = await materializeN8nEvent(context, delivery.event)
    const delivered = await deliverN8nWithRetry({
      targetUrl: target.toString(),
      method: delivery.method,
      secret,
      correlationId: delivery.correlationId,
      deliveryId: delivery.id,
      event,
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

async function executeAutomationRun(context, automation, run, provider, options = {}) {
  const startedAt = performance.now()
  const selectedWorkspaceId = context.workspace.id
  const mailEventId = options.mailEventId || null
  try {
    let result
    if (automation.execution === 'edge') {
      result = await executeEdgeAutomationRun(
        context,
        automation,
        run,
        provider,
      )
    } else {
      result = await executeCoreAutomationRun(
        context,
        automation,
        run,
        startedAt,
      )
    }
    if (mailEventId) {
      await database.completeMailRuleEvent(selectedWorkspaceId, mailEventId, {
        status: 'completed',
        runId: run.id,
      }).catch(() => {})
    }
    return result
  } catch (error) {
    await database.appendAutomationRunEvent({
      workspaceId: selectedWorkspaceId,
      runId: run.id,
      level: 'error',
      eventType: 'run.failed',
      message: error?.message || 'Automation execution failed.',
      output: { code: error?.code || 'AUTOMATION_EXECUTION_FAILED' },
    }).catch(() => {})
    await database.completeAutomationRun({
      selectedWorkspaceId,
      id: run.id,
      status: 'failed',
      durationSeconds: Math.max(
        1,
        Math.round((performance.now() - startedAt) / 1000),
      ),
      steps: 1,
      errorCode: error?.code || 'AUTOMATION_EXECUTION_FAILED',
    })
    if (mailEventId) {
      await database.completeMailRuleEvent(selectedWorkspaceId, mailEventId, {
        status: 'failed',
        runId: run.id,
        error: error?.message || 'Automation execution failed.',
      }).catch(() => {})
    }
    throw error
  }
}

function mailPassword(account) {
  if (!account?.passwordCiphertext || !account?.passwordIv || !account?.passwordTag) {
    throw new MailConnectorError('MAIL_CREDENTIAL_UNAVAILABLE', 'The saved mailbox credential is unavailable.', 500)
  }
  return decryptToken({
    encrypted_access_token: account.passwordCiphertext,
    iv: account.passwordIv,
    auth_tag: account.passwordTag,
  })
}

function mailAccountResponse(account) {
  if (!account) return { connected: false, account: null }
  return {
    connected: account.status === 'connected',
    account: {
      email: account.email,
      displayName: account.displayName,
      username: account.username,
      provider: account.provider,
      imapHost: account.imapHost,
      imapPort: account.imapPort,
      imapSecure: account.imapSecure,
      smtpHost: account.smtpHost,
      smtpPort: account.smtpPort,
      smtpSecure: account.smtpSecure,
      status: account.status,
      lastSyncedAt: account.lastSyncedAt,
      lastError: account.lastError,
      updatedAt: account.updatedAt,
    },
  }
}

function normalizeMailRuleInput(input) {
  const keywords = Array.isArray(input?.keywords)
    ? input.keywords
    : String(input?.keywords || '').split(',')
  const normalized = {
    automationId: String(input?.automationId || '').trim(),
    name: String(input?.name || '').trim().slice(0, 120),
    sender: String(input?.sender || '').trim().toLowerCase().slice(0, 320),
    recipient: String(input?.recipient || '').trim().toLowerCase().slice(0, 320),
    subject: String(input?.subject || '').trim().toLowerCase().slice(0, 500),
    keywords: [...new Set(keywords.map((keyword) => String(keyword).trim().toLowerCase()).filter(Boolean))].slice(0, 20),
    matchMode: input?.matchMode === 'any' ? 'any' : 'all',
    instruction: String(input?.instruction || '').trim().slice(0, 5_000),
    enabled: input?.enabled !== false,
  }
  if (!normalized.automationId || !normalized.name || !normalized.instruction) {
    throw new HttpError(400, 'Rule name, native automation, and instruction are required.')
  }
  if (!normalized.sender && !normalized.recipient && !normalized.subject && !normalized.keywords.length) {
    throw new HttpError(400, 'Add at least one sender, recipient, subject, or keyword condition.')
  }
  return normalized
}

const mailSyncInFlight = new Set()

async function syncMailWorkspace(account) {
  if (!account || mailSyncInFlight.has(account.workspaceId)) return { newMessages: 0, triggered: 0, skipped: true }
  mailSyncInFlight.add(account.workspaceId)
  try {
    const password = mailPassword(account)
    const result = await fetchNewMailMessages(account, password, account.lastSeenUid, 50)
    const rules = (await database.listMailAutomationRules(account.workspaceId)).filter((rule) => rule.enabled)
    let triggered = 0
    for (const message of result.messages) {
      for (const rule of rules) {
        if (!mailRuleMatches(rule, message)) continue
        const automation = await database.getAutomation(account.workspaceId, rule.automationId)
        if (!automation || automation.status !== 'active' || automation.execution !== 'core') continue
        const messageKey = `${account.email}:${message.messageId || `uid:${message.uid}`}`
        const eventId = await database.claimMailRuleEvent({
          workspaceId: account.workspaceId,
          ruleId: rule.id,
          messageKey,
        })
        if (!eventId) continue
        try {
          const context = await database.getContextByIds(rule.createdBy, account.workspaceId)
          if (!context) throw new Error('The rule owner no longer has access to this workspace.')
          const run = await database.createAutomationRun({
            workspaceId: account.workspaceId,
            automationId: automation.id,
            triggeredBy: rule.createdBy,
            instruction: mailRuleInstruction(rule, message),
          })
          await database.appendAutomationRunEvent({
            workspaceId: account.workspaceId,
            runId: run.id,
            eventType: 'mail.triggered',
            message: `Triggered by mail rule “${rule.name}”.`,
            output: {
              ruleId: rule.id,
              messageId: message.messageId || null,
              sender: (message.from || []).map((address) => address.address).filter(Boolean),
              recipient: [...(message.to || []), ...(message.cc || [])].map((address) => address.address).filter(Boolean),
              subject: message.subject,
              execution: 'core',
            },
          })
          const queued = await coreRedis.enqueue({
            workspaceId: account.workspaceId,
            userId: rule.createdBy,
            automationId: automation.id,
            runId: run.id,
            provider: null,
            mailEventId: eventId,
          })
          if (!queued) {
            void executeAutomationRun(context, automation, run, null, { mailEventId: eventId }).catch((error) => {
              console.error('Mail-triggered automation failed:', error)
            })
          }
          triggered += 1
        } catch (error) {
          await database.completeMailRuleEvent(account.workspaceId, eventId, {
            status: 'failed',
            error: error?.message || 'Unable to create the automation run.',
          })
        }
      }
    }
    await database.updateMailSyncState(account.workspaceId, { lastSeenUid: result.maximumUid })
    if (result.messages.length > 0) {
      const firstMessage = result.messages[0]
      const sender = firstMessage.from?.[0]?.address || firstMessage.from?.[0]?.name || 'A contact'
      const subject = firstMessage.subject || '(No subject)'
      const suffix = result.messages.length > 1
        ? ` and ${result.messages.length - 1} more message${result.messages.length === 2 ? '' : 's'}`
        : ''
      await database.createWorkspaceNotification({
        workspaceId: account.workspaceId,
        kind: 'mail.received',
        title: `${result.messages.length} new message${result.messages.length === 1 ? '' : 's'} received`,
        body: `${sender}: ${subject}${suffix}.`,
        entityType: 'mail',
        entityId: firstMessage.messageId || `mail_${account.workspaceId}_${firstMessage.uid}`,
      })
    }
    return { newMessages: result.messages.length, triggered, skipped: false }
  } catch (error) {
    await database.updateMailSyncState(account.workspaceId, {
      lastSeenUid: account.lastSeenUid,
      error: error?.message || 'Mailbox sync failed.',
    }).catch(() => {})
    throw error
  } finally {
    mailSyncInFlight.delete(account.workspaceId)
  }
}

async function executeCoreAutomationRun(context, automation, run, startedAt) {
  const selectedWorkspaceId = context.workspace.id
  const log = (event) => database.appendAutomationRunEvent({
    workspaceId: selectedWorkspaceId,
    runId: run.id,
    ...event,
  })
  await log({
    eventType: 'run.started',
    message: 'Core worker started a permission-checked automation run.',
    output: { execution: 'core' },
  })
  const execution = await executeCoreAutomation({
    context,
    automation,
    run,
    database,
    log,
  })
  return await database.completeAutomationRun({
    selectedWorkspaceId,
    id: run.id,
    status: 'completed',
    durationSeconds: Math.max(
      1,
      Math.round((performance.now() - startedAt) / 1000),
    ),
    steps: execution.steps,
    errorCode: null,
  })
}

async function resolveEdgeAuthToken(selectedWorkspaceId, provider) {
  if (!provider) return null
  const stored = await database.getTenantIntegrationToken(
    selectedWorkspaceId,
    provider,
  )
  if (!stored) {
    throw new VaultError(
      'VAULT_TOKEN_NOT_FOUND',
      `No encrypted integration token is configured for ${provider}.`,
      409,
    )
  }
  const plainTextToken = decryptToken({
    encrypted_access_token: stored.encryptedAccessToken,
    iv: stored.iv,
    auth_tag: stored.authTag,
  })
  return {
    token_type: stored.tokenType || 'Bearer',
    access_token: plainTextToken,
  }
}

async function executeEdgeAutomationRun(
  context,
  automation,
  run,
  provider,
) {
  const selectedWorkspaceId = context.workspace.id
  const connection = await database.getN8nConnection(selectedWorkspaceId)
  n8nConnectionSecret(connection)
  const event = {
    type: 'lancee.automation.run',
    workspaceId: selectedWorkspaceId,
    runId: run.id,
    automation: {
      id: automation.id,
      name: automation.name,
      description: automation.description,
    },
    instruction: run.instruction,
    requestedBy: context.user.id,
    requestedAt: run.startedAt,
    callbackUrl: new URL(
      n8nCallbackPath(selectedWorkspaceId),
      publicOrigin,
    ).toString(),
    ...(provider ? { provider } : {}),
  }
  const serializedEvent = JSON.stringify(event)
  const identity = createHash('sha256')
    .update(`${selectedWorkspaceId}:${run.id}`)
    .digest('hex')
  const delivery = await database.createN8nDelivery({
    id: `dlv_${identity.slice(0, 24)}`,
    selectedWorkspaceId,
    direction: 'outbound',
    method: 'POST',
    targetUrl: connection.outboundUrl,
    correlationId: `cor_${identity.slice(24, 48)}`,
    requestHash: hashBody(Buffer.from(serializedEvent)),
    eventType: event.type,
    event,
    idempotencyKey: `automation:${run.id}`,
  })
  await performN8nOutboundDelivery(context, delivery)
  return await database.getAutomationRun(selectedWorkspaceId, run.id)
}

async function applyN8nAutomationCallback(selectedWorkspaceId, event) {
  if (event?.type !== 'lancee.automation.result') return null
  const runId = String(event.runId || '')
  if (!/^run_[a-f0-9]{12}$/.test(runId)) return null
  const status = event.status === 'failed'
    ? 'failed'
    : event.status === 'completed'
      ? 'completed'
      : null
  if (!status) return null

  const run = await database.getAutomationRun(selectedWorkspaceId, runId)
  if (!run || run.status !== 'running') return null
  const requestedDuration = Number(event.durationSeconds)
  const durationSeconds = Number.isFinite(requestedDuration)
    ? Math.max(1, Math.round(requestedDuration))
    : Math.max(1, Math.round((Date.now() - Date.parse(run.startedAt)) / 1000))
  const requestedSteps = Number(event.steps)
  const steps = Number.isFinite(requestedSteps)
    ? Math.max(1, Math.min(10_000, Math.round(requestedSteps)))
    : 2
  const errorCode = status === 'failed'
    ? String(event.errorCode || 'EDGE_EXECUTION_FAILED').slice(0, 120)
    : null
  const callbackOutput = event.output !== undefined
    ? event.output
    : event.result !== undefined
      ? event.result
      : event.summary !== undefined
        ? { summary: event.summary }
        : status === 'failed'
          ? { code: errorCode }
          : { status, steps }
  return await database.transaction(async () => {
    await database.appendAutomationRunEvent({
      workspaceId: selectedWorkspaceId,
      runId,
      level: status === 'failed' ? 'error' : 'info',
      eventType: status === 'failed' ? 'run.failed' : 'run.completed',
      message: status === 'failed'
        ? 'The connected automation reported a failure.'
        : 'The connected automation completed successfully.',
      output: callbackOutput,
      durationMs: durationSeconds * 1_000,
    })
    return await database.completeAutomationRun({
      selectedWorkspaceId,
      id: runId,
      status,
      durationSeconds,
      steps,
      errorCode,
    })
  })
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

    const apiKeyRecord = await database.getApiKeyByHash(hashSecret(match[1]))
    if (!apiKeyRecord) {
      response.status(401).json({ error: 'A valid lancee API key is required.' })
      return
    }
    const apiKey = apiKeyRecord.key
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

  await applyN8nAutomationCallback(selectedWorkspaceId, event)

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
      "default-src 'self'; script-src 'self' https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-src https://apis.google.com https://docs.google.com https://drive.google.com https://accounts.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  })
  next()
})

async function handlePaystackWebhook(
  request,
  response,
  paystackClient,
  expectedWorkspaceId = null,
) {
  response.set('Cache-Control', 'no-store')
  if (!paystackClient.configured) {
    response.status(503).json({ error: 'Paystack is not configured.' })
    return
  }
  if (
    !Buffer.isBuffer(request.body) ||
    !paystackClient.verifyWebhook(
      request.body,
      request.get('x-paystack-signature'),
    )
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
  const eventKey =
    `${expectedWorkspaceId || 'legacy'}:${eventType}:` +
    `${providerReference || 'none'}:${transactionIdentity}`
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

  const paymentLink = await database.getPaymentLinkByReference(providerReference)
  if (
    !paymentLink ||
    (expectedWorkspaceId && paymentLink.workspaceId !== expectedWorkspaceId)
  ) {
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
}

const paystackWebhookBody = express.raw({
  type: 'application/json',
  limit: '256kb',
})

app.post(
  '/api/webhooks/paystack/:workspaceId',
  paystackWebhookBody,
  async (request, response) => {
    const selectedWorkspaceId = String(request.params.workspaceId || '')
    if (!/^wsp_[A-Za-z0-9._-]{3,96}$/.test(selectedWorkspaceId)) {
      response.status(404).json({ error: 'Paystack webhook not found.' })
      return
    }
    await handlePaystackWebhook(
      request,
      response,
      await paystackClientForWorkspace(selectedWorkspaceId),
      selectedWorkspaceId,
    )
  },
)

app.post(
  '/api/webhooks/paystack',
  paystackWebhookBody,
  async (request, response) => {
    await handlePaystackWebhook(request, response, paystack)
  },
)

app.get('/api/hooks/n8n/:workspaceId', handleInboundN8n)
app.post(
  '/api/hooks/n8n/:workspaceId',
  express.raw({ type: 'application/json', limit: '256kb' }),
  handleInboundN8n,
)

app.get(
  '/api/ideas/boards/:boardId/scene',
  requireAuth,
  async (request, response) => {
    const boardId = validateIdeaBoardId(request.params.boardId)
    const scene = await database.getIdeaCanvasScene(
      request.auth.context.workspace.id,
      boardId,
    )
    response.json({ scene })
  },
)

app.put(
  '/api/ideas/boards/:boardId/scene',
  secureMutations,
  requireAuth,
  express.json({ limit: '10mb' }),
  async (request, response) => {
    const boardId = validateIdeaBoardId(request.params.boardId)
    const scene = request.body?.scene
    if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
      throw new HttpError(400, 'A valid canvas scene object is required.')
    }
    const saved = await database.saveIdeaCanvasScene({
      selectedWorkspaceId: request.auth.context.workspace.id,
      boardId,
      sceneJson: JSON.stringify(scene),
    })
    response.json({ scene: saved })
  },
)

app.use(express.urlencoded({ extended: false, limit: '8kb' }))
app.use(express.json({ limit: '24kb' }))

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'lancee-agents-platform',
    core: { redis: coreRedis.connected },
  })
})

app.get('/.well-known/oauth-authorization-server', (_request, response) => {
  response.json({
    issuer: publicOrigin,
    device_authorization_endpoint: `${publicOrigin}/api/codex/device/code`,
    token_endpoint: `${publicOrigin}/api/codex/device/token`,
    grant_types_supported: [
      'urn:ietf:params:oauth:grant-type:device_code',
    ],
    scopes_supported: [...codexScopes],
    token_endpoint_auth_methods_supported: ['none'],
  })
})

app.post(
  '/api/codex/device/code',
  rateLimitDeviceAuthorization,
  async (request, response) => {
    response.set('Cache-Control', 'no-store')
    const clientId = String(request.body?.client_id || '').trim()
    const scope = String(request.body?.scope || '').trim()
    if (clientId !== codexClientId) {
      oauthError(response, 'invalid_client', 'Unknown device client.', 401)
      return
    }
    const requestedScopes = [...new Set(scope.split(/\s+/).filter(Boolean))]
    if (!requestedScopes.length || requestedScopes.some((requestedScope) => !codexScopes.has(requestedScope))) {
      oauthError(response, 'invalid_scope', `Supported scopes: ${[...codexScopes].join(' ')}.`)
      return
    }
    const normalizedScope = requestedScopes.join(' ')

    const deviceCode = randomBytes(32).toString('base64url')
    const userCode = createDeviceUserCode()
    const expiresAt = new Date(
      Date.now() + deviceCodeTtlSeconds * 1000,
    ).toISOString()
    await database.createCodexDeviceAuthorization({
      deviceCodeHash: hashSecret(deviceCode),
      userCodeHash: hashSecret(userCode),
      clientId,
      scope: normalizedScope,
      expiresAt,
    })
    const verificationUri = `${publicOrigin}/?device=${encodeURIComponent(userCode)}`
    response.status(201).json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: verificationUri,
      verification_uri_complete: verificationUri,
      expires_in: deviceCodeTtlSeconds,
      interval: 5,
    })
  },
)

app.post(
  '/api/codex/device/token',
  rateLimitDeviceAuthorization,
  async (request, response) => {
    response.set('Cache-Control', 'no-store')
    const grantType = String(request.body?.grant_type || '').trim()
    const clientId = String(request.body?.client_id || '').trim()
    const deviceCode = String(request.body?.device_code || '').trim()
    if (grantType !== 'urn:ietf:params:oauth:grant-type:device_code') {
      oauthError(response, 'unsupported_grant_type', 'Use the OAuth device-code grant.')
      return
    }
    if (clientId !== codexClientId) {
      oauthError(response, 'invalid_client', 'Unknown device client.', 401)
      return
    }
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(deviceCode)) {
      oauthError(response, 'invalid_grant', 'The device code is invalid.')
      return
    }

    const deviceCodeHash = hashSecret(deviceCode)
    const authorization =
      await database.getCodexDeviceAuthorizationByDeviceCode(deviceCodeHash)
    if (!authorization || authorization.client_id !== clientId) {
      oauthError(response, 'invalid_grant', 'The device code is invalid.')
      return
    }
    if (Date.parse(authorization.expires_at) <= Date.now()) {
      oauthError(response, 'expired_token', 'The device code has expired.')
      return
    }
    if (authorization.status === 'pending') {
      oauthError(response, 'authorization_pending', 'Approval is still pending.')
      return
    }
    if (authorization.status === 'denied') {
      oauthError(response, 'access_denied', 'The device request was denied.')
      return
    }
    if (authorization.status !== 'approved') {
      oauthError(response, 'invalid_grant', 'The device code has already been used.')
      return
    }

    const accessToken = `lnc_codex_${randomBytes(32).toString('base64url')}`
    const tokenExpiresAt = new Date(
      Date.now() + codexTokenTtlSeconds * 1000,
    ).toISOString()
    const issued = await database.transaction(async () => {
      const consumed =
        await database.consumeCodexDeviceAuthorization(deviceCodeHash)
      if (!consumed) return null
      await database.createCodexAccessToken({
        workspaceId: consumed.workspace_id,
        createdBy: consumed.user_id,
        clientId: consumed.client_id,
        tokenHash: hashSecret(accessToken),
        scopes: consumed.scope.split(/\s+/).filter(Boolean),
        expiresAt: tokenExpiresAt,
      })
      return consumed
    })
    if (!issued) {
      oauthError(response, 'invalid_grant', 'The device code has already been used.')
      return
    }
    response.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: codexTokenTtlSeconds,
      scope: issued.scope,
    })
  },
)

app.get('/api/auth/config', (_request, response) => {
  response.set('Cache-Control', 'no-store')
  response.json({ registrationEnabled })
})

app.get('/api/auth/invitations/:token', rateLimitLogin, async (request, response) => {
  response.set('Cache-Control', 'no-store')
  const token = String(request.params.token || '').trim()
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    throw new HttpError(400, 'A valid invitation token is required.')
  }
  const invitation = await database.getTeamInvitationByTokenHash(hashSecret(token))
  if (
    !invitation ||
    invitation.status !== 'pending' ||
    Date.parse(invitation.expiresAt) <= Date.now()
  ) {
    throw new HttpError(410, 'This invitation is invalid or has expired.')
  }
  response.json({
    email: invitation.email,
    name: invitation.name,
    role: invitation.role,
    workspace: invitation.workspaceName,
    expiresAt: invitation.expiresAt,
    existingAccount: Boolean(await database.getUserByEmail(invitation.email)),
  })
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

const profileImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

app.put(
  '/api/account/avatar',
  secureMutations,
  requireAuth,
  express.raw({ type: [...profileImageTypes], limit: '2mb' }),
  async (request, response) => {
    const contentType = String(request.get('Content-Type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase()
    if (!profileImageTypes.has(contentType)) {
      throw new HttpError(415, 'Use a JPEG, PNG, or WebP profile image.')
    }
    if (!Buffer.isBuffer(request.body) || request.body.byteLength === 0) {
      throw new HttpError(400, 'Choose a non-empty profile image.')
    }
    const avatarUrl = `data:${contentType};base64,${request.body.toString('base64')}`
    const result = await executeIdempotentMutation({
      request,
      route: 'PUT /api/account/avatar',
      input: { contentType, imageHash: hashSecret(request.body.toString('base64')) },
      operation: async () => {
        await database.updateUserAvatar(request.auth.context.user.id, avatarUrl)
        const context = await database.getContextByIds(
          request.auth.context.user.id,
          request.auth.context.workspace.id,
        )
        return { status: 200, response: { user: userResponse(context) } }
      },
    })
    sendMutationResponse(response, result)
  },
)

app.delete(
  '/api/account/avatar',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const result = await executeIdempotentMutation({
      request,
      route: 'DELETE /api/account/avatar',
      input: {},
      operation: async () => {
        await database.updateUserAvatar(request.auth.context.user.id, '')
        const context = await database.getContextByIds(
          request.auth.context.user.id,
          request.auth.context.workspace.id,
        )
        return { status: 200, response: { user: userResponse(context) } }
      },
    })
    sendMutationResponse(response, result)
  },
)

app.get(
  '/api/codex/connection',
  requireAuth,
  async (request, response) => {
    response.json(
      await database.getCodexConnection(request.auth.context.workspace.id),
    )
  },
)

app.post(
  '/api/codex/connection/revoke',
  secureMutations,
  requireAuth,
  async (request, response) => {
    response.json(
      await database.revokeCodexAccessTokens(
        request.auth.context.workspace.id,
      ),
    )
  },
)

app.get(
  '/api/codex/device/authorization',
  requireAuth,
  async (request, response) => {
    const userCode = normalizeDeviceUserCode(request.query.user_code)
    if (!userCode) {
      throw new HttpError(400, 'A valid device code is required.')
    }
    const authorization =
      await database.getCodexDeviceAuthorizationByUserCode(hashSecret(userCode))
    if (!authorization) throw new HttpError(404, 'Device request not found.')
    response.json({
      userCode,
      clientId: authorization.client_id,
      scope: authorization.scope,
      status:
        Date.parse(authorization.expires_at) <= Date.now()
          ? 'expired'
          : authorization.status,
      expiresAt: authorization.expires_at,
      workspace: request.auth.context.workspace.name,
    })
  },
)

app.post(
  '/api/codex/device/authorization',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const userCode = normalizeDeviceUserCode(request.body?.userCode)
    const decision = String(request.body?.decision || '').trim()
    if (!userCode || !['approve', 'deny'].includes(decision)) {
      throw new HttpError(400, 'A valid device code and decision are required.')
    }
    const authorization = await database.decideCodexDeviceAuthorization({
      userCodeHash: hashSecret(userCode),
      selectedWorkspaceId: request.auth.context.workspace.id,
      userId: request.auth.context.user.id,
      approved: decision === 'approve',
    })
    if (!authorization) {
      throw new HttpError(409, 'This device request is unavailable or has expired.')
    }
    response.json({
      userCode,
      status: authorization.status,
      workspace: request.auth.context.workspace.name,
    })
  },
)

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
  response.setHeader('Set-Cookie', createSessionCookie(context))
  response.json({ user: userResponse(context) })
})

app.post('/api/auth/register/start', secureMutations, rateLimitLogin, async (request, response) => {
  response.set('Cache-Control', 'no-store')
  if (!registrationEnabled) {
    throw new HttpError(
      403,
      'New workspace registration is disabled. Ask a workspace owner for an invitation.',
    )
  }

  const email = String(request.body?.email || '').trim().toLowerCase()
  const name = String(request.body?.name || email.split('@')[0]).trim()
  const workspaceName = String(request.body?.workspace || `${name}'s Workspace`).trim()
  if (email.length < 5 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'A valid email address is required.')
  }
  if (name.length < 1 || name.length > 120) {
    throw new HttpError(400, 'Name must be between 1 and 120 characters.')
  }
  if (workspaceName.length < 1 || workspaceName.length > 160) {
    throw new HttpError(400, 'Workspace name must be between 1 and 160 characters.')
  }
  if (await database.getUserByEmail(email)) {
    throw new HttpError(409, 'An account with this email already exists. Sign in instead.')
  }

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  await database.saveRegistrationConfirmation({
    email,
    name,
    workspaceName,
    tokenHash: hashSecret(token),
    expiresAt,
  })

  const confirmationUrl = new URL('/signup/confirm', publicOrigin)
  confirmationUrl.searchParams.set('token', token)
  const registrationMail = registrationEmail({
    name,
    confirmationUrl: confirmationUrl.toString(),
  })
  try {
    await sendNotification({
      to: email,
      subject: 'Confirm your lancee account',
      text: registrationMail.text,
      html: registrationMail.html,
    })
  } catch (error) {
    if (error?.code === 'SMTP_NOT_CONFIGURED') {
      throw new HttpError(503, 'Confirmation email is not configured yet. Please try again later.')
    }
    console.error('Registration confirmation email failed:', error)
    throw new HttpError(502, 'The confirmation email could not be sent. Please try again.')
  }

  response.status(202).json({ email, expiresAt })
})

app.post('/api/auth/register/confirm', secureMutations, rateLimitLogin, async (request, response) => {
  response.set('Cache-Control', 'no-store')
  const token = String(request.body?.token || '').trim()
  const password = String(request.body?.password || '')
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    throw new HttpError(400, 'A valid confirmation link is required.')
  }
  if (password.length < 8 || password.length > 128) {
    throw new HttpError(400, 'Password must be between 8 and 128 characters.')
  }

  const pending = await database.getRegistrationConfirmationByTokenHash(hashSecret(token))
  if (!pending || Date.parse(pending.expiresAt) <= Date.now()) {
    throw new HttpError(410, 'This confirmation link is invalid or has expired.')
  }
  if (await database.getUserByEmail(pending.email)) {
    throw new HttpError(409, 'An account with this email already exists. Sign in instead.')
  }

  const context = await createWorkspaceAccount({
    email: pending.email,
    password,
    name: pending.name,
    workspaceName: pending.workspaceName,
  })
  await database.deleteRegistrationConfirmation(pending.tokenHash)
  response.setHeader('Set-Cookie', createSessionCookie(context))
  response.status(201).json({ user: userResponse(context) })
})

app.post('/api/auth/register', secureMutations, rateLimitLogin, async (request, response) => {
  response.set('Cache-Control', 'no-store')
  const invitationToken = String(request.body?.invitationToken || '').trim()
  let invitation = null
  if (invitationToken) {
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(invitationToken)) {
      throw new HttpError(400, 'A valid invitation token is required.')
    }
    invitation = await database.getTeamInvitationByTokenHash(
      hashSecret(invitationToken),
    )
    if (
      !invitation ||
      invitation.status !== 'pending' ||
      Date.parse(invitation.expiresAt) <= Date.now()
    ) {
      throw new HttpError(410, 'This invitation is invalid or has expired.')
    }
  }
  const email = invitation?.email ||
    String(request.body?.email || '').trim().toLowerCase()
  const password = String(request.body?.password || '')
  const name = String(
    request.body?.name || invitation?.name || email.split('@')[0],
  ).trim()

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

  const existingUser = await database.getUserByEmail(email)
  if (invitation) {
    if (existingUser?.disabledAt) {
      throw new HttpError(403, 'This account is disabled.')
    }
    if (
      existingUser &&
      !verifyPassword(password, {
        user: {
          passwordHash: existingUser.passwordHash,
          passwordSalt: existingUser.passwordSalt,
        },
      })
    ) {
      const address = clientAddress(request)
      loginAttempts.set(address, [...(loginAttempts.get(address) || []), Date.now()])
      throw new HttpError(401, 'Enter the current password for this existing account.')
    }

    const acceptedUserId = existingUser?.id || stableId('usr', email)
    const timestamp = nowIso()
    await database.transaction(async () => {
      if (!existingUser) {
        const passwordSalt = randomBytes(16).toString('hex')
        const passwordHash = scryptSync(password, passwordSalt, 64).toString('hex')
        await database.query(
          `INSERT INTO users (
             id, email, name, password_salt, password_hash, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            acceptedUserId,
            email,
            name,
            passwordSalt,
            passwordHash,
            timestamp,
            timestamp,
          ],
        )
      }
      await database.acceptTeamInvitation({
        invitationId: invitation.id,
        workspaceId: invitation.workspaceId,
        userId: acceptedUserId,
        role: invitation.role,
      })
    })
    loginAttempts.delete(clientAddress(request))
    const context = await database.getContextByIds(
      acceptedUserId,
      invitation.workspaceId,
    )
    response.setHeader('Set-Cookie', createSessionCookie(context))
    response.status(201).json({ user: userResponse(context) })
    return
  }

  if (!registrationEnabled) {
    throw new HttpError(
      403,
      'New workspace registration is disabled. Ask a workspace owner for an invitation.',
    )
  }

  if (existingUser) {
    response.status(409).json({ error: 'An account with this email already exists.' })
    return
  }

  throw new HttpError(
    410,
    'New accounts must confirm their email before choosing a password.',
  )

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

app.post('/api/ideas/boards', secureMutations, requireAuth, async (request, response) => {
  const selectedWorkspaceId = request.auth.context.workspace.id
  const board = await database.createIdeaBoard({
    selectedWorkspaceId,
    id: validateBoardId(request.body?.id || `board_${randomUUID()}`),
    label: validateBoardLabel(request.body?.label),
    createdBy: request.auth.context.user.id,
  })
  response.status(201).json({ board })
})

app.delete('/api/ideas/boards/:boardId', secureMutations, requireAuth, async (request, response) => {
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

app.post('/api/ideas/elements', secureMutations, requireAuth, async (request, response) => {
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

app.put('/api/ideas/elements/:elementId', secureMutations, requireAuth, async (request, response) => {
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

app.delete('/api/ideas/elements/:elementId', secureMutations, requireAuth, async (request, response) => {
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
  requireOwner,
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
      allowInsecure: n8nAllowInsecure,
      allowPrivate: n8nAllowPrivate,
    })
    const selectedWorkspaceId = request.auth.context.workspace.id
    const existing = await database.getN8nConnection(selectedWorkspaceId)
    const providedSecret = String(request.body?.signingSecret || '').trim()
    let signingSecret = providedSecret
    if (!signingSecret && (existing?.encryptedSecret || existing?.secretCiphertext)) {
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
    const encryptedSecret = providedSecret || !(existing?.encryptedSecret || existing?.secretCiphertext)
      ? encryptN8nSecret(signingSecret, sessionSecret)
      : existing.encryptedSecret || {
          ciphertext: existing.secretCiphertext,
          iv: existing.secretIv,
          tag: existing.secretTag,
        }

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
  requireOwner,
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

app.get('/api/integrations/tokens', requireAuth, async (request, response) => {
  const tokens = await database.listTenantIntegrationTokens(
    request.auth.context.workspace.id,
  )
  response.json({ tokens })
})

app.get(
  '/api/integrations/tokens/:provider',
  requireAuth,
  async (request, response) => {
    const provider = String(request.params.provider || '').trim()
    if (!/^[a-z0-9][a-z0-9._-]{1,49}$/i.test(provider)) {
      throw new HttpError(400, 'A valid integration provider is required.')
    }
    const token = await database.getTenantIntegrationToken(
      request.auth.context.workspace.id,
      provider,
    )
    if (!token) throw new HttpError(404, 'No integration token is stored for this provider.')
    response.json({
      token: {
        provider: token.provider,
        tokenType: token.tokenType,
        expiresAt: token.expiresAt,
        createdAt: token.createdAt,
        updatedAt: token.updatedAt,
      },
    })
  },
)

app.put(
  '/api/integrations/tokens/:provider',
  secureMutations,
  requireAuth,
  requireOwner,
  async (request, response) => {
    const provider = String(request.params.provider || '').trim()
    const accessToken = String(request.body?.accessToken || '')
    const refreshToken = request.body?.refreshToken
      ? String(request.body.refreshToken)
      : null
    const tokenType = String(request.body?.tokenType || 'Bearer').trim()
    const expiresAt = request.body?.expiresAt ? String(request.body.expiresAt) : null
    if (!/^[a-z0-9][a-z0-9._-]{1,49}$/i.test(provider)) {
      throw new HttpError(400, 'A valid integration provider is required.')
    }
    if (!accessToken || accessToken.length > 10_000) {
      throw new HttpError(400, 'A non-empty access token up to 10,000 characters is required.')
    }
    if (refreshToken && refreshToken.length > 10_000) {
      throw new HttpError(400, 'The refresh token must be 10,000 characters or fewer.')
    }
    if (tokenType.length < 2 || tokenType.length > 20) {
      throw new HttpError(400, 'The token type must be between 2 and 20 characters.')
    }
    const result = await executeIdempotentMutation({
      request,
      route: `PUT /api/integrations/tokens/${provider}`,
      input: {
        provider,
        accessTokenHash: hashSecret(accessToken),
        refreshTokenHash: refreshToken ? hashSecret(refreshToken) : null,
      },
      operation: async () => {
        const encrypted = encryptToken(accessToken)
        const encryptedRefresh = refreshToken ? encryptToken(refreshToken) : null
        const stored = await database.saveTenantIntegrationToken({
          workspaceId: request.auth.context.workspace.id,
          provider,
          encryptedAccessToken: encrypted.encrypted_access_token,
          encryptedRefreshToken: encryptedRefresh?.encrypted_access_token || null,
          tokenType,
          expiresAt,
          iv: encrypted.iv,
          authTag: encrypted.auth_tag,
          refreshIv: encryptedRefresh?.iv || null,
          refreshAuthTag: encryptedRefresh?.auth_tag || null,
        })
        return {
          status: 200,
          response: {
            provider: stored.provider,
            tokenType: stored.tokenType,
            expiresAt: stored.expiresAt,
            createdAt: stored.createdAt,
            updatedAt: stored.updatedAt,
          },
        }
      },
    })
    sendMutationResponse(response, result)
  },
)

app.delete(
  '/api/integrations/tokens/:provider',
  secureMutations,
  requireAuth,
  requireOwner,
  async (request, response) => {
    const provider = String(request.params.provider || '').trim()
    if (!/^[a-z0-9][a-z0-9._-]{1,49}$/i.test(provider)) {
      throw new HttpError(400, 'A valid integration provider is required.')
    }
    const result = await executeIdempotentMutation({
      request,
      route: `DELETE /api/integrations/tokens/${provider}`,
      input: {},
      operation: async () => {
        const removed = await database.deleteTenantIntegrationToken(
          request.auth.context.workspace.id,
          provider,
        )
        if (!removed) throw new HttpError(404, 'No integration token is stored for this provider.')
        return { status: 204, response: null }
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
    const normalizedEvent = sanitizeN8nEvent({
      ...event,
      type: eventType,
    })
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

function mcpCategory(serviceId, tools) {
  const tags = new Set(tools.flatMap((tool) => tool.tags || []))
  if (serviceId.includes('browser') || tags.has('browser')) return 'Browser'
  if (tags.has('text') || serviceId.includes('text')) return 'Text'
  if (tags.has('data') || serviceId.includes('data')) return 'Data'
  return 'Utilities'
}

async function liveMcpServices(selectedWorkspaceId) {
  const builtInService = {
    id: 'lancee',
    name: 'Lancee workflows',
    description: `${lanceeMcpToolDefinitions.length} workspace-scoped workflow, scheduling, code, log, and API tools.`,
    category: 'Utilities',
    status: 'live',
    active: true,
    credentialMode: 'Credential-free',
    builtIn: true,
    tools: lanceeMcpToolDefinitions.map((tool) => ({
      id: tool.name,
      runtimeName: tool.name,
      name: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      tags: ['lancee', 'automation'],
    })),
  }
  const states = await database.listMcpServiceStates(selectedWorkspaceId)
  const stateMap = new Map(states.map((state) => [state.serviceId, state.active]))
  const services = [builtInService]

  if (!baseboxMcp.configured) {
    services.push({
      id: 'basebox',
      name: 'Basebox',
      description: 'The Basebox MCP access key still needs to be added by the platform administrator.',
      category: 'Utilities',
      status: 'unreachable',
      active: false,
      credentialMode: 'Server-side access key',
      tools: [],
    })
  } else {
    try {
      const catalog = await baseboxMcp.listTools()
      services.push({
        id: 'basebox',
        name: 'Basebox',
        description: `${catalog.tools.length} live Basebox tool${catalog.tools.length === 1 ? '' : 's'} discovered through authenticated MCP.`,
        category: 'Utilities',
        status: 'live',
        active: Boolean(stateMap.get('basebox')),
        credentialMode: 'Server-side access key',
        tools: catalog.tools.map((tool) => ({
          id: tool.name,
          runtimeName: tool.name,
          name: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          tags: ['basebox', 'mcp'],
        })),
      })
    } catch (error) {
      console.error('Basebox MCP catalog unavailable:', error.message)
      services.push({
        id: 'basebox',
        name: 'Basebox',
        description: error instanceof BaseboxMcpError && error.code === 'BASEBOX_MCP_UNAUTHORIZED'
          ? 'Basebox rejected the configured access key. Replace it and sync again.'
          : 'Basebox is configured but its MCP endpoint is currently unreachable.',
        category: 'Utilities',
        status: 'unreachable',
        active: false,
        credentialMode: 'Server-side access key',
        tools: [],
      })
    }
  }

  if (mcpGateway.configured) {
    try {
      const capabilities = await mcpGateway.capabilities()
      const externalServices = capabilities.services.map((service) => {
        const serviceTools = capabilities.tools.filter(
          (tool) => tool.service_id === service.service_id,
        )
        return {
          id: service.service_id,
          name: service.display_name || service.service_id,
          description:
            service.status === 'available'
              ? `${serviceTools.length} runtime-verified tool${serviceTools.length === 1 ? '' : 's'} from revision ${service.revision || 'unknown'}.`
              : 'The service is registered but its runtime tools are currently unreachable.',
          category: mcpCategory(service.service_id, serviceTools),
          status: service.status === 'available' ? 'live' : 'unreachable',
          active:
            service.status === 'available' && Boolean(stateMap.get(service.service_id)),
          credentialMode: 'Workspace vault',
          tools: serviceTools.map((tool) => ({
            id: tool.catalog_id || tool.name,
            runtimeName: tool.name,
            name: tool.title || tool.catalog_id || tool.name,
            description: tool.description || '',
            inputSchema: tool.input_schema || {},
            tags: tool.tags || [],
          })),
        }
      }).filter((service) => allowedMcpCategories.has(service.category))
      services.push(...externalServices)
    } catch (error) {
      console.error('External MCP gateway catalog unavailable; other services remain available:', error.message)
    }
  }
  return services
}

app.get('/api/mcp/access', requireAuth, async (request, response) => {
  response.json(await mcpAccessResponse(request.auth.context))
})

app.get('/api/mcp/services', requireAuth, async (request, response) => {
  response.json({
    configured: mcpProvidersConfigured,
    services: await liveMcpServices(request.auth.context.workspace.id),
  })
})

app.post('/api/mcp/sync', secureMutations, requireAuth, async (request, response) => {
  const access = await database.getMcpAccess(request.auth.context.workspace.id)
  if (access.status !== 'approved') {
    throw new HttpError(409, 'Bearer access must be approved before services can sync.')
  }
  const now = nowIso()
  const services = await liveMcpServices(request.auth.context.workspace.id)
  await database.touchMcpAccess(request.auth.context.workspace.id, now)
  response.json({
    connection: {
      gatewayUrl: primaryMcpUrl,
      capabilityEndpoint: primaryMcpCapabilityEndpoint,
      authSource: 'Managed bearer grant · server-side only',
      mode: 'DNS gateway',
      accessStatus: access.status,
      connected: true,
      lastSync: now,
      requestedAt: access.requestedAt,
    },
    services,
  })
})

app.post('/api/mcp/invoke', secureMutations, requireAuth, async (request, response) => {
  const { serviceId, toolId, arguments: toolArguments = {} } = request.body || {}
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(serviceId) || typeof toolId !== 'string') {
    throw new HttpError(400, 'A valid MCP service id and tool id are required.')
  }
  if (
    !toolArguments ||
    typeof toolArguments !== 'object' ||
    Array.isArray(toolArguments)
  ) {
    throw new HttpError(400, 'MCP tool arguments must be a JSON object.')
  }
  const builtIn = serviceId === 'lancee'
  const access = await database.getMcpAccess(request.auth.context.workspace.id)
  if (!builtIn && access.status !== 'approved') {
    throw new HttpError(409, 'Bearer access must be approved before invoking MCP tools.')
  }
  const services = await liveMcpServices(request.auth.context.workspace.id)
  const service = services.find((item) => item.id === serviceId)
  if (!service?.active || service.status !== 'live') {
    throw new HttpError(409, 'Activate a live MCP service before invoking its tools.')
  }
  const tool = service.tools.find((item) => item.id === toolId)
  if (!tool) throw new HttpError(404, 'MCP tool not found.')
  const result = await executeIdempotentMutation({
    request,
    route: `POST /api/mcp/invoke/${serviceId}/${toolId}`,
    input: { serviceId, toolId, arguments: toolArguments },
    operation: async () => {
      const startedAt = performance.now()
      const invocation = builtIn
        ? await lanceeMcp.invoke(tool.runtimeName || tool.id, toolArguments, request.auth.context)
        : serviceId === 'basebox'
          ? await baseboxMcp.invoke(tool.runtimeName || tool.id, toolArguments)
          : await mcpGateway.invoke(tool.runtimeName || tool.id, toolArguments)
      const duration = Math.max(0, Math.round(performance.now() - startedAt))
      const message = !builtIn && invocation.isError
        ? 'MCP tool returned an error result.'
        : 'MCP tool completed successfully.'
      await database.recordMcpInvocation({
        selectedWorkspaceId: request.auth.context.workspace.id,
        serviceId,
        toolId,
        duration,
        message,
      })
      return {
        status: 200,
        response: {
          ok: builtIn || !invocation.isError,
          serviceId: builtIn ? serviceId : invocation.serviceId,
          toolId: builtIn ? toolId : invocation.toolId,
          requestId: invocation.requestId || randomUUID(),
          duration,
          message,
          data: builtIn ? invocation : invocation.data,
        },
      }
    },
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
            mcpProvidersConfigured ? 'approved' : 'pending',
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
      const accessMail = mcpAccessEmail({ userName: request.auth.context.user.name })
      void sendNotification({
        to: process.env.SMTP_TEST_TO || request.auth.context.user.email,
        subject: 'lancee MCP bearer access request',
        text: accessMail.text,
        html: accessMail.html,
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
    if (serviceId === 'lancee') {
      throw new HttpError(409, 'Built-in Lancee tools are always active for authenticated workspace users.')
    }
    if ((await database.getMcpAccess(request.auth.context.workspace.id)).status !== 'approved') {
      throw new HttpError(409, 'Bearer access must be approved before services can change.')
    }
    const services = await liveMcpServices(request.auth.context.workspace.id)
    const service = services.find((item) => item.id === serviceId)
    if (!service || service.status !== 'live') {
      throw new HttpError(404, 'A live MCP service is required.')
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

app.post(
  '/api/money/paystack/connection',
  secureMutations,
  requireAuth,
  requireOwner,
  async (request, response) => {
    const secretKey = String(request.body?.secretKey || '').trim()
    let client
    try {
      client = createPaystackClient({
        secretKey,
        baseUrl: paystackBaseUrl,
        allowInsecure: !production,
      })
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error
          ? error.message
          : 'Enter a valid Paystack secret key.',
      )
    }
    if (!client.configured) {
      throw new HttpError(400, 'Enter a valid Paystack secret key.')
    }
    const result = await executeIdempotentMutation({
      request,
      route: 'POST /api/money/paystack/connection',
      input: {
        mode: client.mode,
        keyFingerprint: client.keyFingerprint,
      },
      operation: async () => {
        await database.upsertPaymentConnection({
          selectedWorkspaceId: request.auth.context.workspace.id,
          provider: 'paystack',
          configured: true,
          mode: client.mode,
          credentialSource: 'workspace',
          keyFingerprint: client.keyFingerprint,
          secretCiphertext: encryptPaystackSecret(secretKey, sessionSecret),
        })
        return {
          status: 200,
          response: await paystackConnectionResponse(request.auth.context),
        }
      },
    })
    sendMutationResponse(response, result)
  },
)

app.post(
  '/api/money/paystack/disconnect',
  secureMutations,
  requireAuth,
  requireOwner,
  async (request, response) => {
    const result = await executeIdempotentMutation({
      request,
      route: 'POST /api/money/paystack/disconnect',
      input: {},
      operation: async () => {
        await database.upsertPaymentConnection({
          selectedWorkspaceId: request.auth.context.workspace.id,
          provider: 'paystack',
          configured: false,
          mode: 'none',
          credentialSource: 'disabled',
          keyFingerprint: null,
          secretCiphertext: null,
        })
        return {
          status: 200,
          response: await paystackConnectionResponse(request.auth.context),
        }
      },
    })
    sendMutationResponse(response, result)
  },
)

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
    const connection = await paystackConnectionResponse(request.auth.context)
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
      const paystackClient = await paystackClientForWorkspace(
        selectedWorkspaceId,
      )
      const initialized = await paystackClient.initializeTransaction({
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

app.get('/api/api-keys', requireAuth, requireOwner, async (request, response) => {
  response.json({
    keys: await database.listApiKeys(request.auth.context.workspace.id),
  })
})

app.post('/api/api-keys', secureMutations, requireAuth, requireOwner, async (request, response) => {
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
  requireOwner,
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
      const mail = testEmail()
      const result = await sendNotification({
        to: recipient,
        subject: 'lancee notification test',
        text: mail.text,
        html: mail.html,
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
      await database.saveAiConversation({
        workspaceId: request.auth.context.workspace.id,
        userId: request.auth.context.user.id,
        title: String(messages.at(-1)?.content || 'AI conversation').slice(0, 120),
        model: result.model,
        messages: [
          ...(systemPrompt
            ? [{ role: 'system', content: String(systemPrompt) }]
            : []),
          ...messages,
          { role: 'assistant', content: result.content },
        ],
        tokensUsed: result.usage.totalTokens,
      })
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

async function workspaceAiSnapshot(selectedWorkspaceId) {
  const [projects, clients, invoices, drafts, automations] = await Promise.all([
    database.listProjects(selectedWorkspaceId),
    database.listClients(selectedWorkspaceId),
    database.listInvoices(selectedWorkspaceId),
    database.listDraftInvoices(selectedWorkspaceId),
    database.listAutomations(selectedWorkspaceId),
  ])
  return {
    projects: projects.slice(0, 50).map(({ id, name, client, scope, due, status, progress }) => ({ id, name, client, scope, due, status, progress })),
    clients: clients.slice(0, 50).map(({ id, name, email, company, status, projectCount }) => ({ id, name, email, company, status, projectCount })),
    invoices: invoices.slice(0, 50).map(({ id, invoiceNumber, clientName, projectName, amountMinor, currency, status, dueDate }) => ({ id, invoiceNumber, clientName, projectName, amountMinor, currency, status, dueDate })),
    draftInvoices: drafts.slice(0, 50).map(({ id, invoiceNumber, clientName, projectName, amountMinor, currency, status, dueDate }) => ({ id, invoiceNumber, clientName, projectName, amountMinor, currency, status, dueDate })),
    automations: automations.slice(0, 50).map(({ id, name, status, execution, runs, successRate }) => ({ id, name, status, execution, runs, successRate })),
  }
}

async function aiMcpToolManifest(selectedWorkspaceId) {
  const services = await liveMcpServices(selectedWorkspaceId)
  return services
    .filter((service) => service.active && service.status === 'live')
    .slice(0, 20)
    .flatMap((service) =>
      service.tools.slice(0, 20).map((tool) => ({
        serviceId: service.id,
        serviceName: service.name,
        toolId: tool.id,
        functionName: service.id === 'lancee'
          ? `lancee_${tool.id}`
          : `${`mcp_${service.id}_${tool.id}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)}_${createHash('sha256').update(`${service.id}:${tool.id}`).digest('hex').slice(0, 10)}`,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    )
}

function proposedActionFromToolCall(toolCall, manifest) {
  if (!toolCall?.name) return null
  const selectedTool = manifest.find((tool) => tool.functionName === toolCall.name)
  if (!selectedTool) {
    throw new AiError('AI_UNKNOWN_TOOL_CALL', 'AI provider requested a tool that is not available in this workspace.', 502)
  }
  return {
    serviceId: selectedTool.serviceId,
    toolId: selectedTool.toolId,
    arguments: toolCall.arguments || {},
  }
}

app.post('/api/ai/chat', secureMutations, requireAuth, async (request, response) => {
  const message = String(request.body?.message || '').trim()
  const history = Array.isArray(request.body?.history) ? request.body.history : []
  if (!message || message.length > 4_000) throw new HttpError(400, 'A message between 1 and 4,000 characters is required.')
  const normalizedHistory = history.slice(-12).map((item) => ({
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    content: String(item?.content || '').slice(0, 4_000),
  })).filter((item) => item.content)
  const [snapshot, mcpManifest] = await Promise.all([
    workspaceAiSnapshot(request.auth.context.workspace.id),
    aiMcpToolManifest(request.auth.context.workspace.id),
  ])
  const systemPrompt = `You are the Lancee workspace assistant. Answer only from the workspace snapshot below and general reasoning. Never invent records, credentials, payments, or completed actions. Use one provided native tool when the user asks you to create, run, schedule, search, inspect, or otherwise operate on a workflow. A native tool call only proposes an action for explicit human approval; never claim it has already run. When creating a workflow, choose only the minimum Core permissions needed and set activate=true unless the user explicitly requests a draft. Keep answers concise. Workspace snapshot (server-provided and workspace-scoped): ${JSON.stringify(snapshot)}`
  try {
    const result = await completeChat({
      messages: [...normalizedHistory, { role: 'user', content: message }],
      systemPrompt,
      tools: mcpManifest.map((tool) => ({
        name: tool.functionName,
        description: `${tool.serviceName} — ${tool.name}: ${tool.description}`,
        inputSchema: tool.inputSchema,
      })),
    })
    const proposedAction = proposedActionFromToolCall(result.toolCall, mcpManifest)
    const displayContent = result.content.trim() || (proposedAction
      ? 'I can do that after you approve the tool request below.'
      : 'I could not produce a response for that request.')
    await database.saveAiConversation({
      workspaceId: request.auth.context.workspace.id,
      userId: request.auth.context.user.id,
      title: message.slice(0, 120),
      model: result.model,
      messages: [...normalizedHistory, { role: 'user', content: message }, { role: 'assistant', content: displayContent }],
      tokensUsed: result.usage.totalTokens,
    })
    response.json({ ...result, content: displayContent, proposedAction, toolCall: undefined })
  } catch (error) {
    if (error instanceof AiError) {
      response.status(error.status).json({ error: error.message, code: error.code })
      return
    }
    response.status(502).json({ error: 'Workspace assistant request failed.' })
  }
})

app.post('/api/ai/actions', secureMutations, requireAuth, async (request, response) => {
  const action = String(request.body?.action || '').trim()
  const allowedReadActions = new Set(['describe_table', 'list_tables', 'list_schemas', 'query', 'connect_db'])
  if (action === 'execute') {
    response.status(409).json({ error: 'Human approval is required before an execute action.', code: 'AI_APPROVAL_REQUIRED' })
    return
  }
  if (!allowedReadActions.has(action)) throw new HttpError(400, 'Unsupported AI data action.')
  const selectedWorkspaceId = request.auth.context.workspace.id
  if (action === 'list_tables') {
    response.json({ tables: ['clients', 'projects', 'invoices', 'draft_invoices', 'automations', 'automation_runs', 'automation_run_events', 'project_comments'] })
    return
  }
  if (action === 'list_schemas') {
    response.json({
      schemas: [process.env.DATABASE_URL || process.env.PGHOST ? 'public' : 'main'],
    })
    return
  }
  if (action === 'connect_db') {
    response.json({ connected: Boolean(process.env.DATABASE_URL || process.env.PGHOST), provider: process.env.DATABASE_URL || process.env.PGHOST ? 'postgresql' : 'sqlite' })
    return
  }
  const table = String(request.body?.table || '').trim()
  if (action === 'describe_table') {
    const descriptions = {
      clients: 'Workspace-scoped client contacts and status.',
      projects: 'Workspace-scoped projects, status, progress, and due dates.',
      invoices: 'Provider-backed invoice snapshots and payment status.',
      draft_invoices: 'Project-linked invoice drafts awaiting review or send.',
      automations: 'Bounded Core and Edge automation definitions.',
      automation_runs: 'Automation run status and aggregate execution metadata.',
      automation_run_events: 'Persisted Core and Edge execution log events.',
      project_comments: 'Workspace and client comments attached to projects.',
    }
    if (!descriptions[table]) throw new HttpError(400, 'That table is not available to the assistant.')
    response.json({ table, description: descriptions[table] })
    return
  }
  const readers = {
    clients: () => database.listClients(selectedWorkspaceId),
    projects: () => database.listProjects(selectedWorkspaceId),
    invoices: () => database.listInvoices(selectedWorkspaceId),
    draft_invoices: () => database.listDraftInvoices(selectedWorkspaceId),
    automations: () => database.listAutomations(selectedWorkspaceId),
    project_comments: () => database.listProjectComments(selectedWorkspaceId),
  }
  if (!readers[table]) throw new HttpError(400, 'Query is limited to approved workspace resources.')
  response.json({ table, rows: (await readers[table]()).slice(0, 100) })
})

app.get(
  '/api/codex/ai/status',
  requireCodexScope(codexAiScope),
  (request, response) => {
    response.json({
      ...getAiStatus(),
      workspace: request.codexAuth.context.workspace.name,
      tokenExpiresAt: request.codexAuth.token.expiresAt,
    })
  },
)

app.post(
  '/api/codex/ai/complete',
  secureMutations,
  requireCodexScope(codexAiScope),
  async (request, response) => {
    const messages = request.body?.messages
    const systemPrompt = request.body?.systemPrompt
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new HttpError(400, 'Messages array is required.')
    }
    const result = await completeChat({ messages, systemPrompt })
    await database.saveAiConversation({
      workspaceId: request.codexAuth.context.workspace.id,
      userId: request.codexAuth.context.user.id,
      title: String(messages.at(-1)?.content || 'Codex AI conversation').slice(0, 120),
      model: result.model,
      messages: [
        ...(systemPrompt
          ? [{ role: 'system', content: String(systemPrompt) }]
          : []),
        ...messages,
        { role: 'assistant', content: result.content },
      ],
      tokensUsed: result.usage.totalTokens,
    })
    response.json(result)
  },
)

app.get('/api/codex/runtime/status', requireAuth, async (request, response) => {
  try {
    const account = await codexRuntimeClient(request).account()
    response.json({
      available: true,
      authenticated: Boolean(account.account),
      account: account.account || null,
      requiresOpenaiAuth: Boolean(account.requiresOpenaiAuth),
      workspaceRoot: codexWorkspaceRoot,
    })
  } catch (error) {
    if (!(error instanceof CodexAppServerError)) throw error
    response.json({
      available: false,
      authenticated: false,
      account: null,
      requiresOpenaiAuth: true,
      workspaceRoot: codexWorkspaceRoot,
      error: error.message,
    })
  }
})

app.post(
  '/api/codex/runtime/auth/device',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const result = await codexRuntimeClient(request).startDeviceLogin()
    response.status(201).json(result)
  },
)

app.post(
  '/api/codex/runtime/auth/logout',
  secureMutations,
  requireAuth,
  async (request, response) => {
    await codexRuntimeClient(request).logout()
    response.status(204).end()
  },
)

app.post(
  '/api/codex/runtime/threads',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const result = await codexRuntimeClient(request).startThread()
    response.status(201).json(result)
  },
)

app.post(
  '/api/codex/runtime/threads/:threadId/turns',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const threadId = String(request.params.threadId || '').trim()
    const prompt = String(request.body?.prompt || '').trim()
    if (!threadId) throw new HttpError(400, 'Codex thread ID is required.')
    if (!prompt || prompt.length > 20_000) {
      throw new HttpError(
        400,
        'Prompt must contain between 1 and 20,000 characters.',
      )
    }
    const result = await codexRuntimeClient(request).startTurn({
      threadId,
      prompt,
    })
    response.status(202).json(result)
  },
)

app.post(
  '/api/codex/runtime/threads/:threadId/turns/:turnId/interrupt',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const threadId = String(request.params.threadId || '').trim()
    const turnId = String(request.params.turnId || '').trim()
    if (!threadId || !turnId) {
      throw new HttpError(400, 'Codex thread and turn IDs are required.')
    }
    await codexRuntimeClient(request).interruptTurn({ threadId, turnId })
    response.status(204).end()
  },
)

app.get(
  '/api/codex/runtime/events',
  requireAuth,
  async (request, response) => {
    const threadId = String(request.query.threadId || '').trim() || null
    const after = Number.parseInt(String(request.query.after || '0'), 10) || 0
    const client = codexRuntimeClient(request)
    await client.start()

    response.set({
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
    })
    response.flushHeaders()

    const writeEvent = (event) => {
      if (
        threadId &&
        event.params?.threadId !== threadId &&
        event.params?.thread?.id !== threadId
      ) {
        return
      }
      response.write(`id: ${event.sequence}\n`)
      response.write(`event: codex\n`)
      response.write(`data: ${JSON.stringify(event)}\n\n`)
    }
    client.bufferedEvents({ after, threadId }).forEach(writeEvent)
    const unsubscribe = client.subscribe(writeEvent)
    const heartbeat = setInterval(() => response.write(': keep-alive\n\n'), 15_000)
    request.once('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  },
)

app.get('/api/integrations', requireAuth, async (request, response) => {
  const selectedWorkspaceId = request.auth.context.workspace.id
  const [integrations, driveToken] = await Promise.all([
    database.listIntegrations(selectedWorkspaceId),
    database.getGoogleDriveToken(selectedWorkspaceId),
  ])
  response.json({
    integrations: integrations.map((integration) =>
      integration.id === 'drive'
        ? {
            ...integration,
            connected: tokenHasDriveFileScope(driveToken),
          }
        : integration,
    ),
  })
})

const integrationRequestCategories = new Set([
  'Automation',
  'Communication',
  'Design',
  'Payments',
  'Storage',
  'Other',
])

app.post(
  '/api/integration-requests',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const name = String(request.body?.name || '').trim()
    const category = String(request.body?.category || '').trim()
    const details = String(request.body?.details || '').trim()
    if (name.length < 2 || name.length > 120) {
      throw new HttpError(400, 'Connection name must be between 2 and 120 characters.')
    }
    if (!integrationRequestCategories.has(category)) {
      throw new HttpError(400, 'Select a supported connection category.')
    }
    if (details.length > 500) {
      throw new HttpError(400, 'Connection details must be 500 characters or fewer.')
    }
    const result = await executeIdempotentMutation({
      request,
      route: 'POST /api/integration-requests',
      input: { name, category, details },
      operation: async () => ({
        status: 201,
        response: await database.createIntegrationRequest({
          workspaceId: request.auth.context.workspace.id,
          requestedBy: request.auth.context.user.id,
          name,
          category,
          details,
        }),
      }),
    })
    sendMutationResponse(response, result)
  },
)

app.post(
  '/api/integrations/:id/toggle',
  secureMutations,
  requireAuth,
  async (request, _response) => {
    const id = String(request.params.id || '')
    throw new HttpError(
      409,
      `${id || 'This integration'} is managed by its dedicated connection API and cannot be toggled directly.`,
    )
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
  requireOwner,
  async (request, response) => {
    const current = await database.getWorkspaceSettings(
      request.auth.context.workspace.id,
    )
    const name = String(request.body?.name ?? current.name).trim()
    const logoUrl = String(request.body?.logoUrl ?? current.logoUrl).trim()
    const email = String(request.body?.email ?? current.email).trim()
    const timezone = String(
      request.body?.timezone ?? current.timezone ?? 'Africa/Johannesburg',
    ).trim()
    const travelMode = String(
      request.body?.travelMode ?? current.travelMode ?? 'none',
    ).trim()
    const travelLocation = String(
      request.body?.travelLocation ?? current.travelLocation ?? '',
    ).trim()
    if (!name || name.length > 120) {
      throw new HttpError(400, 'Workspace name must be between 1 and 120 characters.')
    }
    if (
      email &&
      (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    ) {
      throw new HttpError(400, 'Workspace email must be valid.')
    }
    if (logoUrl) {
      let parsedLogoUrl
      try {
        parsedLogoUrl = new URL(logoUrl)
      } catch {
        throw new HttpError(400, 'Workspace logo URL must be valid.')
      }
      if (
        !['http:', 'https:'].includes(parsedLogoUrl.protocol) ||
        logoUrl.length > 2048
      ) {
        throw new HttpError(400, 'Workspace logo URL must use http or https.')
      }
    }
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone }).format()
    } catch {
      throw new HttpError(400, 'Enter a valid IANA timezone.')
    }
    if (!['none', 'traveling'].includes(travelMode)) {
      throw new HttpError(400, 'Travel mode must be none or traveling.')
    }
    if (travelLocation.length > 160) {
      throw new HttpError(400, 'Travel location must be 160 characters or fewer.')
    }
    const result = await executeIdempotentMutation({
      request,
      route: 'PATCH /api/workspace/settings',
      input: { name, logoUrl, email, timezone, travelMode, travelLocation },
      operation: async () => ({
        status: 200,
        response: await database.updateWorkspaceSettings(request.auth.context.workspace.id, {
          name,
          logoUrl,
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

app.patch('/api/workspace/team/:memberId', secureMutations, requireAuth, requireOwner, async (request, response) => {
  const memberId = String(request.params.memberId || '').trim()
  const name = String(request.body?.name || '').trim()
  const role = String(request.body?.role || '').trim()
  if (!memberId || memberId.length > 160) throw new HttpError(400, 'A valid member id is required.')
  if (!name || name.length > 120) throw new HttpError(400, 'Member name must be between 1 and 120 characters.')
  if (!['owner', 'collaborator', 'viewer'].includes(role)) {
    throw new HttpError(400, 'Role must be admin, collaborator, or viewer.')
  }
  const members = await database.listTeamMembers(request.auth.context.workspace.id)
  const current = members.find((member) => member.id === memberId)
  if (!current) throw new HttpError(404, 'Team member not found.')
  if (
    current.role === 'owner' &&
    role !== 'owner' &&
    members.filter((member) => member.role === 'owner' && member.status === 'active').length <= 1
  ) {
    throw new HttpError(409, 'Add another admin before changing the last admin role.')
  }
  const member = await database.updateTeamMember(
    request.auth.context.workspace.id,
    memberId,
    { name, role },
  )
  response.json({ member })
})

app.delete('/api/workspace/team/:memberId', secureMutations, requireAuth, requireOwner, async (request, response) => {
  const memberId = String(request.params.memberId || '').trim()
  if (!memberId || memberId.length > 160) throw new HttpError(400, 'A valid member id is required.')
  if (memberId === request.auth.context.user.id) {
    throw new HttpError(409, 'You cannot remove yourself from the workspace.')
  }
  const members = await database.listTeamMembers(request.auth.context.workspace.id)
  const current = members.find((member) => member.id === memberId)
  if (!current) throw new HttpError(404, 'Team member not found.')
  if (
    current.role === 'owner' &&
    members.filter((member) => member.role === 'owner' && member.status === 'active').length <= 1
  ) {
    throw new HttpError(409, 'The last workspace admin cannot be removed.')
  }
  await database.removeTeamMember(request.auth.context.workspace.id, memberId)
  response.status(204).end()
})

const cloudStorageProviders = new Set(['drive', 'dropbox', 'onedrive', 'box', 'other'])

function validateCloudFolderUrl(value) {
  const trimmed = String(value || '').trim()
  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new HttpError(400, 'Folder URL must be a valid http or https link.')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new HttpError(400, 'Folder URL must use http or https.')
  }
  if (trimmed.length > 2048) {
    throw new HttpError(400, 'Folder URL is too long.')
  }
  return trimmed
}

app.get('/api/workspace/cloud-links', requireAuth, async (request, response) => {
  response.json({
    links: await database.listWorkspaceCloudLinks(request.auth.context.workspace.id),
  })
})

app.post('/api/workspace/cloud-links', secureMutations, requireAuth, async (request, response) => {
  const provider = String(request.body?.provider || '').trim()
  const label = String(request.body?.label || '').trim()
  const folderUrl = validateCloudFolderUrl(request.body?.folderUrl)
  const notes = String(request.body?.notes || '').trim().slice(0, 500)
  if (!cloudStorageProviders.has(provider)) {
    throw new HttpError(400, 'Select a supported cloud storage provider.')
  }
  if (!label || label.length > 120) {
    throw new HttpError(400, 'Link label must be between 1 and 120 characters.')
  }
  const result = await executeIdempotentMutation({
    request,
    route: 'POST /api/workspace/cloud-links',
    input: { provider, label, folderUrl, notes },
    operation: async () => ({
      status: 201,
      response: await database.createWorkspaceCloudLink({
        workspaceId: request.auth.context.workspace.id,
        provider,
        label,
        folderUrl,
        notes,
      }),
    }),
  })
  sendMutationResponse(response, result)
})

app.delete('/api/workspace/cloud-links/:linkId', secureMutations, requireAuth, async (request, response) => {
  const linkId = String(request.params.linkId || '')
  if (!/^cloud_[a-f0-9]{12}$/.test(linkId)) {
    throw new HttpError(400, 'A valid cloud link id is required.')
  }
  await database.deleteWorkspaceCloudLink(request.auth.context.workspace.id, linkId)
  response.status(204).end()
})

app.post('/api/workspace/team/invite', secureMutations, requireAuth, requireOwner, async (request, response) => {
  const email = String(request.body?.email || '').trim().toLowerCase()
  const name = String(request.body?.name || '').trim()
  const role = String(request.body?.role || 'collaborator').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpError(400, 'A valid email address is required.')
  }
  if (name.length > 120) {
    throw new HttpError(400, 'Member name must be 120 characters or fewer.')
  }
  if (!['owner', 'collaborator', 'viewer'].includes(role)) {
    throw new HttpError(400, 'Role must be admin, collaborator, or viewer.')
  }
  const existingMembership = await database.getWorkspaceMembershipByEmail(
    request.auth.context.workspace.id,
    email,
  )
  if (existingMembership) {
    if (existingMembership.password_hash !== 'temp_hash') {
      throw new HttpError(409, 'This person is already a workspace member.')
    }
    await database.removeLegacyInvitationMember(
      request.auth.context.workspace.id,
      existingMembership.id,
    )
  }
  const result = await executeIdempotentMutation({
    request,
    route: 'POST /api/workspace/team/invite',
    input: { email, name, role },
    operation: async () => {
      const token = randomBytes(32).toString('base64url')
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      const acceptUrl = new URL('/', publicOrigin)
      acceptUrl.searchParams.set('invite', token)
      return {
        status: 201,
        response: {
          ...await database.inviteTeamMember({
        workspaceId: request.auth.context.workspace.id,
        invitedBy: request.auth.context.user.id,
        email,
        name,
        role,
            tokenHash: hashSecret(token),
            expiresAt,
          }),
          acceptUrl: acceptUrl.toString(),
          delivery: 'share',
        },
      }
    },
  })
  const payload = { ...result.response }
  if (!result.replayed && getSmtpStatus().configured) {
    try {
      const inviteMail = invitationEmail({
        name,
        inviterName: request.auth.context.user.name,
        workspaceName: request.auth.context.workspace.name,
        acceptUrl: payload.acceptUrl,
      })
      await sendNotification({
        to: email,
        subject: `Invitation to ${request.auth.context.workspace.name}`,
        text: inviteMail.text,
        html: inviteMail.html,
      })
      payload.delivery = 'sent'
    } catch {
      payload.delivery = 'failed'
    }
  }
  sendMutationResponse(response, result, payload)
})

app.get('/api/projects', requireAuth, async (request, response) => {
  response.json({
    projects: await database.listProjects(request.auth.context.workspace.id),
  })
})

app.get('/api/clients', requireAuth, async (request, response) => {
  response.json({
    clients: await database.listClients(request.auth.context.workspace.id),
  })
})

function emailDomain(value) {
  const match = String(value || '').trim().toLowerCase().match(/^[^@\s]+@([^@\s]+)$/)
  return match ? match[1] : ''
}

function messageIncludesDomain(message, domain) {
  return [...(message?.from || []), ...(message?.to || []), ...(message?.cc || [])]
    .some((address) => emailDomain(address?.address) === domain)
}

app.get('/api/clients/:id/history', requireAuth, async (request, response) => {
  const id = String(request.params.id || '')
  if (!/^clt_[a-z0-9_-]{8,80}$/i.test(id)) {
    throw new HttpError(400, 'A valid client id is required.')
  }
  const workspaceId = request.auth.context.workspace.id
  const client = (await database.listClients(workspaceId)).find((item) => item.id === id)
  if (!client) throw new HttpError(404, 'Client not found.')

  const projects = (await database.listProjects(workspaceId)).filter((project) =>
    project.clientId === client.id || (
      !project.clientId &&
      project.client.toLowerCase() === client.name.toLowerCase()
    ),
  )
  const domain = emailDomain(client.email)
  let messages = []
  let mailConnected = false
  const account = await database.getMailAccount(workspaceId, true)
  if (domain && account) {
    mailConnected = true
    try {
      const password = mailPassword(account)
      const folders = await listMailFolders(account, password)
      const messageLists = await Promise.all(
        folders.slice(0, 8).map((folder) =>
          listMailMessages(account, password, {
            folder: folder.path,
            query: domain,
            limit: 25,
          }).catch(() => []),
        ),
      )
      const seen = new Set()
      messages = messageLists
        .flat()
        .filter((message) => {
          const key = `${message.folder}:${message.uid}`
          if (seen.has(key) || !messageIncludesDomain(message, domain)) return false
          seen.add(key)
          return true
        })
        .sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
        .slice(0, 50)
    } catch {
      messages = []
    }
  }
  response.json({ projects, messages, domain: domain || null, mailConnected })
})

app.get('/api/storefront/settings', requireAuth, async (request, response) => {
  const settings = await database.getWorkspaceSettings(request.auth.context.workspace.id)
  response.json({ enabled: settings.storefrontEnabled })
})

app.patch('/api/storefront/settings', secureMutations, requireAuth, async (request, response) => {
  if (typeof request.body?.enabled !== 'boolean') {
    throw new HttpError(400, 'A boolean storefront setting is required.')
  }
  const current = await database.getWorkspaceSettings(request.auth.context.workspace.id)
  const updated = await database.updateWorkspaceSettings(request.auth.context.workspace.id, {
    ...current,
    storefrontEnabled: request.body.enabled,
  })
  response.json({ enabled: updated.storefrontEnabled })
})

app.get('/api/storefront/domains', requireAuth, async (request, response) => {
  const domains = await database.listStorefrontDomains(request.auth.context.workspace.id)
  response.json({ domains: domains.map(storefrontDomainResponse), target: publicHostname })
})

app.post('/api/storefront/domains', secureMutations, requireAuth, async (request, response) => {
  const domain = normalizeStorefrontDomain(request.body?.domain)
  const existing = (await database.listStorefrontDomains(request.auth.context.workspace.id))
    .find((item) => item.domain === domain)
  if (existing) throw new HttpError(409, 'This domain is already in your storefront settings.')
  const created = await database.createStorefrontDomain({
    workspaceId: request.auth.context.workspace.id,
    domain,
    verificationToken: randomBytes(18).toString('hex'),
  })
  if (!created) throw new HttpError(500, 'Unable to save the custom domain.')
  response.status(201).json({ domain: storefrontDomainResponse(created), target: publicHostname })
})

app.post('/api/storefront/domains/:id/verify', secureMutations, requireAuth, async (request, response) => {
  const id = String(request.params.id || '')
  if (!/^dom_[a-f0-9]{20}$/i.test(id)) throw new HttpError(400, 'A valid domain id is required.')
  const domains = await database.listStorefrontDomains(request.auth.context.workspace.id)
  const domain = domains.find((item) => item.id === id)
  if (!domain) throw new HttpError(404, 'Custom domain not found.')
  let txtRecords = []
  let cnameRecords = []
  try {
    txtRecords = await resolveTxt(`_lancee.${domain.domain}`)
  } catch {
    txtRecords = []
  }
  try {
    cnameRecords = await resolveCname(domain.domain)
  } catch {
    cnameRecords = []
  }
  const expected = `lancee-verify=${domain.verificationToken}`
  const txtVerified = txtRecords.flat().some((value) => String(value).trim() === expected)
  const cnameVerified = cnameRecords.some((value) => String(value).replace(/\.$/, '').toLowerCase() === publicHostname)
  const verified = txtVerified && cnameVerified
  if (!verified) {
    const missing = [
      !txtVerified ? 'the TXT record' : '',
      !cnameVerified ? 'the CNAME record' : '',
    ].filter(Boolean).join(' and ')
    response.json({
      verified: false,
      domain: storefrontDomainResponse(domain),
      message: `We could not find ${missing} yet. DNS changes can take a few minutes.`,
    })
    return
  }
  const updated = await database.verifyStorefrontDomain(request.auth.context.workspace.id, id)
  response.json({ verified: true, domain: storefrontDomainResponse(updated) })
})

app.delete('/api/storefront/domains/:id', secureMutations, requireAuth, async (request, response) => {
  const id = String(request.params.id || '')
  if (!/^dom_[a-f0-9]{20}$/i.test(id)) throw new HttpError(400, 'A valid domain id is required.')
  const deleted = await database.deleteStorefrontDomain(request.auth.context.workspace.id, id)
  if (!deleted) throw new HttpError(404, 'Custom domain not found.')
  response.status(204).end()
})

function approvalToken(value) {
  const token = String(value || '').trim()
  if (!/^[A-Za-z0-9_-]{32,100}$/.test(token)) {
    throw new HttpError(404, 'Approval link not found.')
  }
  return token
}

function reviewResponse(review, token) {
  if (!review) return null
  return {
    ...review,
    artwork: review.artwork
      ? {
          ...review.artwork,
          imageUrl: token
            ? new URL(
                `/api/public/reviews/${encodeURIComponent(review.id)}/image?token=${encodeURIComponent(token)}`,
                publicOrigin,
              ).toString()
            : '',
        }
      : null,
  }
}

function approvalResponse(approval, token, review = null) {
  return {
    ...approval,
    reviewId: review?.id || null,
    artworkVersionId: review?.artworkVersionId || null,
    reviewUrl: new URL(
      `/review/${encodeURIComponent(review?.id || approval.id)}?token=${encodeURIComponent(token)}`,
      publicOrigin,
    ).toString(),
  }
}

async function publicApprovalPage(token, notice = '') {
  const approval = await database.getClientApprovalByTokenHash(hashSecret(token))
  if (!approval || Date.parse(approval.expiresAt) <= Date.now()) {
    return '<!doctype html><html><body><h1>This approval link has expired.</h1><p>Ask the workspace to send a new review link.</p></body></html>'
  }
  const files = await database.listProjectFiles(approval.workspaceId, approval.projectId)
  const message = notice ? `<p class="notice">${escapeHtml(notice)}</p>` : ''
  const fileList = files.length
    ? `<h2>Attachments</h2><ul>${files.map((file) => `<li><a href="/api/public/approvals/${encodeURIComponent(token)}/files/${encodeURIComponent(file.id)}">${escapeHtml(file.name)}</a></li>`).join('')}</ul>`
    : '<p>No attachments were included.</p>'
  const actions = approval.status === 'approved'
    ? '<p class="approved">Approved. Thank you.</p>'
    : `<form method="post" action="/api/public/approvals/${encodeURIComponent(token)}/comment"><label>Comment<textarea name="comment" maxlength="2000" required></textarea></label><button type="submit">Submit comment</button></form><form method="post" action="/api/public/approvals/${encodeURIComponent(token)}/approve"><button type="submit">Approve this work</button></form>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(approval.title)}</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;color:#172016;background:#f7f8f4}main{background:#fff;border:1px solid #dfe5d9;border-radius:18px;padding:32px;box-shadow:0 12px 40px #17201612}h1{margin-top:0}textarea{display:block;width:100%;min-height:120px;margin:8px 0 16px;padding:10px;border:1px solid #cbd5c3;border-radius:8px}button{background:#4f7f35;color:#fff;border:0;border-radius:8px;padding:11px 16px;margin:4px 0;cursor:pointer}.approved,.notice{padding:12px;background:#eef8e7;border-radius:8px}li{margin:8px 0}small{color:#697469}</style></head><body><main><small>${escapeHtml(approval.clientName)} · ${escapeHtml(approval.projectName)}</small><h1>${escapeHtml(approval.title)}</h1><p>${escapeHtml(approval.body).replaceAll('\n', '<br>')}</p>${message}${fileList}${actions}</main></body></html>`
}

app.get('/approval/:token', async (request, response) => {
  const token = approvalToken(request.params.token)
  const approval = await database.getClientApprovalByTokenHash(hashSecret(token))
  if (!approval || Date.parse(approval.expiresAt) <= Date.now()) {
    response.type('html').send(await publicApprovalPage(token))
    return
  }
  const rows = await database.query(
    `SELECT id FROM review_sessions WHERE client_token_hash = $1`,
    [hashSecret(token)],
  )
  if (rows[0]?.id) {
    response.redirect(302, `/review/${encodeURIComponent(rows[0].id)}?token=${encodeURIComponent(token)}`)
    return
  }
  response.type('html').send(await publicApprovalPage(token))
})

app.post('/api/public/approvals/:token/comment', async (request, response) => {
  const token = approvalToken(request.params.token)
  const comment = String(request.body?.comment || '').trim()
  if (comment.length < 1 || comment.length > 2_000) {
    response.status(400).send(await publicApprovalPage(token, 'Please enter a comment between 1 and 2,000 characters.'))
    return
  }
  const updated = await database.respondToClientApproval({
    tokenHash: hashSecret(token),
    response: 'commented',
    comment,
  })
  if (!updated) {
    response.status(404).send('<!doctype html><html><body><h1>This approval link is no longer available.</h1></body></html>')
    return
  }
  response.redirect(303, `/approval/${encodeURIComponent(token)}`)
})

app.post('/api/public/approvals/:token/approve', async (request, response) => {
  const token = approvalToken(request.params.token)
  const updated = await database.respondToClientApproval({
    tokenHash: hashSecret(token),
    response: 'approved',
  })
  if (!updated) {
    response.status(404).send('<!doctype html><html><body><h1>This approval link is no longer available.</h1></body></html>')
    return
  }
  response.redirect(303, `/approval/${encodeURIComponent(token)}`)
})

app.get('/api/public/approvals/:token/files/:fileId', async (request, response) => {
  const token = approvalToken(request.params.token)
  const file = await database.getProjectFileForApproval(
    hashSecret(token),
    String(request.params.fileId || ''),
  )
  if (!file?.contentBase64) {
    response.status(404).json({ error: 'Attachment not found.' })
    return
  }
  response.set({
    'Content-Type': file.mimeType || 'application/octet-stream',
    'Content-Disposition': `inline; filename="${file.name.replaceAll('"', '')}"`,
    'Cache-Control': 'private, no-store',
  })
  response.send(Buffer.from(file.contentBase64, 'base64'))
})

function reviewId(value) {
  const id = String(value || '').trim()
  if (!/^rev_[a-f0-9]{12,80}$/i.test(id)) {
    throw new HttpError(404, 'Review not found.')
  }
  return id
}

function publicReviewToken(value) {
  return approvalToken(value)
}

async function loadPublicReview(request) {
  const id = reviewId(request.params.reviewId)
  const token = publicReviewToken(request.query.token)
  const review = await database.getPublicReview(id, hashSecret(token))
  if (!review) throw new HttpError(404, 'Review not found or expired.')
  return { id, token, review }
}

function annotationInput(body) {
  const annotation = body?.annotation
  if (!annotation || typeof annotation !== 'object' || typeof annotation.id !== 'string' || !annotation.target) {
    throw new HttpError(400, 'A valid image annotation is required.')
  }
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(annotation.id)) {
    throw new HttpError(400, 'The annotation id is invalid.')
  }
  return annotation
}

function annotationMetadata(body, { allowStatus = true } = {}) {
  const fields = {}
  if (Object.hasOwn(body || {}, 'comment')) {
    fields.comment = String(body.comment || '').trim().slice(0, 2_000)
  }
  if (Object.hasOwn(body || {}, 'priority')) fields.priority = String(body.priority || '')
  if (Object.hasOwn(body || {}, 'category')) fields.category = String(body.category || '')
  if (allowStatus && Object.hasOwn(body || {}, 'status')) fields.status = String(body.status || '')
  if (fields.priority && !['low', 'medium', 'high'].includes(fields.priority)) {
    throw new HttpError(400, 'Select a valid annotation priority.')
  }
  if (fields.category && !['design', 'typography', 'spacing', 'color', 'content', 'other'].includes(fields.category)) {
    throw new HttpError(400, 'Select a valid annotation category.')
  }
  if (fields.status && !['open', 'in_progress', 'resolved', 'rejected'].includes(fields.status)) {
    throw new HttpError(400, 'Select a valid annotation status.')
  }
  return fields
}

app.get('/api/public/reviews/:reviewId', async (request, response) => {
  const { review, token } = await loadPublicReview(request)
  response.json({ review: reviewResponse(review, token) })
})

app.get('/api/public/reviews/:reviewId/image', async (request, response) => {
  const { review, token } = await loadPublicReview(request)
  if (!review.artwork?.id) {
    response.status(404).json({ error: 'No artwork is attached to this review.' })
    return
  }
  const file = await database.getProjectFileForApproval(hashSecret(token), review.artwork.id)
  if (!file?.contentBase64) {
    response.status(404).json({ error: 'Artwork not found.' })
    return
  }
  response.set({
    'Content-Type': file.mimeType || 'application/octet-stream',
    'Content-Disposition': `inline; filename="${file.name.replaceAll('"', '')}"`,
    'Cache-Control': 'private, no-store',
  })
  response.send(Buffer.from(file.contentBase64, 'base64'))
})

app.post('/api/public/reviews/:reviewId/annotations', async (request, response) => {
  const { id, review, token } = await loadPublicReview(request)
  if (review.status !== 'open') throw new HttpError(409, 'This review is read-only.')
  const annotation = annotationInput(request.body)
  const fields = annotationMetadata(request.body, { allowStatus: false })
  const saved = await database.createReviewAnnotation({
    reviewId: id,
    artworkFileId: review.artworkId,
    annotation,
    comment: fields.comment || '',
    priority: fields.priority || 'medium',
    category: fields.category || 'other',
    status: 'open',
    createdBy: `client:${review.clientName}`,
  })
  response.status(201).json({ annotation: saved, review: reviewResponse(review, token) })
})

app.patch('/api/public/reviews/:reviewId/annotations/:annotationId', async (request, response) => {
  const { id, review } = await loadPublicReview(request)
  if (review.status !== 'open') throw new HttpError(409, 'This review is read-only.')
  const annotationId = String(request.params.annotationId || '')
  const fields = annotationMetadata(request.body, { allowStatus: false })
  if (Object.hasOwn(request.body || {}, 'annotation')) {
    const annotation = annotationInput(request.body)
    if (annotation.id !== annotationId) throw new HttpError(400, 'Annotation ids must match.')
    fields.annotation = annotation
  }
  const updated = await database.updateReviewAnnotation(id, annotationId, fields)
  if (!updated) throw new HttpError(404, 'Annotation not found.')
  response.json({ annotation: updated })
})

app.delete('/api/public/reviews/:reviewId/annotations/:annotationId', async (request, response) => {
  const { id, review } = await loadPublicReview(request)
  if (review.status !== 'open') throw new HttpError(409, 'This review is read-only.')
  await database.deleteReviewAnnotation(id, String(request.params.annotationId || ''))
  response.json({ ok: true })
})

app.post('/api/public/reviews/:reviewId/submit', async (request, response) => {
  const { id, token } = await loadPublicReview(request)
  const result = await database.submitReviewSession(id, hashSecret(token))
  if (!result) throw new HttpError(404, 'Review not found or expired.')
  if (result.missingComment) throw new HttpError(400, 'Every annotation needs a comment before submission.')
  response.json({ review: reviewResponse(result.review || result, token) })
})

app.post('/api/public/reviews/:reviewId/approve', async (request, response) => {
  const { id, token } = await loadPublicReview(request)
  const updated = await database.respondToClientApproval({
    tokenHash: hashSecret(token),
    response: 'approved',
  })
  if (!updated) throw new HttpError(404, 'Review not found or expired.')
  const review = await database.getPublicReview(id, hashSecret(token))
  response.json({ review: reviewResponse(review, token) })
})

app.post('/api/projects/:id/approvals', secureMutations, requireAuth, async (request, response) => {
  const projectId = String(request.params.id || '')
  if (!/^prj_[a-z0-9_-]{6,80}$/i.test(projectId)) {
    throw new HttpError(400, 'A valid project id is required.')
  }
  const selectedWorkspaceId = request.auth.context.workspace.id
  const project = (await database.listProjects(selectedWorkspaceId)).find((item) => item.id === projectId)
  if (!project) throw new HttpError(404, 'Project not found.')
  const client = (await database.listClients(selectedWorkspaceId)).find((item) => item.id === project.clientId)
  if (!client?.email) throw new HttpError(409, 'Add a client email before requesting approval.')
  const jobCard = await database.ensureJobCard({
    workspaceId: selectedWorkspaceId,
    projectId,
    createdBy: request.auth.context.user.id,
  })
  const token = randomBytes(32).toString('base64url')
  const title = String(request.body?.title || `Review ${project.name}`).trim().slice(0, 160)
  const body = String(request.body?.body || `Please review the ${project.name} work and approve it or leave a comment.`).trim().slice(0, 2_000)
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const artworkFile = (await database.listProjectFiles(selectedWorkspaceId, projectId))
    .find((file) => String(file.mimeType || '').toLowerCase().startsWith('image/'))
  const created = await database.transaction(async () => {
    const created = await database.createClientApproval({
      workspaceId: selectedWorkspaceId,
      projectId,
      jobCardId: jobCard.id,
      clientId: client.id,
      tokenHash: hashSecret(token),
      clientName: client.name,
      clientEmail: client.email,
      projectName: project.name,
      title,
      body,
      expiresAt,
    })
    const review = await database.createReviewSession({
      approvalId: created.id,
      workspaceId: selectedWorkspaceId,
      projectId,
      artworkFileId: artworkFile?.id || null,
      tokenHash: hashSecret(token),
      expiresAt,
    })
    await database.query(
      `UPDATE job_cards SET status = 'client_review', updated_at = $1 WHERE id = $2 AND workspace_id = $3`,
      [nowIso(), jobCard.id, selectedWorkspaceId],
    )
    await database.query(
      `UPDATE projects SET status = 'In review', updated_at = $1 WHERE id = $2 AND workspace_id = $3`,
      [nowIso(), projectId, selectedWorkspaceId],
    )
    return { approval: created, review }
  })
  const approval = created.approval
  const review = created.review
  const reviewUrl = new URL(
    `/review/${encodeURIComponent(review.id)}?token=${encodeURIComponent(token)}`,
    publicOrigin,
  ).toString()
  let delivery = 'not_configured'
  try {
    const reviewMail = clientReviewEmail({
      clientName: client.name,
      workspaceName: request.auth.context.workspace.name,
      title,
      body,
      reviewUrl,
    })
    await sendNotification({
      to: client.email,
      subject: `${request.auth.context.workspace.name}: ${title}`,
      text: reviewMail.text,
      html: reviewMail.html,
    })
    delivery = 'sent'
  } catch (error) {
    if (error?.code !== 'SMTP_NOT_CONFIGURED') delivery = 'failed'
  }
  response.status(201).json({
    approval: approvalResponse(approval, token, review),
    review: reviewResponse(review, token),
    delivery,
  })
})

app.get('/api/projects/:id/approvals', requireAuth, async (request, response) => {
  const projectId = String(request.params.id || '')
  const workspaceId = request.auth.context.workspace.id
  response.json({
    approvals: await database.listProjectApprovals(workspaceId, projectId),
    comments: await database.listProjectComments(workspaceId, projectId),
    draftInvoice: await database.getDraftInvoiceByProject(workspaceId, projectId),
  })
})

app.get('/api/projects/:id/reviews', requireAuth, async (request, response) => {
  const projectId = String(request.params.id || '')
  const review = await database.getLatestReviewForProject(request.auth.context.workspace.id, projectId)
  response.json({
    review: review ? reviewResponse(review, '') : null,
  })
})

app.patch('/api/reviews/:reviewId/annotations/:annotationId', secureMutations, requireAuth, async (request, response) => {
  const review = await database.getReviewSession(request.auth.context.workspace.id, reviewId(request.params.reviewId))
  if (!review) throw new HttpError(404, 'Review not found.')
  const status = String(request.body?.status || '')
  if (!['open', 'in_progress', 'resolved', 'rejected'].includes(status)) {
    throw new HttpError(400, 'Select a valid annotation status.')
  }
  const annotation = await database.updateReviewAnnotation(
    review.id,
    String(request.params.annotationId || ''),
    { status },
  )
  if (!annotation) throw new HttpError(404, 'Annotation not found.')
  response.json({ annotation })
})

app.post('/api/reviews/:reviewId/close', secureMutations, requireAuth, async (request, response) => {
  const review = await database.closeReviewSession(
    request.auth.context.workspace.id,
    reviewId(request.params.reviewId),
  )
  if (!review) throw new HttpError(404, 'Review not found.')
  response.json({ review })
})

function draftInvoicePaymentUrl(draft) {
  const signature = sign(`draft-invoice:${draft.id}`)
  return new URL(`/pay/${encodeURIComponent(draft.id)}?sig=${encodeURIComponent(signature)}`, publicOrigin).toString()
}

function draftInvoiceSignatureIsValid(id, value) {
  return Boolean(value) && safeEqual(sign(`draft-invoice:${id}`), String(value))
}

app.get('/api/draft-invoices', requireAuth, async (request, response) => {
  response.json({
    invoices: await database.listDraftInvoices(request.auth.context.workspace.id),
  })
})

app.patch('/api/draft-invoices/:id', secureMutations, requireAuth, async (request, response) => {
  const id = String(request.params.id || '')
  if (!/^draft_[a-f0-9]{12,40}$/.test(id)) throw new HttpError(400, 'A valid draft invoice id is required.')
  const current = await database.getDraftInvoice(request.auth.context.workspace.id, id)
  if (!current) throw new HttpError(404, 'Draft invoice not found.')
  if (current.status === 'sent') throw new HttpError(409, 'A sent invoice cannot be edited.')
  const fields = {}
  if (Object.hasOwn(request.body || {}, 'description')) fields.description = String(request.body.description || '').trim().slice(0, 500)
  if (Object.hasOwn(request.body || {}, 'amountMinor')) fields.amountMinor = Number(request.body.amountMinor)
  if (Object.hasOwn(request.body || {}, 'dueDate')) fields.dueDate = request.body.dueDate ? String(request.body.dueDate).trim() : null
  if (fields.description !== undefined && fields.description.length < 2) throw new HttpError(400, 'Invoice description is required.')
  if (fields.amountMinor !== undefined && (!Number.isSafeInteger(fields.amountMinor) || fields.amountMinor < 0)) throw new HttpError(400, 'Invoice amount must be a valid non-negative value in cents.')
  if (fields.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(fields.dueDate)) throw new HttpError(400, 'Due date must use YYYY-MM-DD.')
  response.json(await database.updateDraftInvoice(request.auth.context.workspace.id, id, fields))
})

app.post('/api/draft-invoices/:id/send', secureMutations, requireAuth, async (request, response) => {
  const id = String(request.params.id || '')
  const workspaceId = request.auth.context.workspace.id
  const draft = await database.getDraftInvoice(workspaceId, id)
  if (!draft) throw new HttpError(404, 'Draft invoice not found.')
  if (!Number.isSafeInteger(draft.amountMinor) || draft.amountMinor < 100) {
    throw new HttpError(409, 'Add an invoice amount of at least R1.00 before sending.')
  }
  const paymentUrl = draftInvoicePaymentUrl(draft)
  const sent = await database.updateDraftInvoice(workspaceId, id, {
    status: 'sent',
    paymentUrl,
  })
  let delivery = 'not_configured'
  if (draft.clientEmail) {
    try {
      const invoiceMail = invoiceEmail({
        clientName: draft.clientName,
        workspaceName: request.auth.context.workspace.name,
        description: draft.description,
        invoiceNumber: draft.invoiceNumber,
        paymentUrl,
        amountMinor: draft.amountMinor,
        currency: draft.currency,
      })
      await sendNotification({
        to: draft.clientEmail,
        subject: `Invoice ${draft.invoiceNumber} from ${request.auth.context.workspace.name}`,
        text: invoiceMail.text,
        html: invoiceMail.html,
      })
      delivery = 'sent'
    } catch (error) {
      if (error?.code !== 'SMTP_NOT_CONFIGURED') delivery = 'failed'
    }
  }
  await database.createWorkspaceNotification({
    workspaceId,
    kind: 'invoice.sent',
    title: 'Invoice sent to client',
    body: `${draft.invoiceNumber} is ready for payment.`,
    entityType: 'draft_invoice',
    entityId: draft.id,
  })
  const project = await database.completeProjectWorkflow(workspaceId, draft.projectId)
  response.json({ invoice: sent, delivery, project })
})

app.get('/pay/:id', async (request, response) => {
  const id = String(request.params.id || '')
  if (!draftInvoiceSignatureIsValid(id, request.query.sig)) {
    response.status(404).send('<!doctype html><html><body><h1>Payment link not found.</h1></body></html>')
    return
  }
  const rows = await database.query('SELECT * FROM draft_invoices WHERE id = $1', [id])
  const publicDraft = rows[0]
  if (!publicDraft || publicDraft.status !== 'sent') {
    response.status(404).send('<!doctype html><html><body><h1>Invoice not found.</h1></body></html>')
    return
  }
  response.type('html').send(`<!doctype html><html><body style="font-family:system-ui;max-width:620px;margin:48px auto;padding:20px"><h1>${escapeHtml(publicDraft.invoice_number)}</h1><p>${escapeHtml(publicDraft.description)}</p><p><strong>${escapeHtml(publicDraft.currency)} ${(Number(publicDraft.amount_minor) / 100).toFixed(2)}</strong></p><p>This is a hosted payment placeholder. Payment processing can be connected from Money.</p><form method="post" action="/api/public/draft-invoices/${encodeURIComponent(id)}/pay?sig=${encodeURIComponent(request.query.sig)}"><button type="submit">Pay invoice</button></form></body></html>`)
})

app.post('/api/public/draft-invoices/:id/pay', async (request, response) => {
  const id = String(request.params.id || '')
  if (!draftInvoiceSignatureIsValid(id, request.query.sig)) {
    response.status(404).send('Payment link not found.')
    return
  }
  const rows = await database.query('SELECT * FROM draft_invoices WHERE id = $1 AND status = \'sent\'', [id])
  if (!rows[0]) {
    response.status(404).send('Invoice not found.')
    return
  }
  response.type('html').send('<!doctype html><html><body style="font-family:system-ui;max-width:620px;margin:48px auto;padding:20px"><h1>Payment received</h1><p>This Phase 3 payment page is running in mock mode. Connect Paystack in Money for live reconciliation.</p></body></html>')
})

app.get('/api/notifications', requireAuth, async (request, response) => {
  response.set('Cache-Control', 'private, no-store')
  response.json({ notifications: await database.listWorkspaceNotifications(request.auth.context.workspace.id) })
})

app.patch('/api/notifications/:id/read', secureMutations, requireAuth, async (request, response) => {
  const id = String(request.params.id || '').trim()
  if (!/^ntf_[A-Za-z0-9_-]{8,80}$/.test(id)) {
    throw new HttpError(400, 'A valid notification id is required.')
  }
  const result = await executeIdempotentMutation({
    request,
    route: 'PATCH /api/notifications/:id/read',
    input: { id },
    operation: async () => {
      const notification = await database.markWorkspaceNotificationRead(
        request.auth.context.workspace.id,
        id,
      )
      if (!notification) throw new HttpError(404, 'Notification not found.')
      return { status: 200, response: { notification } }
    },
  })
  sendMutationResponse(response, result)
})

app.post('/api/clients', secureMutations, requireAuth, async (request, response) => {
  const name = String(request.body?.name || '').trim()
  const email = String(request.body?.email || '').trim().toLowerCase()
  const company = String(request.body?.company || '').trim()
  const notes = String(request.body?.notes || '').trim()
  if (!name || name.length > 160) {
    throw new HttpError(400, 'A client name is required and must be 160 characters or fewer.')
  }
  if (email.length > 254 || company.length > 160 || notes.length > 2000) {
    throw new HttpError(400, 'One or more client fields are too long.')
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Enter a valid client email address.')
  }
  const result = await executeIdempotentMutation({
    request,
    route: 'POST /api/clients',
    input: { name, email, company, notes },
    operation: async () => ({
      status: 201,
      response: await database.createClient({
        workspaceId: request.auth.context.workspace.id,
        name,
        email,
        company,
        notes,
      }),
    }),
  })
  sendMutationResponse(response, result)
})

app.patch('/api/clients/:id', secureMutations, requireAuth, async (request, response) => {
  const id = String(request.params.id || '')
  if (!/^clt_[a-z0-9_-]{8,80}$/i.test(id)) {
    throw new HttpError(400, 'A valid client id is required.')
  }
  const fields = {}
  for (const key of ['name', 'email', 'company', 'status', 'notes']) {
    if (Object.hasOwn(request.body || {}, key)) {
      fields[key] = String(request.body[key] || '').trim()
    }
  }
  if (fields.name === '' || (fields.name?.length || 0) > 160) {
    throw new HttpError(400, 'Client names cannot be empty or longer than 160 characters.')
  }
  if (fields.status && !['active', 'archived'].includes(fields.status)) {
    throw new HttpError(400, 'Select a valid client status.')
  }
  if ((fields.email?.length || 0) > 254 || (fields.company?.length || 0) > 160 || (fields.notes?.length || 0) > 2000) {
    throw new HttpError(400, 'One or more client fields are too long.')
  }
  const updated = await database.updateClient(
    request.auth.context.workspace.id,
    id,
    fields,
  )
  if (!updated) throw new HttpError(404, 'Client not found.')
  response.json(updated)
})

const clientLogoTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

app.put(
  '/api/clients/:id/logo',
  secureMutations,
  requireAuth,
  express.raw({ type: [...clientLogoTypes], limit: '2mb' }),
  async (request, response) => {
    const id = String(request.params.id || '')
    if (!/^clt_[a-z0-9_-]{8,80}$/i.test(id)) {
      throw new HttpError(400, 'A valid client id is required.')
    }
    const contentType = String(request.get('Content-Type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase()
    if (!clientLogoTypes.has(contentType)) {
      throw new HttpError(415, 'Use a JPEG, PNG, or WebP client logo.')
    }
    if (!Buffer.isBuffer(request.body) || request.body.byteLength === 0) {
      throw new HttpError(400, 'Choose a non-empty client logo.')
    }
    const logoUrl = `data:${contentType};base64,${request.body.toString('base64')}`
    const result = await executeIdempotentMutation({
      request,
      route: `PUT /api/clients/${id}/logo`,
      input: { contentType, imageHash: hashSecret(request.body.toString('base64')) },
      operation: async () => {
        const updated = await database.updateClient(
          request.auth.context.workspace.id,
          id,
          { logoUrl },
        )
        if (!updated) throw new HttpError(404, 'Client not found.')
        return { status: 200, response: updated }
      },
    })
    sendMutationResponse(response, result)
  },
)

app.delete('/api/clients/:id/logo', secureMutations, requireAuth, async (request, response) => {
  const id = String(request.params.id || '')
  if (!/^clt_[a-z0-9_-]{8,80}$/i.test(id)) {
    throw new HttpError(400, 'A valid client id is required.')
  }
  const result = await executeIdempotentMutation({
    request,
    route: `DELETE /api/clients/${id}/logo`,
    input: { id },
    operation: async () => {
      const updated = await database.updateClient(
        request.auth.context.workspace.id,
        id,
        { logoUrl: '' },
      )
      if (!updated) throw new HttpError(404, 'Client not found.')
      return { status: 200, response: updated }
    },
  })
  sendMutationResponse(response, result)
})

app.delete('/api/clients/:id', secureMutations, requireAuth, async (request, response) => {
  const id = String(request.params.id || '')
  if (!/^clt_[a-z0-9_-]{8,80}$/i.test(id)) {
    throw new HttpError(400, 'A valid client id is required.')
  }
  const deleted = await database.deleteClient(
    request.auth.context.workspace.id,
    id,
  )
  if (!deleted) throw new HttpError(404, 'Client not found.')
  response.status(204).end()
})

app.post('/api/projects', secureMutations, requireAuth, async (request, response) => {
  const name = String(request.body?.name || '').trim()
  const client = String(request.body?.client || '').trim()
  const clientId = String(request.body?.clientId || '').trim() || null
  const scope = String(request.body?.scope || 'New project · add deliverables').trim()
  const due = String(request.body?.due || 'Set date').trim()
  const status = String(request.body?.status || 'In progress').trim()
  if (!name || name.length > 160 || (!client && !clientId) || client.length > 160) {
    throw new HttpError(400, 'Project and client names are required and must be 160 characters or fewer.')
  }
  if (clientId && !/^clt_[a-z0-9_-]{8,80}$/i.test(clientId)) {
    throw new HttpError(400, 'Select a valid client.')
  }
  if (
    clientId &&
    !(await database.listClients(request.auth.context.workspace.id))
      .some((item) => item.id === clientId)
  ) {
    throw new HttpError(404, 'The selected client was not found.')
  }
  if (scope.length > 500 || due.length > 40) {
    throw new HttpError(400, 'Project scope or due date is too long.')
  }
  if (!['In progress', 'In review', 'Waiting on client', 'Ready'].includes(status)) {
    throw new HttpError(400, 'Select a valid project status.')
  }
  const result = await executeIdempotentMutation({
    request,
      route: 'POST /api/projects',
      input: { name, clientId, client, scope, due, status },
    operation: async () => {
      // executeIdempotentMutation already holds the database transaction, so
      // keep the project, job card, and draft invoice creation in that same
      // transaction instead of opening a nested one (SQLite rejects that).
      const project = await database.createProject({
        workspaceId: request.auth.context.workspace.id,
        name,
        clientId,
        client,
        scope,
        due,
        status,
      })
      const jobCard = await database.ensureJobCard({
        workspaceId: request.auth.context.workspace.id,
        projectId: project.id,
        createdBy: request.auth.context.user.id,
      })
      const draftInvoice = await database.createDraftInvoiceForProject({
        workspaceId: request.auth.context.workspace.id,
        projectId: project.id,
      })
      const created = { project, jobCardId: jobCard?.id || null, draftInvoice }
      return {
        status: 201,
        response: {
          ...created.project,
          jobCardId: created.jobCardId,
          draftInvoice: created.draftInvoice,
        },
      }
    },
  })
  sendMutationResponse(response, result)
})

app.patch('/api/projects/:id', secureMutations, requireAuth, async (request, response) => {
  const id = String(request.params.id || '')
  if (!/^prj_[a-z0-9_-]{6,80}$/i.test(id)) {
    throw new HttpError(400, 'A valid project id is required.')
  }
  const allowedStatuses = new Set(['In progress', 'In review', 'Waiting on client', 'Ready'])
  const fields = {}
  for (const key of ['status', 'name', 'client', 'clientId', 'scope', 'due']) {
    if (Object.hasOwn(request.body || {}, key)) fields[key] = String(request.body[key] || '').trim()
  }
  if (Object.hasOwn(request.body || {}, 'boardId')) {
    fields.boardId = request.body.boardId
      ? validateBoardId(request.body.boardId)
      : null
  }
  if (fields.status && !allowedStatuses.has(fields.status)) {
    throw new HttpError(400, 'Select a valid project status.')
  }
  if (fields.clientId && !/^clt_[a-z0-9_-]{8,80}$/i.test(fields.clientId)) {
    throw new HttpError(400, 'Select a valid client.')
  }
  if (
    fields.clientId &&
    !(await database.listClients(request.auth.context.workspace.id))
      .some((item) => item.id === fields.clientId)
  ) {
    throw new HttpError(404, 'The selected client was not found.')
  }
  if (fields.name === '' || fields.client === '') {
    throw new HttpError(400, 'Project and client names cannot be empty.')
  }
  if ((fields.name?.length || 0) > 160 || (fields.client?.length || 0) > 160) {
    throw new HttpError(400, 'Project and client names must be 160 characters or fewer.')
  }
  if ((fields.scope?.length || 0) > 500 || (fields.due?.length || 0) > 40) {
    throw new HttpError(400, 'Project scope or due date is too long.')
  }
  if (Object.keys(fields).length === 0) {
    throw new HttpError(400, 'Provide at least one project field to update.')
  }
  const result = await executeIdempotentMutation({
    request,
    route: `PATCH /api/projects/${id}`,
    input: fields,
    operation: async () => {
      const updated = await database.updateProject(
        request.auth.context.workspace.id,
        id,
        fields,
      )
      if (!updated) throw new HttpError(404, 'Project not found.')
      return { status: 200, response: updated }
    },
  })
  sendMutationResponse(response, result)
})

function projectTaskId(value) {
  const id = String(value || '').trim()
  if (!/^tsk_[a-f0-9-]{36}$/i.test(id)) {
    throw new HttpError(400, 'A valid task id is required.')
  }
  return id
}

function projectTaskBucketId(value) {
  const bucketId = String(value || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9_-]{0,80}$/.test(bucketId)) {
    throw new HttpError(400, 'A valid task bucket is required.')
  }
  return bucketId
}

function projectTaskTitle(value) {
  const title = String(value || '').trim()
  if (title.length < 1 || title.length > 160) {
    throw new HttpError(400, 'Task titles must be between 1 and 160 characters.')
  }
  return title
}

function projectTaskNotes(value) {
  const notes = String(value || '').trim()
  if (notes.length > 2_000) {
    throw new HttpError(400, 'Task notes must be 2,000 characters or fewer.')
  }
  return notes
}

app.get('/api/projects/:id/tasks', requireAuth, async (request, response) => {
  const projectId = String(request.params.id || '')
  if (!/^prj_[a-z0-9_-]{6,80}$/i.test(projectId)) {
    throw new HttpError(400, 'A valid project id is required.')
  }
  response.json({
    tasks: await database.listProjectTasks(request.auth.context.workspace.id, projectId),
  })
})

app.post('/api/projects/:id/tasks', secureMutations, requireAuth, async (request, response) => {
  const projectId = String(request.params.id || '')
  if (!/^prj_[a-z0-9_-]{6,80}$/i.test(projectId)) {
    throw new HttpError(400, 'A valid project id is required.')
  }
  const title = projectTaskTitle(request.body?.title)
  const notes = projectTaskNotes(request.body?.notes)
  const bucketId = projectTaskBucketId(request.body?.bucketId || 'backlog')
  const result = await executeIdempotentMutation({
    request,
    route: `POST /api/projects/${projectId}/tasks`,
    input: { projectId, title, notes, bucketId },
    operation: async () => {
      const task = await database.createProjectTask({
        workspaceId: request.auth.context.workspace.id,
        projectId,
        bucketId,
        title,
        notes,
      })
      if (!task) throw new HttpError(404, 'Project not found.')
      return { status: 201, response: { task } }
    },
  })
  sendMutationResponse(response, result)
})

app.patch('/api/projects/:id/tasks/:taskId', secureMutations, requireAuth, async (request, response) => {
  const projectId = String(request.params.id || '')
  if (!/^prj_[a-z0-9_-]{6,80}$/i.test(projectId)) {
    throw new HttpError(400, 'A valid project id is required.')
  }
  const taskId = projectTaskId(request.params.taskId)
  const fields = {}
  if (Object.hasOwn(request.body || {}, 'title')) fields.title = projectTaskTitle(request.body.title)
  if (Object.hasOwn(request.body || {}, 'notes')) fields.notes = projectTaskNotes(request.body.notes)
  if (Object.hasOwn(request.body || {}, 'bucketId')) fields.bucketId = projectTaskBucketId(request.body.bucketId)
  if (!Object.keys(fields).length) throw new HttpError(400, 'Provide at least one task field to update.')
  const existingTask = (await database.listProjectTasks(request.auth.context.workspace.id, projectId))
    .find((item) => item.id === taskId)
  if (!existingTask) throw new HttpError(404, 'Task not found.')
  const result = await executeIdempotentMutation({
    request,
    route: `PATCH /api/projects/${projectId}/tasks/${taskId}`,
    input: { projectId, taskId, ...fields },
    operation: async () => {
      const task = await database.updateProjectTask(
        request.auth.context.workspace.id,
        taskId,
        fields,
      )
      if (!task || task.projectId !== existingTask.projectId) throw new HttpError(404, 'Task not found.')
      return { status: 200, response: { task } }
    },
  })
  sendMutationResponse(response, result)
})

app.delete('/api/projects/:id/tasks/:taskId', secureMutations, requireAuth, async (request, response) => {
  const projectId = String(request.params.id || '')
  if (!/^prj_[a-z0-9_-]{6,80}$/i.test(projectId)) {
    throw new HttpError(400, 'A valid project id is required.')
  }
  const taskId = projectTaskId(request.params.taskId)
  const task = (await database.listProjectTasks(request.auth.context.workspace.id, projectId))
    .find((item) => item.id === taskId)
  if (!task) throw new HttpError(404, 'Task not found.')
  const deleted = await database.deleteProjectTask(request.auth.context.workspace.id, taskId)
  if (!deleted) throw new HttpError(404, 'Task not found.')
  response.status(204).end()
})

app.delete('/api/projects/:id', secureMutations, requireAuth, async (request, response) => {
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
  let parsedUrl
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new HttpError(400, 'A valid URL is required.')
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol) || url.length > 2048) {
    throw new HttpError(400, 'Project links must use http or https.')
  }
  if (label.length > 120) throw new HttpError(400, 'Link label is too long.')
  const link = await database.createProjectLink({
    workspaceId: request.auth.context.workspace.id,
    projectId,
    url,
    label,
  })
  response.status(201).json({ link })
})

app.delete('/api/projects/links/:linkId', secureMutations, requireAuth, async (request, response) => {
  await database.deleteProjectLink(request.auth.context.workspace.id, request.params.linkId)
  response.status(204).end()
})

app.get('/api/projects/:id/files', requireAuth, async (request, response) => {
  const projectId = request.params.id
  response.json({
    files: await database.listProjectFiles(request.auth.context.workspace.id, projectId),
  })
})

app.post(
  '/api/projects/:id/files',
  secureMutations,
  requireAuth,
  express.raw({ type: 'application/octet-stream', limit: '10mb' }),
  async (request, response) => {
    const projectId = String(request.params.id || '')
    if (!/^prj_[a-z0-9_-]{6,80}$/i.test(projectId)) {
      throw new HttpError(400, 'A valid project id is required.')
    }
    const project = (
      await database.listProjects(request.auth.context.workspace.id)
    ).find((item) => item.id === projectId)
    if (!project) throw new HttpError(404, 'Project not found.')

    let name
    try {
      name = decodeURIComponent(String(request.get('X-File-Name') || '')).trim()
    } catch {
      throw new HttpError(400, 'The file name is not valid UTF-8.')
    }
    const mimeType = String(
      request.get('X-File-Type') || 'application/octet-stream',
    ).trim()
    if (
      !name ||
      name.length > 255 ||
      [...name].some((character) => {
        const code = character.codePointAt(0)
        return code !== undefined && (code < 32 || code === 127)
      }) ||
      mimeType.length > 160 ||
      /[\r\n]/.test(mimeType)
    ) {
      throw new HttpError(400, 'A bounded file name and MIME type are required.')
    }
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      throw new HttpError(400, 'Choose a non-empty file to attach.')
    }
    const contentSha256 = createHash('sha256')
      .update(request.body)
      .digest('hex')
    const storageKey = `postgres:${contentSha256}`
    const result = await executeIdempotentMutation({
      request,
      route: `POST /api/projects/${projectId}/files`,
      input: {
        projectId,
        name,
        mimeType,
        size: request.body.length,
        contentSha256,
      },
      operation: async () => ({
        status: 201,
        response: {
          file: await database.createProjectFile({
            workspaceId: request.auth.context.workspace.id,
            projectId,
            name,
            mimeType,
            size: request.body.length,
            storageKey,
            contentBase64: request.body.toString('base64'),
            contentSha256,
          }),
        },
      }),
    })
    sendMutationResponse(response, result)
  },
)

app.get('/api/projects/files/:fileId/download', requireAuth, async (request, response) => {
  const fileId = String(request.params.fileId || '')
  if (!/^file_[a-f0-9]{12}$/.test(fileId)) {
    throw new HttpError(400, 'A valid file id is required.')
  }
  const file = await database.getProjectFile(
    request.auth.context.workspace.id,
    fileId,
  )
  if (!file?.contentBase64) throw new HttpError(404, 'File not found.')
  const content = Buffer.from(file.contentBase64, 'base64')
  if (
    content.length !== Number(file.size) ||
    createHash('sha256').update(content).digest('hex') !== file.sha256
  ) {
    throw new HttpError(500, 'Stored file integrity check failed.')
  }
  const fallbackName = file.name
    .replace(/[^\x20-\x7e]/g, '_')
    .replaceAll('"', '_')
    .replaceAll('\\', '_')
  response.set({
    'Content-Type': file.mimeType || 'application/octet-stream',
    'Content-Length': String(content.length),
    'Content-Disposition':
      `attachment; filename="${fallbackName}"; ` +
      `filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'Cache-Control': 'private, no-store',
  })
  response.send(content)
})

app.delete('/api/projects/files/:fileId', secureMutations, requireAuth, async (request, response) => {
  await database.deleteProjectFile(request.auth.context.workspace.id, request.params.fileId)
  response.status(204).end()
})

const googleDrive = getGoogleDriveConfig({ publicOrigin })

function redirectDriveResult(
  response,
  { status, message = '', returnTo = 'integrations' },
) {
  const target = new URL(publicOrigin)
  target.searchParams.set('page', returnTo === 'files' ? 'files' : 'integrations')
  target.searchParams.set('drive', status)
  if (message) target.searchParams.set('driveMessage', message.slice(0, 180))
  response.redirect(target.toString())
}

async function resolveGoogleDriveAccessToken(workspaceId) {
  if (!googleDrive.configured) {
    throw new GoogleDriveError(
      'DRIVE_NOT_CONFIGURED',
      'Google Drive OAuth credentials are not configured on the server.',
      503,
    )
  }

  const stored = await database.getGoogleDriveToken(workspaceId)
  if (!stored?.accessToken) {
    throw new GoogleDriveError(
      'DRIVE_NOT_CONNECTED',
      'Google Drive is not connected for this workspace.',
      409,
    )
  }
  if (!tokenHasDriveFileScope(stored)) {
    await database.deleteGoogleDriveToken(workspaceId)
    throw new GoogleDriveError(
      'DRIVE_REAUTH_REQUIRED',
      'Reconnect Google Drive to approve safer per-file access.',
      401,
    )
  }

  const accessToken = decryptDriveSecret(stored.accessToken, sessionSecret)
  const refreshToken = decryptDriveSecret(stored.refreshToken, sessionSecret)

  if (accessTokenIsFresh(stored.expiresAt) && accessToken) {
    return accessToken
  }

  if (!refreshToken) {
    throw new GoogleDriveError(
      'DRIVE_REAUTH_REQUIRED',
      'Google Drive access expired. Reconnect Google Drive to continue.',
      401,
    )
  }

  try {
    const refreshed = await refreshGoogleAccessToken({
      refreshToken,
      clientId: googleDrive.clientId,
      clientSecret: googleDrive.clientSecret,
    })
    await database.saveGoogleDriveToken({
      workspaceId,
      accessToken: encryptDriveSecret(refreshed.accessToken, sessionSecret),
      refreshToken: encryptDriveSecret(refreshed.refreshToken, sessionSecret),
      expiresAt: refreshed.expiresAt,
      tokenType: refreshed.tokenType,
      scope: refreshed.scope || stored.scope,
    })
    return refreshed.accessToken
  } catch (error) {
    if (error instanceof GoogleDriveError && (error.status === 400 || error.status === 401)) {
      await database.deleteGoogleDriveToken(workspaceId)
      throw new GoogleDriveError(
        'DRIVE_REAUTH_REQUIRED',
        'Google Drive authorization was revoked or expired. Reconnect to continue.',
        401,
      )
    }
    throw error
  }
}

function googleDriveFileId(request) {
  const fileId = String(request.params?.fileId || '').trim()
  if (!/^[A-Za-z0-9_-]{3,200}$/.test(fileId)) {
    throw new HttpError(400, 'A valid Google Drive file ID is required.')
  }
  return fileId
}

const supportedWorkspaceDocument = (mimeType, name) => {
  const normalized = String(mimeType || '').toLowerCase()
  const lowerName = String(name || '').toLowerCase()
  return (
    normalized === 'application/pdf' ||
    normalized === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    normalized === 'application/msword' ||
    normalized === 'text/markdown' ||
    normalized === 'text/x-markdown' ||
    normalized === 'text/plain' ||
    normalized.startsWith('image/') ||
    lowerName.endsWith('.pdf') ||
    lowerName.endsWith('.doc') ||
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.markdown') ||
    lowerName.endsWith('.txt')
  )
}

app.get('/api/documents', requireAuth, async (request, response) => {
  response.json({
    documents: await database.listWorkspaceDocuments(
      request.auth.context.workspace.id,
    ),
  })
})

app.post(
  '/api/documents',
  secureMutations,
  requireAuth,
  express.raw({ type: 'application/octet-stream', limit: '10mb' }),
  async (request, response) => {
    let name
    try {
      name = decodeURIComponent(String(request.get('X-File-Name') || '')).trim()
    } catch {
      throw new HttpError(400, 'The document name is invalid.')
    }
    let mimeType = String(request.get('X-File-Type') || 'application/octet-stream')
      .trim()
      .toLowerCase()
    const destination = String(request.get('X-File-Destination') || 'local')
      .trim()
      .toLowerCase()
    const folderId = String(request.get('X-Drive-Folder-Id') || '').trim() || null
    if (
      !name ||
      name.length > 240 ||
      name.includes('/') ||
      name.includes('\\') ||
      name.includes('\0')
    ) {
      throw new HttpError(400, 'Enter a valid document name.')
    }
    if (!['local', 'drive', 'both'].includes(destination)) {
      throw new HttpError(400, 'Select a valid upload destination.')
    }
    if (folderId && !/^[A-Za-z0-9_-]{3,200}$/.test(folderId)) {
      throw new HttpError(400, 'A valid Google Drive folder ID is required.')
    }
    if (!Buffer.isBuffer(request.body) || request.body.byteLength === 0) {
      throw new HttpError(400, 'Choose a non-empty document to upload.')
    }
    if (!supportedWorkspaceDocument(mimeType, name)) {
      throw new HttpError(
        415,
        'Upload a PDF, DOC, DOCX, Markdown, text, or image file.',
      )
    }
    if (mimeType === 'application/octet-stream') {
      const lowerName = name.toLowerCase()
      if (lowerName.endsWith('.pdf')) mimeType = 'application/pdf'
      else if (lowerName.endsWith('.docx')) {
        mimeType =
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      } else if (lowerName.endsWith('.doc')) mimeType = 'application/msword'
      else if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
        mimeType = 'text/markdown'
      } else if (lowerName.endsWith('.txt')) mimeType = 'text/plain'
    }

    const selectedWorkspaceId = request.auth.context.workspace.id
    let document = null
    let driveFile = null
    if (destination === 'local' || destination === 'both') {
      document = await database.createWorkspaceDocument({
        workspaceId: selectedWorkspaceId,
        name,
        mimeType,
        body: request.body,
      })
    }
    if (destination === 'drive' || destination === 'both') {
      const accessToken = await resolveGoogleDriveAccessToken(selectedWorkspaceId)
      driveFile = await uploadGoogleDriveFile({
        accessToken,
        name,
        body: request.body,
        contentType: mimeType,
        folderId,
      })
      if (document) {
        document = await database.markWorkspaceDocumentSynced(
          selectedWorkspaceId,
          document.id,
          driveFile,
        )
      }
      await database.upsertGoogleDriveSelection({
        workspaceId: selectedWorkspaceId,
        rootFileId: driveFile.id,
        file: driveFile,
      })
    }
    response.status(201).json({ document, driveFile })
  },
)

app.get('/api/documents/:id/download', requireAuth, async (request, response) => {
  const document = await database.getWorkspaceDocument(
    request.auth.context.workspace.id,
    request.params.id,
  )
  if (!document) throw new HttpError(404, 'Document not found.')
  response.set({
    'Cache-Control': 'private, no-store',
    'Content-Type': document.mimeType,
    'Content-Length': String(document.size),
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`,
  })
  response.send(document.body)
})

app.get('/api/documents/:id/content', requireAuth, async (request, response) => {
  const document = await database.getWorkspaceDocument(
    request.auth.context.workspace.id,
    request.params.id,
  )
  if (!document) throw new HttpError(404, 'Document not found.')
  const previewable =
    document.mimeType === 'application/pdf' ||
    document.mimeType.startsWith('image/')
  if (!previewable) {
    throw new HttpError(415, 'This document type opens in the lancee editor.')
  }
  response.set({
    'Cache-Control': 'private, no-store',
    'Content-Type': document.mimeType,
    'Content-Length': String(document.size),
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(document.name)}`,
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy':
      "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'; sandbox",
  })
  response.send(document.body)
})

app.get('/api/documents/:id/editor', requireAuth, async (request, response) => {
  const document = await database.getWorkspaceDocument(
    request.auth.context.workspace.id,
    request.params.id,
  )
  if (!document) throw new HttpError(404, 'Document not found.')
  const editorDocument = await loadEditorDocumentFromBuffer({
    file: {
      id: document.id,
      name: document.name,
      mimeType: document.mimeType,
      webViewLink: null,
      modifiedTime: document.updatedAt,
      version: document.sha256,
      size: document.size,
      canEdit: true,
      canDownload: true,
      canListChildren: false,
    },
    body: document.body,
  })
  response.json({ document: editorDocument })
})

app.put(
  '/api/documents/:id/content',
  secureMutations,
  requireAuth,
  express.text({
    type: ['text/html', 'text/markdown', 'text/x-markdown'],
    limit: '5mb',
  }),
  async (request, response) => {
    const selectedWorkspaceId = request.auth.context.workspace.id
    const document = await database.getWorkspaceDocument(
      selectedWorkspaceId,
      request.params.id,
    )
    if (!document) throw new HttpError(404, 'Document not found.')
    const expectedVersion = String(request.get('X-Document-Version') || '').trim()
    if (expectedVersion && expectedVersion !== document.sha256) {
      throw new HttpError(
        409,
        'This document changed after it was opened. Reload it before saving.',
      )
    }
    const converted = await convertDriveEditorContent({
      file: document,
      content: request.body,
    })
    const updated = await database.updateWorkspaceDocumentContent(
      selectedWorkspaceId,
      document.id,
      {
        body: converted.body,
        mimeType: document.mimeType,
      },
    )
    response.json({
      file: {
        id: updated.id,
        name: updated.name,
        mimeType: updated.mimeType,
        webViewLink: null,
        modifiedTime: updated.updatedAt,
        version: updated.sha256,
        size: updated.size,
        canEdit: true,
        canDownload: true,
        canListChildren: false,
      },
    })
  },
)

app.post('/api/documents/:id/sync-drive', secureMutations, requireAuth, async (request, response) => {
  const selectedWorkspaceId = request.auth.context.workspace.id
  const document = await database.getWorkspaceDocument(
    selectedWorkspaceId,
    request.params.id,
  )
  if (!document) throw new HttpError(404, 'Document not found.')
  if (document.driveFileId) {
    response.json({
      document,
      driveFile: {
        id: document.driveFileId,
        name: document.name,
        mimeType: document.mimeType,
        webViewLink: document.driveWebViewLink,
      },
    })
    return
  }
  const folderId = String(request.body?.folderId || '').trim() || null
  if (folderId && !/^[A-Za-z0-9_-]{3,200}$/.test(folderId)) {
    throw new HttpError(400, 'A valid Google Drive folder ID is required.')
  }
  const accessToken = await resolveGoogleDriveAccessToken(selectedWorkspaceId)
  const driveFile = await uploadGoogleDriveFile({
    accessToken,
    name: document.name,
    body: document.body,
    contentType: document.mimeType,
    folderId,
  })
  const updated = await database.markWorkspaceDocumentSynced(
    selectedWorkspaceId,
    document.id,
    driveFile,
  )
  await database.upsertGoogleDriveSelection({
    workspaceId: selectedWorkspaceId,
    rootFileId: driveFile.id,
    file: driveFile,
  })
  response.json({ document: updated, driveFile })
})

app.delete('/api/documents/:id', secureMutations, requireAuth, async (request, response) => {
  await database.deleteWorkspaceDocument(
    request.auth.context.workspace.id,
    request.params.id,
  )
  response.status(204).end()
})

app.put('/api/google-drive/selections', secureMutations, requireAuth, async (request, response) => {
  const rawSelections = Array.isArray(request.body?.selections)
    ? request.body.selections
    : null
  if (!rawSelections || rawSelections.length > 100) {
    throw new HttpError(400, 'Choose up to 100 Google Drive files or folders.')
  }
  const selections = rawSelections.map((selection) => {
    const driveFileId = String(selection?.driveFileId || '').trim()
    const name = String(selection?.name || '').trim()
    const mimeType = String(selection?.mimeType || 'application/octet-stream').trim()
    const webViewLink = String(selection?.webViewLink || '').trim() || null
    if (!/^[A-Za-z0-9_-]{3,200}$/.test(driveFileId) || !name || name.length > 240) {
      throw new HttpError(400, 'Each selected Drive item must have a valid id and name.')
    }
    if (mimeType.length > 160) {
      throw new HttpError(400, 'A selected Drive item has an invalid file type.')
    }
    if (webViewLink) {
      let parsedDriveUrl
      try {
        parsedDriveUrl = new URL(webViewLink)
      } catch {
        throw new HttpError(400, 'A selected Drive item has an invalid view link.')
      }
      if (
        parsedDriveUrl.protocol !== 'https:' ||
        !['drive.google.com', 'docs.google.com'].includes(parsedDriveUrl.hostname) ||
        webViewLink.length > 2048
      ) {
        throw new HttpError(400, 'Selected Drive links must use a secure Google Drive URL.')
      }
    }
    return {
      driveFileId,
      name,
      mimeType,
      webViewLink,
      resourceKind: mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
    }
  })
  const result = await executeIdempotentMutation({
    request,
    route: 'PUT /api/google-drive/selections',
    input: { selections },
    operation: async () => ({
      status: 200,
      response: {
        selections: await database.replaceGoogleDriveSelections(
          request.auth.context.workspace.id,
          [...new Map(selections.map((selection) => [selection.driveFileId, selection])).values()],
        ),
      },
    }),
  })
  sendMutationResponse(response, result)
})

app.get('/api/google-drive/resource-links', requireAuth, async (request, response) => {
  response.json({
    links: await database.listDriveResourceLinks(
      request.auth.context.workspace.id,
      {
        clientId: String(request.query?.clientId || '').trim() || undefined,
        projectId: String(request.query?.projectId || '').trim() || undefined,
      },
    ),
  })
})

app.post('/api/google-drive/resource-links', secureMutations, requireAuth, async (request, response) => {
  const driveFileId = String(request.body?.driveFileId || '').trim()
  const name = String(request.body?.name || '').trim()
  const mimeType = String(request.body?.mimeType || '').trim()
  const webViewLink = String(request.body?.webViewLink || '').trim() || null
  const resourceKind = String(request.body?.resourceKind || '').trim()
  const clientId = String(request.body?.clientId || '').trim() || null
  const projectId = String(request.body?.projectId || '').trim() || null
  if (!/^[A-Za-z0-9_-]{3,200}$/.test(driveFileId) || !name || name.length > 240) {
    throw new HttpError(400, 'A valid Google Drive resource is required.')
  }
  if (!['folder', 'file'].includes(resourceKind) || (!clientId && !projectId)) {
    throw new HttpError(400, 'Choose a client or project for this Drive resource.')
  }
  if (webViewLink) {
    let parsedDriveUrl
    try {
      parsedDriveUrl = new URL(webViewLink)
    } catch {
      throw new HttpError(400, 'The Google Drive view link is invalid.')
    }
    if (
      parsedDriveUrl.protocol !== 'https:' ||
      !['drive.google.com', 'docs.google.com'].includes(parsedDriveUrl.hostname) ||
      webViewLink.length > 2048
    ) {
      throw new HttpError(400, 'The view link must be a secure Google Drive URL.')
    }
  }
  const link = await database.createDriveResourceLink({
    workspaceId: request.auth.context.workspace.id,
    driveFileId,
    name,
    mimeType: mimeType || 'application/octet-stream',
    webViewLink,
    resourceKind,
    clientId,
    projectId,
  })
  if (!link) throw new HttpError(404, 'The selected client or project was not found.')
  response.status(201).json({ link })
})

app.delete('/api/google-drive/resource-links/:id', secureMutations, requireAuth, async (request, response) => {
  await database.deleteDriveResourceLink(
    request.auth.context.workspace.id,
    request.params.id,
  )
  response.status(204).end()
})

app.get('/api/google-drive/status', requireAuth, async (request, response) => {
  response.set('Cache-Control', 'no-store')
  const token = await database.getGoogleDriveToken(request.auth.context.workspace.id)
  response.json({
    ...driveStatusResponse(token),
    configured: googleDrive.configured,
    pickerConfigured: googleDrive.pickerConfigured,
    scope: token?.scope || googleDrive.scope,
  })
})

app.get('/api/google-drive/picker-config', requireAuth, async (request, response) => {
  response.set('Cache-Control', 'private, no-store')
  if (!googleDrive.pickerConfigured) {
    throw new HttpError(
      503,
      'Google Picker requires GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID.',
    )
  }
  response.json({
    accessToken: await resolveGoogleDriveAccessToken(
      request.auth.context.workspace.id,
    ),
    developerKey: googleDrive.pickerApiKey,
    appId: googleDrive.pickerAppId,
  })
})

app.get('/api/google-drive/oauth/url', requireAuth, async (request, response) => {
  response.set('Cache-Control', 'no-store')
  if (!googleDrive.configured) {
    throw new HttpError(
      503,
      'Google Drive OAuth credentials are not configured on the server.',
    )
  }

  const selectedWorkspaceId = request.auth.context.workspace.id
  const returnTo =
    String(request.query?.returnTo || '').trim() === 'files'
      ? 'files'
      : 'integrations'
  const existingToken = await database.getGoogleDriveToken(selectedWorkspaceId)
  if (existingToken && !tokenHasDriveFileScope(existingToken)) {
    await database.deleteGoogleDriveToken(selectedWorkspaceId)
  }

  const state = createOAuthState({
    workspaceId: selectedWorkspaceId,
    userId: request.auth.context.user.id,
    serverSecret: sessionSecret,
    returnTo,
  })
  const url = buildGoogleAuthUrl({
    clientId: googleDrive.clientId,
    redirectUri: googleDrive.redirectUri,
    state,
    scope: googleDrive.scope,
  })
  response.json({
    url,
    redirectUri: googleDrive.redirectUri,
    scope: googleDrive.scope,
  })
})

app.get(
  ['/oauth/callback', '/api/google-drive/oauth/callback'],
  async (request, response) => {
  response.set('Cache-Control', 'no-store')
  let returnTo = 'integrations'
  const state = String(request.query?.state || '').trim()
  if (state) {
    try {
      returnTo = parseOAuthState(state, sessionSecret).returnTo
    } catch {
      // The normal callback validation below reports invalid state.
    }
  }
  const errorParam = String(request.query?.error || '').trim()
  if (errorParam) {
    const description = String(request.query?.error_description || errorParam).trim()
    redirectDriveResult(response, {
      status: 'error',
      message: description || 'Google authorization was denied.',
      returnTo,
    })
    return
  }

  const code = String(request.query?.code || '').trim()
  if (!code || !state) {
    redirectDriveResult(response, {
      status: 'error',
      message: 'Missing OAuth code or state from Google.',
      returnTo,
    })
    return
  }

  if (!googleDrive.configured) {
    redirectDriveResult(response, {
      status: 'error',
      message: 'Google Drive is not configured on the server.',
      returnTo,
    })
    return
  }

  try {
    const claims = parseOAuthState(state, sessionSecret)
    returnTo = claims.returnTo
    const session = await readSession(request)
    if (
      session &&
      (session.context.workspace.id !== claims.workspaceId ||
        session.context.user.id !== claims.userId)
    ) {
      redirectDriveResult(response, {
        status: 'error',
        message: 'OAuth session does not match the signed state.',
        returnTo,
      })
      return
    }

    const membership = await database.getContextByIds(claims.userId, claims.workspaceId)
    if (!membership) {
      redirectDriveResult(response, {
        status: 'error',
        message: 'The connecting user no longer has access to this workspace.',
        returnTo,
      })
      return
    }

    const tokens = await exchangeAuthorizationCode({
      code,
      clientId: googleDrive.clientId,
      clientSecret: googleDrive.clientSecret,
      redirectUri: googleDrive.redirectUri,
    })

    if (!tokens.accessToken) {
      throw new GoogleDriveError(
        'DRIVE_TOKEN_ERROR',
        'Google did not return an access token.',
        502,
      )
    }
    if (
      !tokenHasDriveFileScope({
        scope: tokens.scope || googleDrive.scope,
      })
    ) {
      throw new GoogleDriveError(
        'DRIVE_SCOPE_REJECTED',
        'Google returned a broader Drive permission than lancee accepts. Remove the old grant from your Google Account and reconnect.',
        400,
      )
    }

    const existing = await database.getGoogleDriveToken(claims.workspaceId)
    const refreshToken =
      tokens.refreshToken ||
      (tokenHasDriveFileScope(existing) && existing?.refreshToken
        ? decryptDriveSecret(existing.refreshToken, sessionSecret)
        : null)

    if (!refreshToken) {
      // Without a refresh token the connection cannot survive access-token expiry.
      throw new GoogleDriveError(
        'DRIVE_NO_REFRESH_TOKEN',
        'Google did not return a refresh token. Revoke prior access in your Google account and try again.',
        400,
      )
    }

    await database.saveGoogleDriveToken({
      workspaceId: claims.workspaceId,
      accessToken: encryptDriveSecret(tokens.accessToken, sessionSecret),
      refreshToken: encryptDriveSecret(refreshToken, sessionSecret),
      expiresAt: tokens.expiresAt,
      tokenType: tokens.tokenType,
      scope: tokens.scope || googleDrive.scope,
    })

    redirectDriveResult(response, { status: 'connected', returnTo })
  } catch (error) {
    console.error('Google Drive OAuth error:', error)
    redirectDriveResult(response, {
      status: 'error',
      message:
        error instanceof GoogleDriveError || error instanceof Error
          ? error.message
          : 'Unable to complete Google Drive connection.',
      returnTo,
    })
  }
  },
)

app.get('/api/google-drive/files', requireAuth, async (request, response) => {
  response.set('Cache-Control', 'no-store')
  try {
    const workspaceId = request.auth.context.workspace.id
    const accessToken = await resolveGoogleDriveAccessToken(workspaceId)
    const pageSize = Number.parseInt(String(request.query?.pageSize || '25'), 10)
    const pageToken = String(request.query?.pageToken || '').trim() || null
    const folderId = String(request.query?.folderId || '').trim() || null
    if (folderId && !/^[A-Za-z0-9_-]{3,200}$/.test(folderId)) {
      throw new HttpError(400, 'A valid Google Drive folder ID is required.')
    }
    const rootFileIds = await database.listGoogleDriveRootFileIds(workspaceId)
    let selectionRootId = null
    if (folderId) {
      selectionRootId = await database.getGoogleDriveSelectionRoot(workspaceId, folderId)
      if (!selectionRootId && rootFileIds.includes(folderId)) selectionRootId = folderId
      if (!selectionRootId) {
        throw new GoogleDriveError(
          'DRIVE_SELECTION_REQUIRED',
          'Choose this folder in Google Drive before opening it here.',
          403,
        )
      }
    } else if (rootFileIds.length === 0) {
      response.json({ files: [], nextPageToken: null })
      return
    }
    if (folderId) {
      const folder = await getGoogleDriveFileMetadata({ accessToken, fileId: folderId })
      if (folder.mimeType !== 'application/vnd.google-apps.folder') {
        throw new HttpError(400, 'The selected Google Drive item is not a folder.')
      }
    }
    const result = await listGoogleDriveFiles({
      accessToken,
      pageSize,
      pageToken,
      folderId,
      fileIds: folderId ? null : rootFileIds,
    })
    await database.upsertGoogleDriveSelectionFiles(
      workspaceId,
      selectionRootId,
      result.files,
    )
    response.json(result)
  } catch (error) {
    if (error instanceof GoogleDriveError) {
      response.status(error.status || 502).json({
        error: error.message,
        code: error.code,
      })
      return
    }
    console.error('Google Drive list error:', error)
    response.status(500).json({ error: 'Unable to load Google Drive files.' })
  }
})

app.get(
  '/api/google-drive/files/:fileId/editor',
  requireAuth,
  async (request, response) => {
    response.set('Cache-Control', 'no-store')
    const fileId = googleDriveFileId(request)
    const accessToken = await resolveGoogleDriveAccessToken(
      request.auth.context.workspace.id,
    )
    const file = await getGoogleDriveFileMetadata({ accessToken, fileId })
    const document = await loadGoogleDriveEditorDocument({
      accessToken,
      file,
    })
    response.json({ document })
  },
)

app.get(
  '/api/google-drive/files/:fileId/content',
  requireAuth,
  async (request, response) => {
    const fileId = googleDriveFileId(request)
    const accessToken = await resolveGoogleDriveAccessToken(
      request.auth.context.workspace.id,
    )
    const file = await getGoogleDriveFileMetadata({ accessToken, fileId })
    const previewable =
      file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/')
    if (!previewable || !file.canDownload) {
      throw new GoogleDriveError(
        'DRIVE_FILE_NOT_PREVIEWABLE',
        'This file is not available as an in-app preview.',
        415,
      )
    }
    const requestedRange = String(request.get('Range') || '').trim()
    const range = /^bytes=\d*-\d*$/.test(requestedRange)
      ? requestedRange
      : null
    const content = await fetchGoogleDriveFileContent({
      accessToken,
      fileId,
      range,
    })
    response.status(content.status)
    response.set({
      'Cache-Control': 'private, no-store',
      'Content-Type': content.headers.get('content-type') || file.mimeType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy':
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'; sandbox",
    })
    for (const header of ['accept-ranges', 'content-length', 'content-range']) {
      const value = content.headers.get(header)
      if (value) response.set(header, value)
    }
    if (!content.body) {
      response.end()
      return
    }
    Readable.fromWeb(content.body).pipe(response)
  },
)

app.put(
  '/api/google-drive/files/:fileId/content',
  secureMutations,
  requireAuth,
  express.text({
    type: ['text/html', 'text/markdown', 'text/x-markdown'],
    limit: '5mb',
  }),
  async (request, response) => {
    const fileId = googleDriveFileId(request)
    if (typeof request.body !== 'string') {
      throw new HttpError(
        415,
        'Editable Drive content must be sent as HTML or Markdown.',
      )
    }
    const accessToken = await resolveGoogleDriveAccessToken(
      request.auth.context.workspace.id,
    )
    const file = await getGoogleDriveFileMetadata({ accessToken, fileId })
    if (!file.canEdit) {
      throw new GoogleDriveError(
        'DRIVE_FILE_READ_ONLY',
        'Google Drive reports that this file is read-only.',
        403,
      )
    }
    const expectedVersion = String(request.get('X-Drive-Version') || '').trim()
    if (expectedVersion && file.version && expectedVersion !== file.version) {
      throw new GoogleDriveError(
        'DRIVE_FILE_CONFLICT',
        'This file changed in Google Drive after it was opened. Reload it before saving.',
        409,
      )
    }
    const converted = await convertDriveEditorContent({
      file,
      content: request.body,
    })
    const result = await executeIdempotentMutation({
      request,
      route: 'PUT /api/google-drive/files/:fileId/content',
      input: {
        fileId,
        expectedVersion: expectedVersion || null,
        contentHash: hashSecret(request.body),
      },
      operation: async () => ({
        status: 200,
        response: {
          file: await updateGoogleDriveFileContent({
            accessToken,
            fileId,
            body: converted.body,
            contentType: converted.contentType,
            etag: file.etag,
          }),
        },
      }),
    })
    sendMutationResponse(response, result)
  },
)

app.post(
  '/api/google-drive/files/:fileId/trash',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const fileId = googleDriveFileId(request)
    const workspaceId = request.auth.context.workspace.id
    const accessToken = await resolveGoogleDriveAccessToken(workspaceId)
    const file = await getGoogleDriveFileMetadata({ accessToken, fileId })
    if (!file.canDelete) {
      throw new GoogleDriveError(
        'DRIVE_FILE_NOT_DELETABLE',
        'Google Drive does not allow this file to be moved to trash.',
        403,
      )
    }
    const result = await executeIdempotentMutation({
      request,
      route: 'POST /api/google-drive/files/:fileId/trash',
      input: { fileId },
      operation: async () => {
        const trashed = await trashGoogleDriveFile({ accessToken, fileId })
        await database.deleteGoogleDriveSelection(workspaceId, fileId)
        await database.deleteDriveResourceLinksForFile(workspaceId, fileId)
        await database.clearWorkspaceDocumentDriveLink(workspaceId, fileId)
        return { status: 200, response: { file: trashed } }
      },
    })
    sendMutationResponse(response, result)
  },
)

app.post(
  '/api/google-drive/disconnect',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const result = await executeIdempotentMutation({
      request,
      route: 'POST /api/google-drive/disconnect',
      input: {},
      operation: async () => {
        await database.deleteGoogleDriveToken(request.auth.context.workspace.id)
        return {
          status: 200,
          response: {
            connected: false,
            configured: googleDrive.configured,
          },
        }
      },
    })
    sendMutationResponse(response, result)
  },
)

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
  const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0
  const completedRuns = runs.filter((r) => r.status === 'completed')
  const totalDuration = completedRuns.reduce((sum, r) => sum + (r.durationSeconds || 0), 0)
  const averageRunDurationSec = completedRuns.length > 0 ? Math.round((totalDuration / completedRuns.length) * 10) / 10 : 0
  const now = new Date()
  const monthPrefix = now.toISOString().slice(0, 7)
  const completedRunsThisMonth = completedRuns.filter((run) => String(run.startedAt).startsWith(monthPrefix))
  const automationRuntimeHoursThisMonth = Math.round(
    completedRunsThisMonth.reduce((sum, run) => sum + (run.durationSeconds || 0), 0) / 3600 * 10,
  ) / 10
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  sevenDaysAgo.setHours(0, 0, 0, 0)
  const weeklyRuns = {
    Mon: { runs: 0, success: 0 }, Tue: { runs: 0, success: 0 }, Wed: { runs: 0, success: 0 },
    Thu: { runs: 0, success: 0 }, Fri: { runs: 0, success: 0 }, Sat: { runs: 0, success: 0 }, Sun: { runs: 0, success: 0 },
  }
  for (const run of runs) {
    const startedAt = new Date(run.startedAt)
    if (Number.isNaN(startedAt.getTime()) || startedAt < sevenDaysAgo || startedAt > now) continue
    const day = startedAt.toLocaleDateString('en', { weekday: 'short' })
    if (weeklyRuns[day]) {
      weeklyRuns[day].runs++
      if (run.status === 'completed') weeklyRuns[day].success++
    }
  }
  const weeklyActivity = Object.entries(weeklyRuns).map(([day, data]) => ({ day, ...data }))

  const weekEnd = new Date(now)
  weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()))
  const dueThisWeek = projects.filter((p) => {
    if (!p.due || p.due === 'Set date') return false
    const due = new Date(p.due)
    if (Number.isNaN(due.getTime())) return false
    return due >= now && due <= weekEnd
  }).length
  const dueSoon = projects.filter((p) => {
    if (!p.due || p.due === 'Set date') return false
    const due = new Date(p.due)
    if (Number.isNaN(due.getTime())) return false
    const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    return diff >= 0 && diff <= 14
  }).length

  const clientIds = new Set(projects.map((p) => p.client).filter(Boolean))
  const outstandingAmount = invoices
    .filter((inv) => inv.status === 'pending' || inv.status === 'overdue')
    .reduce((sum, inv) => sum + (inv.amountMinor || 0), 0)
  const pendingInvoices = invoices.filter((inv) => inv.status === 'pending' || inv.status === 'overdue').length

  const [databaseInfo, apiMetrics] = await Promise.all([
    database.getDatabaseInfo(),
    database.getMonthlyApiMetrics(workspaceId, now.toISOString().slice(0, 7)),
  ])

  response.json({
    metrics: {
      activeAutomations,
      connectedIntegrations,
      totalRuns,
      successRate,
      averageRunDurationSec,
      automationRuntimeHoursThisMonth,
      apiCallsThisMonth: apiMetrics.requestCount,
      databaseQueryTimeMs: databaseInfo.averageQueryLatencyMs,
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

const lanceeMcp = createLanceeMcpRuntime({
  database,
  coreToolIds: coreToolCatalog().map((tool) => tool.id),
  executeAutomationRun,
  enqueueCoreJob: (job) => coreRedis.enqueue(job),
  prepareAutomationRun: async (context, automation) => {
    if (automation.execution !== 'edge') return
    const n8nConnection = await database.getN8nConnection(context.workspace.id)
    if (!n8nConnection.connected) {
      throw new LanceeMcpError(
        'MCP_EDGE_NOT_CONFIGURED',
        'Custom Edge workflows require a connected n8n integration.',
        409,
      )
    }
    n8nConnectionSecret(n8nConnection)
  },
})

app.post(
  '/api/codex/lancee-mcp/:tool',
  secureMutations,
  requireCodexScope(lanceeMcpScope),
  async (request, response) => {
    const tool = String(request.params.tool || '').trim()
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(tool)) {
      throw new HttpError(400, 'A valid Lancee MCP tool name is required.')
    }
    try {
      response.json(
        await lanceeMcp.invoke(
          tool,
          request.body || {},
          request.codexAuth.context,
        ),
      )
    } catch (error) {
      if (error instanceof LanceeMcpError) {
        response.status(error.status || 400).json({
          error: error.code,
          message: error.message,
        })
        return
      }
      throw error
    }
  },
)


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
    const execution = request.body?.execution === 'edge' ? 'edge' : 'core'
    const requestedTools = Array.isArray(request.body?.tools)
      ? [...new Set(request.body.tools.map((tool) => String(tool).trim()))]
      : ['workspace.summary']
    const availableTools = new Set(coreToolCatalog().map((tool) => tool.id))
    if (requestedTools.some((tool) => !availableTools.has(tool))) {
      throw new HttpError(400, 'One or more requested Core tools are unavailable.')
    }
    if (name.length < 2 || name.length > 120) {
      throw new HttpError(400, 'Automation name must be between 2 and 120 characters.')
    }
    if (description.length < 2 || description.length > 500) {
      throw new HttpError(400, 'Description must be between 2 and 500 characters.')
    }
    const result = await executeIdempotentMutation({
      request,
      route: 'POST /api/automations',
      input: { name, description, model, execution, tools: requestedTools },
      operation: async () => {
        const automation = await database.createAutomation({
          workspaceId: request.auth.context.workspace.id,
          createdBy: request.auth.context.user.id,
          name,
          description,
          model,
          execution,
          tools: requestedTools,
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

app.put(
  '/api/automations/:id/status',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const id = String(request.params.id || '')
    const status = String(request.body?.status || '')
    if (!/^aut_[a-f0-9]{12}$/.test(id) || !['active', 'paused', 'draft'].includes(status)) {
      throw new HttpError(400, 'A valid automation id and status are required.')
    }
    const result = await executeIdempotentMutation({
      request,
      route: `PUT /api/automations/${id}/status`,
      input: { status },
      operation: async () => {
        const updated = await database.setAutomationStatus(
          request.auth.context.workspace.id,
          id,
          status,
        )
        if (!updated) throw new HttpError(404, 'Automation not found.')
        return { status: 200, response: updated }
      },
    })
    sendMutationResponse(response, result)
  },
)

app.delete(
  '/api/automations/:id',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const id = String(request.params.id || '')
    if (!/^aut_[a-z0-9_-]{3,80}$/i.test(id)) {
      throw new HttpError(400, 'A valid automation id is required.')
    }
    const deleted = await database.deleteAutomation(
      request.auth.context.workspace.id,
      id,
    )
    if (!deleted) throw new HttpError(404, 'Automation not found.')
    response.status(204).end()
  },
)

app.post('/api/mail/discover', requireAuth, async (request, response) => {
  response.json(await discoverMailSettings(request.body?.email))
})

app.get('/api/mail/account', requireAuth, async (request, response) => {
  response.json(mailAccountResponse(
    await database.getMailAccount(request.auth.context.workspace.id),
  ))
})

app.put(
  '/api/mail/account',
  secureMutations,
  requireAuth,
  requireOwner,
  async (request, response) => {
    const selectedWorkspaceId = request.auth.context.workspace.id
    const existing = await database.getMailAccount(selectedWorkspaceId, true)
    const settings = await normalizeMailSettings(request.body)
    const providedPassword = String(request.body?.password || '')
    const password = providedPassword || (existing ? mailPassword(existing) : '')
    const tested = await testMailAccount(settings, password)
    const encrypted = providedPassword || !existing
      ? encryptToken(password)
      : {
          encrypted_access_token: existing.passwordCiphertext,
          iv: existing.passwordIv,
          auth_tag: existing.passwordTag,
        }
    const result = await executeIdempotentMutation({
      request,
      route: 'PUT /api/mail/account',
      input: { ...settings, credentialFingerprint: hashSecret(password) },
      operation: async () => {
        const account = await database.saveMailAccount({
          workspaceId: selectedWorkspaceId,
          connectedBy: request.auth.context.user.id,
          ...settings,
          passwordCiphertext: encrypted.encrypted_access_token,
          passwordIv: encrypted.iv,
          passwordTag: encrypted.auth_tag,
          lastSeenUid: tested.lastSeenUid,
        })
        return { status: 200, response: mailAccountResponse(account) }
      },
    })
    sendMutationResponse(response, result)
  },
)

app.delete(
  '/api/mail/account',
  secureMutations,
  requireAuth,
  requireOwner,
  async (request, response) => {
    await database.deleteMailAccount(request.auth.context.workspace.id)
    response.status(204).end()
  },
)

function mailFolder(value) {
  const folder = String(value || 'INBOX').trim()
  if (!folder || folder.length > 512 || folder.includes('\u0000') || folder.includes('\r') || folder.includes('\n')) {
    throw new HttpError(400, 'A valid mail folder is required.')
  }
  return folder
}

async function connectedMailAccount(context) {
  const account = await database.getMailAccount(context.workspace.id, true)
  if (!account) throw new HttpError(409, 'Connect a mailbox in Messages settings first.')
  return { account, password: mailPassword(account) }
}

app.get('/api/mail/folders', requireAuth, async (request, response) => {
  const { account, password } = await connectedMailAccount(request.auth.context)
  response.json({ folders: await listMailFolders(account, password) })
})

app.get('/api/mail/messages', requireAuth, async (request, response) => {
  const { account, password } = await connectedMailAccount(request.auth.context)
  response.json({
    messages: await listMailMessages(account, password, {
      folder: mailFolder(request.query.folder),
      query: String(request.query.query || '').slice(0, 200),
      limit: Number(request.query.limit || 50),
    }),
  })
})

app.get('/api/mail/messages/:uid', requireAuth, async (request, response) => {
  const uid = Number(request.params.uid)
  if (!Number.isInteger(uid) || uid < 1) throw new HttpError(400, 'A valid message UID is required.')
  const { account, password } = await connectedMailAccount(request.auth.context)
  response.json(await getMailMessage(account, password, {
    folder: mailFolder(request.query.folder),
    uid,
  }))
})

app.post(
  '/api/mail/send',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const { account, password } = await connectedMailAccount(request.auth.context)
    const result = await executeIdempotentMutation({
      request,
      route: 'POST /api/mail/send',
      input: request.body || {},
      operation: async () => {
        const sent = await sendMailMessage(account, password, request.body)
        const recipients = Array.isArray(request.body?.to)
          ? request.body.to.map((value) => String(value || '').trim()).filter(Boolean)
          : []
        const subject = String(request.body?.subject || '').trim() || '(No subject)'
        await database.createWorkspaceNotification({
          workspaceId: request.auth.context.workspace.id,
          kind: 'mail.sent',
          title: 'Message sent',
          body: `${subject} · ${recipients.join(', ') || 'recipient recorded'}.`,
          entityType: 'mail',
          entityId: sent.messageId || null,
        })
        return { status: 201, response: sent }
      },
    })
    sendMutationResponse(response, result)
  },
)

app.post(
  '/api/mail/sync',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const account = await database.getMailAccount(request.auth.context.workspace.id, true)
    if (!account) throw new HttpError(409, 'Connect a mailbox in Messages settings first.')
    response.json(await syncMailWorkspace(account))
  },
)

app.get('/api/mail/rules', requireAuth, async (request, response) => {
  response.json({ rules: await database.listMailAutomationRules(request.auth.context.workspace.id) })
})

async function assertNativeMailAutomation(selectedWorkspaceId, automationId, { requireActive = false } = {}) {
  const automation = await database.getAutomation(selectedWorkspaceId, automationId)
  if (!automation) throw new HttpError(404, 'Automation not found.')
  if (automation.execution !== 'core') {
    throw new HttpError(400, 'Message rules can only run native Core automations; n8n workflows are not supported.')
  }
  if (requireActive && automation.status !== 'active') {
    throw new HttpError(409, 'Activate the selected Core automation before enabling this message rule.')
  }
  return automation
}

function validateMailRuleAutomationInstruction(automation, instruction) {
  let plan
  try {
    plan = automationPlan(instruction, automation)
  } catch (error) {
    if (error instanceof CoreAutomationError) {
      throw new HttpError(error.status || 422, error.message)
    }
    throw error
  }
  const permittedTools = new Set(Array.isArray(automation.tools) ? automation.tools : [])
  const unauthorized = plan.steps.find((step) => !permittedTools.has(step.tool))
  if (unauthorized) {
    throw new HttpError(
      403,
      `The selected automation does not have permission to use ${unauthorized.tool}. Enable that tool first.`,
    )
  }
  return plan
}

app.post(
  '/api/mail/rules',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const selectedWorkspaceId = request.auth.context.workspace.id
    const input = normalizeMailRuleInput(request.body)
    const automation = await assertNativeMailAutomation(selectedWorkspaceId, input.automationId, { requireActive: input.enabled })
    validateMailRuleAutomationInstruction(automation, input.instruction)
    const rule = await database.createMailAutomationRule({
      workspaceId: selectedWorkspaceId,
      createdBy: request.auth.context.user.id,
      ...input,
    })
    response.status(201).json(rule)
  },
)

app.put(
  '/api/mail/rules/:id',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const selectedWorkspaceId = request.auth.context.workspace.id
    const input = normalizeMailRuleInput(request.body)
    const automation = await assertNativeMailAutomation(selectedWorkspaceId, input.automationId, { requireActive: input.enabled })
    validateMailRuleAutomationInstruction(automation, input.instruction)
    const rule = await database.updateMailAutomationRule(
      selectedWorkspaceId,
      String(request.params.id),
      input,
    )
    if (!rule) throw new HttpError(404, 'Message rule not found.')
    response.json(rule)
  },
)

app.delete(
  '/api/mail/rules/:id',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const deleted = await database.deleteMailAutomationRule(
      request.auth.context.workspace.id,
      String(request.params.id),
    )
    if (!deleted) throw new HttpError(404, 'Message rule not found.')
    response.status(204).end()
  },
)

app.get('/api/automations/runs', requireAuth, async (request, response) => {
  response.json({
    runs: await database.listAutomationRuns(request.auth.context.workspace.id),
  })
})

app.get('/api/automations/runs/:runId', requireAuth, async (request, response) => {
  const runId = String(request.params.runId || '')
  if (!/^run_[a-f0-9]{12}$/.test(runId)) {
    throw new HttpError(400, 'A valid automation run id is required.')
  }
  const run = await database.getAutomationRun(
    request.auth.context.workspace.id,
    runId,
  )
  if (!run) throw new HttpError(404, 'Automation run not found.')
  response.json(run)
})

app.get('/api/automations/runs/:runId/logs', requireAuth, async (request, response) => {
  const runId = String(request.params.runId || '')
  if (!/^run_[a-f0-9]{12}$/.test(runId)) {
    throw new HttpError(400, 'A valid automation run id is required.')
  }
  const run = await database.getAutomationRun(
    request.auth.context.workspace.id,
    runId,
  )
  if (!run) throw new HttpError(404, 'Automation run not found.')
  response.json({ runId, logs: run.events || [] })
})

app.post(
  '/api/automations/runs',
  secureMutations,
  requireAuth,
  async (request, response) => {
    const automationId = String(request.body?.automationId || '').trim()
    const instruction = String(request.body?.instruction || '').trim()
    const provider = String(request.body?.provider || '').trim() || null
    if (!automationId || !instruction) {
      throw new HttpError(400, 'Automation ID and instruction are required.')
    }
    if (instruction.length > 5_000) {
      throw new HttpError(400, 'Automation instruction must be 5,000 characters or fewer.')
    }
    if (provider && !/^[a-z0-9][a-z0-9._-]{1,49}$/i.test(provider)) {
      throw new HttpError(400, 'A valid integration provider is required.')
    }
    const automation = await database.getAutomation(
      request.auth.context.workspace.id,
      automationId,
    )
    if (!automation) throw new HttpError(404, 'Automation not found.')
    if (automation.status !== 'active') {
      throw new HttpError(409, 'Activate this automation before running it.')
    }
    if (automation.execution === 'edge') {
      const n8nConnection = await database.getN8nConnection(
        request.auth.context.workspace.id,
      )
      if (!n8nConnection.connected) {
        throw new HttpError(
          409,
          'Custom n8n workflows require a connected n8n integration. Standard automations run in the Core and need no connector.',
        )
      }
      n8nConnectionSecret(n8nConnection)
    }
    const result = await executeIdempotentMutation({
      request,
      route: 'POST /api/automations/runs',
      input: { automationId, instruction, provider },
      operation: async () => {
        const run = await database.createAutomationRun({
          workspaceId: request.auth.context.workspace.id,
          automationId,
          triggeredBy: request.auth.context.user.id,
          instruction,
        })
        await database.appendAutomationRunEvent({
          workspaceId: request.auth.context.workspace.id,
          runId: run.id,
          eventType: 'run.queued',
          message: automation.execution === 'core'
            ? 'Core automation queued for execution.'
            : 'Edge automation queued for signed delivery.',
          output: { execution: automation.execution },
        })
        return { status: 201, response: run }
      },
    })
    sendMutationResponse(response, result)
    if (!result.replayed) {
      const job = {
        workspaceId: request.auth.context.workspace.id,
        userId: request.auth.context.user.id,
        automationId,
        runId: result.response.id,
        provider,
      }
      const queued = automation.execution === 'core'
        ? await coreRedis.enqueue(job)
        : false
      if (!queued) {
        void executeAutomationRun(
          request.auth.context,
          automation,
          result.response,
          provider,
        ).catch((error) => {
          console.error('Automation run failed:', error)
        })
      }
    }
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
  if (error instanceof CoreAutomationError) {
    response.status(error.status).json({
      error: error.message,
      code: error.code,
    })
    return
  }
  if (error instanceof LanceeMcpError) {
    response.status(error.status || 400).json({
      error: error.message,
      code: error.code,
    })
    return
  }
  if (error instanceof McpGatewayError) {
    response.status(error.status).json({
      error: error.message,
      code: error.code,
    })
    return
  }
  if (error instanceof BaseboxMcpError) {
    response.status(error.status).json({
      error: error.message,
      code: error.code,
    })
    return
  }
  if (error instanceof VaultError) {
    response.status(error.status).json({
      error: error.message,
      code: error.code,
    })
    return
  }
  if (error instanceof CodexAppServerError) {
    response.status(error.status).json({
      error: error.message,
      code: error.code,
    })
    return
  }
  if (error instanceof GoogleDriveError) {
    response.status(error.status || 502).json({
      error: error.message,
      code: error.code,
    })
    return
  }
  if (error instanceof MailConnectorError) {
    response.status(error.status || 502).json({
      error: error.message,
      code: error.code,
    })
    return
  }
  if (error?.type === 'entity.too.large') {
    response.status(413).json({ error: 'Document content exceeds the 5 MB editor limit.' })
    return
  }
  if (error?.type === 'entity.parse.failed') {
    response.status(400).json({ error: 'Invalid JSON request body.' })
    return
  }
  console.error(error)
  response.status(500).json({ error: 'Unexpected server error.' })
})

let stopCoreWorker = async () => {}
let stopLanceeMcpScheduler = async () => {}
stopLanceeMcpScheduler = await lanceeMcp.startScheduler()
if (coreRedis.connected) {
  stopCoreWorker = await coreRedis.startWorker(async (job) => {
    const context = await database.getContextByIds(job.userId, job.workspaceId)
    const automation = await database.getAutomation(job.workspaceId, job.automationId)
    const run = await database.getAutomationRun(job.workspaceId, job.runId)
    if (!context || !automation || !run || run.status !== 'running') {
      if (job.mailEventId) {
        await database.completeMailRuleEvent(job.workspaceId, job.mailEventId, {
          status: 'failed',
          runId: job.runId,
          error: 'The queued automation run could not be restored.',
        }).catch(() => {})
      }
      return
    }
    await executeAutomationRun(
      context,
      automation,
      run,
      job.provider || null,
      { mailEventId: job.mailEventId || null },
    )
  })
}

const configuredMailSyncInterval = Number.parseInt(process.env.MAIL_SYNC_INTERVAL_MS || '60000', 10)
const mailSyncIntervalMs = Number.isFinite(configuredMailSyncInterval)
  ? Math.max(30_000, configuredMailSyncInterval)
  : 60_000
let mailPollBusy = false
const pollMailAccounts = async () => {
  if (mailPollBusy) return
  mailPollBusy = true
  try {
    const accounts = await database.listConnectedMailAccounts()
    for (const account of accounts) {
      await syncMailWorkspace(account).catch((error) => {
        console.error(`Mailbox sync failed for workspace ${account.workspaceId}:`, error?.message || error)
      })
    }
  } finally {
    mailPollBusy = false
  }
}
const mailSyncTimer = setInterval(() => void pollMailAccounts(), mailSyncIntervalMs)
const initialMailSyncTimer = setTimeout(() => void pollMailAccounts(), 5_000)

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`lancee server listening on port ${port} · Core Redis ${coreRedis.connected ? 'connected' : 'fallback'}`)
})

let shuttingDown = false
function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  void stopLanceeMcpScheduler()
  void stopCoreWorker()
  clearInterval(mailSyncTimer)
  clearTimeout(initialMailSyncTimer)
  codexAppServer.stopAll()
  server.close(async () => {
    try {
      await coreRedis.close()
      await database.close()
      process.exit(0)
    } catch (error) {
      console.error('Database shutdown failed:', error)
      process.exit(1)
    }
  })
}

process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
