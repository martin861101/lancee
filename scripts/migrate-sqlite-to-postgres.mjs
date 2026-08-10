import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import pg from 'pg'
import { openDatabase } from '../server/database.mjs'

const sourcePath = resolve(process.env.SQLITE_SOURCE_PATH || '')
if (!process.env.SQLITE_SOURCE_PATH || !existsSync(sourcePath)) {
  throw new Error('SQLITE_SOURCE_PATH must point to an existing SQLite database.')
}
if (!process.env.DATABASE_URL && !process.env.PGHOST) {
  throw new Error('Set DATABASE_URL or the PG* variables for the PostgreSQL destination.')
}
for (const key of [
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD_SALT',
  'ADMIN_PASSWORD_HASH',
  'WORKSPACE_ID',
]) {
  if (!process.env[key]) throw new Error(`${key} is required for a safe migration.`)
}

const tableOrder = [
  'workspaces',
  'users',
  'registration_confirmations',
  'workspace_members',
  'team_invitations',
  'mcp_invocations',
  'api_keys',
  'codex_device_authorizations',
  'codex_access_tokens',
  'idempotency_requests',
  'payment_connections',
  'invoices',
  'payment_links',
  'payment_events',
  'n8n_connections',
  'n8n_deliveries',
  'n8n_nonces',
  'workspace_integrations',
  'mail_accounts',
  'integration_requests',
  'integration_connections',
  'integration_executions',
  'workspace_settings',
  'plans',
  'subscriptions',
  'workspace_builder_configs',
  'idea_boards',
  'idea_notes',
  'canvas_elements',
  'idea_canvas_scenes',
  'google_drive_tokens',
  'tenant_integration_tokens',
  'whatsapp_connections',
  'ai_conversations',
  'agent_threads',
  'agent_runs',
  'agent_steps',
  'agent_approvals',
  'agent_run_events',
  'execution_jobs',
  'execution_job_events',
  'automations',
  'automation_runs',
  'automation_run_events',
  'mail_automation_rules',
  'mail_rule_events',
  'automation_schedules',
  'clients',
  'storefront_domains',
  'projects',
  'project_tasks',
  'job_cards',
  'draft_invoices',
  'client_approvals',
  'project_comments',
  'review_package_items',
  'workspace_notifications',
  'project_links',
  'project_files',
  'review_sessions',
  'review_annotations',
  'google_drive_resource_links',
  'google_drive_selections',
  'workspace_documents',
  'artifacts',
  'artifact_links',
  'workspace_cloud_links',
  'api_request_metrics',
]

const source = new DatabaseSync(sourcePath, { readOnly: true })
const sourceTables = new Set(
  source
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .all()
    .map((row) => row.name),
)
assert(sourceTables.has('workspaces'), 'The SQLite source is not a lancee database.')

const schemaDatabase = await openDatabase({
  adminEmail: process.env.ADMIN_EMAIL,
  adminName: process.env.ADMIN_NAME || 'Workspace Admin',
  adminPasswordSalt: process.env.ADMIN_PASSWORD_SALT,
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH,
  workspaceId: process.env.WORKSPACE_ID,
  workspaceName: process.env.WORKSPACE_NAME || 'lancee Workspace',
})
await schemaDatabase.close()

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.DATABASE_URL ? undefined : process.env.PGHOST,
  port: process.env.PGPORT ? Number.parseInt(process.env.PGPORT, 10) : 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl:
    process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : undefined,
})
const client = await pool.connect()

try {
  await client.query('BEGIN')
  let insertedTotal = 0
  for (const table of tableOrder) {
    if (!sourceTables.has(table)) continue
    const rows = source.prepare(`SELECT * FROM "${table}"`).all()
    if (rows.length === 0) continue
    const destinationColumns = new Set(
      (
        await client.query(
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1`,
          [table],
        )
      ).rows.map((row) => row.column_name),
    )
    const columns = Object.keys(rows[0]).filter((column) =>
      destinationColumns.has(column),
    )
    if (columns.length === 0) continue
    const quotedColumns = columns.map((column) => `"${column}"`).join(', ')
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')
    for (const row of rows) {
      if (['tenant_integration_tokens', 'integration_connections', 'integration_executions'].includes(table)) {
        await client.query(
          `SELECT set_config('app.current_tenant_id', $1, true)`,
          [row.workspace_id],
        )
      }
      const result = await client.query(
        `INSERT INTO "${table}" (${quotedColumns})
         VALUES (${placeholders})
         ON CONFLICT DO NOTHING`,
        columns.map((column) => row[column]),
      )
      insertedTotal += result.rowCount || 0
    }
    console.log(`${table}: ${rows.length} source row(s) processed`)
  }
  await client.query('COMMIT')
  console.log(
    `SQLite migration complete: ${insertedTotal} row(s) inserted into PostgreSQL. Existing conflicting rows were preserved.`,
  )
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  source.close()
  client.release()
  await pool.end()
}
