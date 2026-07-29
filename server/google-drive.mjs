import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const RESTRICTED_DRIVE_SCOPES = new Set([
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
])
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const OAUTH_STATE_TTL_SECONDS = 10 * 60
const TOKEN_REFRESH_SKEW_MS = 60_000

export class GoogleDriveError extends Error {
  constructor(code, message, status = 502, details = {}) {
    super(message)
    this.code = code
    this.status = status
    Object.assign(this, details)
  }
}

function encryptionKey(serverSecret) {
  return createHmac('sha256', serverSecret)
    .update('lancee:google-drive:credential-encryption:v1')
    .digest()
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left))
  const rightBuffer = Buffer.from(String(right))
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

export function encryptDriveSecret(secret, serverSecret) {
  if (!secret) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(serverSecret), iv)
  const ciphertext = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()])
  return JSON.stringify({
    v: 1,
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  })
}

export function decryptDriveSecret(encrypted, serverSecret) {
  if (!encrypted) return null
  // Support legacy plaintext rows from the initial stub implementation.
  if (typeof encrypted === 'string' && !encrypted.startsWith('{')) {
    return encrypted
  }
  let payload
  try {
    payload = typeof encrypted === 'string' ? JSON.parse(encrypted) : encrypted
  } catch {
    throw new GoogleDriveError(
      'DRIVE_DECRYPT_FAILED',
      'Stored Google Drive credentials could not be read.',
      500,
    )
  }
  if (!payload?.ciphertext || !payload?.iv || !payload?.tag) {
    throw new GoogleDriveError(
      'DRIVE_DECRYPT_FAILED',
      'Stored Google Drive credentials are incomplete.',
      500,
    )
  }
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      encryptionKey(serverSecret),
      Buffer.from(payload.iv, 'base64url'),
    )
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new GoogleDriveError(
      'DRIVE_DECRYPT_FAILED',
      'Stored Google Drive credentials could not be opened.',
      500,
    )
  }
}

export function getGoogleDriveConfig({ publicOrigin, env = process.env } = {}) {
  const clientId = String(env.GOOGLE_DRIVE_CLIENT_ID || '').trim()
  const clientSecret = String(env.GOOGLE_DRIVE_CLIENT_SECRET || '').trim()
  const redirectUri = String(
    env.GOOGLE_DRIVE_REDIRECT_URI ||
      `${publicOrigin}/oauth/callback`,
  ).trim()
  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: Boolean(clientId && clientSecret && redirectUri),
    scope: DRIVE_FILE_SCOPE,
  }
}

export function createOAuthState({ workspaceId, userId, serverSecret }) {
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(
    JSON.stringify({
      wsp: workspaceId,
      sub: userId,
      nonce: randomBytes(12).toString('base64url'),
      iat: now,
      exp: now + OAUTH_STATE_TTL_SECONDS,
    }),
  ).toString('base64url')
  const signature = createHmac('sha256', serverSecret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function parseOAuthState(state, serverSecret) {
  const raw = String(state || '')
  const [payload, signature] = raw.split('.')
  if (!payload || !signature) {
    throw new GoogleDriveError('DRIVE_INVALID_STATE', 'OAuth state is missing or malformed.', 400)
  }
  const expected = createHmac('sha256', serverSecret).update(payload).digest('base64url')
  if (!safeEqual(expected, signature)) {
    throw new GoogleDriveError('DRIVE_INVALID_STATE', 'OAuth state signature is invalid.', 400)
  }
  let parsed
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    throw new GoogleDriveError('DRIVE_INVALID_STATE', 'OAuth state payload is invalid.', 400)
  }
  if (!parsed?.wsp || !parsed?.sub || !parsed?.exp) {
    throw new GoogleDriveError('DRIVE_INVALID_STATE', 'OAuth state is incomplete.', 400)
  }
  if (Number(parsed.exp) <= Math.floor(Date.now() / 1000)) {
    throw new GoogleDriveError('DRIVE_EXPIRED_STATE', 'OAuth state expired. Try connecting again.', 400)
  }
  return {
    workspaceId: String(parsed.wsp),
    userId: String(parsed.sub),
    nonce: parsed.nonce ? String(parsed.nonce) : null,
  }
}

export function buildGoogleAuthUrl({ clientId, redirectUri, state, scope = DRIVE_FILE_SCOPE }) {
  const url = new URL(GOOGLE_AUTH_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  // Do not carry a previously granted broad Drive scope into the new,
  // per-file authorization.
  url.searchParams.set('include_granted_scopes', 'false')
  url.searchParams.set('scope', scope)
  url.searchParams.set('state', state)
  return url.toString()
}

async function postTokenForm(body) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new GoogleDriveError(
      'DRIVE_TOKEN_ERROR',
      data.error_description || data.error || 'Google token exchange failed.',
      response.status >= 400 && response.status < 600 ? response.status : 502,
      { googleError: data.error || null },
    )
  }
  return data
}

