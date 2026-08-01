import { createHash } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import pg from 'pg'

const ACTIVE_MCP_STATUSES = new Set(['available', 'pending', 'approved'])
const SENSITIVE_EVENT_KEYS = new Set([
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'api_key',
  'apikey',
  'client_secret',
  'clientsecret',
  'token',
  'bearertoken',
  'password',
  'secret',
  'auth',
  'authorization',
])

function stableId(prefix, value) {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 20)}`
}

function nowIso() {
  return new Date().toISOString()
}

function parsePermissions(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  try {
    const permissions = typeof value === 'string' ? JSON.parse(value) : value
    return Array.isArray(permissions) ? permissions : []
  } catch {
    return []
  }
}

function sanitizeStoredEvent(value) {
  if (Array.isArray(value)) return value.map(sanitizeStoredEvent)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_EVENT_KEYS.has(key.toLowerCase()))
      .map(([key, child]) => [key, sanitizeStoredEvent(child)]),
  )
}

function mapContext(row) {
  if (!row) return null
  return {
    user: {
      id: row.user_id,
      name: row.user_name,
      email: row.user_email,
      passwordSalt: row.password_salt,
      passwordHash: row.password_hash,
    },
    workspace: {
      id: row.workspace_id,
      name: row.workspace_name,
    },
    membership: {
      role: row.membership_role,
    },
  }
}

function mapApiKey(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    name: row.name,
    prefix: row.masked_prefix,
    permissions: parsePermissions(row.permissions),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  }
}

function mapPaymentLink(row) {
  if (!row) return null
  return {
    id: row.payment_link_id || row.id,
    workspaceId: row.workspace_id,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    clientName: row.client_name,
    clientEmail: row.client_email,
    projectName: row.project_name,
    description: row.description,
    amountMinor: row.amount_minor,
    currency: row.currency,
    dueDate: row.due_date,
    invoiceStatus: row.invoice_status,
    provider: row.provider,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    providerReference: row.provider_reference,
    authorizationUrl: row.authorization_url,
    accessCode: row.access_code,
    paymentStatus: row.payment_status || row.status,
    errorCode: row.error_code,
    providerTransactionId: row.provider_transaction_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paidAt: row.paid_at,
  }
}

function mapN8nDelivery(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    direction: row.direction,
    method: row.method,
    targetUrl: row.target_url,
    correlationId: row.correlation_id,
    nonce: row.nonce,
    requestHash: row.request_hash,
    bodyHash: row.body_hash,
    eventType: row.event_type,
    event: typeof row.event_json === 'string' ? JSON.parse(row.event_json) : row.event_json,
    status: row.status,
    responseStatus: row.response_status,
    duration: row.duration_ms,
    errorCode: row.error_code,
    attemptNumber: row.attempt_number,
    retryOf: row.retry_of,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }
}

function mapIdeaNote(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    boardId: row.board_id,
    content: row.content,
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapAutomation(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    accent: row.accent,
    status: row.status,
    model: row.model,
    execution: row.execution || 'core',
    runs: row.runs,
    successRate: row.success_rate,
    lastRun: row.last_run_at || 'Not run yet',
    tools: parsePermissions(row.tools_json),
  }
}

function mapAutomationRun(row) {
  if (!row) return null
  return {
    id: row.id,
    automationId: row.automation_id,
    automationName: row.automation_name || '',
    instruction: row.instruction,
    status: row.status,
    startedAt: row.started_at,
    durationSeconds: row.duration_seconds,
    duration: row.duration_seconds ? `${row.duration_seconds}s` : '—',
    steps: row.steps,
    errorCode: row.error_code,
    completedAt: row.completed_at,
  }
}

function mapDraftInvoice(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    clientId: row.client_id,
    invoiceNumber: row.invoice_number,
    clientName: row.client_name,
    clientEmail: row.client_email,
    projectName: row.project_name,
    description: row.description,
    amountMinor: Number(row.amount_minor || 0),
    currency: row.currency,
    dueDate: row.due_date,
    status: row.status,
    paymentUrl: row.payment_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at,
  }
}

function mapApproval(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    jobCardId: row.job_card_id,
    clientId: row.client_id,
    clientName: row.client_name,
    clientEmail: row.client_email,
    projectName: row.project_name,
    status: row.status,
    title: row.title,
    body: row.body,
    comment: row.comment,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    reviewUrl: row.review_url,
  }
}

function parseAnnotationJson(value) {
  if (typeof value !== 'string') return value || null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function mapReviewAnnotation(row) {
  if (!row) return null
  const annotation = parseAnnotationJson(row.annotation_json)
  return {
    id: row.id,
    artworkId: row.artwork_file_id,
    reviewId: row.review_id,
    annotation,
    geometry: annotation?.target?.selector || null,
    comment: row.comment || '',
    priority: row.priority,
    category: row.category,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapReview(row, annotations = []) {
  if (!row) return null
  const artwork = row.artwork_file_id
    ? {
        id: row.artwork_file_id,
        name: row.artwork_name,
        mimeType: row.artwork_mime_type,
        size: Number(row.artwork_size || 0),
        imageUrl: '',
      }
    : null
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    clientName: row.client_name,
    artworkId: row.artwork_file_id,
    artworkVersionId: row.artwork_file_id,
    artwork,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    closedAt: row.closed_at,
    annotations,
  }
}

function mapProjectComment(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    approvalId: row.approval_id,
    authorType: row.author_type,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
  }
}

function mapNotification(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    entityType: row.entity_type,
    entityId: row.entity_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  }
}

/**
 * Creates/opens a PostgreSQL database connection layer.
 * Connects to external Postgres if DATABASE_URL/PGHOST is supplied, otherwise
 * uses the configured SQLite path. pg-mem remains a no-path development fallback.
 */
export async function openDatabase({
  databasePath,
  adminEmail,
  adminName,
  adminPasswordSalt,
  adminPasswordHash,
  workspaceId = 'wsp_primary',
  workspaceName = 'Hookitup Solutions',
}) {
  let isInMemory = true
  let isSqlite = false
  let pgInstance = null
  let executeSync = null
  const transactionStorage = new AsyncLocalStorage()
  let queryCount = 0
  let totalQueryDurationMs = 0

  if (process.env.DATABASE_URL || process.env.PGHOST) {
    const configuredPoolMax = Number.parseInt(process.env.PGPOOL_MAX || '20', 10)
    const configuredIdleTimeout = Number.parseInt(
      process.env.PGIDLE_TIMEOUT_MS || '30000',
      10,
    )
    const configuredConnectTimeout = Number.parseInt(
      process.env.PGCONNECT_TIMEOUT_MS || '5000',
      10,
    )
    pgInstance = new pg.Pool({
      connectionString: process.env.DATABASE_URL || undefined,
      host: process.env.DATABASE_URL ? undefined : process.env.PGHOST,
      port: process.env.PGPORT ? Number.parseInt(process.env.PGPORT, 10) : 5432,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      max: Number.isFinite(configuredPoolMax)
        ? Math.min(100, Math.max(1, configuredPoolMax))
        : 20,
      idleTimeoutMillis: Number.isFinite(configuredIdleTimeout)
        ? Math.max(1_000, configuredIdleTimeout)
        : 30_000,
      connectionTimeoutMillis: Number.isFinite(configuredConnectTimeout)
        ? Math.max(250, configuredConnectTimeout)
        : 5_000,
      ssl:
        process.env.DATABASE_SSL === 'true'
          ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
          : undefined,
    })
    isInMemory = false
  }

  if (isInMemory && databasePath) {
    isInMemory = false
    isSqlite = true
    mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 })
    pgInstance = new DatabaseSync(databasePath)
    pgInstance.exec('PRAGMA foreign_keys = ON')
    pgInstance.exec('PRAGMA journal_mode = WAL')
    pgInstance.exec('PRAGMA busy_timeout = 5000')
    chmodSync(databasePath, 0o600)
  }

  if (isInMemory) {
    const { newDb } = await import('pg-mem')
    const memDb = newDb()
    pgInstance = memDb

    executeSync = (sql, params = []) => {
      const replacedSql = sql.replace(/\$(\d+)/g, (_, number) => {
        const val = params[parseInt(number, 10) - 1]
        if (val === null || val === undefined) return 'NULL'
        if (typeof val === 'number') return String(val)
        if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
        return `'${String(val).replace(/'/g, "''")}'`
      })

      const cleanSql = replacedSql.trim()
      if (cleanSql.toUpperCase().startsWith('SELECT') || cleanSql.toUpperCase().startsWith('WITH')) {
        return memDb.public.many(cleanSql)
      } else {
        memDb.public.none(cleanSql)
        return []
      }
    }
  }

  const query = async (sql, params = []) => {
    const startedAt = performance.now()
    try {
      if (isInMemory) {
        return executeSync(sql, params)
      } else if (isSqlite) {
        const statement = pgInstance.prepare(sql)
        const bindings = Object.fromEntries(
          params.map((value, index) => [`$${index + 1}`, value]),
        )
        if (
          /^(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql.trim()) ||
          /\bRETURNING\b/i.test(sql)
        ) {
          return statement.all(bindings)
        }
        statement.run(bindings)
        return []
      } else {
        const client = transactionStorage.getStore() || pgInstance
        const result = await client.query(sql, params)
        return result.rows
      }
    } finally {
      queryCount += 1
      totalQueryDurationMs += performance.now() - startedAt
    }
  }

  // Define PostgreSQL Schema
  const schemaSqls = [
    `CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      disabled_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS registration_confirmations (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      workspace_name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'collaborator', 'viewer')),
      created_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS team_invitations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      invited_by TEXT NOT NULL REFERENCES users(id),
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner', 'collaborator', 'viewer')),
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, email)
    )`,
    `CREATE TABLE IF NOT EXISTS mcp_access (
      workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'pending', 'approved')),
      requested_at TEXT,
      approved_at TEXT,
      revoked_at TEXT,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS mcp_invocations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      service_id TEXT NOT NULL,
      tool_id TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS mcp_service_state (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      service_id TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, service_id)
    )`,
    `CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      created_by TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      masked_prefix TEXT NOT NULL,
      secret_hash TEXT NOT NULL UNIQUE,
      permissions TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS codex_device_authorizations (
      device_code_hash TEXT PRIMARY KEY,
      user_code_hash TEXT NOT NULL UNIQUE,
      client_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'denied', 'consumed')),
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      approved_at TEXT,
      consumed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS codex_access_tokens (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      created_by TEXT NOT NULL REFERENCES users(id),
      client_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      scopes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS idempotency_requests (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      route TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      response_status INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, route, idempotency_key)
    )`,
    `CREATE TABLE IF NOT EXISTS payment_connections (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('unconfigured', 'configured')),
      mode TEXT NOT NULL CHECK (mode IN ('none', 'test', 'live')),
      credential_source TEXT NOT NULL,
      key_fingerprint TEXT,
      secret_ciphertext TEXT,
      configured_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, provider)
    )`,
    `ALTER TABLE payment_connections ADD COLUMN IF NOT EXISTS secret_ciphertext TEXT`,
    `CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      invoice_number TEXT NOT NULL,
      client_name TEXT NOT NULL,
      client_email TEXT NOT NULL,
      project_name TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
      currency TEXT NOT NULL,
      due_date TEXT,
      status TEXT NOT NULL CHECK (status IN ('initializing', 'pending', 'paid', 'failed')),
      provider TEXT NOT NULL,
      provider_reference TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      paid_at TEXT,
      UNIQUE (workspace_id, invoice_number)
    )`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_url TEXT`,
    `CREATE TABLE IF NOT EXISTS payment_links (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      provider_reference TEXT NOT NULL UNIQUE,
      authorization_url TEXT,
      access_code TEXT,
      status TEXT NOT NULL CHECK (status IN ('initializing', 'pending', 'paid', 'failed')),
      error_code TEXT,
      provider_transaction_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      paid_at TEXT,
      UNIQUE (workspace_id, provider, idempotency_key)
    )`,
    `CREATE TABLE IF NOT EXISTS payment_events (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      event_key TEXT NOT NULL,
      event_type TEXT NOT NULL,
      provider_reference TEXT,
      payload_hash TEXT NOT NULL,
      result TEXT NOT NULL,
      received_at TEXT NOT NULL,
      processed_at TEXT,
      UNIQUE (provider, event_key)
    )`,
    `CREATE TABLE IF NOT EXISTS n8n_connections (
      workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('connected', 'disconnected')),
      outbound_url TEXT,
      callback_path TEXT NOT NULL,
      methods TEXT NOT NULL,
      secret_ciphertext TEXT,
      secret_iv TEXT,
      secret_tag TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_delivery_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS n8n_deliveries (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
      method TEXT NOT NULL CHECK (method IN ('GET', 'POST')),
      target_url TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      nonce TEXT,
      request_hash TEXT NOT NULL,
      body_hash TEXT,
      event_type TEXT NOT NULL,
      event_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'accepted', 'rejected')),
      response_status INTEGER,
      duration_ms INTEGER,
      error_code TEXT,
      attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
      retry_of TEXT REFERENCES n8n_deliveries(id),
      idempotency_key TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE (workspace_id, direction, idempotency_key)
    )`,
    `CREATE TABLE IF NOT EXISTS n8n_nonces (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      nonce TEXT NOT NULL,
      timestamp_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, nonce)
    )`,
    `CREATE TABLE IF NOT EXISTS workspace_integrations (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      integration_id TEXT NOT NULL,
      connected INTEGER NOT NULL DEFAULT 0 CHECK (connected IN (0, 1)),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, integration_id)
    )`,
    `CREATE TABLE IF NOT EXISTS integration_requests (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      requested_by TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('Automation', 'Communication', 'Design', 'Payments', 'Storage', 'Other')),
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'planned', 'declined')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workspace_settings (
      workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      logo_url TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      timezone TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
      travel_mode TEXT NOT NULL DEFAULT 'none',
      travel_location TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS idea_notes (
      id TEXT NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      board_id TEXT NOT NULL,
      content TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, id)
    )`,
    `CREATE TABLE IF NOT EXISTS idea_boards (
      id TEXT NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, id)
    )`,
    `CREATE TABLE IF NOT EXISTS canvas_elements (
      id TEXT NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      board_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      x REAL NOT NULL DEFAULT 0,
      y REAL NOT NULL DEFAULT 0,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, id)
    )`,
    `CREATE TABLE IF NOT EXISTS idea_canvas_scenes (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      board_id TEXT NOT NULL,
      scene_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, board_id)
    )`,
    `CREATE TABLE IF NOT EXISTS google_drive_tokens (
      workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at TEXT NOT NULL,
      token_type TEXT NOT NULL DEFAULT 'Bearer',
      scope TEXT,
      connected_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS tenant_integration_tokens (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      provider VARCHAR(50) NOT NULL,
      encrypted_access_token TEXT NOT NULL,
      encrypted_refresh_token TEXT,
      token_type VARCHAR(20) DEFAULT 'Bearer',
      expires_at TEXT,
      iv VARCHAR(64) NOT NULL,
      auth_tag VARCHAR(64) NOT NULL,
      refresh_iv VARCHAR(64),
      refresh_auth_tag VARCHAR(64),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, provider)
    )`,
    `ALTER TABLE tenant_integration_tokens ADD COLUMN IF NOT EXISTS refresh_iv TEXT`,
    `ALTER TABLE tenant_integration_tokens ADD COLUMN IF NOT EXISTS refresh_auth_tag TEXT`,
    `CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      thread_id TEXT,
      title TEXT,
      model TEXT NOT NULL,
      messages_json TEXT NOT NULL,
      tokens_used INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS automations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      created_by TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'sparkles',
      accent TEXT NOT NULL DEFAULT 'lime',
      model TEXT NOT NULL DEFAULT 'Rules + connected tools',
      execution TEXT NOT NULL DEFAULT 'core' CHECK (execution IN ('core', 'edge')),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'paused', 'draft')),
      tools_json TEXT NOT NULL DEFAULT '[]',
      runs INTEGER NOT NULL DEFAULT 0,
      success_rate REAL NOT NULL DEFAULT 0,
      last_run_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `ALTER TABLE automations ADD COLUMN IF NOT EXISTS execution TEXT NOT NULL DEFAULT 'core'`,
    `CREATE TABLE IF NOT EXISTS automation_runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
      triggered_by TEXT NOT NULL REFERENCES users(id),
      instruction TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
      started_at TEXT NOT NULL,
      duration_seconds INTEGER,
      steps INTEGER DEFAULT 1,
      error_code TEXT,
      completed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS automation_run_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warning', 'error')),
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      tool_id TEXT,
      input_json TEXT,
      output_json TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL,
      UNIQUE (run_id, sequence)
    )`,
    `CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, name)
    )`,
    `CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      client TEXT NOT NULL,
      scope TEXT NOT NULL,
      due TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('In progress', 'In review', 'Waiting on client', 'Ready')),
      progress INTEGER NOT NULL DEFAULT 0,
      accent TEXT NOT NULL DEFAULT '#6854e8',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES clients(id) ON DELETE SET NULL`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS board_id TEXT`,
    `CREATE TABLE IF NOT EXISTS job_cards (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'client_review', 'approved', 'done')),
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, project_id)
    )`,
    `CREATE TABLE IF NOT EXISTS draft_invoices (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
      invoice_number TEXT NOT NULL,
      client_name TEXT NOT NULL,
      client_email TEXT NOT NULL DEFAULT '',
      project_name TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
      currency TEXT NOT NULL DEFAULT 'ZAR',
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready_for_review', 'sent')),
      payment_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sent_at TEXT,
      UNIQUE (workspace_id, project_id)
    )`,
    `CREATE TABLE IF NOT EXISTS client_approvals (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      job_card_id TEXT NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
      client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
      token_hash TEXT NOT NULL UNIQUE,
      client_name TEXT NOT NULL,
      client_email TEXT NOT NULL,
      project_name TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'commented', 'approved')),
      comment TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      responded_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS project_comments (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      approval_id TEXT REFERENCES client_approvals(id) ON DELETE SET NULL,
      author_type TEXT NOT NULL CHECK (author_type IN ('workspace', 'client')),
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workspace_notifications (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS project_links (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS project_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size INTEGER NOT NULL DEFAULT 0,
      storage_key TEXT NOT NULL,
      content_base64 TEXT,
      content_sha256 TEXT,
      created_at TEXT NOT NULL
    )`,
    `ALTER TABLE project_files ADD COLUMN IF NOT EXISTS content_base64 TEXT`,
    `ALTER TABLE project_files ADD COLUMN IF NOT EXISTS content_sha256 TEXT`,
    `CREATE TABLE IF NOT EXISTS review_sessions (
      id TEXT PRIMARY KEY,
      approval_id TEXT NOT NULL UNIQUE REFERENCES client_approvals(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      artwork_file_id TEXT REFERENCES project_files(id) ON DELETE SET NULL,
      client_token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'submitted', 'closed')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      submitted_at TEXT,
      closed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS review_annotations (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
      artwork_file_id TEXT REFERENCES project_files(id) ON DELETE SET NULL,
      annotation_json TEXT NOT NULL,
      comment TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
      category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('design', 'typography', 'spacing', 'color', 'content', 'other')),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'rejected')),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS google_drive_resource_links (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      drive_file_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      web_view_link TEXT,
      resource_kind TEXT NOT NULL CHECK (resource_kind IN ('folder', 'file')),
      client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (client_id IS NOT NULL OR project_id IS NOT NULL)
    )`,
    `CREATE TABLE IF NOT EXISTS workspace_documents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size INTEGER NOT NULL DEFAULT 0,
      content_base64 TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      drive_file_id TEXT,
      drive_web_view_link TEXT,
      synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workspace_cloud_links (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('drive', 'dropbox', 'onedrive', 'box', 'other')),
      label TEXT NOT NULL DEFAULT '',
      folder_url TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS api_request_metrics (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      metric_date TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, metric_date)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_automation_runs_workspace_started
      ON automation_runs (workspace_id, started_at)`,
    `CREATE INDEX IF NOT EXISTS idx_automation_run_events_run_sequence
      ON automation_run_events (run_id, sequence)`,
    `CREATE INDEX IF NOT EXISTS idx_project_comments_workspace_project
      ON project_comments (workspace_id, project_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_workspace_notifications_unread
      ON workspace_notifications (workspace_id, read_at, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_projects_workspace_status
      ON projects (workspace_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_clients_workspace_name
      ON clients (workspace_id, name)`,
    `CREATE INDEX IF NOT EXISTS idx_drive_resource_links_client
      ON google_drive_resource_links (workspace_id, client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_drive_resource_links_project
      ON google_drive_resource_links (workspace_id, project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_invoices_workspace_status
      ON invoices (workspace_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_idempotency_expiry
      ON idempotency_requests (expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_n8n_deliveries_workspace_created
      ON n8n_deliveries (workspace_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_team_invitations_token
      ON team_invitations (token_hash, status)`,
    `CREATE INDEX IF NOT EXISTS idx_codex_device_user_code
      ON codex_device_authorizations (user_code_hash, status)`,
    `CREATE INDEX IF NOT EXISTS idx_codex_access_token
      ON codex_access_tokens (token_hash, revoked_at)`,
  ]

  for (const statement of schemaSqls) {
    try {
      await query(statement)
    } catch (error) {
      if (!isSqlite || !/ALTER TABLE .* ADD COLUMN IF NOT EXISTS/i.test(statement)) {
        throw error
      }
      try {
        await query(statement.replace(/ ADD COLUMN IF NOT EXISTS/i, ' ADD COLUMN'))
      } catch (migrationError) {
        if (!/duplicate column name/i.test(String(migrationError))) throw migrationError
      }
    }
  }

  if (!isInMemory && !isSqlite) {
    await query(
      `ALTER TABLE tenant_integration_tokens ENABLE ROW LEVEL SECURITY`,
    )
    await query(
      `ALTER TABLE tenant_integration_tokens FORCE ROW LEVEL SECURITY`,
    )
    await query(
      `DROP POLICY IF EXISTS tenant_isolation_policy ON tenant_integration_tokens`,
    )
    await query(
      `CREATE POLICY tenant_isolation_policy ON tenant_integration_tokens
         FOR ALL
         USING (workspace_id = current_setting('app.current_tenant_id', true))
         WITH CHECK (workspace_id = current_setting('app.current_tenant_id', true))`,
    )
  }

  if (isSqlite) {
    const roleTables = await query(
      `SELECT name, sql FROM sqlite_master
       WHERE type = 'table' AND name IN ('workspace_members', 'team_invitations')`,
    )
    if (roleTables.some((row) => !String(row.sql || '').includes("'viewer'"))) {
      await query('PRAGMA foreign_keys = OFF')
      try {
        await query('BEGIN IMMEDIATE')
        await query('ALTER TABLE workspace_members RENAME TO workspace_members_role_legacy')
        await query(
          `CREATE TABLE workspace_members (
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK (role IN ('owner', 'collaborator', 'viewer')),
            created_at TEXT NOT NULL,
            PRIMARY KEY (workspace_id, user_id)
          )`,
        )
        await query(
          `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
           SELECT workspace_id, user_id, role, created_at FROM workspace_members_role_legacy`,
        )
        await query('DROP TABLE workspace_members_role_legacy')
        await query('ALTER TABLE team_invitations RENAME TO team_invitations_role_legacy')
        await query(
          `CREATE TABLE team_invitations (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            invited_by TEXT NOT NULL REFERENCES users(id),
            email TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('owner', 'collaborator', 'viewer')),
            token_hash TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
            expires_at TEXT NOT NULL,
            accepted_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE (workspace_id, email)
          )`,
        )
        await query(
          `INSERT INTO team_invitations (
             id, workspace_id, invited_by, email, name, role, token_hash, status,
             expires_at, accepted_at, created_at, updated_at
           )
           SELECT id, workspace_id, invited_by, email, name, role, token_hash, status,
             expires_at, accepted_at, created_at, updated_at
           FROM team_invitations_role_legacy`,
        )
        await query('DROP TABLE team_invitations_role_legacy')
        await query(
          `CREATE INDEX IF NOT EXISTS idx_team_invitations_token
           ON team_invitations (token_hash, status)`,
        )
        await query('COMMIT')
      } catch (error) {
        await query('ROLLBACK').catch(() => undefined)
        throw error
      } finally {
        await query('PRAGMA foreign_keys = ON')
      }
    }
  } else {
    await query(`ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check`)
    await query(
      `ALTER TABLE workspace_members
       ADD CONSTRAINT workspace_members_role_check
       CHECK (role IN ('owner', 'collaborator', 'viewer'))`,
    )
    await query(`ALTER TABLE team_invitations DROP CONSTRAINT IF EXISTS team_invitations_role_check`)
    await query(
      `ALTER TABLE team_invitations
       ADD CONSTRAINT team_invitations_role_check
       CHECK (role IN ('owner', 'collaborator', 'viewer'))`,
    )
  }

  await query(
    `INSERT INTO workspace_integrations (
       workspace_id, integration_id, connected, updated_at
     )
     SELECT id, 'codex-ai', 0, $1 FROM workspaces WHERE 1 = 1
     ON CONFLICT (workspace_id, integration_id) DO NOTHING`,
    [nowIso()],
  )
  await query(
    `INSERT INTO workspace_integrations (
       workspace_id, integration_id, connected, updated_at
     )
     SELECT id, 'codex-runtime', 0, $1 FROM workspaces WHERE 1 = 1
     ON CONFLICT (workspace_id, integration_id) DO NOTHING`,
    [nowIso()],
  )

  if (isSqlite) {
    pgInstance.exec(`
      CREATE TRIGGER IF NOT EXISTS invoices_provider_reference_immutable
      BEFORE UPDATE OF provider_reference ON invoices
      WHEN OLD.provider_reference <> NEW.provider_reference
      BEGIN
        SELECT RAISE(ABORT, 'invoice provider reference is immutable');
      END
    `)
  } else if (!isInMemory) {
    const constraints = await query(
      `SELECT 1
       FROM pg_constraint
       WHERE conname = 'payment_links_invoice_provider_reference_fk'`,
    )
    if (constraints.length === 0) {
      await query(
        `ALTER TABLE payment_links
         ADD CONSTRAINT payment_links_invoice_provider_reference_fk
         FOREIGN KEY (provider_reference)
         REFERENCES invoices(provider_reference)
         ON UPDATE RESTRICT`,
      )
    }
  }

  const TABLE_NAMES = schemaSqls.map((sql) => {
    const m = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)
    return m ? m[1] : null
  }).filter(Boolean)

  const dumpFilePath = databasePath && !databasePath.endsWith('.sqlite')
    ? databasePath + '.pgmem.json'
    : join(dirname(databasePath || '.'), '.lancee.pgmem.json')

  async function dumpAllTables() {
    if (!isInMemory) return
    const dump = {}
    for (const name of TABLE_NAMES) {
      try {
        dump[name] = await query(`SELECT * FROM ${name}`)
      } catch { dump[name] = [] }
    }
    try {
      writeFileSync(dumpFilePath, JSON.stringify(dump), 'utf8')
    } catch { /* persistence is best-effort */ }
  }

  async function restoreFromDump() {
    if (!isInMemory || !existsSync(dumpFilePath)) return false
    try {
      const dump = JSON.parse(readFileSync(dumpFilePath, 'utf8'))
      for (const name of [...TABLE_NAMES].reverse()) {
        const rows = dump[name]
        if (!rows || rows.length === 0) continue
        try {
          await query(`DELETE FROM ${name}`)
        } catch { /* ignore FK issues during clear */ }
      }
      for (const name of TABLE_NAMES) {
        const rows = dump[name]
        if (!rows || rows.length === 0) continue
        for (const row of rows) {
          const cols = Object.keys(row)
          const vals = cols.map((c) => row[c])
          try {
            await query(
              `INSERT INTO ${name} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
              vals.map((v) => (v === null || v === undefined ? null : v)),
            )
          } catch { /* skip duplicate keys */ }
        }
      }
      return true
    } catch {
      return false
    }
  }

  const restored = await restoreFromDump()

  if (restored) {
    // Fix n8n_deliveries self-references (retry_of FK)
    const deliveries = await query('SELECT id, retry_of FROM n8n_deliveries WHERE retry_of IS NOT NULL')
    for (const d of deliveries) {
      try {
        await query('UPDATE n8n_deliveries SET retry_of = $1 WHERE id = $2', [d.retry_of, d.id])
      } catch { /* skip invalid refs */ }
    }
  }

  if (!restored) {
    // Seed default admin user & workspace if absent
    const createdAt = nowIso()
  const normalizedAdminEmail = adminEmail.trim().toLowerCase()
  const adminUserId = stableId('usr', normalizedAdminEmail)

  await query(
    `INSERT INTO workspaces (id, name, created_at, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(id) DO NOTHING`,
    [workspaceId, workspaceName, createdAt, createdAt],
  )

  await query(
    `INSERT INTO users (id, email, name, password_salt, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(email) DO UPDATE SET
       name = EXCLUDED.name,
       password_salt = EXCLUDED.password_salt,
       password_hash = EXCLUDED.password_hash,
       updated_at = EXCLUDED.updated_at`,
    [adminUserId, normalizedAdminEmail, adminName, adminPasswordSalt, adminPasswordHash, createdAt, createdAt],
  )

  await query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
     VALUES ($1, $2, 'owner', $3)
     ON CONFLICT(workspace_id, user_id) DO NOTHING`,
    [workspaceId, adminUserId, createdAt],
  )

  await query(
    `INSERT INTO mcp_access (workspace_id, status, updated_at)
     VALUES ($1, 'available', $2)
     ON CONFLICT(workspace_id) DO NOTHING`,
    [workspaceId, createdAt],
  )

  const defaultIntegrations = [
    { id: 'drive', connected: 0 },
    { id: 'paystack', connected: 0 },
    { id: 'n8n', connected: 0 },
    { id: 'mcp-grid', connected: 0 },
    { id: 'codex-ai', connected: 0 },
    { id: 'codex-runtime', connected: 0 },
  ]
  for (const integration of defaultIntegrations) {
    await query(
      `INSERT INTO workspace_integrations (workspace_id, integration_id, connected, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(workspace_id, integration_id) DO NOTHING`,
      [workspaceId, integration.id, integration.connected, createdAt],
    )
  }

  const seedDemoData = process.env.SEED_DEMO_DATA === 'true'
  const defaultAutomations = seedDemoData ? [
    { id: 'aut_feedback', name: 'Proof feedback organiser', description: 'Collects client comments and turns them into one tidy revision checklist.', icon: 'messages', accent: 'lime', model: 'Rules + connected tools' },
    { id: 'aut_invoice', name: 'Friendly invoice follow-up', description: 'Reminds clients when an invoice is due, using your wording and timing.', icon: 'file', accent: 'violet', model: 'Scheduled workflow' },
    { id: 'aut_handoff', name: 'Final artwork handoff', description: 'Copies approved files into the client folder and prepares the delivery note.', icon: 'layers', accent: 'blue', model: 'Rules + connected tools' },
    { id: 'aut_brief', name: 'Brief tidy-up', description: 'Optionally turns scattered client notes into a brief you can edit and approve.', icon: 'sparkles', accent: 'coral', model: 'AI-assisted, with review' },
  ] : []
  for (const automation of defaultAutomations) {
    await query(
      `INSERT INTO automations (id, workspace_id, created_by, name, description, icon, accent, model, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10)
       ON CONFLICT(id) DO NOTHING`,
      [automation.id, workspaceId, adminUserId, automation.name, automation.description, automation.icon, automation.accent, automation.model, createdAt, createdAt],
    )
  }

  await query(
    `INSERT INTO workspace_settings (workspace_id, name, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT(workspace_id) DO NOTHING`,
    [workspaceId, workspaceName, createdAt],
  )

  const defaultProjects = seedDemoData ? [
    { id: 'prj_ember', name: 'Kalahari Ember Gin', client: 'Copper Still Co.', scope: 'Bottle label · neck tag · print handoff', due: '03 Aug', status: 'In review', progress: 72, accent: '#d86f42' },
    { id: 'prj_nomad', name: 'Nomad Cane Rum', client: 'Highveld Spirits', scope: 'Identity refresh · bottle · carton', due: '08 Aug', status: 'In progress', progress: 46, accent: '#8c684c' },
    { id: 'prj_juniper', name: 'Juniper No. 7', client: 'Blue Dune Imports', scope: 'Export label adaptation · compliance copy', due: '12 Aug', status: 'Waiting on client', progress: 64, accent: '#647d68' },
    { id: 'prj_citrus', name: 'Cape Citrus Aperitif', client: 'Sunday Service Studio', scope: 'Launch pack · social assets · sell sheet', due: '18 Aug', status: 'Ready', progress: 92, accent: '#d6a536' },
  ] : []
  for (const project of defaultProjects) {
    await query(
      `INSERT INTO projects (id, workspace_id, name, client, scope, due, status, progress, accent, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT(id) DO NOTHING`,
      [project.id, workspaceId, project.name, project.client, project.scope, project.due, project.status, project.progress, project.accent, createdAt, createdAt],
    )
  }

  await dumpAllTables()
  }

  // Preserve legacy projects that stored only a client name by promoting those
  // names to first-class client records and linking the project automatically.
  const legacyProjectClients = await query(
    `SELECT DISTINCT workspace_id, client
     FROM projects
     WHERE client_id IS NULL AND TRIM(client) <> ''`,
  )
  for (const legacy of legacyProjectClients) {
    const clientId = stableId(
      'clt',
      `${legacy.workspace_id}:${String(legacy.client).trim().toLowerCase()}`,
    )
    const timestamp = nowIso()
    await query(
      `INSERT INTO clients (
         id, workspace_id, name, email, company, status, notes, created_at, updated_at
       ) VALUES ($1, $2, $3, '', '', 'active', '', $4, $5)
       ON CONFLICT(id) DO NOTHING`,
      [clientId, legacy.workspace_id, String(legacy.client).trim(), timestamp, timestamp],
    )
    await query(
      `UPDATE projects
       SET client_id = $1
       WHERE workspace_id = $2 AND client_id IS NULL AND LOWER(client) = LOWER($3)`,
      [clientId, legacy.workspace_id, String(legacy.client).trim()],
    )
  }

  async function getClientById(selectedWorkspaceId, clientId) {
    const rows = await query(
      `SELECT * FROM clients WHERE workspace_id = $1 AND id = $2`,
      [selectedWorkspaceId, clientId],
    )
    return rows[0] || null
  }

  async function ensureClient({ selectedWorkspaceId, clientId, name }) {
    if (clientId) {
      const existing = await getClientById(selectedWorkspaceId, clientId)
      if (existing) return existing
    }
    const normalizedName = String(name || '').trim()
    const matches = await query(
      `SELECT * FROM clients
       WHERE workspace_id = $1 AND LOWER(name) = LOWER($2)
       LIMIT 1`,
      [selectedWorkspaceId, normalizedName],
    )
    if (matches[0]) return matches[0]
    const timestamp = nowIso()
    const id = stableId(
      'clt',
      `${selectedWorkspaceId}:${normalizedName.toLowerCase()}`,
    )
    await query(
      `INSERT INTO clients (
         id, workspace_id, name, email, company, status, notes, created_at, updated_at
       ) VALUES ($1, $2, $3, '', '', 'active', '', $4, $5)
       ON CONFLICT(id) DO NOTHING`,
      [id, selectedWorkspaceId, normalizedName, timestamp, timestamp],
    )
    return await getClientById(selectedWorkspaceId, id)
  }

  return {
    path: databasePath,
    provider: 'postgresql',
    isInMemory,

    async query(sql, params) {
      return await query(sql, params)
    },

    async close() {
      try { await dumpAllTables() } catch { /* best-effort */ }
      if (isSqlite && pgInstance) {
        pgInstance.close()
      } else if (!isInMemory && pgInstance) {
        await pgInstance.end?.()
      }
    },

    async transaction(operation) {
      if (isSqlite) {
        await query('BEGIN IMMEDIATE')
        try {
          const result = await operation()
          await query('COMMIT')
          return result
        } catch (error) {
          await query('ROLLBACK')
          throw error
        }
      }
      if (isInMemory) {
        await query('BEGIN')
        try {
          const result = await operation()
          await query('COMMIT')
          return result
        } catch (error) {
          await query('ROLLBACK')
          throw error
        }
      }

      const existingClient = transactionStorage.getStore()
      if (existingClient) return await operation()

      const client = await pgInstance.connect()
      try {
        await client.query('BEGIN')
        const result = await transactionStorage.run(client, operation)
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    async runAsTenant(workspaceId, operation) {
      if (isSqlite || isInMemory) return await operation()

      const existingClient = transactionStorage.getStore()
      if (existingClient) {
        const previousResult = await existingClient.query(
          `SELECT current_setting('app.current_tenant_id', true) AS tenant_id`,
        )
        const previousTenantId = previousResult.rows[0]?.tenant_id || ''
        await existingClient.query(
          `SELECT set_config('app.current_tenant_id', $1, true)`,
          [workspaceId],
        )
        try {
          return await operation()
        } finally {
          await existingClient.query(
            `SELECT set_config('app.current_tenant_id', $1, true)`,
            [previousTenantId],
          )
        }
      }

      const client = await pgInstance.connect()
      try {
        await client.query('BEGIN')
        await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [
          workspaceId,
        ])
        const result = await transactionStorage.run(client, operation)
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    async getDatabaseInfo() {
      const startedAt = performance.now()
      let version = 'PostgreSQL compatible'
      if (isSqlite) {
        const rows = await query('SELECT sqlite_version() AS version')
        version = rows[0]?.version ? `SQLite ${rows[0].version}` : 'SQLite'
      } else if (!isInMemory) {
        const rows = await query('SHOW server_version')
        version = rows[0]?.server_version
          ? `PostgreSQL ${rows[0].server_version}`
          : 'PostgreSQL'
      }
      const probeLatencyMs = Math.round((performance.now() - startedAt) * 100) / 100
      return {
        provider: isSqlite ? 'SQLite' : 'PostgreSQL',
        mode: isInMemory
          ? 'PostgreSQL (In-Memory Engine)'
          : isSqlite
            ? 'SQLite (Durable File)'
            : 'PostgreSQL (Cluster / Server)',
        version,
        status: 'Connected & Operational',
        tablesCount: TABLE_NAMES.length,
        averageQueryLatencyMs:
          queryCount > 0
            ? Math.round((totalQueryDurationMs / queryCount) * 100) / 100
            : probeLatencyMs,
        queryCount,
      }
    },

    async lockIdempotency(selectedWorkspaceId, route, key) {
      if (isSqlite || isInMemory) return
      await query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `${selectedWorkspaceId}:${route}:${key}`,
      ])
    },

    async getContextByEmail(email) {
      const rows = await query(
        `SELECT
           users.id AS user_id,
           users.name AS user_name,
           users.email AS user_email,
           users.password_salt,
           users.password_hash,
           workspaces.id AS workspace_id,
           workspaces.name AS workspace_name,
           workspace_members.role AS membership_role
         FROM users
         JOIN workspace_members ON workspace_members.user_id = users.id
         JOIN workspaces ON workspaces.id = workspace_members.workspace_id
         WHERE lower(users.email) = lower($1) AND users.disabled_at IS NULL
         ORDER BY workspace_members.created_at ASC
         LIMIT 1`,
        [email.trim()],
      )
      return mapContext(rows[0])
    },

    async getContextByIds(userId, selectedWorkspaceId) {
      const rows = await query(
        `SELECT
           users.id AS user_id,
           users.name AS user_name,
           users.email AS user_email,
           users.password_salt,
           users.password_hash,
           workspaces.id AS workspace_id,
           workspaces.name AS workspace_name,
           workspace_members.role AS membership_role
         FROM users
         JOIN workspace_members ON workspace_members.user_id = users.id
         JOIN workspaces ON workspaces.id = workspace_members.workspace_id
         WHERE users.id = $1
           AND workspaces.id = $2
           AND users.disabled_at IS NULL
         LIMIT 1`,
        [userId, selectedWorkspaceId],
      )
      return mapContext(rows[0])
    },

    async getMcpAccess(selectedWorkspaceId) {
      const rows = await query(
        `SELECT status, requested_at, approved_at, revoked_at, updated_at
         FROM mcp_access
         WHERE workspace_id = $1`,
        [selectedWorkspaceId],
      )
      const row = rows[0]
      if (!row || !ACTIVE_MCP_STATUSES.has(row.status)) {
        throw new Error('Workspace MCP access state is unavailable.')
      }
      return {
        status: row.status,
        requestedAt: row.requested_at,
        approvedAt: row.approved_at,
        revokedAt: row.revoked_at,
        updatedAt: row.updated_at,
      }
    },

    async setMcpAccess(selectedWorkspaceId, status, timestamp = nowIso()) {
      if (!ACTIVE_MCP_STATUSES.has(status)) {
        throw new Error('Invalid MCP access state.')
      }
      const requestedAt = status === 'available' ? null : timestamp
      const approvedAt = status === 'approved' ? timestamp : null
      const revokedAt = status === 'available' ? timestamp : null
      await query(
        `UPDATE mcp_access SET
           status = $1,
           requested_at = $2,
           approved_at = $3,
           revoked_at = $4,
           updated_at = $5
         WHERE workspace_id = $6`,
        [status, requestedAt, approvedAt, revokedAt, timestamp, selectedWorkspaceId],
      )
      return await this.getMcpAccess(selectedWorkspaceId)
    },

    async listMcpInvocations(selectedWorkspaceId) {
      const rows = await query(
        `SELECT id, service_id, tool_id, duration, message, created_at
         FROM mcp_invocations
         WHERE workspace_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [selectedWorkspaceId],
      )
      return rows.map((row) => ({
        id: row.id,
        serviceId: row.service_id,
        toolId: row.tool_id,
        duration: row.duration,
        message: row.message,
        createdAt: row.created_at,
      }))
    },

    async recordMcpInvocation({ selectedWorkspaceId, serviceId, toolId, duration, message }) {
      const id = `inv_${createHash('sha256')
        .update(`${selectedWorkspaceId}:${serviceId}:${toolId}:${nowIso()}`)
        .digest('hex')
        .slice(0, 16)}`
      const createdAt = nowIso()
      await query(
        `INSERT INTO mcp_invocations (id, workspace_id, service_id, tool_id, duration, message, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, selectedWorkspaceId, serviceId, toolId, duration, message, createdAt],
      )
      return { id, serviceId, toolId, duration, message, createdAt }
    },

    async getMcpServices(selectedWorkspaceId) {
      const rows = await query(
        `SELECT service_id, active, updated_at
         FROM mcp_service_state
         WHERE workspace_id = $1`,
        [selectedWorkspaceId],
      )
      return new Map(rows.map((row) => [row.service_id, row.active === 1]))
    },

    async setMcpServiceState(selectedWorkspaceId, serviceId, active, timestamp = nowIso()) {
      const activeInt = active ? 1 : 0
      await query(
        `INSERT INTO mcp_service_state (workspace_id, service_id, active, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (workspace_id, service_id) DO UPDATE SET
           active = EXCLUDED.active,
           updated_at = EXCLUDED.updated_at`,
        [selectedWorkspaceId, serviceId, activeInt, timestamp],
      )
      return { serviceId, active, updatedAt: timestamp }
    },

    async createApiKey({ workspaceId, selectedWorkspaceId, createdBy, name, maskedPrefix, secretHash, permissions, id: providedId, createdAt: providedAt }) {
      const wsId = workspaceId || selectedWorkspaceId
      const id = providedId || `key_${createHash('sha256')
        .update(`${wsId}:${name}:${nowIso()}`)
        .digest('hex')
        .slice(0, 16)}`
      const createdAt = providedAt || nowIso()
      await query(
        `INSERT INTO api_keys (
           id, workspace_id, created_by, name, masked_prefix, secret_hash,
           permissions, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, wsId, createdBy, name, maskedPrefix, secretHash, JSON.stringify(permissions), createdAt],
      )
      const rows = await query(
        `SELECT id, workspace_id, created_by, name, masked_prefix, permissions, created_at, last_used_at, revoked_at
         FROM api_keys WHERE id = $1`,
        [id],
      )
      return mapApiKey(rows[0])
    },

    async listApiKeys(selectedWorkspaceId) {
      const rows = await query(
        `SELECT id, workspace_id, created_by, name, masked_prefix, permissions, created_at, last_used_at, revoked_at
         FROM api_keys
         WHERE workspace_id = $1 AND revoked_at IS NULL
         ORDER BY created_at DESC`,
        [selectedWorkspaceId],
      )
      return rows.map(mapApiKey)
    },

    async getApiKeyBySecret(secretHash) {
      const rows = await query(
        `SELECT
           api_keys.id,
           api_keys.workspace_id,
           api_keys.created_by,
           api_keys.name,
           api_keys.masked_prefix,
           api_keys.permissions,
           api_keys.created_at,
           api_keys.last_used_at,
           api_keys.revoked_at,
           workspaces.name AS workspace_name,
           users.email AS user_email,
           users.name AS user_name
         FROM api_keys
         JOIN workspaces ON workspaces.id = api_keys.workspace_id
         JOIN users ON users.id = api_keys.created_by
         WHERE api_keys.secret_hash = $1
           AND api_keys.revoked_at IS NULL
           AND users.disabled_at IS NULL`,
        [secretHash],
      )
      const row = rows[0]
      if (!row) return null

      await query(`UPDATE api_keys SET last_used_at = $1 WHERE id = $2`, [nowIso(), row.id])

      return {
        key: mapApiKey(row),
        workspace: { id: row.workspace_id, name: row.workspace_name },
        user: { id: row.created_by, email: row.user_email, name: row.user_name },
      }
    },

    async revokeApiKey(selectedWorkspaceId, id) {
      await query(
        `UPDATE api_keys SET revoked_at = $1 WHERE workspace_id = $2 AND id = $3 AND revoked_at IS NULL`,
        [nowIso(), selectedWorkspaceId, id],
      )
      return true
    },

    async createCodexDeviceAuthorization({
      deviceCodeHash,
      userCodeHash,
      clientId,
      scope,
      expiresAt,
    }) {
      const createdAt = nowIso()
      await query(
        `INSERT INTO codex_device_authorizations (
           device_code_hash, user_code_hash, client_id, scope, status,
           created_at, expires_at
         ) VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
        [deviceCodeHash, userCodeHash, clientId, scope, createdAt, expiresAt],
      )
      return { clientId, scope, status: 'pending', createdAt, expiresAt }
    },

    async getCodexDeviceAuthorizationByUserCode(userCodeHash) {
      const rows = await query(
        `SELECT device_code_hash, user_code_hash, client_id, scope, status,
                workspace_id, user_id, created_at, expires_at, approved_at,
                consumed_at
         FROM codex_device_authorizations
         WHERE user_code_hash = $1`,
        [userCodeHash],
      )
      return rows[0] || null
    },

    async getCodexDeviceAuthorizationByDeviceCode(deviceCodeHash) {
      const rows = await query(
        `SELECT device_code_hash, user_code_hash, client_id, scope, status,
                workspace_id, user_id, created_at, expires_at, approved_at,
                consumed_at
         FROM codex_device_authorizations
         WHERE device_code_hash = $1`,
        [deviceCodeHash],
      )
      return rows[0] || null
    },

    async decideCodexDeviceAuthorization({
      userCodeHash,
      selectedWorkspaceId,
      userId,
      approved,
    }) {
      const timestamp = nowIso()
      const rows = await query(
        `UPDATE codex_device_authorizations
         SET status = $1,
             workspace_id = $2,
             user_id = $3,
             approved_at = $4
         WHERE user_code_hash = $5
           AND status = 'pending'
           AND expires_at > $4
         RETURNING device_code_hash, client_id, scope, status, expires_at`,
        [
          approved ? 'approved' : 'denied',
          selectedWorkspaceId,
          userId,
          timestamp,
          userCodeHash,
        ],
      )
      return rows[0] || null
    },

    async consumeCodexDeviceAuthorization(deviceCodeHash) {
      const consumedAt = nowIso()
      const rows = await query(
        `UPDATE codex_device_authorizations
         SET status = 'consumed', consumed_at = $1
         WHERE device_code_hash = $2
           AND status = 'approved'
           AND expires_at > $1
         RETURNING workspace_id, user_id, client_id, scope`,
        [consumedAt, deviceCodeHash],
      )
      return rows[0] || null
    },

    async createCodexAccessToken({
      workspaceId: selectedWorkspaceId,
      createdBy,
      clientId,
      tokenHash,
      scopes,
      expiresAt,
    }) {
      const createdAt = nowIso()
      const id = `ctx_${createHash('sha256')
        .update(`${selectedWorkspaceId}:${tokenHash}`)
        .digest('hex')
        .slice(0, 20)}`
      await query(
        `INSERT INTO codex_access_tokens (
           id, workspace_id, created_by, client_id, token_hash, scopes,
           created_at, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          selectedWorkspaceId,
          createdBy,
          clientId,
          tokenHash,
          JSON.stringify(scopes),
          createdAt,
          expiresAt,
        ],
      )
      return { id, scopes, createdAt, expiresAt }
    },

    async getCodexConnection(selectedWorkspaceId) {
      const timestamp = nowIso()
      const tokenRows = await query(
        `SELECT COUNT(*) AS active_connections, MAX(expires_at) AS expires_at
         FROM codex_access_tokens
         WHERE workspace_id = $1
           AND revoked_at IS NULL
           AND expires_at > $2`,
        [selectedWorkspaceId, timestamp],
      )
      const pendingRows = await query(
        `SELECT COUNT(*) AS pending_requests
         FROM codex_device_authorizations
         WHERE workspace_id = $1
           AND status = 'approved'
           AND expires_at > $2`,
        [selectedWorkspaceId, timestamp],
      )
      const activeConnections = Number(tokenRows[0]?.active_connections || 0)
      return {
        connected: activeConnections > 0,
        activeConnections,
        pendingRequests: Number(pendingRows[0]?.pending_requests || 0),
        expiresAt: tokenRows[0]?.expires_at || null,
      }
    },

    async revokeCodexAccessTokens(selectedWorkspaceId) {
      const revokedAt = nowIso()
      await query(
        `UPDATE codex_access_tokens
         SET revoked_at = $1
         WHERE workspace_id = $2
           AND revoked_at IS NULL`,
        [revokedAt, selectedWorkspaceId],
      )
      return await this.getCodexConnection(selectedWorkspaceId)
    },

    async getCodexAccessToken(tokenHash) {
      const timestamp = nowIso()
      const rows = await query(
        `SELECT
           codex_access_tokens.id,
           codex_access_tokens.workspace_id,
           codex_access_tokens.created_by,
           codex_access_tokens.client_id,
           codex_access_tokens.scopes,
           codex_access_tokens.expires_at,
           workspaces.name AS workspace_name,
           users.email AS user_email,
           users.name AS user_name
         FROM codex_access_tokens
         JOIN workspaces ON workspaces.id = codex_access_tokens.workspace_id
         JOIN users ON users.id = codex_access_tokens.created_by
         WHERE codex_access_tokens.token_hash = $1
           AND codex_access_tokens.revoked_at IS NULL
           AND codex_access_tokens.expires_at > $2
           AND users.disabled_at IS NULL`,
        [tokenHash, timestamp],
      )
      const row = rows[0]
      if (!row) return null
      await query(
        `UPDATE codex_access_tokens SET last_used_at = $1 WHERE id = $2`,
        [timestamp, row.id],
      )
      return {
        token: {
          id: row.id,
          clientId: row.client_id,
          scopes: parsePermissions(row.scopes),
          expiresAt: row.expires_at,
        },
        workspace: { id: row.workspace_id, name: row.workspace_name },
        user: {
          id: row.created_by,
          email: row.user_email,
          name: row.user_name,
        },
      }
    },

    async upsertPaymentConnection({
      selectedWorkspaceId,
      provider,
      configured,
      mode,
      credentialSource,
      keyFingerprint = null,
      secretCiphertext = null,
    }) {
      const status = configured ? 'configured' : 'unconfigured'
      const timestamp = nowIso()
      await query(
        `INSERT INTO payment_connections (
           workspace_id, provider, status, mode, credential_source, key_fingerprint,
           secret_ciphertext, configured_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (workspace_id, provider) DO UPDATE SET
           status = EXCLUDED.status,
           mode = EXCLUDED.mode,
           credential_source = EXCLUDED.credential_source,
           key_fingerprint = EXCLUDED.key_fingerprint,
           secret_ciphertext = EXCLUDED.secret_ciphertext,
           configured_at = CASE WHEN EXCLUDED.status = 'configured' THEN EXCLUDED.updated_at ELSE payment_connections.configured_at END,
           updated_at = EXCLUDED.updated_at`,
        [
          selectedWorkspaceId,
          provider,
          status,
          mode,
          credentialSource,
          keyFingerprint,
          secretCiphertext,
          configured ? timestamp : null,
          timestamp,
        ],
      )
      return await this.getPaymentConnection(selectedWorkspaceId, provider)
    },

    async getPaymentConnection(selectedWorkspaceId, provider) {
      const rows = await query(
        `SELECT provider, status, mode, credential_source, key_fingerprint,
                secret_ciphertext, configured_at, updated_at
         FROM payment_connections
         WHERE workspace_id = $1 AND provider = $2`,
        [selectedWorkspaceId, provider],
      )
      const row = rows[0]
      if (!row) {
        return {
          provider,
          status: 'unconfigured',
          configured: false,
          mode: 'none',
          credentialSource: 'none',
          keyFingerprint: null,
          secretCiphertext: null,
          configuredAt: null,
          updatedAt: null,
        }
      }
      return {
        provider: row.provider,
        status: row.status,
        configured: row.status === 'configured',
        mode: row.mode,
        credentialSource: row.credential_source,
        keyFingerprint: row.key_fingerprint,
        secretCiphertext: row.secret_ciphertext,
        configuredAt: row.configured_at,
        updatedAt: row.updated_at,
      }
    },

    async savePaymentLink({
      invoiceId,
      workspaceId,
      invoiceNumber,
      clientName,
      clientEmail,
      projectName,
      description,
      amountMinor,
      currency,
      dueDate,
      provider,
      idempotencyKey,
      requestHash,
      providerReference,
      authorizationUrl,
      accessCode,
      status,
    }) {
      const timestamp = nowIso()
      const paymentLinkId = `plink_${createHash('sha256')
        .update(`${workspaceId}:${provider}:${idempotencyKey}`)
        .digest('hex')
        .slice(0, 16)}`

      await query(
        `INSERT INTO invoices (
           id, workspace_id, invoice_number, client_name, client_email,
           project_name, description, amount_minor, currency, due_date,
           status, provider, provider_reference, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (workspace_id, invoice_number) DO UPDATE SET
           client_name = EXCLUDED.client_name,
           client_email = EXCLUDED.client_email,
           project_name = EXCLUDED.project_name,
           description = EXCLUDED.description,
           amount_minor = EXCLUDED.amount_minor,
           currency = EXCLUDED.currency,
           due_date = EXCLUDED.due_date,
           status = EXCLUDED.status,
           updated_at = EXCLUDED.updated_at`,
        [
          invoiceId,
          workspaceId,
          invoiceNumber,
          clientName,
          clientEmail,
          projectName,
          description,
          amountMinor,
          currency,
          dueDate,
          status,
          provider,
          providerReference,
          timestamp,
          timestamp,
        ],
      )

      await query(
        `INSERT INTO payment_links (
           id, workspace_id, invoice_id, provider, idempotency_key,
           request_hash, provider_reference, authorization_url, access_code,
           status, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (workspace_id, provider, idempotency_key) DO UPDATE SET
           authorization_url = EXCLUDED.authorization_url,
           access_code = EXCLUDED.access_code,
           status = EXCLUDED.status,
           updated_at = EXCLUDED.updated_at`,
        [
          paymentLinkId,
          workspaceId,
          invoiceId,
          provider,
          idempotencyKey,
          requestHash,
          providerReference,
          authorizationUrl,
          accessCode,
          status,
          timestamp,
          timestamp,
        ],
      )

      return await this.getPaymentLinkByInvoice(workspaceId, invoiceId)
    },

    async getPaymentLinkByInvoice(selectedWorkspaceId, invoiceId) {
      const rows = await query(
        `SELECT
           invoices.id AS invoice_id,
           invoices.workspace_id,
           invoices.invoice_number,
           invoices.client_name,
           invoices.client_email,
           invoices.project_name,
           invoices.description,
           invoices.amount_minor,
           invoices.currency,
           invoices.due_date,
           invoices.status AS invoice_status,
           payment_links.id AS payment_link_id,
           payment_links.provider,
           payment_links.idempotency_key,
           payment_links.request_hash,
           payment_links.provider_reference,
           payment_links.authorization_url,
           payment_links.access_code,
           payment_links.status AS payment_status,
           payment_links.error_code,
           payment_links.provider_transaction_id,
           payment_links.created_at,
           payment_links.updated_at,
           payment_links.paid_at
         FROM invoices
         JOIN payment_links ON payment_links.invoice_id = invoices.id
         WHERE invoices.workspace_id = $1 AND invoices.id = $2
         LIMIT 1`,
        [selectedWorkspaceId, invoiceId],
      )
      return mapPaymentLink(rows[0])
    },

    async getPaymentLinkByReference(reference) {
      const rows = await query(
        `SELECT
           invoices.id AS invoice_id,
           invoices.workspace_id,
           invoices.invoice_number,
           invoices.client_name,
           invoices.client_email,
           invoices.project_name,
           invoices.description,
           invoices.amount_minor,
           invoices.currency,
           invoices.due_date,
           invoices.status AS invoice_status,
           payment_links.id AS payment_link_id,
           payment_links.provider,
           payment_links.idempotency_key,
           payment_links.request_hash,
           payment_links.provider_reference,
           payment_links.authorization_url,
           payment_links.access_code,
           payment_links.status AS payment_status,
           payment_links.error_code,
           payment_links.provider_transaction_id,
           payment_links.created_at,
           payment_links.updated_at,
           payment_links.paid_at
         FROM payment_links
         JOIN invoices ON invoices.id = payment_links.invoice_id
         WHERE payment_links.provider_reference = $1
         LIMIT 1`,
        [reference],
      )
      return mapPaymentLink(rows[0])
    },

    async updatePaymentLinkStatus({
      providerReference,
      status,
      errorCode = null,
      providerTransactionId = null,
      paidAt = null,
    }) {
      const timestamp = nowIso()
      await query(
        `UPDATE payment_links SET
           status = $1,
           error_code = $2,
           provider_transaction_id = $3,
           paid_at = $4,
           updated_at = $5
         WHERE provider_reference = $6`,
        [status, errorCode, providerTransactionId, paidAt, timestamp, providerReference],
      )

      await query(
        `UPDATE invoices SET
           status = $1,
           paid_at = $2,
           updated_at = $3
         WHERE provider_reference = $4`,
        [status, paidAt, timestamp, providerReference],
      )

      return await this.getPaymentLinkByReference(providerReference)
    },

    async getInvoiceByReference(reference) {
      const rows = await query(
        `SELECT id, workspace_id, invoice_number, client_name, client_email, project_name, description, amount_minor, currency, due_date, status, provider, provider_reference, created_at, updated_at, paid_at
         FROM invoices
         WHERE provider_reference = $1`,
        [reference],
      )
      return rows[0] || null
    },

    async recordPaymentEvent({
      id: providedId,
      provider,
      eventKey,
      eventType,
      providerReference,
      payloadHash,
      result,
      processedAt = null,
    }) {
      const id = providedId || `evt_${createHash('sha256')
        .update(`${provider}:${eventKey}`)
        .digest('hex')
        .slice(0, 16)}`
      const timestamp = nowIso()
      const rows = await query(
        `INSERT INTO payment_events (
           id, provider, event_key, event_type, provider_reference, payload_hash,
           result, received_at, processed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (provider, event_key) DO NOTHING
         RETURNING id`,
        [
          id,
          provider,
          eventKey,
          eventType,
          providerReference,
          payloadHash,
          result,
          timestamp,
          processedAt,
        ],
      )
      return rows.length > 0
    },

    async createN8nDelivery({
      workspaceId,
      selectedWorkspaceId,
      id: providedId,
      direction,
      method,
      targetUrl,
      correlationId,
      nonce = null,
      requestHash,
      bodyHash = null,
      eventType,
      event,
      status = 'pending',
      attemptNumber = 1,
      retryOf = null,
      idempotencyKey = null,
    }) {
      const resolvedWorkspaceId = workspaceId || selectedWorkspaceId
      const id = providedId || `dlv_${createHash('sha256')
        .update(`${resolvedWorkspaceId}:${direction}:${correlationId}:${nowIso()}`)
        .digest('hex')
        .slice(0, 16)}`
      const createdAt = nowIso()

      await query(
        `INSERT INTO n8n_deliveries (
           id, workspace_id, direction, method, target_url, correlation_id,
           nonce, request_hash, body_hash, event_type, event_json, status,
           attempt_number, retry_of, idempotency_key, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          id,
          resolvedWorkspaceId,
          direction,
          method,
          targetUrl,
          correlationId,
          nonce,
          requestHash,
          bodyHash,
          eventType,
          JSON.stringify(sanitizeStoredEvent(event)),
          status,
          attemptNumber,
          retryOf,
          idempotencyKey,
          createdAt,
        ],
      )
      const rows = await query(`SELECT * FROM n8n_deliveries WHERE id = $1`, [id])
      return mapN8nDelivery(rows[0])
    },

    async scrubN8nDeliveryEvents() {
      const rows = await query(`SELECT id, event_json FROM n8n_deliveries`)
      for (const row of rows) {
        let parsed
        try {
          parsed = typeof row.event_json === 'string'
            ? JSON.parse(row.event_json)
            : row.event_json
        } catch {
          continue
        }
        const sanitized = sanitizeStoredEvent(parsed)
        if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) {
          await query(
            `UPDATE n8n_deliveries SET event_json = $1 WHERE id = $2`,
            [JSON.stringify(sanitized), row.id],
          )
        }
      }
    },

    async updateN8nDelivery({
      id,
      status,
      responseStatus = null,
      durationMs = null,
      errorCode = null,
      attemptNumber = 1,
      completedAt = nowIso(),
    }) {
      await query(
        `UPDATE n8n_deliveries SET
           status = $1,
           response_status = $2,
           duration_ms = $3,
           error_code = $4,
           attempt_number = $5,
           completed_at = $6
         WHERE id = $7`,
        [status, responseStatus, durationMs, errorCode, attemptNumber, completedAt, id],
      )
      const rows = await query(`SELECT * FROM n8n_deliveries WHERE id = $1`, [id])
      return mapN8nDelivery(rows[0])
    },

    async listN8nDeliveries(selectedWorkspaceId) {
      const rows = await query(
        `SELECT * FROM n8n_deliveries
         WHERE workspace_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [selectedWorkspaceId],
      )
      return rows.map(mapN8nDelivery)
    },

    async getN8nConnection(selectedWorkspaceId) {
      const rows = await query(
        `SELECT workspace_id, status, outbound_url, callback_path, methods, secret_ciphertext, secret_iv, secret_tag, created_at, updated_at, last_delivery_at
         FROM n8n_connections
         WHERE workspace_id = $1`,
        [selectedWorkspaceId],
      )
      const row = rows[0]
      if (!row) {
        return {
          workspaceId: selectedWorkspaceId,
          status: 'disconnected',
          connected: false,
          outboundUrl: '',
          callbackPath: `/api/n8n/webhooks/${selectedWorkspaceId}`,
          methods: ['POST'],
          signingSecretConfigured: false,
          updatedAt: null,
          lastDeliveryAt: null,
        }
      }
      return {
        workspaceId: row.workspace_id,
        status: row.status,
        connected: row.status === 'connected',
        outboundUrl: row.outbound_url || '',
        callbackPath: row.callback_path,
        methods: typeof row.methods === 'string' ? JSON.parse(row.methods) : row.methods,
        signingSecretConfigured: Boolean(row.secret_ciphertext),
        secretCiphertext: row.secret_ciphertext,
        secretIv: row.secret_iv,
        secretTag: row.secret_tag,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastDeliveryAt: row.last_delivery_at,
      }
    },

    async saveN8nConnection({
      workspaceId,
      status,
      outboundUrl,
      callbackPath,
      methods,
      secretCiphertext = null,
      secretIv = null,
      secretTag = null,
    }) {
      const timestamp = nowIso()
      await query(
        `INSERT INTO n8n_connections (
           workspace_id, status, outbound_url, callback_path, methods,
           secret_ciphertext, secret_iv, secret_tag, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (workspace_id) DO UPDATE SET
           status = EXCLUDED.status,
           outbound_url = EXCLUDED.outbound_url,
           callback_path = EXCLUDED.callback_path,
           methods = EXCLUDED.methods,
           secret_ciphertext = EXCLUDED.secret_ciphertext,
           secret_iv = EXCLUDED.secret_iv,
           secret_tag = EXCLUDED.secret_tag,
           updated_at = EXCLUDED.updated_at`,
        [
          workspaceId,
          status,
          outboundUrl,
          callbackPath,
          JSON.stringify(methods),
          secretCiphertext,
          secretIv,
          secretTag,
          timestamp,
          timestamp,
        ],
      )
      return await this.getN8nConnection(workspaceId)
    },

    async recordN8nNonce(selectedWorkspaceId, nonce, timestampMs) {
      try {
        await query(
          `INSERT INTO n8n_nonces (workspace_id, nonce, timestamp_ms, created_at)
           VALUES ($1, $2, $3, $4)`,
          [selectedWorkspaceId, nonce, timestampMs, nowIso()],
        )
        return true
      } catch {
        return false
      }
    },

    async deleteExpiredN8nNonces(cutoffIso) {
      await query(`DELETE FROM n8n_nonces WHERE created_at < $1`, [cutoffIso])
    },

    async getIdempotency(selectedWorkspaceId, route, key) {
      const rows = await query(
        `SELECT response_status, response_json, request_hash
         FROM idempotency_requests
         WHERE workspace_id = $1 AND route = $2 AND idempotency_key = $3 AND expires_at > $4`,
        [selectedWorkspaceId, route, key, nowIso()],
      )
      const row = rows[0]
      if (!row) return null
      return {
        responseStatus: row.response_status,
        response: JSON.parse(row.response_json),
        requestHash: row.request_hash,
      }
    },

    async saveIdempotency({ workspaceId, route, idempotencyKey, requestHash, responseStatus, responseJson, expiresAt }) {
      await query(
        `INSERT INTO idempotency_requests (
           workspace_id, route, idempotency_key, request_hash, response_status, response_json, created_at, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (workspace_id, route, idempotency_key) DO UPDATE SET
           response_status = EXCLUDED.response_status,
           response_json = EXCLUDED.response_json,
           expires_at = EXCLUDED.expires_at`,
        [workspaceId, route, idempotencyKey, requestHash, responseStatus, JSON.stringify(responseJson), nowIso(), expiresAt],
      )
    },

    async deleteExpiredIdempotency() {
      await query(`DELETE FROM idempotency_requests WHERE expires_at <= $1`, [nowIso()])
    },

    async listIdeaNotes(selectedWorkspaceId, boardId) {
      const rows = await query(
        `SELECT id, workspace_id, board_id, content, version, created_by, created_at, updated_at
         FROM idea_notes
         WHERE workspace_id = $1 AND board_id = $2
         ORDER BY updated_at DESC`,
        [selectedWorkspaceId, boardId],
      )
      return rows.map(mapIdeaNote)
    },

    async getIdeaNote(selectedWorkspaceId, id) {
      const rows = await query(
        `SELECT id, workspace_id, board_id, content, version, created_by, created_at, updated_at
         FROM idea_notes
         WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, id],
      )
      return mapIdeaNote(rows[0])
    },

    async saveIdeaNote({ selectedWorkspaceId, boardId, id, content, createdBy }) {
      const timestamp = nowIso()
      await query(
        `INSERT INTO idea_notes (
           id, workspace_id, board_id, content, version, created_by, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 1, $5, $6, $7)
         ON CONFLICT (workspace_id, id) DO UPDATE SET
           content = EXCLUDED.content,
           version = idea_notes.version + 1,
           updated_at = EXCLUDED.updated_at`,
        [id, selectedWorkspaceId, boardId, content, createdBy, timestamp, timestamp],
      )
      return await this.getIdeaNote(selectedWorkspaceId, id)
    },

    async listAutomations(selectedWorkspaceId) {
      const rows = await query(
        `SELECT id, workspace_id, created_by, name, description, icon, accent, status, model, execution, tools_json, runs, success_rate, last_run_at, created_at, updated_at
         FROM automations
         WHERE workspace_id = $1
         ORDER BY created_at DESC`,
        [selectedWorkspaceId],
      )
      return rows.map(mapAutomation)
    },

    async getAutomation(selectedWorkspaceId, id) {
      const rows = await query(
        `SELECT id, workspace_id, created_by, name, description, icon, accent, status, model, execution, tools_json, runs, success_rate, last_run_at, created_at, updated_at
         FROM automations
         WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, id],
      )
      return mapAutomation(rows[0])
    },

    async createAutomation({ workspaceId, createdBy, name, description, model, execution, tools = [] }) {
      const id = `aut_${createHash('sha256')
        .update(`${workspaceId}:${name}:${nowIso()}`)
        .digest('hex')
        .slice(0, 12)}`
      const createdAt = nowIso()
      const executionMode = execution === 'edge' ? 'edge' : 'core'
      await query(
        `INSERT INTO automations (
           id, workspace_id, created_by, name, description, model, execution, tools_json,
           created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, workspaceId, createdBy, name, description, model, executionMode, JSON.stringify(tools), createdAt, createdAt],
      )
      return await this.getAutomation(workspaceId, id)
    },

    async toggleAutomation(selectedWorkspaceId, id) {
      const row = await this.getAutomation(selectedWorkspaceId, id)
      if (!row) return null
      const newStatus = row.status === 'active' ? 'paused' : 'active'
      await query(
        `UPDATE automations SET status = $1, updated_at = $2
         WHERE workspace_id = $3 AND id = $4`,
        [newStatus, nowIso(), selectedWorkspaceId, id],
      )
      return await this.getAutomation(selectedWorkspaceId, id)
    },

    async deleteAutomation(selectedWorkspaceId, id) {
      const rows = await query(
        `DELETE FROM automations
         WHERE workspace_id = $1 AND id = $2
         RETURNING id`,
        [selectedWorkspaceId, id],
      )
      return rows.length > 0
    },

    async listAutomationRuns(selectedWorkspaceId) {
      const rows = await query(
        `SELECT automation_runs.id, automation_runs.automation_id, automations.name AS automation_name,
                automation_runs.instruction, automation_runs.status, automation_runs.started_at,
                automation_runs.duration_seconds, automation_runs.steps,
                automation_runs.error_code, automation_runs.completed_at
         FROM automation_runs
         LEFT JOIN automations ON automations.id = automation_runs.automation_id
         WHERE automation_runs.workspace_id = $1
         ORDER BY automation_runs.started_at DESC`,
        [selectedWorkspaceId],
      )
      return rows.map(mapAutomationRun)
    },

    async getAutomationRun(selectedWorkspaceId, id) {
      const rows = await query(
        `SELECT automation_runs.id, automation_runs.automation_id, automations.name AS automation_name,
                automation_runs.instruction, automation_runs.status, automation_runs.started_at,
                automation_runs.duration_seconds, automation_runs.steps,
                automation_runs.error_code, automation_runs.completed_at
         FROM automation_runs
         LEFT JOIN automations ON automations.id = automation_runs.automation_id
         WHERE automation_runs.workspace_id = $1 AND automation_runs.id = $2`,
        [selectedWorkspaceId, id],
      )
      const run = mapAutomationRun(rows[0])
      if (!run) return null
      run.events = await this.listAutomationRunEvents(selectedWorkspaceId, id)
      return run
    },

    async listAutomationRunEvents(selectedWorkspaceId, runId) {
      const rows = await query(
        `SELECT id, run_id, sequence, level, event_type, message, tool_id,
                input_json, output_json, duration_ms, created_at
         FROM automation_run_events
         WHERE workspace_id = $1 AND run_id = $2
         ORDER BY sequence ASC`,
        [selectedWorkspaceId, runId],
      )
      return rows.map((row) => ({
        id: row.id,
        runId: row.run_id,
        sequence: Number(row.sequence),
        level: row.level,
        eventType: row.event_type,
        message: row.message,
        toolId: row.tool_id,
        input: row.input_json ? JSON.parse(row.input_json) : null,
        output: row.output_json ? JSON.parse(row.output_json) : null,
        durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
        createdAt: row.created_at,
      }))
    },

    async appendAutomationRunEvent({
      workspaceId,
      runId,
      level = 'info',
      eventType,
      message,
      toolId = null,
      input = null,
      output = null,
      durationMs = null,
    }) {
      const sequenceRows = await query(
        `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
         FROM automation_run_events
         WHERE workspace_id = $1 AND run_id = $2`,
        [workspaceId, runId],
      )
      const sequence = Number(sequenceRows[0]?.next_sequence || 1)
      const id = `evt_${createHash('sha256')
        .update(`${workspaceId}:${runId}:${sequence}:${nowIso()}`)
        .digest('hex')
        .slice(0, 20)}`
      const json = (value) => value === null || value === undefined
        ? null
        : JSON.stringify(sanitizeStoredEvent(value)).slice(0, 12_000)
      await query(
        `INSERT INTO automation_run_events (
           id, workspace_id, run_id, sequence, level, event_type, message,
           tool_id, input_json, output_json, duration_ms, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          id,
          workspaceId,
          runId,
          sequence,
          level,
          String(eventType || 'log').slice(0, 80),
          String(message || '').slice(0, 1_000),
          toolId ? String(toolId).slice(0, 160) : null,
          json(input),
          json(output),
          Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : null,
          nowIso(),
        ],
      )
      return {
        id,
        runId,
        sequence,
        level,
        eventType,
        message,
        toolId,
        input,
        output,
        durationMs,
      }
    },

    async createAutomationRun({ workspaceId, automationId, triggeredBy, instruction }) {
      const id = `run_${createHash('sha256')
        .update(`${workspaceId}:${automationId}:${nowIso()}`)
        .digest('hex')
        .slice(0, 12)}`
      const startedAt = nowIso()
      await query(
        `INSERT INTO automation_runs (
           id, workspace_id, automation_id, triggered_by, instruction, started_at
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, workspaceId, automationId, triggeredBy, instruction, startedAt],
      )
      await query(
        `UPDATE automations SET runs = runs + 1, last_run_at = $1, updated_at = $2
         WHERE workspace_id = $3 AND id = $4`,
        [startedAt, startedAt, workspaceId, automationId],
      )
      return await this.getAutomationRun(workspaceId, id)
    },

    async completeAutomationRun({
      selectedWorkspaceId,
      id,
      status,
      durationSeconds,
      steps = 1,
      errorCode = null,
    }) {
      const completedAt = nowIso()
      const rows = await query(
        `UPDATE automation_runs
         SET status = $1, duration_seconds = $2, steps = $3,
             error_code = $4, completed_at = $5
         WHERE workspace_id = $6 AND id = $7
         RETURNING id`,
        [
          status,
          durationSeconds,
          steps,
          errorCode,
          completedAt,
          selectedWorkspaceId,
          id,
        ],
      )
      if (!rows.length) return null

      const totals = await query(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS successful
         FROM automation_runs
         WHERE workspace_id = $1 AND automation_id = (
           SELECT automation_id FROM automation_runs WHERE id = $2
         )`,
        [selectedWorkspaceId, id],
      )
      const total = Number(totals[0]?.total || 0)
      const successful = Number(totals[0]?.successful || 0)
      await query(
        `UPDATE automations
         SET success_rate = $1, updated_at = $2
         WHERE workspace_id = $3
           AND id = (SELECT automation_id FROM automation_runs WHERE id = $4)`,
        [
          total > 0 ? Math.round((successful / total) * 100) : 0,
          completedAt,
          selectedWorkspaceId,
          id,
        ],
      )
      return await this.getAutomationRun(selectedWorkspaceId, id)
    },

    async listIntegrations(selectedWorkspaceId) {
      const rows = await query(
        `SELECT integration_id, connected FROM workspace_integrations WHERE workspace_id = $1`,
        [selectedWorkspaceId],
      )
      const [
        mcpAccess,
        n8nConnection,
        driveToken,
        paystackConnection,
        codexConnection,
      ] = await Promise.all([
        this.getMcpAccess(selectedWorkspaceId),
        this.getN8nConnection(selectedWorkspaceId),
        this.getGoogleDriveToken(selectedWorkspaceId),
        this.getPaymentConnection(selectedWorkspaceId, 'paystack'),
        this.getCodexConnection(selectedWorkspaceId),
      ])
      const integrationMeta = {
        drive: { name: 'Google Drive', description: 'Link approved client folders, source files, and final delivery packages.', category: 'Storage', icon: 'drive', accent: '#4285f4' },
        paystack: { name: 'Paystack', description: 'Collect region-friendly card and bank payments across African markets.', category: 'Payments', icon: 'paystack', accent: '#00c3f7' },
        n8n: { name: 'n8n', description: 'Connect repeatable workflows in either direction with signed GET and POST webhooks.', category: 'Automation', icon: 'n8n', accent: '#ea4b71' },
        'mcp-grid': { name: 'Automation tool gateway', description: 'Browser automation and approved utility tools for agent workflows.', category: 'Automation', icon: 'mcp', accent: '#786bff' },
        'codex-ai': { name: 'lancee AI for Codex', description: 'Let an external Codex client call this workspace’s configured AI provider.', category: 'Automation', icon: 'codex', accent: '#6c654f' },
        'codex-runtime': { name: 'Codex Workspace', description: 'Run OpenAI Codex inside lancee against the server-configured project workspace.', category: 'Automation', icon: 'codex', accent: '#171a15' },
      }
      return rows.filter((row) => Object.hasOwn(integrationMeta, row.integration_id)).map((row) => {
        const meta = integrationMeta[row.integration_id]
        let connected = row.connected === 1
        if (row.integration_id === 'mcp-grid') {
          connected = mcpAccess.status === 'approved'
        } else if (row.integration_id === 'codex-ai') {
          connected = codexConnection.connected
        } else if (row.integration_id === 'n8n') {
          connected = n8nConnection.status === 'connected'
        } else if (row.integration_id === 'drive') {
          connected = Boolean(driveToken)
        } else if (row.integration_id === 'paystack') {
          connected = Boolean(paystackConnection.configured)
        }
        return {
          id: row.integration_id,
          name: meta.name,
          description: meta.description,
          category: meta.category,
          connected,
          icon: meta.icon,
          accent: meta.accent,
        }
      })
    },

    async toggleIntegration(selectedWorkspaceId, integrationId) {
      const list = await this.listIntegrations(selectedWorkspaceId)
      const target = list.find((r) => r.id === integrationId)
      if (!target) return null
      const newConnected = target.connected ? 0 : 1
      await query(
        `UPDATE workspace_integrations SET connected = $1, updated_at = $2
         WHERE workspace_id = $3 AND integration_id = $4`,
        [newConnected, nowIso(), selectedWorkspaceId, integrationId],
      )
      const updated = await this.listIntegrations(selectedWorkspaceId)
      return updated.find((i) => i.id === integrationId) || null
    },

    async createIntegrationRequest({ workspaceId, requestedBy, name, category, details = '' }) {
      const timestamp = nowIso()
      const id = `intreq_${createHash('sha256')
        .update(`${workspaceId}:${requestedBy}:${name}:${timestamp}`)
        .digest('hex')
        .slice(0, 12)}`
      await query(
        `INSERT INTO integration_requests (
           id, workspace_id, requested_by, name, category, details, status, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'requested', $7, $8)`,
        [id, workspaceId, requestedBy, name, category, details, timestamp, timestamp],
      )
      return {
        id,
        name,
        category,
        details,
        status: 'requested',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    },

    async getWorkspaceSettings(selectedWorkspaceId) {
      const rows = await query(
        `SELECT name, logo_url, email, timezone, travel_mode, travel_location, updated_at
         FROM workspace_settings
         WHERE workspace_id = $1`,
        [selectedWorkspaceId],
      )
      const row = rows[0]
      return row
        ? {
            name: row.name || '',
            logoUrl: row.logo_url || '',
            email: row.email || '',
            timezone: row.timezone || 'Africa/Johannesburg',
            travelMode: row.travel_mode || 'none',
            travelLocation: row.travel_location || '',
            updatedAt: row.updated_at || nowIso(),
          }
        : {
            name: '',
            logoUrl: '',
            email: '',
            timezone: 'Africa/Johannesburg',
            travelMode: 'none',
            travelLocation: '',
            updatedAt: nowIso(),
          }
    },

    async updateWorkspaceSettings(selectedWorkspaceId, settings) {
      const timestamp = nowIso()
      await query(
        `INSERT INTO workspace_settings (
           workspace_id, name, logo_url, email, timezone, travel_mode,
           travel_location, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (workspace_id) DO UPDATE SET
           name = EXCLUDED.name,
           logo_url = EXCLUDED.logo_url,
           email = EXCLUDED.email,
           timezone = EXCLUDED.timezone,
           travel_mode = EXCLUDED.travel_mode,
           travel_location = EXCLUDED.travel_location,
           updated_at = EXCLUDED.updated_at`,
        [
          selectedWorkspaceId,
          settings.name || '',
          settings.logoUrl || '',
          settings.email || '',
          settings.timezone || 'Africa/Johannesburg',
          settings.travelMode || 'none',
          settings.travelLocation || '',
          timestamp,
        ],
      )
      await query(
        `UPDATE workspaces SET name = $1 WHERE id = $2`,
        [settings.name || '', selectedWorkspaceId],
      )
      return await this.getWorkspaceSettings(selectedWorkspaceId)
    },

    async saveGoogleDriveToken({
      workspaceId,
      accessToken,
      refreshToken = null,
      expiresAt,
      tokenType = 'Bearer',
      scope = null,
    }) {
      const timestamp = nowIso()
      await query(
        `INSERT INTO google_drive_tokens (
           workspace_id, access_token, refresh_token, expires_at, token_type, scope, connected_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (workspace_id) DO UPDATE SET
           access_token = EXCLUDED.access_token,
           refresh_token = COALESCE(EXCLUDED.refresh_token, google_drive_tokens.refresh_token),
           expires_at = EXCLUDED.expires_at,
           token_type = COALESCE(EXCLUDED.token_type, google_drive_tokens.token_type),
           scope = COALESCE(EXCLUDED.scope, google_drive_tokens.scope),
           updated_at = EXCLUDED.updated_at`,
        [
          workspaceId,
          accessToken,
          refreshToken,
          expiresAt,
          tokenType || 'Bearer',
          scope,
          timestamp,
          timestamp,
        ],
      )
      return await this.getGoogleDriveToken(workspaceId)
    },

    async getGoogleDriveToken(selectedWorkspaceId) {
      const rows = await query(
        `SELECT access_token, refresh_token, expires_at, token_type, scope, connected_at, updated_at
         FROM google_drive_tokens
         WHERE workspace_id = $1`,
        [selectedWorkspaceId],
      )
      const row = rows[0]
      if (!row) return null
      return {
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        expiresAt: row.expires_at,
        tokenType: row.token_type,
        scope: row.scope,
        connectedAt: row.connected_at,
        updatedAt: row.updated_at,
      }
    },

    async deleteGoogleDriveToken(selectedWorkspaceId) {
      await query(`DELETE FROM google_drive_tokens WHERE workspace_id = $1`, [
        selectedWorkspaceId,
      ])
      return true
    },

    async saveTenantIntegrationToken({
      workspaceId,
      provider,
      encryptedAccessToken,
      encryptedRefreshToken = null,
      tokenType = 'Bearer',
      expiresAt = null,
      iv,
      authTag,
      refreshIv = null,
      refreshAuthTag = null,
    }) {
      return await this.runAsTenant(workspaceId, async () => {
        const timestamp = nowIso()
        await query(
          `INSERT INTO tenant_integration_tokens (
             workspace_id, provider, encrypted_access_token, encrypted_refresh_token,
             token_type, expires_at, iv, auth_tag, refresh_iv, refresh_auth_tag,
             created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (workspace_id, provider) DO UPDATE SET
             encrypted_access_token = EXCLUDED.encrypted_access_token,
             encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
             token_type = EXCLUDED.token_type,
             expires_at = EXCLUDED.expires_at,
             iv = EXCLUDED.iv,
             auth_tag = EXCLUDED.auth_tag,
             refresh_iv = EXCLUDED.refresh_iv,
             refresh_auth_tag = EXCLUDED.refresh_auth_tag,
             updated_at = EXCLUDED.updated_at`,
          [
            workspaceId,
            provider,
            encryptedAccessToken,
            encryptedRefreshToken,
            tokenType,
            expiresAt,
            iv,
            authTag,
            refreshIv,
            refreshAuthTag,
            timestamp,
            timestamp,
          ],
        )
        return await this.getTenantIntegrationToken(workspaceId, provider)
      })
    },

    async getTenantIntegrationToken(selectedWorkspaceId, provider) {
      return await this.runAsTenant(selectedWorkspaceId, async () => {
        const rows = await query(
          `SELECT workspace_id, provider, encrypted_access_token, encrypted_refresh_token,
                  token_type, expires_at, iv, auth_tag, refresh_iv, refresh_auth_tag,
                  created_at, updated_at
           FROM tenant_integration_tokens
           WHERE workspace_id = $1 AND provider = $2`,
          [selectedWorkspaceId, provider],
        )
        const row = rows[0]
        if (!row) return null
        return {
          workspaceId: row.workspace_id,
          provider: row.provider,
          encryptedAccessToken: row.encrypted_access_token,
          encryptedRefreshToken: row.encrypted_refresh_token,
          tokenType: row.token_type,
          expiresAt: row.expires_at,
          iv: row.iv,
          authTag: row.auth_tag,
          refreshIv: row.refresh_iv,
          refreshAuthTag: row.refresh_auth_tag,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      })
    },

    async listTenantIntegrationTokens(selectedWorkspaceId) {
      return await this.runAsTenant(selectedWorkspaceId, async () => {
        const rows = await query(
          `SELECT provider, token_type, expires_at, created_at, updated_at
           FROM tenant_integration_tokens
           WHERE workspace_id = $1
           ORDER BY provider ASC`,
          [selectedWorkspaceId],
        )
        return rows.map((row) => ({
          provider: row.provider,
          tokenType: row.token_type,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }))
      })
    },

    async deleteTenantIntegrationToken(selectedWorkspaceId, provider) {
      return await this.runAsTenant(selectedWorkspaceId, async () => {
        const rows = await query(
          `DELETE FROM tenant_integration_tokens
           WHERE workspace_id = $1 AND provider = $2
           RETURNING provider`,
          [selectedWorkspaceId, provider],
        )
        return rows.length > 0
      })
    },

    async saveAiConversation({ workspaceId, userId, threadId = null, title = null, model, messages, tokensUsed = 0 }) {
      const id = `conv_${createHash('sha256')
        .update(`${workspaceId}:${userId}:${nowIso()}`)
        .digest('hex')
        .slice(0, 16)}`
      const timestamp = nowIso()
      await query(
        `INSERT INTO ai_conversations (
           id, workspace_id, user_id, thread_id, title, model, messages_json, tokens_used, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, workspaceId, userId, threadId, title, model, JSON.stringify(messages), tokensUsed, timestamp, timestamp],
      )
      return { id, workspaceId, userId, threadId, title, model, messages, tokensUsed, createdAt: timestamp }
    },

    async listAiConversations(selectedWorkspaceId) {
      const rows = await query(
        `SELECT id, thread_id, title, model, messages_json, tokens_used, created_at, updated_at
         FROM ai_conversations
         WHERE workspace_id = $1
         ORDER BY updated_at DESC
         LIMIT 50`,
        [selectedWorkspaceId],
      )
      return rows.map((row) => ({
        id: row.id,
        threadId: row.thread_id,
        title: row.title,
        model: row.model,
        messages: JSON.parse(row.messages_json),
        tokensUsed: row.tokens_used,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    },

    async listClients(selectedWorkspaceId) {
      const rows = await query(
        `SELECT
           clients.*,
           COUNT(projects.id) AS project_count
         FROM clients
         LEFT JOIN projects
           ON projects.client_id = clients.id
          AND projects.workspace_id = clients.workspace_id
         WHERE clients.workspace_id = $1
         GROUP BY clients.id, clients.workspace_id, clients.name, clients.email,
                  clients.company, clients.status, clients.notes,
                  clients.created_at, clients.updated_at
         ORDER BY clients.status ASC, clients.name ASC`,
        [selectedWorkspaceId],
      )
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        name: row.name,
        email: row.email,
        company: row.company,
        status: row.status,
        notes: row.notes,
        projectCount: Number(row.project_count || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    },

    async createClient({
      workspaceId: selectedWorkspaceId,
      name,
      email = '',
      company = '',
      notes = '',
    }) {
      const client = await ensureClient({ selectedWorkspaceId, name })
      await query(
        `UPDATE clients
         SET email = $1, company = $2, notes = $3, updated_at = $4
         WHERE workspace_id = $5 AND id = $6`,
        [email, company, notes, nowIso(), selectedWorkspaceId, client.id],
      )
      const updated = await getClientById(selectedWorkspaceId, client.id)
      return {
        id: updated.id,
        workspaceId: updated.workspace_id,
        name: updated.name,
        email: updated.email,
        company: updated.company,
        status: updated.status,
        notes: updated.notes,
        projectCount: 0,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      }
    },

    async updateClient(selectedWorkspaceId, id, fields) {
      const sets = []
      const params = []
      let idx = 1
      for (const [field, column] of [
        ['name', 'name'],
        ['email', 'email'],
        ['company', 'company'],
        ['status', 'status'],
        ['notes', 'notes'],
      ]) {
        if (Object.hasOwn(fields, field)) {
          sets.push(`${column} = $${idx++}`)
          params.push(fields[field])
        }
      }
      if (!sets.length) return null
      sets.push(`updated_at = $${idx++}`)
      params.push(nowIso(), selectedWorkspaceId, id)
      await query(
        `UPDATE clients SET ${sets.join(', ')}
         WHERE workspace_id = $${idx++} AND id = $${idx}`,
        params,
      )
      if (Object.hasOwn(fields, 'name')) {
        await query(
          `UPDATE projects SET client = $1, updated_at = $2
           WHERE workspace_id = $3 AND client_id = $4`,
          [fields.name, nowIso(), selectedWorkspaceId, id],
        )
      }
      const row = await getClientById(selectedWorkspaceId, id)
      return row
        ? {
            id: row.id,
            workspaceId: row.workspace_id,
            name: row.name,
            email: row.email,
            company: row.company,
            status: row.status,
            notes: row.notes,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }
        : null
    },

    async deleteClient(selectedWorkspaceId, id) {
      const rows = await query(
        `DELETE FROM clients
         WHERE workspace_id = $1 AND id = $2
         RETURNING id`,
        [selectedWorkspaceId, id],
      )
      return rows.length > 0
    },

    async listProjects(selectedWorkspaceId) {
      const rows = await query(
        `SELECT id, workspace_id, client_id, name, client, scope, due, status, progress, accent, board_id, created_at, updated_at
         FROM projects
         WHERE workspace_id = $1
         ORDER BY created_at DESC`,
        [selectedWorkspaceId],
      )
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        clientId: row.client_id,
        name: row.name,
        client: row.client,
        scope: row.scope,
        due: row.due,
        status: row.status,
        progress: row.progress,
        accent: row.accent,
        boardId: row.board_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    },

    async createProject({ workspaceId, name, clientId, client, scope = 'New project · add deliverables', due = 'Set date', status = 'In progress', progress = 0, accent = '#6854e8', boardId }) {
      const clientRecord = await ensureClient({
        selectedWorkspaceId: workspaceId,
        clientId,
        name: client,
      })
      const id = `prj_${createHash('sha256')
        .update(`${workspaceId}:${name}:${nowIso()}`)
        .digest('hex')
        .slice(0, 12)}`
      const timestamp = nowIso()
      await query(
        `INSERT INTO projects (
           id, workspace_id, client_id, name, client, scope, due, status, progress, accent, created_at, updated_at, board_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [id, workspaceId, clientRecord.id, name, clientRecord.name, scope, due, status, progress, accent, timestamp, timestamp, boardId || null],
      )
      const rows = await query(`SELECT * FROM projects WHERE workspace_id = $1 AND id = $2`, [workspaceId, id])
      const row = rows[0]
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        clientId: row.client_id,
        name: row.name,
        client: row.client,
        scope: row.scope,
        due: row.due,
        status: row.status,
        progress: row.progress,
        accent: row.accent,
        boardId: row.board_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    },

    async ensureJobCard({ workspaceId, projectId, createdBy }) {
      const existingRows = await query(
        `SELECT * FROM job_cards WHERE workspace_id = $1 AND project_id = $2`,
        [workspaceId, projectId],
      )
      if (existingRows[0]) return existingRows[0]
      const projectRows = await query(
        `SELECT name, scope FROM projects WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, projectId],
      )
      if (!projectRows[0]) return null
      const id = `job_${createHash('sha256')
        .update(`${workspaceId}:${projectId}`)
        .digest('hex')
        .slice(0, 16)}`
      const timestamp = nowIso()
      await query(
        `INSERT INTO job_cards (
           id, workspace_id, project_id, title, description, created_by, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (workspace_id, project_id) DO NOTHING`,
        [id, workspaceId, projectId, projectRows[0].name, projectRows[0].scope || '', createdBy, timestamp, timestamp],
      )
      const rows = await query(
        `SELECT * FROM job_cards WHERE workspace_id = $1 AND project_id = $2`,
        [workspaceId, projectId],
      )
      return rows[0] || null
    },

    async createDraftInvoiceForProject({ workspaceId, projectId }) {
      const existing = await this.getDraftInvoiceByProject(workspaceId, projectId)
      if (existing) return existing
      const rows = await query(
        `SELECT projects.id, projects.name, projects.scope, projects.due,
                projects.client_id, clients.name AS client_name, clients.email AS client_email
         FROM projects
         LEFT JOIN clients ON clients.id = projects.client_id
         WHERE projects.workspace_id = $1 AND projects.id = $2`,
        [workspaceId, projectId],
      )
      const project = rows[0]
      if (!project) return null
      const timestamp = nowIso()
      const identity = createHash('sha256')
        .update(`${workspaceId}:${projectId}`)
        .digest('hex')
      const draft = {
        id: `draft_${identity.slice(0, 16)}`,
        workspaceId,
        projectId,
        clientId: project.client_id,
        invoiceNumber: `DRAFT-${identity.slice(0, 8).toUpperCase()}`,
        clientName: project.client_name || 'Client',
        clientEmail: project.client_email || '',
        projectName: project.name,
        description: project.scope || project.name,
        amountMinor: 0,
        currency: 'ZAR',
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(project.due || '') ? project.due : null,
        status: 'draft',
        paymentUrl: null,
      }
      await query(
        `INSERT INTO draft_invoices (
           id, workspace_id, project_id, client_id, invoice_number, client_name,
           client_email, project_name, description, amount_minor, currency, due_date,
           status, payment_url, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (workspace_id, project_id) DO NOTHING`,
        [draft.id, workspaceId, projectId, draft.clientId, draft.invoiceNumber, draft.clientName, draft.clientEmail, draft.projectName, draft.description, draft.amountMinor, draft.currency, draft.dueDate, draft.status, draft.paymentUrl, timestamp, timestamp],
      )
      return await this.getDraftInvoiceByProject(workspaceId, projectId)
    },

    async getDraftInvoiceByProject(selectedWorkspaceId, projectId) {
      const rows = await query(
        `SELECT * FROM draft_invoices WHERE workspace_id = $1 AND project_id = $2`,
        [selectedWorkspaceId, projectId],
      )
      return mapDraftInvoice(rows[0])
    },

    async getDraftInvoice(selectedWorkspaceId, id) {
      const rows = await query(
        `SELECT * FROM draft_invoices WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, id],
      )
      return mapDraftInvoice(rows[0])
    },

    async listDraftInvoices(selectedWorkspaceId) {
      const rows = await query(
        `SELECT * FROM draft_invoices WHERE workspace_id = $1 ORDER BY created_at DESC`,
        [selectedWorkspaceId],
      )
      return rows.map(mapDraftInvoice)
    },

    async updateDraftInvoice(selectedWorkspaceId, id, fields) {
      const sets = []
      const params = []
      let index = 1
      for (const [field, column] of [
        ['description', 'description'],
        ['amountMinor', 'amount_minor'],
        ['dueDate', 'due_date'],
        ['status', 'status'],
        ['paymentUrl', 'payment_url'],
      ]) {
        if (Object.hasOwn(fields, field)) {
          sets.push(`${column} = $${index++}`)
          params.push(fields[field])
        }
      }
      if (!sets.length) return await this.getDraftInvoice(selectedWorkspaceId, id)
      sets.push(`updated_at = $${index++}`)
      params.push(nowIso(), selectedWorkspaceId, id)
      await query(
        `UPDATE draft_invoices SET ${sets.join(', ')}
         WHERE workspace_id = $${index++} AND id = $${index}`,
        params,
      )
      return await this.getDraftInvoice(selectedWorkspaceId, id)
    },

    async createClientApproval({
      workspaceId,
      projectId,
      jobCardId,
      clientId,
      tokenHash,
      clientName,
      clientEmail,
      projectName,
      title,
      body,
      expiresAt,
    }) {
      const id = `apr_${createHash('sha256')
        .update(`${workspaceId}:${projectId}:${tokenHash}`)
        .digest('hex')
        .slice(0, 16)}`
      const timestamp = nowIso()
      await query(
        `INSERT INTO client_approvals (
           id, workspace_id, project_id, job_card_id, client_id, token_hash,
           client_name, client_email, project_name, title, body, expires_at, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [id, workspaceId, projectId, jobCardId, clientId, tokenHash, clientName, clientEmail, projectName, title, body, expiresAt, timestamp],
      )
      return await this.getClientApproval(workspaceId, id)
    },

    async getClientApproval(selectedWorkspaceId, id) {
      const rows = await query(
        `SELECT * FROM client_approvals WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, id],
      )
      return mapApproval(rows[0])
    },

    async getClientApprovalByTokenHash(tokenHash) {
      const rows = await query(
        `SELECT * FROM client_approvals WHERE token_hash = $1`,
        [tokenHash],
      )
      return mapApproval(rows[0])
    },

    async listProjectApprovals(selectedWorkspaceId, projectId) {
      const rows = await query(
        `SELECT * FROM client_approvals
         WHERE workspace_id = $1 AND project_id = $2
         ORDER BY created_at DESC`,
        [selectedWorkspaceId, projectId],
      )
      return rows.map(mapApproval)
    },

    async createReviewSession({ approvalId, workspaceId, projectId, artworkFileId = null, tokenHash, expiresAt }) {
      const id = `rev_${createHash('sha256')
        .update(`${approvalId}:${tokenHash}`)
        .digest('hex')
        .slice(0, 20)}`
      const timestamp = nowIso()
      await query(
        `INSERT INTO review_sessions (
           id, approval_id, workspace_id, project_id, artwork_file_id,
           client_token_hash, expires_at, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, approvalId, workspaceId, projectId, artworkFileId, tokenHash, expiresAt, timestamp],
      )
      return await this.getReviewSession(workspaceId, id)
    },

    async getReviewSession(selectedWorkspaceId, reviewId) {
      const rows = await query(
        `SELECT reviews.*, approvals.project_name, approvals.client_name,
                files.name AS artwork_name, files.mime_type AS artwork_mime_type,
                files.size AS artwork_size
         FROM review_sessions reviews
         JOIN client_approvals approvals ON approvals.id = reviews.approval_id
         LEFT JOIN project_files files ON files.id = reviews.artwork_file_id
         WHERE reviews.workspace_id = $1 AND reviews.id = $2`,
        [selectedWorkspaceId, reviewId],
      )
      const row = rows[0]
      return mapReview(row, row ? await this.listReviewAnnotations(row.id) : [])
    },

    async getLatestReviewForProject(selectedWorkspaceId, projectId) {
      const rows = await query(
        `SELECT reviews.*, approvals.project_name, approvals.client_name,
                files.name AS artwork_name, files.mime_type AS artwork_mime_type,
                files.size AS artwork_size
         FROM review_sessions reviews
         JOIN client_approvals approvals ON approvals.id = reviews.approval_id
         LEFT JOIN project_files files ON files.id = reviews.artwork_file_id
         WHERE reviews.workspace_id = $1 AND reviews.project_id = $2
         ORDER BY reviews.created_at DESC LIMIT 1`,
        [selectedWorkspaceId, projectId],
      )
      const row = rows[0]
      return mapReview(row, row ? await this.listReviewAnnotations(row.id) : [])
    },

    async getPublicReview(reviewId, tokenHash) {
      const rows = await query(
        `SELECT reviews.*, approvals.project_name, approvals.client_name,
                files.name AS artwork_name, files.mime_type AS artwork_mime_type,
                files.size AS artwork_size
         FROM review_sessions reviews
         JOIN client_approvals approvals ON approvals.id = reviews.approval_id
         LEFT JOIN project_files files ON files.id = reviews.artwork_file_id
         WHERE reviews.id = $1 AND reviews.client_token_hash = $2`,
        [reviewId, tokenHash],
      )
      const row = rows[0]
      if (!row || Date.parse(row.expires_at) <= Date.now()) return null
      return mapReview(row, await this.listReviewAnnotations(row.id))
    },

    async listReviewAnnotations(reviewId) {
      const rows = await query(
        `SELECT * FROM review_annotations WHERE review_id = $1 ORDER BY created_at ASC`,
        [reviewId],
      )
      return rows.map(mapReviewAnnotation)
    },

    async createReviewAnnotation({ reviewId, artworkFileId, annotation, comment = '', priority = 'medium', category = 'other', status = 'open', createdBy }) {
      const timestamp = nowIso()
      await query(
        `INSERT INTO review_annotations (
           id, review_id, artwork_file_id, annotation_json, comment,
           priority, category, status, created_by, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [annotation.id, reviewId, artworkFileId, JSON.stringify(annotation), comment, priority, category, status, createdBy, timestamp, timestamp],
      )
      const rows = await query(`SELECT * FROM review_annotations WHERE id = $1`, [annotation.id])
      return mapReviewAnnotation(rows[0])
    },

    async updateReviewAnnotation(reviewId, annotationId, fields) {
      const sets = []
      const params = []
      let index = 1
      for (const [field, column] of [
        ['annotation', 'annotation_json'],
        ['comment', 'comment'],
        ['priority', 'priority'],
        ['category', 'category'],
        ['status', 'status'],
      ]) {
        if (!Object.hasOwn(fields, field)) continue
        sets.push(`${column} = $${index++}`)
        params.push(field === 'annotation' ? JSON.stringify(fields[field]) : fields[field])
      }
      if (!sets.length) {
        const rows = await query(`SELECT * FROM review_annotations WHERE review_id = $1 AND id = $2`, [reviewId, annotationId])
        return mapReviewAnnotation(rows[0])
      }
      sets.push(`updated_at = $${index++}`)
      params.push(nowIso(), reviewId, annotationId)
      await query(
        `UPDATE review_annotations SET ${sets.join(', ')}
         WHERE review_id = $${index++} AND id = $${index}`,
        params,
      )
      const rows = await query(`SELECT * FROM review_annotations WHERE review_id = $1 AND id = $2`, [reviewId, annotationId])
      return mapReviewAnnotation(rows[0])
    },

    async deleteReviewAnnotation(reviewId, annotationId) {
      await query(`DELETE FROM review_annotations WHERE review_id = $1 AND id = $2`, [reviewId, annotationId])
    },

    async submitReviewSession(reviewId, tokenHash) {
      const rows = await query(
        `SELECT reviews.*, approvals.project_name, approvals.client_name,
                approvals.workspace_id AS approval_workspace_id,
                approvals.job_card_id, approvals.status AS approval_status,
                files.name AS artwork_name, files.mime_type AS artwork_mime_type,
                files.size AS artwork_size
         FROM review_sessions reviews
         JOIN client_approvals approvals ON approvals.id = reviews.approval_id
         LEFT JOIN project_files files ON files.id = reviews.artwork_file_id
         WHERE reviews.id = $1 AND reviews.client_token_hash = $2`,
        [reviewId, tokenHash],
      )
      const review = rows[0]
      if (!review || Date.parse(review.expires_at) <= Date.now()) return null
      if (review.status === 'closed' || review.status === 'submitted') {
        return mapReview(review, await this.listReviewAnnotations(reviewId))
      }
      const annotations = await this.listReviewAnnotations(reviewId)
      if (annotations.some((annotation) => !annotation.comment.trim())) {
        return { missingComment: true, review: mapReview(review, annotations) }
      }
      const timestamp = nowIso()
      await query(
        `UPDATE review_sessions SET status = 'submitted', submitted_at = $1 WHERE id = $2`,
        [timestamp, reviewId],
      )
      await query(
        `UPDATE client_approvals SET status = CASE WHEN status = 'pending' THEN 'commented' ELSE status END,
                responded_at = COALESCE(responded_at, $1)
         WHERE id = $2`,
        [timestamp, review.approval_id],
      )
      await query(
        `UPDATE job_cards SET status = 'client_review', updated_at = $1 WHERE id = $2 AND workspace_id = $3`,
        [timestamp, review.job_card_id, review.approval_workspace_id],
      )
      await query(
        `UPDATE projects SET status = 'In review', updated_at = $1 WHERE id = $2 AND workspace_id = $3`,
        [timestamp, review.project_id, review.approval_workspace_id],
      )
      await this.createWorkspaceNotification({
        workspaceId: review.approval_workspace_id,
        kind: 'approval.annotation_submitted',
        title: 'Client submitted artwork annotations',
        body: `${review.client_name} submitted feedback on ${review.project_name}.`,
        entityType: 'project',
        entityId: review.project_id,
      })
      const updated = await this.getPublicReview(reviewId, tokenHash)
      return { review: updated }
    },

    async closeReviewSession(selectedWorkspaceId, reviewId) {
      const timestamp = nowIso()
      await query(
        `UPDATE review_sessions SET status = 'closed', closed_at = $1 WHERE workspace_id = $2 AND id = $3`,
        [timestamp, selectedWorkspaceId, reviewId],
      )
      return await this.getReviewSession(selectedWorkspaceId, reviewId)
    },

    async respondToClientApproval({ tokenHash, response, comment = null }) {
      const rows = await query(
        `SELECT * FROM client_approvals WHERE token_hash = $1`,
        [tokenHash],
      )
      const approval = rows[0]
      if (!approval || Date.parse(approval.expires_at) <= Date.now()) return null
      if (approval.status === 'approved') return mapApproval(approval)
      const timestamp = nowIso()
      const status = response === 'approved' ? 'approved' : 'commented'
      await query(
        `UPDATE client_approvals SET status = $1, comment = $2, responded_at = $3
         WHERE token_hash = $4`,
        [status, comment, timestamp, tokenHash],
      )
      await query(
        `UPDATE job_cards SET status = $1, updated_at = $2 WHERE id = $3 AND workspace_id = $4`,
        [response === 'approved' ? 'approved' : 'client_review', timestamp, approval.job_card_id, approval.workspace_id],
      )
      await query(
        `UPDATE projects SET status = $1, updated_at = $2 WHERE id = $3 AND workspace_id = $4`,
        [response === 'approved' ? 'Ready' : 'In review', timestamp, approval.project_id, approval.workspace_id],
      )
      if (response === 'approved') {
        await query(
          `UPDATE draft_invoices SET status = 'ready_for_review', updated_at = $1
           WHERE workspace_id = $2 AND project_id = $3`,
          [timestamp, approval.workspace_id, approval.project_id],
        )
      }
      await query(
        `UPDATE review_sessions SET status = 'closed', closed_at = $1
         WHERE approval_id = $2`,
        [timestamp, approval.id],
      )
      if (comment) {
        const commentId = `cmt_${createHash('sha256')
          .update(`${approval.id}:${timestamp}:${comment}`)
          .digest('hex')
          .slice(0, 16)}`
        await query(
          `INSERT INTO project_comments (
             id, workspace_id, project_id, approval_id, author_type, author_name, body, created_at
           ) VALUES ($1, $2, $3, $4, 'client', $5, $6, $7)`,
          [commentId, approval.workspace_id, approval.project_id, approval.id, approval.client_name, comment, timestamp],
        )
      }
      await this.createWorkspaceNotification({
        workspaceId: approval.workspace_id,
        kind: response === 'approved' ? 'approval.approved' : 'approval.comment',
        title: response === 'approved' ? 'Client approved a jobcard' : 'Client comment received',
        body: response === 'approved'
          ? `${approval.client_name} approved ${approval.project_name}.`
          : `${approval.client_name} commented on ${approval.project_name}.`,
        entityType: 'project',
        entityId: approval.project_id,
      })
      return await this.getClientApprovalByTokenHash(tokenHash)
    },

    async listProjectComments(selectedWorkspaceId, projectId) {
      const rows = await query(
        `SELECT * FROM project_comments
         WHERE workspace_id = $1 AND project_id = $2
         ORDER BY created_at ASC`,
        [selectedWorkspaceId, projectId],
      )
      return rows.map(mapProjectComment)
    },

    async createWorkspaceNotification({ workspaceId, kind, title, body, entityType = null, entityId = null }) {
      const timestamp = nowIso()
      const id = `ntf_${createHash('sha256')
        .update(`${workspaceId}:${kind}:${title}:${timestamp}`)
        .digest('hex')
        .slice(0, 20)}`
      await query(
        `INSERT INTO workspace_notifications (
           id, workspace_id, kind, title, body, entity_type, entity_id, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, workspaceId, kind, title, body, entityType, entityId, timestamp],
      )
      return await this.getWorkspaceNotification(workspaceId, id)
    },

    async getWorkspaceNotification(selectedWorkspaceId, id) {
      const rows = await query(
        `SELECT * FROM workspace_notifications WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, id],
      )
      return mapNotification(rows[0])
    },

    async listWorkspaceNotifications(selectedWorkspaceId) {
      const rows = await query(
        `SELECT * FROM workspace_notifications
         WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [selectedWorkspaceId],
      )
      return rows.map(mapNotification)
    },

    async updateProjectStatus(selectedWorkspaceId, id, status) {
      await query(
        `UPDATE projects SET status = $1, updated_at = $2 WHERE workspace_id = $3 AND id = $4`,
        [status, nowIso(), selectedWorkspaceId, id],
      )
      const rows = await query(`SELECT * FROM projects WHERE workspace_id = $1 AND id = $2`, [selectedWorkspaceId, id])
      const row = rows[0]
      return row ? {
        id: row.id,
        workspaceId: row.workspace_id,
        clientId: row.client_id,
        name: row.name,
        client: row.client,
        scope: row.scope,
        due: row.due,
        status: row.status,
        progress: row.progress,
        accent: row.accent,
        boardId: row.board_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      } : null
    },

    async completeProjectWorkflow(selectedWorkspaceId, projectId) {
      const timestamp = nowIso()
      await query(
        `UPDATE job_cards SET status = 'done', updated_at = $1
         WHERE workspace_id = $2 AND project_id = $3`,
        [timestamp, selectedWorkspaceId, projectId],
      )
      await query(
        `UPDATE projects SET status = 'Ready', progress = 100, updated_at = $1
         WHERE workspace_id = $2 AND id = $3`,
        [timestamp, selectedWorkspaceId, projectId],
      )
      const rows = await query(
        `SELECT * FROM projects WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, projectId],
      )
      const row = rows[0]
      return row ? {
        id: row.id,
        workspaceId: row.workspace_id,
        clientId: row.client_id,
        name: row.name,
        client: row.client,
        scope: row.scope,
        due: row.due,
        status: row.status,
        progress: row.progress,
        accent: row.accent,
        boardId: row.board_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      } : null
    },

    async updateProject(selectedWorkspaceId, id, fields) {
      if (Object.hasOwn(fields, 'clientId') || Object.hasOwn(fields, 'client')) {
        const currentRows = await query(
          `SELECT client FROM projects WHERE workspace_id = $1 AND id = $2`,
          [selectedWorkspaceId, id],
        )
        const clientRecord = await ensureClient({
          selectedWorkspaceId,
          clientId: fields.clientId,
          name: fields.client || currentRows[0]?.client,
        })
        fields = {
          ...fields,
          clientId: clientRecord.id,
          client: clientRecord.name,
        }
      }
      const sets = []
      const params = []
      let idx = 1
      if (Object.hasOwn(fields, 'status')) { sets.push(`status = $${idx++}`); params.push(fields.status) }
      if (Object.hasOwn(fields, 'name')) { sets.push(`name = $${idx++}`); params.push(fields.name) }
      if (Object.hasOwn(fields, 'client')) { sets.push(`client = $${idx++}`); params.push(fields.client) }
      if (Object.hasOwn(fields, 'clientId')) { sets.push(`client_id = $${idx++}`); params.push(fields.clientId) }
      if (Object.hasOwn(fields, 'scope')) { sets.push(`scope = $${idx++}`); params.push(fields.scope) }
      if (Object.hasOwn(fields, 'due')) { sets.push(`due = $${idx++}`); params.push(fields.due || 'Set date') }
      if (fields.boardId !== undefined) { sets.push(`board_id = $${idx++}`); params.push(fields.boardId || null) }
      if (!sets.length) return null
      sets.push(`updated_at = $${idx++}`)
      params.push(nowIso())
      params.push(selectedWorkspaceId, id)
      await query(
        `UPDATE projects SET ${sets.join(', ')} WHERE workspace_id = $${idx++} AND id = $${idx}`,
        params,
      )
      const rows = await query(`SELECT * FROM projects WHERE workspace_id = $1 AND id = $2`, [selectedWorkspaceId, id])
      const row = rows[0]
      return row ? {
        id: row.id,
        workspaceId: row.workspace_id,
        clientId: row.client_id,
        name: row.name,
        client: row.client,
        scope: row.scope,
        due: row.due,
        status: row.status,
        progress: row.progress,
        accent: row.accent,
        boardId: row.board_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      } : null
    },

    async deleteProject(selectedWorkspaceId, id) {
      await query(`DELETE FROM projects WHERE workspace_id = $1 AND id = $2`, [selectedWorkspaceId, id])
    },

    async listDriveResourceLinks(selectedWorkspaceId, { clientId, projectId } = {}) {
      const conditions = ['links.workspace_id = $1']
      const params = [selectedWorkspaceId]
      if (clientId) {
        params.push(clientId)
        conditions.push(`links.client_id = $${params.length}`)
      }
      if (projectId) {
        params.push(projectId)
        conditions.push(`links.project_id = $${params.length}`)
      }
      const rows = await query(
        `SELECT
           links.*,
           clients.name AS client_name,
           projects.name AS project_name
         FROM google_drive_resource_links links
         LEFT JOIN clients ON clients.id = links.client_id
         LEFT JOIN projects ON projects.id = links.project_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY links.created_at DESC`,
        params,
      )
      return rows.map((row) => ({
        id: row.id,
        driveFileId: row.drive_file_id,
        name: row.name,
        mimeType: row.mime_type,
        webViewLink: row.web_view_link,
        resourceKind: row.resource_kind,
        clientId: row.client_id,
        clientName: row.client_name,
        projectId: row.project_id,
        projectName: row.project_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    },

    async createDriveResourceLink({
      workspaceId: selectedWorkspaceId,
      driveFileId,
      name,
      mimeType,
      webViewLink,
      resourceKind,
      clientId,
      projectId,
    }) {
      if (clientId && !(await getClientById(selectedWorkspaceId, clientId))) return null
      if (projectId) {
        const projects = await query(
          `SELECT id, client_id FROM projects WHERE workspace_id = $1 AND id = $2`,
          [selectedWorkspaceId, projectId],
        )
        if (!projects[0]) return null
        if (clientId && projects[0].client_id !== clientId) return null
        if (!clientId) clientId = projects[0].client_id
      }
      const id = stableId(
        'drl',
        `${selectedWorkspaceId}:${driveFileId}:${clientId || ''}:${projectId || ''}`,
      )
      const timestamp = nowIso()
      await query(
        `INSERT INTO google_drive_resource_links (
           id, workspace_id, drive_file_id, name, mime_type, web_view_link,
           resource_kind, client_id, project_id, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT(id) DO UPDATE SET
           name = EXCLUDED.name,
           mime_type = EXCLUDED.mime_type,
           web_view_link = EXCLUDED.web_view_link,
           resource_kind = EXCLUDED.resource_kind,
           updated_at = EXCLUDED.updated_at`,
        [
          id,
          selectedWorkspaceId,
          driveFileId,
          name,
          mimeType,
          webViewLink || null,
          resourceKind,
          clientId || null,
          projectId || null,
          timestamp,
          timestamp,
        ],
      )
      const links = await this.listDriveResourceLinks(selectedWorkspaceId, {
        clientId: clientId || undefined,
        projectId: projectId || undefined,
      })
      return links.find((link) => link.id === id) || null
    },

    async deleteDriveResourceLink(selectedWorkspaceId, id) {
      await query(
        `DELETE FROM google_drive_resource_links WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, id],
      )
    },

    async listWorkspaceDocuments(selectedWorkspaceId) {
      const rows = await query(
        `SELECT id, workspace_id, name, mime_type, size, content_sha256,
                drive_file_id, drive_web_view_link, synced_at, created_at, updated_at
         FROM workspace_documents
         WHERE workspace_id = $1
         ORDER BY updated_at DESC`,
        [selectedWorkspaceId],
      )
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        name: row.name,
        mimeType: row.mime_type,
        size: row.size,
        sha256: row.content_sha256,
        driveFileId: row.drive_file_id,
        driveWebViewLink: row.drive_web_view_link,
        syncedAt: row.synced_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    },

    async createWorkspaceDocument({
      workspaceId: selectedWorkspaceId,
      name,
      mimeType,
      body,
    }) {
      const timestamp = nowIso()
      const contentSha256 = createHash('sha256').update(body).digest('hex')
      const id = `doc_${createHash('sha256')
        .update(`${selectedWorkspaceId}:${name}:${contentSha256}:${timestamp}`)
        .digest('hex')
        .slice(0, 16)}`
      await query(
        `INSERT INTO workspace_documents (
           id, workspace_id, name, mime_type, size, content_base64,
           content_sha256, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          selectedWorkspaceId,
          name,
          mimeType,
          body.byteLength,
          body.toString('base64'),
          contentSha256,
          timestamp,
          timestamp,
        ],
      )
      return (await this.listWorkspaceDocuments(selectedWorkspaceId))
        .find((document) => document.id === id)
    },

    async getWorkspaceDocument(selectedWorkspaceId, id) {
      const rows = await query(
        `SELECT * FROM workspace_documents WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, id],
      )
      const row = rows[0]
      return row
        ? {
            id: row.id,
            workspaceId: row.workspace_id,
            name: row.name,
            mimeType: row.mime_type,
            size: row.size,
            body: Buffer.from(row.content_base64, 'base64'),
            sha256: row.content_sha256,
            driveFileId: row.drive_file_id,
            driveWebViewLink: row.drive_web_view_link,
            syncedAt: row.synced_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }
        : null
    },

    async markWorkspaceDocumentSynced(selectedWorkspaceId, id, driveFile) {
      const timestamp = nowIso()
      await query(
        `UPDATE workspace_documents
         SET drive_file_id = $1, drive_web_view_link = $2,
             synced_at = $3, updated_at = $4
         WHERE workspace_id = $5 AND id = $6`,
        [
          driveFile.id,
          driveFile.webViewLink || null,
          timestamp,
          timestamp,
          selectedWorkspaceId,
          id,
        ],
      )
      return (await this.listWorkspaceDocuments(selectedWorkspaceId))
        .find((document) => document.id === id)
    },

    async updateWorkspaceDocumentContent(
      selectedWorkspaceId,
      id,
      { body, mimeType },
    ) {
      const timestamp = nowIso()
      const contentSha256 = createHash('sha256').update(body).digest('hex')
      await query(
        `UPDATE workspace_documents
         SET mime_type = $1, size = $2, content_base64 = $3,
             content_sha256 = $4, drive_file_id = NULL,
             drive_web_view_link = NULL, synced_at = NULL, updated_at = $5
         WHERE workspace_id = $6 AND id = $7`,
        [
          mimeType,
          body.byteLength,
          body.toString('base64'),
          contentSha256,
          timestamp,
          selectedWorkspaceId,
          id,
        ],
      )
      return await this.getWorkspaceDocument(selectedWorkspaceId, id)
    },

    async deleteWorkspaceDocument(selectedWorkspaceId, id) {
      await query(
        `DELETE FROM workspace_documents WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, id],
      )
    },

    async listProjectLinks(selectedWorkspaceId, projectId) {
      const rows = await query(
        `SELECT * FROM project_links WHERE workspace_id = $1 AND project_id = $2 ORDER BY created_at ASC`,
        [selectedWorkspaceId, projectId],
      )
      return rows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        workspaceId: row.workspace_id,
        url: row.url,
        label: row.label,
        createdAt: row.created_at,
      }))
    },

    async createProjectLink({ workspaceId, projectId, url, label }) {
      const id = `link_${createHash('sha256').update(`${workspaceId}:${projectId}:${url}:${nowIso()}`).digest('hex').slice(0, 12)}`
      const timestamp = nowIso()
      await query(
        `INSERT INTO project_links (id, project_id, workspace_id, url, label, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, projectId, workspaceId, url, label || '', timestamp],
      )
      return { id, projectId, workspaceId, url, label: label || '', createdAt: timestamp }
    },

    async deleteProjectLink(selectedWorkspaceId, linkId) {
      await query(`DELETE FROM project_links WHERE workspace_id = $1 AND id = $2`, [selectedWorkspaceId, linkId])
    },

    async listProjectFiles(selectedWorkspaceId, projectId) {
      const rows = await query(
        `SELECT id, project_id, workspace_id, name, mime_type, size,
                storage_key, content_sha256, created_at
         FROM project_files
         WHERE workspace_id = $1 AND project_id = $2
         ORDER BY created_at ASC`,
        [selectedWorkspaceId, projectId],
      )
      return rows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        workspaceId: row.workspace_id,
        name: row.name,
        mimeType: row.mime_type,
        size: row.size,
        storageKey: row.storage_key,
        sha256: row.content_sha256,
        createdAt: row.created_at,
      }))
    },

    async createProjectFile({
      workspaceId,
      projectId,
      name,
      mimeType,
      size,
      storageKey,
      contentBase64,
      contentSha256,
    }) {
      const id = `file_${createHash('sha256').update(`${workspaceId}:${projectId}:${storageKey}:${nowIso()}`).digest('hex').slice(0, 12)}`
      const timestamp = nowIso()
      await query(
        `INSERT INTO project_files (
           id, project_id, workspace_id, name, mime_type, size, storage_key,
           content_base64, content_sha256, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          projectId,
          workspaceId,
          name,
          mimeType || 'application/octet-stream',
          size || 0,
          storageKey,
          contentBase64,
          contentSha256,
          timestamp,
        ],
      )
      return {
        id,
        projectId,
        workspaceId,
        name,
        mimeType: mimeType || 'application/octet-stream',
        size: size || 0,
        storageKey,
        sha256: contentSha256,
        createdAt: timestamp,
      }
    },

    async getProjectFile(selectedWorkspaceId, fileId) {
      const rows = await query(
        `SELECT id, project_id, workspace_id, name, mime_type, size,
                storage_key, content_base64, content_sha256, created_at
         FROM project_files
         WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, fileId],
      )
      const row = rows[0]
      return row
        ? {
            id: row.id,
            projectId: row.project_id,
            workspaceId: row.workspace_id,
            name: row.name,
            mimeType: row.mime_type,
            size: row.size,
            storageKey: row.storage_key,
            contentBase64: row.content_base64,
            sha256: row.content_sha256,
            createdAt: row.created_at,
          }
        : null
    },

    async getProjectFileForApproval(tokenHash, fileId) {
      const rows = await query(
        `SELECT files.id, files.project_id, files.workspace_id, files.name,
                files.mime_type, files.size, files.storage_key,
                files.content_base64, files.content_sha256, files.created_at
         FROM project_files files
         JOIN client_approvals approvals
           ON approvals.project_id = files.project_id
          AND approvals.workspace_id = files.workspace_id
         WHERE approvals.token_hash = $1 AND files.id = $2`,
        [tokenHash, fileId],
      )
      const row = rows[0]
      return row
        ? {
            id: row.id,
            projectId: row.project_id,
            workspaceId: row.workspace_id,
            name: row.name,
            mimeType: row.mime_type,
            size: row.size,
            storageKey: row.storage_key,
            contentBase64: row.content_base64,
            sha256: row.content_sha256,
            createdAt: row.created_at,
          }
        : null
    },

    async deleteProjectFile(selectedWorkspaceId, fileId) {
      await query(`DELETE FROM project_files WHERE workspace_id = $1 AND id = $2`, [selectedWorkspaceId, fileId])
    },

    async disconnectN8n(selectedWorkspaceId) {
      await query(
        `UPDATE n8n_connections SET status = 'disconnected', updated_at = $1 WHERE workspace_id = $2`,
        [nowIso(), selectedWorkspaceId],
      )
    },

    async listMcpServiceStates(selectedWorkspaceId) {
      const rows = await query(
        `SELECT service_id, active FROM mcp_service_state WHERE workspace_id = $1`,
        [selectedWorkspaceId],
      )
      return rows.map((row) => ({ serviceId: row.service_id, active: row.active === 1 }))
    },

    async touchMcpAccess(selectedWorkspaceId, timestamp = nowIso()) {
      await query(
        `UPDATE mcp_access SET updated_at = $1 WHERE workspace_id = $2`,
        [timestamp, selectedWorkspaceId],
      )
    },

    async deactivateMcpServices(selectedWorkspaceId) {
      const timestamp = nowIso()
      for (const row of await query(`SELECT service_id FROM mcp_service_state WHERE workspace_id = $1 AND active = 1`, [selectedWorkspaceId])) {
        await query(
          `INSERT INTO mcp_service_state (workspace_id, service_id, active, updated_at)
           VALUES ($1, $2, 0, $3)
           ON CONFLICT (workspace_id, service_id) DO UPDATE SET active = 0, updated_at = EXCLUDED.updated_at`,
          [selectedWorkspaceId, row.service_id, timestamp],
        )
      }
    },

    async getN8nDeliveryByIdempotency(selectedWorkspaceId, idempotencyKey) {
      const rows = await query(
        `SELECT * FROM n8n_deliveries WHERE workspace_id = $1 AND idempotency_key = $2 ORDER BY created_at DESC LIMIT 1`,
        [selectedWorkspaceId, idempotencyKey],
      )
      return rows[0] ? mapN8nDelivery(rows[0]) : null
    },

    async completeN8nDelivery({ selectedWorkspaceId, id, status, nonce, bodyHash, targetUrl, responseStatus, duration, errorCode }) {
      await query(
        `UPDATE n8n_deliveries SET
           status = $1, nonce = $2, body_hash = $3, target_url = $4,
           response_status = $5, duration_ms = $6, error_code = $7,
           completed_at = $8
         WHERE workspace_id = $9 AND id = $10`,
        [status, nonce || null, bodyHash || null, targetUrl, responseStatus || null, duration || null, errorCode || null, nowIso(), selectedWorkspaceId, id],
      )
      const rows = await query(`SELECT * FROM n8n_deliveries WHERE id = $1`, [id])
      return rows[0] ? mapN8nDelivery(rows[0]) : null
    },

    async consumeN8nNonce({ selectedWorkspaceId, nonce, timestampMilliseconds }) {
      try {
        await query(
          `INSERT INTO n8n_nonces (workspace_id, nonce, timestamp_ms, created_at) VALUES ($1, $2, $3, $4)`,
          [selectedWorkspaceId, nonce, timestampMilliseconds, nowIso()],
        )
        return true
      } catch {
        return false
      }
    },

    async getPaymentLinkByIdempotency(selectedWorkspaceId, provider, idempotencyKey) {
      const rows = await query(
        `SELECT
           invoices.id AS invoice_id, invoices.workspace_id, invoices.invoice_number,
           invoices.client_name, invoices.client_email, invoices.project_name,
           invoices.description, invoices.amount_minor, invoices.currency, invoices.due_date,
           invoices.status AS invoice_status,
           payment_links.id AS payment_link_id, payment_links.provider,
           payment_links.idempotency_key, payment_links.request_hash,
           payment_links.provider_reference, payment_links.authorization_url,
           payment_links.access_code, payment_links.status AS payment_status,
           payment_links.error_code, payment_links.provider_transaction_id,
           payment_links.created_at, payment_links.updated_at, payment_links.paid_at
         FROM payment_links
         JOIN invoices ON invoices.id = payment_links.invoice_id
         WHERE payment_links.workspace_id = $1 AND payment_links.provider = $2 AND payment_links.idempotency_key = $3
         LIMIT 1`,
        [selectedWorkspaceId, provider, idempotencyKey],
      )
      return mapPaymentLink(rows[0])
    },

    async createInvoiceAndPaymentLink({ invoice, paymentLink }) {
      const timestamp = nowIso()
      await query(
        `INSERT INTO invoices (id, workspace_id, invoice_number, client_name, client_email, project_name, description, amount_minor, currency, due_date, status, provider, provider_reference, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'initializing', $11, $12, $13, $14)`,
        [invoice.id, invoice.workspaceId, invoice.invoiceNumber, invoice.clientName, invoice.clientEmail, invoice.projectName, invoice.description, invoice.amountMinor, invoice.currency, invoice.dueDate, invoice.provider, invoice.providerReference, timestamp, timestamp],
      )
      await query(
        `INSERT INTO payment_links (id, workspace_id, invoice_id, provider, idempotency_key, request_hash, provider_reference, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'initializing', $8, $9)`,
        [paymentLink.id, invoice.workspaceId, invoice.id, invoice.provider, paymentLink.idempotencyKey, paymentLink.requestHash, invoice.providerReference, timestamp, timestamp],
      )
      return await this.getPaymentLinkByInvoice(invoice.workspaceId, invoice.id)
    },

    async claimFailedPaymentLink({ selectedWorkspaceId, paymentLinkId }) {
      const rows = await query(
        `SELECT status FROM payment_links WHERE id = $1 AND workspace_id = $2`,
        [paymentLinkId, selectedWorkspaceId],
      )
      return rows[0] && rows[0].status === 'failed'
    },

    async markPaymentLinkPending({ selectedWorkspaceId, paymentLinkId, authorizationUrl, accessCode }) {
      await query(
        `UPDATE payment_links SET status = 'pending', authorization_url = $1, access_code = $2, updated_at = $3
         WHERE id = $4 AND workspace_id = $5`,
        [authorizationUrl, accessCode, nowIso(), paymentLinkId, selectedWorkspaceId],
      )
      await query(
        `UPDATE invoices SET status = 'pending', updated_at = $1 WHERE id = (SELECT invoice_id FROM payment_links WHERE id = $2)`,
        [nowIso(), paymentLinkId],
      )
    },

    async markPaymentLinkFailed({ selectedWorkspaceId, paymentLinkId, errorCode }) {
      await query(
        `UPDATE payment_links SET status = 'failed', error_code = $1, updated_at = $2 WHERE id = $3 AND workspace_id = $4`,
        [errorCode, nowIso(), paymentLinkId, selectedWorkspaceId],
      )
    },

    async markPaymentPaid({ provider: _provider, providerReference, providerTransactionId, timestamp }) {
      await this.updatePaymentLinkStatus({
        providerReference,
        status: 'paid',
        errorCode: null,
        providerTransactionId: providerTransactionId || null,
        paidAt: timestamp,
      })
    },

    async getApiKeyByHash(secretHash) {
      return await this.getApiKeyBySecret(secretHash)
    },

    async touchApiKey(id) {
      await query(`UPDATE api_keys SET last_used_at = $1 WHERE id = $2`, [nowIso(), id])
    },

    async listInvoices(selectedWorkspaceId) {
      const rows = await query(
        `SELECT id, workspace_id, invoice_number, client_name, client_email, project_name, description, amount_minor, currency, due_date, status, provider, provider_reference, payment_url, created_at, updated_at, paid_at
         FROM invoices
         WHERE workspace_id = $1
         ORDER BY created_at DESC`,
        [selectedWorkspaceId],
      )
      return rows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        clientName: row.client_name,
        clientEmail: row.client_email,
        projectName: row.project_name,
        description: row.description,
        amountMinor: row.amount_minor,
        currency: row.currency,
        dueDate: row.due_date,
        status: row.status,
        provider: row.provider,
        providerReference: row.provider_reference,
        paymentUrl: row.payment_url || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        paidAt: row.paid_at,
      }))
    },

    async createIdeaNote({ selectedWorkspaceId, boardId, id, content, createdBy }) {
      return await this.saveIdeaNote({ selectedWorkspaceId, boardId, id, content, createdBy })
    },

    async updateIdeaNote({ selectedWorkspaceId, id, content, expectedVersion }) {
      const existing = await this.getIdeaNote(selectedWorkspaceId, id)
      if (!existing) {
        return { updated: false, note: null }
      }
      if (existing.version !== expectedVersion) {
        return { updated: false, note: existing }
      }
      const timestamp = nowIso()
      await query(
        `UPDATE idea_notes SET content = $1, version = version + 1, updated_at = $2
         WHERE workspace_id = $3 AND id = $4 AND version = $5`,
        [content, timestamp, selectedWorkspaceId, id, expectedVersion],
      )
      const note = await this.getIdeaNote(selectedWorkspaceId, id)
      return { updated: true, note }
    },

    async getN8nDelivery(selectedWorkspaceId, id) {
      const rows = await query(
        `SELECT * FROM n8n_deliveries WHERE workspace_id = $1 AND id = $2 LIMIT 1`,
        [selectedWorkspaceId, id],
      )
      return rows[0] ? mapN8nDelivery(rows[0]) : null
    },

    async createMcpInvocation(selectedWorkspaceId, serviceId, toolId) {
      return await this.recordMcpInvocation({
        selectedWorkspaceId,
        serviceId,
        toolId,
        duration: null,
        message: null,
      })
    },

    async listTeamMembers(selectedWorkspaceId) {
      const rows = await query(
        `SELECT users.id, users.name, users.email, workspace_members.role, workspace_members.created_at, users.disabled_at, users.password_hash
         FROM users
         JOIN workspace_members ON workspace_members.user_id = users.id
         WHERE workspace_members.workspace_id = $1
         ORDER BY workspace_members.created_at ASC`,
        [selectedWorkspaceId],
      )
      const invitations = await query(
        `SELECT id, name, email, role, created_at, expires_at
         FROM team_invitations
         WHERE workspace_id = $1 AND status = 'pending'
         ORDER BY created_at ASC`,
        [selectedWorkspaceId],
      )
      return [
        ...rows.map((row) => {
          let status = 'active'
          if (row.disabled_at) status = 'disabled'
          else if (row.password_hash === 'temp_hash') status = 'invited'
          return {
            id: row.id,
            name: row.name,
            email: row.email,
            role: row.role,
            status,
            joinedAt: row.created_at,
          }
        }),
        ...invitations.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          role: row.role,
          status: 'invited',
          joinedAt: row.created_at,
          expiresAt: row.expires_at,
        })),
      ]
    },

    async updateTeamMember(selectedWorkspaceId, memberId, { name, role }) {
      const timestamp = nowIso()
      if (String(memberId).startsWith('inv_')) {
        const rows = await query(
          `UPDATE team_invitations
           SET name = $1, role = $2, updated_at = $3
           WHERE workspace_id = $4 AND id = $5 AND status = 'pending'
           RETURNING id, name, email, role, created_at`,
          [name, role, timestamp, selectedWorkspaceId, memberId],
        )
        const row = rows[0]
        return row ? {
          id: row.id,
          name: row.name,
          email: row.email,
          role: row.role,
          status: 'invited',
          joinedAt: row.created_at,
        } : null
      }
      await query(
        `UPDATE users SET name = $1 WHERE id = $2
         AND EXISTS (
           SELECT 1 FROM workspace_members
           WHERE workspace_id = $3 AND user_id = $2
         )`,
        [name, memberId, selectedWorkspaceId],
      )
      await query(
        `UPDATE workspace_members SET role = $1
         WHERE workspace_id = $2 AND user_id = $3`,
        [role, selectedWorkspaceId, memberId],
      )
      return (await this.listTeamMembers(selectedWorkspaceId))
        .find((member) => member.id === memberId) || null
    },

    async removeTeamMember(selectedWorkspaceId, memberId) {
      if (String(memberId).startsWith('inv_')) {
        await query(
          `DELETE FROM team_invitations
           WHERE workspace_id = $1 AND id = $2 AND status = 'pending'`,
          [selectedWorkspaceId, memberId],
        )
        return
      }
      await query(
        `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [selectedWorkspaceId, memberId],
      )
    },

    async recordApiRequest(selectedWorkspaceId, failed = false) {
      const metricDate = nowIso().slice(0, 10)
      await query(
        `INSERT INTO api_request_metrics (
           workspace_id, metric_date, request_count, error_count, updated_at
         ) VALUES ($1, $2, 1, $3, $4)
         ON CONFLICT (workspace_id, metric_date) DO UPDATE SET
           request_count = api_request_metrics.request_count + 1,
           error_count = api_request_metrics.error_count + EXCLUDED.error_count,
           updated_at = EXCLUDED.updated_at`,
        [selectedWorkspaceId, metricDate, failed ? 1 : 0, nowIso()],
      )
    },

    async getMonthlyApiMetrics(selectedWorkspaceId, monthPrefix) {
      const rows = await query(
        `SELECT
           COALESCE(SUM(request_count), 0) AS request_count,
           COALESCE(SUM(error_count), 0) AS error_count
         FROM api_request_metrics
         WHERE workspace_id = $1 AND metric_date LIKE $2`,
        [selectedWorkspaceId, `${monthPrefix}%`],
      )
      return {
        requestCount: Number(rows[0]?.request_count || 0),
        errorCount: Number(rows[0]?.error_count || 0),
      }
    },

    async listWorkspaceCloudLinks(selectedWorkspaceId) {
      const rows = await query(
        `SELECT id, provider, label, folder_url, notes, created_at, updated_at
         FROM workspace_cloud_links
         WHERE workspace_id = $1
         ORDER BY created_at DESC`,
        [selectedWorkspaceId],
      )
      return rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        label: row.label || '',
        folderUrl: row.folder_url,
        notes: row.notes || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    },

    async createWorkspaceCloudLink({ workspaceId, provider, label, folderUrl, notes = '' }) {
      const id = `cloud_${createHash('sha256').update(`${workspaceId}:${folderUrl}:${nowIso()}`).digest('hex').slice(0, 12)}`
      const timestamp = nowIso()
      await query(
        `INSERT INTO workspace_cloud_links (id, workspace_id, provider, label, folder_url, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, workspaceId, provider, label, folderUrl, notes, timestamp, timestamp],
      )
      return {
        id,
        provider,
        label,
        folderUrl,
        notes,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    },

    async deleteWorkspaceCloudLink(selectedWorkspaceId, linkId) {
      await query(`DELETE FROM workspace_cloud_links WHERE workspace_id = $1 AND id = $2`, [
        selectedWorkspaceId,
        linkId,
      ])
    },

    async listIdeaBoards(selectedWorkspaceId) {
      const rows = await query(
        `SELECT * FROM idea_boards WHERE workspace_id = $1 ORDER BY created_at ASC`,
        [selectedWorkspaceId],
      )
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        label: row.label,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    },

    async createIdeaBoard({ selectedWorkspaceId, id, label, createdBy }) {
      const timestamp = nowIso()
      await query(
        `INSERT INTO idea_boards (id, workspace_id, label, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, selectedWorkspaceId, label, createdBy, timestamp, timestamp],
      )
      return { id, workspaceId: selectedWorkspaceId, label, createdBy, createdAt: timestamp, updatedAt: timestamp }
    },

    async deleteIdeaBoard(selectedWorkspaceId, id) {
      await this.transaction(async () => {
        await query(
          `UPDATE projects SET board_id = NULL, updated_at = $1
           WHERE workspace_id = $2 AND board_id = $3`,
          [nowIso(), selectedWorkspaceId, id],
        )
        await query(
          `DELETE FROM canvas_elements WHERE workspace_id = $1 AND board_id = $2`,
          [selectedWorkspaceId, id],
        )
        await query(
          `DELETE FROM idea_canvas_scenes WHERE workspace_id = $1 AND board_id = $2`,
          [selectedWorkspaceId, id],
        )
        await query(
          `DELETE FROM idea_notes WHERE workspace_id = $1 AND board_id = $2`,
          [selectedWorkspaceId, id],
        )
        await query(`DELETE FROM idea_boards WHERE workspace_id = $1 AND id = $2`, [
          selectedWorkspaceId,
          id,
        ])
      })
    },

    async listCanvasElements(selectedWorkspaceId, boardId) {
      const rows = await query(
        `SELECT * FROM canvas_elements WHERE workspace_id = $1 AND board_id = $2 ORDER BY created_at ASC`,
        [selectedWorkspaceId, boardId],
      )
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        boardId: row.board_id,
        kind: row.kind,
        x: row.x,
        y: row.y,
        dataJson: row.data_json,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    },

    async saveCanvasElement({ selectedWorkspaceId, boardId, id, kind, x, y, dataJson }) {
      const timestamp = nowIso()
      await query(
        `INSERT INTO canvas_elements (id, workspace_id, board_id, kind, x, y, data_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (workspace_id, id) DO UPDATE SET kind = $4, x = $5, y = $6, data_json = $7, updated_at = $9`,
        [id, selectedWorkspaceId, boardId, kind, x, y, dataJson, timestamp, timestamp],
      )
      return { id, workspaceId: selectedWorkspaceId, boardId, kind, x, y, dataJson, createdAt: timestamp, updatedAt: timestamp }
    },

    async deleteCanvasElement(selectedWorkspaceId, id) {
      await query(`DELETE FROM canvas_elements WHERE workspace_id = $1 AND id = $2`, [
        selectedWorkspaceId,
        id,
      ])
    },

    async getIdeaCanvasScene(selectedWorkspaceId, boardId) {
      const rows = await query(
        `SELECT scene_json FROM idea_canvas_scenes WHERE workspace_id = $1 AND board_id = $2`,
        [selectedWorkspaceId, boardId],
      )
      if (!rows[0]) return null
      try {
        return JSON.parse(rows[0].scene_json)
      } catch {
        return null
      }
    },

    async saveIdeaCanvasScene({ selectedWorkspaceId, boardId, sceneJson }) {
      const timestamp = nowIso()
      await query(
        `INSERT INTO idea_canvas_scenes (workspace_id, board_id, scene_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (workspace_id, board_id) DO UPDATE SET scene_json = $3, updated_at = $5`,
        [selectedWorkspaceId, boardId, sceneJson, timestamp, timestamp],
      )
      return { boardId, updatedAt: timestamp }
    },

    async getUserByEmail(email) {
      const rows = await query(
        `SELECT id, email, name, password_salt, password_hash, disabled_at
         FROM users
         WHERE lower(email) = lower($1)
         LIMIT 1`,
        [email],
      )
      const row = rows[0]
      if (!row) return null
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        passwordSalt: row.password_salt,
        passwordHash: row.password_hash,
        disabledAt: row.disabled_at,
      }
    },

    async getRegistrationConfirmationByTokenHash(tokenHash) {
      const rows = await query(
        `SELECT id, email, name, workspace_name, token_hash, expires_at
         FROM registration_confirmations
         WHERE token_hash = $1
         LIMIT 1`,
        [tokenHash],
      )
      const row = rows[0]
      if (!row) return null
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        workspaceName: row.workspace_name,
        tokenHash: row.token_hash,
        expiresAt: row.expires_at,
      }
    },

    async saveRegistrationConfirmation({
      email,
      name,
      workspaceName,
      tokenHash,
      expiresAt,
    }) {
      const timestamp = nowIso()
      const id = stableId('reg', email)
      await query(
        `INSERT INTO registration_confirmations (
           id, email, name, workspace_name, token_hash, expires_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           workspace_name = EXCLUDED.workspace_name,
           token_hash = EXCLUDED.token_hash,
           expires_at = EXCLUDED.expires_at,
           updated_at = EXCLUDED.updated_at`,
        [id, email, name, workspaceName, tokenHash, expiresAt, timestamp, timestamp],
      )
      return { id, email, name, workspaceName, expiresAt }
    },

    async deleteRegistrationConfirmation(tokenHash) {
      await query(
        `DELETE FROM registration_confirmations WHERE token_hash = $1`,
        [tokenHash],
      )
    },

    async getWorkspaceMembershipByEmail(selectedWorkspaceId, email) {
      const rows = await query(
        `SELECT users.id, users.email, users.password_hash, workspace_members.role
         FROM workspace_members
         JOIN users ON users.id = workspace_members.user_id
         WHERE workspace_members.workspace_id = $1 AND lower(users.email) = lower($2)
         LIMIT 1`,
        [selectedWorkspaceId, email],
      )
      return rows[0] || null
    },

    async removeLegacyInvitationMember(selectedWorkspaceId, userId) {
      await query(
        `DELETE FROM workspace_members
         WHERE workspace_id = $1 AND user_id = $2`,
        [selectedWorkspaceId, userId],
      )
      await query(
        `DELETE FROM users
         WHERE id = $1
           AND password_hash = 'temp_hash'
           AND NOT EXISTS (
             SELECT 1 FROM workspace_members WHERE user_id = $1
           )`,
        [userId],
      )
    },

    async getTeamInvitationByTokenHash(tokenHash) {
      const rows = await query(
        `SELECT team_invitations.*, workspaces.name AS workspace_name
         FROM team_invitations
         JOIN workspaces ON workspaces.id = team_invitations.workspace_id
         WHERE team_invitations.token_hash = $1
         LIMIT 1`,
        [tokenHash],
      )
      const row = rows[0]
      if (!row) return null
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        workspaceName: row.workspace_name,
        email: row.email,
        name: row.name,
        role: row.role,
        status: row.status,
        expiresAt: row.expires_at,
        acceptedAt: row.accepted_at,
      }
    },

    async inviteTeamMember({
      workspaceId,
      invitedBy,
      email,
      name,
      role = 'collaborator',
      tokenHash,
      expiresAt,
    }) {
      const normalizedEmail = email.trim().toLowerCase()
      const invitationId = stableId('inv', `${workspaceId}:${normalizedEmail}`)
      const timestamp = nowIso()
      await query(
        `INSERT INTO team_invitations (
           id, workspace_id, invited_by, email, name, role, token_hash,
           status, expires_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10)
         ON CONFLICT (workspace_id, email) DO UPDATE SET
           invited_by = EXCLUDED.invited_by,
           name = EXCLUDED.name,
           role = EXCLUDED.role,
           token_hash = EXCLUDED.token_hash,
           status = 'pending',
           expires_at = EXCLUDED.expires_at,
           accepted_at = NULL,
           updated_at = EXCLUDED.updated_at`,
        [
          invitationId,
          workspaceId,
          invitedBy,
          normalizedEmail,
          name || normalizedEmail.split('@')[0],
          role,
          tokenHash,
          expiresAt,
          timestamp,
          timestamp,
        ],
      )
      return {
        id: invitationId,
        name: name || normalizedEmail.split('@')[0],
        email: normalizedEmail,
        role,
        status: 'invited',
        joinedAt: timestamp,
        expiresAt,
      }
    },

    async acceptTeamInvitation({ invitationId, workspaceId, userId, role }) {
      const timestamp = nowIso()
      await query(
        `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [workspaceId, userId, role, timestamp],
      )
      await query(
        `UPDATE team_invitations
         SET status = 'accepted', accepted_at = $1, updated_at = $2
         WHERE id = $3 AND status = 'pending'`,
        [timestamp, timestamp, invitationId],
      )
    },
  }
}
