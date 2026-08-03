import { lookup } from 'node:dns/promises'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { isIP } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const lanceeMcpScope = 'mcp:invoke'

const automationIdPattern = /^aut_[a-f0-9]{12}$/
const runIdPattern = /^run_[a-f0-9]{12}$/
const MAX_INSTRUCTION_LENGTH = 5_000
const MAX_CODE_LENGTH = 20_000
const MAX_EXTERNAL_BODY_LENGTH = 32_000
const MAX_EXTERNAL_RESPONSE_LENGTH = 256_000
const MAX_CODE_OUTPUT_LENGTH = 64_000

export class LanceeMcpError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message)
    this.name = 'LanceeMcpError'
    this.code = code
    this.status = status
    Object.assign(this, details)
  }
}

export const lanceeMcpToolDefinitions = [
  {
    name: 'run_workflow',
    title: 'Run Lancee workflow',
    description: 'Queue an active Lancee Core or Edge workflow for execution in the authorized workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string', pattern: '^aut_[a-f0-9]{12}$', description: 'The workflow automation id.' },
        instruction: { type: 'string', minLength: 1, maxLength: MAX_INSTRUCTION_LENGTH, description: 'The concrete instruction for this run.' },
        provider: { type: 'string', maxLength: 50, description: 'Optional connected integration provider used by an Edge workflow.' },
      },
      required: ['workflow_id', 'instruction'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'create_workflow',
    title: 'Create Lancee workflow',
    description: 'Create a workspace-scoped Lancee workflow with bounded Core tool permissions and make it active by default.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 2, maxLength: 120 },
        description: { type: 'string', minLength: 2, maxLength: 500 },
        model: { type: 'string', maxLength: 120 },
        execution: { type: 'string', enum: ['core', 'edge'] },
        tools: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'workspace.summary',
              'projects.list',
              'clients.list',
              'invoices.list',
              'projects.update_status',
              'projects.create_draft_invoice',
            ],
          },
          maxItems: 20,
        },
        activate: { type: 'boolean', description: 'Set false only when the user explicitly asks for a draft.' },
      },
      required: ['name', 'description'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'get_workflow_status',
    title: 'Get workflow status',
    description: 'Read the status of a Lancee workflow or a specific workflow run, including recent activity.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string', pattern: '^aut_[a-f0-9]{12}$' },
        run_id: { type: 'string', pattern: '^run_[a-f0-9]{12}$' },
        include_runs: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'search_workflows',
    title: 'Search Lancee workflows',
    description: 'Search the authorized workspace for workflows by name, description, status, or execution mode.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', maxLength: 200 },
        status: { type: 'string', enum: ['all', 'draft', 'active', 'paused'] },
        execution: { type: 'string', enum: ['all', 'core', 'edge'] },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'execute_python',
    title: 'Execute Python',
    description: 'Run a short Python snippet only when the server-side Lancee code execution feature is explicitly enabled.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', minLength: 1, maxLength: MAX_CODE_LENGTH },
        timeout_ms: { type: 'integer', minimum: 250, maximum: 15000 },
      },
      required: ['code'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  },
  {
    name: 'execute_javascript',
    title: 'Execute JavaScript',
    description: 'Run a short JavaScript snippet only when the server-side Lancee code execution feature is explicitly enabled.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', minLength: 1, maxLength: MAX_CODE_LENGTH },
        timeout_ms: { type: 'integer', minimum: 250, maximum: 15000 },
      },
      required: ['code'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  },
  {
    name: 'schedule_job',
    title: 'Schedule workflow job',
    description: 'Persist a one-shot or repeating workflow run. A server scheduler claims due rows and records each run.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string', pattern: '^aut_[a-f0-9]{12}$' },
        instruction: { type: 'string', minLength: 1, maxLength: MAX_INSTRUCTION_LENGTH },
        run_at: { type: 'string', format: 'date-time', description: 'Future ISO-8601 time at which to start the first run.' },
        interval_seconds: { type: 'integer', minimum: 60, maximum: 2592000, description: 'Optional repeat interval between runs.' },
        provider: { type: 'string', maxLength: 50 },
      },
      required: ['workflow_id', 'instruction', 'run_at'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'get_logs',
    title: 'Get workflow logs',
    description: 'Read persisted event logs for a Lancee workflow run.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', pattern: '^run_[a-f0-9]{12}$' },
        level: { type: 'string', enum: ['all', 'info', 'warning', 'warn', 'error'] },
        event_type: { type: 'string', maxLength: 80 },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
      required: ['run_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'call_external_api',
    title: 'Call external API',
    description: 'Call a public HTTP API with bounded time, body, and response size. Redirects, private hosts, cookies, and authorization headers are blocked.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', minLength: 1, maxLength: 2048, format: 'uri' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] },
        headers: { type: 'object', additionalProperties: { type: 'string', maxLength: 500 }, maxProperties: 20 },
        body: { description: 'JSON-compatible request body. It is limited to 32 KB.' },
        timeout_ms: { type: 'integer', minimum: 250, maximum: 15000 },
      },
      required: ['url'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
]

