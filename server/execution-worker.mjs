import { randomUUID } from 'node:crypto'

const RETRYABLE_CODES = new Set([
  'TIMEOUT',
  'PROVIDER_ERROR',
  'PROVIDER_UNAVAILABLE',
  'RATE_LIMITED',
  'TEMPORARY_FAILURE',
])

function jobFailure(error) {
  const code = String(error?.code || 'JOB_HANDLER_FAILED').slice(0, 160)
  return {
    code,
    message: String(error?.message || 'The execution job failed.').slice(0, 2_000),
    retryable: error?.retryable === true || RETRYABLE_CODES.has(code),
  }
}

function retryTime(attempt, now, baseDelayMs, maximumDelayMs) {
  const delay = Math.min(maximumDelayMs, baseDelayMs * (2 ** Math.max(0, attempt - 1)))
  return new Date(now.getTime() + delay).toISOString()
}

/**
 * Durable database worker. Redis may wake this worker, but the database job row,
 * lease, attempt count, and event stream remain the source of truth.
 */
export function createExecutionWorker({
  database,
  handlers = {},
  workerId = `lancee-${process.pid}-${randomUUID()}`,
  now = () => new Date(),
  pollIntervalMs = 1_000,
  leaseSeconds = 60,
  heartbeatIntervalMs = 15_000,
  maxJobsPerTick = 20,
  retryBaseDelayMs = 1_000,
  retryMaximumDelayMs = 5 * 60_000,
  onEvent = null,
} = {}) {
  if (!database?.claimNextExecutionJob || !database?.completeExecutionJob) {
    throw new TypeError('The execution worker requires the Lancee durable job database adapter.')
  }
  const registeredHandlers = new Map(Object.entries(handlers))
  const active = new Map()
  let timer = null
  let polling = false

  async function appendEvent(job, eventType, message, { level = 'info', data = null } = {}) {
    const event = await database.appendExecutionJobEvent({
      workspaceId: job.workspaceId,
      jobId: job.id,
      level,
      eventType,
      message,
      data,
    })
    if (event && typeof onEvent === 'function') {
      try {
        await onEvent({ job, event })
      } catch {
        // Delivery accelerators are best-effort; the durable event remains available.
      }
    }
    return event
  }

  async function heartbeat(job) {
    const renewed = await database.heartbeatExecutionJob({
      workspaceId: job.workspaceId,
      id: job.id,
      workerId,
      now: now().toISOString(),
      leaseSeconds,
    })
    if (!renewed) {
      const error = new Error('The execution job lease was lost.')
      error.code = 'JOB_LEASE_LOST'
      error.retryable = true
      throw error
    }
    return renewed
  }

  async function execute(job) {
    const handler = registeredHandlers.get(job.kind)
    if (!handler) {
      const failed = await database.failExecutionJob({
        workspaceId: job.workspaceId,
        id: job.id,
        workerId,
        errorCode: 'JOB_HANDLER_NOT_FOUND',
        errorMessage: `No local handler is registered for ${job.kind}.`,
        retry: false,
        now: now().toISOString(),
      })
      if (failed) await appendEvent(failed, 'job.failed', failed.errorMessage, { level: 'error' })
      return failed
    }

    const controller = new AbortController()
    active.set(job.id, controller)
    const heartbeatTimer = setInterval(() => {
      void heartbeat(job).catch(() => controller.abort())
    }, Math.max(1_000, Math.min(heartbeatIntervalMs, leaseSeconds * 500)))
    heartbeatTimer.unref?.()
    await appendEvent(job, 'job.started', `Execution attempt ${job.attemptCount} started.`, {
      data: { workerId, attempt: job.attemptCount },
    })
    try {
      const output = await handler({
        job,
        input: job.input || {},
        signal: controller.signal,
        heartbeat: () => heartbeat(job),
      })
      if (controller.signal.aborted) {
        const lost = new Error('The execution job was cancelled or its lease was lost.')
        lost.code = 'JOB_ABORTED'
        lost.retryable = true
        throw lost
      }
      const completed = await database.completeExecutionJob({
        workspaceId: job.workspaceId,
        id: job.id,
        workerId,
        output,
        now: now().toISOString(),
      })
      if (!completed) return null
      await appendEvent(completed, 'job.completed', 'Execution completed.', { data: { output } })
      return completed
    } catch (error) {
      const failure = jobFailure(error)
      const timestamp = now()
      const failed = await database.failExecutionJob({
        workspaceId: job.workspaceId,
        id: job.id,
        workerId,
        errorCode: failure.code,
        errorMessage: failure.message,
        retry: failure.retryable,
        retryAt: retryTime(job.attemptCount, timestamp, retryBaseDelayMs, retryMaximumDelayMs),
        now: timestamp.toISOString(),
      })
      if (failed) {
        const retried = failed.status === 'queued'
        await appendEvent(
          failed,
          retried ? 'job.retry_scheduled' : 'job.failed',
          retried ? 'Execution failed; a retry was scheduled.' : 'Execution failed.',
          { level: retried ? 'warning' : 'error', data: failure },
        )
      }
      return failed
    } finally {
      clearInterval(heartbeatTimer)
      active.delete(job.id)
    }
  }

  async function recover(workspaceId) {
    const recovered = await database.recoverExpiredExecutionJobs(workspaceId, {
      now: now().toISOString(),
    })
    for (const job of recovered.retried) {
      await appendEvent(job, 'job.lease_recovered', 'An expired lease was recovered and requeued.', { level: 'warning' })
    }
    for (const job of recovered.failed) {
      await appendEvent(job, 'job.failed', 'The final execution lease expired.', { level: 'error' })
    }
    return recovered
  }

  async function runWorkspace(workspaceId) {
    await recover(workspaceId)
    const processed = []
    for (let index = 0; index < maxJobsPerTick; index += 1) {
      const job = await database.claimNextExecutionJob({
        workspaceId,
        workerId,
        now: now().toISOString(),
        leaseSeconds,
      })
      if (!job) break
      processed.push(await execute(job))
    }
    return processed.filter(Boolean)
  }

  async function tick() {
    if (polling) return []
    polling = true
    try {
      const workspaceIds = typeof database.listExecutionWorkspaceIds === 'function'
        ? await database.listExecutionWorkspaceIds()
        : []
      const results = []
      for (const workspaceId of workspaceIds) results.push(...await runWorkspace(workspaceId))
      return results
    } finally {
      polling = false
    }
  }

  function register(kind, handler) {
    if (!kind || typeof handler !== 'function') throw new TypeError('A job kind and handler are required.')
    registeredHandlers.set(String(kind), handler)
    return () => registeredHandlers.delete(String(kind))
  }

  async function enqueue(input) {
    const job = await database.enqueueExecutionJob(input)
    if (job.eventSequence === 0) await appendEvent(job, 'job.queued', 'Execution queued.')
    return job
  }

  async function cancel(workspaceId, jobId) {
    active.get(jobId)?.abort()
    const job = await database.cancelExecutionJob(workspaceId, jobId, now().toISOString())
    if (job) await appendEvent(job, 'job.cancelled', 'Execution cancelled.', { level: 'warning' })
    return job
  }

  async function start() {
    if (timer) return stop
    await tick()
    timer = setInterval(() => void tick(), pollIntervalMs)
    timer.unref?.()
    return stop
  }

  async function stop() {
    if (timer) clearInterval(timer)
    timer = null
    for (const controller of active.values()) controller.abort()
  }

  return Object.freeze({
    workerId,
    register,
    enqueue,
    cancel,
    recover,
    runWorkspace,
    tick,
    start,
    stop,
    activeCount: () => active.size,
    registeredKinds: () => [...registeredHandlers.keys()].sort(),
  })
}
