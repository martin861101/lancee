import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createDocumentCapabilities } from '../server/capabilities/documents.mjs'
import { createCapabilityRegistry, LanceeCapabilityError } from '../server/capabilities/registry.mjs'

function databaseFixture() {
  const documents = []
  const artifacts = []
  return {
    documents,
    artifacts,
    database: {
      async createWorkspaceDocument(document) {
        const stored = {
          ...document,
          id: `doc_${documents.length + 1}`,
          size: document.body.byteLength,
          sha256: createHash('sha256').update(document.body).digest('hex'),
        }
        documents.push(stored)
        return {
          id: stored.id,
          workspaceId: stored.workspaceId,
          name: stored.name,
          mimeType: stored.mimeType,
          size: stored.size,
          sha256: stored.sha256,
        }
      },
      async createArtifact(artifact) {
        const stored = { id: `art_${artifacts.length + 1}`, ...artifact }
        artifacts.push(stored)
        return stored
      },
    },
  }
}

const fixture = databaseFixture()
const rendered = { pdf: [], docx: [] }
const capabilities = createCapabilityRegistry(createDocumentCapabilities({
  database: fixture.database,
  renderPdf({ title, content }) {
    rendered.pdf.push({ title, content })
    return Buffer.from(`PDF:${title}\n${content}`)
  },
  async renderDocx({ title, html }) {
    rendered.docx.push({ title, html })
    return Buffer.from(`DOCX:${title}\n${html}`)
  },
}))

assert.deepEqual(capabilities.list().map(({ id }) => id), [
  'pdf.create',
  'document.create',
  'document.merge',
])
assert(capabilities.list().every((capability) => capability.requiresApproval))
assert(capabilities.list().every((capability) => capability.riskLevel === 'internal-write'))

const context = {
  user: { id: 'usr_documents' },
  workspace: { id: 'wsp_documents' },
  membership: { role: 'owner' },
}

const legacyPdf = await capabilities.invoke('pdf.create', {
  name: 'legacy-report',
  title: 'Legacy report',
  content: 'Keep the original PDF input contract.',
}, context, { runId: 'run_documents' })
assert.equal(legacyPdf.file.name, 'legacy-report.pdf')
assert.equal(legacyPdf.file.mimeType, 'application/pdf')
assert.deepEqual(rendered.pdf[0], {
  title: 'Legacy report',
  content: 'Keep the original PDF input contract.',
})
assert.equal(legacyPdf.artifact.source, 'pdf.create')
assert.equal(legacyPdf.artifact.storageDocumentId, legacyPdf.file.id)
assert.equal(legacyPdf.artifact.runId, 'run_documents')
assert.deepEqual(legacyPdf.artifacts, [legacyPdf.artifact])

const safeHtml = await capabilities.invoke('document.create', {
  name: 'safe-page',
  title: 'Safe page',
  format: 'html',
  source_format: 'html',
  content: '<p>Allowed <strong>content</strong>.</p><script>alert(1)</script><a href="javascript:alert(2)">Unsafe link</a>',
}, context)
assert.equal(safeHtml.file.name, 'safe-page.html')
assert.equal(safeHtml.file.mimeType, 'text/html')
const safeHtmlBody = fixture.documents.find(({ id }) => id === safeHtml.file.id).body.toString('utf8')
assert.match(safeHtmlBody, /<h1>Safe page<\/h1>/)
assert.match(safeHtmlBody, /<strong>content<\/strong>/)
assert(!safeHtmlBody.includes('<script'))
assert(!safeHtmlBody.includes('javascript:'))

const markdown = await capabilities.invoke('document.create', {
  name: 'release-notes',
  title: 'Release [notes]',
  format: 'markdown',
  source_format: 'text',
  content: 'First line\n\nSecond line',
}, context)
assert.equal(markdown.file.name, 'release-notes.md')
assert.equal(markdown.file.mimeType, 'text/markdown')
assert.equal(
  fixture.documents.find(({ id }) => id === markdown.file.id).body.toString('utf8'),
  '# Release \\[notes\\]\n\nFirst line\n\nSecond line\n',
)

