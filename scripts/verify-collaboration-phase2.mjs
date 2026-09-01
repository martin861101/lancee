import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../server/database.mjs'

const root = new URL('..', import.meta.url).pathname
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'lancee-collaboration-'))
const databasePath = join(temporaryDirectory, 'collaboration.sqlite')
const password = 'collaboration-password'
const salt = 'collaboration-salt'
const hash = scryptSync(password, salt, 64).toString('hex')
const workspaceId = 'wsp_collaboration'
const ownerEmail = 'collaboration-owner@example.com'
const activeUserId = 'usr_active_collaborator'
const invitedUserId = 'usr_invited_collaborator'
const disabledUserId = 'usr_disabled_collaborator'
const foreignUserId = 'usr_foreign_collaborator'
const projectId = 'prj_collaboration_main'
const legacyTaskId = 'tsk_11111111-1111-4111-8111-111111111111'
const legacyNoteId = 'note_11111111-1111-4111-8111-111111111111'

async function availablePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  server.close()
  await once(server, 'close')
  assert(address && typeof address === 'object')
  return address.port
}

async function seed() {
  const database = await openDatabase({
    databasePath,
    adminEmail: ownerEmail,
    adminName: 'Collaboration Owner',
    adminPasswordSalt: salt,
    adminPasswordHash: hash,
    workspaceId,
    workspaceName: 'Collaboration Workspace',
  })
  const owner = await database.getContextByEmail(ownerEmail)
  const now = new Date().toISOString()
  await database.query(
    `INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $3)`,
    ['wsp_foreign_collaboration', 'Foreign Workspace', now],
  )
  for (const [id, email, name] of [
    [activeUserId, 'active@example.com', 'Active Member'],
    [invitedUserId, 'invited@example.com', 'Invited Member'],
    [disabledUserId, 'disabled@example.com', 'Disabled Member'],
    [foreignUserId, 'foreign@example.com', 'Foreign Member'],
  ]) {
    await database.query(
      `INSERT INTO users (id, email, name, password_salt, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, 'unused', 'unused', $4, $4)`,
      [id, email, name, now],
    )
  }
  for (const [id, selectedWorkspaceId, userId, status] of [
    ['wsm_active', workspaceId, activeUserId, 'active'],
    ['wsm_invited', workspaceId, invitedUserId, 'invited'],
    ['wsm_disabled', workspaceId, disabledUserId, 'disabled'],
    ['wsm_foreign', 'wsp_foreign_collaboration', foreignUserId, 'active'],
  ]) {
    await database.query(
      `INSERT INTO workspace_members (id, workspace_id, user_id, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'member', $4, $5, $5)`,
      [id, selectedWorkspaceId, userId, status, now],
    )
  }
  await database.query(
    `INSERT INTO projects (id, workspace_id, name, client, scope, due, status, progress, accent, board_id, created_at, updated_at)
     VALUES ($1, $2, 'Collaboration Project', 'Internal', 'Phase 2', '', 'In progress', 0, '#6854e8', 'board_collaboration', $3, $3)`,
    [projectId, workspaceId, now],
  )
  await database.query(
    `INSERT INTO project_tasks (id, workspace_id, project_id, bucket_id, title, notes, created_at, updated_at)
     VALUES ($1, $2, $3, 'backlog', 'Legacy task', 'Loads without collaboration rows', $4, $4)`,
    [legacyTaskId, workspaceId, projectId, now],
  )
  await database.query(
    `INSERT INTO idea_notes (id, workspace_id, board_id, content, version, created_by, created_at, updated_at)
     VALUES ($1, $2, 'board_collaboration', 'Legacy note', 1, $3, $4, $4)`,
    [legacyNoteId, workspaceId, owner.user.id, now],
  )
  await database.close()
  return owner.user.id
}