function objectArguments(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'Tool arguments must be an object.')
  }
  return value
}

function textArgument(args, key, { required = false, maxLength = 200 } = {}) {
  const value = String(args[key] || '').trim()
  if (required && !value) {
    throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', `${key} is required.`)
  }
  if (value.length > maxLength) {
    throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', `${key} must be ${maxLength} characters or fewer.`)
  }
  return value
}

function automationId(value) {
  const id = textArgument({ value }, 'value', { required: true, maxLength: 80 })
  if (!automationIdPattern.test(id)) {
    throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'A valid workflow id is required.')
  }
  return id
}

function runId(value) {
  const id = textArgument({ value }, 'value', { required: true, maxLength: 80 })
  if (!runIdPattern.test(id)) {
    throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'A valid workflow run id is required.')
  }
  return id
}

function requireContext(context) {
  if (!context?.workspace?.id || !context?.user?.id) {
    throw new LanceeMcpError('MCP_CONTEXT_UNAVAILABLE', 'The connector workspace is unavailable.', 401)
  }
  return context
}

function publicContext(context) {
  return {
    user: { id: context.user.id, name: context.user.name, email: context.user.email },
    workspace: { id: context.workspace.id, name: context.workspace.name },
    membership: context.membership,
  }
}

function privateIpv4(address) {
  const octets = address.split('.').map(Number)
  return (
    octets[0] === 0 ||
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
    octets[0] >= 224
  )
}

function privateIpv6(address) {
  const normalized = address.toLowerCase()
  if (normalized.startsWith('::ffff:')) return privateIpv4(normalized.slice(7))
  return normalized === '::' || normalized === '::1' ||
    normalized.startsWith('fc') || normalized.startsWith('fd') ||
    normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
    normalized.startsWith('fea') || normalized.startsWith('feb') ||
    normalized.startsWith('ff')
}

function isPrivateAddress(address) {
  const version = isIP(address)
  return version === 4 ? privateIpv4(address) : version === 6 ? privateIpv6(address) : true
}

async function validateExternalApiUrl(value) {
  let target
  try {
    target = new URL(value)
  } catch {
    throw new LanceeMcpError('MCP_INVALID_URL', 'Enter a valid external API URL.')
  }
  if (target.username || target.password || target.hash) {
    throw new LanceeMcpError('MCP_INVALID_URL', 'External API URLs cannot contain credentials or fragments.')
  }
  const production = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production'
  if (target.protocol !== 'https:' && !(target.protocol === 'http:' && !production && process.env.LANCEE_MCP_ALLOW_HTTP === 'true')) {
    throw new LanceeMcpError('MCP_HTTPS_REQUIRED', 'External API calls must use HTTPS.')
  }
  const hostname = target.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname === 'metadata.google.internal') {
    throw new LanceeMcpError('MCP_PRIVATE_ADDRESS_BLOCKED', 'Private and internal API hosts are not allowed.')
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true }).catch(() => [])
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new LanceeMcpError('MCP_PRIVATE_ADDRESS_BLOCKED', 'The API hostname must resolve only to public addresses.')
  }
  return target
}

function jsonByteLength(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value))
  } catch {
    throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'The request body must be JSON-compatible.')
  }
}

