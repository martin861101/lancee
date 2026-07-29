import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const MAX_BUFFERED_EVENTS = 300
const MANAGED_PERMISSION_PROFILE = `# Managed by lancee. Changes are replaced when App Server starts.
default_permissions = "lancee-workspace"

[permissions.lancee-workspace]
description = "Write inside the configured lancee workspace only."

[permissions.lancee-workspace.filesystem]
":root" = "deny"
":minimal" = "read"
":tmpdir" = "deny"
":slash_tmp" = "deny"

[permissions.lancee-workspace.filesystem.":workspace_roots"]
"." = "write"

[permissions.lancee-workspace.network]
enabled = false
`

export class CodexAppServerError extends Error {
  constructor(message, { code = 'CODEX_APP_SERVER_ERROR', status = 502 } = {}) {
    super(message)
    this.name = 'CodexAppServerError'
    this.code = code
    this.status = status
  }
}

function safeIdentity(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32)
}

function clientResponseForRequest(method) {
  if (
    method === 'item/commandExecution/requestApproval' ||
    method === 'item/fileChange/requestApproval'
  ) {
    return { decision: 'decline' }
  }
  if (method === 'item/permissions/requestApproval') {
    return { permissions: [] }
  }
  if (
    method === 'tool/requestUserInput' ||
    method === 'item/tool/requestUserInput'
  ) {
    return { answers: {} }
  }
  if (method === 'mcpServer/elicitation/request') {
    return { action: 'decline', content: null }
  }
  return null
}

class CodexAppServerClient {
  constructor({
    identity,
    binary,
    binaryArguments,
    spawnProcess,
    dataDirectory,
    workspaceRoot,
    requestTimeoutMilliseconds,
  }) {
    this.identity = identity
    this.binary = binary
    this.binaryArguments = binaryArguments
    this.spawnProcess = spawnProcess
    this.workspaceRoot = workspaceRoot
    this.requestTimeoutMilliseconds = requestTimeoutMilliseconds
    this.codexHome = `${dataDirectory}/${safeIdentity(identity)}`
    this.process = null
    this.pending = new Map()
    this.events = new EventEmitter()
    this.eventSequence = 0
    this.eventBuffer = []
    this.nextRequestId = 1
    this.startPromise = null
    this.stderr = []
  }

  async start() {
    if (this.startPromise) return this.startPromise
    if (this.process && !this.process.killed) return

    this.startPromise = new Promise((resolve, reject) => {
      mkdirSync(this.codexHome, { recursive: true, mode: 0o700 })
      writeFileSync(join(this.codexHome, 'config.toml'), MANAGED_PERMISSION_PROFILE, {
        mode: 0o600,
      })
      const child = this.spawnProcess(
        this.binary,
        [...this.binaryArguments, 'app-server', '--stdio'],
        {
        cwd: this.workspaceRoot,
        env: {
          ...process.env,
          CODEX_HOME: this.codexHome,
        },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )
      this.process = child
      let settled = false

      const failStart = (error) => {
        if (settled) return
        settled = true
        this.startPromise = null
        if (!child.killed) child.kill('SIGTERM')
        reject(
          new CodexAppServerError(
            error?.code === 'ENOENT'
              ? `Codex CLI was not found at "${this.binary}".`
              : `Unable to start Codex App Server: ${error.message}${
                  this.stderr.filter(Boolean).at(-1)
                    ? ` (${this.stderr.filter(Boolean).at(-1)})`
                    : ''
                }`,
            { code: 'CODEX_UNAVAILABLE', status: 503 },
          ),
        )
      }

      child.once('error', failStart)
      child.once('spawn', async () => {
        if (settled) return
        this.attachProcess(child)
        try {
          await this.request('initialize', {
            clientInfo: {
              name: 'lancee_platform',
              title: 'lancee',
              version: '1.0.0',
            },
          })
          this.notify('initialized', {})
          settled = true
          this.startPromise = null
          resolve()
        } catch (error) {
          failStart(error)
        }
      })
    })

    return this.startPromise
  }

  attachProcess(child) {
    const lines = createInterface({ input: child.stdout })
    lines.on('line', (line) => {
      let message
      try {
        message = JSON.parse(line)
      } catch {
        return
      }
      this.handleMessage(message)
    })
    child.stderr.on('data', (chunk) => {
      this.stderr.push(String(chunk).trim())
      this.stderr = this.stderr.slice(-10)
    })
    child.once('close', (code, signal) => {
      const detail = this.stderr.filter(Boolean).at(-1)
      this.failPending(
        new CodexAppServerError(
          detail ||
            `Codex App Server stopped${signal ? ` (${signal})` : ` (${code ?? 'unknown'})`}.`,
          { code: 'CODEX_STOPPED', status: 503 },
        ),
      )
      this.process = null
      this.startPromise = null
      this.emitEvent({
        method: 'runtime/stopped',
        params: { code, signal },
      })
    })
  }

  handleMessage(message) {
    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(String(message.id))
      if (!pending) return
      this.pending.delete(String(message.id))
      clearTimeout(pending.timeout)
      if (message.error) {
        pending.reject(
          new CodexAppServerError(
            message.error.message || 'Codex App Server request failed.',
            { code: 'CODEX_REQUEST_FAILED', status: 400 },
          ),
        )
      } else {
        pending.resolve(message.result)
      }
      return
    }

    if (message.id !== undefined && message.method) {
      const result = clientResponseForRequest(message.method)
      if (result) {
        this.send({ id: message.id, result })
      } else {
        this.send({
          id: message.id,
          error: {
            code: -32601,
            message: `Client method ${message.method} is not supported.`,
          },
        })
      }
      this.emitEvent(message)
      return
    }

    if (message.method) this.emitEvent(message)
  }

