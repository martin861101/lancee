import mammoth from 'mammoth'
import { LanceeCapabilityError, textInput } from './registry.mjs'

const MAX_FILE_CONTENT_LENGTH = 512_000

export function createFileCapabilities({ database }) {
  if (!database || typeof database.createWorkspaceDocument !== 'function') {
    throw new TypeError('The file capability requires the Lancee database adapter.')
  }
  return [{
    id: 'file.write',
    namespace: 'file',
    version: '1.0.0',
    description: 'Write a bounded text, Markdown, or JSON file into the workspace Files library.',
    provider: 'lancee.files',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 240 },
        content: { type: 'string', maxLength: MAX_FILE_CONTENT_LENGTH },
        mime_type: { type: 'string', enum: ['text/plain', 'text/markdown', 'application/json'] },
      },
      required: ['name', 'content'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object', required: ['file'], properties: { file: { type: 'object' } } },
    requiredPermissions: ['files:write'],
    riskLevel: 'internal-write',
    requiresApproval: true,
    timeoutMs: 10_000,
    supportsAsync: false,
    tags: ['file', 'artifact', 'workspace'],
    async execute({ input, context, invocation }) {
      const name = textInput(input, 'name', { required: true, maxLength: 240 })
      const content = String(input.content ?? '')
      const mimeType = textInput(input, 'mime_type', { maxLength: 80 }) || (name.toLowerCase().endsWith('.md') ? 'text/markdown' : 'text/plain')
      if (name.includes('/') || name.includes('\\') || name.includes('\0')) {
        throw new LanceeCapabilityError('INVALID_ARGUMENTS', 'The file name cannot contain path separators or null characters.')
      }
      if (!['text/plain', 'text/markdown', 'application/json'].includes(mimeType)) {
        throw new LanceeCapabilityError('INVALID_ARGUMENTS', 'Create a text, Markdown, or JSON file.')
      }
      const body = Buffer.from(content, 'utf8')
      if (body.byteLength > MAX_FILE_CONTENT_LENGTH) {
        throw new LanceeCapabilityError('BODY_TOO_LARGE', 'The file content exceeds 512 KB.', 413)
      }
      if (mimeType === 'application/json') {
        try {
          JSON.parse(content)
        } catch {
          throw new LanceeCapabilityError('INVALID_ARGUMENTS', 'JSON file content must be valid JSON.')
        }
      }
      const file = await database.createWorkspaceDocument({
        workspaceId: context.workspace.id,
        name,
        mimeType,
        body,
      })
      const artifact = typeof database.createArtifact === 'function'
        ? await database.createArtifact({
            workspaceId: context.workspace.id,
            createdBy: context.user.id,
            runId: invocation.runId || null,
            kind: 'file',
            mimeType,
            name,
            storageDocumentId: file.id,
            size: file.size,
            sha256: file.sha256,
            source: 'file.write',
            metadata: {},
          })
        : null
      return { file, artifact, artifacts: artifact ? [artifact] : [] }
    },
  }, {
    id: 'file.read',
    namespace: 'file',
    version: '1.0.0',
    description: 'Read bounded text from a workspace-owned text, Markdown, JSON, or DOCX document by ID.',
    provider: 'lancee.files',
    inputSchema: {
      type: 'object',
      properties: {
        file_id: { type: 'string', minLength: 1, maxLength: 100 },
        max_chars: { type: 'integer', minimum: 1_000, maximum: 200_000 },
      },
      required: ['file_id'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object', required: ['file', 'content', 'truncated'] },
    requiredPermissions: ['files:read'],
    riskLevel: 'read',
    requiresApproval: false,
    timeoutMs: 15_000,
    concurrencyLimit: 4,
    estimatedCost: 0,
    supportsAsync: false,
    tags: ['file', 'read', 'workspace'],
    async execute({ input, context }) {
      const file = await database.getWorkspaceDocument(
        context.workspace.id,
        textInput(input, 'file_id', { required: true, maxLength: 100 }),
      )
      if (!file) throw new LanceeCapabilityError('NOT_FOUND', 'The workspace file was not found.', 404)
      const maximum = Number.isInteger(input.max_chars) ? input.max_chars : 100_000
      let content
      if (['text/plain', 'text/markdown', 'application/json', 'text/html'].includes(file.mimeType)) {
        content = file.body.toString('utf8')
      } else if (file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        try {
          content = (await mammoth.extractRawText({ buffer: file.body })).value
        } catch {
          throw new LanceeCapabilityError('INVALID_MEDIA', 'The DOCX document could not be read.', 422)
        }
      } else {
        throw new LanceeCapabilityError('UNSUPPORTED_MEDIA_TYPE', 'This file type does not have a safe text reader.', 415)
      }
      return {
        file: {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
          sha256: file.sha256,
        },
        content: content.slice(0, maximum),
        truncated: content.length > maximum,
      }
    },
  }, {
    id: 'file.search',
    namespace: 'file',
    version: '1.0.0',
    description: 'Search workspace file metadata by name or MIME type without exposing file paths.',
    provider: 'lancee.files',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', maxLength: 200 },
        mime_type: { type: 'string', maxLength: 120 },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
    outputSchema: { type: 'object', required: ['files', 'total'] },
    requiredPermissions: ['files:read'],
    riskLevel: 'read',
    requiresApproval: false,
    timeoutMs: 10_000,
    concurrencyLimit: 8,
    estimatedCost: 0,
    supportsAsync: false,
    tags: ['file', 'search', 'workspace'],
    async execute({ input, context }) {
      const query = textInput(input, 'query', { maxLength: 200 }).toLowerCase()
      const mimeType = textInput(input, 'mime_type', { maxLength: 120 }).toLowerCase()
      const limit = Number.isInteger(input.limit) ? input.limit : 50
      const matches = (await database.listWorkspaceDocuments(context.workspace.id)).filter((file) => (
        (!query || `${file.name} ${file.mimeType}`.toLowerCase().includes(query)) &&
        (!mimeType || file.mimeType.toLowerCase() === mimeType)
      ))
      return { files: matches.slice(0, limit), total: matches.length }
    },
  }, {
    id: 'file.metadata',
    namespace: 'file',
    version: '1.0.0',
    description: 'Read metadata for one workspace-owned file by ID.',
    provider: 'lancee.files',
    inputSchema: {
      type: 'object',
      properties: { file_id: { type: 'string', minLength: 1, maxLength: 100 } },
      required: ['file_id'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object', required: ['file'] },
    requiredPermissions: ['files:read'],
    riskLevel: 'read',
    requiresApproval: false,
    timeoutMs: 10_000,
    concurrencyLimit: 8,
    estimatedCost: 0,
    supportsAsync: false,
    tags: ['file', 'metadata', 'workspace'],
    async execute({ input, context }) {
      const file = await database.getWorkspaceDocument(
        context.workspace.id,
        textInput(input, 'file_id', { required: true, maxLength: 100 }),
      )
      if (!file) throw new LanceeCapabilityError('NOT_FOUND', 'The workspace file was not found.', 404)
      const { body: _body, ...metadata } = file
      return { file: metadata }
    },
  }]
}
