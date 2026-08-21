import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import sanitizeHtml from 'sanitize-html'
import { marked } from 'marked'
import { chromium } from 'playwright'
import { requestPublicResource, validatePublicUrl } from './capabilities/network.mjs'
import { LanceeCapabilityError } from './capabilities/registry.mjs'

const MAX_RESOURCE_BYTES = 1_000_000
const MAX_TOTAL_BYTES = 5_000_000
const MAX_REQUESTS = 50
const MAX_SCREENSHOT_BYTES = 5_000_000
const MAX_PDF_BYTES = 10_000_000

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizedMarkdown(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\s+(#{1,6}\s+)/g, '\n\n$1')
    .replace(/:\s*[-*]\s+(?=\*\*)/g, ':\n\n- ')
    .replace(/([.!?])\s+([-*]\s+(?=\*\*))/g, '$1\n\n$2')
}

function getPdfStyle(style = 'professional') {
  const styles = {
    professional: {
      brandLabel: 'Lancee · Executive document',
      pageBorder: 'position: fixed; z-index: -1; inset: -10mm -9mm -12mm; border: 1.5px solid #2f6fed; border-top-width: 7px; border-radius: 4px;',
      brandStyle: 'color: #2f6fed; font-size: 8pt; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase;',
      titleCard: 'margin: 5mm 0 9mm; padding: 9mm 10mm; color: #fff; background: linear-gradient(135deg, #17315f, #2f6fed); border-left: 5px solid #6ee7d8; border-radius: 8px;',
      titleCardH1: 'margin: 0; color: #fff; font-size: 25pt; line-height: 1.12; letter-spacing: -.35px;',
      titleCardP: 'margin: 4mm 0 0; color: #dbeafe; font-size: 9pt;',
      h1: 'margin: 8mm 0 3mm; padding-bottom: 2.5mm; font-size: 19pt; border-bottom: 2px solid #6ee7d8;',
      h2: 'margin: 7mm 0 3mm; padding-left: 3mm; font-size: 14pt; border-left: 4px solid #2f6fed;',
      h3: 'margin: 5mm 0 2mm; color: #2f6fed; font-size: 11.5pt;',
      h4: 'margin: 4mm 0 2mm; font-size: 10.5pt;',
      bodyFont: '10.2pt/1.55 Arial, Helvetica, sans-serif',
      bodyColor: '#243147',
      headingColor: '#17315f',
      linkColor: '#245dc1',
      blockquoteBg: '#eef5ff',
      blockquoteBorder: '#6ee7d8',
      codeBg: '#eef2f7',
      codeColor: '#17315f',
      preBg: '#172235',
      preColor: '#e5eefc',
      tableThBg: '#2f6fed',
      tableThColor: '#fff',
      tableTdBorder: '#cbd8ea',
      tableAltRowBg: '#f5f8fc',
      hrBorder: '#b9c9de',
    },
    report: {
      brandLabel: 'Lancee · Report',
      pageBorder: 'position: fixed; z-index: -1; inset: -10mm -9mm -12mm; border: 1px solid #374151; border-top-width: 4px; border-radius: 4px;',
      brandStyle: 'color: #374151; font-size: 7.5pt; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase;',
      titleCard: 'margin: 4mm 0 8mm; padding: 8mm 10mm; color: #fff; background: #111827; border-left: 4px solid #6366f1; border-radius: 6px;',
      titleCardH1: 'margin: 0; color: #fff; font-size: 22pt; line-height: 1.15; letter-spacing: -.3px;',
      titleCardP: 'margin: 3mm 0 0; color: #d1d5db; font-size: 8.5pt;',
      h1: 'margin: 7mm 0 2.5mm; padding-bottom: 2mm; font-size: 17pt; border-bottom: 1.5px solid #6366f1;',
      h2: 'margin: 6mm 0 2.5mm; padding-left: 2.5mm; font-size: 13pt; border-left: 3px solid #6366f1;',
      h3: 'margin: 4.5mm 0 2mm; color: #6366f1; font-size: 11pt;',
      h4: 'margin: 3.5mm 0 1.5mm; font-size: 10pt;',
      bodyFont: '10pt/1.55 Arial, Helvetica, sans-serif',
      bodyColor: '#1f2937',
      headingColor: '#111827',
      linkColor: '#4f46e5',
      blockquoteBg: '#f3f4f6',
      blockquoteBorder: '#6366f1',
      codeBg: '#f3f4f6',
      codeColor: '#111827',
      preBg: '#1f2937',
      preColor: '#f3f4f6',
      tableThBg: '#111827',
      tableThColor: '#fff',
      tableTdBorder: '#d1d5db',
      tableAltRowBg: '#f9fafb',
      hrBorder: '#d1d5db',
    },
    proposal: {
      brandLabel: 'Lancee · Proposal',
      pageBorder: 'position: fixed; z-index: -1; inset: -10mm -9mm -12mm; border: 1.5px solid #059669; border-top-width: 6px; border-radius: 4px;',
      brandStyle: 'color: #059669; font-size: 8pt; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase;',
      titleCard: 'margin: 5mm 0 9mm; padding: 9mm 10mm; color: #fff; background: linear-gradient(135deg, #064e3b, #059669); border-left: 5px solid #34d399; border-radius: 8px;',
      titleCardH1: 'margin: 0; color: #fff; font-size: 25pt; line-height: 1.12; letter-spacing: -.35px;',
      titleCardP: 'margin: 4mm 0 0; color: #a7f3d0; font-size: 9pt;',
      h1: 'margin: 8mm 0 3mm; padding-bottom: 2.5mm; font-size: 19pt; border-bottom: 2px solid #34d399;',
      h2: 'margin: 7mm 0 3mm; padding-left: 3mm; font-size: 14pt; border-left: 4px solid #059669;',
      h3: 'margin: 5mm 0 2mm; color: #059669; font-size: 11.5pt;',
      h4: 'margin: 4mm 0 2mm; font-size: 10.5pt;',
      bodyFont: '10.2pt/1.55 Arial, Helvetica, sans-serif',
      bodyColor: '#1f2937',
      headingColor: '#064e3b',
      linkColor: '#047857',
      blockquoteBg: '#ecfdf5',
      blockquoteBorder: '#34d399',
      codeBg: '#ecfdf5',
      codeColor: '#064e3b',
      preBg: '#064e3b',
      preColor: '#ecfdf5',
      tableThBg: '#059669',
      tableThColor: '#fff',
      tableTdBorder: '#a7f3d0',
      tableAltRowBg: '#f0fdf4',
      hrBorder: '#a7f3d0',
    },
    brief: {
      brandLabel: 'Lancee · Brief',
      pageBorder: 'position: fixed; z-index: -1; inset: -8mm -7mm -10mm; border: 1px solid #6b7280; border-top-width: 3px; border-radius: 3px;',
      brandStyle: 'color: #6b7280; font-size: 7pt; font-weight: 600; letter-spacing: 1.4px; text-transform: uppercase;',
      titleCard: 'margin: 3mm 0 6mm; padding: 6mm 8mm; color: #fff; background: #374151; border-left: 3px solid #9ca3af; border-radius: 4px;',
      titleCardH1: 'margin: 0; color: #fff; font-size: 20pt; line-height: 1.15; letter-spacing: -.25px;',
      titleCardP: 'margin: 2.5mm 0 0; color: #d1d5db; font-size: 8pt;',
      h1: 'margin: 6mm 0 2mm; padding-bottom: 1.5mm; font-size: 16pt; border-bottom: 1px solid #9ca3af;',
      h2: 'margin: 5mm 0 2mm; padding-left: 2mm; font-size: 12pt; border-left: 3px solid #6b7280;',
      h3: 'margin: 4mm 0 1.5mm; color: #6b7280; font-size: 10.5pt;',
      h4: 'margin: 3mm 0 1mm; font-size: 9.5pt;',
      bodyFont: '9.5pt/1.5 Arial, Helvetica, sans-serif',
      bodyColor: '#374151',
      headingColor: '#1f2937',
      linkColor: '#4b5563',
      blockquoteBg: '#f9fafb',
      blockquoteBorder: '#9ca3af',
      codeBg: '#f3f4f6',
      codeColor: '#1f2937',
      preBg: '#1f2937',
      preColor: '#f3f4f6',
      tableThBg: '#374151',
      tableThColor: '#fff',
      tableTdBorder: '#d1d5db',
      tableAltRowBg: '#f9fafb',
      hrBorder: '#d1d5db',
    },
    minimal: {
      brandLabel: '',
      pageBorder: '',
      brandStyle: '',
      titleCard: 'margin: 4mm 0 6mm; padding: 0; border-bottom: 1px solid #d1d5db;',
      titleCardH1: 'margin: 0; color: #111827; font-size: 22pt; line-height: 1.2; letter-spacing: -.4px;',
      titleCardP: 'margin: 2mm 0 0; color: #6b7280; font-size: 8.5pt;',
      h1: 'margin: 7mm 0 2.5mm; font-size: 18pt; color: #111827;',
      h2: 'margin: 6mm 0 2mm; font-size: 13pt; color: #374151;',
      h3: 'margin: 4mm 0 1.5mm; color: #4b5563; font-size: 10.5pt;',
      h4: 'margin: 3mm 0 1mm; font-size: 9.5pt; color: #6b7280;',
      bodyFont: '10pt/1.6 Arial, Helvetica, sans-serif',
      bodyColor: '#1f2937',
      headingColor: '#111827',
      linkColor: '#374151',
      blockquoteBg: '#f9fafb',
      blockquoteBorder: '#d1d5db',
      codeBg: '#f3f4f6',
      codeColor: '#1f2937',
      preBg: '#1f2937',
      preColor: '#f3f4f6',
      tableThBg: '#1f2937',
      tableThColor: '#fff',
      tableTdBorder: '#e5e7eb',
      tableAltRowBg: '#f9fafb',
      hrBorder: '#e5e7eb',
    },
  }
  return styles[style] || styles.professional
}

function documentPdfHtml({ title, content, style = 'professional' }) {
  const safeTitle = String(title || '').trim() || 'Lancee document'
  let markdown = normalizedMarkdown(content)
  const firstHeading = markdown.match(/^\s*#\s+(.+)\s*(?:\n|$)/)
  if (firstHeading && firstHeading[1].trim().toLowerCase() === safeTitle.toLowerCase()) {
    markdown = markdown.slice(firstHeading[0].length)
  }
  const rendered = marked.parse(markdown, { async: false, gfm: true, breaks: false })
  const body = sanitizeHtml(String(rendered), {
    allowedTags: ['h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'blockquote', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'br'],
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https'],
  })
  const s = getPdfStyle(style)
  const brandHtml = s.brandLabel ? `<div class="brand">${s.brandLabel}</div>` : ''
  const pageBorderHtml = s.pageBorder ? `<div class="page-border"></div>` : ''
  const pageBorderStyle = s.pageBorder ? `.page-border { ${s.pageBorder} }` : ''
  const brandStyle = s.brandStyle ? `.brand { ${s.brandStyle} }` : ''
  const titleCardStyle = `.title-card { ${s.titleCard} }`
  const titleCardH1Style = `.title-card h1 { ${s.titleCardH1} }`
  const titleCardPStyle = `.title-card p { ${s.titleCardP} }`
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 18mm 17mm 20mm; }
    * { box-sizing: border-box; }
    html { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    body { margin: 0; color: ${s.bodyColor}; font: ${s.bodyFont}; }
    ${pageBorderStyle}
    ${brandStyle}
    ${titleCardStyle}
    ${titleCardH1Style}
    ${titleCardPStyle}
    h1, h2, h3, h4 { break-after: avoid; color: ${s.headingColor}; line-height: 1.2; }
    h1 { ${s.h1} }
    h2 { ${s.h2} }
    h3 { ${s.h3} }
    h4 { ${s.h4} }
    p { margin: 0 0 3.3mm; orphans: 3; widows: 3; }
    ul, ol { margin: 2mm 0 4mm; padding-left: 7mm; }
    li { margin: 1.4mm 0; padding-left: 1.5mm; }
    li::marker { color: ${s.headingColor}; font-weight: 700; }
    strong { color: ${s.headingColor}; }
    a { color: ${s.linkColor}; text-decoration: none; word-break: break-word; }
    blockquote { margin: 5mm 0; padding: 4mm 5mm; color: ${s.bodyColor}; background: ${s.blockquoteBg}; border-left: 4px solid ${s.blockquoteBorder}; border-radius: 0 6px 6px 0; }
    code { padding: 1px 4px; color: ${s.codeColor}; background: ${s.codeBg}; border-radius: 3px; font: 8.5pt Consolas, monospace; }
    pre { overflow: hidden; padding: 4mm; color: ${s.preColor}; background: ${s.preBg}; border-radius: 6px; white-space: pre-wrap; }
    pre code { padding: 0; color: inherit; background: transparent; }
    table { width: 100%; margin: 5mm 0; border-collapse: collapse; break-inside: avoid; font-size: 8.7pt; }
    th { padding: 2.6mm; color: ${s.tableThColor}; background: ${s.tableThBg}; text-align: left; }
    td { padding: 2.4mm; border: 1px solid ${s.tableTdBorder}; vertical-align: top; }
    tr:nth-child(even) td { background: ${s.tableAltRowBg}; }
    hr { margin: 7mm 0; border: 0; border-top: 1px solid ${s.hrBorder}; }
  </style></head><body>${pageBorderHtml}${brandHtml}<header class="title-card"><h1>${escapeHtml(safeTitle)}</h1><p>Prepared ${escapeHtml(new Date().toISOString().slice(0, 10))}</p></header><main>${body}</main></body></html>`
}

function accentTextColor(accent) {
  const channels = accent.slice(1).match(/.{2}/g).map((channel) => Number.parseInt(channel, 16))
  const luminance = channels.reduce((sum, channel, index) => sum + channel * [0.299, 0.587, 0.114][index], 0)
  return luminance > 150 ? '#111827' : '#ffffff'
}

function invoicePdfHtml(invoice) {
  const accent = invoice.accentColor
  const accentText = accentTextColor(accent)
  const documentLabel = invoice.documentType.charAt(0).toUpperCase() + invoice.documentType.slice(1)
  const issued = new Date(invoice.createdAt).toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const due = invoice.dueDate
    ? new Date(`${invoice.dueDate}T00:00:00Z`).toLocaleDateString('en-ZA', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : 'On receipt'
  const amount = new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: invoice.currency,
    maximumFractionDigits: 2,
  }).format(invoice.amountMinor / 100)
  const customFields = invoice.customFields.map((field) => `
    <div class="detail"><span>${escapeHtml(field.label)}</span><strong>${escapeHtml(field.value)}</strong></div>`).join('')
  const bankDetails = invoice.bankDetails
    ? `<section class="payment-card bank-card">
        <div><span class="section-label">Payment details</span><h3>Bank transfer</h3></div>
        <div class="bank-grid">
          <p><span>Account holder</span><strong>${escapeHtml(invoice.bankDetails.accountHolder)}</strong></p>
          <p><span>Bank</span><strong>${escapeHtml(invoice.bankDetails.bankName)}</strong></p>
          <p><span>Account number</span><strong>${escapeHtml(invoice.bankDetails.accountNumber)}</strong></p>
          ${invoice.bankDetails.branchCode ? `<p><span>Branch code</span><strong>${escapeHtml(invoice.bankDetails.branchCode)}</strong></p>` : ''}
          ${invoice.bankDetails.swiftCode ? `<p><span>SWIFT / BIC</span><strong>${escapeHtml(invoice.bankDetails.swiftCode)}</strong></p>` : ''}
          <p><span>Reference</span><strong>${escapeHtml(invoice.invoiceNumber)}</strong></p>
        </div>
      </section>`
    : invoice.paymentUrl
      ? `<section class="payment-card"><div><span class="section-label">Pay online</span><h3>Secure Paystack checkout</h3><p>Use the payment link below and quote ${escapeHtml(invoice.invoiceNumber)}.</p></div><a href="${escapeHtml(invoice.paymentUrl)}">${escapeHtml(invoice.paymentUrl)}</a></section>`
      : `<section class="payment-card"><div><span class="section-label">Payment</span><h3>Payment details available on request</h3></div></section>`

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    body { --accent: ${accent}; --accent-text: ${accentText}; --accent-soft: ${accent}16; margin: 0; color: #172033; background: #fff; font: 10pt/1.45 Arial, Helvetica, sans-serif; }
    .sheet { position: relative; min-height: 297mm; overflow: hidden; padding: 18mm 18mm 14mm; background: #fff; }
    .top-rule { position: absolute; top: 0; right: 0; left: 0; height: 6mm; background: var(--accent); }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 15mm; margin-top: 3mm; }
    .brand { display: flex; align-items: center; gap: 4mm; }
    .brand-mark { display: grid; width: 11mm; height: 11mm; place-items: center; color: var(--accent-text); background: var(--accent); border-radius: 3mm; font-size: 16pt; font-weight: 800; }
    .brand strong { display: block; max-width: 90mm; font-size: 12pt; letter-spacing: -.2px; }
    .brand span, .document-id span, .detail span, .bank-grid span { color: #788193; font-size: 7.5pt; letter-spacing: .35px; }
    .document-id { text-align: right; }
    .document-id strong { display: block; margin-top: 1mm; color: var(--accent); font-size: 10pt; }
    .hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 16mm; margin: 20mm 0 13mm; }
    .eyebrow, .section-label { color: var(--accent); font-size: 7.5pt; font-weight: 800; letter-spacing: 1.6px; text-transform: uppercase; }
    h1 { margin: 2mm 0 0; font-size: 35pt; line-height: .95; letter-spacing: -1.7px; }
    .hero-total { flex: 0 0 auto; text-align: right; }
    .hero-total span { display: block; margin-bottom: 1mm; color: #788193; font-size: 8pt; }
    .hero-total strong { color: var(--accent); font-size: 22pt; letter-spacing: -1px; }
    .meta { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 4mm; margin-bottom: 12mm; }
    .meta article { min-height: 28mm; padding: 5mm; background: #f5f7fa; border-radius: 3mm; }
    .meta span { color: #7a8495; font-size: 7pt; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; }
    .meta h2 { margin: 2.5mm 0 1mm; font-size: 12pt; line-height: 1.2; }
    .meta p { margin: 0; color: #626d7e; font-size: 8.5pt; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 3mm 2mm; color: #7a8495; border-bottom: 1px solid #dce1e8; font-size: 7pt; letter-spacing: .8px; text-align: left; text-transform: uppercase; }
    th:last-child, td:last-child { text-align: right; }
    td { padding: 6mm 2mm; border-bottom: 1px solid #e4e8ee; vertical-align: top; }
    td strong { display: block; margin-bottom: 1mm; font-size: 10pt; }
    td span { color: #697486; font-size: 8.5pt; }
    .totals { display: flex; justify-content: flex-end; margin: 5mm 0 11mm; }
    .total-box { display: flex; width: 72mm; align-items: center; justify-content: space-between; padding: 5mm 0 5mm 6mm; border-bottom: 3px solid var(--accent); }
    .total-box span { color: #667185; font-size: 8pt; font-weight: 700; text-transform: uppercase; }
    .total-box strong { font-size: 17pt; letter-spacing: -.6px; }
    .details { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin-bottom: 8mm; }
    .detail { padding: 3.5mm; background: var(--accent-soft); border-left: 2px solid var(--accent); }
    .detail strong { display: block; margin-top: 1mm; font-size: 8.5pt; overflow-wrap: anywhere; }
    .payment-card { display: grid; grid-template-columns: 1fr 1.25fr; gap: 8mm; align-items: center; padding: 6mm; background: #182132; border-radius: 4mm; color: #fff; }
    .payment-card .section-label { color: var(--accent); }
    .payment-card h3 { margin: 1.5mm 0 0; font-size: 12pt; }
    .payment-card p { margin: 1mm 0 0; color: #b9c1cd; font-size: 8pt; }
    .payment-card a { color: #fff; font-size: 8pt; overflow-wrap: anywhere; text-decoration: underline; text-decoration-color: var(--accent); text-underline-offset: 2px; }
    .bank-card { align-items: start; }
    .bank-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 6mm; }
    .bank-grid p { margin: 0; }
    .bank-grid span, .bank-grid strong { display: block; }
    .bank-grid strong { margin-top: .5mm; color: #fff; font-size: 8.5pt; overflow-wrap: anywhere; }
    footer { position: absolute; right: 18mm; bottom: 9mm; left: 18mm; display: flex; justify-content: space-between; color: #8992a2; font-size: 7pt; }

    body.classic { font-family: Georgia, 'Times New Roman', serif; }
    body.classic .sheet { margin: 7mm; min-height: 283mm; padding: 14mm; border: 1px solid var(--accent); }
    body.classic .top-rule { top: 3mm; right: 3mm; left: 3mm; height: 1px; background: var(--accent); }
    body.classic .brand-mark { color: var(--accent); background: transparent; border: 1px solid var(--accent); border-radius: 50%; }
    body.classic h1 { font-weight: 400; letter-spacing: -.7px; }
    body.classic .meta article { background: transparent; border-top: 1px solid #d6d1c8; border-radius: 0; }
    body.classic .payment-card { background: #f6f3ee; border: 1px solid #ddd6ca; border-radius: 0; color: #172033; }
    body.classic .payment-card p, body.classic .bank-grid strong, body.classic .payment-card a { color: #394254; }

    body.studio .top-rule { width: 38mm; height: 297mm; right: auto; background: var(--accent); }
    body.studio .sheet { padding: 14mm 15mm 10mm 52mm; }
    body.studio .brand-mark { color: var(--accent); background: #fff; transform: rotate(-5deg); }
    body.studio h1 { max-width: 115mm; font-size: 42pt; text-transform: uppercase; }
    body.studio .hero { margin: 10mm 0 8mm; }
    body.studio .meta article { background: var(--accent-soft); border-radius: 0; }
    body.studio .meta { margin-bottom: 7mm; }
    body.studio td { padding-top: 4mm; padding-bottom: 4mm; }
    body.studio .totals { margin: 4mm 0 7mm; }
    body.studio .details { margin-bottom: 5mm; }
    body.studio .payment-card { padding: 5mm; }
    body.studio .total-box { color: var(--accent-text); background: var(--accent); border: 0; padding: 5mm; }

    body.minimal .top-rule { right: 18mm; left: 18mm; height: 1.5mm; }
    body.minimal .brand-mark { width: 8mm; height: 8mm; color: var(--accent); background: transparent; border: 2px solid var(--accent); border-radius: 50%; font-size: 10pt; }
    body.minimal h1 { font-size: 29pt; font-weight: 500; letter-spacing: -1px; }
    body.minimal .meta article { padding-left: 0; background: transparent; border-radius: 0; }
    body.minimal .payment-card { color: #172033; background: transparent; border: 1px solid #dce1e8; border-radius: 0; }
    body.minimal .payment-card p, body.minimal .bank-grid strong, body.minimal .payment-card a { color: #394254; }
  </style></head><body class="${escapeHtml(invoice.template)}"><main class="sheet"><div class="top-rule"></div>
    <header><div class="brand"><i class="brand-mark">L</i><div><strong>${escapeHtml(invoice.senderName)}</strong><span>${escapeHtml(invoice.senderEmail)}</span></div></div><div class="document-id"><span>${escapeHtml(documentLabel)} number</span><strong>${escapeHtml(invoice.invoiceNumber)}</strong></div></header>
    <section class="hero"><div><span class="eyebrow">${escapeHtml(documentLabel)}</span><h1>${escapeHtml(invoice.projectName)}</h1></div><div class="hero-total"><span>Amount due</span><strong>${escapeHtml(amount)}</strong></div></section>
    <section class="meta"><article><span>Bill to</span><h2>${escapeHtml(invoice.clientName)}</h2><p>${escapeHtml(invoice.clientEmail)}</p></article><article><span>Issued</span><h2>${escapeHtml(issued)}</h2><p>${escapeHtml(invoice.invoiceNumber)}</p></article><article><span>Due</span><h2>${escapeHtml(due)}</h2><p>${invoice.dueDate ? 'Payment due by this date' : 'Payment due on receipt'}</p></article></section>
    <table><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody><tr><td><strong>${escapeHtml(invoice.projectName)}</strong><span>${escapeHtml(invoice.description)}</span></td><td>1</td><td>${escapeHtml(amount)}</td><td><strong>${escapeHtml(amount)}</strong></td></tr></tbody></table>
    <div class="totals"><div class="total-box"><span>Total</span><strong>${escapeHtml(amount)}</strong></div></div>
    ${customFields ? `<section class="details">${customFields}</section>` : ''}${bankDetails}
    <footer><span>Thank you for your business.</span><span>Created with Lancee · ${escapeHtml(invoice.invoiceNumber)}</span></footer>
  </main></body></html>`
}

function filteredResponseHeaders(headers) {
  const allowed = new Set(['content-type', 'cache-control', 'etag', 'last-modified'])
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([key, value]) => allowed.has(key.toLowerCase()) && typeof value === 'string')
      .map(([key, value]) => [key, value]),
  )
}

function createLocalBrowserWorker({
  chromiumImpl = chromium,
  requestImpl = requestPublicResource,
  dnsLookup,
  executablePath = process.env.LANCEE_BROWSER_EXECUTABLE || undefined,
} = {}) {
  let browserPromise = null

  async function browser() {
    if (!browserPromise) {
      browserPromise = chromiumImpl.launch({
        headless: true,
        ...(executablePath ? { executablePath } : {}),
      }).catch((error) => {
        browserPromise = null
        throw new LanceeCapabilityError('BROWSER_UNAVAILABLE', 'The Lancee browser worker could not start.', 503, { cause: error })
      })
    }
    return browserPromise
  }

  async function withPage(url, operation, {
    width = 1440,
    height = 900,
    timeoutMs = 20_000,
  } = {}) {
    const { target } = await validatePublicUrl(url, { dnsLookup, protocols: ['https:', 'http:'] })
    const runningBrowser = await browser()
    const context = await runningBrowser.newContext({
      viewport: {
        width: Math.min(1920, Math.max(320, Number(width) || 1440)),
        height: Math.min(1080, Math.max(240, Number(height) || 900)),
      },
      javaScriptEnabled: false,
      serviceWorkers: 'block',
      acceptDownloads: false,
      permissions: [],
    })
    let requestCount = 0
    let totalBytes = 0
    await context.route('**/*', async (route) => {
      try {
        const request = route.request()
        if (request.method() !== 'GET') {
          await route.abort('blockedbyclient')
          return
        }
        requestCount += 1
        if (requestCount > MAX_REQUESTS) {
          await route.abort('blockedbyclient')
          return
        }
        const response = await requestImpl(request.url(), {
          method: 'GET',
          dnsLookup,
          protocols: ['https:', 'http:'],
          maximumBytes: Math.min(MAX_RESOURCE_BYTES, MAX_TOTAL_BYTES - totalBytes),
          timeoutMs,
          maximumRedirects: 3,
          userAgent: 'LanceeBrowser/1.0 (+https://lancee.hookitupservices.com)',
        })
        totalBytes += response.body.byteLength
        if (totalBytes > MAX_TOTAL_BYTES) {
          await route.abort('blockedbyclient')
          return
        }
        await route.fulfill({
          status: response.status,
          headers: filteredResponseHeaders(response.headers),
          body: response.body,
        })
      } catch {
        await route.abort('blockedbyclient').catch(() => {})
      }
    })
    const page = await context.newPage()
    page.setDefaultTimeout(timeoutMs)
    page.on('dialog', (dialog) => void dialog.dismiss())
    page.on('popup', (popup) => void popup.close())
    try {
      await page.goto(target.toString(), { waitUntil: 'domcontentloaded', timeout: timeoutMs })
      return await operation(page, {
        finalUrl: page.url(),
        requestCount,
        totalBytes,
      })
    } catch (error) {
      if (error instanceof LanceeCapabilityError) throw error
      throw new LanceeCapabilityError('BROWSER_FAILED', 'The browser worker could not render the page.', 502, { cause: error })
    } finally {
      await context.close().catch(() => {})
    }
  }

  return Object.freeze({
    async read(url, options = {}) {
      return withPage(url, async (page, metadata) => ({
        url: metadata.finalUrl,
        title: (await page.title()).slice(0, 500),
        text: (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim().slice(0, 100_000),
        links: (await page.locator('a[href]').evaluateAll((anchors) => anchors.slice(0, 100).map((anchor) => ({
          text: String(anchor.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
          url: anchor.href,
        })))),
        requestCount: metadata.requestCount,
        bytes: metadata.totalBytes,
      }), options)
    },
    async snapshot(url, options = {}) {
      return withPage(url, async (page, metadata) => ({
        url: metadata.finalUrl,
        title: (await page.title()).slice(0, 500),
        snapshot: (await page.locator('body').ariaSnapshot()).slice(0, 100_000),
        requestCount: metadata.requestCount,
        bytes: metadata.totalBytes,
      }), options)
    },
    async screenshot(url, options = {}) {
      return withPage(url, async (page, metadata) => {
        const body = await page.screenshot({
          type: options.format === 'jpeg' ? 'jpeg' : 'png',
          quality: options.format === 'jpeg' ? 85 : undefined,
          fullPage: false,
          animations: 'disabled',
          caret: 'hide',
        })
        if (body.byteLength > MAX_SCREENSHOT_BYTES) {
          throw new LanceeCapabilityError('BODY_TOO_LARGE', 'The browser screenshot exceeded 5 MB.', 413)
        }
        return {
          url: metadata.finalUrl,
          body,
          mimeType: options.format === 'jpeg' ? 'image/jpeg' : 'image/png',
          requestCount: metadata.requestCount,
          bytes: metadata.totalBytes,
        }
      }, options)
    },
    async pdf(url, options = {}) {
      return withPage(url, async (page, metadata) => {
        const body = await page.pdf({
          format: 'A4',
          printBackground: options.printBackground !== false,
          preferCSSPageSize: true,
          margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
        })
        if (body.byteLength > MAX_PDF_BYTES) {
          throw new LanceeCapabilityError('BODY_TOO_LARGE', 'The browser PDF exceeded 10 MB.', 413)
        }
        return {
          url: metadata.finalUrl,
          body,
          mimeType: 'application/pdf',
          requestCount: metadata.requestCount,
          bytes: metadata.totalBytes,
        }
      }, options)
    },
    async renderDocumentPdf({ title, content, style = 'professional' }) {
      const runningBrowser = await browser()
      const context = await runningBrowser.newContext({
        javaScriptEnabled: false,
        serviceWorkers: 'block',
        acceptDownloads: false,
        permissions: [],
      })
      await context.route('**/*', (route) => route.abort('blockedbyclient'))
      const page = await context.newPage()
      try {
        await page.setContent(documentPdfHtml({ title, content, style }), { waitUntil: 'domcontentloaded', timeout: 20_000 })
        const body = await page.pdf({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: true,
          headerTemplate: '<span></span>',
          footerTemplate: '<div style="width:100%;padding:0 17mm;color:#6b7b91;font:8px Arial;text-align:right"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
        })
        if (body.byteLength > MAX_PDF_BYTES) {
          throw new LanceeCapabilityError('BODY_TOO_LARGE', 'The generated PDF exceeded 10 MB.', 413)
        }
        return body
      } catch (error) {
        if (error instanceof LanceeCapabilityError) throw error
        throw new LanceeCapabilityError('BROWSER_FAILED', 'The document renderer could not create the PDF.', 502, { cause: error })
      } finally {
        await context.close().catch(() => {})
      }
    },
    async renderInvoicePdf(invoice) {
      const runningBrowser = await browser()
      const context = await runningBrowser.newContext({
        javaScriptEnabled: false,
        serviceWorkers: 'block',
        acceptDownloads: false,
        permissions: [],
      })
      await context.route('**/*', (route) => route.abort('blockedbyclient'))
      const page = await context.newPage()
      try {
        await page.setContent(invoicePdfHtml(invoice), { waitUntil: 'domcontentloaded', timeout: 20_000 })
        const body = await page.pdf({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
        })
        if (body.byteLength > MAX_PDF_BYTES) {
          throw new LanceeCapabilityError('BODY_TOO_LARGE', 'The generated invoice exceeded 10 MB.', 413)
        }
        return body
      } catch (error) {
        if (error instanceof LanceeCapabilityError) throw error
        throw new LanceeCapabilityError('BROWSER_FAILED', 'The invoice renderer could not create the PDF.', 502, { cause: error })
      } finally {
        await context.close().catch(() => {})
      }
    },
    async health() {
      try {
        return { available: Boolean(await browser()) }
      } catch (error) {
        return { available: false, error: error.code || 'BROWSER_UNAVAILABLE' }
      }
    },
    async close() {
      const runningBrowser = await browserPromise?.catch(() => null)
      browserPromise = null
      await runningBrowser?.close().catch(() => {})
    },
  })
}

function createIsolatedBrowserWorker(runAsUser) {
  const childPath = fileURLToPath(new URL('./browser-worker-process.mjs', import.meta.url))
  const pending = new Map()
  let childPromise = null
  let sequence = 0

  function rejectPending(error) {
    for (const request of pending.values()) request.reject(error)
    pending.clear()
  }

  async function child() {
    if (childPromise) return childPromise
    childPromise = new Promise((resolve, reject) => {
      const processHandle = spawn('runuser', [
        '-u',
        runAsUser,
        '--',
        process.execPath,
        childPath,
      ], {
        stdio: ['pipe', 'pipe', 'inherit'],
        env: Object.fromEntries(Object.entries({
          PATH: process.env.PATH,
          HOME: `/home/${runAsUser}`,
          USER: runAsUser,
          LOGNAME: runAsUser,
          NODE_ENV: process.env.NODE_ENV,
          PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
          LANCEE_BROWSER_EXECUTABLE: process.env.LANCEE_BROWSER_EXECUTABLE,
        }).filter(([, value]) => value !== undefined)),
      })
      const lines = createInterface({ input: processHandle.stdout })
      lines.on('line', (line) => {
        let message
        try {
          message = JSON.parse(line)
        } catch {
          return
        }
        const request = pending.get(message.id)
        if (!request) return
        pending.delete(message.id)
        if (message.error) {
          request.reject(new LanceeCapabilityError(
            message.error.code || 'BROWSER_FAILED',
            message.error.message || 'The isolated browser operation failed.',
            message.error.status || 502,
          ))
          return
        }
        const result = message.result || {}
        if (result.bodyBase64) {
          result.body = Buffer.from(result.bodyBase64, 'base64')
          delete result.bodyBase64
        }
        request.resolve(result)
      })
      processHandle.once('spawn', () => resolve(processHandle))
      processHandle.once('error', (error) => {
        childPromise = null
        rejectPending(error)
        reject(new LanceeCapabilityError('BROWSER_UNAVAILABLE', 'The isolated browser worker could not start.', 503))
      })
      processHandle.once('exit', (code) => {
        childPromise = null
        const error = new LanceeCapabilityError(
          'BROWSER_UNAVAILABLE',
          `The isolated browser worker stopped${code === null ? '' : ` with code ${code}`}.`,
          503,
        )
        rejectPending(error)
      })
    })
    return childPromise
  }

  async function invoke(method, url = null, options = {}) {
    const processHandle = await child()
    const id = ++sequence
    return await new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      processHandle.stdin.write(`${JSON.stringify({ id, method, url, options })}\n`, (error) => {
        if (!error) return
        pending.delete(id)
        reject(new LanceeCapabilityError('BROWSER_UNAVAILABLE', 'The isolated browser worker is unavailable.', 503))
      })
    })
  }

  return Object.freeze({
    read: (url, options) => invoke('read', url, options),
    snapshot: (url, options) => invoke('snapshot', url, options),
    screenshot: (url, options) => invoke('screenshot', url, options),
    pdf: (url, options) => invoke('pdf', url, options),
    async renderDocumentPdf({ title, content, style = 'professional' }) {
      const result = await invoke('renderDocumentPdf', null, { title, content, style })
      return result.body
    },
    async renderInvoicePdf(invoice) {
      const result = await invoke('renderInvoicePdf', null, invoice)
      return result.body
    },
    health: () => invoke('health'),
    async close() {
      if (!childPromise) return
      try {
        const processHandle = await childPromise
        await invoke('close').catch(() => {})
        processHandle.stdin.end()
      } finally {
        childPromise = null
      }
    },
  })
}

export function createBrowserWorker(options = {}) {
  const runAsUser = options.runAsUser === undefined
    ? process.env.LANCEE_BROWSER_RUN_AS_USER
    : options.runAsUser
  const canIsolate = Boolean(runAsUser) && process.platform === 'linux' && process.getuid?.() === 0 &&
    options.chromiumImpl === undefined && options.requestImpl === undefined && options.dnsLookup === undefined
  return canIsolate
    ? createIsolatedBrowserWorker(String(runAsUser))
    : createLocalBrowserWorker(options)
}
