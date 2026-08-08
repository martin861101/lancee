import HTMLtoDOCX from 'html-to-docx'
import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'
import { createTextPdf } from '../pdf.mjs'
import { LanceeCapabilityError, textInput } from './registry.mjs'

const MAX_DOCUMENT_CONTENT_LENGTH = 200_000
const MAX_MERGE_PART_CONTENT_LENGTH = 100_000
const MAX_MERGE_PARTS = 20
const MAX_RENDERED_DOCUMENT_LENGTH = 5 * 1024 * 1024
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const documentFormats = Object.freeze({
  pdf: { extension: '.pdf', mimeType: 'application/pdf' },
  docx: { extension: '.docx', mimeType: DOCX_MIME },
  html: { extension: '.html', mimeType: 'text/html' },
  markdown: { extension: '.md', mimeType: 'text/markdown' },
})

const sourceFormats = new Set(['text', 'markdown', 'html'])
const safeHtmlOptions = {
  allowedTags: [
    'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3',
    'h4', 'h5', 'h6', 'hr', 'i', 'li', 'ol', 'p', 'pre', 's', 'span',
    'strike', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'th', 'thead',
    'tr', 'u', 'ul',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
    ol: ['start'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizeLines(value) {
  return String(value || '').replace(/\r\n?/g, '\n').trim()
}

function sanitizeDocumentHtml(value) {
  return sanitizeHtml(String(value || ''), safeHtmlOptions)
}

function textToHtml(value) {
  return normalizeLines(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`)
    .join('')
}

function markdownToHtml(value) {
  return sanitizeDocumentHtml(marked.parse(normalizeLines(value), {
    async: false,
    gfm: true,
  }))
}

function htmlToText(value) {
  const withBreaks = sanitizeDocumentHtml(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<hr\s*\/?\s*>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<\/(?:blockquote|div|h[1-6]|li|ol|p|pre|table|tr|ul)>/gi, '\n')
  return sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function sourceRepresentations(content, sourceFormat) {
  if (sourceFormat === 'html') {
    const html = sanitizeDocumentHtml(content)
    return { html, markdown: htmlToText(html), text: htmlToText(html) }
  }
  if (sourceFormat === 'text') {
    const text = normalizeLines(content)
    return { html: textToHtml(text), markdown: text, text }
  }
  const markdown = normalizeLines(content)
  const html = markdownToHtml(markdown)
  return { html, markdown, text: htmlToText(html) }
}

function markdownHeading(value) {
  return String(value).replace(/([\\`*_[\]<>#])/g, '\\$1')
}

function htmlDocument(title, content) {
  const safeTitle = escapeHtml(title)
  return `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title></head><body><h1>${safeTitle}</h1>${content}</body></html>`
}

function hasControlCharacters(value) {
  return [...String(value)].some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint < 32 || codePoint === 127
  })
}

function outputName(input, format) {
  const rawName = textInput(input, 'name', { required: true, maxLength: 240 })
  const extension = documentFormats[format].extension
  const name = rawName.toLowerCase().endsWith(extension) ? rawName : `${rawName}${extension}`
  if (
    name.length > 240 ||
    name.includes('/') ||
    name.includes('\\') ||
    hasControlCharacters(name)
  ) {
    throw new LanceeCapabilityError('INVALID_ARGUMENTS', 'Use a valid document name without path separators or control characters.')
  }
  return name
}

function documentFormat(input) {
  const format = textInput(input, 'format', { required: true, maxLength: 20 }).toLowerCase()
  if (!documentFormats[format]) {
    throw new LanceeCapabilityError('INVALID_ARGUMENTS', 'Create a PDF, DOCX, HTML, or Markdown document.')
  }
  return format
}

function sourceFormat(input, fallback = 'markdown') {
  const format = textInput(input, 'source_format', { maxLength: 20 }).toLowerCase() || fallback
  if (!sourceFormats.has(format)) {
    throw new LanceeCapabilityError('INVALID_ARGUMENTS', 'source_format must be text, markdown, or html.')
  }
  return format
}

function boundedContent(value, maximum = MAX_DOCUMENT_CONTENT_LENGTH) {
  const content = String(value ?? '')
  if (!content.trim()) {
    throw new LanceeCapabilityError('INVALID_ARGUMENTS', 'Document content cannot be empty.')
  }
  if (Buffer.byteLength(content, 'utf8') > maximum) {
    throw new LanceeCapabilityError('BODY_TOO_LARGE', `Document source content exceeds ${Math.floor(maximum / 1_000)} KB.`, 413)
  }
  return content
}

function renderedBuffer(value) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(value)
  if (body.byteLength === 0) {
    throw new LanceeCapabilityError('DOCUMENT_RENDER_FAILED', 'The document renderer returned an empty file.', 500)
  }
  if (body.byteLength > MAX_RENDERED_DOCUMENT_LENGTH) {
    throw new LanceeCapabilityError('BODY_TOO_LARGE', 'The rendered document exceeds 5 MB.', 413)
  }
  return body
}

async function defaultRenderDocx({ title, html }) {
  return await HTMLtoDOCX(html, null, {
    title,
    creator: 'lancee',
    lastModifiedBy: 'lancee',
  })
}

async function renderDocument({ format, title, representations, renderPdf, renderDocx }) {
  try {
    if (format === 'markdown') {
      return renderedBuffer(Buffer.from(`# ${markdownHeading(title)}\n\n${representations.markdown}\n`, 'utf8'))
    }
    const html = htmlDocument(title, representations.html)
    if (format === 'html') return renderedBuffer(Buffer.from(html, 'utf8'))
    if (format === 'docx') return renderedBuffer(await renderDocx({ title, html }))
    return renderedBuffer(await renderPdf({ title, content: representations.text }))
  } catch (error) {
    if (error instanceof LanceeCapabilityError) throw error
    throw new LanceeCapabilityError('DOCUMENT_RENDER_FAILED', 'The document could not be rendered.', 500)
  }
}

async function storeDocument({ database, context, invocation, name, format, body, source, metadata }) {
  const mimeType = documentFormats[format].mimeType
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
        runId: invocation?.runId || null,
        kind: 'document',
        mimeType,
        name,
        storageDocumentId: file.id,
        size: file.size,
        contentSha256: file.sha256,
        source,
        metadata,
      })
    : null
  return { file, artifact, artifacts: artifact ? [artifact] : [] }
}

