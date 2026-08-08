import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { chromium } from 'playwright'
import { requestPublicResource, validatePublicUrl } from './capabilities/network.mjs'
import { LanceeCapabilityError } from './capabilities/registry.mjs'

const MAX_RESOURCE_BYTES = 1_000_000
const MAX_TOTAL_BYTES = 5_000_000
const MAX_REQUESTS = 50
const MAX_SCREENSHOT_BYTES = 5_000_000

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