  emitEvent(message) {
    const event = {
      sequence: ++this.eventSequence,
      method: message.method,
      params: message.params || {},
    }
    this.eventBuffer.push(event)
    this.eventBuffer = this.eventBuffer.slice(-MAX_BUFFERED_EVENTS)
    this.events.emit('event', event)
  }

  send(message) {
    if (!this.process?.stdin?.writable) {
      throw new CodexAppServerError('Codex App Server is not running.', {
        code: 'CODEX_UNAVAILABLE',
        status: 503,
      })
    }
    this.process.stdin.write(`${JSON.stringify(message)}\n`)
  }

  notify(method, params) {
    this.send({ method, params })
  }

  request(method, params = {}, timeoutMilliseconds) {
    const id = String(this.nextRequestId++)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(
          new CodexAppServerError(`Codex request "${method}" timed out.`, {
            code: 'CODEX_TIMEOUT',
            status: 504,
          }),
        )
      }, timeoutMilliseconds || this.requestTimeoutMilliseconds)
      this.pending.set(id, { resolve, reject, timeout })
      try {
        this.send({ method, id: Number(id), params })
      } catch (error) {
        clearTimeout(timeout)
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  failPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
  }

  bufferedEvents({ after = 0, threadId = null } = {}) {
    return this.eventBuffer.filter(
      (event) =>
        event.sequence > after &&
        (!threadId ||
          event.params?.threadId === threadId ||
          event.params?.thread?.id === threadId),
    )
  }

  subscribe(listener) {
    this.events.on('event', listener)
    return () => this.events.off('event', listener)
  }

  async account() {
    await this.start()
    return this.request('account/read', { refreshToken: false })
  }

  async startDeviceLogin() {
    await this.start()
    return this.request('account/login/start', {
      type: 'chatgptDeviceCode',
    })
  }

  async logout() {
    await this.start()
    await this.request('account/logout')
  }

  async startThread() {
    await this.start()
    return this.request('thread/start', {
      cwd: this.workspaceRoot,
      approvalPolicy: 'never',
    })
  }

  async startTurn({ threadId, prompt }) {
    await this.start()
    return this.request('turn/start', {
      threadId,
      input: [{ type: 'text', text: prompt }],
      cwd: this.workspaceRoot,
      approvalPolicy: 'never',
    })
  }

  async interruptTurn({ threadId, turnId }) {
    await this.start()
    return this.request('turn/interrupt', { threadId, turnId })
  }

  stop() {
    if (!this.process || this.process.killed) return
    this.process.kill('SIGTERM')
  }
}

export function createCodexAppServerManager({
  binary = 'codex',
  binaryArguments = [],
  spawnProcess = spawn,
  dataDirectory,
  workspaceRoot,
  requestTimeoutMilliseconds = DEFAULT_REQUEST_TIMEOUT_MS,
} = {}) {
  const clients = new Map()

  function clientFor(identity) {
    let client = clients.get(identity)
    if (!client) {
      client = new CodexAppServerClient({
        identity,
        binary,
        binaryArguments,
        spawnProcess,
        dataDirectory,
        workspaceRoot,
        requestTimeoutMilliseconds,
      })
      clients.set(identity, client)
    }
    return client
  }

  return {
    clientFor,
    stopAll() {
      for (const client of clients.values()) client.stop()
      clients.clear()
    },
  }
}