export async function exchangeAuthorizationCode({
  code,
  clientId,
  clientSecret,
  redirectUri,
}) {
  const data = await postTokenForm({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  const expiresIn = Number(data.expires_in) || 3600
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    tokenType: data.token_type || 'Bearer',
    scope: data.scope || DRIVE_FILE_SCOPE,
  }
}

export async function refreshGoogleAccessToken({
  refreshToken,
  clientId,
  clientSecret,
}) {
  if (!refreshToken) {
    throw new GoogleDriveError(
      'DRIVE_NOT_CONNECTED',
      'Google Drive is not connected. Complete the OAuth flow first.',
      409,
    )
  }
  const data = await postTokenForm({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const expiresIn = Number(data.expires_in) || 3600
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    tokenType: data.token_type || 'Bearer',
    scope: data.scope || DRIVE_FILE_SCOPE,
  }
}

export function accessTokenIsFresh(expiresAt, skewMs = TOKEN_REFRESH_SKEW_MS) {
  if (!expiresAt) return false
  const expiresMs = Date.parse(expiresAt)
  if (!Number.isFinite(expiresMs)) return false
  return Date.now() < expiresMs - skewMs
}

export async function listGoogleDriveFiles({
  accessToken,
  pageSize = 25,
  pageToken = null,
  query = null,
}) {
  const url = new URL(GOOGLE_DRIVE_FILES_URL)
  const size = Math.min(100, Math.max(1, Number(pageSize) || 25))
  url.searchParams.set(
    'fields',
    'nextPageToken,files(id,name,mimeType,webViewLink,iconLink,modifiedTime,owners(displayName,emailAddress),size,shared)',
  )
  url.searchParams.set('pageSize', String(size))
  url.searchParams.set('orderBy', 'modifiedTime desc')
  url.searchParams.set('spaces', 'drive')
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('includeItemsFromAllDrives', 'true')
  if (pageToken) url.searchParams.set('pageToken', pageToken)
  // Exclude trashed files by default; allow caller to narrow further.
  const q = ['trashed = false']
  if (query && String(query).trim()) q.push(`(${String(query).trim()})`)
  url.searchParams.set('q', q.join(' and '))

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      data.error?.message ||
      data.error_description ||
      'Failed to list Google Drive files.'
    throw new GoogleDriveError(
      'DRIVE_LIST_FAILED',
      message,
      response.status === 401 || response.status === 403 ? response.status : 502,
      { googleError: data.error || null },
    )
  }

  return {
    files: (data.files || []).map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType || 'application/octet-stream',
      webViewLink: file.webViewLink || null,
      iconLink: file.iconLink || null,
      modifiedTime: file.modifiedTime || null,
      size: file.size ? Number(file.size) : null,
      shared: Boolean(file.shared),
      owners: Array.isArray(file.owners)
        ? file.owners.map((owner) => ({
            displayName: owner.displayName || null,
            emailAddress: owner.emailAddress || null,
          }))
        : [],
    })),
    nextPageToken: data.nextPageToken || null,
  }
}

export function tokenHasDriveFileScope(tokenRow) {
  const scopes = String(tokenRow?.scope || '').split(/\s+/).filter(Boolean)
  return (
    scopes.includes(DRIVE_FILE_SCOPE) &&
    !scopes.some((scope) => RESTRICTED_DRIVE_SCOPES.has(scope))
  )
}

export function driveStatusResponse(tokenRow) {
  if (!tokenRow || !tokenHasDriveFileScope(tokenRow)) {
    return {
      connected: false,
      connectedAt: null,
      updatedAt: null,
      scope: tokenRow?.scope || null,
      hasRefreshToken: false,
      reauthorizationRequired: Boolean(tokenRow),
    }
  }
  return {
    connected: true,
    connectedAt: tokenRow.connectedAt || null,
    updatedAt: tokenRow.updatedAt || null,
    scope: tokenRow.scope || DRIVE_FILE_SCOPE,
    hasRefreshToken: Boolean(tokenRow.refreshToken),
    reauthorizationRequired: false,
  }
}
