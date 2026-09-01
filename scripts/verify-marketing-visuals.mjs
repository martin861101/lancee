import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'
import sharp from 'sharp'

const root = resolve(import.meta.dirname, '..')
const baselineDirectory = resolve(root, 'test-data/visual-regression')
const update = process.argv.includes('--update')
const port = Number(process.env.LANCEE_VISUAL_PORT || 5193)
const suppliedBaseUrl = process.env.LANCEE_VISUAL_BASE_URL
const baseUrl = suppliedBaseUrl || `http://127.0.0.1:${port}`
const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]
const layoutViewports = [
  { name: 'laptop', width: 1280, height: 900 },
  { name: 'tablet-wide', width: 1024, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
]
const pages = [
  { name: 'landing', path: '/' },
  { name: 'features', path: '/', openFeatures: true },
  { name: 'pricing', path: '/pricing' },
  { name: 'login', path: '/signin' },
  { name: 'signup', path: '/signup' },
]
const pricingFixture = {
  region: 'OTHER',
  currency: 'USD',
  symbol: '$',
  trialDays: 14,
  plans: [
    { id: 'visual-solo', planCode: 'solo', name: 'Solo', region: 'OTHER', currency: 'USD', symbol: '$', monthlyPrice: 19, yearlyPrice: 190, perUser: false, recommended: false, sortOrder: 1 },
    { id: 'visual-pro', planCode: 'pro', name: 'Pro', region: 'OTHER', currency: 'USD', symbol: '$', monthlyPrice: 39, yearlyPrice: 390, perUser: false, recommended: true, sortOrder: 2 },
    { id: 'visual-studio', planCode: 'studio', name: 'Studio', region: 'OTHER', currency: 'USD', symbol: '$', monthlyPrice: 69, yearlyPrice: 690, perUser: true, recommended: false, sortOrder: 3 },
  ],
}
const requiredCapabilityTitles = [
  'Overview dashboard', 'Client directory', 'Kanban project workspaces', 'Ideas canvas',
  'Files & document library', 'Team & roles', 'ZAR invoices', 'Paystack payment links',
  'Approval-to-invoice flow', 'Money analytics', 'Core automations', 'Edge (n8n) automations',
  'Runs & results', 'Workflow templates', 'Mail-triggered rules', 'Google Drive', 'n8n',
  'Storefront', 'Local Lancee MCP', 'Integration catalog', 'Workspace AI assistant', 'PDF Studio',
  'Client review links', 'Artwork annotations', 'Designer review panel', 'Workspace notifications',
  'Server-side security', 'Encrypted secrets & API keys', 'PWA & offline ideas', 'Durable backend',
]

let server

async function waitForServer(url) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // The Vite process is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function startServer() {
  if (suppliedBaseUrl) return
  server = spawn(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)],
    { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let startupError = ''
  server.stderr.on('data', (chunk) => { startupError += String(chunk) })
  server.on('exit', (code) => {
    if (code && code !== 0) startupError ||= `Vite exited with ${code}`
  })
  try {
    await waitForServer(baseUrl)
  } catch (error) {
    throw new Error(`${error.message}${startupError ? `\n${startupError}` : ''}`)
  }
}

async function pixelDifferenceRatio(reference, actual) {
  const referenceImage = sharp(reference)
  const actualImage = sharp(actual)
  const [referenceMetadata, actualMetadata] = await Promise.all([
    referenceImage.metadata(),
    actualImage.metadata(),
  ])
  if (
    referenceMetadata.width !== actualMetadata.width ||
    referenceMetadata.height !== actualMetadata.height
  ) return 1

  const [{ data: referencePixels }, { data: actualPixels }] = await Promise.all([
    referenceImage.removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    actualImage.removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ])
  let changedPixels = 0
  const pixelCount = referencePixels.length / 3
  for (let offset = 0; offset < referencePixels.length; offset += 3) {
    const difference = Math.max(
      Math.abs(referencePixels[offset] - actualPixels[offset]),
      Math.abs(referencePixels[offset + 1] - actualPixels[offset + 1]),
      Math.abs(referencePixels[offset + 2] - actualPixels[offset + 2]),
    )
    if (difference > 24) changedPixels += 1
  }
  return changedPixels / pixelCount
}