const docx = await capabilities.invoke('document.create', {
  name: 'brief',
  title: 'Project brief',
  format: 'docx',
  content: '## Scope\n\nBuild the approved feature.',
}, context)
assert.equal(docx.file.name, 'brief.docx')
assert.equal(docx.file.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
assert.match(rendered.docx[0].html, /<h2>Scope<\/h2>/)
assert(!rendered.docx[0].html.includes('<script'))

const merged = await capabilities.invoke('document.merge', {
  name: 'combined',
  title: 'Combined report',
  format: 'markdown',
  parts: [
    { title: 'Research', source_format: 'markdown', content: '**Finding one**' },
    { source_format: 'html', content: '<p>Finding two</p><script>ignored()</script>' },
  ],
}, context)
assert.equal(merged.file.name, 'combined.md')
assert.equal(merged.partCount, 2)
const mergedBody = fixture.documents.find(({ id }) => id === merged.file.id).body.toString('utf8')
assert.equal(mergedBody.indexOf('## Research') < mergedBody.indexOf('## Part 2'), true)
assert.match(mergedBody, /\*\*Finding one\*\*/)
assert.match(mergedBody, /Finding two/)
assert(!mergedBody.includes('ignored'))
assert.equal(merged.artifact.metadata.partCount, 2)

const pdfFromMarkdown = await capabilities.invoke('document.create', {
  name: 'plain-pdf.pdf',
  title: 'Plain PDF',
  format: 'pdf',
  content: '# Heading\n\nA **bold** result.',
}, context)
assert.equal(pdfFromMarkdown.file.name, 'plain-pdf.pdf')
assert.deepEqual(rendered.pdf.at(-1), {
  title: 'Plain PDF',
  content: 'Heading\n\nA bold result.',
})

await assert.rejects(
  capabilities.invoke('document.merge', {
    name: 'one-part',
    title: 'Invalid merge',
    format: 'pdf',
    parts: [{ content: 'Only one part' }],
  }, context),
  (error) => error instanceof LanceeCapabilityError && error.code === 'INVALID_ARGUMENTS',
)

await assert.rejects(
  capabilities.invoke('document.create', {
    name: '../escape',
    title: 'Invalid name',
    format: 'html',
    content: 'No paths.',
  }, context),
  (error) => error instanceof LanceeCapabilityError && error.code === 'INVALID_ARGUMENTS',
)

await assert.rejects(
  capabilities.invoke('document.create', {
    name: 'oversized',
    title: 'Oversized',
    format: 'pdf',
    source_format: 'text',
    content: 'é'.repeat(110_000),
  }, context),
  (error) => error instanceof LanceeCapabilityError && error.code === 'BODY_TOO_LARGE' && error.status === 413,
)

const oversizedFixture = databaseFixture()
const oversizedRenderer = createCapabilityRegistry(createDocumentCapabilities({
  database: oversizedFixture.database,
  renderDocx: async () => Buffer.alloc(5 * 1024 * 1024 + 1),
}))
await assert.rejects(
  oversizedRenderer.invoke('document.create', {
    name: 'oversized-render',
    title: 'Oversized render',
    format: 'docx',
    content: 'Small source.',
  }, context),
  (error) => error instanceof LanceeCapabilityError && error.code === 'BODY_TOO_LARGE' && error.status === 413,
)

const realDocxFixture = databaseFixture()
const realDocxCapabilities = createCapabilityRegistry(createDocumentCapabilities({
  database: realDocxFixture.database,
}))
const realDocx = await realDocxCapabilities.invoke('document.create', {
  name: 'real-render',
  title: 'Real DOCX render',
  format: 'docx',
  content: 'A **real** DOCX rendered by the declared dependency.',
}, context)
const realDocxBody = realDocxFixture.documents.find(({ id }) => id === realDocx.file.id).body
assert.equal(realDocxBody.subarray(0, 2).toString('ascii'), 'PK')

assert(fixture.documents.every(({ workspaceId }) => workspaceId === context.workspace.id))
assert(fixture.artifacts.every(({ workspaceId, createdBy }) => (
  workspaceId === context.workspace.id && createdBy === context.user.id
)))

console.log('Document capabilities verified: PDF compatibility, bounded PDF/DOCX/HTML/Markdown creation, deterministic merging, sanitization, workspace storage, and artifact registration.')
