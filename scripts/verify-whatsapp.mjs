import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWhatsAppRuntime, normalizeWhatsAppNumber, WhatsAppError } from '../server/whatsapp.mjs'

const workspaceId = 'wsp_whatsapp_verifier'
const mismatchWorkspaceId = 'wsp_whatsapp_mismatch'
const state = new Map()
const sent = []
const sockets = []

const database = {
  async getWhatsAppConnection(id) { return state.get(id) || null },
  async listWhatsAppConnections() { return [...state.values()] },
  async upsertWhatsAppConnection(input) {
    const current = state.get(input.workspaceId)
    const next = {
      workspaceId: input.workspaceId,
      selfNumber: input.selfNumber,
      status: input.status || 'disconnected',
      connectedJid: input.connectedJid || null,
      lastError: input.lastError || '',
      notificationsEnabled: input.notificationsEnabled !== false,
    }
    state.set(input.workspaceId, { ...current, ...next })
    return state.get(input.workspaceId)
  },
  async setWhatsAppConnectionStatus(id, fields) {
    const current = state.get(id)
    state.set(id, { ...current, ...fields })
    return state.get(id)
  },
  async deleteWhatsAppConnection(id) { state.delete(id) },
}

const fakeBaileys = {
  Browsers: { ubuntu: () => ['lancee', 'test', '1'] },
  DisconnectReason: { loggedOut: 401 },
  async useMultiFileAuthState(directory) {
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'creds.json'), '{}')
    return { state: {}, saveCreds() {} }
  },
  makeWASocket() {
    const socket = {
      ev: new EventEmitter(),
      user: { id: '27821234567:1@s.whatsapp.net' },
      async sendMessage(jid, payload) { sent.push({ jid, payload }) },
      end() {},
    }
    sockets.push(socket)
    queueMicrotask(() => socket.ev.emit('connection.update', { qr: 'fake-qr' }))
    return socket
  },
}

assert.equal(normalizeWhatsAppNumber('+27 82 123 4567'), '27821234567')
assert.throws(() => normalizeWhatsAppNumber('0821234567'), WhatsAppError)

const runtimeDirectory = mkdtempSync(join(tmpdir(), 'lancee-whatsapp-'))
const runtime = createWhatsAppRuntime({
  database,
  runtimeDirectory,
  loadBaileys: async () => fakeBaileys,
  renderQr: async (value) => `data:image/test;base64,${Buffer.from(value).toString('base64')}`,
  reconnectBaseDelayMs: 5,
  reconnectMaxDelayMs: 10,
  notificationRetryDelayMs: 5,
})
let restoredRuntime = null

try {
  const connecting = await runtime.connect(workspaceId, '+27821234567', true)
  assert.ok(['connecting', 'qr'].includes(connecting.status))
  await new Promise((resolve) => setTimeout(resolve, 5))
  const qr = await runtime.status(workspaceId)
  assert.equal(qr.status, 'qr')
  assert.match(qr.qr, /^data:image\/test/)

  sockets[0].ev.emit('connection.update', { connection: 'open' })
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal((await runtime.status(workspaceId)).connected, true)

  const result = await runtime.sendSelfNotification(workspaceId, {
    subject: 'Test notification',
    text: 'This stays on the verified self number.',
  })
  assert.equal(result.sent, true)
  assert.deepEqual(sent[0], {
    jid: '27821234567@s.whatsapp.net',
    payload: { text: '[lancee] Test notification\n\nThis stays on the verified self number.' },
  })

  sockets[0].ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode: 428 } } },
  })
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(sockets.length, 2)
  sockets[1].ev.emit('connection.update', { connection: 'open' })
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal((await runtime.status(workspaceId)).connected, true)

  await runtime.close()
  restoredRuntime = createWhatsAppRuntime({
    database,
    runtimeDirectory,
    loadBaileys: async () => fakeBaileys,
    renderQr: async (value) => `data:image/test;base64,${Buffer.from(value).toString('base64')}`,
    reconnectBaseDelayMs: 5,
    reconnectMaxDelayMs: 10,
    notificationRetryDelayMs: 5,
  })
  await restoredRuntime.restore()
  assert.equal(sockets.length, 3)
  sockets[2].ev.emit('connection.update', { connection: 'open' })
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal((await restoredRuntime.status(workspaceId)).connected, true)

  await restoredRuntime.connect(mismatchWorkspaceId, '+12025550123', true)
  sockets[3].ev.emit('connection.update', { connection: 'open' })
  await new Promise((resolve) => setTimeout(resolve, 5))
  const mismatch = await restoredRuntime.status(mismatchWorkspaceId)
  assert.equal(mismatch.status, 'error')
  assert.match(mismatch.error, /does not match/i)

  await restoredRuntime.disconnect(workspaceId)
  assert.equal((await restoredRuntime.status(workspaceId)).configured, false)
  console.log('WhatsApp connector verified: QR lifecycle, automatic reconnect, session restore, self-number guard, notification delivery, and disconnect cleanup.')
} finally {
  await runtime.close()
  if (restoredRuntime) await restoredRuntime.close()
  rmSync(runtimeDirectory, { recursive: true, force: true })
}