await mkdir(baselineDirectory, { recursive: true })
await startServer()

const browser = await chromium.launch({ headless: true })
const failures = []

try {
  for (const viewport of viewports) {
    for (const pageSpec of pages) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      })
      const consoleErrors = []
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text())
      })
      await page.route('**/api/auth/config', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ registrationEnabled: true }),
      }))
      await page.route('**/api/pricing*', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(pricingFixture),
      }))
      await page.goto(`${baseUrl}${pageSpec.path}`, { waitUntil: 'domcontentloaded' })
      if (pageSpec.openFeatures) {
        if (viewport.width < 768) {
          await page.getByRole('button', { name: 'Open navigation menu' }).click()
        }
        await page.getByRole('button', { name: 'Features', exact: true }).click()
      }
      await page.addStyleTag({ content: `
        *, *::before, *::after {
          animation-delay: 0s !important;
          animation-duration: 0s !important;
          caret-color: transparent !important;
          scroll-behavior: auto !important;
          transition: none !important;
        }
        [data-feature-story] { opacity: 1 !important; transform: none !important; }
      ` })
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(150)

      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }))
      if (overflow.scrollWidth > overflow.clientWidth + 1) {
        failures.push(`${pageSpec.name}/${viewport.name}: horizontal overflow ${overflow.scrollWidth - overflow.clientWidth}px`)
      }
      if (consoleErrors.length) {
        failures.push(`${pageSpec.name}/${viewport.name}: console errors: ${consoleErrors.join(' | ')}`)
      }
      if (pageSpec.name === 'features' && viewport.name === 'desktop') {
        const pageText = await page.locator('body').textContent() || ''
        const missingTitles = requiredCapabilityTitles.filter((title) => !pageText.includes(title))
        if (missingTitles.length) failures.push(`features/desktop: missing capabilities: ${missingTitles.join(', ')}`)
      }

      const screenshot = await page.screenshot({ fullPage: true, animations: 'disabled' })
      const baselinePath = resolve(baselineDirectory, `${pageSpec.name}-${viewport.name}.png`)
      if (update) {
        await mkdir(dirname(baselinePath), { recursive: true })
        await writeFile(baselinePath, screenshot)
      } else {
        try {
          const baseline = await readFile(baselinePath)
          const difference = await pixelDifferenceRatio(baseline, screenshot)
          if (difference > 0.008) {
            failures.push(`${pageSpec.name}/${viewport.name}: ${(difference * 100).toFixed(2)}% of pixels changed`)
          }
        } catch (error) {
          if (error?.code === 'ENOENT') {
            failures.push(`${pageSpec.name}/${viewport.name}: baseline missing; run npm run update:marketing-visuals`)
          } else {
            throw error
          }
        }
      }
      await page.close()
    }
  }

  for (const viewport of layoutViewports) {
    for (const pageSpec of pages) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      })
      await page.route('**/api/auth/config', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ registrationEnabled: true }),
      }))
      await page.route('**/api/pricing*', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(pricingFixture),
      }))
      await page.goto(`${baseUrl}${pageSpec.path}`, { waitUntil: 'domcontentloaded' })
      if (pageSpec.openFeatures) {
        if (viewport.width <= 1100) {
          await page.getByRole('button', { name: 'Open navigation menu' }).click()
        }
        await page.getByRole('button', { name: 'Features', exact: true }).click()
      }
      await page.evaluate(() => document.fonts.ready)
      const layout = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }))
      if (layout.scrollWidth > layout.clientWidth + 1) {
        failures.push(`${pageSpec.name}/${viewport.name}: horizontal overflow ${layout.scrollWidth - layout.clientWidth}px`)
      }
      await page.close()
    }
  }
} finally {
  await browser.close()
  if (server && !server.killed) server.kill('SIGTERM')
}

if (failures.length) {
  console.error(`Marketing visual verification failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

console.log(`${update ? 'Updated' : 'Verified'} 10 marketing/auth screenshots and 15 responsive layouts with no overflow or console errors.`)