async function readResponseBody(response, maximumLength) {
  if (!response.body) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const chunks = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > maximumLength) {
      await reader.cancel().catch(() => {})
      throw new LanceeMcpError('MCP_RESPONSE_TOO_LARGE', 'The external API response exceeded the 256 KB limit.', 413)
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

async function callExternalApi(args) {
  const target = await validateExternalApiUrl(textArgument(args, 'url', { required: true, maxLength: 2048 }))
  const method = textArgument(args, 'method', { maxLength: 10 }).toUpperCase() || 'GET'
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(method)) {
    throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'Use GET, POST, PUT, PATCH, DELETE, or HEAD.')
  }
  const headers = args.headers === undefined ? {} : args.headers
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'headers must be an object of string values.')
  }
  const blockedHeaders = new Set(['authorization', 'cookie', 'set-cookie', 'proxy-authorization', 'host', 'content-length', 'x-forwarded-for', 'x-forwarded-host'])
  const requestHeaders = {}
  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = key.toLowerCase()
    if (blockedHeaders.has(normalizedKey)) {
      throw new LanceeMcpError('MCP_HEADER_BLOCKED', `The ${key} header is not allowed.`)
    }
    if (!/^[a-z0-9-]+$/i.test(key) || typeof value !== 'string' || value.length > 500) {
      throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'Headers must use simple names and string values up to 500 characters.')
    }
    requestHeaders[key] = value
  }
  const hasBody = args.body !== undefined && method !== 'GET' && method !== 'HEAD'
  if (args.body !== undefined && jsonByteLength(args.body) > MAX_EXTERNAL_BODY_LENGTH) {
    throw new LanceeMcpError('MCP_BODY_TOO_LARGE', 'The external API request body exceeded the 32 KB limit.', 413)
  }
  const timeoutMs = Number.isFinite(Number(args.timeout_ms))
    ? Math.min(15_000, Math.max(250, Number(args.timeout_ms)))
    : 10_000
  if (hasBody && !Object.keys(requestHeaders).some((key) => key.toLowerCase() === 'content-type')) {
    requestHeaders['Content-Type'] = 'application/json'
  }
  let response
  try {
    response = await fetch(target, {
      method,
      headers: requestHeaders,
      body: hasBody ? JSON.stringify(args.body) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new LanceeMcpError('MCP_EXTERNAL_TIMEOUT', 'The external API did not respond before the timeout.', 504)
    }
    throw new LanceeMcpError('MCP_EXTERNAL_UNREACHABLE', 'The external API could not be reached.', 502)
  }
  const body = await readResponseBody(response, MAX_EXTERNAL_RESPONSE_LENGTH)
  const contentType = response.headers.get('content-type') || ''
  const raw = body.toString('utf8')
  let data = raw
  if (contentType.includes('json')) {
    try { data = JSON.parse(raw) } catch { data = raw }
  }
  return {
    status: response.status,
    ok: response.ok,
    url: target.toString(),
    contentType: contentType || null,
    data,
  }
}

async function executeCode(language, args) {
  if (process.env.LANCEE_MCP_CODE_EXECUTION !== 'true') {
    throw new LanceeMcpError(
      'LANCEE_CODE_EXECUTION_DISABLED',
      'Code execution is disabled. Enable LANCEE_MCP_CODE_EXECUTION only in an isolated worker/container.',
      503,
    )
  }
  const code = textArgument(args, 'code', { required: true, maxLength: MAX_CODE_LENGTH })
  const timeoutMs = Number.isFinite(Number(args.timeout_ms))
    ? Math.min(15_000, Math.max(250, Number(args.timeout_ms)))
    : 10_000
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'lancee-mcp-'))
  const command = language === 'python'
    ? (process.env.LANCEE_MCP_PYTHON_BIN || 'python3')
    : process.execPath
  const commandArguments = language === 'python'
    ? ['-I', '-S', '-c', code]
    : ['--no-addons', '--disallow-code-generation-from-strings', '-e', code]
  const environment = {
    PATH: process.env.PATH || '',
    LANG: 'C',
    LC_ALL: 'C',
  }
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(command, commandArguments, {
        cwd: temporaryDirectory,
        env: environment,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const stdout = []
      const stderr = []
      let outputLength = 0
      let outputTooLarge = false
      let timedOut = false
      const append = (target, chunk) => {
        if (outputLength >= MAX_CODE_OUTPUT_LENGTH) return
        const remaining = MAX_CODE_OUTPUT_LENGTH - outputLength
        const buffer = Buffer.from(chunk).subarray(0, remaining)
        outputLength += buffer.length
        target.push(buffer)
        if (buffer.length < chunk.length) outputTooLarge = true
      }
      child.stdout.on('data', (chunk) => append(stdout, chunk))
      child.stderr.on('data', (chunk) => append(stderr, chunk))
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, timeoutMs)
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('close', (exitCode, signal) => {
        clearTimeout(timer)
        resolve({
          exitCode,
          signal,
          timedOut,
          outputTooLarge,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        })
      })
    })
    return { language, ...result }
  } catch (error) {
    throw new LanceeMcpError('LANCEE_CODE_EXECUTION_FAILED', error.message || 'The code process could not be started.', 502)
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {})
  }
}

