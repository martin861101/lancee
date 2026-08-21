import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/database.mjs'
import {
  createMemoryRouter,
  MemoryRouterError,
  routeMemory,
} from '../server/memory-router.mjs'
import { listWorkspaceEvents } from '../server/workspace-events.mjs'

const directory = mkdtempSync(join(tmpdir(), 'lancee-memory-router-'))
let database

try {
  database = await openDatabase({
    databasePath: join(directory, 'memory.sqlite'),
    adminEmail: 'memory@example.test',
    adminName: 'Memory Test',
    adminPasswordSalt: 'memory-salt',
    adminPasswordHash: 'memory-hash',
    workspaceId: 'wsp_memory',
    workspaceName: 'Memory Workspace',
  })
  const context = await database.getContextByEmail('memory@example.test')
  assert.equal(routeMemory({ value: 'possibly useful later' }).destination, 'session')
  assert.equal(routeMemory({ kind: 'response_preference' }).destination, 'hermes')
  assert.equal(routeMemory({ kind: 'decision' }).destination, 'lancee')
  assert.equal(routeMemory({ source: 'workspace_event', eventType: 'project.created' }).destination, 'lancee')

  const decisions = []
  const router = createMemoryRouter({
    database,
    lanceeHandlers: {
      decision: async (handlerContext, value) => {
        assert.equal(handlerContext.workspace.id, context.workspace.id)
        const decision = { id: 'dec_memory_test', ...value }
        decisions.push(decision)
        return decision
      },
    },
  })
  const session = await router.remember(context, {
    sessionId: 'thread_1',
    value: { currentTask: 'Review the quote' },
  })
  assert.equal(session.destination, 'session')
  assert.equal(session.persisted, false)
  assert.equal(router.getSessionMemory(context, 'thread_1').length, 1)
  assert.equal(createMemoryRouter({ database }).getSessionMemory(context, 'thread_1').length, 0)

  const preference = await router.remember(context, {
    kind: 'response_preference',
    key: 'response_length',
    value: 'concise',
    confidence: 1,
  })
  assert.equal(preference.destination, 'hermes')
  assert.equal(preference.memory.category, 'response_preference')
  const reloadedRouter = createMemoryRouter({ database })
  assert.deepEqual(
    (await reloadedRouter.getHermesPreferences(context)).map((item) => [item.key, item.value]),
    [['response_length', 'concise']],
  )
  const alternateWorkspaceId = 'wsp_memory_alternate'
  const timestamp = new Date().toISOString()
  await database.query(
    `INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
    [alternateWorkspaceId, 'Alternate Memory Workspace', timestamp, timestamp],
  )
  await database.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES ($1, $2, 'owner', $3)`,
    [alternateWorkspaceId, context.user.id, timestamp],
  )
  const alternateContext = await database.getContextByIds(context.user.id, alternateWorkspaceId)
  assert.deepEqual(await reloadedRouter.getHermesPreferences(alternateContext), [])
  await reloadedRouter.remember(alternateContext, {
    kind: 'response_preference',
    key: 'response_length',
    value: 'detailed',
  })
  assert.deepEqual(
    (await reloadedRouter.getHermesPreferences(context)).map((item) => [item.key, item.value]),
    [['response_length', 'concise']],
  )
  assert.deepEqual(
    (await reloadedRouter.getHermesPreferences(alternateContext)).map((item) => [item.key, item.value]),
    [['response_length', 'detailed']],
  )
  await assert.rejects(
    router.remember(context, {
      kind: 'working_convention',
      key: 'api_token',
      value: 'must-not-be-stored',
    }),
    (error) => error instanceof MemoryRouterError && error.code === 'SENSITIVE_MEMORY_REJECTED',
  )

  const eventMemory = await router.remember(context, {
    kind: 'workspace_event',
    value: {
      eventType: 'project.created',
      entityType: 'project',
      entityId: 'prj_memory_reference',
      payload: { name: 'Memory architecture test' },
    },
  })
  assert.equal(eventMemory.destination, 'lancee')
  assert.equal(eventMemory.resource.workspaceId, context.workspace.id)
  assert.equal((await listWorkspaceEvents(database, context)).length, 1)

  const decisionMemory = await router.remember(context, {
    kind: 'decision',
    value: { decisionText: 'Use the approved quote.' },
  })
  assert.equal(decisionMemory.resource.id, 'dec_memory_test')
  assert.equal(decisions.length, 1)
  await assert.rejects(
    reloadedRouter.remember(context, { kind: 'decision', value: { decisionText: 'Do not store generically.' } }),
    (error) => error instanceof MemoryRouterError && error.code === 'LANCEE_DOMAIN_HANDLER_REQUIRED',
  )

  console.log('Memory Router verified: ephemeral Session context, workspace-and-user-scoped Hermes preferences, authoritative Lancee business routing, deterministic defaults, and secret rejection.')
} finally {
  await database?.close()
  rmSync(directory, { recursive: true, force: true })
}
