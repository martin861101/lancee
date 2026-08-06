import {
  mkdirSync,
  readdirSync,
  rmSync,
  chmodSync,
} from 'node:fs'
import { join } from 'node:path'

const SELF_NUMBER_PATTERN = /^\d{8,15}$/
const MAX_MESSAGE_LENGTH = 4_000
const DEFAULT_RECONNECT_BASE_DELAY_MS = 1_000
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000
const DEFAULT_NOTIFICATION_RETRY_ATTEMPTS = 6
const DEFAULT_NOTIFICATION_RETRY_DELAY_MS = 1_000

export class WhatsAppError extends Error {
  constructor(code, message, status = 502) {
    super(message)
    this.name = 'WhatsAppError'
    this.code = code
    this.status = status
  }
}

export function normalizeWhatsAppNumber(value) {
  const raw = String(value || '').trim()
  const digits = raw.replace(/[^\d]/g, '')
  if ((!raw.startsWith('+') && raw !== digits) || digits.startsWith('0')) {
    throw new WhatsAppError(
      'WHATSAPP_NUMBER_FORMAT',
      'Enter your WhatsApp number in international format, for example +27821234567.',
      400,
    )
  }
  if (!SELF_NUMBER_PATTERN.test(digits)) {
    throw new WhatsAppError(
      'WHATSAPP_NUMBER_INVALID',
      'Enter a valid WhatsApp self number with 8 to 15 digits, including the country code.',
      400,
    )
  }
  return digits
}

function numberFromJid(jid) {
  return String(jid || '').split(':')[0].split('@')[0].replace(/\D/g, '')
}

function selfJid(number) {
  return `${number}@s.whatsapp.net`
}