function mergeRepresentations(parts) {
  return {
    html: parts.map((part) => (
      `<section><h2>${escapeHtml(part.title)}</h2>${part.representations.html}</section>`
    )).join('<hr>'),
    markdown: parts.map((part) => (
      `## ${markdownHeading(part.title)}\n\n${part.representations.markdown}`
    )).join('\n\n---\n\n'),
    text: parts.map((part) => `${part.title}\n\n${part.representations.text}`).join('\n\n---\n\n'),
  }
}

function normalizedMergeParts(input) {
  if (!Array.isArray(input.parts) || input.parts.length < 2 || input.parts.length > MAX_MERGE_PARTS) {
    throw new LanceeCapabilityError('INVALID_ARGUMENTS', `Merge between 2 and ${MAX_MERGE_PARTS} document parts.`)
  }
  let totalBytes = 0
  const parts = input.parts.map((part, index) => {
    if (!part || typeof part !== 'object' || Array.isArray(part)) {
      throw new LanceeCapabilityError('INVALID_ARGUMENTS', `parts[${index}] must be a document part.`)
    }
    const title = textInput(part, 'title', { maxLength: 200 }) || `Part ${index + 1}`
    const content = boundedContent(part.content, MAX_MERGE_PART_CONTENT_LENGTH)
    totalBytes += Buffer.byteLength(title, 'utf8') + Buffer.byteLength(content, 'utf8')
    if (totalBytes > MAX_DOCUMENT_CONTENT_LENGTH) {
      throw new LanceeCapabilityError('BODY_TOO_LARGE', 'Merged document source content exceeds 200 KB.', 413)
    }
    const selectedSourceFormat = sourceFormat(part)
    return {
      title,
      sourceFormat: selectedSourceFormat,
      representations: sourceRepresentations(content, selectedSourceFormat),
    }
  })
  return parts
}

