import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import HTMLtoDOCX from 'html-to-docx'
import mammoth from 'mammoth'
import sanitizeHtml from 'sanitize-html'

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
const GOOGLE_DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'
const OAUTH_STATE_TTL_SECONDS = 10 * 60
const TOKEN_REFRESH_SKEW_MS = 60_000
const GOOGLE_DOCUMENT_MIME = 'application/vnd.google-apps.document'
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const MARKDOWN_MIMES = new Set(['text/markdown', 'text/x-markdown'])
export const GOOGLE_DRIVE_EDITOR_MAX_BYTES = 5 * 1024 * 1024

const EDITOR_HTML_OPTIONS = {
  allowedTags: [
    'a',
    'b',
    'blockquote',
    'br',
    'code',
    'div',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'i',
    'img',
    'li',
    'ol',
    'p',
    'pre',
    's',
    'span',
    'strike',
    'strong',
    'sub',
    'sup',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'u',
    'ul',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    ol: ['start'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    img: ['data'],
  },
}

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
  const pickerApiKey = String(env.GOOGLE_PICKER_API_KEY || '').trim()
  const pickerAppId = String(env.GOOGLE_PICKER_APP_ID || '').trim()
  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: Boolean(clientId && clientSecret && redirectUri),
    pickerApiKey,
    pickerAppId,
    pickerConfigured: Boolean(pickerApiKey && pickerAppId),
    scope: DRIVE_FILE_SCOPE,
  }
}

export function createOAuthState({
  workspaceId,
  userId,
  serverSecret,
  returnTo = 'integrations',
}) {
  const now = Math.floor(Date.now() / 1000)
  const returnPage = returnTo === 'files' ? 'files' : 'integrations'
  const payload = Buffer.from(
    JSON.stringify({
      wsp: workspaceId,
      sub: userId,
      ret: returnPage,
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
    returnTo: parsed.ret === 'files' ? 'files' : 'integrations',
    nonce: parsed.nonce ? String(parsed.nonce) : null,
  }
}

export function buildGoogleAuthUrl({
  clientId,
  redirectUri,
  state,
  scope = DRIVE_FILE_SCOPE,
  usePicker = true,
}) {
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
  if (usePicker) {
    url.searchParams.set('trigger_onepick', 'true')
    url.searchParams.set('allow_multiple', 'true')
    url.searchParams.set('allow_folder_selection', 'true')
  }
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
  folderId = null,
}) {
  const url = new URL(GOOGLE_DRIVE_FILES_URL)
  const size = Math.min(100, Math.max(1, Number(pageSize) || 25))
  url.searchParams.set(
    'fields',
    'nextPageToken,files(id,name,mimeType,webViewLink,iconLink,modifiedTime,owners(displayName,emailAddress),size,shared,capabilities(canEdit,canDownload,canListChildren))',
  )
  url.searchParams.set('pageSize', String(size))
  url.searchParams.set('orderBy', 'modifiedTime desc')
  url.searchParams.set('spaces', 'drive')
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('includeItemsFromAllDrives', 'true')
  if (pageToken) url.searchParams.set('pageToken', pageToken)
  // Exclude trashed files by default; allow caller to narrow further.
  const q = ['trashed = false']
  if (folderId) q.push(`'${String(folderId)}' in parents`)
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
      canEdit: Boolean(file.capabilities?.canEdit),
      canDownload: file.capabilities?.canDownload !== false,
      canListChildren: Boolean(file.capabilities?.canListChildren),
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

function fileMetadataFields() {
  return [
    'id',
    'name',
    'mimeType',
    'webViewLink',
    'modifiedTime',
    'version',
    'size',
    'capabilities(canEdit,canDownload,canListChildren)',
  ].join(',')
}

async function googleDriveResponseError(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}))
  if (response.status === 412) {
    throw new GoogleDriveError(
      'DRIVE_FILE_CONFLICT',
      'This file changed in Google Drive while it was being saved. Reload it and review the latest version.',
      409,
      { googleError: data.error || null },
    )
  }
  throw new GoogleDriveError(
    'DRIVE_FILE_REQUEST_FAILED',
    data.error?.message || data.error_description || fallbackMessage,
    response.status === 401 || response.status === 403 || response.status === 404
      ? response.status
      : 502,
    { googleError: data.error || null },
  )
}

