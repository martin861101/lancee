import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'
import { openDatabase } from '../server/database.mjs'
import {
  decryptToken,
  encryptToken,
  generateMasterKey,
} from '../server/vault.mjs'

if (!process.env.DATABASE_URL && !process.env.PGHOST) {
  throw new Error('Set DATABASE_URL or PGHOST before running the PostgreSQL verifier.')
}

if (!process.env.ENCRYPTION_MASTER_KEY) {
  process.env.ENCRYPTION_MASTER_KEY = generateMasterKey()
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

  const encrypted = encryptToken('pg_vault_secret_token')
  const encryptedRefresh = encryptToken('pg_refresh_secret')
  const vaultToken = await database.saveTenantIntegrationToken({
    workspaceId,
    provider: 'stripe',
    encryptedAccessToken: encrypted.encrypted_access_token,
    encryptedRefreshToken: encryptedRefresh.encrypted_access_token,
    tokenType: 'Bearer',
    expiresAt: '2030-01-01T00:00:00.000Z',
    iv: encrypted.iv,
    authTag: encrypted.auth_tag,
    refreshIv: encryptedRefresh.iv,
    refreshAuthTag: encryptedRefresh.auth_tag,
  })
  assert.equal(vaultToken.provider, 'stripe')
  const loadedToken = await database.getTenantIntegrationToken(workspaceId, 'stripe')
  assert.equal(
    decryptToken({
      encrypted_access_token: loadedToken.encryptedAccessToken,
      iv: loadedToken.iv,
      auth_tag: loadedToken.authTag,
    }),
    'pg_vault_secret_token',
  )
  assert.equal(
    decryptToken({
      encrypted_access_token: loadedToken.encryptedRefreshToken,
      iv: loadedToken.refreshIv,
      auth_tag: loadedToken.refreshAuthTag,
    }),
    'pg_refresh_secret',
  )
  assert.equal(
    (await database.listTenantIntegrationTokens(workspaceId))[0].provider,
    'stripe',
  )

  const crossTenant = await openDatabase({
    adminEmail,
    adminName: 'PostgreSQL Verifier',
    adminPasswordSalt: passwordSalt,
    adminPasswordHash: passwordHash,
    workspaceId,
    workspaceName: 'PostgreSQL Verification',
  })
  await crossTenant.query(
    `INSERT INTO workspaces (id, name, created_at, updated_at)
     VALUES ('wsp_rls_other', 'Other Tenant', $1, $1)`,
    [new Date().toISOString()],
  )
  const crossTenantLoaded = await crossTenant.runAsTenant(
    'wsp_rls_other',
    async () => await crossTenant.query(
      `SELECT 1 FROM tenant_integration_tokens WHERE workspace_id = $1`,
      [workspaceId],
    ),
  )
  assert.equal(crossTenantLoaded.length, 0, 'RLS must hide rows from other tenants')
  await crossTenant.query('DELETE FROM workspaces WHERE id = $1', ['wsp_rls_other'])
  await crossTenant.close()

  await database.deleteTenantIntegrationToken(workspaceId, 'stripe')
  assert.equal(
    await database.getTenantIntegrationToken(workspaceId, 'stripe'),
    null,
  )

  await database.close()
  database = null

  database = await connect()
  const projects = await database.listProjects(workspaceId)
  assert(projects.some((item) => item.id === project.id))

  await database.query('DELETE FROM workspaces WHERE id = $1', [workspaceId])
  console.log(
    'PostgreSQL verified: schema migration, connection pooling, transactions, rollback, advisory locking, metrics, restart persistence, token vault, and RLS tenant isolation.',
  )
} finally {
  if (database) await database.close()
}
