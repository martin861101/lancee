import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRuntimeCapabilities } from '../server/capabilities/runtime.mjs'
import { createCapabilityRegistry } from '../server/capabilities/registry.mjs'
import { openDatabase } from '../server/database.mjs'
import { createExecutionWorker } from '../server/execution-worker.mjs'

const directory = mkdtempSync(join(tmpdir(), 'lancee-worker-artifact-'))
let database

try {
  database = await openDatabase({
    databasePath: join(directory, 'worker.sqlite'),
    adminEmail: 'worker@example.test',
    adminName: 'Worker Test',
    adminPasswordSalt: 'worker-salt',
    adminPasswordHash: 'worker-hash',
    workspaceId: 'wsp_worker',
    workspaceName: 'Worker Workspace',
  })
  const context = await database.getContextByEmail('worker@example.test')
  const workspaceId = context.workspace.id
  const userId = context.user.id
  let clock = new Date(Date.now() + 1_000)
  const attempts = new Map()
  const delivered = []
  let releaseSlow
  let slowStarted
  const slowReady = new Promise((resolve) => { slowStarted = resolve })
  const worker = createExecutionWorker({
    database,
    workerId: 'worker-verifier',
    now: () => new Date(clock),
    retryBaseDelayMs: 1_000,
    maxJobsPerTick: 20,
    onEvent: ({ event }) => delivered.push(event.eventType),
    handlers: {
      'test.complete': async ({ input }) => ({ doubled: input.value * 2 }),
      'test.retry': async ({ job }) => {
        const count = (attempts.get(job.id) || 0) + 1
        attempts.set(job.id, count)
        if (count === 1) {
          const error = new Error('temporary provider failure')
          error.code = 'PROVIDER_UNAVAILABLE'
          error.retryable = true
          throw error
        }
        return { attempts: count }
      },
      'test.slow': async ({ signal }) => {
        slowStarted()
        await new Promise((resolve, reject) => {
          releaseSlow = resolve
          signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), {
            code: 'JOB_ABORTED',
            retryable: true,
          })), { once: true })
        })
        return { released: true }
      },
    },
  })

  const completedJob = await worker.enqueue({
    workspaceId,
    requestedBy: userId,
    kind: 'test.complete',
    input: { value: 21 },
    idempotencyKey: 'complete-once',
  })
  const duplicate = await worker.enqueue({
    workspaceId,
    requestedBy: userId,
    kind: 'test.complete',
    input: { value: 21 },
    idempotencyKey: 'complete-once',
  })
  assert.equal(duplicate.id, completedJob.id)
  await worker.runWorkspace(workspaceId)
  const completed = await database.getExecutionJob(workspaceId, completedJob.id)
  assert.equal(completed.status, 'completed')
  assert.deepEqual(completed.output, { doubled: 42 })
  assert.deepEqual(
    (await database.listExecutionJobEvents(workspaceId, completed.id)).map((event) => event.eventType),
    ['job.queued', 'job.started', 'job.completed'],
  )

  const retryJob = await worker.enqueue({
    workspaceId,
    requestedBy: userId,
    kind: 'test.retry',
    input: {},
    maxAttempts: 2,
  })
  await worker.runWorkspace(workspaceId)
  assert.equal((await database.getExecutionJob(workspaceId, retryJob.id)).status, 'queued')
  clock = new Date(clock.getTime() + 1_100)
  await worker.runWorkspace(workspaceId)
  const retried = await database.getExecutionJob(workspaceId, retryJob.id)
  assert.equal(retried.status, 'completed')
  assert.equal(retried.attemptCount, 2)
  assert((await database.listExecutionJobEvents(workspaceId, retryJob.id)).some((event) => (
    event.eventType === 'job.retry_scheduled'
  )))

  const missingHandler = await worker.enqueue({
    workspaceId,
    requestedBy: userId,
    kind: 'test.missing',
    input: {},
  })
  await worker.runWorkspace(workspaceId)
  assert.equal((await database.getExecutionJob(workspaceId, missingHandler.id)).status, 'failed')

  const slowJob = await worker.enqueue({
    workspaceId,
    requestedBy: userId,
    kind: 'test.slow',
    input: {},
  })
  const slowExecution = worker.runWorkspace(workspaceId)
  await slowReady
  const cancelled = await worker.cancel(workspaceId, slowJob.id)
  assert.equal(cancelled.status, 'cancelled')
  releaseSlow?.()
  await slowExecution
  assert.equal((await database.getExecutionJob(workspaceId, slowJob.id)).status, 'cancelled')

  const file = await database.createWorkspaceDocument({
    workspaceId,
    name: 'worker-result.txt',
    mimeType: 'text/plain',
    body: Buffer.from('durable result'),
  })
  const capabilities = createCapabilityRegistry(createRuntimeCapabilities({ database, executionWorker: worker }))
  const registered = await capabilities.invoke('artifact.register', {
    file_id: file.id,
    kind: 'report',
    metadata: { verified: true },
  }, context)
  assert.equal(registered.artifact.storageDocumentId, file.id)
  const loaded = await capabilities.invoke('artifact.get', {
    artifact_id: registered.artifact.id,
    include_content: true,
  }, context)
  assert.deepEqual(loaded.content, { encoding: 'utf8', value: 'durable result' })
  assert.equal((await capabilities.invoke('artifact.list', {}, context)).total, 1)
  assert.equal(await database.getArtifact('wsp_other', registered.artifact.id), null)

  assert(delivered.includes('job.completed'))
  assert(delivered.includes('job.cancelled'))
  await worker.stop()
  console.log('Execution workers and artifacts verified: idempotent enqueue, leases, retries, cancellation, durable events, delivery, integrity, and workspace isolation.')
} finally {
  await database?.close()
  rmSync(directory, { recursive: true, force: true })
}