function safeWorkspaceDirectory(runtimeDirectory, workspaceId) {
  const safeId = String(workspaceId || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
  if (!safeId) throw new WhatsAppError('WHATSAPP_WORKSPACE_INVALID', 'A workspace is required.', 400)
  const directory = join(runtimeDirectory, 'whatsapp', safeId)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  try { chmodSync(directory, 0o700) } catch { /* best effort on Windows */ }
  return directory
}

function hasAuthFiles(directory) {
  try {
    return readdirSync(directory).some((entry) => entry === 'creds.json')
  } catch {
    return false
  }
}

function hardenAuthDirectory(directory) {
  try {
    for (const entry of readdirSync(directory)) {
      try { chmodSync(join(directory, entry), 0o600) } catch { /* best effort on Windows */ }
    }
  } catch { /* the directory may not exist until Baileys writes its first state */ }
}

function formatNotification(subject, text) {
  const title = String(subject || '').trim().slice(0, 240)
  const body = String(text || '').trim().slice(0, MAX_MESSAGE_LENGTH)
  if (!title || !body) throw new WhatsAppError('WHATSAPP_MESSAGE_INVALID', 'A notification subject and message are required.', 400)
  return `[lancee] ${title}\n\n${body}`
}

export function createWhatsAppRuntime({
  database,
  runtimeDirectory,
  loadBaileys = () => import('@whiskeysockets/baileys'),
  renderQr = null,
  reconnectBaseDelayMs = DEFAULT_RECONNECT_BASE_DELAY_MS,
  reconnectMaxDelayMs = DEFAULT_RECONNECT_MAX_DELAY_MS,
  notificationRetryAttempts = DEFAULT_NOTIFICATION_RETRY_ATTEMPTS,
  notificationRetryDelayMs = DEFAULT_NOTIFICATION_RETRY_DELAY_MS,
}) {
  const sessions = new Map()
  const reconnectTimers = new Map()
  const reconnectAttempts = new Map()
  const explicitlyDisconnected = new Set()

  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

  function clearReconnect(workspaceId) {
    const timer = reconnectTimers.get(workspaceId)
    if (timer) clearTimeout(timer)
    reconnectTimers.delete(workspaceId)
    reconnectAttempts.delete(workspaceId)
  }

  async function baileys() {
    try {
      return await loadBaileys()
    } catch {
      throw new WhatsAppError(
        'WHATSAPP_DEPENDENCY_MISSING',
        'The Baileys WhatsApp connector is not installed on the server.',
        503,
      )
    }
  }

  async function qrImage(qr) {
    if (!qr) return null
    if (renderQr) return await renderQr(qr)
    try {
      const module = await import('qrcode')
      return await module.toDataURL(qr, { errorCorrectionLevel: 'M', margin: 1, width: 280 })
    } catch {
      return null
    }
  }

  function response(session, connection) {
    const current = session || {}
    return {
      configured: Boolean(connection),
      connected: current.status === 'connected' || connection?.status === 'connected',
      status: current.status || connection?.status || 'disconnected',
      selfNumber: connection?.selfNumber || current.selfNumber || '',
      notificationsEnabled: connection?.notificationsEnabled !== false,
      qr: current.qrImage || null,
      qrText: current.qr || null,
      error: current.error || connection?.lastError || '',
      connectedJid: current.connectedJid || connection?.connectedJid || null,
    }
  }

  async function updateStatus(workspaceId, status, fields = {}) {
    return database.setWhatsAppConnectionStatus(workspaceId, { status, ...fields })
  }

  async function closeSession(workspaceId, { removeAuth = false } = {}) {
    clearReconnect(workspaceId)
    const session = sessions.get(workspaceId)
    sessions.delete(workspaceId)
    if (session?.socket) {
      try { session.socket.end?.(new Error('WhatsApp session closed by owner.')) } catch { /* noop */ }
    }
    if (removeAuth && session?.authDirectory) {
      rmSync(session.authDirectory, { recursive: true, force: true })
    }
  }

  function scheduleReconnect(workspaceId, selfNumber) {
    if (explicitlyDisconnected.has(workspaceId) || reconnectTimers.has(workspaceId)) return
    const attempt = (reconnectAttempts.get(workspaceId) || 0) + 1
    reconnectAttempts.set(workspaceId, attempt)
    const baseDelay = Math.max(100, Number(reconnectBaseDelayMs) || DEFAULT_RECONNECT_BASE_DELAY_MS)
    const maxDelay = Math.max(baseDelay, Number(reconnectMaxDelayMs) || DEFAULT_RECONNECT_MAX_DELAY_MS)
    const waitMs = Math.min(maxDelay, baseDelay * (2 ** Math.min(attempt - 1, 6)))
    const timer = setTimeout(async () => {
      reconnectTimers.delete(workspaceId)
      if (explicitlyDisconnected.has(workspaceId)) return
      try {
        await start(workspaceId, selfNumber, { reconnectAttempt: attempt })
      } catch (error) {
        console.warn(`WhatsApp reconnect failed for ${workspaceId}:`, error?.message || error)
        await updateStatus(workspaceId, 'connecting', {
          selfNumber,
          connectedJid: null,
          lastError: `WhatsApp reconnect failed; retrying in ${Math.round(waitMs / 1000)} seconds.`,
        }).catch(() => undefined)
        scheduleReconnect(workspaceId, selfNumber)
      }
    }, waitMs)
    reconnectTimers.set(workspaceId, timer)
  }

  async function start(workspaceId, selfNumber, { force = false, reconnectAttempt = 0 } = {}) {
    const number = normalizeWhatsAppNumber(selfNumber)
    const existing = sessions.get(workspaceId)
    if (existing && !force && ['connecting', 'connected', 'qr'].includes(existing.status)) {
      return response(existing, await database.getWhatsAppConnection(workspaceId))
    }
    if (existing) await closeSession(workspaceId, { removeAuth: force })

    const authDirectory = safeWorkspaceDirectory(runtimeDirectory, workspaceId)
    if (force && hasAuthFiles(authDirectory)) {
      rmSync(authDirectory, { recursive: true, force: true })
    }
    const freshAuthDirectory = safeWorkspaceDirectory(runtimeDirectory, workspaceId)
    const api = await baileys()
    const auth = await api.useMultiFileAuthState(freshAuthDirectory)
    hardenAuthDirectory(freshAuthDirectory)
    const session = {
      status: 'connecting',
      selfNumber: number,
      qr: null,
      qrImage: null,
      error: '',
      connectedJid: null,
      socket: null,
      authDirectory: freshAuthDirectory,
      reconnectAttempt,
    }
    sessions.set(workspaceId, session)
    await updateStatus(workspaceId, 'connecting', { selfNumber: number, lastError: '' })

    const makeSocket = api.default || api.makeWASocket
    if (typeof makeSocket !== 'function') {
      throw new WhatsAppError('WHATSAPP_API_INVALID', 'The installed Baileys package does not expose a WhatsApp socket.', 503)
    }
    const socket = makeSocket({
      auth: auth.state,
      browser: api.Browsers?.ubuntu?.('lancee') || ['lancee', 'Chrome', '1.0.0'],
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    })
    session.socket = socket
    socket.ev.on('creds.update', () => {
      void auth.saveCreds()
        .then(() => hardenAuthDirectory(freshAuthDirectory))
        .catch(() => undefined)
    })
    socket.ev.on('connection.update', async (update) => {
      if (sessions.get(workspaceId) !== session) return
      const { connection, lastDisconnect, qr } = update || {}
      if (qr) {
        session.status = 'qr'
        session.qr = qr
        session.qrImage = await qrImage(qr)
        await updateStatus(workspaceId, 'connecting', { selfNumber: number, lastError: '' }).catch(() => undefined)
      }
      if (connection === 'open') {
        const connectedJid = socket.user?.id || ''
        if (numberFromJid(connectedJid) !== number) {
          session.status = 'error'
          session.error = 'The scanned WhatsApp account does not match the configured self number.'
          await updateStatus(workspaceId, 'error', { selfNumber: number, connectedJid: null, lastError: session.error }).catch(() => undefined)
          try { socket.logout?.() } catch { /* noop */ }
          return
        }
        session.status = 'connected'
        session.qr = null
        session.qrImage = null
        session.error = ''
        session.connectedJid = connectedJid
        session.reconnectAttempt = 0
        reconnectAttempts.delete(workspaceId)
        const pendingTimer = reconnectTimers.get(workspaceId)
        if (pendingTimer) clearTimeout(pendingTimer)
        reconnectTimers.delete(workspaceId)
        await updateStatus(workspaceId, 'connected', { selfNumber: number, connectedJid, lastError: '' }).catch(() => undefined)
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode
        const loggedOut = code === api.DisconnectReason?.loggedOut || code === 401
        const reconnecting = !loggedOut && !explicitlyDisconnected.has(workspaceId)
        session.status = reconnecting ? 'connecting' : 'disconnected'
        session.error = loggedOut
          ? 'WhatsApp logged out. Scan a new QR code to reconnect.'
          : reconnecting
            ? 'WhatsApp connection closed. Reconnecting automatically.'
            : 'WhatsApp connection closed.'
        await updateStatus(workspaceId, session.status, {
          selfNumber: number,
          connectedJid: null,
          lastError: session.error,
        }).catch(() => undefined)
        sessions.delete(workspaceId)
        if (reconnecting) scheduleReconnect(workspaceId, number)
      }
    })
    return response(session, await database.getWhatsAppConnection(workspaceId))
  }

  async function status(workspaceId) {
    const connection = await database.getWhatsAppConnection(workspaceId)
    const session = sessions.get(workspaceId)
    if (!session && connection?.selfNumber && hasAuthFiles(safeWorkspaceDirectory(runtimeDirectory, workspaceId))) {
      void start(workspaceId, connection.selfNumber).catch(async (error) => {
        await updateStatus(workspaceId, 'error', { lastError: error.message }).catch(() => undefined)
      })
    }
    return response(session, connection)
  }

  async function connect(workspaceId, selfNumber, notificationsEnabled = true) {
    const number = normalizeWhatsAppNumber(selfNumber)
    explicitlyDisconnected.delete(workspaceId)
    clearReconnect(workspaceId)
    await database.upsertWhatsAppConnection({ workspaceId, selfNumber: number, notificationsEnabled, status: 'connecting' })
    return start(workspaceId, number, { force: true })
  }

  async function disconnect(workspaceId) {
    explicitlyDisconnected.add(workspaceId)
    await closeSession(workspaceId, { removeAuth: true })
    await database.deleteWhatsAppConnection(workspaceId)
    return response(null, null)
  }

  async function restore() {
    if (typeof database.listWhatsAppConnections !== 'function') return
    const connections = await database.listWhatsAppConnections()
    for (const connection of connections) {
      if (
        !connection?.selfNumber
        || explicitlyDisconnected.has(connection.workspaceId)
        || !['connected', 'connecting', 'error'].includes(connection.status)
        || /does not match/i.test(connection.lastError || '')
      ) continue
      const authDirectory = safeWorkspaceDirectory(runtimeDirectory, connection.workspaceId)
      if (!hasAuthFiles(authDirectory)) continue
      try {
        await start(connection.workspaceId, connection.selfNumber)
      } catch (error) {
        await updateStatus(connection.workspaceId, 'error', {
          selfNumber: connection.selfNumber,
          lastError: error.message,
        }).catch(() => undefined)
        console.warn(`WhatsApp session restore failed for ${connection.workspaceId}:`, error?.message || error)
      }
    }
  }

  async function connectedSession(workspaceId) {
    const connection = await database.getWhatsAppConnection(workspaceId)
    if (!connection?.notificationsEnabled) return null
    const session = sessions.get(workspaceId)
    if (connection.status === 'connected' && session?.socket && session.status === 'connected') {
      return { connection, session }
    }
    if (
      !session
      && !reconnectTimers.has(workspaceId)
      && !explicitlyDisconnected.has(workspaceId)
      && connection.selfNumber
    ) {
      const authDirectory = safeWorkspaceDirectory(runtimeDirectory, workspaceId)
      if (hasAuthFiles(authDirectory)) {
        await start(workspaceId, connection.selfNumber).catch(() => undefined)
      }
    }
    return null
  }

  async function sendSelfNotification(workspaceId, { subject, text }) {
    const attempts = Math.max(1, Number(notificationRetryAttempts) || DEFAULT_NOTIFICATION_RETRY_ATTEMPTS)
    const retryDelay = Math.max(100, Number(notificationRetryDelayMs) || DEFAULT_NOTIFICATION_RETRY_DELAY_MS)
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const target = await connectedSession(workspaceId)
      if (!target) {
        const connection = await database.getWhatsAppConnection(workspaceId)
        if (!connection?.notificationsEnabled) return { sent: false, skipped: true, reason: 'notifications_disabled' }
        if (attempt === attempts - 1) return { sent: false, skipped: true, reason: 'not_connected' }
        await delay(retryDelay)
        continue
      }
      const { connection, session } = target
      const jid = selfJid(connection.selfNumber)
      if (numberFromJid(session.socket.user?.id) !== connection.selfNumber) {
        throw new WhatsAppError('WHATSAPP_SELF_MISMATCH', 'The connected WhatsApp account does not match the configured self number.', 409)
      }
      try {
        await session.socket.sendMessage(jid, { text: formatNotification(subject, text) })
        return { sent: true, recipient: connection.selfNumber }
      } catch (error) {
        if (attempt === attempts - 1) throw error
        await delay(retryDelay)
      }
    }
    return { sent: false, skipped: true, reason: 'not_connected' }
  }

  return {
    status,
    connect,
    disconnect,
    restore,
    sendSelfNotification,
    close: async () => {
      for (const workspaceId of reconnectTimers.keys()) clearReconnect(workspaceId)
      for (const workspaceId of sessions.keys()) await closeSession(workspaceId)
    },
  }
}
