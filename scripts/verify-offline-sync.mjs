import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

const projectDirectory = new URL('..', import.meta.url).pathname
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'lancee-offline-'))
const databasePath = join(temporaryDirectory, 'lancee.sqlite')
const password = 'offline-test-password'
const passwordSalt = 'offline-test-salt'
const passwordHash = scryptSync(password, passwordSalt, 64).toString('hex')
const adminEmail = 'offline-test@example.com'
const boardId = 'field-notes'
const noteId = 'note_11111111-1111-4111-8111-111111111111'

async function availablePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert(address && typeof address === 'object')
  const selectedPort = address.port
  server.close()
  await once(server, 'close')
  return selectedPort
}

async function startApplication() {
  const selectedPort = await availablePort()
  const origin = `http://127.0.0.1:${selectedPort}`
  const output = []
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: projectDirectory,
    env: {
      ...process.env,
      APP_ENV: 'development',
      PORT: String(selectedPort),
      PUBLIC_ORIGIN: origin,
      DATABASE_PATH: databasePath,
      SESSION_SECRET: 'offline-test-session-secret-with-sufficient-entropy',
      ADMIN_NAME: 'Offline Test Admin',
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD_SALT: passwordSalt,
      ADMIN_PASSWORD_HASH: passwordHash,
      WORKSPACE_ID: 'wsp_offline_test',
      WORKSPACE_NAME: 'Offline Test Workspace',
      SMTP_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => output.push(chunk.toString()))
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Application exited before startup:\n${output.join('')}`)
    }
    try {
      const response = await fetch(`${origin}/api/health`)
      if (response.ok) return { child, origin, output }
    } catch {
      // The listener is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  child.kill('SIGTERM')
  throw new Error(`Application did not become healthy:\n${output.join('')}`)
}

async function stopApplication(application) {
  if (application.child.exitCode !== null) return
  application.child.kill('SIGTERM')
  await once(application.child, 'exit')
}

async function login(origin) {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify({ email: adminEmail, password }),
  })
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie')
  assert(cookie)
  return cookie.split(';', 1)[0]
}

async function sessionRequest(origin, cookie, path, options = {}) {
  return fetch(`${origin}${path}`, {
    ...options,
    headers: {
      Cookie: cookie,
      Origin: origin,
      ...(options.headers || {}),
    },
  })
}

function noteMutation(method, key, body) {
  return {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify(body),
  }
}

let application
try {
  const manifest = JSON.parse(
    await readFile(join(projectDirectory, 'public/manifest.webmanifest'), 'utf8'),
  )
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, '/')
  assert(Array.isArray(manifest.icons) && manifest.icons.length > 0)
  const serviceWorker = await readFile(
    join(projectDirectory, 'public/sw.js'),
    'utf8',
  )
  assert.match(serviceWorker, /url\.pathname\.startsWith\('\/api\/'\)/)
  assert.match(serviceWorker, /\/index\.html/)

  application = await startApplication()
  let cookie = await login(application.origin)

  const empty = await sessionRequest(
    application.origin,
    cookie,
    `/api/ideas/notes?boardId=${boardId}`,
  )
  assert.equal(empty.status, 200)
  assert.deepEqual((await empty.json()).notes, [])
  assert.equal(empty.headers.get('cache-control'), 'no-store')

  const createOptions = noteMutation('POST', 'idea-create-verifier-0001', {
    id: noteId,
    boardId,
    content: 'Captured while travelling',
  })
  const createdResponse = await sessionRequest(
    application.origin,
    cookie,
    '/api/ideas/notes',
    createOptions,
  )
  assert.equal(createdResponse.status, 201)
  assert.equal(createdResponse.headers.get('idempotency-replayed'), 'false')
  const created = (await createdResponse.json()).note
  assert.equal(created.version, 1)

  const replay = await sessionRequest(
    application.origin,
    cookie,
    '/api/ideas/notes',
    createOptions,
  )
  assert.equal(replay.status, 201)
  assert.equal(replay.headers.get('idempotency-replayed'), 'true')
  assert.deepEqual((await replay.json()).note, created)

  const mismatchedReplay = await sessionRequest(
    application.origin,
    cookie,
    '/api/ideas/notes',
    noteMutation('POST', 'idea-create-verifier-0001', {
      id: noteId,
      boardId,
      content: 'Different payload',
    }),
  )
  assert.equal(mismatchedReplay.status, 409)

  const updatedResponse = await sessionRequest(
    application.origin,
    cookie,
    `/api/ideas/notes/${noteId}`,
    noteMutation('PATCH', 'idea-update-verifier-0001', {
      content: 'Edited on the first device',
      expectedVersion: 1,
    }),
  )
  assert.equal(updatedResponse.status, 200)
  const updated = (await updatedResponse.json()).note
  assert.equal(updated.version, 2)

  const staleOptions = noteMutation('PATCH', 'idea-update-stale-0001', {
    content: 'A stale offline edit',
    expectedVersion: 1,
  })
  const staleResponse = await sessionRequest(
    application.origin,
    cookie,
    `/api/ideas/notes/${noteId}`,
    staleOptions,
  )
  assert.equal(staleResponse.status, 409)
  const stale = await staleResponse.json()
  assert.equal(stale.conflict.current.version, 2)
  assert.equal(stale.conflict.current.content, 'Edited on the first device')

  const staleReplay = await sessionRequest(
    application.origin,
    cookie,
    `/api/ideas/notes/${noteId}`,
    staleOptions,
  )
  assert.equal(staleReplay.status, 409)
  assert.equal(staleReplay.headers.get('idempotency-replayed'), 'true')

  const resolvedResponse = await sessionRequest(
    application.origin,
    cookie,
    `/api/ideas/notes/${noteId}`,
    noteMutation('PATCH', 'idea-update-resolved-0001', {
      content: 'Deliberately kept offline edit',
      expectedVersion: 2,
    }),
  )
  assert.equal(resolvedResponse.status, 200)
  assert.equal((await resolvedResponse.json()).note.version, 3)

  const sceneBoardId = 'board_verify_scene'
  const missingScene = await sessionRequest(
    application.origin,
    cookie,
    `/api/ideas/boards/${sceneBoardId}/scene`,
  )
  assert.equal(missingScene.status, 200)
  assert.equal((await missingScene.json()).scene, null)

  const sampleScene = {
    elements: [{ type: 'rectangle', id: 'elem_verify_1', x: 0, y: 0, width: 100 }],
    appState: { name: 'Verifier board' },
    files: {},
  }
  const savedSceneResponse = await sessionRequest(
    application.origin,
    cookie,
    `/api/ideas/boards/${sceneBoardId}/scene`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene: sampleScene }),
    },
  )
  assert.equal(savedSceneResponse.status, 200)
  assert.equal((await savedSceneResponse.json()).scene.boardId, sceneBoardId)

  const loadedScene = await sessionRequest(
    application.origin,
    cookie,
    `/api/ideas/boards/${sceneBoardId}/scene`,
  )
  assert.equal(loadedScene.status, 200)
  assert.deepEqual((await loadedScene.json()).scene, sampleScene)

  const invalidScene = await sessionRequest(
    application.origin,
    cookie,
    `/api/ideas/boards/${sceneBoardId}/scene`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene: ['not', 'an', 'object'] }),
    },
  )
  assert.equal(invalidScene.status, 400)

  await stopApplication(application)
  application = null

  const persisted = new DatabaseSync(databasePath, { readOnly: true })
  const stored = persisted
    .prepare(
      `SELECT content, version FROM idea_notes
       WHERE workspace_id = ? AND id = ?`,
    )
    .get('wsp_offline_test', noteId)
  assert.equal(stored.content, 'Deliberately kept offline edit')
  assert.equal(stored.version, 3)
  const sceneRow = persisted
    .prepare(
      `SELECT scene_json FROM idea_canvas_scenes
       WHERE workspace_id = ? AND board_id = ?`,
    )
    .get('wsp_offline_test', sceneBoardId)
  assert.deepEqual(JSON.parse(sceneRow.scene_json), sampleScene)
  persisted.close()

  application = await startApplication()
  cookie = await login(application.origin)
  const afterRestart = await sessionRequest(
    application.origin,
    cookie,
    `/api/ideas/notes?boardId=${boardId}`,
  )
  const notes = (await afterRestart.json()).notes
  assert.equal(notes.length, 1)
  assert.equal(notes[0].content, 'Deliberately kept offline edit')
  assert.equal(notes[0].version, 3)

  const afterRestartScene = await sessionRequest(
    application.origin,
    cookie,
    `/api/ideas/boards/${sceneBoardId}/scene`,
  )
  assert.equal(afterRestartScene.status, 200)
  assert.deepEqual((await afterRestartScene.json()).scene, sampleScene)

  console.log(
    'Offline/PWA flow verified: install manifest, API cache exclusion, durable notes, idempotent replay, version conflicts, deliberate resolution, workspace-scoped canvas scenes, and restart persistence.',
  )
} finally {
  if (application) await stopApplication(application)
  await rm(temporaryDirectory, { recursive: true, force: true })
}
