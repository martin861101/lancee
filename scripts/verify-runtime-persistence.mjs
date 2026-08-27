import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/database.mjs'

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'lancee-runtime-persistence-'))
const databasePath = join(temporaryDirectory, 'runtime.sqlite')
let database

try {
  database = await openDatabase({
    databasePath,
    adminEmail: 'runtime-admin@example.test',
    adminName: 'Runtime Admin',
    adminPasswordSalt: 'runtime-test-salt',
    adminPasswordHash: 'runtime-test-hash',
    workspaceId: 'wsp_runtime_a',
    workspaceName: 'Runtime Workspace A',
  })

  const context = await database.getContextByEmail('runtime-admin@example.test')
  assert(context, 'the seeded runtime administrator should be available')
  const workspaceId = context.workspace.id
  const userId = context.user.id
  const timestamp = new Date().toISOString()

  await database.query(
    `INSERT INTO workspaces (id, name, created_at, updated_at)
     VALUES ($1, $2, $3, $4)`,
    ['wsp_runtime_b', 'Runtime Workspace B', timestamp, timestamp],
  )
  await database.query(
    `INSERT INTO users (
       id, email, name, password_salt, password_hash, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      'usr_runtime_b',
      'runtime-b@example.test',
      'Runtime User B',
      'runtime-b-salt',
      'runtime-b-hash',
      timestamp,
      timestamp,
    ],
  )
  await database.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
     VALUES ($1, $2, 'owner', $3)`,
    ['wsp_runtime_b', 'usr_runtime_b', timestamp],
  )

  const thread = await database.createAgentThread({
    workspaceId,
    userId,
    title: 'Persisted runtime thread',
    provider: 'codex',
    externalThreadId: 'thread_external_1',
  })
  assert.equal(thread.workspaceId, workspaceId)
  assert.equal(
    (await database.createAgentThread({
      workspaceId,
      userId,
      title: 'Idempotent external thread',
      provider: 'codex',
      externalThreadId: 'thread_external_1',
    })).id,
    thread.id,
  )
  assert.equal(await database.getAgentThread('wsp_runtime_b', thread.id), null)

  const run = await database.createAgentRun({
    workspaceId,
    userId,
    threadId: thread.id,
    objective: 'Verify durable runtime persistence.',
    budget: { maxIterations: 8, maxToolCalls: 12 },
  })
  assert.equal(run.status, 'planned')
  assert.equal(await database.getAgentRun('wsp_runtime_b', run.id), null)
  assert.equal(
    (await database.updateAgentRun(workspaceId, run.id, { status: 'queued' }, ['planned'])).status,
    'queued',
  )
  assert.equal(
    (await database.updateAgentRun(workspaceId, run.id, { status: 'running' }, ['queued'])).status,
    'running',
  )
  assert.equal(
    await database.updateAgentRun(workspaceId, run.id, { status: 'running' }, ['planned']),
    null,
  )

  const runEvents = await Promise.all(
    Array.from({ length: 12 }, (_, index) => database.appendAgentRunEvent({
      workspaceId,
      runId: run.id,
      eventType: 'test.event',
      message: `event ${index + 1}`,
      data: { index, access_token: 'must-not-persist' },
    })),
  )
  assert.deepEqual(
    runEvents.map((event) => event.sequence).sort((left, right) => left - right),
    Array.from({ length: 12 }, (_, index) => index + 1),
  )
  assert.equal(runEvents[0].data.access_token, undefined)
  assert.equal((await database.listAgentRunEvents(workspaceId, run.id, { after: 10 })).length, 2)
  assert.equal((await database.listAgentRunEvents('wsp_runtime_b', run.id)).length, 0)

  const step = await database.createAgentStep({
    workspaceId,
    runId: run.id,
    toolId: 'file.write',
    arguments: { name: 'result.txt', content: 'runtime output' },
    riskLevel: 'internal-write',
  })
  const secondStep = await database.createAgentStep({
    workspaceId,
    runId: run.id,
    toolId: 'workspace.summary',
    arguments: {},
    riskLevel: 'read',
  })
  assert.deepEqual([step.sequence, secondStep.sequence], [1, 2])

  const approval = await database.requestAgentApproval({
    workspaceId,
    runId: run.id,
    stepId: step.id,
    toolId: step.toolId,
    argumentsHash: step.argumentsHash,
    riskLevel: step.riskLevel,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  })
  assert.equal(approval.status, 'pending')
  assert.equal(
    await database.decideAgentApproval({
      workspaceId: 'wsp_runtime_b',
      id: approval.id,
      decidedBy: userId,
      decision: 'approved',
    }),
    null,
  )
  const decided = await database.decideAgentApproval({
    workspaceId,
    id: approval.id,
    decidedBy: userId,
    decision: 'approved',
  })
  assert.equal(decided.status, 'approved')
  const consumed = await database.consumeAgentApproval({
    workspaceId,
    id: approval.id,
    toolId: step.toolId,
    argumentsHash: step.argumentsHash,
    actorUserId: userId,
  })
  assert.equal(consumed.status, 'consumed')
  assert.equal(
    await database.consumeAgentApproval({
      workspaceId,
      id: approval.id,
      toolId: step.toolId,
      argumentsHash: step.argumentsHash,
      actorUserId: userId,
    }),
    null,
  )

  const jobInput = { runId: run.id, task: 'persist me' }
  const job = await database.enqueueExecutionJob({
    workspaceId,
    requestedBy: userId,
    agentRunId: run.id,
    kind: 'agent.run',
    input: jobInput,
    idempotencyKey: 'runtime-job-0001',
    maxAttempts: 2,
  })
  assert.equal(
    (await database.enqueueExecutionJob({
      workspaceId,
      requestedBy: userId,
      agentRunId: run.id,
      kind: 'agent.run',
      input: { task: 'persist me', runId: run.id },
      idempotencyKey: 'runtime-job-0001',
      maxAttempts: 2,
    })).id,
    job.id,
  )
  await assert.rejects(
    database.enqueueExecutionJob({
      workspaceId,
      requestedBy: userId,
      kind: 'agent.run',
      input: { task: 'different' },
      idempotencyKey: 'runtime-job-0001',
    }),
    (error) => error.code === 'JOB_IDEMPOTENCY_CONFLICT',
  )
  assert.equal(await database.getExecutionJob('wsp_runtime_b', job.id), null)

  const claimTime = new Date().toISOString()
  const claims = await Promise.all(
    Array.from({ length: 10 }, (_, index) => database.claimExecutionJob({
      workspaceId,
      id: job.id,
      workerId: `worker-${index}`,
      now: claimTime,
      leaseSeconds: 60,
    })),
  )
  const successfulClaims = claims.filter(Boolean)
  assert.equal(successfulClaims.length, 1, 'only one worker may claim a queued job')
  const claimed = successfulClaims[0]
  const heartbeat = await database.heartbeatExecutionJob({
    workspaceId,
    id: job.id,
    workerId: claimed.leaseOwner,
    leaseSeconds: 60,
  })
  assert(heartbeat)

  const jobEvents = await Promise.all(
    Array.from({ length: 10 }, (_, index) => database.appendExecutionJobEvent({
      workspaceId,
      jobId: job.id,
      eventType: 'worker.progress',
      message: `progress ${index + 1}`,
      data: { index, password: 'must-not-persist' },
    })),
  )
  assert.deepEqual(
    jobEvents.map((event) => event.sequence).sort((left, right) => left - right),
    Array.from({ length: 10 }, (_, index) => index + 1),
  )
  assert.equal(jobEvents[0].data.password, undefined)
  const completed = await database.completeExecutionJob({
    workspaceId,
    id: job.id,
    workerId: claimed.leaseOwner,
    output: { ok: true },
  })
  assert.equal(completed.status, 'completed')
  assert.equal(
    await database.completeExecutionJob({
      workspaceId,
      id: job.id,
      workerId: claimed.leaseOwner,
      output: { ok: true },
    }),
    null,
  )

  const retryBase = Date.now() + 1_000
  const retryJob = await database.enqueueExecutionJob({
    workspaceId,
    requestedBy: userId,
    kind: 'lease.recovery',
    input: {},
    idempotencyKey: 'runtime-job-recovery',
    maxAttempts: 2,
    availableAt: new Date(retryBase).toISOString(),
  })
  const firstRetryClaim = await database.claimExecutionJob({
    workspaceId,
    id: retryJob.id,
    workerId: 'recovery-worker-1',
    now: new Date(retryBase).toISOString(),
    leaseExpiresAt: new Date(retryBase + 1_000).toISOString(),
  })
  assert(firstRetryClaim)
  const firstRecovery = await database.recoverExpiredExecutionJobs(workspaceId, {
    now: new Date(retryBase + 2_000).toISOString(),
    retryAt: new Date(retryBase + 2_000).toISOString(),
  })
  assert.equal(firstRecovery.retried.length, 1)
  const secondRetryClaim = await database.claimExecutionJob({
    workspaceId,
    id: retryJob.id,
    workerId: 'recovery-worker-2',
    now: new Date(retryBase + 3_000).toISOString(),
    leaseExpiresAt: new Date(retryBase + 4_000).toISOString(),
  })
  assert(secondRetryClaim)
  const finalRecovery = await database.recoverExpiredExecutionJobs(workspaceId, {
    now: new Date(retryBase + 5_000).toISOString(),
  })
  assert.equal(finalRecovery.failed.length, 1)
  assert.equal((await database.getExecutionJob(workspaceId, retryJob.id)).status, 'failed')

  const artifact = await database.createArtifact({
    workspaceId,
    createdBy: userId,
    runId: run.id,
    kind: 'text',
    mimeType: 'text/plain',
    name: 'runtime-result.txt',
    body: Buffer.from('durable artifact', 'utf8'),
    source: 'runtime-verifier',
    metadata: { purpose: 'verification' },
  })
  assert.equal(artifact.size, Buffer.byteLength('durable artifact'))
  const artifactContent = await database.getArtifactContent(workspaceId, artifact.id)
  assert.equal(artifactContent.body.toString('utf8'), 'durable artifact')
  assert.equal(await database.getArtifact('wsp_runtime_b', artifact.id), null)
  await database.linkArtifact({
    workspaceId,
    artifactId: artifact.id,
    subjectType: 'agent_run',
    subjectId: run.id,
    relation: 'output',
  })
  assert.equal(
    (await database.listArtifacts(workspaceId, {
      subjectType: 'agent_run',
      subjectId: run.id,
    })).length,
    1,
  )
  await assert.rejects(
    database.linkArtifact({
      workspaceId,
      artifactId: artifact.id,
      subjectType: 'agent_run',
      subjectId: 'arun_other_workspace',
    }),
    (error) => error.code === 'ARTIFACT_SUBJECT_NOT_FOUND',
  )
  await database.query(
    `UPDATE workspace_documents SET content_base64 = $1
     WHERE workspace_id = $2 AND id = $3`,
    [Buffer.from('tampered', 'utf8').toString('base64'), workspaceId, artifact.storageDocumentId],
  )
  await assert.rejects(
    database.getArtifactContent(workspaceId, artifact.id),
    (error) => error.code === 'ARTIFACT_INTEGRITY_ERROR',
  )
  assert((await database.deleteArtifact(workspaceId, artifact.id)).deletedAt)
  assert.equal(await database.getArtifact(workspaceId, artifact.id), null)
  assert.equal(
    (await database.getArtifact(workspaceId, artifact.id, { includeDeleted: true })).id,
    artifact.id,
  )

  await database.close()
  database = null
  const originalDirectory = process.cwd()
  process.chdir(temporaryDirectory)
  try {
    database = await openDatabase({
      adminEmail: 'runtime-memory@example.test',
      adminName: 'Runtime Memory Admin',
      adminPasswordSalt: 'runtime-memory-salt',
      adminPasswordHash: 'runtime-memory-hash',
      workspaceId: 'wsp_runtime_memory',
      workspaceName: 'Runtime Memory Workspace',
    })
    const memoryContext = await database.getContextByEmail('runtime-memory@example.test')
    const memoryThread = await database.createAgentThread({
      workspaceId: memoryContext.workspace.id,
      userId: memoryContext.user.id,
      title: 'In-memory portability',
    })
    const memoryRun = await database.createAgentRun({
      workspaceId: memoryContext.workspace.id,
      userId: memoryContext.user.id,
      threadId: memoryThread.id,
      objective: 'Verify the pg-mem query path.',
    })
    const memoryJob = await database.enqueueExecutionJob({
      workspaceId: memoryContext.workspace.id,
      requestedBy: memoryContext.user.id,
      agentRunId: memoryRun.id,
      kind: 'portability.smoke',
      input: { adapter: 'pg-mem' },
      idempotencyKey: 'runtime-memory-job',
    })
    assert(await database.claimExecutionJob({
      workspaceId: memoryContext.workspace.id,
      id: memoryJob.id,
      workerId: 'memory-worker',
      leaseSeconds: 30,
    }))
    assert(await database.appendExecutionJobEvent({
      workspaceId: memoryContext.workspace.id,
      jobId: memoryJob.id,
      eventType: 'portability.checked',
    }))
  } finally {
    await database?.close()
    database = null
    process.chdir(originalDirectory)
  }

  console.log('Runtime persistence verification passed.')
} finally {
  await database?.close()
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