export function googleDriveEditorKind(file) {
  const mimeType = String(file?.mimeType || '').toLowerCase()
  const name = String(file?.name || '').toLowerCase()
  if (mimeType === GOOGLE_DOCUMENT_MIME || mimeType === DOCX_MIME) {
    return 'rich-text'
  }
  if (MARKDOWN_MIMES.has(mimeType) || name.endsWith('.md') || name.endsWith('.markdown')) {
    return 'markdown'
  }
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return 'image'
  return 'unsupported'
}

export function sanitizeDriveEditorHtml(value) {
  return sanitizeHtml(String(value || ''), EDITOR_HTML_OPTIONS)
}

export async function getGoogleDriveFileMetadata({ accessToken, fileId }) {
  const url = new URL(`${GOOGLE_DRIVE_FILES_URL}/${encodeURIComponent(fileId)}`)
  url.searchParams.set('fields', fileMetadataFields())
  url.searchParams.set('supportsAllDrives', 'true')
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })
  if (!response.ok) {
    await googleDriveResponseError(response, 'Unable to load this Google Drive file.')
  }
  const file = await response.json()
  return {
    id: String(file.id || fileId),
    name: String(file.name || 'Untitled'),
    mimeType: String(file.mimeType || 'application/octet-stream'),
    webViewLink: file.webViewLink || null,
    modifiedTime: file.modifiedTime || null,
    version: file.version ? String(file.version) : null,
    size: file.size ? Number(file.size) : null,
    canEdit: Boolean(file.capabilities?.canEdit),
    canDownload: file.capabilities?.canDownload !== false,
    canListChildren: Boolean(file.capabilities?.canListChildren),
    etag: response.headers.get('etag') || null,
  }
}

export async function fetchGoogleDriveFileContent({
  accessToken,
  fileId,
  exportMimeType = null,
  range = null,
}) {
  const url = exportMimeType
    ? new URL(`${GOOGLE_DRIVE_FILES_URL}/${encodeURIComponent(fileId)}/export`)
    : new URL(`${GOOGLE_DRIVE_FILES_URL}/${encodeURIComponent(fileId)}`)
  if (exportMimeType) {
    url.searchParams.set('mimeType', exportMimeType)
  } else {
    url.searchParams.set('alt', 'media')
    url.searchParams.set('supportsAllDrives', 'true')
  }
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: exportMimeType || '*/*',
  }
  if (range && !exportMimeType) headers.Range = range
  const response = await fetch(url, { headers })
  if (!response.ok && response.status !== 206) {
    await googleDriveResponseError(response, 'Unable to read this Google Drive file.')
  }
  return response
}

async function responseBuffer(response, maximumBytes = GOOGLE_DRIVE_EDITOR_MAX_BYTES) {
  const declaredLength = Number(response.headers.get('content-length') || 0)
  if (declaredLength > maximumBytes) {
    throw new GoogleDriveError(
      'DRIVE_FILE_TOO_LARGE',
      `This file is larger than the ${Math.floor(maximumBytes / 1024 / 1024)} MB editor limit.`,
      413,
    )
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength > maximumBytes) {
    throw new GoogleDriveError(
      'DRIVE_FILE_TOO_LARGE',
      `This file is larger than the ${Math.floor(maximumBytes / 1024 / 1024)} MB editor limit.`,
      413,
    )
  }
  return buffer
}

export async function loadGoogleDriveEditorDocument({
  accessToken,
  file,
}) {
  const kind = googleDriveEditorKind(file)
  if (kind !== 'rich-text' && kind !== 'markdown') {
    throw new GoogleDriveError(
      'DRIVE_FILE_NOT_EDITABLE',
      'This file type is available as a preview, not an editable document.',
      415,
    )
  }

  const response = await fetchGoogleDriveFileContent({
    accessToken,
    fileId: file.id,
    exportMimeType:
      kind === 'rich-text' && file.mimeType === GOOGLE_DOCUMENT_MIME
        ? DOCX_MIME
        : null,
  })
  const buffer = await responseBuffer(response)
  return await loadEditorDocumentFromBuffer({ file, body: buffer })
}

