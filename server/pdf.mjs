const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const PAGE_MARGIN = 48
const BODY_FONT_SIZE = 9
const BODY_LINE_HEIGHT = 12
const LINES_PER_PAGE = 54

function printableText(value) {
  return String(value || '')
    .replaceAll('\u2018', "'")
    .replaceAll('\u2019', "'")
    .replaceAll('\u201c', '"')
    .replaceAll('\u201d', '"')
    .replaceAll('\u2013', '-')
    .replaceAll('\u2014', '-')
    .replaceAll('\u2026', '...')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
}

function pdfLiteral(value) {
  let output = ''
  for (const character of printableText(value)) {
    const code = character.codePointAt(0)
    if (character === '\\' || character === '(' || character === ')') {
      output += `\\${character}`
    } else if (code >= 32 && code <= 126) {
      output += character
    } else if (code === 9) {
      output += '    '
    } else if (code <= 255) {
      output += `\\${code.toString(8).padStart(3, '0')}`
    } else {
      output += '?'
    }
  }
  return output
}

function wrapLine(value, maximumCharacters = 96) {
  const line = printableText(value).replace(/\s+/g, ' ').trim()
  if (!line) return ['']
  const wrapped = []
  let current = ''
  for (const word of line.split(' ')) {
    if (word.length > maximumCharacters) {
      if (current) wrapped.push(current)
      for (let offset = 0; offset < word.length; offset += maximumCharacters) {
        wrapped.push(word.slice(offset, offset + maximumCharacters))
      }
      current = ''
      continue
    }
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > maximumCharacters) {
      wrapped.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) wrapped.push(current)
  return wrapped
}

function markdownText(value) {
  return String(value || '')
    .replace(/\s+(#{1,6}\s+)/g, '\n$1')
    .replace(/:\s*[-*]\s+(?=\*\*)/g, ':\n- ')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '- ')
    .replace(/^\s*>\s?/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
}

function pdfObject(id, body) {
  return Buffer.from(`${id} 0 obj\n${body}\nendobj\n`, 'ascii')
}

export function createTextPdf({ title, content, generatedAt = new Date().toISOString() }) {
  const safeTitle = printableText(title).trim() || 'Lancee report'
  const bodyLines = markdownText(content)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap((line) => wrapLine(line))
  const pages = []
  for (let offset = 0; offset < Math.max(1, bodyLines.length); offset += LINES_PER_PAGE) {
    pages.push(bodyLines.slice(offset, offset + LINES_PER_PAGE))
  }

  const objects = new Map()
  const pageIds = pages.map((_, index) => 5 + index * 2)
  objects.set(1, pdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>'))
  objects.set(2, pdfObject(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`))
  objects.set(3, pdfObject(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'))
  objects.set(4, pdfObject(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'))

  pages.forEach((lines, pageIndex) => {
    const pageId = pageIds[pageIndex]
    const streamId = pageId + 1
    const heading = pageIndex === 0 ? safeTitle : `${safeTitle} - continued`
    const commands = [
      'BT',
      `/F2 16 Tf ${PAGE_MARGIN} ${PAGE_HEIGHT - 52} Td (${pdfLiteral(heading)}) Tj`,
      'ET',
      'BT',
      `/F1 ${BODY_FONT_SIZE} Tf ${PAGE_MARGIN} ${PAGE_HEIGHT - 82} Td ${BODY_LINE_HEIGHT} TL`,
      ...lines.map((line) => `(${pdfLiteral(line)}) Tj T*`),
      'ET',
      'BT',
      `/F1 7 Tf ${PAGE_MARGIN} 28 Td (${pdfLiteral(`Generated ${generatedAt} | Page ${pageIndex + 1} of ${pages.length}`)}) Tj`,
      'ET',
    ].join('\n')
    const stream = Buffer.from(commands, 'ascii')
    objects.set(pageId, pdfObject(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`,
    ))
    objects.set(streamId, Buffer.concat([
      Buffer.from(`${streamId} 0 obj\n<< /Length ${stream.byteLength} >>\nstream\n`, 'ascii'),
      stream,
      Buffer.from('\nendstream\nendobj\n', 'ascii'),
    ]))
  })

  const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')
  const chunks = [header]
  const offsets = [0]
  let byteLength = header.byteLength
  for (let id = 1; id <= objects.size; id += 1) {
    const object = objects.get(id)
    if (!object) throw new Error(`Missing PDF object ${id}.`)
    offsets[id] = byteLength
    chunks.push(object)
    byteLength += object.byteLength
  }
  const xrefOffset = byteLength
  const xref = [
    `xref\n0 ${objects.size + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${objects.size + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ].join('')
  chunks.push(Buffer.from(xref, 'ascii'))
  return Buffer.concat(chunks)
}
