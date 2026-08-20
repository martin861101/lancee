import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import {
  createLanceeCapabilityRegistry,
  LanceeCapabilityError,
  lanceeMcpCapabilityBindings,
} from '../server/capabilities/index.mjs'
import { createCapabilityRegistry } from '../server/capabilities/registry.mjs'
import { isPrivateNetworkAddress, validatePublicUrl } from '../server/capabilities/network.mjs'
import { openDatabase } from '../server/database.mjs'
import { createLanceeMcpRuntime, LanceeMcpError } from '../server/lancee-mcp.mjs'

const directory = mkdtempSync(join(tmpdir(), 'lancee-capabilities-'))
let database

const searchHtml = `
  <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fresearch">Example &amp; Research</a>
  <a class="result__snippet">A bounded search result.</a>
`
const pageHtml = `<!doctype html><html><head><title>Example page</title><meta name="description" content="Safe description"></head>
  <body><h1>Research</h1><p>Contact hello@example.com or +27 11 555 1234.</p>
  <a href="https://example.com/second">Second page</a><script>ignore me</script></body></html>`
const requests = []
async function requestImpl(target, options = {}) {
  const url = String(target)
  requests.push({ url, options })
  if (Array.isArray(options.protocols) && !options.protocols.includes(new URL(url).protocol)) {
    throw new LanceeCapabilityError('HTTPS_REQUIRED', 'Only configured public URL protocols are allowed.')
  }
  if (url === 'https://search.example.test/') {
    return { url, status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from(searchHtml) }
  }
  if (url === 'https://example.com/robots.txt') {
    return { url, status: 200, headers: { 'content-type': 'text/plain' }, body: Buffer.from('User-agent: *\nDisallow: /blocked') }
  }
  if (url === 'https://example.com/' || url === 'https://example.com') {
    return { url: 'https://example.com/', status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from(pageHtml) }
  }
  if (url === 'https://example.com/second') {
    return { url, status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<title>Second</title><p>Second bounded page.</p>') }
  }
  if (url === 'https://api.example.test/data') {
    return { url, status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from('{"ok":true}') }
  }
  throw Object.assign(new Error(`Unexpected test URL: ${url}`), { code: 'UNAVAILABLE', retryable: true })
}

const browserWorker = {
  async read(url) { return { url, title: 'Rendered', text: 'Rendered text', links: [], requestCount: 1, bytes: 100 } },
  async snapshot(url) { return { url, title: 'Rendered', snapshot: '- document "Rendered"', requestCount: 1, bytes: 100 } },
  async screenshot(url) { return { url, body: await sharp({ create: { width: 2, height: 2, channels: 4, background: '#336699' } }).png().toBuffer(), mimeType: 'image/png', requestCount: 1, bytes: 100 } },
  async pdf(url) { return { url, body: Buffer.from('%PDF-1.4'), mimeType: 'application/pdf', requestCount: 1, bytes: 100 } },
}

const timeoutCapability = {
  id: 'test.timeout',
  namespace: 'test',
  version: '1.0.0',
  description: 'Verify bounded execution timeout.',
  provider: 'test',
  inputSchema: { type: 'object', additionalProperties: false },
  outputSchema: { type: 'object' },
  requiredPermissions: [],
  riskLevel: 'read',
  requiresApproval: false,
  timeoutMs: 5,
  supportsAsync: false,
  tags: ['test'],
  async execute() { return await new Promise(() => {}) },
}

const disabledCapability = {
  id: 'test.disabled',
  namespace: 'test',
  version: '1.0.0',
  description: 'Verify disabled provider handling.',
  provider: 'test',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  requiredPermissions: [],
  riskLevel: 'read',
  requiresApproval: false,
  timeoutMs: 100,
  enabled: false,
  supportsAsync: false,
  tags: ['test'],
  async execute() { return {} },
}

try {
  database = await openDatabase({
    databasePath: join(directory, 'capabilities.sqlite'),
    adminEmail: 'capabilities@example.test',
    adminName: 'Capability Test',
    adminPasswordSalt: 'capability-salt',
    adminPasswordHash: 'capability-hash',
    workspaceId: 'wsp_capability',
    workspaceName: 'Capability Workspace',
  })
  const context = await database.getContextByEmail('capabilities@example.test')
  const fixedNow = () => new Date('2026-08-08T12:00:00.000Z')
  const dnsLookup = async () => [{ address: '93.184.216.34', family: 4 }]
  const capabilities = createLanceeCapabilityRegistry({
    database,
    requestImpl,
    dnsLookup,
    browserWorker,
    env: { NODE_ENV: 'test', LANCEE_WEB_SEARCH_URL: 'https://search.example.test/' },
    now: fixedNow,
    renderPdf: ({ title, content }) => Buffer.from(`PDF:${title}\n${content}`),
    additionalCapabilities: [timeoutCapability, disabledCapability],
  })

  const contracts = capabilities.list()
  assert.equal(contracts.length, 30)
  assert.equal(contracts.some(({ id }) => id === 'web.access'), true)
  assert.equal(contracts.some(({ id }) => id === 'document.merge'), true)
  assert.equal(contracts.some(({ id }) => id === 'browser.screenshot'), true)
  assert.equal(contracts.some(({ id }) => id === 'browser.pdf'), true)
  assert.equal(contracts.some(({ id }) => id === 'browser.research'), true)
  assert.equal(contracts.some(({ id }) => id === 'artifact.get'), true)
  assert.equal(contracts.some(({ id }) => id === 'job.get'), true)
  for (const contract of contracts) {
    assert.match(contract.version, /^\d+\.\d+\.\d+$/)
    assert(contract.inputSchema && contract.outputSchema)
    assert(Object.isFrozen(contract))
    assert(Object.isFrozen(contract.inputSchema))
    assert.equal('execute' in contract, false)
  }
  assert(capabilities.search('website screenshot report', { limit: 10 }).some(({ id }) => id === 'browser.screenshot'))

  const search = await capabilities.invoke('web.search', { query: 'Lancee research', limit: 1 }, context)
  assert.equal(search.results[0].url, 'https://example.com/research')
  const accessed = await capabilities.invoke('web.access', { url: 'https://example.com/' }, context)
  assert.equal(accessed.title, 'Example page')
  assert(!accessed.text.includes('ignore me'))
  const extracted = await capabilities.invoke('web.extract', {
    url: 'https://example.com/',
    fields: ['title', 'headings', 'emails', 'phones'],
  }, context)
  assert.deepEqual(extracted.data.emails, ['hello@example.com'])
  const crawled = await capabilities.invoke('web.crawl', { start_url: 'https://example.com/', max_pages: 2 }, context)
  assert.equal(crawled.pages.length, 2)

  const textFile = await capabilities.invoke('file.write', { name: 'notes.md', content: '# Notes' }, context)
  assert(textFile.artifact.id)
  assert.equal((await capabilities.invoke('file.read', { file_id: textFile.file.id }, context)).content, '# Notes')
  assert.equal((await capabilities.invoke('file.search', { query: 'notes' }, context)).total, 1)
  assert.equal((await capabilities.invoke('file.metadata', { file_id: textFile.file.id }, context)).file.name, 'notes.md')

  const pdf = await capabilities.invoke('pdf.create', { name: 'report', title: 'Report', content: 'Approved content' }, context)
  assert.equal(pdf.file.name, 'report.pdf')
  const document = await capabilities.invoke('document.create', {
    name: 'brief', title: 'Brief', format: 'html', content: '**Verified**',
  }, context)
  assert.equal(document.file.mimeType, 'text/html')

  const external = await capabilities.invoke('integration.http.request', { url: 'https://api.example.test/data' }, context)
  assert.deepEqual(external.data, { ok: true })
  assert.equal(requests.at(-1).options.maximumRedirects, 0)
  assert.equal((await capabilities.invoke('browser.read', { url: 'https://example.com/' }, context)).title, 'Rendered')
  const screenshot = await capabilities.invoke('browser.screenshot', {
    url: 'https://example.com/', name: 'example',
  }, context)
  assert.equal(screenshot.file.mimeType, 'image/png')
  const browserPdf = await capabilities.invoke('browser.pdf', { url: 'https://example.com/', name: 'rendered' }, context)
  assert.equal(browserPdf.file.mimeType, 'application/pdf')
  const research = await capabilities.invoke('browser.research', { query: 'Lancee research', limit: 1 }, context)
  assert.equal(research.pages.length, 1)

  const imageBody = await sharp({ create: { width: 3, height: 2, channels: 4, background: '#FF0000' } }).png().toBuffer()
  const imageFile = await database.createWorkspaceDocument({
    workspaceId: context.workspace.id,
    name: 'red.png',
    mimeType: 'image/png',
    body: imageBody,
  })
  assert.equal((await capabilities.invoke('visual.inspect', { file_id: imageFile.id }, context)).width, 3)
  assert.equal((await capabilities.invoke('visual.extract-palette', { file_id: imageFile.id }, context)).palette[0].color, '#FF0000')

  const artifacts = await capabilities.invoke('artifact.list', {}, context)
  assert(artifacts.total >= 3)
  const artifact = await capabilities.invoke('artifact.get', { artifact_id: textFile.artifact.id, include_content: true }, context)
  assert.equal(artifact.content.value, '# Notes')
  assert.equal((await capabilities.invoke('job.list', {}, context)).total, 0)
  assert.equal((await capabilities.invoke('approval.list', {}, context)).total, 0)

  await assert.rejects(
    capabilities.invoke('web.search', { query: 'valid query', unsupported: true }, context),
    (error) => error instanceof LanceeCapabilityError && error.code === 'INVALID_ARGUMENTS',
  )
  await assert.rejects(
    capabilities.invoke('file.write', { name: 'denied.txt', content: 'x' }, { ...context, permissions: [] }),
    (error) => error.code === 'PERMISSION_DENIED',
  )
  await assert.rejects(
    capabilities.invoke('file.write', { name: 'approval.txt', content: 'x' }, context, { autonomous: true }),
    (error) => error.code === 'APPROVAL_REQUIRED',
  )
  await assert.rejects(
    capabilities.invoke('file.write', { name: 'viewer.txt', content: 'x' }, { ...context, membership: { role: 'viewer' } }),
    (error) => error.code === 'PERMISSION_DENIED',
  )
  await assert.rejects(capabilities.invoke('test.timeout', {}, context), (error) => error.code === 'TIMEOUT')
  const disabled = await capabilities.invokeNormalized('test.disabled', {}, context)
  assert.equal(disabled.success, false)
  assert.equal(disabled.error.code, 'UNAVAILABLE')
  const normalized = await capabilities.invokeNormalized('web.search', { query: 'normalized result' }, context)
  assert.equal(normalized.success, true)
  assert.equal(normalized.metadata.tool, 'web.search')
  assert(normalized.metadata.request_id)

  assert.equal(isPrivateNetworkAddress('::ffff:7f00:1'), true)
  assert.equal(isPrivateNetworkAddress('2606:4700:4700::1111'), false)
  await assert.rejects(validatePublicUrl('https://127.0.0.1/private'), (error) => error.code === 'PRIVATE_ADDRESS_BLOCKED')
  await assert.rejects(
    validatePublicUrl('https://mixed.example.test/', {
      dnsLookup: async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }],
    }),
    (error) => error.code === 'PRIVATE_ADDRESS_BLOCKED',
  )

  const runtime = createLanceeMcpRuntime({
    database,
    requestImpl,
    dnsLookup,
    browserWorker,
    env: { NODE_ENV: 'test', LANCEE_WEB_SEARCH_URL: 'https://search.example.test/' },
    now: fixedNow,
    renderPdf: ({ title, content }) => Buffer.from(`PDF:${title}\n${content}`),
    coreToolIds: ['workspace.summary'],
    executeAutomationRun: async () => {},
  })
  assert.equal(Object.keys(lanceeMcpCapabilityBindings).length, 53)
  assert.equal(runtime.listTools().length, 49)
  for (const tool of runtime.listTools()) {
    const capability = runtime.capabilities.get(lanceeMcpCapabilityBindings[tool.name])
    assert(capability, `missing capability for ${tool.name}`)
    assert.deepEqual(tool.inputSchema, capability.inputSchema)
  }
  const runtimeFile = await runtime.invoke('create_file', { name: 'runtime.txt', content: 'registry routed' }, context)
  assert.equal(runtimeFile.file.name, 'runtime.txt')
  await assert.rejects(
    runtime.invoke('call_external_api', { url: 'http://127.0.0.1/private' }, context),
    (error) => error instanceof LanceeMcpError && error.code === 'MCP_HTTPS_REQUIRED',
  )
  assert((await database.listMcpInvocations(context.workspace.id)).length > 0)

  const rateRegistry = createCapabilityRegistry([{
    ...disabledCapability,
    id: 'test.rate',
    enabled: true,
    async execute() { return {} },
  }], { maxInvocationsPerMinute: 1 })
  await rateRegistry.invoke('test.rate', {}, context)
  await assert.rejects(rateRegistry.invoke('test.rate', {}, context), (error) => error.code === 'RATE_LIMITED')

  console.log('Lancee capabilities verified: base registry parity plus feature-gated integration tools, schemas, policies, web/files/documents/browser/visual adapters, artifacts/jobs/approvals, normalized results, auditing, limits, and SSRF defenses.')
} finally {
  await database?.close()
  rmSync(directory, { recursive: true, force: true })
}
