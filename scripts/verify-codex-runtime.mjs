import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { createCodexAppServerManager } from '../server/codex-app-server.mjs'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'lancee-codex-runtime-'))

function createFakeAppServer() {
  let authenticated = false
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killed = false
  child.kill = (signal = 'SIGTERM') => {
    if (child.killed) return
    child.killed = true
    child.stdin.end()
    child.stdout.end()
    child.stderr.end()
    queueMicrotask(() => child.emit('close', null, signal))
  }

  const send = (message) => {
    child.stdout.write(`${JSON.stringify(message)}\n`)
  }

  let buffer = ''
  child.stdin.setEncoding('utf8')
  child.stdin.on('data', (chunk) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      const message = JSON.parse(line)
      const { id, method, params = {} } = message
      if (id === undefined) continue

      if (method === 'initialize') {
        send({ id, result: { userAgent: 'fake-codex' } })
      } else if (method === 'account/read') {
        send({
          id,
          result: {
            account: authenticated
              ? { type: 'chatgpt', email: 'codex@example.com', planType: 'plus' }
              : null,
            requiresOpenaiAuth: true,
          },
        })
      } else if (method === 'account/login/start') {
        authenticated = true
        send({
          id,
          result: {
            type: 'chatgptDeviceCode',
            loginId: 'login_fake',
            verificationUrl: 'https://auth.openai.com/codex/device',
            userCode: 'TEST-CODE',
          },
        })
        send({
          method: 'account/login/completed',
          params: { loginId: 'login_fake', success: true, error: null },
        })
      } else if (method === 'account/logout') {
        authenticated = false
        send({ id, result: {} })
      } else if (method === 'thread/start') {
        const thread = {
          id: 'thr_fake',
          cwd: params.cwd,
          approvalPolicy: params.approvalPolicy,
          sandbox: params.sandbox ?? null,
        }
        send({ id, result: { thread } })
        send({ method: 'thread/started', params: { thread } })
      } else if (method === 'turn/start') {
        const turn = {
          id: 'turn_fake',
          status: 'inProgress',
          items: [],
          error: null,
          sandboxPolicy: params.sandboxPolicy ?? null,
        }
        send({ id, result: { turn } })
        send({
          method: 'item/agentMessage/delta',
          params: {
            threadId: params.threadId,
            turnId: turn.id,
            itemId: 'item_fake',
            delta: 'Fake Codex response.',
          },
        })
        send({
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: { ...turn, status: 'completed' },
          },
        })
      } else if (method === 'turn/interrupt') {
        send({ id, result: {} })
      } else {
        send({
          id,
          error: { code: -32601, message: `Unsupported method: ${method}` },
        })
      }
    }
  })

  queueMicrotask(() => child.emit('spawn'))
  return child
}

const manager = createCodexAppServerManager({
  binary: 'fake-codex',
  dataDirectory: join(temporaryDirectory, 'codex-home'),
  workspaceRoot: projectDirectory,
  requestTimeoutMilliseconds: 2_000,
  spawnProcess: createFakeAppServer,
})
const client = manager.clientFor('wsp_test:usr_test')

try {
  const initialAccount = await client.account()
  assert.equal(initialAccount.account, null)
  assert.equal(initialAccount.requiresOpenaiAuth, true)

  const login = await client.startDeviceLogin()
  assert.equal(login.type, 'chatgptDeviceCode')
  assert.equal(login.userCode, 'TEST-CODE')
  assert.equal(login.verificationUrl, 'https://auth.openai.com/codex/device')
  assert.equal((await client.account()).account.email, 'codex@example.com')

  const threadResult = await client.startThread()
  const threadId = threadResult.thread.id
  assert.equal(threadId, 'thr_fake')
  assert.equal(threadResult.thread.cwd, projectDirectory)
  assert.equal(threadResult.thread.approvalPolicy, 'never')
  assert.equal(threadResult.thread.sandbox, null)

  const codexHomeRoot = join(temporaryDirectory, 'codex-home')
  const [identityDirectory] = readdirSync(codexHomeRoot)
  const managedConfig = readFileSync(
    join(codexHomeRoot, identityDirectory, 'config.toml'),
    'utf8',
  )
  assert.match(managedConfig, /default_permissions = "lancee-workspace"/)
  assert.match(managedConfig, /":root" = "deny"/)
  assert.match(managedConfig, /":workspace_roots"/)
  assert.match(managedConfig, /enabled = false/)

  const turnResult = await client.startTurn({
    threadId,
    prompt: 'Inspect the workspace.',
  })
  assert.equal(turnResult.turn.id, 'turn_fake')
  assert.equal(turnResult.turn.sandboxPolicy, null)

  const events = client.bufferedEvents({ threadId })
  assert.ok(
    events.some(
      (event) =>
        event.method === 'item/agentMessage/delta' &&
        event.params.delta === 'Fake Codex response.',
    ),
  )
  assert.ok(
    events.some(
      (event) =>
        event.method === 'turn/completed' &&
        event.params.turn.status === 'completed',
    ),
  )

  await client.interruptTurn({ threadId, turnId: turnResult.turn.id })
  await client.logout()
  assert.equal((await client.account()).account, null)

  console.log('Codex App Server bridge verification passed.')
} finally {
  manager.stopAll()
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