export function createDocumentCapabilities({
  database,
  renderPdf = createTextPdf,
  renderDocx = defaultRenderDocx,
} = {}) {
  if (!database || typeof database.createWorkspaceDocument !== 'function') {
    throw new TypeError('The document capability requires the Lancee database adapter.')
  }

  const commonMetadata = {
    requiredPermissions: ['documents:create', 'files:write'],
    riskLevel: 'internal-write',
    requiresApproval: true,
    timeoutMs: 30_000,
    concurrencyLimit: 2,
    estimatedCost: 0,
    supportsAsync: false,
    tags: ['document', 'artifact', 'workspace'],
  }

  return [{
    id: 'pdf.create',
    namespace: 'pdf',
    version: '1.0.0',
    description: 'Render approved text as a PDF and store it in the workspace Files library.',
    provider: 'lancee.documents.pdf',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 240 },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        content: { type: 'string', minLength: 1, maxLength: MAX_DOCUMENT_CONTENT_LENGTH },
      },
      required: ['name', 'title', 'content'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object', required: ['file'], properties: { file: { type: 'object' } } },
    ...commonMetadata,
    timeoutMs: 15_000,
    tags: ['document', 'pdf', 'artifact'],
    async execute({ input, context, invocation }) {
      const rawName = textInput(input, 'name', { required: true, maxLength: 240 })
      const name = rawName.toLowerCase().endsWith('.pdf') ? rawName : `${rawName}.pdf`
      const title = textInput(input, 'title', { required: true, maxLength: 200 })
      const content = String(input.content ?? '')
      if (name.length > 240 || name.includes('/') || name.includes('\\') || name.includes('\0') || content.length === 0) {
        throw new LanceeCapabilityError('INVALID_ARGUMENTS', 'Use a valid PDF name, title, and non-empty content.')
      }
      if (Buffer.byteLength(content, 'utf8') > MAX_DOCUMENT_CONTENT_LENGTH) {
        throw new LanceeCapabilityError('BODY_TOO_LARGE', 'The PDF source content exceeds 200 KB.', 413)
      }
      const body = renderedBuffer(await renderPdf({ title, content }))
      const stored = await storeDocument({
        database,
        context,
        invocation,
        name,
        format: 'pdf',
        body,
        source: 'pdf.create',
        metadata: { title, format: 'pdf' },
      })
      return { file: stored.file, artifact: stored.artifact, artifacts: stored.artifacts }
    },
  }, {
    id: 'document.create',
    namespace: 'document',
    version: '1.0.0',
    description: 'Create a bounded PDF, DOCX, HTML, or Markdown document and register it in the workspace Files library.',
    provider: 'lancee.documents.renderer',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 240 },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        format: { type: 'string', enum: Object.keys(documentFormats) },
        source_format: { type: 'string', enum: [...sourceFormats] },
        content: { type: 'string', minLength: 1, maxLength: MAX_DOCUMENT_CONTENT_LENGTH },
      },
      required: ['name', 'title', 'format', 'content'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object', required: ['file', 'format'], properties: { file: { type: 'object' }, format: { type: 'string' } } },
    ...commonMetadata,
    async execute({ input, context, invocation }) {
      const format = documentFormat(input)
      const title = textInput(input, 'title', { required: true, maxLength: 200 })
      const selectedSourceFormat = sourceFormat(input)
      const content = boundedContent(input.content)
      const name = outputName(input, format)
      const body = await renderDocument({
        format,
        title,
        representations: sourceRepresentations(content, selectedSourceFormat),
        renderPdf,
        renderDocx,
      })
      const stored = await storeDocument({
        database,
        context,
        invocation,
        name,
        format,
        body,
        source: 'document.create',
        metadata: { title, format, sourceFormat: selectedSourceFormat },
      })
      return { ...stored, format, sourceFormat: selectedSourceFormat }
    },
  }, {
    id: 'document.merge',
    namespace: 'document',
    version: '1.0.0',
    description: 'Merge bounded inline document parts in a deterministic order and register one workspace document.',
    provider: 'lancee.documents.renderer',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 240 },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        format: { type: 'string', enum: Object.keys(documentFormats) },
        parts: {
          type: 'array',
          minItems: 2,
          maxItems: MAX_MERGE_PARTS,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', maxLength: 200 },
              source_format: { type: 'string', enum: [...sourceFormats] },
              content: { type: 'string', minLength: 1, maxLength: MAX_MERGE_PART_CONTENT_LENGTH },
            },
            required: ['content'],
            additionalProperties: false,
          },
        },
      },
      required: ['name', 'title', 'format', 'parts'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object', required: ['file', 'format', 'partCount'], properties: { file: { type: 'object' }, format: { type: 'string' }, partCount: { type: 'integer' } } },
    ...commonMetadata,
    async execute({ input, context, invocation }) {
      const format = documentFormat(input)
      const title = textInput(input, 'title', { required: true, maxLength: 200 })
      const parts = normalizedMergeParts(input)
      const name = outputName(input, format)
      const body = await renderDocument({
        format,
        title,
        representations: mergeRepresentations(parts),
        renderPdf,
        renderDocx,
      })
      const stored = await storeDocument({
        database,
        context,
        invocation,
        name,
        format,
        body,
        source: 'document.merge',
        metadata: { title, format, partCount: parts.length },
      })
      return { ...stored, format, partCount: parts.length }
    },
  }]
}
