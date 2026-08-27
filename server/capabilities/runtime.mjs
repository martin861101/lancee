import { LanceeCapabilityError, textInput } from './registry.mjs'

function publicArtifact(artifact) {
  if (!artifact) return null
  const { storageKey: _storageKey, ...safe } = artifact
  return safe
}

export function createRuntimeCapabilities({ database, executionWorker } = {}) {
  if (!database?.getArtifact || !database?.getExecutionJob) {
    throw new TypeError('Runtime capabilities require the Lancee persistence adapter.')
  }
  return [
    {
      id: 'artifact.list',
      namespace: 'artifact',
      version: '1.0.0',
      description: 'List bounded artifact metadata within the authorized workspace.',
      provider: 'lancee.artifacts',
      inputSchema: {
        type: 'object',
        properties: {
          run_id: { type: 'string', maxLength: 100 },
          kind: { type: 'string', maxLength: 120 },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
        additionalProperties: false,
      },
      outputSchema: { type: 'object', required: ['artifacts', 'total'] },
      requiredPermissions: ['files:read'],
      riskLevel: 'read',
      requiresApproval: false,
      timeoutMs: 10_000,
      concurrencyLimit: 8,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['artifact', 'list', 'workspace'],
      async execute({ input, context }) {
        const artifacts = await database.listArtifacts(context.workspace.id, {
          runId: textInput(input, 'run_id', { maxLength: 100 }) || null,
          kind: textInput(input, 'kind', { maxLength: 120 }) || null,
          limit: Number.isInteger(input.limit) ? input.limit : 50,
        })
        return { artifacts: artifacts.map(publicArtifact), total: artifacts.length }
      },
    },
    {
      id: 'artifact.get',
      namespace: 'artifact',
      version: '1.0.0',
      description: 'Get workspace artifact metadata, durable links, and optionally bounded inline content.',
      provider: 'lancee.artifacts',
      inputSchema: {
        type: 'object',
        properties: {
          artifact_id: { type: 'string', minLength: 1, maxLength: 100 },
          include_content: { type: 'boolean' },
        },
        required: ['artifact_id'],
        additionalProperties: false,
      },
      outputSchema: { type: 'object', required: ['artifact', 'links'] },
      requiredPermissions: ['files:read'],
      riskLevel: 'read',
      requiresApproval: false,
      timeoutMs: 10_000,
      concurrencyLimit: 8,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['artifact', 'get', 'workspace'],
      async execute({ input, context }) {
        const id = textInput(input, 'artifact_id', { required: true, maxLength: 100 })
        const artifact = input.include_content
          ? await database.getArtifactContent(context.workspace.id, id)
          : await database.getArtifact(context.workspace.id, id)
        if (!artifact) throw new LanceeCapabilityError('NOT_FOUND', 'The workspace artifact was not found.', 404)
        const links = await database.listArtifactLinks(context.workspace.id, { artifactId: id })
        let content = null
        if (input.include_content && artifact.body) {
          if (artifact.body.byteLength > 1_000_000) {
            throw new LanceeCapabilityError('BODY_TOO_LARGE', 'Inline artifact reads are limited to 1 MB.', 413)
          }
          content = artifact.mimeType.startsWith('text/') || artifact.mimeType === 'application/json'
            ? { encoding: 'utf8', value: artifact.body.toString('utf8') }
            : { encoding: 'base64', value: artifact.body.toString('base64') }
        }
        const { body: _body, ...metadata } = artifact
        return { artifact: publicArtifact(metadata), links, content }
      },
    },
    {
      id: 'artifact.register',
      namespace: 'artifact',
      version: '1.0.0',
      description: 'Register an existing workspace file as a durable, workspace-scoped artifact.',
      provider: 'lancee.artifacts',
      inputSchema: {
        type: 'object',
        properties: {
          file_id: { type: 'string', minLength: 1, maxLength: 100 },
          kind: { type: 'string', minLength: 1, maxLength: 120 },
          name: { type: 'string', maxLength: 240 },
          metadata: { type: 'object', maxProperties: 30 },
        },
        required: ['file_id'],
        additionalProperties: false,
      },
      outputSchema: { type: 'object', required: ['artifact'] },
      requiredPermissions: ['files:write'],
      riskLevel: 'internal-write',
      requiresApproval: true,
      timeoutMs: 10_000,
      concurrencyLimit: 4,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['artifact', 'register', 'workspace'],
      async execute({ input, context, invocation }) {
        const file = await database.getWorkspaceDocument(
          context.workspace.id,
          textInput(input, 'file_id', { required: true, maxLength: 100 }),
        )
        if (!file) throw new LanceeCapabilityError('NOT_FOUND', 'The workspace file was not found.', 404)
        const artifact = await database.createArtifact({
          workspaceId: context.workspace.id,
          createdBy: context.user.id,
          runId: invocation.runId || null,
          kind: textInput(input, 'kind', { maxLength: 120 }) || 'file',
          mimeType: file.mimeType,
          name: textInput(input, 'name', { maxLength: 240 }) || file.name,
          storageDocumentId: file.id,
          size: file.size,
          contentSha256: file.sha256,
          source: 'artifact.register',
          metadata: input.metadata || {},
        })
        return { artifact: publicArtifact(artifact), artifacts: [publicArtifact(artifact)] }
      },
    },
    {
      id: 'job.get',
      namespace: 'job',
      version: '1.0.0',
      description: 'Get one durable execution job and its bounded event stream in the authorized workspace.',
      provider: 'lancee.jobs',
      inputSchema: {
        type: 'object',
        properties: { job_id: { type: 'string', minLength: 1, maxLength: 100 } },
        required: ['job_id'],
        additionalProperties: false,
      },
      outputSchema: { type: 'object', required: ['job', 'events'] },
      requiredPermissions: ['jobs:read'],
      riskLevel: 'read',
      requiresApproval: false,
      timeoutMs: 10_000,
      concurrencyLimit: 8,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['job', 'status', 'events'],
      async execute({ input, context }) {
        const id = textInput(input, 'job_id', { required: true, maxLength: 100 })
        const job = await database.getExecutionJob(context.workspace.id, id)
        if (!job) throw new LanceeCapabilityError('NOT_FOUND', 'The execution job was not found.', 404)
        return { job, events: await database.listExecutionJobEvents(context.workspace.id, id, { limit: 200 }) }
      },
    },
    {
      id: 'job.list',
      namespace: 'job',
      version: '1.0.0',
      description: 'List bounded durable execution jobs in the authorized workspace.',
      provider: 'lancee.jobs',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'cancelled'] },
          kind: { type: 'string', maxLength: 120 },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
        additionalProperties: false,
      },
      outputSchema: { type: 'object', required: ['jobs', 'total'] },
      requiredPermissions: ['jobs:read'],
      riskLevel: 'read',
      requiresApproval: false,
      timeoutMs: 10_000,
      concurrencyLimit: 8,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['job', 'list', 'workspace'],
      async execute({ input, context }) {
        const jobs = await database.listExecutionJobs(context.workspace.id, {
          status: input.status || null,
          kind: textInput(input, 'kind', { maxLength: 120 }) || null,
          limit: Number.isInteger(input.limit) ? input.limit : 50,
        })
        return { jobs, total: jobs.length }
      },
    },
    {
      id: 'job.cancel',
      namespace: 'job',
      version: '1.0.0',
      description: 'Cancel a queued or running durable execution job in the authorized workspace.',
      provider: 'lancee.jobs',
      inputSchema: {
        type: 'object',
        properties: { job_id: { type: 'string', minLength: 1, maxLength: 100 } },
        required: ['job_id'],
        additionalProperties: false,
      },
      outputSchema: { type: 'object', required: ['job'] },
      requiredPermissions: ['jobs:cancel'],
      riskLevel: 'internal-write',
      requiresApproval: true,
      timeoutMs: 10_000,
      concurrencyLimit: 4,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['job', 'cancel', 'workspace'],
      async execute({ input, context }) {
        const id = textInput(input, 'job_id', { required: true, maxLength: 100 })
        const job = executionWorker
          ? await executionWorker.cancel(context.workspace.id, id)
          : await database.cancelExecutionJob(context.workspace.id, id)
        if (!job) throw new LanceeCapabilityError('NOT_FOUND', 'A cancellable execution job was not found.', 404)
        return { job }
      },
    },
    {
      id: 'approval.list',
      namespace: 'approval',
      version: '1.0.0',
      description: 'List bounded agent approvals for the authorized workspace.',
      provider: 'lancee.approvals',
      inputSchema: {
        type: 'object',
        properties: {
          run_id: { type: 'string', maxLength: 100 },
          status: { type: 'string', enum: ['pending', 'approved', 'denied', 'expired', 'consumed'] },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
        additionalProperties: false,
      },
      outputSchema: { type: 'object', required: ['approvals', 'total'] },
      requiredPermissions: ['approvals:read'],
      riskLevel: 'read',
      requiresApproval: false,
      timeoutMs: 10_000,
      concurrencyLimit: 8,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['approval', 'list', 'agent'],
      async execute({ input, context }) {
        await database.expireAgentApprovals(context.workspace.id)
        const approvals = await database.listAgentApprovals(context.workspace.id, {
          runId: textInput(input, 'run_id', { maxLength: 100 }) || null,
          status: input.status || null,
          limit: Number.isInteger(input.limit) ? input.limit : 50,
          userId: context.user.id,
        })
        return { approvals, total: approvals.length }
      },
    },
    {
      id: 'approval.get',
      namespace: 'approval',
      version: '1.0.0',
      description: 'Get one agent approval in the authorized workspace.',
      provider: 'lancee.approvals',
      inputSchema: {
        type: 'object',
        properties: { approval_id: { type: 'string', minLength: 1, maxLength: 100 } },
        required: ['approval_id'],
        additionalProperties: false,
      },
      outputSchema: { type: 'object', required: ['approval'] },
      requiredPermissions: ['approvals:read'],
      riskLevel: 'read',
      requiresApproval: false,
      timeoutMs: 10_000,
      concurrencyLimit: 8,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['approval', 'get', 'agent'],
      async execute({ input, context }) {
        await database.expireAgentApprovals(context.workspace.id)
        const approval = await database.getAgentApproval(
          context.workspace.id,
          textInput(input, 'approval_id', { required: true, maxLength: 100 }),
          context.user.id,
        )
        if (!approval) throw new LanceeCapabilityError('NOT_FOUND', 'The agent approval was not found.', 404)
        return { approval }
      },
    },
    {
      id: 'approval.decide',
      namespace: 'approval',
      version: '1.0.0',
      description: 'Approve or deny one pending, expiring agent action as the authenticated user.',
      provider: 'lancee.approvals',
      inputSchema: {
        type: 'object',
        properties: {
          approval_id: { type: 'string', minLength: 1, maxLength: 100 },
          decision: { type: 'string', enum: ['approved', 'denied'] },
          reason: { type: 'string', maxLength: 1000 },
        },
        required: ['approval_id', 'decision'],
        additionalProperties: false,
      },
      outputSchema: { type: 'object', required: ['approval'] },
      requiredPermissions: ['approvals:decide'],
      riskLevel: 'internal-write',
      requiresApproval: false,
      timeoutMs: 10_000,
      concurrencyLimit: 4,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['approval', 'decision', 'agent'],
      async execute({ input, context }) {
        const approval = await database.decideAgentApproval({
          workspaceId: context.workspace.id,
          id: textInput(input, 'approval_id', { required: true, maxLength: 100 }),
          decidedBy: context.user.id,
          decision: input.decision,
          reason: textInput(input, 'reason', { maxLength: 1_000 }),
        })
        if (!approval) throw new LanceeCapabilityError('CONFLICT', 'The approval is unavailable, expired, or already decided.', 409)
        return { approval }
      },
    },
  ]
}
