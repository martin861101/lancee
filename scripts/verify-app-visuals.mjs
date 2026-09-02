import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const root = resolve(import.meta.dirname, '..')
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'lancee-app-visuals-'))
const databasePath = join(temporaryDirectory, 'lancee.sqlite')
const outputDirectory = resolve(process.env.LANCEE_APP_VISUAL_OUTPUT || join(tmpdir(), 'lancee-app-visuals'))
const password = 'lancee-visual-password'
const passwordSalt = 'lancee-visual-salt'
const passwordHash = scryptSync(password, passwordSalt, 64).toString('hex')
const adminEmail = 'martin@hookitupservices.com'

const routes = [
  ['home', '/dashboard'],
  ['clients', '/dashboard/clients'],
  ['projects', '/dashboard/work'],
  ['ideas', '/dashboard/ideas'],
  ['files', '/dashboard/files'],
  ['messages', '/dashboard/messages'],
  ['diary', '/dashboard/dairy'],
  ['automations', '/dashboard/automations'],
  ['invoicing', '/dashboard/money'],
  ['intelligence', '/dashboard/intelligence'],
  ['team', '/dashboard/team'],
  ['preferences', '/dashboard/settings'],
  ['admin', '/dashboard/admin'],
]

const viewports = [
  { name: 'mobile-360', width: 360, height: 800, screenshot: false },
  { name: 'mobile-390', width: 390, height: 844, screenshot: true },
  { name: 'tablet', width: 768, height: 1024, screenshot: false },
  { name: 'small-desktop', width: 1024, height: 800, screenshot: false },
  { name: 'desktop', width: 1440, height: 900, screenshot: true },
  { name: 'large-desktop', width: 1920, height: 1080, screenshot: false },
]

async function availablePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert(address && typeof address === 'object')
  server.close()
  await once(server, 'close')
  return address.port
}

async function startApplication() {
  const port = await availablePort()
  const origin = `http://127.0.0.1:${port}`
  const output = []
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      APP_ENV: 'development',
      PORT: String(port),
      PUBLIC_ORIGIN: origin,
      DATABASE_PATH: databasePath,
      SESSION_SECRET: 'lancee-visual-session-secret-with-sufficient-entropy',
      ADMIN_NAME: 'Visual QA Owner',
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD_SALT: passwordSalt,
      ADMIN_PASSWORD_HASH: passwordHash,
      WORKSPACE_ID: 'wsp_visual_qa',
      WORKSPACE_NAME: 'Lancee Visual QA',
      ALLOW_REGISTRATION: 'true',
      SMTP_ENABLED: 'false',
      PAYSTACK_SECRET_KEY: '',
      OPENCONNECTOR_URL: '',
      LIVEKIT_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => output.push(String(chunk)))
  child.stderr.on('data', (chunk) => output.push(String(chunk)))

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Application exited before startup:\n${output.join('')}`)
    try {
      const response = await fetch(`${origin}/api/health`)
      if (response.ok) return { child, origin, output }
    } catch {
      // Server is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
  }
  child.kill('SIGTERM')
  throw new Error(`Application did not become healthy:\n${output.join('')}`)
}

async function stopApplication(application) {
  if (!application || application.child.exitCode !== null) return
  application.child.kill('SIGTERM')
  await once(application.child, 'exit')
}

async function inspectLayout(page) {
  return page.evaluate(() => {
    const root = document.documentElement
    const viewportWidth = root.clientWidth
    const viewportHeight = root.clientHeight
    const contentControls = Array.from(document.querySelectorAll(
      '.topbar button, .topbar a, .content button, .content a, .content input, .content select, .content textarea',
    ))
    const clippedControls = contentControls.flatMap((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0 ||
        rect.width < 1 ||
        rect.height < 1 ||
        rect.bottom <= 0 ||
        rect.top >= viewportHeight
      ) return []
      if (rect.left >= -1 && rect.right <= viewportWidth + 1) return []
      const label = element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName
      return [`${label.slice(0, 80)} (${Math.round(rect.left)}..${Math.round(rect.right)})`]
    })
    const smallTouchTargets = viewportWidth <= 430
      ? contentControls.flatMap((element) => {
          const style = getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            rect.width < 1 ||
            rect.height < 1 ||
            rect.bottom <= 0 ||
            rect.top >= viewportHeight ||
            rect.left < 0 ||
            rect.right > viewportWidth
          ) return []
          if (rect.width >= 36 && rect.height >= 36) return []
          const label = element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName
          return [`${label.slice(0, 80)} (${Math.round(rect.width)}x${Math.round(rect.height)})`]
        })
      : []
    return {
      clientWidth: viewportWidth,
      scrollWidth: root.scrollWidth,
      clippedControls: clippedControls.slice(0, 12),
      smallTouchTargets: smallTouchTargets.slice(0, 12),
      hasMainContent: Boolean(document.querySelector('.app-shell .content')),
      title: document.title,
    }
  })
}

await mkdir(outputDirectory, { recursive: true })
let application
let browser
const failures = []
const warnings = []

try {
  application = await startApplication()
  browser = await chromium.launch({ headless: true })

  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    const consoleErrors = []
    const pageErrors = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await page.goto(`${application.origin}/signin`, { waitUntil: 'domcontentloaded' })
    await page.getByLabel('Email address').fill(adminEmail)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL(/\/dashboard(?:\/|$)/, { timeout: 15_000 })

    for (const [name, path] of routes) {
      consoleErrors.length = 0
      pageErrors.length = 0
      await page.goto(`${application.origin}${path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.app-shell .content', { timeout: 15_000 })
      await page.waitForTimeout(500)
      const layout = await inspectLayout(page)
      const key = `${name}/${viewport.name}`
      if (!layout.hasMainContent) failures.push(`${key}: application content did not render`)
      if (layout.scrollWidth > layout.clientWidth + 1) {
        failures.push(`${key}: horizontal overflow ${layout.scrollWidth - layout.clientWidth}px`)
      }
      if (layout.clippedControls.length) {
        failures.push(`${key}: clipped controls: ${layout.clippedControls.join(' | ')}`)
      }
      if (pageErrors.length) failures.push(`${key}: page errors: ${pageErrors.join(' | ')}`)
      if (consoleErrors.length) failures.push(`${key}: console errors: ${consoleErrors.join(' | ')}`)
      if (layout.smallTouchTargets.length) {
        warnings.push(`${key}: compact visible targets: ${layout.smallTouchTargets.join(' | ')}`)
      }
      if (viewport.screenshot) {
        await page.screenshot({
          path: join(outputDirectory, `${name}-${viewport.name}.png`),
          fullPage: false,
          animations: 'disabled',
        })
      }
    }
    await context.close()
  }
} finally {
  if (browser) await browser.close()
  await stopApplication(application)
  await rm(temporaryDirectory, { recursive: true, force: true })
}

if (warnings.length) {
  console.warn(`App visual verification warnings:\n- ${warnings.join('\n- ')}`)
}
if (failures.length) {
  console.error(`App visual verification failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

console.log(`Verified ${routes.length} authenticated routes across ${viewports.length} responsive viewports. Screenshots: ${outputDirectory}`)