export async function loadEditorDocumentFromBuffer({ file, body }) {
  const kind = googleDriveEditorKind(file)
  if (kind !== 'rich-text' && kind !== 'markdown') {
    throw new GoogleDriveError(
      'DRIVE_FILE_NOT_EDITABLE',
      'This file type is available as a preview, not an editable document.',
      415,
    )
  }
  if (kind === 'markdown') {
    return {
      ...file,
      kind,
      content: body.toString('utf8'),
      warnings: [],
    }
  }
  const converted = await mammoth.convertToHtml({ buffer: body })
  return {
    ...file,
    kind,
    content: sanitizeDriveEditorHtml(converted.value),
    warnings: converted.messages.map((message) => String(message.message || message)),
  }
}

export async function convertDriveEditorContent({
  file,
  content,
}) {
  const kind = googleDriveEditorKind(file)
  if (kind === 'markdown') {
    return {
      body: Buffer.from(String(content), 'utf8'),
      contentType: file.mimeType || 'text/markdown',
    }
  }
  if (kind !== 'rich-text') {
    throw new GoogleDriveError(
      'DRIVE_FILE_NOT_EDITABLE',
      'This file type cannot be edited in lancee.',
      415,
    )
  }
  const html = sanitizeDriveEditorHtml(content)
  if (file.mimeType === GOOGLE_DOCUMENT_MIME) {
    return {
      body: Buffer.from(`<!doctype html><html><body>${html}</body></html>`, 'utf8'),
      contentType: 'text/html; charset=utf-8',
    }
  }
  const docx = await HTMLtoDOCX(
    `<!doctype html><html><body>${html}</body></html>`,
    null,
    {
      title: file.name,
      creator: 'lancee',
      lastModifiedBy: 'lancee',
    },
  )
  return {
    body: Buffer.from(docx),
    contentType: DOCX_MIME,
  }
}

export async function updateGoogleDriveFileContent({
  accessToken,
  fileId,
  body,
  contentType,
  etag = null,
}) {
  const url = new URL(`${GOOGLE_DRIVE_UPLOAD_URL}/${encodeURIComponent(fileId)}`)
  url.searchParams.set('uploadType', 'media')
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('fields', fileMetadataFields())
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': contentType,
  }
  if (etag) headers['If-Match'] = etag
  const response = await fetch(url, {
    method: 'PATCH',
    headers,
    body,
  })
  if (!response.ok) {
    await googleDriveResponseError(response, 'Unable to save this Google Drive file.')
  }
  const file = await response.json()
  return {
    id: String(file.id || fileId),
    name: String(file.name || 'Untitled'),
    mimeType: String(file.mimeType || 'application/octet-stream'),
    webViewLink: file.webViewLink || null,
    modifiedTime: file.modifiedTime || null,
    version: file.version ? String(file.version) : null,
    size: file.size ? Number(file.size) : null,
    canEdit: Boolean(file.capabilities?.canEdit),
    canDownload: file.capabilities?.canDownload !== false,
    canListChildren: Boolean(file.capabilities?.canListChildren),
  }
}

export async function uploadGoogleDriveFile({
  accessToken,
  name,
  body,
  contentType = 'application/octet-stream',
  folderId = null,
}) {
  const boundary = `lancee_${randomBytes(18).toString('hex')}`
  const metadata = {
    name,
    ...(folderId ? { parents: [folderId] } : {}),
  }
  const multipartBody = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      'utf8',
    ),
    Buffer.from(
      `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
      'utf8',
    ),
    Buffer.isBuffer(body) ? body : Buffer.from(body),
    Buffer.from(`\r\n--${boundary}--`, 'utf8'),
  ])
  const url = new URL(GOOGLE_DRIVE_UPLOAD_URL)
  url.searchParams.set('uploadType', 'multipart')
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('fields', fileMetadataFields())
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  })
  if (!response.ok) {
    await googleDriveResponseError(response, 'Unable to upload this file to Google Drive.')
  }
  const file = await response.json()
  return {
    id: String(file.id || ''),
    name: String(file.name || name),
    mimeType: String(file.mimeType || contentType),
    webViewLink: file.webViewLink || null,
    modifiedTime: file.modifiedTime || null,
    version: file.version ? String(file.version) : null,
    size: file.size ? Number(file.size) : null,
    canEdit: Boolean(file.capabilities?.canEdit),
    canDownload: file.capabilities?.canDownload !== false,
    canListChildren: Boolean(file.capabilities?.canListChildren),
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
