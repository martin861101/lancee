import { createHash, randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import pg from 'pg'

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

function parseJsonObject(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
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

function stableJson(value) {
  const normalize = (item) => {
    if (Array.isArray(item)) return item.map(normalize)
    if (!item || typeof item !== 'object') return item
    return Object.fromEntries(
      Object.keys(item)
        .sort()
        .map((key) => [key, normalize(item[key])]),
    )
  }
  return JSON.stringify(normalize(sanitizeStoredEvent(value)))
}

function codedError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function mapContext(row) {
  if (!row) return null
  return {
    user: {
      id: row.user_id,
      name: row.user_name,
      email: row.user_email,
      avatarUrl: row.user_avatar_url || '',
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

function mapProjectTask(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    bucketId: row.bucket_id,
    title: row.title,
    notes: row.notes,
    completed: Boolean(row.completed_at),
    completedAt: row.completed_at || null,
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
    instructionTemplate: row.instruction_template || '',
    execution: row.execution || 'core',
    runs: row.runs,
    successRate: row.success_rate,
    lastRun: row.last_run_at || 'Not run yet',
    tools: parsePermissions(row.tools_json),
  }
}

function mapMailAccount(row, includeSecret = false) {
  if (!row) return null
  return {
    workspaceId: row.workspace_id,
    connectedBy: row.connected_by,
    email: row.email,
    displayName: row.display_name || '',
    username: row.username,
    provider: row.provider || 'custom',
    imapHost: row.imap_host,
    imapPort: Number(row.imap_port),
    imapSecure: Boolean(row.imap_secure),
    smtpHost: row.smtp_host,
    smtpPort: Number(row.smtp_port),
    smtpSecure: Boolean(row.smtp_secure),
    status: row.status,
    lastSeenUid: Number(row.last_seen_uid || 0),
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(includeSecret ? {
      passwordCiphertext: row.password_ciphertext,
      passwordIv: row.password_iv,
      passwordTag: row.password_tag,
    } : {}),
  }
}

function mapMailAutomationRule(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    automationId: row.automation_id,
    automationName: row.automation_name || '',
    createdBy: row.created_by,
    name: row.name,
    sender: row.sender || '',
    recipient: row.recipient || '',
    subject: row.subject || '',
    keywords: parsePermissions(row.keywords_json),
    matchMode: row.match_mode,
    instruction: row.instruction,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

function mapAutomationSchedule(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workflowId: row.automation_id,
    workflowName: row.automation_name || '',
    createdBy: row.created_by,
    instruction: row.instruction,
    provider: row.provider,
    runAt: row.run_at,
    intervalSeconds: row.interval_seconds === null || row.interval_seconds === undefined
      ? null
      : Number(row.interval_seconds),
    status: row.status,
    lastRunId: row.last_run_id,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapArtifact(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    runId: row.run_id,
    kind: row.kind,
    mimeType: row.mime_type,
    name: row.name,
    storageDocumentId: row.storage_document_id,
    size: Number(row.size || 0),
    sha256: row.content_sha256,
    storageProvider: row.storage_provider,
    storageKey: row.storage_key,
    externalUrl: row.external_url,
    source: row.source,
    metadata: parseJsonObject(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    deletedAt: row.deleted_at,
  }
}

function mapAgentThread(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    title: row.title,
    provider: row.provider,
    externalThreadId: row.external_thread_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapAgentRun(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    threadId: row.thread_id,
    objective: row.objective,
    status: row.status,
    model: row.model,
    plan: parseJsonObject(row.plan_json, []),
    results: parseJsonObject(row.results_json, []),
    pendingAction: parseJsonObject(row.pending_action_json, null),
    finalOutput: row.final_output,
    budget: parseJsonObject(row.budget_json, {}),
    usage: parseJsonObject(row.usage_json, {}),
    iterations: Number(row.iterations || 0),
    toolCalls: Number(row.tool_calls || 0),
    stepSequence: Number(row.step_sequence || 0),
    eventSequence: Number(row.event_sequence || 0),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}

function mapAgentStep(row) {
  if (!row) return null
  return {
    id: row.id,
    runId: row.run_id,
    sequence: Number(row.sequence),
    toolId: row.tool_id,
    arguments: parseJsonObject(row.arguments_json, {}),
    argumentsHash: row.arguments_hash,
    riskLevel: row.risk_level,
    status: row.status,
    result: parseJsonObject(row.result_json, null),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapAgentApproval(row) {
  if (!row) return null
  return {
    id: row.id,
    runId: row.run_id,
    stepId: row.step_id,
    toolId: row.tool_id,
    argumentsHash: row.arguments_hash,
    riskLevel: row.risk_level,
    status: row.status,
    requestedAt: row.requested_at,
    expiresAt: row.expires_at,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    consumedAt: row.consumed_at,
    reason: row.reason,
  }
}

function mapAgentRunEvent(row) {
  if (!row) return null
  return {
    id: row.id,
    runId: row.run_id,
    sequence: Number(row.sequence),
    level: row.level,
    eventType: row.event_type,
    message: row.message,
    data: parseJsonObject(row.data_json, null),
    createdAt: row.created_at,
  }
}

function mapExecutionJob(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    requestedBy: row.requested_by,
    agentRunId: row.agent_run_id,
    kind: row.kind,
    status: row.status,
    input: parseJsonObject(row.input_json, {}),
    output: parseJsonObject(row.output_json, null),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    priority: Number(row.priority || 0),
    attemptCount: Number(row.attempt_count || 0),
    maxAttempts: Number(row.max_attempts || 1),
    availableAt: row.available_at,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    heartbeatAt: row.heartbeat_at,
    idempotencyKey: row.idempotency_key,
    inputHash: row.input_hash,
    eventSequence: Number(row.event_sequence || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}

function mapExecutionJobEvent(row) {
  if (!row) return null
  return {
    id: row.id,
    jobId: row.job_id,
    sequence: Number(row.sequence),
    level: row.level,
    eventType: row.event_type,
    message: row.message,
    data: parseJsonObject(row.data_json, null),
    createdAt: row.created_at,
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
    dueAt: row.due_at || null,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    reviewUrl: row.review_url,
  }
}

function mapReviewPackageItem(row) {
  if (!row) return null
  return {
    id: row.id,
    approvalId: row.approval_id,
    projectId: row.project_id,
    bucketId: row.bucket_id,
    title: row.title,
    status: row.status,
    position: Number(row.position || 0),
    previewFileId: row.preview_file_id || null,
    preview: row.preview_file_id
      ? {
          id: row.preview_file_id,
          name: row.preview_name,
          mimeType: row.preview_mime_type,
          size: Number(row.preview_size || 0),
          imageUrl: '',
        }
      : null,
    commentCount: Number(row.comment_count || 0),
    comments: Array.isArray(row.comments) ? row.comments : [],
    respondedAt: row.responded_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

function mapReview(row, annotations = [], packageItems = []) {
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
    clientEmail: row.client_email || '',
    approvalId: row.approval_id,
    title: row.title || row.project_name,
    body: row.body || '',
    dueAt: row.due_at || null,
    artworkId: row.artwork_file_id,
    artworkVersionId: row.artwork_file_id,
    artwork,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    closedAt: row.closed_at,
    annotations,
    packageItems,
  }
}

function mapProjectComment(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    approvalId: row.approval_id,
    reviewItemId: row.review_item_id || null,
    bucketId: row.bucket_id || null,
    taskId: row.task_id || null,
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

function mapIntegrationConnection(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    provider: row.provider,
    externalConnectionId: row.external_connection_id || null,
    externalConnectionName: row.external_connection_name,
    displayName: row.display_name || row.provider,
    status: row.status,
    scopes: parsePermissions(row.scopes_json),
    lastError: row.last_error || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at || null,
  }
}

function mapIntegrationExecution(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    provider: row.provider,
    connectionId: row.connection_id,
    action: row.action,
    riskLevel: row.risk_level,
    status: row.status,
    durationMs: row.duration_ms,
    source: row.source,
    errorCode: row.error_code || null,
    createdAt: row.created_at,
  }
}

function mapGoogleDriveSelection(row) {
  if (!row) return null
  return {
    driveFileId: row.drive_file_id,
    rootFileId: row.root_file_id,
    name: row.name,
    mimeType: row.mime_type,
    webViewLink: row.web_view_link,
    resourceKind: row.resource_kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    const { DataType, newDb } = await import('pg-mem')
    const memDb = newDb()
    memDb.public.registerFunction({
      name: 'trim',
      args: [DataType.text],
      returns: DataType.text,
      implementation: (value) => String(value).trim(),
    })
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
      if (
        cleanSql.toUpperCase().startsWith('SELECT') ||
        cleanSql.toUpperCase().startsWith('WITH') ||
        /\bRETURNING\b/i.test(cleanSql)
      ) {
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
    `CREATE TABLE IF NOT EXISTS platform_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
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
      avatar_url TEXT NOT NULL DEFAULT '',
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      disabled_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS hermes_user_preferences (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      preference_key TEXT NOT NULL,
      category TEXT NOT NULL
        CHECK (category IN ('response_preference', 'communication_style', 'approval_preference', 'working_convention')),
      value_json TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, preference_key)
    )`,
    `CREATE TABLE IF NOT EXISTS workspace_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      client_id TEXT,
      project_id TEXT,
      conversation_id TEXT,
      connection_id TEXT,
      source_channel TEXT,
      source_identifier TEXT,
      participant_refs_json TEXT NOT NULL DEFAULT '[]',
      payload_json TEXT NOT NULL DEFAULT '{}',
      importance INTEGER NOT NULL DEFAULT 50 CHECK (importance >= 0 AND importance <= 100),
      occurred_at TEXT NOT NULL,
      processed_at TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS decision_candidates (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      source_event_id TEXT REFERENCES workspace_events(id) ON DELETE SET NULL,
      source_type TEXT NOT NULL,
      source_id TEXT,
      object_type TEXT,
      object_id TEXT,
      action_type TEXT,
      target_type TEXT,
      source_state TEXT,
      destination_state TEXT,
      intent_type TEXT,
      expected_metric TEXT,
      expected_direction TEXT,
      candidate_text TEXT NOT NULL,
      rationale_text TEXT,
      detection_method TEXT NOT NULL,
      detection_confidence REAL NOT NULL CHECK (detection_confidence >= 0 AND detection_confidence <= 1),
      policy_version TEXT NOT NULL,
      machine_classification TEXT NOT NULL DEFAULT 'decision_candidate',
      machine_confidence REAL NOT NULL CHECK (machine_confidence >= 0 AND machine_confidence <= 1),
      human_classification TEXT,
      review_result TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'auto_promoted', 'confirmed', 'edited', 'rejected', 'expired')),
      promoted_decision_id TEXT,
      reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, source_event_id)
    )`,
    `CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL REFERENCES users(id),
      object_type TEXT NOT NULL,
      object_id TEXT,
      client_id TEXT,
      project_id TEXT,
      conversation_id TEXT,
      source_candidate_id TEXT REFERENCES decision_candidates(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      decision_text TEXT NOT NULL,
      rationale TEXT,
      intent TEXT NOT NULL,
      decided_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('draft', 'active', 'reviewed', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS decision_vectors (
      decision_id TEXT PRIMARY KEY REFERENCES decisions(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      object_type TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      source_state TEXT,
      destination_state TEXT,
      intent_type TEXT NOT NULL,
      expected_direction TEXT NOT NULL,
      vector_version TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS decision_expected_reactions (
      decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      metric_key TEXT NOT NULL,
      direction TEXT NOT NULL,
      expected_change REAL,
      confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
      created_at TEXT NOT NULL,
      PRIMARY KEY (decision_id, metric_key)
    )`,
    `CREATE TABLE IF NOT EXISTS decision_metrics (
      decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      metric_key TEXT NOT NULL,
      unit TEXT,
      baseline_value REAL,
      baseline_window_start TEXT,
      baseline_window_end TEXT,
      observed_value REAL,
      observation_window_start TEXT,
      observation_window_end TEXT,
      change_absolute REAL,
      change_percent REAL,
      measurement_status TEXT NOT NULL
        CHECK (measurement_status IN ('measured', 'pending', 'inconclusive')),
      created_at TEXT NOT NULL,
      PRIMARY KEY (decision_id, metric_key)
    )`,
    `CREATE TABLE IF NOT EXISTS decision_outcomes (
      decision_id TEXT PRIMARY KEY REFERENCES decisions(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      outcome_direction TEXT NOT NULL
        CHECK (outcome_direction IN ('positive', 'negative', 'neutral', 'mixed', 'pending', 'inconclusive')),
      outcome_class TEXT NOT NULL,
      observed_reason TEXT,
      evidence_confidence REAL NOT NULL CHECK (evidence_confidence >= 0 AND evidence_confidence <= 1),
      causal_confidence REAL CHECK (causal_confidence >= 0 AND causal_confidence <= 1),
      confidence_version TEXT NOT NULL,
      reviewed_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS decision_evidence (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      relation TEXT NOT NULL,
      summary TEXT NOT NULL,
      weight REAL NOT NULL CHECK (weight >= 0 AND weight <= 1),
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS decision_confounders (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
      factor_type TEXT NOT NULL,
      factor_value TEXT NOT NULL,
      significance REAL NOT NULL CHECK (significance >= 0 AND significance <= 1),
      evidence_source_id TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS decision_comparisons (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      decision_a_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
      decision_b_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
      structural_similarity REAL NOT NULL CHECK (structural_similarity >= 0 AND structural_similarity <= 1),
      contextual_similarity REAL CHECK (contextual_similarity >= 0 AND contextual_similarity <= 1),
      evidence_confidence REAL NOT NULL CHECK (evidence_confidence >= 0 AND evidence_confidence <= 1),
      recency_relevance REAL NOT NULL CHECK (recency_relevance >= 0 AND recency_relevance <= 1),
      comparison_confidence REAL NOT NULL CHECK (comparison_confidence >= 0 AND comparison_confidence <= 1),
      comparable INTEGER CHECK (comparable IN (0, 1)),
      shared_factors_json TEXT NOT NULL DEFAULT '[]',
      material_differences_json TEXT NOT NULL DEFAULT '[]',
      comparison_version TEXT NOT NULL,
      model_version TEXT,
      semantic_status TEXT NOT NULL DEFAULT 'unavailable'
        CHECK (semantic_status IN ('pending', 'completed', 'unavailable')),
      semantic_explanation TEXT,
      semantic_error_code TEXT,
      evidence_pack_version TEXT,
      semantic_assessment_version TEXT,
      confidence_model_version TEXT NOT NULL DEFAULT 'comparison-confidence-v1',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, decision_a_id, decision_b_id, comparison_version)
    )`,
    `CREATE TABLE IF NOT EXISTS decision_observation_reviews (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
      metric_key TEXT NOT NULL,
      scheduled_by TEXT NOT NULL REFERENCES users(id),
      due_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'due', 'completed', 'cancelled')),
      notified_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, decision_id, metric_key)
    )`,
    `CREATE TABLE IF NOT EXISTS decision_comparison_reviews (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      comparison_id TEXT NOT NULL REFERENCES decision_comparisons(id) ON DELETE CASCADE,
      reviewed_by TEXT NOT NULL REFERENCES users(id),
      review_action TEXT NOT NULL
        CHECK (review_action IN ('confirmed', 'corrected', 'rejected')),
      comparable INTEGER NOT NULL CHECK (comparable IN (0, 1)),
      contextual_similarity REAL NOT NULL
        CHECK (contextual_similarity >= 0 AND contextual_similarity <= 1),
      shared_factors_json TEXT NOT NULL DEFAULT '[]',
      material_differences_json TEXT NOT NULL DEFAULT '[]',
      explanation TEXT NOT NULL,
      comparison_confidence REAL NOT NULL
        CHECK (comparison_confidence >= 0 AND comparison_confidence <= 1),
      confidence_model_version TEXT NOT NULL,
      review_version TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS decision_learning_models (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      model_type TEXT NOT NULL
        CHECK (model_type IN ('structural_similarity', 'outcome_prediction')),
      model_version TEXT NOT NULL,
      parameters_json TEXT NOT NULL,
      training_metrics_json TEXT NOT NULL,
      training_data_hash TEXT NOT NULL,
      sample_size INTEGER NOT NULL CHECK (sample_size >= 0),
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'superseded')),
      active_key TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (workspace_id, model_type, model_version),
      UNIQUE (workspace_id, model_type, active_key)
    )`,
    `CREATE TABLE IF NOT EXISTS decision_patterns (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      pattern_key TEXT NOT NULL,
      object_type TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      intent_type TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      sample_size INTEGER NOT NULL CHECK (sample_size >= 3),
      positive_count INTEGER NOT NULL CHECK (positive_count >= 0),
      negative_count INTEGER NOT NULL CHECK (negative_count >= 0),
      neutral_count INTEGER NOT NULL CHECK (neutral_count >= 0),
      mean_change_percent REAL NOT NULL,
      standard_deviation REAL NOT NULL CHECK (standard_deviation >= 0),
      dominant_direction TEXT NOT NULL
        CHECK (dominant_direction IN ('positive', 'negative', 'neutral', 'mixed')),
      evidence_confidence REAL NOT NULL
        CHECK (evidence_confidence >= 0 AND evidence_confidence <= 1),
      causal_confidence REAL NOT NULL
        CHECK (causal_confidence >= 0 AND causal_confidence <= 1),
      pattern_confidence REAL NOT NULL
        CHECK (pattern_confidence >= 0 AND pattern_confidence <= 1),
      source_decision_ids_json TEXT NOT NULL,
      detector_version TEXT NOT NULL,
      status TEXT NOT NULL
        CHECK (status IN ('emerging', 'active', 'retired')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, pattern_key, detector_version)
    )`,
    `CREATE TABLE IF NOT EXISTS decision_predictions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
      metric_key TEXT NOT NULL,
      pattern_id TEXT NOT NULL REFERENCES decision_patterns(id) ON DELETE CASCADE,
      predicted_direction TEXT NOT NULL
        CHECK (predicted_direction IN ('positive', 'negative', 'neutral', 'mixed')),
      predicted_change_percent REAL NOT NULL,
      interval_low REAL NOT NULL,
      interval_high REAL NOT NULL,
      prediction_confidence REAL NOT NULL
        CHECK (prediction_confidence >= 0 AND prediction_confidence <= 1),
      sample_size INTEGER NOT NULL CHECK (sample_size >= 3),
      source_decision_ids_json TEXT NOT NULL,
      model_version TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'measured', 'superseded')),
      actual_direction TEXT
        CHECK (actual_direction IS NULL OR actual_direction IN ('positive', 'negative', 'neutral')),
      actual_change_percent REAL,
      absolute_error REAL CHECK (absolute_error IS NULL OR absolute_error >= 0),
      measured_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, decision_id, metric_key, model_version)
    )`,
    `CREATE TABLE IF NOT EXISTS decision_warnings (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
      metric_key TEXT NOT NULL,
      pattern_id TEXT REFERENCES decision_patterns(id) ON DELETE SET NULL,
      prediction_id TEXT REFERENCES decision_predictions(id) ON DELETE SET NULL,
      warning_type TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
      summary TEXT NOT NULL,
      warning_confidence REAL NOT NULL
        CHECK (warning_confidence >= 0 AND warning_confidence <= 1),
      evidence_json TEXT NOT NULL,
      policy_version TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'acknowledged', 'dismissed', 'resolved')),
      notified_at TEXT,
      reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, decision_id, metric_key, warning_type, policy_version)
    )`,
    `CREATE TABLE IF NOT EXISTS decision_causal_assessments (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
      metric_key TEXT NOT NULL,
      design_type TEXT NOT NULL
        CHECK (design_type IN ('observational_pre_post', 'controlled_before_after')),
      claim_level TEXT NOT NULL
        CHECK (claim_level IN ('association_only', 'controlled_estimate')),
      effect_estimate REAL,
      effect_unit TEXT,
      control_baseline_value REAL,
      control_observed_value REAL,
      evidence_confidence REAL NOT NULL
        CHECK (evidence_confidence >= 0 AND evidence_confidence <= 1),
      causal_confidence REAL NOT NULL
        CHECK (causal_confidence >= 0 AND causal_confidence <= 1),
      inference_confidence REAL NOT NULL
        CHECK (inference_confidence >= 0 AND inference_confidence <= 1),
      confounder_count INTEGER NOT NULL CHECK (confounder_count >= 0),
      assumptions_json TEXT NOT NULL,
      model_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, decision_id, metric_key, model_version)
    )`,
    `ALTER TABLE decision_comparisons ADD COLUMN IF NOT EXISTS semantic_status TEXT NOT NULL DEFAULT 'unavailable'
      CHECK (semantic_status IN ('pending', 'completed', 'unavailable'))`,
    `ALTER TABLE decision_comparisons ADD COLUMN IF NOT EXISTS semantic_explanation TEXT`,
    `ALTER TABLE decision_comparisons ADD COLUMN IF NOT EXISTS semantic_error_code TEXT`,
    `ALTER TABLE decision_comparisons ADD COLUMN IF NOT EXISTS evidence_pack_version TEXT`,
    `ALTER TABLE decision_comparisons ADD COLUMN IF NOT EXISTS semantic_assessment_version TEXT`,
    `ALTER TABLE decision_comparisons ADD COLUMN IF NOT EXISTS confidence_model_version TEXT NOT NULL DEFAULT 'comparison-confidence-v1'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT ''`,
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
    `CREATE TABLE IF NOT EXISTS mcp_invocations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      service_id TEXT NOT NULL,
      tool_id TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
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
    `CREATE TABLE IF NOT EXISTS mail_accounts (
      workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      connected_by TEXT NOT NULL REFERENCES users(id),
      email TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'custom',
      password_ciphertext TEXT NOT NULL,
      password_iv TEXT NOT NULL,
      password_tag TEXT NOT NULL,
      imap_host TEXT NOT NULL,
      imap_port INTEGER NOT NULL,
      imap_secure ${isSqlite ? 'INTEGER NOT NULL DEFAULT 1 CHECK (imap_secure IN (0, 1))' : 'BOOLEAN NOT NULL DEFAULT TRUE'},
      smtp_host TEXT NOT NULL,
      smtp_port INTEGER NOT NULL,
      smtp_secure ${isSqlite ? 'INTEGER NOT NULL DEFAULT 1 CHECK (smtp_secure IN (0, 1))' : 'BOOLEAN NOT NULL DEFAULT TRUE'},
      status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error')),
      last_seen_uid INTEGER NOT NULL DEFAULT 0,
      last_synced_at TEXT,
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
    `CREATE TABLE IF NOT EXISTS integration_connections (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      provider TEXT NOT NULL,
      external_connection_id TEXT,
      external_connection_name TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'connecting'
        CHECK (status IN ('available', 'connecting', 'connected', 'expired', 'error', 'disabled')),
      scopes_json TEXT NOT NULL DEFAULT '[]',
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_used_at TEXT,
      UNIQUE (workspace_id, provider, external_connection_name)
    )`,
    `CREATE TABLE IF NOT EXISTS integration_executions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      provider TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      action TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
      duration_ms INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL CHECK (source IN ('user', 'ai', 'automation', 'workflow', 'api')),
      error_code TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workspace_settings (
      workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      logo_url TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      timezone TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
      travel_mode TEXT NOT NULL DEFAULT 'none',
      travel_location TEXT NOT NULL DEFAULT '',
      storefront_enabled ${isSqlite ? 'INTEGER NOT NULL DEFAULT 0 CHECK (storefront_enabled IN (0, 1))' : 'BOOLEAN NOT NULL DEFAULT FALSE'},
      updated_at TEXT NOT NULL
    )`,
    `ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS storefront_enabled ${isSqlite ? 'INTEGER NOT NULL DEFAULT 0 CHECK (storefront_enabled IN (0, 1))' : 'BOOLEAN NOT NULL DEFAULT FALSE'}`,
    `CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      plan_code TEXT NOT NULL CHECK (plan_code IN ('solo', 'pro', 'studio')),
      name TEXT NOT NULL,
      region TEXT NOT NULL CHECK (region IN ('ZA', 'US', 'UK', 'OTHER')),
      currency TEXT NOT NULL,
      symbol TEXT NOT NULL,
      monthly_price REAL NOT NULL,
      yearly_price REAL NOT NULL,
      per_user ${isSqlite ? 'INTEGER NOT NULL DEFAULT 0' : 'BOOLEAN NOT NULL DEFAULT FALSE'},
      recommended ${isSqlite ? 'INTEGER NOT NULL DEFAULT 0' : 'BOOLEAN NOT NULL DEFAULT FALSE'},
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE (plan_code, region)
    )`,
    `CREATE TABLE IF NOT EXISTS subscriptions (
      workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      plan_code TEXT NOT NULL DEFAULT 'solo' CHECK (plan_code IN ('solo', 'pro', 'studio')),
      billing_period TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('monthly', 'yearly')),
      region TEXT NOT NULL DEFAULT 'ZA' CHECK (region IN ('ZA', 'US', 'UK', 'OTHER')),
      status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'canceled', 'past_due')),
      trial_started_at TEXT NOT NULL,
      trial_ends_at TEXT NOT NULL,
      subscribed_at TEXT,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workspace_builder_configs (
      workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      required_setup INTEGER NOT NULL DEFAULT 0 CHECK (required_setup IN (0, 1)),
      status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started', 'in_progress', 'review', 'generating', 'completed')),
      step INTEGER NOT NULL DEFAULT 0 CHECK (step >= 0 AND step <= 9),
      answers_json TEXT NOT NULL DEFAULT '{}',
      recommendation_json TEXT NOT NULL DEFAULT '{}',
      ai_suggestions_json TEXT NOT NULL DEFAULT '[]',
      generated_json TEXT NOT NULL DEFAULT '{}',
      completed_at TEXT,
      created_at TEXT NOT NULL,
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
    `CREATE TABLE IF NOT EXISTS whatsapp_connections (
      workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      self_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'disconnected'
        CHECK (status IN ('disconnected', 'connecting', 'connected', 'error')),
      connected_jid TEXT,
      last_error TEXT NOT NULL DEFAULT '',
      notifications_enabled ${isSqlite ? 'INTEGER NOT NULL DEFAULT 0 CHECK (notifications_enabled IN (0, 1))' : 'BOOLEAN NOT NULL DEFAULT FALSE'},
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
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
    `CREATE TABLE IF NOT EXISTS agent_threads (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'lancee',
      external_thread_id TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, user_id, provider, external_thread_id)
    )`,
    `CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      thread_id TEXT NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
      objective TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled', 'budget_exceeded')),
      model TEXT,
      plan_json TEXT NOT NULL DEFAULT '[]',
      results_json TEXT NOT NULL DEFAULT '[]',
      pending_action_json TEXT,
      final_output TEXT,
      budget_json TEXT NOT NULL DEFAULT '{}',
      usage_json TEXT NOT NULL DEFAULT '{}',
      iterations INTEGER NOT NULL DEFAULT 0,
      tool_calls INTEGER NOT NULL DEFAULT 0,
      step_sequence INTEGER NOT NULL DEFAULT 0,
      event_sequence INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT
    )`,
    `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS step_sequence INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS event_sequence INTEGER NOT NULL DEFAULT 0`,
    `CREATE TABLE IF NOT EXISTS agent_steps (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      tool_id TEXT NOT NULL,
      arguments_json TEXT NOT NULL DEFAULT '{}',
      arguments_hash TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'waiting_approval', 'running', 'completed', 'failed', 'denied', 'cancelled')),
      result_json TEXT,
      error_code TEXT,
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (run_id, sequence)
    )`,
    `CREATE TABLE IF NOT EXISTS agent_approvals (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      step_id TEXT NOT NULL REFERENCES agent_steps(id) ON DELETE CASCADE,
      tool_id TEXT NOT NULL,
      arguments_hash TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'denied', 'consumed', 'expired')),
      requested_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      decided_by TEXT REFERENCES users(id),
      decided_at TEXT,
      consumed_at TEXT,
      reason TEXT,
      UNIQUE (step_id)
    )`,
    `CREATE TABLE IF NOT EXISTS agent_run_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warning', 'error')),
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      data_json TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (run_id, sequence)
    )`,
    `CREATE TABLE IF NOT EXISTS execution_jobs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      requested_by TEXT NOT NULL REFERENCES users(id),
      agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
      input_json TEXT NOT NULL DEFAULT '{}',
      output_json TEXT,
      error_code TEXT,
      error_message TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      available_at TEXT NOT NULL,
      lease_owner TEXT,
      lease_expires_at TEXT,
      heartbeat_at TEXT,
      idempotency_key TEXT,
      input_hash TEXT NOT NULL DEFAULT '',
      event_sequence INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      UNIQUE (workspace_id, kind, idempotency_key)
    )`,
    `ALTER TABLE execution_jobs ADD COLUMN IF NOT EXISTS input_hash TEXT NOT NULL DEFAULT ''`,
    `CREATE TABLE IF NOT EXISTS execution_job_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES execution_jobs(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warning', 'error')),
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      data_json TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (job_id, sequence)
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
      instruction_template TEXT NOT NULL DEFAULT '',
      execution TEXT NOT NULL DEFAULT 'core' CHECK (execution IN ('core', 'edge')),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'paused', 'draft')),
      tools_json TEXT NOT NULL DEFAULT '[]',
      runs INTEGER NOT NULL DEFAULT 0,
      success_rate REAL NOT NULL DEFAULT 0,
      last_run_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `ALTER TABLE automations ADD COLUMN IF NOT EXISTS instruction_template TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE automations ADD COLUMN IF NOT EXISTS execution TEXT NOT NULL DEFAULT 'core'`,
    `UPDATE automations
     SET tools_json = '["workspace.summary"]'
     WHERE execution = 'core'
       AND (tools_json IS NULL OR tools_json = '' OR tools_json = '[]')`,
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
    `CREATE TABLE IF NOT EXISTS mail_automation_rules (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
      created_by TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      sender TEXT NOT NULL DEFAULT '',
      recipient TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      keywords_json TEXT NOT NULL DEFAULT '[]',
      match_mode TEXT NOT NULL DEFAULT 'all' CHECK (match_mode IN ('all', 'any')),
      instruction TEXT NOT NULL,
      enabled ${isSqlite ? 'INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))' : 'BOOLEAN NOT NULL DEFAULT TRUE'},
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS mail_rule_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      rule_id TEXT NOT NULL REFERENCES mail_automation_rules(id) ON DELETE CASCADE,
      message_key TEXT NOT NULL,
      run_id TEXT REFERENCES automation_runs(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, rule_id, message_key)
    )`,
    `CREATE TABLE IF NOT EXISTS automation_schedules (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
      created_by TEXT NOT NULL REFERENCES users(id),
      instruction TEXT NOT NULL,
      provider TEXT,
      run_at TEXT NOT NULL,
      interval_seconds INTEGER,
      status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'running', 'completed', 'failed', 'cancelled')),
      last_run_id TEXT REFERENCES automation_runs(id) ON DELETE SET NULL,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      notes TEXT NOT NULL DEFAULT '',
      logo_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, name)
    )`,
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT ''`,
    `CREATE TABLE IF NOT EXISTS storefront_domains (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      domain TEXT NOT NULL,
      verification_token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified')),
      created_at TEXT NOT NULL,
      verified_at TEXT,
      UNIQUE (workspace_id, domain)
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
    `CREATE TABLE IF NOT EXISTS project_tasks (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      bucket_id TEXT NOT NULL,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS completed_at TEXT`,
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
      due_at TEXT,
      created_at TEXT NOT NULL,
      responded_at TEXT
    )`,
    `ALTER TABLE client_approvals ADD COLUMN IF NOT EXISTS due_at TEXT`,
    `CREATE TABLE IF NOT EXISTS project_comments (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      approval_id TEXT REFERENCES client_approvals(id) ON DELETE SET NULL,
      review_item_id TEXT,
      bucket_id TEXT,
      task_id TEXT REFERENCES project_tasks(id) ON DELETE SET NULL,
      author_type TEXT NOT NULL CHECK (author_type IN ('workspace', 'client')),
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS review_item_id TEXT`,
    `ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS bucket_id TEXT`,
    `ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS task_id TEXT REFERENCES project_tasks(id) ON DELETE SET NULL`,
    `CREATE TABLE IF NOT EXISTS review_package_items (
      id TEXT PRIMARY KEY,
      approval_id TEXT NOT NULL REFERENCES client_approvals(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      bucket_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'needs_changes', 'approved')),
      position INTEGER NOT NULL DEFAULT 0,
      preview_file_id TEXT,
      responded_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (approval_id, bucket_id)
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
    `CREATE TABLE IF NOT EXISTS google_drive_selections (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      drive_file_id TEXT NOT NULL,
      root_file_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      web_view_link TEXT,
      resource_kind TEXT NOT NULL CHECK (resource_kind IN ('folder', 'file')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, drive_file_id)
    )`,
    `CREATE TABLE IF NOT EXISTS workspace_documents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size INTEGER NOT NULL DEFAULT 0,
      content_base64 TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      storage_point_id TEXT,
      drive_file_id TEXT,
      drive_web_view_link TEXT,
      synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `ALTER TABLE workspace_documents ADD COLUMN IF NOT EXISTS storage_point_id TEXT`,
    `CREATE TABLE IF NOT EXISTS workspace_document_folders (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES workspace_document_folders(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `ALTER TABLE workspace_documents ADD COLUMN IF NOT EXISTS folder_id TEXT REFERENCES workspace_document_folders(id) ON DELETE SET NULL`,
    `CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      created_by TEXT NOT NULL REFERENCES users(id),
      run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      name TEXT NOT NULL,
      storage_document_id TEXT REFERENCES workspace_documents(id) ON DELETE SET NULL,
      size INTEGER NOT NULL DEFAULT 0,
      content_sha256 TEXT,
      storage_provider TEXT NOT NULL DEFAULT 'workspace_document',
      storage_key TEXT,
      external_url TEXT,
      source TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT,
      deleted_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS artifact_links (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      relation TEXT NOT NULL DEFAULT 'output',
      created_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, artifact_id, subject_type, subject_id, relation)
    )`,
    `CREATE TABLE IF NOT EXISTS workspace_cloud_links (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('drive', 'dropbox', 'onedrive', 'box', 'other')),
      label TEXT NOT NULL DEFAULT '',
      folder_url TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `ALTER TABLE workspace_cloud_links ADD COLUMN IF NOT EXISTS is_default INTEGER NOT NULL DEFAULT 0`,
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
    `CREATE INDEX IF NOT EXISTS idx_workspace_events_workspace_occurred
      ON workspace_events (workspace_id, occurred_at)`,
    `CREATE INDEX IF NOT EXISTS idx_hermes_preferences_user_category
      ON hermes_user_preferences (user_id, category, updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_workspace_events_entity
      ON workspace_events (workspace_id, entity_type, entity_id, occurred_at)`,
    `CREATE INDEX IF NOT EXISTS idx_workspace_events_unprocessed
      ON workspace_events (workspace_id, processed_at, occurred_at)`,
    `CREATE INDEX IF NOT EXISTS idx_decision_candidates_workspace_status
      ON decision_candidates (workspace_id, status, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_decisions_workspace_decided
      ON decisions (workspace_id, decided_at)`,
    `CREATE INDEX IF NOT EXISTS idx_decision_vectors_structural
      ON decision_vectors (workspace_id, action_type, object_type, target_type)`,
    `CREATE INDEX IF NOT EXISTS idx_decision_evidence_decision
      ON decision_evidence (workspace_id, decision_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_decision_confounders_decision
      ON decision_confounders (workspace_id, decision_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_decision_comparisons_decision
      ON decision_comparisons (workspace_id, decision_a_id, comparison_confidence)`,
    `CREATE INDEX IF NOT EXISTS idx_decision_observation_reviews_due
      ON decision_observation_reviews (status, due_at, workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_decision_observation_reviews_workspace
      ON decision_observation_reviews (workspace_id, decision_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_decision_comparison_reviews_comparison
      ON decision_comparison_reviews (workspace_id, comparison_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_decision_learning_models_active
      ON decision_learning_models (workspace_id, model_type, status)`,
    `CREATE INDEX IF NOT EXISTS idx_decision_patterns_workspace
      ON decision_patterns (workspace_id, status, pattern_confidence)`,
    `CREATE INDEX IF NOT EXISTS idx_decision_predictions_decision
      ON decision_predictions (workspace_id, decision_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_decision_warnings_workspace
      ON decision_warnings (workspace_id, status, severity, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_decision_causal_assessments_decision
      ON decision_causal_assessments (workspace_id, decision_id, metric_key)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_created
      ON agent_runs (workspace_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_threads_workspace_updated
      ON agent_threads (workspace_id, user_id, updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_steps_run_sequence
      ON agent_steps (run_id, sequence)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_approvals_pending
      ON agent_approvals (workspace_id, status, expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_run_events_run_sequence
      ON agent_run_events (run_id, sequence)`,
    `CREATE INDEX IF NOT EXISTS idx_execution_jobs_due
      ON execution_jobs (status, available_at, priority, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_execution_jobs_workspace_created
      ON execution_jobs (workspace_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_execution_job_events_sequence
      ON execution_job_events (job_id, sequence)`,
    `CREATE INDEX IF NOT EXISTS idx_artifacts_workspace_created
      ON artifacts (workspace_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_artifact_links_subject
      ON artifact_links (workspace_id, subject_type, subject_id)`,
    `CREATE INDEX IF NOT EXISTS idx_automation_run_events_run_sequence
      ON automation_run_events (run_id, sequence)`,
    `CREATE INDEX IF NOT EXISTS idx_automation_schedules_due
      ON automation_schedules (status, run_at)`,
    `CREATE INDEX IF NOT EXISTS idx_project_comments_workspace_project
      ON project_comments (workspace_id, project_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_review_package_items_approval
      ON review_package_items (approval_id, position)`,
    `CREATE INDEX IF NOT EXISTS idx_workspace_notifications_unread
      ON workspace_notifications (workspace_id, read_at, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_projects_workspace_status
      ON projects (workspace_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_project_tasks_workspace_project_bucket
      ON project_tasks (workspace_id, project_id, bucket_id, updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_clients_workspace_name
      ON clients (workspace_id, name)`,
    `CREATE INDEX IF NOT EXISTS idx_clients_workspace_email
      ON clients (workspace_id, email)`,
    `CREATE INDEX IF NOT EXISTS idx_drive_resource_links_client
      ON google_drive_resource_links (workspace_id, client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_drive_resource_links_project
      ON google_drive_resource_links (workspace_id, project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_drive_selections_root
      ON google_drive_selections (workspace_id, root_file_id)`,
    `CREATE INDEX IF NOT EXISTS idx_invoices_workspace_status
      ON invoices (workspace_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_idempotency_expiry
      ON idempotency_requests (expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_n8n_deliveries_workspace_created
      ON n8n_deliveries (workspace_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_mail_rules_workspace_enabled
      ON mail_automation_rules (workspace_id, enabled)`,
    `CREATE INDEX IF NOT EXISTS idx_mail_rule_events_workspace_created
      ON mail_rule_events (workspace_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_team_invitations_token
      ON team_invitations (token_hash, status)`,
    `CREATE INDEX IF NOT EXISTS idx_codex_device_user_code
      ON codex_device_authorizations (user_code_hash, status)`,
    `CREATE INDEX IF NOT EXISTS idx_codex_access_token
      ON codex_access_tokens (token_hash, revoked_at)`,
    `CREATE INDEX IF NOT EXISTS idx_integration_connections_workspace_provider
      ON integration_connections (workspace_id, provider, status)`,
    `CREATE INDEX IF NOT EXISTS idx_integration_executions_workspace_created
      ON integration_executions (workspace_id, created_at)`,
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

  // Phase 1 retired remote MCP access and per-service activation. Drop their
  // obsolete state after the active schema is ready; invocation audit remains.
  await query('DROP TABLE IF EXISTS mcp_service_state')
  await query('DROP TABLE IF EXISTS mcp_access')

  if (!isInMemory && !isSqlite) {
    for (const table of ['tenant_integration_tokens', 'integration_connections', 'integration_executions']) {
      await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      await query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`)
      await query(`DROP POLICY IF EXISTS tenant_isolation_policy ON ${table}`)
      await query(
        `CREATE POLICY tenant_isolation_policy ON ${table}
           FOR ALL
           USING (workspace_id = current_setting('app.current_tenant_id', true))
           WITH CHECK (workspace_id = current_setting('app.current_tenant_id', true))`,
      )
    }
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
     SELECT id, 'lancee-mcp', 1, $1 FROM workspaces WHERE 1 = 1
     ON CONFLICT (workspace_id, integration_id) DO UPDATE SET
       connected = 1,
       updated_at = EXCLUDED.updated_at`,
    [nowIso()],
  )
  await query(
    `DELETE FROM workspace_integrations WHERE integration_id = 'mcp-grid'`,
  )
  await query(
    `INSERT INTO workspace_integrations (
       workspace_id, integration_id, connected, updated_at
     )
     SELECT id, 'whatsapp', 0, $1 FROM workspaces WHERE 1 = 1
     ON CONFLICT (workspace_id, integration_id) DO NOTHING`,
    [nowIso()],
  )
  await query(
    `INSERT INTO workspace_integrations (
       workspace_id, integration_id, connected, updated_at
     )
     SELECT id, 'mail', 0, $1 FROM workspaces WHERE 1 = 1
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
  for (const storageIntegrationId of ['dropbox', 'onedrive']) {
    await query(
      `INSERT INTO workspace_integrations (
         workspace_id, integration_id, connected, updated_at
       )
       SELECT id, $1, 0, $2 FROM workspaces WHERE 1 = 1
       ON CONFLICT (workspace_id, integration_id) DO NOTHING`,
      [storageIntegrationId, nowIso()],
    )
  }

  const planSeed = [
    { code: 'solo', name: 'Solo', region: 'ZA', currency: 'ZAR', symbol: 'R', monthly: 199.99, perUser: false, recommended: false, sort: 1 },
    { code: 'solo', name: 'Solo', region: 'US', currency: 'USD', symbol: '$', monthly: 15, perUser: false, recommended: false, sort: 1 },
    { code: 'solo', name: 'Solo', region: 'UK', currency: 'GBP', symbol: '£', monthly: 10, perUser: false, recommended: false, sort: 1 },
    { code: 'solo', name: 'Solo', region: 'OTHER', currency: 'USD', symbol: '$', monthly: 15, perUser: false, recommended: false, sort: 1 },
    { code: 'pro', name: 'Pro', region: 'ZA', currency: 'ZAR', symbol: 'R', monthly: 399.99, perUser: false, recommended: true, sort: 2 },
    { code: 'pro', name: 'Pro', region: 'US', currency: 'USD', symbol: '$', monthly: 29, perUser: false, recommended: true, sort: 2 },
    { code: 'pro', name: 'Pro', region: 'UK', currency: 'GBP', symbol: '£', monthly: 20, perUser: false, recommended: true, sort: 2 },
    { code: 'pro', name: 'Pro', region: 'OTHER', currency: 'USD', symbol: '$', monthly: 29, perUser: false, recommended: true, sort: 2 },
    { code: 'studio', name: 'Studio', region: 'ZA', currency: 'ZAR', symbol: 'R', monthly: 799.99, perUser: true, recommended: false, sort: 3 },
    { code: 'studio', name: 'Studio', region: 'US', currency: 'USD', symbol: '$', monthly: 50, perUser: true, recommended: false, sort: 3 },
    { code: 'studio', name: 'Studio', region: 'UK', currency: 'GBP', symbol: '£', monthly: 38, perUser: true, recommended: false, sort: 3 },
    { code: 'studio', name: 'Studio', region: 'OTHER', currency: 'USD', symbol: '$', monthly: 50, perUser: true, recommended: false, sort: 3 },
  ]
  const seedTimestamp = nowIso()
  for (const plan of planSeed) {
    const seedId = `${plan.code}-${plan.region.toLowerCase()}`
    const yearly = Math.round(plan.monthly * 10 * 100) / 100
    await query(
      `INSERT INTO plans (
         id, plan_code, name, region, currency, symbol,
         monthly_price, yearly_price, per_user, recommended, sort_order, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [seedId, plan.code, plan.name, plan.region, plan.currency, plan.symbol,
        plan.monthly,
        yearly,
        isSqlite ? (plan.perUser ? 1 : 0) : plan.perUser,
        isSqlite ? (plan.recommended ? 1 : 0) : plan.recommended,
        plan.sort,
        seedTimestamp,
      ],
    )
  }
  const subscriptionBackfill = await query(`SELECT id, created_at FROM workspaces`)
  for (const workspace of subscriptionBackfill) {
    const trialStart = workspace.created_at || nowIso()
    const trialEnd = new Date(new Date(trialStart).getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
    await query(
      `INSERT INTO subscriptions (
         workspace_id, plan_code, billing_period, region, status,
         trial_started_at, trial_ends_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (workspace_id) DO NOTHING`,
      [workspace.id, 'solo', 'monthly', 'ZA', 'trial', trialStart, trialEnd, nowIso()],
    )
  }

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

  const defaultIntegrations = [
    { id: 'drive', connected: 0 },
    { id: 'dropbox', connected: 0 },
    { id: 'onedrive', connected: 0 },
    { id: 'paystack', connected: 0 },
    { id: 'n8n', connected: 0 },
    { id: 'lancee-mcp', connected: 1 },
    { id: 'codex-ai', connected: 0 },
    { id: 'codex-runtime', connected: 0 },
    { id: 'mail', connected: 0 },
    { id: 'whatsapp', connected: 0 },
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

  async function ensureClient({ selectedWorkspaceId, clientId, name, email = '' }) {
    if (clientId) {
      const existing = await getClientById(selectedWorkspaceId, clientId)
      if (existing) return existing
    }
    const normalizedEmail = String(email || '').trim().toLowerCase()
    if (normalizedEmail) {
      const emailMatches = await query(
        `SELECT * FROM clients
         WHERE workspace_id = $1 AND LOWER(TRIM(email)) = LOWER($2)
         ORDER BY updated_at DESC
         LIMIT 1`,
        [selectedWorkspaceId, normalizedEmail],
      )
      if (emailMatches[0]) return emailMatches[0]
    }
    const normalizedName = String(name || normalizedEmail || '').trim()
    if (!normalizedName) throw new Error('A client name or email is required.')
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
      `${selectedWorkspaceId}:${(normalizedEmail || normalizedName).toLowerCase()}`,
    )
    await query(
      `INSERT INTO clients (
         id, workspace_id, name, email, company, status, notes, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, '', 'active', '', $5, $6)
       ON CONFLICT(id) DO NOTHING`,
      [id, selectedWorkspaceId, normalizedName, normalizedEmail, timestamp, timestamp],
    )
    return await getClientById(selectedWorkspaceId, id)
  }

  const artifactSubjectTables = new Map([
    ['agent_run', 'agent_runs'],
    ['agent_step', 'agent_steps'],
    ['agent_thread', 'agent_threads'],
    ['automation', 'automations'],
    ['automation_run', 'automation_runs'],
    ['client', 'clients'],
    ['execution_job', 'execution_jobs'],
    ['project', 'projects'],
    ['project_file', 'project_files'],
    ['workspace_document', 'workspace_documents'],
  ])

  async function artifactSubjectExists(selectedWorkspaceId, subjectType, subjectId) {
    if (subjectType === 'workspace') return subjectId === selectedWorkspaceId
    const table = artifactSubjectTables.get(subjectType)
    if (!table) return false
    const rows = await query(
      `SELECT id FROM ${table} WHERE workspace_id = $1 AND id = $2`,
      [selectedWorkspaceId, subjectId],
    )
    return rows.length > 0
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

    async getRegistrationEnabled(defaultValue = true) {
      const rows = await query(
        `SELECT setting_value FROM platform_settings WHERE setting_key = 'registration_enabled' LIMIT 1`,
      )
      return rows[0] ? rows[0].setting_value === 'true' : Boolean(defaultValue)
    },

    async setRegistrationEnabled(enabled) {
      await query(
        `INSERT INTO platform_settings (setting_key, setting_value, updated_at)
         VALUES ('registration_enabled', $1, $2)
         ON CONFLICT (setting_key) DO UPDATE SET
           setting_value = EXCLUDED.setting_value,
           updated_at = EXCLUDED.updated_at`,
        [enabled ? 'true' : 'false', nowIso()],
      )
      return Boolean(enabled)
    },

    async getAdminDashboard() {
      const thirtyDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()

      const [userRows, workspaceRows, apiRows, logRows, runRows, databaseInfo] =
        await Promise.all([
          query(
            `SELECT users.id, users.email, users.name, users.created_at, users.disabled_at,
                    workspace_members.workspace_id, workspace_members.role,
                    workspaces.name AS workspace_name
             FROM users
             LEFT JOIN workspace_members ON workspace_members.user_id = users.id
             LEFT JOIN workspaces ON workspaces.id = workspace_members.workspace_id
             ORDER BY users.created_at DESC`,
          ),
          query(
            `SELECT workspaces.id, workspaces.name, workspaces.created_at,
                    (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = workspaces.id) AS member_count,
                    (SELECT COUNT(*) FROM clients WHERE workspace_id = workspaces.id) AS client_count,
                    (SELECT COUNT(*) FROM projects WHERE workspace_id = workspaces.id) AS project_count,
                    (SELECT COALESCE(SUM(request_count), 0) FROM api_request_metrics WHERE workspace_id = workspaces.id) AS api_calls
             FROM workspaces
             ORDER BY workspaces.created_at DESC`,
          ),
          query(
            `SELECT metric_date,
                    COALESCE(SUM(request_count), 0) AS request_count,
                    COALESCE(SUM(error_count), 0) AS error_count
             FROM api_request_metrics
             WHERE metric_date >= $1
             GROUP BY metric_date
             ORDER BY metric_date ASC`,
            [thirtyDaysAgo],
          ),
          query(
            `SELECT * FROM (
               SELECT agent_run_events.id, agent_run_events.workspace_id,
                      workspaces.name AS workspace_name, 'Agent' AS source,
                      agent_run_events.level, agent_run_events.event_type,
                      agent_run_events.message, agent_run_events.created_at
               FROM agent_run_events
               LEFT JOIN workspaces ON workspaces.id = agent_run_events.workspace_id
               UNION ALL
               SELECT execution_job_events.id, execution_job_events.workspace_id,
                      workspaces.name AS workspace_name, 'Worker' AS source,
                      execution_job_events.level, execution_job_events.event_type,
                      execution_job_events.message, execution_job_events.created_at
               FROM execution_job_events
               LEFT JOIN workspaces ON workspaces.id = execution_job_events.workspace_id
               UNION ALL
               SELECT automation_run_events.id, automation_run_events.workspace_id,
                      workspaces.name AS workspace_name, 'Automation' AS source,
                      automation_run_events.level, automation_run_events.event_type,
                      automation_run_events.message, automation_run_events.created_at
               FROM automation_run_events
               LEFT JOIN workspaces ON workspaces.id = automation_run_events.workspace_id
             ) AS platform_logs
             ORDER BY created_at DESC
             LIMIT 100`,
          ),
          query(
            `SELECT
               (SELECT COUNT(*) FROM agent_runs) AS agent_runs,
               (SELECT COUNT(*) FROM agent_runs WHERE status = 'completed') AS completed_agent_runs,
               (SELECT COUNT(*) FROM automation_runs) AS automation_runs,
               (SELECT COUNT(*) FROM execution_jobs WHERE status IN ('queued', 'running')) AS active_jobs,
               (SELECT COUNT(*) FROM users WHERE created_at >= $1) AS new_users,
               (SELECT COALESCE(SUM(request_count), 0) FROM api_request_metrics) AS api_calls,
               (SELECT COALESCE(SUM(error_count), 0) FROM api_request_metrics) AS api_errors`,
            [sevenDaysAgo],
          ),
          this.getDatabaseInfo(),
        ])

      const usersById = new Map()
      for (const row of userRows) {
        const user = usersById.get(row.id) || {
          id: row.id,
          email: row.email,
          name: row.name,
          createdAt: row.created_at,
          disabledAt: row.disabled_at || null,
          workspaces: [],
        }
        if (row.workspace_id) {
          user.workspaces.push({
            id: row.workspace_id,
            name: row.workspace_name,
            role: row.role,
          })
        }
        usersById.set(row.id, user)
      }

      const totals = runRows[0] || {}
      return {
        generatedAt: nowIso(),
        summary: {
          users: usersById.size,
          workspaces: workspaceRows.length,
          newUsers: Number(totals.new_users || 0),
          apiCalls: Number(totals.api_calls || 0),
          apiErrors: Number(totals.api_errors || 0),
          agentRuns: Number(totals.agent_runs || 0),
          completedAgentRuns: Number(totals.completed_agent_runs || 0),
          automationRuns: Number(totals.automation_runs || 0),
          activeJobs: Number(totals.active_jobs || 0),
        },
        users: [...usersById.values()],
        workspaces: workspaceRows.map((row) => ({
          id: row.id,
          name: row.name,
          createdAt: row.created_at,
          memberCount: Number(row.member_count || 0),
          clientCount: Number(row.client_count || 0),
          projectCount: Number(row.project_count || 0),
          apiCalls: Number(row.api_calls || 0),
        })),
        apiUsage: apiRows.map((row) => ({
          date: row.metric_date,
          calls: Number(row.request_count || 0),
          errors: Number(row.error_count || 0),
        })),
        logs: logRows.map((row) => ({
          id: row.id,
          workspaceId: row.workspace_id,
          workspace: row.workspace_name || 'Unknown workspace',
          source: row.source,
          level: row.level,
          eventType: row.event_type,
          message: row.message,
          createdAt: row.created_at,
        })),
        system: databaseInfo,
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
           users.avatar_url AS user_avatar_url,
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
           users.avatar_url AS user_avatar_url,
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
        .update(`${selectedWorkspaceId}:${serviceId}:${toolId}:${nowIso()}:${randomUUID()}`)
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

    async createAgentThread({
      workspaceId,
      userId,
      title = '',
      provider = 'lancee',
      externalThreadId = null,
      id: providedId,
    }) {
      const membership = await query(
        `SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, userId],
      )
      if (!membership.length) {
        throw codedError('AGENT_WORKSPACE_ACCESS_DENIED', 'The agent user does not belong to this workspace.')
      }
      if (externalThreadId) {
        const existing = await this.getAgentThreadByExternalId(
          workspaceId,
          userId,
          provider,
          externalThreadId,
        )
        if (existing) return existing
      }
      const timestamp = nowIso()
      const id = providedId || stableId(
        'athr',
        `${workspaceId}:${userId}:${provider}:${externalThreadId || randomUUID()}`,
      )
      await query(
        `INSERT INTO agent_threads (
           id, workspace_id, user_id, title, provider, external_thread_id,
           status, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8)`,
        [
          id,
          workspaceId,
          userId,
          String(title || '').slice(0, 240),
          String(provider || 'lancee').slice(0, 80),
          externalThreadId ? String(externalThreadId).slice(0, 500) : null,
          timestamp,
          timestamp,
        ],
      )
      return await this.getAgentThread(workspaceId, id, userId)
    },

    async getAgentThread(selectedWorkspaceId, id, userId = null) {
      const params = [selectedWorkspaceId, id]
      const userFilter = userId ? ` AND user_id = $3` : ''
      if (userId) params.push(userId)
      const rows = await query(
        `SELECT * FROM agent_threads
         WHERE workspace_id = $1 AND id = $2${userFilter}`,
        params,
      )
      return mapAgentThread(rows[0])
    },

    async getAgentThreadByExternalId(selectedWorkspaceId, userId, provider, externalThreadId) {
      const rows = await query(
        `SELECT * FROM agent_threads
         WHERE workspace_id = $1 AND user_id = $2
           AND provider = $3 AND external_thread_id = $4`,
        [selectedWorkspaceId, userId, provider, externalThreadId],
      )
      return mapAgentThread(rows[0])
    },

    async listAgentThreads(selectedWorkspaceId, userId, { status = null, limit = 100 } = {}) {
      const params = [selectedWorkspaceId, userId]
      const filters = ['workspace_id = $1', 'user_id = $2']
      if (status) {
        params.push(status)
        filters.push(`status = $${params.length}`)
      }
      params.push(Math.min(200, Math.max(1, Number(limit) || 100)))
      const rows = await query(
        `SELECT * FROM agent_threads
         WHERE ${filters.join(' AND ')}
         ORDER BY updated_at DESC
         LIMIT $${params.length}`,
        params,
      )
      return rows.map(mapAgentThread)
    },

    async archiveAgentThread(selectedWorkspaceId, id, userId) {
      const rows = await query(
        `UPDATE agent_threads
         SET status = 'archived', updated_at = $1
         WHERE workspace_id = $2 AND id = $3 AND user_id = $4
         RETURNING *`,
        [nowIso(), selectedWorkspaceId, id, userId],
      )
      return mapAgentThread(rows[0])
    },

    async createAgentRun({
      workspaceId,
      userId,
      threadId,
      objective,
      status = 'planned',
      model = null,
      plan = [],
      budget = {},
      id: providedId,
    }) {
      const allowedStatuses = new Set(['planned', 'queued', 'running'])
      if (!allowedStatuses.has(status)) {
        throw codedError('AGENT_RUN_INVALID_STATUS', 'A new agent run must be planned, queued, or running.')
      }
      const thread = await this.getAgentThread(workspaceId, threadId, userId)
      if (!thread || thread.status !== 'active') {
        throw codedError('AGENT_THREAD_NOT_FOUND', 'The active agent thread was not found in this workspace.')
      }
      const timestamp = nowIso()
      const id = providedId || stableId(
        'arun',
        `${workspaceId}:${threadId}:${userId}:${randomUUID()}`,
      )
      await query(
        `INSERT INTO agent_runs (
           id, workspace_id, user_id, thread_id, objective, status, model,
           plan_json, budget_json, created_at, updated_at, started_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          id,
          workspaceId,
          userId,
          threadId,
          String(objective || '').slice(0, 20_000),
          status,
          model ? String(model).slice(0, 160) : null,
          stableJson(plan || []),
          stableJson(budget || {}),
          timestamp,
          timestamp,
          status === 'running' ? timestamp : null,
        ],
      )
      await query(
        `UPDATE agent_threads SET updated_at = $1
         WHERE workspace_id = $2 AND id = $3 AND user_id = $4`,
        [timestamp, workspaceId, threadId, userId],
      )
      return await this.getAgentRun(workspaceId, id, userId)
    },

    async getAgentRun(selectedWorkspaceId, id, userId = null) {
      const params = [selectedWorkspaceId, id]
      const userFilter = userId ? ` AND user_id = $3` : ''
      if (userId) params.push(userId)
      const rows = await query(
        `SELECT * FROM agent_runs
         WHERE workspace_id = $1 AND id = $2${userFilter}`,
        params,
      )
      return mapAgentRun(rows[0])
    },

    async listAgentRuns(selectedWorkspaceId, {
      userId = null,
      threadId = null,
      status = null,
      limit = 100,
    } = {}) {
      const params = [selectedWorkspaceId]
      const filters = ['workspace_id = $1']
      for (const [column, value] of [
        ['user_id', userId],
        ['thread_id', threadId],
        ['status', status],
      ]) {
        if (value) {
          params.push(value)
          filters.push(`${column} = $${params.length}`)
        }
      }
      params.push(Math.min(200, Math.max(1, Number(limit) || 100)))
      const rows = await query(
        `SELECT * FROM agent_runs
         WHERE ${filters.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT $${params.length}`,
        params,
      )
      return rows.map(mapAgentRun)
    },

    async updateAgentRun(selectedWorkspaceId, id, fields = {}, expectedStatuses = null) {
      const allowedStatuses = new Set([
        'planned',
        'queued',
        'running',
        'waiting_approval',
        'completed',
        'failed',
        'cancelled',
        'budget_exceeded',
      ])
      if (fields.status !== undefined && !allowedStatuses.has(fields.status)) {
        throw codedError('AGENT_RUN_INVALID_STATUS', 'The requested agent run status is invalid.')
      }
      const assignments = []
      const params = []
      const set = (column, value) => {
        params.push(value)
        assignments.push(`${column} = $${params.length}`)
      }
      if (fields.status !== undefined) set('status', fields.status)
      if (fields.model !== undefined) set('model', fields.model ? String(fields.model).slice(0, 160) : null)
      if (fields.plan !== undefined) set('plan_json', stableJson(fields.plan || []))
      if (fields.results !== undefined) set('results_json', stableJson(fields.results || []))
      if (fields.pendingAction !== undefined) {
        set('pending_action_json', fields.pendingAction === null ? null : stableJson(fields.pendingAction))
      }
      if (fields.finalOutput !== undefined) set('final_output', fields.finalOutput === null ? null : String(fields.finalOutput))
      if (fields.budget !== undefined) set('budget_json', stableJson(fields.budget || {}))
      if (fields.usage !== undefined) set('usage_json', stableJson(fields.usage || {}))
      if (fields.iterations !== undefined) set('iterations', Math.max(0, Number(fields.iterations) || 0))
      if (fields.toolCalls !== undefined) set('tool_calls', Math.max(0, Number(fields.toolCalls) || 0))
      if (fields.errorCode !== undefined) set('error_code', fields.errorCode ? String(fields.errorCode).slice(0, 160) : null)
      if (fields.errorMessage !== undefined) set('error_message', fields.errorMessage ? String(fields.errorMessage).slice(0, 2_000) : null)
      const timestamp = nowIso()
      if (fields.status === 'running') {
        params.push(timestamp)
        assignments.push(`started_at = COALESCE(started_at, $${params.length})`)
      }
      if (['completed', 'failed', 'cancelled', 'budget_exceeded'].includes(fields.status)) {
        set('completed_at', timestamp)
      }
      set('updated_at', timestamp)
      if (assignments.length === 1) return await this.getAgentRun(selectedWorkspaceId, id)

      params.push(selectedWorkspaceId, id)
      const filters = [
        `workspace_id = $${params.length - 1}`,
        `id = $${params.length}`,
      ]
      const expected = Array.isArray(expectedStatuses)
        ? expectedStatuses
        : expectedStatuses
          ? [expectedStatuses]
          : []
      if (expected.length) {
        const placeholders = expected.map((value) => {
          params.push(value)
          return `$${params.length}`
        })
        filters.push(`status IN (${placeholders.join(', ')})`)
      }
      const rows = await query(
        `UPDATE agent_runs
         SET ${assignments.join(', ')}
         WHERE ${filters.join(' AND ')}
         RETURNING *`,
        params,
      )
      return mapAgentRun(rows[0])
    },

    async transitionAgentRun({ selectedWorkspaceId, workspaceId, id, fromStatuses, status, ...fields }) {
      return await this.updateAgentRun(
        selectedWorkspaceId || workspaceId,
        id,
        { ...fields, status },
        fromStatuses,
      )
    },

    async appendAgentRunEvent({
      workspaceId,
      runId,
      level = 'info',
      eventType,
      message = '',
      data = null,
    }) {
      const sequenceRows = await query(
        `UPDATE agent_runs
         SET event_sequence = event_sequence + 1
         WHERE workspace_id = $1 AND id = $2
         RETURNING event_sequence`,
        [workspaceId, runId],
      )
      if (!sequenceRows.length) return null
      const sequence = Number(sequenceRows[0].event_sequence)
      const createdAt = nowIso()
      const id = stableId('arevt', `${workspaceId}:${runId}:${sequence}`)
      await query(
        `INSERT INTO agent_run_events (
           id, workspace_id, run_id, sequence, level, event_type, message,
           data_json, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          workspaceId,
          runId,
          sequence,
          ['info', 'warning', 'error'].includes(level) ? level : 'info',
          String(eventType || 'log').slice(0, 120),
          String(message || '').slice(0, 2_000),
          data === null || data === undefined ? null : stableJson(data),
          createdAt,
        ],
      )
      return mapAgentRunEvent({
        id,
        run_id: runId,
        sequence,
        level: ['info', 'warning', 'error'].includes(level) ? level : 'info',
        event_type: String(eventType || 'log').slice(0, 120),
        message: String(message || '').slice(0, 2_000),
        data_json: data === null || data === undefined ? null : stableJson(data),
        created_at: createdAt,
      })
    },

    async listAgentRunEvents(selectedWorkspaceId, runId, { after = 0, limit = 500 } = {}) {
      const rows = await query(
        `SELECT * FROM agent_run_events
         WHERE workspace_id = $1 AND run_id = $2 AND sequence > $3
         ORDER BY sequence ASC
         LIMIT $4`,
        [
          selectedWorkspaceId,
          runId,
          Math.max(0, Number(after) || 0),
          Math.min(1_000, Math.max(1, Number(limit) || 500)),
        ],
      )
      return rows.map(mapAgentRunEvent)
    },

    async createAgentStep({
      workspaceId,
      runId,
      toolId,
      arguments: stepArguments = {},
      argumentsHash = null,
      riskLevel = 'read',
      status = 'pending',
      sequence: requestedSequence = null,
      id: providedId,
    }) {
      let sequence
      if (requestedSequence === null || requestedSequence === undefined) {
        const sequenceRows = await query(
          `UPDATE agent_runs
           SET step_sequence = step_sequence + 1, updated_at = $1
           WHERE workspace_id = $2 AND id = $3
           RETURNING step_sequence`,
          [nowIso(), workspaceId, runId],
        )
        if (!sequenceRows.length) return null
        sequence = Number(sequenceRows[0].step_sequence)
      } else {
        sequence = Math.max(1, Number(requestedSequence) || 1)
        const sequenceRows = await query(
          `UPDATE agent_runs
           SET step_sequence = CASE WHEN step_sequence < $1 THEN $1 ELSE step_sequence END,
               updated_at = $2
           WHERE workspace_id = $3 AND id = $4
           RETURNING id`,
          [sequence, nowIso(), workspaceId, runId],
        )
        if (!sequenceRows.length) return null
      }
      const argumentsJson = stableJson(stepArguments || {})
      const resolvedArgumentsHash = argumentsHash || createHash('sha256').update(argumentsJson).digest('hex')
      const timestamp = nowIso()
      const id = providedId || stableId('astep', `${workspaceId}:${runId}:${sequence}`)
      await query(
        `INSERT INTO agent_steps (
           id, workspace_id, run_id, sequence, tool_id, arguments_json,
           arguments_hash, risk_level, status, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id,
          workspaceId,
          runId,
          sequence,
          String(toolId || '').slice(0, 200),
          argumentsJson,
          String(resolvedArgumentsHash).slice(0, 128),
          String(riskLevel || 'read').slice(0, 80),
          status,
          timestamp,
          timestamp,
        ],
      )
      return await this.getAgentStep(workspaceId, id)
    },

    async getAgentStep(selectedWorkspaceId, id) {
      const rows = await query(
        `SELECT * FROM agent_steps WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, id],
      )
      return mapAgentStep(rows[0])
    },

    async listAgentSteps(selectedWorkspaceId, runId) {
      const rows = await query(
        `SELECT * FROM agent_steps
         WHERE workspace_id = $1 AND run_id = $2
         ORDER BY sequence ASC`,
        [selectedWorkspaceId, runId],
      )
      return rows.map(mapAgentStep)
    },

    async updateAgentStep(selectedWorkspaceId, id, fields = {}, expectedStatuses = null) {
      const allowedStatuses = new Set([
        'pending',
        'waiting_approval',
        'running',
        'completed',
        'failed',
        'denied',
        'cancelled',
      ])
      if (fields.status !== undefined && !allowedStatuses.has(fields.status)) {
        throw codedError('AGENT_STEP_INVALID_STATUS', 'The requested agent step status is invalid.')
      }
      const assignments = []
      const params = []
      const set = (column, value) => {
        params.push(value)
        assignments.push(`${column} = $${params.length}`)
      }
      if (fields.status !== undefined) set('status', fields.status)
      if (fields.result !== undefined) set('result_json', fields.result === null ? null : stableJson(fields.result))
      if (fields.errorCode !== undefined) set('error_code', fields.errorCode ? String(fields.errorCode).slice(0, 160) : null)
      if (fields.errorMessage !== undefined) set('error_message', fields.errorMessage ? String(fields.errorMessage).slice(0, 2_000) : null)
      const timestamp = nowIso()
      if (fields.status === 'running') {
        params.push(timestamp)
        assignments.push(`started_at = COALESCE(started_at, $${params.length})`)
      }
      if (['completed', 'failed', 'denied', 'cancelled'].includes(fields.status)) set('completed_at', timestamp)
      set('updated_at', timestamp)
      if (assignments.length === 1) return await this.getAgentStep(selectedWorkspaceId, id)
      params.push(selectedWorkspaceId, id)
      const filters = [
        `workspace_id = $${params.length - 1}`,
        `id = $${params.length}`,
      ]
      const expected = Array.isArray(expectedStatuses)
        ? expectedStatuses
        : expectedStatuses
          ? [expectedStatuses]
          : []
      if (expected.length) {
        const placeholders = expected.map((value) => {
          params.push(value)
          return `$${params.length}`
        })
        filters.push(`status IN (${placeholders.join(', ')})`)
      }
      const rows = await query(
        `UPDATE agent_steps SET ${assignments.join(', ')}
         WHERE ${filters.join(' AND ')}
         RETURNING *`,
        params,
      )
      return mapAgentStep(rows[0])
    },

    async requestAgentApproval({
      workspaceId,
      runId,
      stepId,
      toolId,
      argumentsHash,
      riskLevel,
      expiresAt,
      id: providedId,
    }) {
      const stepRows = await query(
        `SELECT * FROM agent_steps
         WHERE workspace_id = $1 AND run_id = $2 AND id = $3`,
        [workspaceId, runId, stepId],
      )
      const step = stepRows[0]
      if (!step) return null
      if (step.tool_id !== toolId || step.arguments_hash !== argumentsHash) {
        throw codedError('AGENT_APPROVAL_ARGUMENT_MISMATCH', 'The approval does not match the persisted agent step.')
      }
      const existingRows = await query(
        `SELECT * FROM agent_approvals
         WHERE workspace_id = $1 AND step_id = $2`,
        [workspaceId, stepId],
      )
      if (existingRows[0]) return mapAgentApproval(existingRows[0])
      const requestedAt = nowIso()
      const id = providedId || stableId('aapr', `${workspaceId}:${runId}:${stepId}`)
      const insertedRows = await query(
        `INSERT INTO agent_approvals (
           id, workspace_id, run_id, step_id, tool_id, arguments_hash,
           risk_level, status, requested_at, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)
         ON CONFLICT (step_id) DO NOTHING
         RETURNING *`,
        [id, workspaceId, runId, stepId, toolId, argumentsHash, riskLevel, requestedAt, expiresAt],
      )
      if (!insertedRows.length) {
        const racedRows = await query(
          `SELECT * FROM agent_approvals
           WHERE workspace_id = $1 AND step_id = $2`,
          [workspaceId, stepId],
        )
        return mapAgentApproval(racedRows[0])
      }
      await this.updateAgentStep(workspaceId, stepId, { status: 'waiting_approval' }, ['pending'])
      return mapAgentApproval(insertedRows[0])
    },

    async createAgentApproval(input) {
      return await this.requestAgentApproval(input)
    },

    async getAgentApproval(selectedWorkspaceId, id) {
      const rows = await query(
        `SELECT * FROM agent_approvals WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, id],
      )
      return mapAgentApproval(rows[0])
    },

    async listAgentApprovals(selectedWorkspaceId, {
      runId = null,
      status = null,
      limit = 100,
    } = {}) {
      const params = [selectedWorkspaceId]
      const filters = ['workspace_id = $1']
      if (runId) {
        params.push(runId)
        filters.push(`run_id = $${params.length}`)
      }
      if (status) {
        params.push(status)
        filters.push(`status = $${params.length}`)
      }
      params.push(Math.min(200, Math.max(1, Number(limit) || 100)))
      const rows = await query(
        `SELECT * FROM agent_approvals
         WHERE ${filters.join(' AND ')}
         ORDER BY requested_at DESC
         LIMIT $${params.length}`,
        params,
      )
      return rows.map(mapAgentApproval)
    },

    async decideAgentApproval({
      selectedWorkspaceId,
      workspaceId,
      id,
      decidedBy,
      decision,
      reason = '',
      now = nowIso(),
    }) {
      const resolvedWorkspaceId = selectedWorkspaceId || workspaceId
      if (!['approved', 'denied'].includes(decision)) {
        throw codedError('AGENT_APPROVAL_INVALID_DECISION', 'An approval decision must be approved or denied.')
      }
      const membership = await query(
        `SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [resolvedWorkspaceId, decidedBy],
      )
      if (!membership.length) return null
      await query(
        `UPDATE agent_approvals
         SET status = 'expired'
         WHERE workspace_id = $1 AND id = $2
           AND status = 'pending' AND expires_at <= $3`,
        [resolvedWorkspaceId, id, now],
      )
      const rows = await query(
        `UPDATE agent_approvals
         SET status = $1, decided_by = $2, decided_at = $3, reason = $4
         WHERE workspace_id = $5 AND id = $6
           AND status = 'pending' AND expires_at > $3
         RETURNING *`,
        [
          decision,
          decidedBy,
          now,
          String(reason || '').slice(0, 1_000),
          resolvedWorkspaceId,
          id,
        ],
      )
      return mapAgentApproval(rows[0])
    },

    async consumeAgentApproval({
      selectedWorkspaceId,
      workspaceId,
      id,
      toolId,
      argumentsHash,
      now = nowIso(),
    }) {
      const resolvedWorkspaceId = selectedWorkspaceId || workspaceId
      await query(
        `UPDATE agent_approvals
         SET status = 'expired'
         WHERE workspace_id = $1 AND id = $2
           AND status = 'approved' AND expires_at <= $3`,
        [resolvedWorkspaceId, id, now],
      )
      const rows = await query(
        `UPDATE agent_approvals
         SET status = 'consumed', consumed_at = $1
         WHERE workspace_id = $2 AND id = $3
           AND status = 'approved' AND consumed_at IS NULL
           AND expires_at > $1 AND tool_id = $4 AND arguments_hash = $5
         RETURNING *`,
        [now, resolvedWorkspaceId, id, toolId, argumentsHash],
      )
      return mapAgentApproval(rows[0])
    },

    async expireAgentApprovals(selectedWorkspaceId, cutoff = nowIso()) {
      const rows = await query(
        `UPDATE agent_approvals
         SET status = 'expired'
         WHERE workspace_id = $1
           AND status IN ('pending', 'approved')
           AND expires_at <= $2
         RETURNING id`,
        [selectedWorkspaceId, cutoff],
      )
      return rows.length
    },

    async enqueueExecutionJob({
      workspaceId,
      requestedBy,
      kind,
      input = {},
      agentRunId = null,
      priority = 0,
      maxAttempts = 3,
      availableAt = nowIso(),
      idempotencyKey = null,
      id: providedId,
    }) {
      const membership = await query(
        `SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, requestedBy],
      )
      if (!membership.length) {
        throw codedError('JOB_WORKSPACE_ACCESS_DENIED', 'The job requester does not belong to this workspace.')
      }
      if (agentRunId) {
        const run = await this.getAgentRun(workspaceId, agentRunId, requestedBy)
        if (!run) throw codedError('JOB_AGENT_RUN_NOT_FOUND', 'The referenced agent run was not found.')
      }
      const normalizedKind = String(kind || '').trim().slice(0, 120)
      if (!normalizedKind) throw codedError('JOB_KIND_REQUIRED', 'An execution job kind is required.')
      const inputJson = stableJson(input || {})
      const inputHash = createHash('sha256').update(inputJson).digest('hex')
      const normalizedIdempotencyKey = idempotencyKey
        ? String(idempotencyKey).trim().slice(0, 200)
        : null
      if (normalizedIdempotencyKey) {
        const existingRows = await query(
          `SELECT * FROM execution_jobs
           WHERE workspace_id = $1 AND kind = $2 AND idempotency_key = $3`,
          [workspaceId, normalizedKind, normalizedIdempotencyKey],
        )
        if (existingRows[0]) {
          const existing = mapExecutionJob(existingRows[0])
          if (existing.inputHash !== inputHash) {
            throw codedError(
              'JOB_IDEMPOTENCY_CONFLICT',
              'This execution job idempotency key was already used with different input.',
            )
          }
          return existing
        }
      }
      const depthRows = await query(
        `SELECT COUNT(*) AS count FROM execution_jobs
         WHERE workspace_id = $1 AND status IN ('queued', 'running')`,
        [workspaceId],
      )
      if (Number(depthRows[0]?.count || 0) >= 1_000) {
        throw codedError('JOB_QUEUE_FULL', 'The workspace execution queue has reached its 1,000-job limit.')
      }
      const timestamp = nowIso()
      const id = providedId || stableId(
        'xjob',
        `${workspaceId}:${normalizedKind}:${normalizedIdempotencyKey || randomUUID()}`,
      )
      const rows = await query(
        `INSERT INTO execution_jobs (
           id, workspace_id, requested_by, agent_run_id, kind, status,
           input_json, input_hash, priority, max_attempts, available_at,
           idempotency_key, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, 'queued', $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (workspace_id, kind, idempotency_key) DO NOTHING
         RETURNING *`,
        [
          id,
          workspaceId,
          requestedBy,
          agentRunId,
          normalizedKind,
          inputJson,
          inputHash,
          Math.max(-1_000, Math.min(1_000, Number(priority) || 0)),
          Math.max(1, Math.min(100, Number(maxAttempts) || 3)),
          availableAt,
          normalizedIdempotencyKey,
          timestamp,
          timestamp,
        ],
      )
      if (rows[0]) return mapExecutionJob(rows[0])
      const existingRows = await query(
        `SELECT * FROM execution_jobs
         WHERE workspace_id = $1 AND kind = $2 AND idempotency_key = $3`,
        [workspaceId, normalizedKind, normalizedIdempotencyKey],
      )
      const existing = mapExecutionJob(existingRows[0])
      if (!existing || existing.inputHash !== inputHash) {
        throw codedError('JOB_IDEMPOTENCY_CONFLICT', 'The execution job could not be enqueued idempotently.')
      }
      return existing
    },

    async enqueueJob(input) {
      return await this.enqueueExecutionJob(input)
    },

    async getExecutionJob(selectedWorkspaceId, id) {
      const rows = await query(
        `SELECT * FROM execution_jobs WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, id],
      )
      return mapExecutionJob(rows[0])
    },

    async getJob(selectedWorkspaceId, id) {
      return await this.getExecutionJob(selectedWorkspaceId, id)
    },

    async listExecutionJobs(selectedWorkspaceId, {
      status = null,
      kind = null,
      agentRunId = null,
      limit = 100,
    } = {}) {
      const params = [selectedWorkspaceId]
      const filters = ['workspace_id = $1']
      for (const [column, value] of [
        ['status', status],
        ['kind', kind],
        ['agent_run_id', agentRunId],
      ]) {
        if (value) {
          params.push(value)
          filters.push(`${column} = $${params.length}`)
        }
      }
      params.push(Math.min(500, Math.max(1, Number(limit) || 100)))
      const rows = await query(
        `SELECT * FROM execution_jobs
         WHERE ${filters.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT $${params.length}`,
        params,
      )
      return rows.map(mapExecutionJob)
    },

    async listJobs(selectedWorkspaceId, filters = {}) {
      return await this.listExecutionJobs(selectedWorkspaceId, filters)
    },

    async listExecutionWorkspaceIds() {
      const rows = await query(
        `SELECT DISTINCT workspace_id FROM execution_jobs
         WHERE status IN ('queued', 'running')
         ORDER BY workspace_id ASC`,
      )
      return rows.map((row) => row.workspace_id)
    },

    async listDueExecutionJobs(selectedWorkspaceId, now = nowIso(), limit = 50) {
      const rows = await query(
        `SELECT * FROM execution_jobs
         WHERE workspace_id = $1 AND status = 'queued'
           AND available_at <= $2 AND attempt_count < max_attempts
         ORDER BY priority DESC, available_at ASC, created_at ASC
         LIMIT $3`,
        [
          selectedWorkspaceId,
          now,
          Math.min(200, Math.max(1, Number(limit) || 50)),
        ],
      )
      return rows.map(mapExecutionJob)
    },

    async listDueJobs(selectedWorkspaceId, now = nowIso(), limit = 50) {
      return await this.listDueExecutionJobs(selectedWorkspaceId, now, limit)
    },

    async claimExecutionJob({
      selectedWorkspaceId,
      workspaceId,
      id,
      workerId,
      now = nowIso(),
      leaseSeconds = 60,
      leaseExpiresAt = null,
    }) {
      const resolvedWorkspaceId = selectedWorkspaceId || workspaceId
      const resolvedWorkerId = String(workerId || '').trim().slice(0, 200)
      if (!resolvedWorkerId) throw codedError('JOB_WORKER_REQUIRED', 'A worker id is required to claim a job.')
      const leaseUntil = leaseExpiresAt || new Date(
        Date.parse(now) + Math.max(5, Math.min(3_600, Number(leaseSeconds) || 60)) * 1_000,
      ).toISOString()
      const rows = await query(
        `UPDATE execution_jobs
         SET status = 'running', attempt_count = attempt_count + 1,
             lease_owner = $1, lease_expires_at = $2, heartbeat_at = $3,
             started_at = COALESCE(started_at, $3), updated_at = $3,
             error_code = NULL, error_message = NULL
         WHERE workspace_id = $4 AND id = $5 AND status = 'queued'
           AND available_at <= $3 AND attempt_count < max_attempts
         RETURNING *`,
        [resolvedWorkerId, leaseUntil, now, resolvedWorkspaceId, id],
      )
      return mapExecutionJob(rows[0])
    },

    async claimJob(input) {
      return await this.claimExecutionJob(input)
    },

    async claimNextExecutionJob({
      selectedWorkspaceId,
      workspaceId,
      workerId,
      now = nowIso(),
      leaseSeconds = 60,
    }) {
      const resolvedWorkspaceId = selectedWorkspaceId || workspaceId
      const candidates = await this.listDueExecutionJobs(resolvedWorkspaceId, now, 20)
      for (const candidate of candidates) {
        const claimed = await this.claimExecutionJob({
          selectedWorkspaceId: resolvedWorkspaceId,
          id: candidate.id,
          workerId,
          now,
          leaseSeconds,
        })
        if (claimed) return claimed
      }
      return null
    },

    async heartbeatExecutionJob({
      selectedWorkspaceId,
      workspaceId,
      id,
      workerId,
      now = nowIso(),
      leaseSeconds = 60,
      leaseExpiresAt = null,
    }) {
      const resolvedWorkspaceId = selectedWorkspaceId || workspaceId
      const leaseUntil = leaseExpiresAt || new Date(
        Date.parse(now) + Math.max(5, Math.min(3_600, Number(leaseSeconds) || 60)) * 1_000,
      ).toISOString()
      const rows = await query(
        `UPDATE execution_jobs
         SET heartbeat_at = $1, lease_expires_at = $2, updated_at = $1
         WHERE workspace_id = $3 AND id = $4 AND status = 'running'
           AND lease_owner = $5 AND lease_expires_at > $1
         RETURNING *`,
        [now, leaseUntil, resolvedWorkspaceId, id, workerId],
      )
      return mapExecutionJob(rows[0])
    },

    async heartbeatJob(input) {
      return await this.heartbeatExecutionJob(input)
    },

    async recoverExpiredExecutionJobs(selectedWorkspaceId, {
      now = nowIso(),
      retryAt = now,
    } = {}) {
      const failedRows = await query(
        `UPDATE execution_jobs
         SET status = 'failed', error_code = 'JOB_LEASE_EXPIRED',
             error_message = 'The execution lease expired after the final attempt.',
             lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
             completed_at = $1, updated_at = $1
         WHERE workspace_id = $2 AND status = 'running'
           AND lease_expires_at IS NOT NULL AND lease_expires_at <= $1
           AND attempt_count >= max_attempts
         RETURNING *`,
        [now, selectedWorkspaceId],
      )
      const retriedRows = await query(
        `UPDATE execution_jobs
         SET status = 'queued', available_at = $1,
             error_code = 'JOB_LEASE_EXPIRED',
             error_message = 'The execution lease expired and the job was requeued.',
             lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
             updated_at = $2
         WHERE workspace_id = $3 AND status = 'running'
           AND lease_expires_at IS NOT NULL AND lease_expires_at <= $2
           AND attempt_count < max_attempts
         RETURNING *`,
        [retryAt, now, selectedWorkspaceId],
      )
      return {
        failed: failedRows.map(mapExecutionJob),
        retried: retriedRows.map(mapExecutionJob),
      }
    },

    async recoverJobs(selectedWorkspaceId, options = {}) {
      return await this.recoverExpiredExecutionJobs(selectedWorkspaceId, options)
    },

    async completeExecutionJob({
      selectedWorkspaceId,
      workspaceId,
      id,
      workerId,
      output = null,
      now = nowIso(),
    }) {
      const resolvedWorkspaceId = selectedWorkspaceId || workspaceId
      const rows = await query(
        `UPDATE execution_jobs
         SET status = 'completed', output_json = $1,
             error_code = NULL, error_message = NULL,
             lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
             completed_at = $2, updated_at = $2
         WHERE workspace_id = $3 AND id = $4 AND status = 'running'
           AND lease_owner = $5 AND lease_expires_at > $2
         RETURNING *`,
        [
          output === null || output === undefined ? null : stableJson(output),
          now,
          resolvedWorkspaceId,
          id,
          workerId,
        ],
      )
      return mapExecutionJob(rows[0])
    },

    async completeJob(input) {
      return await this.completeExecutionJob(input)
    },

    async failExecutionJob({
      selectedWorkspaceId,
      workspaceId,
      id,
      workerId,
      errorCode = 'JOB_FAILED',
      errorMessage = 'The execution job failed.',
      retry = true,
      retryAt = nowIso(),
      now = nowIso(),
    }) {
      const resolvedWorkspaceId = selectedWorkspaceId || workspaceId
      const currentRows = await query(
        `SELECT * FROM execution_jobs
         WHERE workspace_id = $1 AND id = $2 AND status = 'running'
           AND lease_owner = $3 AND lease_expires_at > $4`,
        [resolvedWorkspaceId, id, workerId, now],
      )
      const current = currentRows[0]
      if (!current) return null
      const shouldRetry = Boolean(retry) && Number(current.attempt_count) < Number(current.max_attempts)
      const rows = await query(
        `UPDATE execution_jobs
         SET status = $1, available_at = $2,
             error_code = $3, error_message = $4,
             lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
             completed_at = $5, updated_at = $6
         WHERE workspace_id = $7 AND id = $8 AND status = 'running'
           AND lease_owner = $9
         RETURNING *`,
        [
          shouldRetry ? 'queued' : 'failed',
          shouldRetry ? retryAt : current.available_at,
          String(errorCode || 'JOB_FAILED').slice(0, 160),
          String(errorMessage || 'The execution job failed.').slice(0, 2_000),
          shouldRetry ? null : now,
          now,
          resolvedWorkspaceId,
          id,
          workerId,
        ],
      )
      return mapExecutionJob(rows[0])
    },

    async failJob(input) {
      return await this.failExecutionJob(input)
    },

    async retryExecutionJob(selectedWorkspaceId, id, {
      availableAt = nowIso(),
      resetAttempts = false,
    } = {}) {
      const rows = await query(
        `UPDATE execution_jobs
         SET status = 'queued', available_at = $1,
             attempt_count = CASE WHEN $2 = 1 THEN 0 ELSE attempt_count END,
             error_code = NULL, error_message = NULL, completed_at = NULL,
             lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
             updated_at = $3
         WHERE workspace_id = $4 AND id = $5 AND status = 'failed'
           AND ($2 = 1 OR attempt_count < max_attempts)
         RETURNING *`,
        [availableAt, resetAttempts ? 1 : 0, nowIso(), selectedWorkspaceId, id],
      )
      return mapExecutionJob(rows[0])
    },

    async cancelExecutionJob(selectedWorkspaceId, id, now = nowIso()) {
      const rows = await query(
        `UPDATE execution_jobs
         SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL,
             heartbeat_at = NULL, completed_at = $1, updated_at = $1
         WHERE workspace_id = $2 AND id = $3 AND status IN ('queued', 'running')
         RETURNING *`,
        [now, selectedWorkspaceId, id],
      )
      return mapExecutionJob(rows[0])
    },

    async cancelJob(selectedWorkspaceId, id, now = nowIso()) {
      return await this.cancelExecutionJob(selectedWorkspaceId, id, now)
    },

    async appendExecutionJobEvent({
      workspaceId,
      jobId,
      level = 'info',
      eventType,
      message = '',
      data = null,
    }) {
      const sequenceRows = await query(
        `UPDATE execution_jobs
         SET event_sequence = event_sequence + 1
         WHERE workspace_id = $1 AND id = $2
         RETURNING event_sequence`,
        [workspaceId, jobId],
      )
      if (!sequenceRows.length) return null
      const sequence = Number(sequenceRows[0].event_sequence)
      const createdAt = nowIso()
      const id = stableId('xjevt', `${workspaceId}:${jobId}:${sequence}`)
      const resolvedLevel = ['info', 'warning', 'error'].includes(level) ? level : 'info'
      const dataJson = data === null || data === undefined ? null : stableJson(data)
      await query(
        `INSERT INTO execution_job_events (
           id, workspace_id, job_id, sequence, level, event_type,
           message, data_json, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          workspaceId,
          jobId,
          sequence,
          resolvedLevel,
          String(eventType || 'log').slice(0, 120),
          String(message || '').slice(0, 2_000),
          dataJson,
          createdAt,
        ],
      )
      return mapExecutionJobEvent({
        id,
        job_id: jobId,
        sequence,
        level: resolvedLevel,
        event_type: String(eventType || 'log').slice(0, 120),
        message: String(message || '').slice(0, 2_000),
        data_json: dataJson,
        created_at: createdAt,
      })
    },

    async appendJobEvent(input) {
      return await this.appendExecutionJobEvent(input)
    },

    async listExecutionJobEvents(selectedWorkspaceId, jobId, { after = 0, limit = 500 } = {}) {
      const rows = await query(
        `SELECT * FROM execution_job_events
         WHERE workspace_id = $1 AND job_id = $2 AND sequence > $3
         ORDER BY sequence ASC
         LIMIT $4`,
        [
          selectedWorkspaceId,
          jobId,
          Math.max(0, Number(after) || 0),
          Math.min(1_000, Math.max(1, Number(limit) || 500)),
        ],
      )
      return rows.map(mapExecutionJobEvent)
    },

    async listJobEvents(selectedWorkspaceId, jobId, options = {}) {
      return await this.listExecutionJobEvents(selectedWorkspaceId, jobId, options)
    },

    async createArtifact({
      workspaceId,
      createdBy,
      runId = null,
      kind = 'file',
      mimeType = 'application/octet-stream',
      name,
      body = null,
      contentBase64 = null,
      storageDocumentId = null,
      size = null,
      contentSha256 = null,
      storageProvider = null,
      storageKey = null,
      externalUrl = null,
      source = 'runtime',
      metadata = {},
      expiresAt = null,
      id: providedId,
    }) {
      const membership = await query(
        `SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, createdBy],
      )
      if (!membership.length) {
        throw codedError('ARTIFACT_WORKSPACE_ACCESS_DENIED', 'The artifact creator does not belong to this workspace.')
      }
      if (runId && !(await this.getAgentRun(workspaceId, runId))) {
        throw codedError('ARTIFACT_AGENT_RUN_NOT_FOUND', 'The artifact agent run was not found in this workspace.')
      }
      let content = body
      if (content === null && contentBase64 !== null) content = Buffer.from(contentBase64, 'base64')
      if (content !== null && !Buffer.isBuffer(content)) content = Buffer.from(content)

      let document = null
      if (storageDocumentId) {
        document = await this.getWorkspaceDocument(workspaceId, storageDocumentId)
        if (!document) {
          throw codedError('ARTIFACT_DOCUMENT_NOT_FOUND', 'The artifact storage document was not found.')
        }
        if (content && (
          content.byteLength !== Number(document.size) ||
          createHash('sha256').update(content).digest('hex') !== document.sha256
        )) {
          throw codedError('ARTIFACT_INTEGRITY_ERROR', 'Artifact content does not match the storage document.')
        }
      } else if (content) {
        document = await this.createWorkspaceDocument({
          workspaceId,
          name,
          mimeType,
          body: content,
        })
        storageDocumentId = document.id
      }

      const resolvedSize = document ? Number(document.size) : Math.max(0, Number(size) || 0)
      const resolvedSha256 = document
        ? document.sha256
        : contentSha256
          ? String(contentSha256)
          : null
      if (size !== null && size !== undefined && Number(size) !== resolvedSize) {
        throw codedError('ARTIFACT_INTEGRITY_ERROR', 'Artifact size does not match its stored content.')
      }
      if (contentSha256 && resolvedSha256 !== contentSha256) {
        throw codedError('ARTIFACT_INTEGRITY_ERROR', 'Artifact checksum does not match its stored content.')
      }
      if (!storageDocumentId && !storageKey && !externalUrl) {
        throw codedError('ARTIFACT_STORAGE_REQUIRED', 'An artifact requires inline or external storage.')
      }
      const timestamp = nowIso()
      const id = providedId || stableId(
        'art',
        `${workspaceId}:${runId || ''}:${name}:${resolvedSha256 || storageKey || externalUrl}:${randomUUID()}`,
      )
      await query(
        `INSERT INTO artifacts (
           id, workspace_id, created_by, run_id, kind, mime_type, name,
           storage_document_id, size, content_sha256, storage_provider,
           storage_key, external_url, source, metadata_json,
           created_at, updated_at, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          id,
          workspaceId,
          createdBy,
          runId,
          String(kind || 'file').slice(0, 120),
          String(mimeType || 'application/octet-stream').slice(0, 200),
          String(name || '').slice(0, 500),
          storageDocumentId,
          resolvedSize,
          resolvedSha256,
          String(storageProvider || (storageDocumentId ? 'workspace_document' : 'external')).slice(0, 120),
          storageKey ? String(storageKey).slice(0, 1_000) : null,
          externalUrl ? String(externalUrl).slice(0, 4_000) : null,
          String(source || 'runtime').slice(0, 160),
          stableJson(metadata || {}),
          timestamp,
          timestamp,
          expiresAt,
        ],
      )
      return await this.getArtifact(workspaceId, id)
    },

    async getArtifact(selectedWorkspaceId, id, { includeDeleted = false } = {}) {
      const rows = await query(
        `SELECT * FROM artifacts
         WHERE workspace_id = $1 AND id = $2
           ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`,
        [selectedWorkspaceId, id],
      )
      return mapArtifact(rows[0])
    },

    async getArtifactByStorageDocumentId(selectedWorkspaceId, storageDocumentId) {
      const rows = await query(
        `SELECT * FROM artifacts
         WHERE workspace_id = $1 AND storage_document_id = $2
           AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [selectedWorkspaceId, storageDocumentId],
      )
      return mapArtifact(rows[0])
    },

    async listArtifacts(selectedWorkspaceId, {
      runId = null,
      kind = null,
      subjectType = null,
      subjectId = null,
      includeDeleted = false,
      limit = 200,
    } = {}) {
      const params = [selectedWorkspaceId]
      const filters = ['artifacts.workspace_id = $1']
      const joins = []
      if (!includeDeleted) filters.push('artifacts.deleted_at IS NULL')
      if (runId) {
        params.push(runId)
        filters.push(`artifacts.run_id = $${params.length}`)
      }
      if (kind) {
        params.push(kind)
        filters.push(`artifacts.kind = $${params.length}`)
      }
      if (subjectType || subjectId) {
        if (!subjectType || !subjectId) {
          throw codedError('ARTIFACT_LINK_FILTER_INVALID', 'Artifact subject type and id must be provided together.')
        }
        joins.push(
          `JOIN artifact_links links
             ON links.workspace_id = artifacts.workspace_id
            AND links.artifact_id = artifacts.id`,
        )
        params.push(subjectType, subjectId)
        filters.push(`links.subject_type = $${params.length - 1}`)
        filters.push(`links.subject_id = $${params.length}`)
      }
      params.push(Math.min(500, Math.max(1, Number(limit) || 200)))
      const rows = await query(
        `SELECT DISTINCT artifacts.*
         FROM artifacts
         ${joins.join('\n')}
         WHERE ${filters.join(' AND ')}
         ORDER BY artifacts.created_at DESC
         LIMIT $${params.length}`,
        params,
      )
      return rows.map(mapArtifact)
    },

    async getArtifactContent(selectedWorkspaceId, id) {
      const artifact = await this.getArtifact(selectedWorkspaceId, id)
      if (!artifact) return null
      if (!artifact.storageDocumentId) return { ...artifact, body: null }
      const document = await this.getWorkspaceDocument(
        selectedWorkspaceId,
        artifact.storageDocumentId,
      )
      if (!document) {
        throw codedError('ARTIFACT_INTEGRITY_ERROR', 'The artifact storage document is missing.')
      }
      const actualSha256 = createHash('sha256').update(document.body).digest('hex')
      if (
        Number(document.size) !== document.body.byteLength ||
        Number(artifact.size) !== document.body.byteLength ||
        document.sha256 !== actualSha256 ||
        artifact.sha256 !== actualSha256
      ) {
        throw codedError('ARTIFACT_INTEGRITY_ERROR', 'Stored artifact content failed its integrity check.')
      }
      return { ...artifact, body: document.body }
    },

    async updateArtifactContent(selectedWorkspaceId, id, {
      body,
      mimeType = null,
      metadata = undefined,
    }) {
      const artifact = await this.getArtifact(selectedWorkspaceId, id)
      if (!artifact) return null
      const content = Buffer.isBuffer(body) ? body : Buffer.from(body)
      const resolvedMimeType = mimeType || artifact.mimeType
      let document
      if (artifact.storageDocumentId) {
        document = await this.updateWorkspaceDocumentContent(
          selectedWorkspaceId,
          artifact.storageDocumentId,
          { body: content, mimeType: resolvedMimeType },
        )
      } else {
        document = await this.createWorkspaceDocument({
          workspaceId: selectedWorkspaceId,
          name: artifact.name,
          mimeType: resolvedMimeType,
          body: content,
        })
      }
      const timestamp = nowIso()
      const rows = await query(
        `UPDATE artifacts
         SET storage_document_id = $1, mime_type = $2, size = $3,
             content_sha256 = $4, storage_provider = 'workspace_document',
             storage_key = NULL, external_url = NULL,
             metadata_json = $5, updated_at = $6
         WHERE workspace_id = $7 AND id = $8 AND deleted_at IS NULL
         RETURNING *`,
        [
          document.id,
          resolvedMimeType,
          document.size,
          document.sha256,
          metadata === undefined ? stableJson(artifact.metadata || {}) : stableJson(metadata || {}),
          timestamp,
          selectedWorkspaceId,
          id,
        ],
      )
      return mapArtifact(rows[0])
    },

    async linkArtifact({
      workspaceId,
      artifactId,
      subjectType,
      subjectId,
      relation = 'output',
    }) {
      const artifact = await this.getArtifact(workspaceId, artifactId)
      if (!artifact) return null
      const normalizedSubjectType = String(subjectType || '').trim()
      if (!(await artifactSubjectExists(workspaceId, normalizedSubjectType, subjectId))) {
        throw codedError('ARTIFACT_SUBJECT_NOT_FOUND', 'The artifact link target was not found in this workspace.')
      }
      const createdAt = nowIso()
      await query(
        `INSERT INTO artifact_links (
           workspace_id, artifact_id, subject_type, subject_id, relation, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (workspace_id, artifact_id, subject_type, subject_id, relation)
         DO NOTHING`,
        [
          workspaceId,
          artifactId,
          normalizedSubjectType,
          String(subjectId),
          String(relation || 'output').slice(0, 120),
          createdAt,
        ],
      )
      return {
        workspaceId,
        artifactId,
        subjectType: normalizedSubjectType,
        subjectId: String(subjectId),
        relation: String(relation || 'output').slice(0, 120),
        createdAt,
      }
    },

    async listArtifactLinks(selectedWorkspaceId, {
      artifactId = null,
      subjectType = null,
      subjectId = null,
    } = {}) {
      const params = [selectedWorkspaceId]
      const filters = ['workspace_id = $1']
      for (const [column, value] of [
        ['artifact_id', artifactId],
        ['subject_type', subjectType],
        ['subject_id', subjectId],
      ]) {
        if (value) {
          params.push(value)
          filters.push(`${column} = $${params.length}`)
        }
      }
      const rows = await query(
        `SELECT * FROM artifact_links
         WHERE ${filters.join(' AND ')}
         ORDER BY created_at ASC`,
        params,
      )
      return rows.map((row) => ({
        workspaceId: row.workspace_id,
        artifactId: row.artifact_id,
        subjectType: row.subject_type,
        subjectId: row.subject_id,
        relation: row.relation,
        createdAt: row.created_at,
      }))
    },

    async unlinkArtifact({
      selectedWorkspaceId,
      workspaceId,
      artifactId,
      subjectType,
      subjectId,
      relation = 'output',
    }) {
      const resolvedWorkspaceId = selectedWorkspaceId || workspaceId
      const rows = await query(
        `DELETE FROM artifact_links
         WHERE workspace_id = $1 AND artifact_id = $2
           AND subject_type = $3 AND subject_id = $4 AND relation = $5
         RETURNING artifact_id`,
        [resolvedWorkspaceId, artifactId, subjectType, subjectId, relation],
      )
      return rows.length > 0
    },

    async deleteArtifact(selectedWorkspaceId, id, timestamp = nowIso()) {
      const rows = await query(
        `UPDATE artifacts
         SET deleted_at = $1, updated_at = $1
         WHERE workspace_id = $2 AND id = $3 AND deleted_at IS NULL
         RETURNING *`,
        [timestamp, selectedWorkspaceId, id],
      )
      return mapArtifact(rows[0])
    },

    async restoreArtifact(selectedWorkspaceId, id, timestamp = nowIso()) {
      const rows = await query(
        `UPDATE artifacts
         SET deleted_at = NULL, updated_at = $1
         WHERE workspace_id = $2 AND id = $3 AND deleted_at IS NOT NULL
         RETURNING *`,
        [timestamp, selectedWorkspaceId, id],
      )
      return mapArtifact(rows[0])
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
        `SELECT id, workspace_id, created_by, name, description, icon, accent, status, model, instruction_template, execution, tools_json, runs, success_rate, last_run_at, created_at, updated_at
         FROM automations
         WHERE workspace_id = $1
         ORDER BY created_at DESC`,
        [selectedWorkspaceId],
      )
      return rows.map(mapAutomation)
    },

    async getAutomation(selectedWorkspaceId, id) {
      const rows = await query(
        `SELECT id, workspace_id, created_by, name, description, icon, accent, status, model, instruction_template, execution, tools_json, runs, success_rate, last_run_at, created_at, updated_at
         FROM automations
         WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, id],
      )
      return mapAutomation(rows[0])
    },

    async createAutomation({ workspaceId, createdBy, name, description, model, instructionTemplate = '', execution, tools = [] }) {
      const id = `aut_${createHash('sha256')
        .update(`${workspaceId}:${name}:${nowIso()}`)
        .digest('hex')
        .slice(0, 12)}`
      const createdAt = nowIso()
      const executionMode = execution === 'edge' ? 'edge' : 'core'
      await query(
        `INSERT INTO automations (
           id, workspace_id, created_by, name, description, model, instruction_template, execution, tools_json,
           created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [id, workspaceId, createdBy, name, description, model, instructionTemplate, executionMode, JSON.stringify(tools), createdAt, createdAt],
      )
      return await this.getAutomation(workspaceId, id)
    },

    async toggleAutomation(selectedWorkspaceId, id) {
      const row = await this.getAutomation(selectedWorkspaceId, id)
      if (!row) return null
      const newStatus = row.status === 'active' ? 'paused' : 'active'
      return await this.setAutomationStatus(selectedWorkspaceId, id, newStatus)
    },

    async setAutomationStatus(selectedWorkspaceId, id, status) {
      if (!['active', 'paused', 'draft'].includes(status)) return null
      await query(
        `UPDATE automations SET status = $1, updated_at = $2
         WHERE workspace_id = $3 AND id = $4`,
        [status, nowIso(), selectedWorkspaceId, id],
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

    async listAutomationSchedules(selectedWorkspaceId, automationId = null) {
      const filters = ['automation_schedules.workspace_id = $1']
      const params = [selectedWorkspaceId]
      if (automationId) {
        params.push(automationId)
        filters.push(`automation_schedules.automation_id = $${params.length}`)
      }
      const rows = await query(
        `SELECT automation_schedules.*, automations.name AS automation_name
         FROM automation_schedules
         JOIN automations ON automations.id = automation_schedules.automation_id
         WHERE ${filters.join(' AND ')}
         ORDER BY automation_schedules.run_at ASC`,
        params,
      )
      return rows.map(mapAutomationSchedule)
    },

    async createAutomationSchedule({ workspaceId, automationId, createdBy, instruction, provider = null, runAt, intervalSeconds = null }) {
      const createdAt = nowIso()
      const id = `sch_${createHash('sha256')
        .update(`${workspaceId}:${automationId}:${instruction}:${runAt}:${createdAt}`)
        .digest('hex')
        .slice(0, 20)}`
      await query(
        `INSERT INTO automation_schedules (
           id, workspace_id, automation_id, created_by, instruction, provider,
           run_at, interval_seconds, status, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled', $9, $10)`,
        [id, workspaceId, automationId, createdBy, instruction, provider, runAt, intervalSeconds, createdAt, createdAt],
      )
      const rows = await query(
        `SELECT automation_schedules.*, automations.name AS automation_name
         FROM automation_schedules
         JOIN automations ON automations.id = automation_schedules.automation_id
         WHERE automation_schedules.workspace_id = $1
           AND automation_schedules.id = $2`,
        [workspaceId, id],
      )
      return mapAutomationSchedule(rows[0])
    },

    async listDueAutomationSchedules(now = nowIso(), limit = 50) {
      const rows = await query(
        `SELECT automation_schedules.*, automations.name AS automation_name
         FROM automation_schedules
         JOIN automations ON automations.id = automation_schedules.automation_id
         WHERE automation_schedules.status = 'scheduled'
           AND automation_schedules.run_at <= $1
         ORDER BY automation_schedules.run_at ASC
         LIMIT $2`,
        [now, Math.min(100, Math.max(1, Number(limit) || 50))],
      )
      return rows.map(mapAutomationSchedule)
    },

    async recoverAutomationSchedules() {
      await query(
        `UPDATE automation_schedules
         SET status = 'scheduled', updated_at = $1
         WHERE status = 'running'`,
        [nowIso()],
      )
    },

    async claimAutomationSchedule({ selectedWorkspaceId, id, now = nowIso() }) {
      const rows = await query(
        `UPDATE automation_schedules
         SET status = 'running', updated_at = $1
         WHERE workspace_id = $2
           AND id = $3
           AND status = 'scheduled'
           AND run_at <= $1
         RETURNING id`,
        [now, selectedWorkspaceId, id],
      )
      if (!rows.length) return null
      const schedules = await this.listAutomationSchedules(selectedWorkspaceId)
      return schedules.find((schedule) => schedule.id === id) || null
    },

    async completeAutomationSchedule({ selectedWorkspaceId, id, lastRunId }) {
      const rows = await query(
        `UPDATE automation_schedules
         SET status = 'completed', last_run_id = $1, last_error = NULL, updated_at = $2
         WHERE workspace_id = $3 AND id = $4 AND status = 'running'
         RETURNING id`,
        [lastRunId, nowIso(), selectedWorkspaceId, id],
      )
      return rows.length > 0
    },

    async rescheduleAutomationSchedule({ selectedWorkspaceId, id, runAt, lastRunId }) {
      const rows = await query(
        `UPDATE automation_schedules
         SET status = 'scheduled', run_at = $1, last_run_id = $2,
             last_error = NULL, updated_at = $3
         WHERE workspace_id = $4 AND id = $5 AND status = 'running'
         RETURNING id`,
        [runAt, lastRunId, nowIso(), selectedWorkspaceId, id],
      )
      return rows.length > 0
    },

    async failAutomationSchedule({ selectedWorkspaceId, id, error }) {
      const rows = await query(
        `UPDATE automation_schedules
         SET status = 'failed', last_error = $1, updated_at = $2
         WHERE workspace_id = $3 AND id = $4 AND status = 'running'
         RETURNING id`,
        [String(error || 'Scheduled workflow failed.').slice(0, 1_000), nowIso(), selectedWorkspaceId, id],
      )
      return rows.length > 0
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
      const completedRun = await this.getAutomationRun(selectedWorkspaceId, id)
      if (completedRun && ['completed', 'failed'].includes(status)) {
        await this.createWorkspaceNotification({
          workspaceId: selectedWorkspaceId,
          kind: status === 'completed' ? 'automation.completed' : 'automation.failed',
          title: status === 'completed' ? 'Automation completed' : 'Automation failed',
          body: `${completedRun.automationName || 'Automation'} ${status === 'completed' ? 'completed successfully' : `failed${errorCode ? ` · ${errorCode}` : ''}`}.`,
          entityType: 'automation_run',
          entityId: id,
        })
      }
      return completedRun
    },

    async getMailAccount(selectedWorkspaceId, includeSecret = false) {
      const rows = await query(
        `SELECT workspace_id, connected_by, email, display_name, username, provider,
                password_ciphertext, password_iv, password_tag,
                imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure,
                status, last_seen_uid, last_synced_at, last_error, created_at, updated_at
         FROM mail_accounts
         WHERE workspace_id = $1`,
        [selectedWorkspaceId],
      )
      return mapMailAccount(rows[0], includeSecret)
    },

    async listConnectedMailAccounts() {
      const rows = await query(
        `SELECT workspace_id, connected_by, email, display_name, username, provider,
                password_ciphertext, password_iv, password_tag,
                imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure,
                status, last_seen_uid, last_synced_at, last_error, created_at, updated_at
         FROM mail_accounts
         WHERE status IN ('connected', 'error')
         ORDER BY updated_at ASC`,
      )
      return rows.map((row) => mapMailAccount(row, true))
    },

    async saveMailAccount({
      workspaceId,
      connectedBy,
      email,
      displayName = '',
      username,
      provider = 'custom',
      passwordCiphertext,
      passwordIv,
      passwordTag,
      imapHost,
      imapPort,
      imapSecure,
      smtpHost,
      smtpPort,
      smtpSecure,
      lastSeenUid = 0,
    }) {
      const timestamp = nowIso()
      await query(
        `INSERT INTO mail_accounts (
           workspace_id, connected_by, email, display_name, username, provider,
           password_ciphertext, password_iv, password_tag,
           imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure,
           status, last_seen_uid, last_synced_at, last_error, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'connected', $16, $17, '', $18, $19)
         ON CONFLICT (workspace_id) DO UPDATE SET
           connected_by = EXCLUDED.connected_by,
           email = EXCLUDED.email,
           display_name = EXCLUDED.display_name,
           username = EXCLUDED.username,
           provider = EXCLUDED.provider,
           password_ciphertext = EXCLUDED.password_ciphertext,
           password_iv = EXCLUDED.password_iv,
           password_tag = EXCLUDED.password_tag,
           imap_host = EXCLUDED.imap_host,
           imap_port = EXCLUDED.imap_port,
           imap_secure = EXCLUDED.imap_secure,
           smtp_host = EXCLUDED.smtp_host,
           smtp_port = EXCLUDED.smtp_port,
           smtp_secure = EXCLUDED.smtp_secure,
           status = 'connected',
           last_seen_uid = EXCLUDED.last_seen_uid,
           last_synced_at = EXCLUDED.last_synced_at,
           last_error = '',
           updated_at = EXCLUDED.updated_at`,
        [
          workspaceId,
          connectedBy,
          email,
          displayName,
          username,
          provider,
          passwordCiphertext,
          passwordIv,
          passwordTag,
          imapHost,
          imapPort,
          isSqlite ? (imapSecure ? 1 : 0) : Boolean(imapSecure),
          smtpHost,
          smtpPort,
          isSqlite ? (smtpSecure ? 1 : 0) : Boolean(smtpSecure),
          lastSeenUid,
          timestamp,
          timestamp,
          timestamp,
        ],
      )
      return await this.getMailAccount(workspaceId)
    },

    async updateMailSyncState(selectedWorkspaceId, { lastSeenUid, error = '' }) {
      const timestamp = nowIso()
      await query(
        `UPDATE mail_accounts
         SET last_seen_uid = CASE WHEN $1 > last_seen_uid THEN $1 ELSE last_seen_uid END,
             status = $2,
             last_synced_at = $3,
             last_error = $4,
             updated_at = $5
         WHERE workspace_id = $6`,
        [lastSeenUid, error ? 'error' : 'connected', timestamp, String(error).slice(0, 1_000), timestamp, selectedWorkspaceId],
      )
      return await this.getMailAccount(selectedWorkspaceId)
    },

    async deleteMailAccount(selectedWorkspaceId) {
      const rows = await query(
        `DELETE FROM mail_accounts WHERE workspace_id = $1 RETURNING workspace_id`,
        [selectedWorkspaceId],
      )
      return Boolean(rows.length)
    },

    async listMailAutomationRules(selectedWorkspaceId) {
      const rows = await query(
        `SELECT mail_automation_rules.*, automations.name AS automation_name
         FROM mail_automation_rules
         JOIN automations ON automations.id = mail_automation_rules.automation_id
         WHERE mail_automation_rules.workspace_id = $1
         ORDER BY mail_automation_rules.created_at DESC`,
        [selectedWorkspaceId],
      )
      return rows.map(mapMailAutomationRule)
    },

    async getMailAutomationRule(selectedWorkspaceId, id) {
      const rows = await query(
        `SELECT mail_automation_rules.*, automations.name AS automation_name
         FROM mail_automation_rules
         JOIN automations ON automations.id = mail_automation_rules.automation_id
         WHERE mail_automation_rules.workspace_id = $1 AND mail_automation_rules.id = $2`,
        [selectedWorkspaceId, id],
      )
      return mapMailAutomationRule(rows[0])
    },

    async createMailAutomationRule({
      workspaceId,
      automationId,
      createdBy,
      name,
      sender = '',
      recipient = '',
      subject = '',
      keywords = [],
      matchMode = 'all',
      instruction,
      enabled = true,
    }) {
      const timestamp = nowIso()
      const id = stableId('mailrule', `${workspaceId}:${name}:${timestamp}`)
      await query(
        `INSERT INTO mail_automation_rules (
           id, workspace_id, automation_id, created_by, name, sender, recipient,
           subject, keywords_json, match_mode, instruction, enabled, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          id,
          workspaceId,
          automationId,
          createdBy,
          name,
          sender,
          recipient,
          subject,
          JSON.stringify(keywords),
          matchMode,
          instruction,
          isSqlite ? (enabled ? 1 : 0) : Boolean(enabled),
          timestamp,
          timestamp,
        ],
      )
      return await this.getMailAutomationRule(workspaceId, id)
    },

    async updateMailAutomationRule(selectedWorkspaceId, id, fields) {
      const timestamp = nowIso()
      const rows = await query(
        `UPDATE mail_automation_rules
         SET automation_id = $1, name = $2, sender = $3, recipient = $4,
             subject = $5, keywords_json = $6, match_mode = $7,
             instruction = $8, enabled = $9, updated_at = $10
         WHERE workspace_id = $11 AND id = $12
         RETURNING id`,
        [
          fields.automationId,
          fields.name,
          fields.sender,
          fields.recipient,
          fields.subject,
          JSON.stringify(fields.keywords),
          fields.matchMode,
          fields.instruction,
          isSqlite ? (fields.enabled ? 1 : 0) : Boolean(fields.enabled),
          timestamp,
          selectedWorkspaceId,
          id,
        ],
      )
      return rows.length ? await this.getMailAutomationRule(selectedWorkspaceId, id) : null
    },

    async deleteMailAutomationRule(selectedWorkspaceId, id) {
      const rows = await query(
        `DELETE FROM mail_automation_rules WHERE workspace_id = $1 AND id = $2 RETURNING id`,
        [selectedWorkspaceId, id],
      )
      return Boolean(rows.length)
    },

    async claimMailRuleEvent({ workspaceId, ruleId, messageKey }) {
      const timestamp = nowIso()
      const id = stableId('mailevt', `${workspaceId}:${ruleId}:${messageKey}`)
      const rows = await query(
        `INSERT INTO mail_rule_events (
           id, workspace_id, rule_id, message_key, status, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'processing', $5, $6)
         ON CONFLICT (workspace_id, rule_id, message_key) DO NOTHING
         RETURNING id`,
        [id, workspaceId, ruleId, messageKey, timestamp, timestamp],
      )
      return rows.length ? id : null
    },

    async completeMailRuleEvent(selectedWorkspaceId, id, { status, runId = null, error = '' }) {
      await query(
        `UPDATE mail_rule_events
         SET status = $1, run_id = $2, error = $3, updated_at = $4
         WHERE workspace_id = $5 AND id = $6`,
        [status, runId, String(error).slice(0, 1_000), nowIso(), selectedWorkspaceId, id],
      )
    },

    async listIntegrations(selectedWorkspaceId) {
      const rows = await query(
        `SELECT integration_id, connected FROM workspace_integrations WHERE workspace_id = $1`,
        [selectedWorkspaceId],
      )
      const [
        n8nConnection,
        driveToken,
        paystackConnection,
        codexConnection,
        mailAccount,
        whatsappConnection,
        cloudLinks,
      ] = await Promise.all([
        this.getN8nConnection(selectedWorkspaceId),
        this.getGoogleDriveToken(selectedWorkspaceId),
        this.getPaymentConnection(selectedWorkspaceId, 'paystack'),
        this.getCodexConnection(selectedWorkspaceId),
        this.getMailAccount(selectedWorkspaceId),
        this.getWhatsAppConnection(selectedWorkspaceId),
        this.listWorkspaceCloudLinks(selectedWorkspaceId),
      ])
      const integrationMeta = {
        drive: { name: 'Google Drive', description: 'Link approved client folders, source files, and final delivery packages.', category: 'Storage', icon: 'drive', accent: '#4285f4' },
        dropbox: { name: 'Dropbox', description: 'Choose a Dropbox folder as a private storage point for workspace files.', category: 'Storage', icon: 'dropbox', accent: '#3984ff' },
        onedrive: { name: 'Microsoft OneDrive', description: 'Choose a OneDrive folder as a private storage point for workspace files.', category: 'Storage', icon: 'onedrive', accent: '#4f8df7' },
        paystack: { name: 'Paystack', description: 'Collect region-friendly card and bank payments across African markets.', category: 'Payments', icon: 'paystack', accent: '#00c3f7' },
        n8n: { name: 'n8n', description: 'Connect repeatable workflows in either direction with signed GET and POST webhooks.', category: 'Automation', icon: 'n8n', accent: '#ea4b71' },
        'lancee-mcp': { name: 'Lancee MCP', description: 'Application-owned workspace tools exposed through the local Lancee MCP route.', category: 'Automation', icon: 'mcp', accent: '#786bff' },
        'codex-ai': { name: 'lancee AI for Codex', description: 'Let an external Codex client call this workspace’s configured AI provider.', category: 'Automation', icon: 'codex', accent: '#6c654f' },
        'codex-runtime': { name: 'Codex Workspace', description: 'Run OpenAI Codex inside lancee against the server-configured project workspace.', category: 'Automation', icon: 'codex', accent: '#171a15' },
        mail: { name: 'Mail', description: 'Read and send workspace email, then trigger native automations from recipients, subjects, and keywords.', category: 'Communication', icon: 'messages', accent: '#6854e8' },
        whatsapp: { name: 'WhatsApp', description: 'Scan a QR code once, then receive platform notifications on your own WhatsApp number.', category: 'Communication', icon: 'whatsapp', accent: '#25d366' },
      }
      return rows.filter((row) => Object.hasOwn(integrationMeta, row.integration_id)).map((row) => {
        const meta = integrationMeta[row.integration_id]
        let connected = row.connected === 1
        if (row.integration_id === 'lancee-mcp') {
          connected = true
        } else if (row.integration_id === 'codex-ai') {
          connected = codexConnection.connected
        } else if (row.integration_id === 'n8n') {
          connected = n8nConnection.status === 'connected'
        } else if (row.integration_id === 'drive') {
          connected = Boolean(driveToken)
        } else if (row.integration_id === 'dropbox' || row.integration_id === 'onedrive') {
          connected = cloudLinks.some((link) => link.provider === row.integration_id)
        } else if (row.integration_id === 'paystack') {
          connected = Boolean(paystackConnection.configured)
        } else if (row.integration_id === 'mail') {
          connected = mailAccount?.status === 'connected'
        } else if (row.integration_id === 'whatsapp') {
          connected = whatsappConnection?.status === 'connected'
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

    async listIntegrationRequests(selectedWorkspaceId) {
      const rows = await query(
        `SELECT id, name, category, details, status, created_at, updated_at
         FROM integration_requests
         WHERE workspace_id = $1
         ORDER BY created_at DESC`,
        [selectedWorkspaceId],
      )
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        details: row.details || '',
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    },

    async saveIntegrationConnection({
      id,
      workspaceId,
      userId,
      provider,
      externalConnectionName,
      externalConnectionId = null,
      displayName = '',
      status = 'connecting',
      scopes = [],
      lastError = '',
    }) {
      return await this.runAsTenant(workspaceId, async () => {
        const timestamp = nowIso()
        await query(
          `INSERT INTO integration_connections (
             id, workspace_id, user_id, provider, external_connection_id,
             external_connection_name, display_name, status, scopes_json,
             last_error, created_at, updated_at, last_used_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL)
           ON CONFLICT (id) DO UPDATE SET
             external_connection_id = EXCLUDED.external_connection_id,
             display_name = EXCLUDED.display_name,
             status = EXCLUDED.status,
             scopes_json = EXCLUDED.scopes_json,
             last_error = EXCLUDED.last_error,
             updated_at = EXCLUDED.updated_at`,
          [
            id,
            workspaceId,
            userId,
            provider,
            externalConnectionId,
            externalConnectionName,
            displayName,
            status,
            JSON.stringify(scopes),
            String(lastError).slice(0, 1_000),
            timestamp,
            timestamp,
          ],
        )
        return await this.getIntegrationConnection(workspaceId, id)
      })
    },

    async getIntegrationConnection(selectedWorkspaceId, id) {
      return await this.runAsTenant(selectedWorkspaceId, async () => {
        const rows = await query(
          `SELECT id, workspace_id, user_id, provider, external_connection_id,
                  external_connection_name, display_name, status, scopes_json,
                  last_error, created_at, updated_at, last_used_at
           FROM integration_connections
           WHERE workspace_id = $1 AND id = $2`,
          [selectedWorkspaceId, id],
        )
        return mapIntegrationConnection(rows[0])
      })
    },

    async getIntegrationConnectionByProvider(selectedWorkspaceId, provider) {
      return await this.runAsTenant(selectedWorkspaceId, async () => {
        const rows = await query(
          `SELECT id, workspace_id, user_id, provider, external_connection_id,
                  external_connection_name, display_name, status, scopes_json,
                  last_error, created_at, updated_at, last_used_at
           FROM integration_connections
           WHERE workspace_id = $1 AND provider = $2
           ORDER BY created_at ASC
           LIMIT 1`,
          [selectedWorkspaceId, provider],
        )
        return mapIntegrationConnection(rows[0])
      })
    },

    async listIntegrationConnections(selectedWorkspaceId) {
      return await this.runAsTenant(selectedWorkspaceId, async () => {
        const rows = await query(
          `SELECT id, workspace_id, user_id, provider, external_connection_id,
                  external_connection_name, display_name, status, scopes_json,
                  last_error, created_at, updated_at, last_used_at
           FROM integration_connections
           WHERE workspace_id = $1
           ORDER BY provider ASC, created_at ASC`,
          [selectedWorkspaceId],
        )
        return rows.map(mapIntegrationConnection)
      })
    },

    async markIntegrationConnectionUsed(selectedWorkspaceId, id) {
      return await this.runAsTenant(selectedWorkspaceId, async () => {
        const timestamp = nowIso()
        await query(
          `UPDATE integration_connections
           SET last_used_at = $1, updated_at = $1
           WHERE workspace_id = $2 AND id = $3`,
          [timestamp, selectedWorkspaceId, id],
        )
        return await this.getIntegrationConnection(selectedWorkspaceId, id)
      })
    },

    async deleteIntegrationConnection(selectedWorkspaceId, id) {
      return await this.runAsTenant(selectedWorkspaceId, async () => {
        const connection = await this.getIntegrationConnection(selectedWorkspaceId, id)
        if (!connection) return null
        await query(
          `DELETE FROM integration_connections WHERE workspace_id = $1 AND id = $2`,
          [selectedWorkspaceId, id],
        )
        return connection
      })
    },

    async recordIntegrationExecution({
      id,
      workspaceId,
      userId,
      provider,
      connectionId,
      action,
      riskLevel,
      status,
      durationMs,
      source,
      errorCode = null,
    }) {
      return await this.runAsTenant(workspaceId, async () => {
        await query(
          `INSERT INTO integration_executions (
             id, workspace_id, user_id, provider, connection_id, action,
             risk_level, status, duration_ms, source, error_code, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            id,
            workspaceId,
            userId,
            provider,
            connectionId,
            action,
            riskLevel,
            status,
            Math.max(0, Math.round(durationMs || 0)),
            source,
            errorCode,
            nowIso(),
          ],
        )
        const rows = await query(
          `SELECT id, workspace_id, user_id, provider, connection_id, action,
                  risk_level, status, duration_ms, source, error_code, created_at
           FROM integration_executions WHERE workspace_id = $1 AND id = $2`,
          [workspaceId, id],
        )
        return mapIntegrationExecution(rows[0])
      })
    },

    async completeIntegrationExecution(selectedWorkspaceId, id, {
      status,
      durationMs,
      errorCode = null,
    }) {
      return await this.runAsTenant(selectedWorkspaceId, async () => {
        const rows = await query(
          `UPDATE integration_executions
           SET status = $1, duration_ms = $2, error_code = $3
           WHERE workspace_id = $4 AND id = $5 AND status = 'running'
           RETURNING id, workspace_id, user_id, provider, connection_id, action,
                     risk_level, status, duration_ms, source, error_code, created_at`,
          [
            status,
            Math.max(0, Math.round(durationMs || 0)),
            errorCode,
            selectedWorkspaceId,
            id,
          ],
        )
        return mapIntegrationExecution(rows[0])
      })
    },

    async listIntegrationExecutions(selectedWorkspaceId, limit = 100) {
      return await this.runAsTenant(selectedWorkspaceId, async () => {
        const rows = await query(
          `SELECT id, workspace_id, user_id, provider, connection_id, action,
                  risk_level, status, duration_ms, source, error_code, created_at
           FROM integration_executions
           WHERE workspace_id = $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [selectedWorkspaceId, Math.min(500, Math.max(1, limit))],
        )
        return rows.map(mapIntegrationExecution)
      })
    },

    async getWorkspaceSettings(selectedWorkspaceId) {
      const rows = await query(
        `SELECT name, logo_url, email, timezone, travel_mode, travel_location, storefront_enabled, updated_at
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
            storefrontEnabled: Boolean(row.storefront_enabled),
            updatedAt: row.updated_at || nowIso(),
          }
        : {
            name: '',
            logoUrl: '',
            email: '',
            timezone: 'Africa/Johannesburg',
            travelMode: 'none',
            travelLocation: '',
            storefrontEnabled: false,
            updatedAt: nowIso(),
          }
    },

    async updateWorkspaceSettings(selectedWorkspaceId, settings) {
      const timestamp = nowIso()
      const current = await this.getWorkspaceSettings(selectedWorkspaceId)
      const storefrontEnabled = typeof settings.storefrontEnabled === 'boolean'
        ? settings.storefrontEnabled
        : current.storefrontEnabled
      const storefrontEnabledValue = isSqlite ? (storefrontEnabled ? 1 : 0) : storefrontEnabled
      await query(
        `INSERT INTO workspace_settings (
           workspace_id, name, logo_url, email, timezone, travel_mode,
           travel_location, storefront_enabled, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (workspace_id) DO UPDATE SET
           name = EXCLUDED.name,
           logo_url = EXCLUDED.logo_url,
           email = EXCLUDED.email,
           timezone = EXCLUDED.timezone,
           travel_mode = EXCLUDED.travel_mode,
           travel_location = EXCLUDED.travel_location,
           storefront_enabled = EXCLUDED.storefront_enabled,
           updated_at = EXCLUDED.updated_at`,
        [
          selectedWorkspaceId,
          settings.name || '',
          settings.logoUrl || '',
          settings.email || '',
          settings.timezone || 'Africa/Johannesburg',
          settings.travelMode || 'none',
          settings.travelLocation || '',
          storefrontEnabledValue,
          timestamp,
        ],
      )
      await query(
        `UPDATE workspaces SET name = $1 WHERE id = $2`,
        [settings.name || '', selectedWorkspaceId],
      )
      return await this.getWorkspaceSettings(selectedWorkspaceId)
    },

    async getPlans(selectedRegion) {
      const rows = await query(
        `SELECT id, plan_code, name, region, currency, symbol,
                monthly_price, yearly_price, per_user, recommended, sort_order
         FROM plans
         WHERE region = $1
         ORDER BY sort_order ASC, plan_code ASC`,
        [selectedRegion],
      )
      return rows.map((row) => ({
        id: row.id,
        planCode: row.plan_code,
        name: row.name,
        region: row.region,
        currency: row.currency,
        symbol: row.symbol,
        monthlyPrice: Number(row.monthly_price),
        yearlyPrice: Number(row.yearly_price),
        perUser: isSqlite ? Boolean(Number(row.per_user)) : Boolean(row.per_user),
        recommended: isSqlite ? Boolean(Number(row.recommended)) : Boolean(row.recommended),
        sortOrder: Number(row.sort_order),
      }))
    },

    async getPlan(planCode, selectedRegion) {
      const rows = await query(
        `SELECT id, plan_code, name, region, currency, symbol,
                monthly_price, yearly_price, per_user
         FROM plans
         WHERE plan_code = $1 AND region = $2`,
        [planCode, selectedRegion],
      )
      const row = rows[0]
      if (!row) return null
      return {
        id: row.id,
        planCode: row.plan_code,
        name: row.name,
        region: row.region,
        currency: row.currency,
        symbol: row.symbol,
        monthlyPrice: Number(row.monthly_price),
        yearlyPrice: Number(row.yearly_price),
        perUser: isSqlite ? Boolean(Number(row.per_user)) : Boolean(row.per_user),
      }
    },

    async getSubscriptionRecord(selectedWorkspaceId) {
      const rows = await query(
        `SELECT workspace_id, plan_code, billing_period, region, status,
                trial_started_at, trial_ends_at, subscribed_at, updated_at
         FROM subscriptions
         WHERE workspace_id = $1`,
        [selectedWorkspaceId],
      )
      const row = rows[0]
      const now = new Date()
      if (!row) {
        const started = nowIso()
        const ends = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
        return {
          workspaceId: selectedWorkspaceId,
          planCode: 'solo',
          billingPeriod: 'monthly',
          region: 'ZA',
          status: 'trial',
          trialStartedAt: started,
          trialEndsAt: ends,
          trialDays: 14,
          trialDaysLeft: 14,
          isOnTrial: true,
          subscribedAt: null,
          updatedAt: started,
        }
      }
      const trialStartedAt = row.trial_started_at || nowIso()
      const trialEndsAt = row.trial_ends_at || trialStartedAt
      const trialEnd = new Date(trialEndsAt).getTime()
      const trialDays = Math.max(0, Math.round((trialEnd - new Date(trialStartedAt).getTime()) / 86400000))
      const trialDaysLeft = Math.max(0, Math.ceil((trialEnd - Date.now()) / 86400000))
      const isOnTrial = row.status === 'trial' && trialEnd > Date.now()
      return {
        workspaceId: row.workspace_id,
        planCode: row.plan_code,
        billingPeriod: row.billing_period,
        region: row.region,
        status: row.status,
        trialStartedAt,
        trialEndsAt,
        trialDays,
        trialDaysLeft,
        isOnTrial,
        subscribedAt: row.subscribed_at,
        updatedAt: row.updated_at,
      }
    },

    async upsertSubscription(selectedWorkspaceId, input) {
      const current = await this.getSubscriptionRecord(selectedWorkspaceId)
      const now = nowIso()
      const planCode = input.planCode || current.planCode
      const billingPeriod = input.billingPeriod || current.billingPeriod || 'monthly'
      const region = input.region || current.region || 'ZA'
      const chosePlan = typeof input.planCode === 'string'
      const status = chosePlan && current.status === 'trial' && input.planCode !== 'solo'
        ? 'active'
        : current.status
      const subscribedAt = chosePlan && !current.subscribedAt
        ? now
        : current.subscribedAt
      await query(
        `INSERT INTO subscriptions (
           workspace_id, plan_code, billing_period, region, status,
           trial_started_at, trial_ends_at, subscribed_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (workspace_id) DO UPDATE SET
           plan_code = EXCLUDED.plan_code,
           billing_period = EXCLUDED.billing_period,
           region = EXCLUDED.region,
           status = EXCLUDED.status,
           subscribed_at = COALESCE(EXCLUDED.subscribed_at, subscriptions.subscribed_at),
           updated_at = EXCLUDED.updated_at`,
        [selectedWorkspaceId, planCode, billingPeriod, region, status,
          current.trialStartedAt, current.trialEndsAt, subscribedAt, now],
      )
      return await this.getSubscriptionRecord(selectedWorkspaceId)
    },

    async getWorkspaceBuilder(selectedWorkspaceId) {
      const rows = await query(
        `SELECT workspace_id, required_setup, status, step, answers_json,
                recommendation_json, ai_suggestions_json, generated_json,
                completed_at, created_at, updated_at
         FROM workspace_builder_configs
         WHERE workspace_id = $1`,
        [selectedWorkspaceId],
      )
      const row = rows[0]
      if (!row) return null
      return {
        workspaceId: row.workspace_id,
        requiredSetup: Boolean(Number(row.required_setup)),
        status: row.status,
        step: Number(row.step || 0),
        answers: parseJsonObject(row.answers_json),
        recommendation: parseJsonObject(row.recommendation_json),
        aiSuggestions: parseJsonObject(row.ai_suggestions_json, []),
        generated: parseJsonObject(row.generated_json),
        completedAt: row.completed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    },

    async saveWorkspaceBuilder(selectedWorkspaceId, fields = {}) {
      const current = await this.getWorkspaceBuilder(selectedWorkspaceId)
      const timestamp = nowIso()
      const status = fields.status || current?.status || 'not_started'
      const step = Number.isInteger(fields.step)
        ? Math.max(0, Math.min(9, fields.step))
        : current?.step || 0
      const requiredSetup = typeof fields.requiredSetup === 'boolean'
        ? fields.requiredSetup
        : current?.requiredSetup || false
      const requiredSetupValue = requiredSetup ? 1 : 0
      const answers = fields.answers ?? current?.answers ?? {}
      const recommendation = fields.recommendation ?? current?.recommendation ?? {}
      const aiSuggestions = fields.aiSuggestions ?? current?.aiSuggestions ?? []
      const generated = fields.generated ?? current?.generated ?? {}
      const completedAt = fields.completedAt === undefined
        ? current?.completedAt || null
        : fields.completedAt
      await query(
        `INSERT INTO workspace_builder_configs (
           workspace_id, required_setup, status, step, answers_json,
           recommendation_json, ai_suggestions_json, generated_json,
           completed_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (workspace_id) DO UPDATE SET
           required_setup = EXCLUDED.required_setup,
           status = EXCLUDED.status,
           step = EXCLUDED.step,
           answers_json = EXCLUDED.answers_json,
           recommendation_json = EXCLUDED.recommendation_json,
           ai_suggestions_json = EXCLUDED.ai_suggestions_json,
           generated_json = EXCLUDED.generated_json,
           completed_at = EXCLUDED.completed_at,
           updated_at = EXCLUDED.updated_at`,
        [
          selectedWorkspaceId,
          requiredSetupValue,
          status,
          step,
          JSON.stringify(answers),
          JSON.stringify(recommendation),
          JSON.stringify(aiSuggestions),
          JSON.stringify(generated),
          completedAt,
          current?.createdAt || timestamp,
          timestamp,
        ],
      )
      return await this.getWorkspaceBuilder(selectedWorkspaceId)
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

    async getWhatsAppConnection(selectedWorkspaceId) {
      const rows = await query(
        `SELECT workspace_id, self_number, status, connected_jid, last_error,
                notifications_enabled, created_at, updated_at
         FROM whatsapp_connections
         WHERE workspace_id = $1`,
        [selectedWorkspaceId],
      )
      const row = rows[0]
      if (!row) return null
      return {
        workspaceId: row.workspace_id,
        selfNumber: row.self_number,
        status: row.status,
        connectedJid: row.connected_jid || null,
        lastError: row.last_error || '',
        notificationsEnabled: Boolean(row.notifications_enabled),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    },

    async listWhatsAppConnections() {
      const rows = await query(
        `SELECT workspace_id, self_number, status, connected_jid, last_error,
                notifications_enabled, created_at, updated_at
         FROM whatsapp_connections`,
      )
      return rows.map((row) => ({
        workspaceId: row.workspace_id,
        selfNumber: row.self_number,
        status: row.status,
        connectedJid: row.connected_jid || null,
        lastError: row.last_error || '',
        notificationsEnabled: Boolean(row.notifications_enabled),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    },

    async upsertWhatsAppConnection({ workspaceId, selfNumber, notificationsEnabled = true, status = 'disconnected', connectedJid = null, lastError = '' }) {
      const timestamp = nowIso()
      const enabled = isSqlite ? (notificationsEnabled ? 1 : 0) : Boolean(notificationsEnabled)
      await query(
        `INSERT INTO whatsapp_connections (
           workspace_id, self_number, status, connected_jid, last_error,
           notifications_enabled, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (workspace_id) DO UPDATE SET
           self_number = EXCLUDED.self_number,
           status = EXCLUDED.status,
           connected_jid = EXCLUDED.connected_jid,
           last_error = EXCLUDED.last_error,
           notifications_enabled = EXCLUDED.notifications_enabled,
           updated_at = EXCLUDED.updated_at`,
        [workspaceId, selfNumber, status, connectedJid, String(lastError || '').slice(0, 500), enabled, timestamp, timestamp],
      )
      return this.getWhatsAppConnection(workspaceId)
    },

    async setWhatsAppConnectionStatus(selectedWorkspaceId, { status, selfNumber = null, connectedJid = null, lastError = '' }) {
      const timestamp = nowIso()
      await query(
        `UPDATE whatsapp_connections
         SET status = $1,
             self_number = COALESCE($2, self_number),
             connected_jid = $3,
             last_error = $4,
             updated_at = $5
         WHERE workspace_id = $6`,
        [status, selfNumber, connectedJid, String(lastError || '').slice(0, 500), timestamp, selectedWorkspaceId],
      )
      return this.getWhatsAppConnection(selectedWorkspaceId)
    },

    async setWhatsAppNotificationPreference(selectedWorkspaceId, notificationsEnabled) {
      const enabled = isSqlite ? (notificationsEnabled ? 1 : 0) : Boolean(notificationsEnabled)
      await query(
        `UPDATE whatsapp_connections
         SET notifications_enabled = $1, updated_at = $2
         WHERE workspace_id = $3`,
        [enabled, nowIso(), selectedWorkspaceId],
      )
      return this.getWhatsAppConnection(selectedWorkspaceId)
    },

    async deleteWhatsAppConnection(selectedWorkspaceId) {
      await query(`DELETE FROM whatsapp_connections WHERE workspace_id = $1`, [selectedWorkspaceId])
      await query(
        `UPDATE workspace_integrations SET connected = 0, updated_at = $1
         WHERE workspace_id = $2 AND integration_id = 'whatsapp'`,
        [nowIso(), selectedWorkspaceId],
      )
      return true
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
                  clients.company, clients.status, clients.notes, clients.logo_url,
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
        logoUrl: row.logo_url || '',
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
        logoUrl: updated.logo_url || '',
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
        ['logoUrl', 'logo_url'],
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
            logoUrl: row.logo_url || '',
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

    async listStorefrontDomains(selectedWorkspaceId) {
      const rows = await query(
        `SELECT id, workspace_id, domain, verification_token, status, created_at, verified_at
         FROM storefront_domains
         WHERE workspace_id = $1
         ORDER BY created_at DESC`,
        [selectedWorkspaceId],
      )
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        domain: row.domain,
        verificationToken: row.verification_token,
        status: row.status,
        createdAt: row.created_at,
        verifiedAt: row.verified_at,
      }))
    },

    async createStorefrontDomain({ workspaceId: selectedWorkspaceId, domain, verificationToken }) {
      const id = stableId('dom', `${selectedWorkspaceId}:${domain}`)
      const createdAt = nowIso()
      await query(
        `INSERT INTO storefront_domains (
           id, workspace_id, domain, verification_token, status, created_at
         ) VALUES ($1, $2, $3, $4, 'pending', $5)`,
        [id, selectedWorkspaceId, domain, verificationToken, createdAt],
      )
      const rows = await query(
        `SELECT id, workspace_id, domain, verification_token, status, created_at, verified_at
         FROM storefront_domains WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, id],
      )
      return rows[0]
        ? {
            id: rows[0].id,
            workspaceId: rows[0].workspace_id,
            domain: rows[0].domain,
            verificationToken: rows[0].verification_token,
            status: rows[0].status,
            createdAt: rows[0].created_at,
            verifiedAt: rows[0].verified_at,
          }
        : null
    },

    async verifyStorefrontDomain(selectedWorkspaceId, id) {
      const verifiedAt = nowIso()
      await query(
        `UPDATE storefront_domains
         SET status = 'verified', verified_at = $1
         WHERE workspace_id = $2 AND id = $3`,
        [verifiedAt, selectedWorkspaceId, id],
      )
      const rows = await query(
        `SELECT id, workspace_id, domain, verification_token, status, created_at, verified_at
         FROM storefront_domains WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, id],
      )
      return rows[0]
        ? {
            id: rows[0].id,
            workspaceId: rows[0].workspace_id,
            domain: rows[0].domain,
            verificationToken: rows[0].verification_token,
            status: rows[0].status,
            createdAt: rows[0].created_at,
            verifiedAt: rows[0].verified_at,
          }
        : null
    },

    async deleteStorefrontDomain(selectedWorkspaceId, id) {
      const rows = await query(
        `DELETE FROM storefront_domains
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

    async listProjectTasks(selectedWorkspaceId, projectId) {
      const rows = await query(
        `SELECT id, workspace_id, project_id, bucket_id, title, notes, completed_at, created_at, updated_at
         FROM project_tasks
         WHERE workspace_id = $1 AND project_id = $2
         ORDER BY created_at ASC`,
        [selectedWorkspaceId, projectId],
      )
      return rows.map(mapProjectTask)
    },

    async createProjectTask({ workspaceId, projectId, bucketId, title, notes = '' }) {
      const projects = await query(
        `SELECT id FROM projects WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, projectId],
      )
      if (!projects[0]) return null
      const timestamp = nowIso()
      const id = `tsk_${randomUUID()}`
      await query(
        `INSERT INTO project_tasks (
           id, workspace_id, project_id, bucket_id, title, notes, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, workspaceId, projectId, bucketId, title, notes, timestamp, timestamp],
      )
      const rows = await query(
        `SELECT id, workspace_id, project_id, bucket_id, title, notes, completed_at, created_at, updated_at
         FROM project_tasks WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, id],
      )
      return mapProjectTask(rows[0])
    },

    async updateProjectTask(selectedWorkspaceId, id, fields) {
      const sets = []
      const params = []
      let index = 1
      for (const [field, column] of [
        ['bucketId', 'bucket_id'],
        ['title', 'title'],
        ['notes', 'notes'],
        ['completedAt', 'completed_at'],
      ]) {
        if (Object.hasOwn(fields, field)) {
          sets.push(`${column} = $${index++}`)
          params.push(fields[field])
        }
      }
      if (!sets.length) {
        const rows = await query(
          `SELECT id, workspace_id, project_id, bucket_id, title, notes, completed_at, created_at, updated_at
           FROM project_tasks WHERE workspace_id = $1 AND id = $2`,
          [selectedWorkspaceId, id],
        )
        return mapProjectTask(rows[0])
      }
      sets.push(`updated_at = $${index++}`)
      params.push(nowIso(), selectedWorkspaceId, id)
      await query(
        `UPDATE project_tasks SET ${sets.join(', ')}
         WHERE workspace_id = $${index++} AND id = $${index}`,
        params,
      )
      const rows = await query(
        `SELECT id, workspace_id, project_id, bucket_id, title, notes, completed_at, created_at, updated_at
         FROM project_tasks WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, id],
      )
      return mapProjectTask(rows[0])
    },

    async deleteProjectTask(selectedWorkspaceId, id) {
      const rows = await query(
        `DELETE FROM project_tasks WHERE workspace_id = $1 AND id = $2 RETURNING id`,
        [selectedWorkspaceId, id],
      )
      return rows.length > 0
    },

    async createProject({ workspaceId, name, clientId, client, clientEmail = '', scope = 'New project · add deliverables', due = 'Set date', status = 'In progress', progress = 0, accent = '#6854e8', boardId, idempotencyKey = null }) {
      const clientRecord = await ensureClient({
        selectedWorkspaceId: workspaceId,
        clientId,
        name: client,
        email: clientEmail,
      })
      const normalizedIdempotencyKey = String(idempotencyKey || '').trim()
      const id = `prj_${createHash('sha256')
        .update(normalizedIdempotencyKey
          ? `${workspaceId}:automation:${normalizedIdempotencyKey}`
          : `${workspaceId}:${name}:${nowIso()}`)
        .digest('hex')
        .slice(0, 12)}`
      const timestamp = nowIso()
      await query(
        `INSERT INTO projects (
           id, workspace_id, client_id, name, client, scope, due, status, progress, accent, created_at, updated_at, board_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT(id) DO NOTHING`,
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

    async createAutomationProject({
      workspaceId,
      createdBy,
      name,
      clientId = null,
      clientName,
      clientEmail = '',
      scope = 'Created from an automation.',
      due = 'Set date',
      status = 'In progress',
      sourceKey = null,
    }) {
      return await this.transaction(async () => {
        const project = await this.createProject({
          workspaceId,
          name,
          clientId,
          client: clientName || clientEmail || clientId,
          clientEmail,
          scope,
          due,
          status,
          idempotencyKey: sourceKey,
        })
        const jobCard = await this.ensureJobCard({
          workspaceId,
          projectId: project.id,
          createdBy,
        })
        const draftInvoice = await this.createDraftInvoiceForProject({
          workspaceId,
          projectId: project.id,
        })
        return {
          ...project,
          jobCardId: jobCard?.id || null,
          draftInvoice,
        }
      })
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
      dueAt = null,
    }) {
      const id = `apr_${createHash('sha256')
        .update(`${workspaceId}:${projectId}:${tokenHash}`)
        .digest('hex')
        .slice(0, 16)}`
      const timestamp = nowIso()
      await query(
        `INSERT INTO client_approvals (
           id, workspace_id, project_id, job_card_id, client_id, token_hash,
           client_name, client_email, project_name, title, body, expires_at, due_at, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [id, workspaceId, projectId, jobCardId, clientId, tokenHash, clientName, clientEmail, projectName, title, body, expiresAt, dueAt, timestamp],
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
        `SELECT approvals.*, reviews.id AS review_id
         FROM client_approvals approvals
         LEFT JOIN review_sessions reviews ON reviews.approval_id = approvals.id
         WHERE approvals.workspace_id = $1 AND approvals.project_id = $2
         ORDER BY approvals.created_at DESC`,
        [selectedWorkspaceId, projectId],
      )
      const packages = []
      for (const [index, row] of rows.entries()) {
        packages.push({
          ...mapApproval(row),
          reviewId: row.review_id || null,
          packageNumber: rows.length - index,
          items: await this.listReviewPackageItems(row.id),
        })
      }
      return packages
    },

    async createReviewPackageItems({ workspaceId, projectId, approvalId, items }) {
      const timestamp = nowIso()
      for (const [position, item] of items.entries()) {
        const id = `rvi_${createHash('sha256')
          .update(`${approvalId}:${item.bucketId}`)
          .digest('hex')
          .slice(0, 20)}`
        await query(
          `INSERT INTO review_package_items (
             id, approval_id, workspace_id, project_id, bucket_id, title,
             position, preview_file_id, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [id, approvalId, workspaceId, projectId, item.bucketId, item.title,
            position, item.previewFileId || null, timestamp, timestamp],
        )
      }
      return await this.listReviewPackageItems(approvalId)
    },

    async listReviewPackageItems(approvalId) {
      const rows = await query(
        `SELECT items.*, files.name AS preview_name, files.mime_type AS preview_mime_type,
                files.size AS preview_size,
                (SELECT COUNT(*) FROM project_comments comments
                 WHERE comments.review_item_id = items.id) AS comment_count
         FROM review_package_items items
         LEFT JOIN project_files files ON files.id = items.preview_file_id
         WHERE items.approval_id = $1
         ORDER BY items.position ASC, items.created_at ASC`,
        [approvalId],
      )
      const items = []
      for (const row of rows) {
        const comments = await query(
          `SELECT * FROM project_comments WHERE review_item_id = $1 ORDER BY created_at ASC`,
          [row.id],
        )
        const mapped = mapReviewPackageItem(row)
        mapped.comments = comments.map(mapProjectComment)
        items.push(mapped)
      }
      return items
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
                approvals.client_email, approvals.title, approvals.body, approvals.due_at,
                files.name AS artwork_name, files.mime_type AS artwork_mime_type,
                files.size AS artwork_size
         FROM review_sessions reviews
         JOIN client_approvals approvals ON approvals.id = reviews.approval_id
         LEFT JOIN project_files files ON files.id = reviews.artwork_file_id
         WHERE reviews.workspace_id = $1 AND reviews.id = $2`,
        [selectedWorkspaceId, reviewId],
      )
      const row = rows[0]
      return mapReview(
        row,
        row ? await this.listReviewAnnotations(row.id) : [],
        row ? await this.listReviewPackageItems(row.approval_id) : [],
      )
    },

    async getLatestReviewForProject(selectedWorkspaceId, projectId) {
      const rows = await query(
        `SELECT reviews.*, approvals.project_name, approvals.client_name,
                approvals.client_email, approvals.title, approvals.body, approvals.due_at,
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
      return mapReview(
        row,
        row ? await this.listReviewAnnotations(row.id) : [],
        row ? await this.listReviewPackageItems(row.approval_id) : [],
      )
    },

    async getPublicReview(reviewId, tokenHash) {
      const rows = await query(
        `SELECT reviews.*, approvals.project_name, approvals.client_name,
                approvals.client_email, approvals.title, approvals.body, approvals.due_at,
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
      return mapReview(
        row,
        await this.listReviewAnnotations(row.id),
        await this.listReviewPackageItems(row.approval_id),
      )
    },

    async respondToReviewPackageItem({ reviewId, tokenHash, itemId, status, comment = '' }) {
      const rows = await query(
        `SELECT reviews.id AS review_id, reviews.status AS review_status,
                reviews.expires_at, approvals.id AS approval_id,
                approvals.workspace_id, approvals.project_id, approvals.client_name,
                items.id AS item_id, items.bucket_id
         FROM review_sessions reviews
         JOIN client_approvals approvals ON approvals.id = reviews.approval_id
         JOIN review_package_items items ON items.approval_id = approvals.id
         WHERE reviews.id = $1 AND reviews.client_token_hash = $2 AND items.id = $3`,
        [reviewId, tokenHash, itemId],
      )
      const row = rows[0]
      if (!row || Date.parse(row.expires_at) <= Date.now()) return null
      if (row.review_status !== 'open') return { readOnly: true }
      const timestamp = nowIso()
      await query(
        `UPDATE review_package_items
         SET status = $1, responded_at = $2, updated_at = $2
         WHERE id = $3 AND approval_id = $4`,
        [status, timestamp, itemId, row.approval_id],
      )
      if (comment) {
        const commentId = `cmt_${createHash('sha256')
          .update(`${itemId}:${timestamp}:${comment}`)
          .digest('hex')
          .slice(0, 16)}`
        await query(
          `INSERT INTO project_comments (
             id, workspace_id, project_id, approval_id, review_item_id,
             bucket_id, author_type, author_name, body, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, 'client', $7, $8, $9)`,
          [commentId, row.workspace_id, row.project_id, row.approval_id, itemId,
            row.bucket_id, row.client_name, comment, timestamp],
        )
      }
      return (await this.listReviewPackageItems(row.approval_id))
        .find((item) => item.id === itemId) || null
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
                approvals.client_email, approvals.title, approvals.body, approvals.due_at,
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
        return mapReview(
          review,
          await this.listReviewAnnotations(reviewId),
          await this.listReviewPackageItems(review.approval_id),
        )
      }
      const annotations = await this.listReviewAnnotations(reviewId)
      if (annotations.some((annotation) => !annotation.comment.trim())) {
        return {
          missingComment: true,
          review: mapReview(
            review,
            annotations,
            await this.listReviewPackageItems(review.approval_id),
          ),
        }
      }
      const packageItems = await this.listReviewPackageItems(review.approval_id)
      if (packageItems.some((item) => item.status === 'waiting')) {
        return { incompleteItems: true, review: mapReview(review, annotations, packageItems) }
      }
      const allApproved = packageItems.length > 0 && packageItems.every((item) => item.status === 'approved')
      const timestamp = nowIso()
      await query(
        `UPDATE review_sessions SET status = 'submitted', submitted_at = $1 WHERE id = $2`,
        [timestamp, reviewId],
      )
      await query(
        `UPDATE client_approvals SET status = $1,
                responded_at = COALESCE(responded_at, $2)
         WHERE id = $3`,
        [allApproved ? 'approved' : 'commented', timestamp, review.approval_id],
      )
      await query(
        `UPDATE job_cards SET status = 'client_review', updated_at = $1 WHERE id = $2 AND workspace_id = $3`,
        [timestamp, review.job_card_id, review.approval_workspace_id],
      )
      await query(
        `UPDATE projects SET status = $1, updated_at = $2 WHERE id = $3 AND workspace_id = $4`,
        [allApproved ? 'Ready' : 'In review', timestamp, review.project_id, review.approval_workspace_id],
      )
      if (allApproved) {
        await query(
          `UPDATE job_cards SET status = 'approved', updated_at = $1 WHERE id = $2 AND workspace_id = $3`,
          [timestamp, review.job_card_id, review.approval_workspace_id],
        )
        await query(
          `UPDATE draft_invoices SET status = 'ready_for_review', updated_at = $1
           WHERE workspace_id = $2 AND project_id = $3`,
          [timestamp, review.approval_workspace_id, review.project_id],
        )
      }
      await this.createWorkspaceNotification({
        workspaceId: review.approval_workspace_id,
        kind: allApproved ? 'approval.approved' : 'approval.feedback_submitted',
        title: allApproved ? 'Client approved a review package' : 'Client submitted review feedback',
        body: `${review.client_name} ${allApproved ? 'approved' : 'submitted feedback on'} ${review.project_name}.`,
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
      if (response === 'approved') {
        await query(
          `UPDATE review_package_items
           SET status = 'approved', responded_at = COALESCE(responded_at, $1), updated_at = $1
           WHERE approval_id = $2`,
          [timestamp, approval.id],
        )
      }
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

    async markWorkspaceNotificationRead(selectedWorkspaceId, id) {
      await query(
        `UPDATE workspace_notifications
         SET read_at = COALESCE(read_at, $1)
         WHERE workspace_id = $2 AND id = $3`,
        [nowIso(), selectedWorkspaceId, id],
      )
      return await this.getWorkspaceNotification(selectedWorkspaceId, id)
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

    async listGoogleDriveSelections(selectedWorkspaceId) {
      const rows = await query(
        `SELECT drive_file_id, root_file_id, name, mime_type, web_view_link,
                resource_kind, created_at, updated_at
         FROM google_drive_selections
         WHERE workspace_id = $1
         ORDER BY updated_at DESC`,
        [selectedWorkspaceId],
      )
      return rows.map(mapGoogleDriveSelection)
    },

    async listGoogleDriveRootFileIds(selectedWorkspaceId) {
      const rows = await query(
        `SELECT drive_file_id
         FROM google_drive_selections
         WHERE workspace_id = $1 AND drive_file_id = root_file_id
         UNION
         SELECT drive_file_id
         FROM google_drive_resource_links
         WHERE workspace_id = $2
         UNION
         SELECT drive_file_id
         FROM workspace_documents
         WHERE workspace_id = $3 AND drive_file_id IS NOT NULL`,
        [selectedWorkspaceId, selectedWorkspaceId, selectedWorkspaceId],
      )
      return [...new Set(rows.map((row) => String(row.drive_file_id || '').trim()).filter(Boolean))]
    },

    async getGoogleDriveSelectionRoot(selectedWorkspaceId, driveFileId) {
      const rows = await query(
        `SELECT root_file_id FROM google_drive_selections
         WHERE workspace_id = $1 AND drive_file_id = $2`,
        [selectedWorkspaceId, driveFileId],
      )
      return rows[0]?.root_file_id || null
    },

    async replaceGoogleDriveSelections(selectedWorkspaceId, selections) {
      const timestamp = nowIso()
      await query(
        `DELETE FROM google_drive_selections WHERE workspace_id = $1`,
        [selectedWorkspaceId],
      )
      for (const selection of selections) {
        await query(
          `INSERT INTO google_drive_selections (
             workspace_id, drive_file_id, root_file_id, name, mime_type,
             web_view_link, resource_kind, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            selectedWorkspaceId,
            selection.driveFileId,
            selection.driveFileId,
            selection.name,
            selection.mimeType,
            selection.webViewLink || null,
            selection.resourceKind,
            timestamp,
            timestamp,
          ],
        )
      }
      return await this.listGoogleDriveSelections(selectedWorkspaceId)
    },

    async upsertGoogleDriveSelection({ workspaceId, rootFileId, file }) {
      const timestamp = nowIso()
      const resourceKind = file.mimeType === 'application/vnd.google-apps.folder'
        ? 'folder'
        : 'file'
      await query(
        `INSERT INTO google_drive_selections (
           workspace_id, drive_file_id, root_file_id, name, mime_type,
           web_view_link, resource_kind, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (workspace_id, drive_file_id) DO UPDATE SET
           root_file_id = EXCLUDED.root_file_id,
           name = EXCLUDED.name,
           mime_type = EXCLUDED.mime_type,
           web_view_link = EXCLUDED.web_view_link,
           resource_kind = EXCLUDED.resource_kind,
           updated_at = EXCLUDED.updated_at`,
        [
          workspaceId,
          file.id,
          rootFileId || file.id,
          file.name,
          file.mimeType,
          file.webViewLink || null,
          resourceKind,
          timestamp,
          timestamp,
        ],
      )
    },

    async upsertGoogleDriveSelectionFiles(selectedWorkspaceId, rootFileId, files) {
      for (const file of files) {
        await this.upsertGoogleDriveSelection({
          workspaceId: selectedWorkspaceId,
          rootFileId,
          file,
        })
      }
    },

    async deleteGoogleDriveSelection(selectedWorkspaceId, driveFileId) {
      await query(
        `DELETE FROM google_drive_selections
         WHERE workspace_id = $1 AND (drive_file_id = $2 OR root_file_id = $2)`,
        [selectedWorkspaceId, driveFileId],
      )
    },

    async deleteDriveResourceLinksForFile(selectedWorkspaceId, driveFileId) {
      await query(
        `DELETE FROM google_drive_resource_links
         WHERE workspace_id = $1 AND drive_file_id = $2`,
        [selectedWorkspaceId, driveFileId],
      )
    },

    async listWorkspaceDocuments(selectedWorkspaceId) {
      const rows = await query(
         `SELECT id, workspace_id, name, mime_type, size, content_sha256,
                storage_point_id, drive_file_id, drive_web_view_link, synced_at, folder_id, created_at, updated_at
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
        storagePointId: row.storage_point_id,
        driveFileId: row.drive_file_id,
        driveWebViewLink: row.drive_web_view_link,
        syncedAt: row.synced_at,
        folderId: row.folder_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    },

    async createWorkspaceDocument({
      workspaceId: selectedWorkspaceId,
      name,
      mimeType,
      body,
      storagePointId = null,
      folderId = null,
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
           content_sha256, storage_point_id, folder_id, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id,
          selectedWorkspaceId,
          name,
          mimeType,
          body.byteLength,
          body.toString('base64'),
          contentSha256,
          storagePointId,
          folderId,
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
            storagePointId: row.storage_point_id,
            driveFileId: row.drive_file_id,
            driveWebViewLink: row.drive_web_view_link,
            syncedAt: row.synced_at,
            folderId: row.folder_id,
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

    async listWorkspaceDocumentFolders(selectedWorkspaceId) {
      const rows = await query(
        `SELECT id, workspace_id, name, parent_id, created_at, updated_at
         FROM workspace_document_folders
         WHERE workspace_id = $1
         ORDER BY LOWER(name) ASC`,
        [selectedWorkspaceId],
      )
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        name: row.name,
        parentId: row.parent_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    },

    async getWorkspaceDocumentFolder(selectedWorkspaceId, id) {
      const rows = await query(
        `SELECT * FROM workspace_document_folders WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, id],
      )
      const row = rows[0]
      return row
        ? {
            id: row.id,
            workspaceId: row.workspace_id,
            name: row.name,
            parentId: row.parent_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }
        : null
    },

    async createWorkspaceDocumentFolder({
      workspaceId: selectedWorkspaceId,
      name,
      parentId = null,
    }) {
      const timestamp = nowIso()
      const id = `folder_${createHash('sha256')
        .update(`${selectedWorkspaceId}:${name}:${parentId}:${timestamp}`)
        .digest('hex')
        .slice(0, 16)}`
      await query(
        `INSERT INTO workspace_document_folders (
           id, workspace_id, name, parent_id, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, selectedWorkspaceId, name, parentId, timestamp, timestamp],
      )
      return await this.getWorkspaceDocumentFolder(selectedWorkspaceId, id)
    },

    async renameWorkspaceDocumentFolder(selectedWorkspaceId, id, name) {
      await query(
        `UPDATE workspace_document_folders
         SET name = $1, updated_at = $2
         WHERE workspace_id = $3 AND id = $4`,
        [name, nowIso(), selectedWorkspaceId, id],
      )
      return await this.getWorkspaceDocumentFolder(selectedWorkspaceId, id)
    },

    async deleteWorkspaceDocumentFolder(selectedWorkspaceId, id, parentId) {
      const timestamp = nowIso()
      await query(
        `UPDATE workspace_documents
         SET folder_id = $1, updated_at = $2
         WHERE workspace_id = $3 AND folder_id = $4`,
        [parentId, timestamp, selectedWorkspaceId, id],
      )
      await query(
        `UPDATE workspace_document_folders
         SET parent_id = $1, updated_at = $2
         WHERE workspace_id = $3 AND parent_id = $4`,
        [parentId, timestamp, selectedWorkspaceId, id],
      )
      await query(
        `DELETE FROM workspace_document_folders WHERE workspace_id = $1 AND id = $2`,
        [selectedWorkspaceId, id],
      )
    },

    async moveWorkspaceDocumentFolder(selectedWorkspaceId, id, parentId) {
      await query(
        `UPDATE workspace_document_folders
         SET parent_id = $1, updated_at = $2
         WHERE workspace_id = $3 AND id = $4`,
        [parentId, nowIso(), selectedWorkspaceId, id],
      )
      return await this.getWorkspaceDocumentFolder(selectedWorkspaceId, id)
    },

    async moveWorkspaceDocument(selectedWorkspaceId, id, folderId) {
      await query(
        `UPDATE workspace_documents
         SET folder_id = $1, updated_at = $2
         WHERE workspace_id = $3 AND id = $4`,
        [folderId, nowIso(), selectedWorkspaceId, id],
      )
      return await this.getWorkspaceDocument(selectedWorkspaceId, id)
    },

    async clearWorkspaceDocumentDriveLink(selectedWorkspaceId, driveFileId) {
      await query(
        `UPDATE workspace_documents
         SET drive_file_id = NULL, drive_web_view_link = NULL,
             synced_at = NULL, updated_at = $1
         WHERE workspace_id = $2 AND drive_file_id = $3`,
        [nowIso(), selectedWorkspaceId, driveFileId],
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
        `SELECT id, provider, label, folder_url, notes, is_default, created_at, updated_at
         FROM workspace_cloud_links
         WHERE workspace_id = $1
         ORDER BY is_default DESC, created_at DESC`,
        [selectedWorkspaceId],
      )
      return rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        label: row.label || '',
        folderUrl: row.folder_url,
        notes: row.notes || '',
        isDefault: Boolean(Number(row.is_default)),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    },

    async createWorkspaceCloudLink({ workspaceId, provider, label, folderUrl, notes = '', isDefault = false }) {
      const id = `cloud_${createHash('sha256').update(`${workspaceId}:${folderUrl}:${nowIso()}`).digest('hex').slice(0, 12)}`
      const timestamp = nowIso()
      if (isDefault) {
        await query(
          `UPDATE workspace_cloud_links SET is_default = 0, updated_at = $1 WHERE workspace_id = $2`,
          [timestamp, workspaceId],
        )
      }
      await query(
        `INSERT INTO workspace_cloud_links (id, workspace_id, provider, label, folder_url, notes, is_default, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, workspaceId, provider, label, folderUrl, notes, isDefault ? 1 : 0, timestamp, timestamp],
      )
      return {
        id,
        provider,
        label,
        folderUrl,
        notes,
        isDefault,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    },

    async setDefaultWorkspaceCloudLink(selectedWorkspaceId, linkId) {
      const timestamp = nowIso()
      const rows = await query(
        `UPDATE workspace_cloud_links
         SET is_default = CASE WHEN id = $2 THEN 1 ELSE 0 END, updated_at = $3
         WHERE workspace_id = $1
         RETURNING id`,
        [selectedWorkspaceId, linkId, timestamp],
      )
      return rows.some((row) => row.id === linkId)
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

    async updateUserAvatar(userId, avatarUrl) {
      await query(
        `UPDATE users SET avatar_url = $1, updated_at = $2 WHERE id = $3`,
        [avatarUrl || '', nowIso(), userId],
      )
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