export function createLanceeMcpRuntime({
  database,
  coreToolIds = [],
  executeAutomationRun,
  enqueueCoreJob,
  prepareAutomationRun,
}) {
  const availableCoreTools = new Set(coreToolIds)
  let schedulerTimer = null
  let schedulerBusy = false

  async function runWorkflow(context, args) {
    const workflowId = automationId(args.workflow_id)
    const instruction = textArgument(args, 'instruction', { required: true, maxLength: MAX_INSTRUCTION_LENGTH })
    const provider = textArgument(args, 'provider', { maxLength: 50 }) || null
    if (provider && !/^[a-z0-9][a-z0-9._-]{1,49}$/i.test(provider)) {
      throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'provider must be a valid integration id.')
    }
    const workspaceId = context.workspace.id
    const workflow = await database.getAutomation(workspaceId, workflowId)
    if (!workflow) throw new LanceeMcpError('MCP_WORKFLOW_NOT_FOUND', 'Workflow not found.', 404)
    if (workflow.status !== 'active') throw new LanceeMcpError('MCP_WORKFLOW_NOT_ACTIVE', 'Activate this workflow before running it.', 409)
    await prepareAutomationRun?.(context, workflow, provider)
    const run = await database.createAutomationRun({
      workspaceId,
      automationId: workflowId,
      triggeredBy: context.user.id,
      instruction,
    })
    await database.appendAutomationRunEvent({
      workspaceId,
      runId: run.id,
      eventType: 'run.queued',
      message: workflow.execution === 'core'
        ? 'Core workflow queued by Lancee MCP.'
        : 'Edge workflow queued by Lancee MCP.',
      output: { execution: workflow.execution, source: 'lancee-mcp' },
    })
    const job = {
      workspaceId,
      userId: context.user.id,
      automationId: workflowId,
      runId: run.id,
      provider,
    }
    const queued = workflow.execution === 'core' && Boolean(await enqueueCoreJob?.(job))
    if (!queued) {
      void executeAutomationRun(context, workflow, run, provider).catch((error) => {
        console.error('Lancee MCP workflow run failed:', error)
      })
    }
    return {
      workflow: { id: workflow.id, name: workflow.name, execution: workflow.execution },
      run: { ...run, queued, source: 'lancee-mcp' },
    }
  }

  async function scheduleJob(context, args) {
    const workflowId = automationId(args.workflow_id)
    const instruction = textArgument(args, 'instruction', { required: true, maxLength: MAX_INSTRUCTION_LENGTH })
    const workflow = await database.getAutomation(context.workspace.id, workflowId)
    if (!workflow) throw new LanceeMcpError('MCP_WORKFLOW_NOT_FOUND', 'Workflow not found.', 404)
    if (workflow.status !== 'active') throw new LanceeMcpError('MCP_WORKFLOW_NOT_ACTIVE', 'Activate this workflow before scheduling it.', 409)
    const runAt = new Date(textArgument(args, 'run_at', { required: true, maxLength: 80 }))
    const delay = runAt.getTime() - Date.now()
    if (!Number.isFinite(runAt.getTime()) || delay < 1_000 || delay > 365 * 24 * 60 * 60 * 1000) {
      throw new LanceeMcpError('MCP_INVALID_SCHEDULE', 'run_at must be between one second and one year in the future.')
    }
    const intervalSeconds = args.interval_seconds === undefined ? null : Number(args.interval_seconds)
    if (intervalSeconds !== null && (!Number.isInteger(intervalSeconds) || intervalSeconds < 60 || intervalSeconds > 2_592_000)) {
      throw new LanceeMcpError('MCP_INVALID_SCHEDULE', 'interval_seconds must be between 60 and 2,592,000 seconds.')
    }
    const provider = textArgument(args, 'provider', { maxLength: 50 }) || null
    if (provider && !/^[a-z0-9][a-z0-9._-]{1,49}$/i.test(provider)) {
      throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'provider must be a valid integration id.')
    }
    const schedule = await database.createAutomationSchedule({
      workspaceId: context.workspace.id,
      automationId: workflowId,
      createdBy: context.user.id,
      instruction,
      provider,
      runAt: runAt.toISOString(),
      intervalSeconds,
    })
    return { schedule }
  }

  async function dispatchDueSchedules() {
    if (schedulerBusy) return
    schedulerBusy = true
    try {
      const dueSchedules = await database.listDueAutomationSchedules(new Date().toISOString(), 50)
      for (const candidate of dueSchedules) {
        const schedule = await database.claimAutomationSchedule({
          selectedWorkspaceId: candidate.workspaceId,
          id: candidate.id,
          now: new Date().toISOString(),
        })
        if (!schedule) continue
        const context = await database.getContextByIds(schedule.createdBy, schedule.workspaceId)
        if (!context) {
          await database.failAutomationSchedule({
            selectedWorkspaceId: schedule.workspaceId,
            id: schedule.id,
            error: 'The schedule owner or workspace is no longer available.',
          })
          continue
        }
        try {
          const result = await runWorkflow(publicContext(context), {
            workflow_id: schedule.workflowId,
            instruction: schedule.instruction,
            provider: schedule.provider || undefined,
          })
          if (schedule.intervalSeconds) {
            await database.rescheduleAutomationSchedule({
              selectedWorkspaceId: schedule.workspaceId,
              id: schedule.id,
              runAt: new Date(Date.now() + schedule.intervalSeconds * 1000).toISOString(),
              lastRunId: result.run.id,
            })
          } else {
            await database.completeAutomationSchedule({
              selectedWorkspaceId: schedule.workspaceId,
              id: schedule.id,
              lastRunId: result.run.id,
            })
          }
        } catch (error) {
          await database.failAutomationSchedule({
            selectedWorkspaceId: schedule.workspaceId,
            id: schedule.id,
            error: error.message || 'Scheduled workflow failed.',
          })
        }
      }
    } finally {
      schedulerBusy = false
    }
  }

  async function startScheduler({ intervalMs = 1_000 } = {}) {
    if (schedulerTimer) return stopScheduler
    await database.recoverAutomationSchedules()
    await dispatchDueSchedules()
    schedulerTimer = setInterval(() => void dispatchDueSchedules(), intervalMs)
    schedulerTimer.unref?.()
    return stopScheduler
  }

  async function stopScheduler() {
    if (!schedulerTimer) return
    clearInterval(schedulerTimer)
    schedulerTimer = null
  }

  async function invoke(name, rawArguments, rawContext) {
    const context = requireContext(rawContext)
    const args = objectArguments(rawArguments)
    if (name === 'run_workflow') return runWorkflow(context, args)
    if (name === 'create_workflow') {
      const nameValue = textArgument(args, 'name', { required: true, maxLength: 120 })
      const description = textArgument(args, 'description', { required: true, maxLength: 500 })
      if (nameValue.length < 2 || description.length < 2) throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'Workflow name and description must be at least two characters.')
      const model = textArgument(args, 'model', { maxLength: 120 }) || 'Rules + connected tools'
      const execution = args.execution === undefined ? 'core' : String(args.execution)
      if (!['core', 'edge'].includes(execution)) throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'execution must be core or edge.')
      const tools = args.tools === undefined
        ? (execution === 'core' ? ['workspace.summary', 'projects.list'] : [])
        : args.tools
      if (!Array.isArray(tools) || tools.length > 20 || tools.some((tool) => typeof tool !== 'string' || !availableCoreTools.has(tool))) {
        throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'One or more requested Core tools are unavailable.')
      }
      const workflow = await database.createAutomation({
        workspaceId: context.workspace.id,
        createdBy: context.user.id,
        name: nameValue,
        description,
        model,
        execution,
        tools: [...new Set(tools)],
      })
      const readyWorkflow = args.activate === false
        ? workflow
        : await database.setAutomationStatus(context.workspace.id, workflow.id, 'active')
      return { workflow: readyWorkflow }
    }
    if (name === 'search_workflows') {
      const query = textArgument(args, 'query', { maxLength: 200 }).toLowerCase()
      const status = args.status === undefined ? 'all' : String(args.status)
      const execution = args.execution === undefined ? 'all' : String(args.execution)
      const limit = Number.isInteger(args.limit) ? Math.min(50, Math.max(1, args.limit)) : 20
      if (!['all', 'draft', 'active', 'paused'].includes(status) || !['all', 'core', 'edge'].includes(execution)) {
        throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'Use supported workflow status and execution filters.')
      }
      const workflows = (await database.listAutomations(context.workspace.id)).filter((workflow) => {
        const matchesQuery = !query || `${workflow.name} ${workflow.description}`.toLowerCase().includes(query)
        return matchesQuery && (status === 'all' || workflow.status === status) && (execution === 'all' || workflow.execution === execution)
      })
      return { workflows: workflows.slice(0, limit), total: workflows.length }
    }
    if (name === 'get_workflow_status') {
      const workflowId = args.workflow_id ? automationId(args.workflow_id) : null
      const selectedRunId = args.run_id ? runId(args.run_id) : null
      if (!workflowId && !selectedRunId) throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'workflow_id or run_id is required.')
      if (selectedRunId) {
        const run = await database.getAutomationRun(context.workspace.id, selectedRunId)
        if (!run) throw new LanceeMcpError('MCP_RUN_NOT_FOUND', 'Workflow run not found.', 404)
        const workflow = await database.getAutomation(context.workspace.id, run.automationId)
        return { workflow, run }
      }
      const workflow = await database.getAutomation(context.workspace.id, workflowId)
      if (!workflow) throw new LanceeMcpError('MCP_WORKFLOW_NOT_FOUND', 'Workflow not found.', 404)
      const runs = args.include_runs === false
        ? []
        : (await database.listAutomationRuns(context.workspace.id)).filter((run) => run.automationId === workflowId).slice(0, 20)
      const scheduled = await database.listAutomationSchedules(context.workspace.id, workflowId)
      return { workflow, runs, schedules: scheduled }
    }
    if (name === 'execute_python' || name === 'execute_javascript') {
      return executeCode(name === 'execute_python' ? 'python' : 'javascript', args)
    }
    if (name === 'schedule_job') return scheduleJob(context, args)
    if (name === 'get_logs') {
      const selectedRunId = runId(args.run_id)
      const run = await database.getAutomationRun(context.workspace.id, selectedRunId)
      if (!run) throw new LanceeMcpError('MCP_RUN_NOT_FOUND', 'Workflow run not found.', 404)
      const requestedLevel = args.level === undefined ? 'all' : String(args.level)
      const level = requestedLevel === 'warn' ? 'warning' : requestedLevel
      const eventType = textArgument(args, 'event_type', { maxLength: 80 })
      const limit = Number.isInteger(args.limit) ? Math.min(200, Math.max(1, args.limit)) : 100
      if (!['all', 'info', 'warning', 'error'].includes(level)) throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'Use all, info, warning, or error for level.')
      const logs = (run.events || []).filter((event) => (level === 'all' || event.level === level) && (!eventType || event.eventType === eventType))
      return { runId: selectedRunId, logs: logs.slice(0, limit), total: logs.length }
    }
    if (name === 'call_external_api') return callExternalApi(args)
    throw new LanceeMcpError('MCP_TOOL_NOT_FOUND', `Unknown Lancee MCP tool: ${name}.`, 404)
  }

  return { invoke, startScheduler, stopScheduler, dispatchDueSchedules }
}
