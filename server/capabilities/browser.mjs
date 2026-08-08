import { LanceeCapabilityError, textInput } from './registry.mjs'

function browserOptions(input) {
  return {
    width: Number.isInteger(input.width) ? input.width : 1440,
    height: Number.isInteger(input.height) ? input.height : 900,
    timeoutMs: Number.isInteger(input.timeout_ms) ? input.timeout_ms : 20_000,
  }
}

export function createBrowserCapabilities({ database, browserWorker }) {
  const available = () => Boolean(browserWorker)
  const commonInput = {
    url: { type: 'string', minLength: 1, maxLength: 2048, format: 'uri' },
    width: { type: 'integer', minimum: 320, maximum: 1920 },
    height: { type: 'integer', minimum: 240, maximum: 1080 },
    timeout_ms: { type: 'integer', minimum: 1_000, maximum: 30_000 },
  }
  return [
    {
      id: 'browser.read',
      namespace: 'browser',
      version: '1.0.0',
      description: 'Render one public page in an isolated, read-only browser and return bounded visible text and links.',
      provider: 'lancee.browser.playwright',
      inputSchema: { type: 'object', properties: commonInput, required: ['url'], additionalProperties: false },
      outputSchema: { type: 'object', required: ['url', 'title', 'text', 'links'] },
      requiredPermissions: ['browser:read'],
      riskLevel: 'read',
      requiresApproval: false,
      timeoutMs: 35_000,
      concurrencyLimit: 2,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['browser', 'read', 'render'],
      isAvailable: available,
      async execute({ input }) {
        return browserWorker.read(textInput(input, 'url', { required: true, maxLength: 2048 }), browserOptions(input))
      },
    },
    {
      id: 'browser.snapshot',
      namespace: 'browser',
      version: '1.0.0',
      description: 'Return a bounded semantic accessibility snapshot of one isolated public page.',
      provider: 'lancee.browser.playwright',
      inputSchema: { type: 'object', properties: commonInput, required: ['url'], additionalProperties: false },
      outputSchema: { type: 'object', required: ['url', 'title', 'snapshot'] },
      requiredPermissions: ['browser:read'],
      riskLevel: 'read',
      requiresApproval: false,
      timeoutMs: 35_000,
      concurrencyLimit: 2,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['browser', 'snapshot', 'accessibility'],
      isAvailable: available,
      async execute({ input }) {
        return browserWorker.snapshot(textInput(input, 'url', { required: true, maxLength: 2048 }), browserOptions(input))
      },
    },
    {
      id: 'browser.screenshot',
      namespace: 'browser',
      version: '1.0.0',
      description: 'Capture the bounded viewport of one isolated public page and register it as a workspace artifact.',
      provider: 'lancee.browser.playwright',
      inputSchema: {
        type: 'object',
        properties: {
          ...commonInput,
          name: { type: 'string', minLength: 1, maxLength: 240 },
          format: { type: 'string', enum: ['png', 'jpeg'] },
        },
        required: ['url', 'name'],
        additionalProperties: false,
      },
      outputSchema: { type: 'object', required: ['file', 'artifact'] },
      requiredPermissions: ['browser:read', 'files:write'],
      riskLevel: 'internal-write',
      requiresApproval: true,
      timeoutMs: 35_000,
      concurrencyLimit: 1,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['browser', 'screenshot', 'artifact'],
      isAvailable: () => available() && Boolean(database?.createWorkspaceDocument),
      async execute({ input, context, invocation }) {
        const format = input.format === 'jpeg' ? 'jpeg' : 'png'
        const rawName = textInput(input, 'name', { required: true, maxLength: 240 })
        if (rawName.includes('/') || rawName.includes('\\') || rawName.includes('\0')) {
          throw new LanceeCapabilityError('INVALID_ARGUMENTS', 'The screenshot name cannot contain path separators.')
        }
        const suffix = format === 'jpeg' ? '.jpg' : '.png'
        const name = rawName.toLowerCase().endsWith(suffix) ? rawName : `${rawName}${suffix}`
        const screenshot = await browserWorker.screenshot(
          textInput(input, 'url', { required: true, maxLength: 2048 }),
          { ...browserOptions(input), format },
        )
        const file = await database.createWorkspaceDocument({
          workspaceId: context.workspace.id,
          name,
          mimeType: screenshot.mimeType,
          body: screenshot.body,
        })
        const artifact = typeof database.createArtifact === 'function'
          ? await database.createArtifact({
              workspaceId: context.workspace.id,
              createdBy: context.user.id,
              runId: invocation.runId || null,
              kind: 'screenshot',
              mimeType: screenshot.mimeType,
              name,
              storageDocumentId: file.id,
              size: file.size,
              sha256: file.sha256,
              source: 'browser.screenshot',
              metadata: { url: screenshot.url, width: input.width || 1440, height: input.height || 900 },
            })
          : null
        return { file, artifact, artifacts: artifact ? [artifact] : [] }
      },
    },
  ]
}
