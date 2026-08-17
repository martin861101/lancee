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

function professionalPdfHtml({ title, content }) {
  const safeTitle = String(title || '').trim() || 'Lancee report'
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
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 18mm 17mm 20mm; }
    * { box-sizing: border-box; }
    html { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    body { margin: 0; color: #243147; font: 10.2pt/1.55 Arial, Helvetica, sans-serif; }
    .page-border { position: fixed; z-index: -1; inset: -10mm -9mm -12mm; border: 1.5px solid #2f6fed; border-top-width: 7px; border-radius: 4px; }
    .brand { color: #2f6fed; font-size: 8pt; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase; }
    .title-card { margin: 5mm 0 9mm; padding: 9mm 10mm; color: #fff; background: linear-gradient(135deg, #17315f, #2f6fed); border-left: 5px solid #6ee7d8; border-radius: 8px; }
    .title-card h1 { margin: 0; color: #fff; font-size: 25pt; line-height: 1.12; letter-spacing: -.35px; }
    .title-card p { margin: 4mm 0 0; color: #dbeafe; font-size: 9pt; }
    h1, h2, h3, h4 { break-after: avoid; color: #17315f; line-height: 1.2; }
    h1 { margin: 8mm 0 3mm; padding-bottom: 2.5mm; font-size: 19pt; border-bottom: 2px solid #6ee7d8; }
    h2 { margin: 7mm 0 3mm; padding-left: 3mm; font-size: 14pt; border-left: 4px solid #2f6fed; }
    h3 { margin: 5mm 0 2mm; color: #2f6fed; font-size: 11.5pt; }
    h4 { margin: 4mm 0 2mm; font-size: 10.5pt; }
    p { margin: 0 0 3.3mm; orphans: 3; widows: 3; }
    ul, ol { margin: 2mm 0 4mm; padding-left: 7mm; }
    li { margin: 1.4mm 0; padding-left: 1.5mm; }
    li::marker { color: #2f6fed; font-weight: 700; }
    strong { color: #17315f; }
    a { color: #245dc1; text-decoration: none; word-break: break-word; }
    blockquote { margin: 5mm 0; padding: 4mm 5mm; color: #334a68; background: #eef5ff; border-left: 4px solid #6ee7d8; border-radius: 0 6px 6px 0; }
    code { padding: 1px 4px; color: #17315f; background: #eef2f7; border-radius: 3px; font: 8.5pt Consolas, monospace; }
    pre { overflow: hidden; padding: 4mm; color: #e5eefc; background: #172235; border-radius: 6px; white-space: pre-wrap; }
    pre code { padding: 0; color: inherit; background: transparent; }
    table { width: 100%; margin: 5mm 0; border-collapse: collapse; break-inside: avoid; font-size: 8.7pt; }
    th { padding: 2.6mm; color: #fff; background: #2f6fed; text-align: left; }
    td { padding: 2.4mm; border: 1px solid #cbd8ea; vertical-align: top; }
    tr:nth-child(even) td { background: #f5f8fc; }
    hr { margin: 7mm 0; border: 0; border-top: 1px solid #b9c9de; }
  </style></head><body><div class="page-border"></div><div class="brand">Lancee · Executive document</div><header class="title-card"><h1>${escapeHtml(safeTitle)}</h1><p>Prepared ${escapeHtml(new Date().toISOString().slice(0, 10))}</p></header><main>${body}</main></body></html>`
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
    async renderDocumentPdf({ title, content }) {
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
        await page.setContent(professionalPdfHtml({ title, content }), { waitUntil: 'domcontentloaded', timeout: 20_000 })
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
    async renderDocumentPdf({ title, content }) {
      const result = await invoke('renderDocumentPdf', null, { title, content })
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