async function startApplication() {
  const port = await availablePort()
  const origin = `http://127.0.0.1:${port}`
  const output = []
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      APP_ENV: 'development',
      PORT: String(port),
      PUBLIC_ORIGIN: origin,
      DATABASE_PATH: databasePath,
      SESSION_SECRET: 'collaboration-session-secret-with-sufficient-entropy',
      ADMIN_NAME: 'Collaboration Owner',
      ADMIN_EMAIL: ownerEmail,
      ADMIN_PASSWORD_SALT: salt,
      ADMIN_PASSWORD_HASH: hash,
      WORKSPACE_ID: workspaceId,
      WORKSPACE_NAME: 'Collaboration Workspace',
      SMTP_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => output.push(chunk.toString()))
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Application exited:\n${output.join('')}`)
    try {
      if ((await fetch(`${origin}/api/health`)).ok) return { child, origin, output }
    } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  child.kill('SIGTERM')
  throw new Error(`Application did not start:\n${output.join('')}`)
}

async function login(origin) {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ email: ownerEmail, password }),
  })
  assert.equal(response.status, 200)
  return response.headers.get('set-cookie').split(';', 1)[0]
}

async function request(application, cookie, path, options = {}) {
  return fetch(`${application.origin}${path}`, {
    ...options,
    headers: { Cookie: cookie, Origin: application.origin, ...(options.headers || {}) },
  })
}

function jsonMutation(method, body, key = crypto.randomUUID()) {
  return {
    method,
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  }
}

let application
try {
  const databaseSource = await readFile(join(root, 'server/database.mjs'), 'utf8')
  const membershipConstraintDrop = databaseSource.indexOf(
    'ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check',
  )
  const membershipRoleNormalization = databaseSource.indexOf(
    "UPDATE workspace_members SET role = CASE WHEN role = 'owner' THEN 'owner' ELSE 'member' END",
  )
  assert(membershipConstraintDrop >= 0 && membershipConstraintDrop < membershipRoleNormalization)
  const invitationConstraintDrop = databaseSource.indexOf(
    'ALTER TABLE team_invitations DROP CONSTRAINT IF EXISTS team_invitations_role_check',
  )
  const invitationRoleNormalization = databaseSource.indexOf(
    "UPDATE team_invitations SET role = CASE WHEN role = 'owner' THEN 'admin' ELSE 'member' END",
  )
  assert(invitationConstraintDrop >= 0 && invitationConstraintDrop < invitationRoleNormalization)

  const ownerUserId = await seed()
  application = await startApplication()
  const cookie = await login(application.origin)

  const members = await request(application, cookie, '/api/workspace/members/search?q=')
  assert.equal(members.status, 200)
  assert.deepEqual((await members.json()).members.map((member) => member.userId).sort(), [activeUserId, ownerUserId].sort())

  const createTask = await request(application, cookie, `/api/projects/${projectId}/tasks`, jsonMutation('POST', {
    title: 'Collaborative task', notes: 'Shared task', bucketId: 'backlog', assigneeIds: [activeUserId, ownerUserId],
  }))
  assert.equal(createTask.status, 201)
  const task = (await createTask.json()).task
  assert.deepEqual(task.assignees.map((assignee) => assignee.userId).sort(), [activeUserId, ownerUserId].sort())

  for (const rejectedUserId of [foreignUserId, invitedUserId, disabledUserId]) {
    const rejected = await request(application, cookie, `/api/projects/${projectId}/tasks/${task.id}`, jsonMutation('PATCH', { assigneeIds: [rejectedUserId] }))
    assert.equal(rejected.status, 403)
  }

  const assignedToMe = await request(application, cookie, `/api/projects/${projectId}/tasks?assignedTo=me`)
  assert.equal(assignedToMe.status, 200)
  assert((await assignedToMe.json()).tasks.some((candidate) => candidate.id === task.id))

  const unassign = await request(application, cookie, `/api/projects/${projectId}/tasks/${task.id}`, jsonMutation('PATCH', { assigneeIds: [] }))
  assert.equal(unassign.status, 200)
  assert.equal((await unassign.json()).task.assignees.length, 0)

  const link = await request(application, cookie, `/api/ideas/notes/${legacyNoteId}/tasks/${task.id}`, jsonMutation('POST', {}))
  assert.equal(link.status, 201)
  const links = await request(application, cookie, `/api/ideas/notes/${legacyNoteId}/tasks`)
  assert.equal((await links.json()).links.length, 1)
  const unlink = await request(application, cookie, `/api/ideas/notes/${legacyNoteId}/tasks/${task.id}`, { method: 'DELETE' })
  assert.equal(unlink.status, 204)

  const taskFromNote = await request(application, cookie, `/api/ideas/notes/${legacyNoteId}/tasks`, jsonMutation('POST', {
    projectId, bucketId: 'backlog', title: 'Task from legacy note', notes: 'Legacy note', assigneeIds: [activeUserId],
  }))
  assert.equal(taskFromNote.status, 201)
  const taskFromNotePayload = await taskFromNote.json()
  assert.equal(taskFromNotePayload.link.noteId, legacyNoteId)
  assert.equal(taskFromNotePayload.link.taskId, taskFromNotePayload.task.id)

  const mentionedNoteId = 'note_22222222-2222-4222-8222-222222222222'
  const token = `@[Active Member](user:${activeUserId})`
  const taskComment = await request(application, cookie, `/api/projects/${projectId}/comments`, jsonMutation('POST', {
    taskId: taskFromNotePayload.task.id, body: `${token} please review this task`,
  }))
  assert.equal(taskComment.status, 201)
  assert.equal((await taskComment.json()).comment.mentions[0].userId, activeUserId)

  const mentionCreate = await request(application, cookie, '/api/ideas/notes', jsonMutation('POST', {
    id: mentionedNoteId, boardId: 'board_collaboration', content: `${token} ${token} please review`,
  }))
  assert.equal(mentionCreate.status, 201)
  assert.equal((await mentionCreate.json()).note.mentions.length, 1)

  const mentionEdit = await request(application, cookie, `/api/ideas/notes/${mentionedNoteId}`, jsonMutation('PATCH', {
    content: 'Mention removed', expectedVersion: 1,
  }))
  assert.equal(mentionEdit.status, 200)
  assert.equal((await mentionEdit.json()).note.mentions.length, 0)

  const crossWorkspaceMention = await request(application, cookie, '/api/ideas/notes', jsonMutation('POST', {
    id: 'note_33333333-3333-4333-8333-333333333333', boardId: 'board_collaboration', content: `@[Foreign Member](user:${foreignUserId})`,
  }))
  assert.equal(crossWorkspaceMention.status, 403)

  const legacyTasks = await request(application, cookie, `/api/projects/${projectId}/tasks`)
  assert((await legacyTasks.json()).tasks.some((candidate) => candidate.id === legacyTaskId))
  const legacyNotes = await request(application, cookie, '/api/ideas/notes?boardId=board_collaboration')
  assert((await legacyNotes.json()).notes.some((candidate) => candidate.id === legacyNoteId))

  application.child.kill('SIGTERM')
  await once(application.child, 'exit')
  const sqlite = new DatabaseSync(databasePath, { readOnly: true })
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM mentions WHERE source_id = ?`).get(mentionedNoteId).count, 0)
  assert(sqlite.prepare(`SELECT COUNT(*) AS count FROM workspace_events WHERE event_type = 'task.assigned'`).get().count >= 2)
  assert(sqlite.prepare(`SELECT COUNT(*) AS count FROM workspace_events WHERE event_type = 'member.mentioned'`).get().count >= 1)
  assert(sqlite.prepare(`SELECT COUNT(*) AS count FROM task_assignees WHERE task_id = ? AND unassigned_at IS NOT NULL`).get(task.id).count >= 2)
  sqlite.close()
  console.log('Collaboration Phase 2 verification passed.')
} finally {
  if (application?.child.exitCode === null) {
    application.child.kill('SIGTERM')
    await once(application.child, 'exit')
  }
  await rm(temporaryDirectory, { recursive: true, force: true })
}
