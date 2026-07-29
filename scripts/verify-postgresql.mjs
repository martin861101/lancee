import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'
import { openDatabase } from '../server/database.mjs'

if (!process.env.DATABASE_URL && !process.env.PGHOST) {
  throw new Error('Set DATABASE_URL or PGHOST before running the PostgreSQL verifier.')
}

const workspaceId = 'wsp_postgresql_verifier'
const adminEmail = 'postgresql-verifier@example.com'
const passwordSalt = 'postgresql-verifier-salt'
const passwordHash = scryptSync(
  'postgresql-verifier-password',
  passwordSalt,
  64,
).toString('hex')

function connect() {
  return openDatabase({
    adminEmail,
    adminName: 'PostgreSQL Verifier',
    adminPasswordSalt: passwordSalt,
    adminPasswordHash: passwordHash,
    workspaceId,
    workspaceName: 'PostgreSQL Verification',
  })
}

let database
try {
  database = await connect()
  const info = await database.getDatabaseInfo()
  assert.equal(info.provider, 'PostgreSQL')
  assert.match(info.version, /^PostgreSQL 16\./)

  const context = await database.getContextByEmail(adminEmail)
  assert.equal(context.workspace.id, workspaceId)

  const project = await database.createProject({
    workspaceId,
    name: 'PostgreSQL persistence check',
    client: 'Verifier',
    due: '2026-08-01',
  })
  assert.equal(project.progress, 0)

  await assert.rejects(
    database.transaction(async () => {
      await database.createWorkspaceCloudLink({
        workspaceId,
        provider: 'other',
        label: 'Rollback check',
        folderUrl: 'https://example.test/rollback',
      })
      throw new Error('force rollback')
    }),
    /force rollback/,
  )
  assert.equal((await database.listWorkspaceCloudLinks(workspaceId)).length, 0)

  await database.transaction(async () => {
    await database.lockIdempotency(workspaceId, 'verify', 'postgresql-lock')
    await database.recordApiRequest(workspaceId)
  })
  const currentMonth = new Date().toISOString().slice(0, 7)
  assert.equal(
    (await database.getMonthlyApiMetrics(workspaceId, currentMonth)).requestCount,
    1,
  )

  await database.close()
  database = null

  database = await connect()
  const projects = await database.listProjects(workspaceId)
  assert(projects.some((item) => item.id === project.id))

  await database.query('DELETE FROM workspaces WHERE id = $1', [workspaceId])
  console.log(
    'PostgreSQL verified: schema migration, connection pooling, transactions, rollback, advisory locking, metrics, and restart persistence.',
  )
} finally {
  if (database) await database.close()
}
