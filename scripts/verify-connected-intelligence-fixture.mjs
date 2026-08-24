import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createConnectedIntelligenceService } from '../server/connected-intelligence.mjs'
import { openDatabase } from '../server/database.mjs'
import { loadFixture } from './connected-intelligence-fixture.mjs'

const directory = mkdtempSync(join(tmpdir(), 'lancee-ci-fixture-'))
const databasePath = join(directory, 'fixture.sqlite')
const environment = {
  ...process.env,
  DATABASE_URL: '',
  PGHOST: '',
  DATABASE_PATH: databasePath,
  ADMIN_EMAIL: 'fixture-owner@example.test',
  ADMIN_NAME: 'Fixture Owner',
  ADMIN_PASSWORD_SALT: 'fixture-salt',
  ADMIN_PASSWORD_HASH: 'fixture-hash',
  WORKSPACE_ID: 'wsp_normal_control',
  WORKSPACE_NAME: 'Normal Control Workspace',
}

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: environment,
    encoding: 'utf8',
  })
  return {
    status: result.status ?? (result.error ? 1 : 0),
    output: `${result.stdout || ''}${result.stderr || ''}`,
  }
}

let database
try {
  const { fixture } = await loadFixture()
  const xlsx = readFileSync('test-data/connected-intelligence/business-records.xlsx')
  assert.equal(createHash('sha256').update(xlsx).digest('hex'), fixture.metadata.sourceSha256)

  const dryRun = run('scripts/seed-connected-intelligence.mjs', ['--dry-run'])
  assert.equal(dryRun.status, 0, dryRun.output)
  assert.match(dryRun.output, /No changes made\./)
  assert.equal(existsSync(databasePath), false)

  const seeded = run('scripts/seed-connected-intelligence.mjs')
  assert.equal(seeded.status, 0, seeded.output)
  assert.match(seeded.output, /Verification: PASS/)
  assert.match(seeded.output, /External side-effect firewall: PASS/)

  const benchmark = run('scripts/benchmark-connected-intelligence.mjs')
  assert.equal(benchmark.status, 0, benchmark.output)
  assert.match(benchmark.output, /True positives:\s+11/)
  assert.match(benchmark.output, /False positives:\s+0/)
  assert.match(benchmark.output, /False negatives:\s+0/)

  const duplicate = run('scripts/seed-connected-intelligence.mjs')
  assert.notEqual(duplicate.status, 0)
  assert.match(duplicate.output, /matching synthetic workspace already exists/)

  const reset = run('scripts/seed-connected-intelligence.mjs', ['--reset'])
  assert.equal(reset.status, 0, reset.output)
  assert.match(reset.output, /Reset verified and removed fixture workspace/)
  assert.match(reset.output, /Verification: PASS/)

  const reseedBenchmark = run('scripts/benchmark-connected-intelligence.mjs')
  assert.equal(reseedBenchmark.status, 0, reseedBenchmark.output)
  assert.match(reseedBenchmark.output, /Detected opportunities:\s+11/)

  database = await openDatabase({
    databasePath,
    adminEmail: environment.ADMIN_EMAIL,
    adminName: environment.ADMIN_NAME,
    adminPasswordSalt: environment.ADMIN_PASSWORD_SALT,
    adminPasswordHash: environment.ADMIN_PASSWORD_HASH,
    workspaceId: environment.WORKSPACE_ID,
    workspaceName: environment.WORKSPACE_NAME,
  })
  assert.equal((await database.query(
    `SELECT id FROM workspaces WHERE id = 'wsp_normal_control'`,
  )).length, 1, 'reset must preserve an ordinary workspace')
  const markers = await database.query(
    `SELECT * FROM workspace_fixture_markers WHERE purpose = 'connected_intelligence_test'`,
  )
  assert.equal(markers.length, 1)
  assert.notEqual(markers[0].workspace_id, 'wsp_normal_control')

  const ownerRows = await database.query('SELECT id FROM users WHERE email = $1', [environment.ADMIN_EMAIL])
  const normalContext = await database.getContextByIds(ownerRows[0].id, 'wsp_normal_control')
  const intelligence = createConnectedIntelligenceService({ database })
  await assert.rejects(
    intelligence.observeFixtureCommunication(normalContext, {
      sourceAccountId: 'fixture@connected-intelligence.test',
      externalMessageId: 'must-not-write',
      direction: 'inbound',
      from: [{ address: 'contact@example.test' }],
      to: [{ address: 'fixture@connected-intelligence.test' }],
      occurredAt: '2024-01-01T00:00:00.000Z',
    }),
    (error) => error.code === 'FIXTURE_WORKSPACE_REQUIRED',
  )

  console.log('Connected Intelligence fixture verification passed.')
} finally {
  await database?.close()
  rmSync(directory, { recursive: true, force: true })
}
