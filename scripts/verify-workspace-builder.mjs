import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildWorkspaceRecommendation,
  normalizeBuilderAnswers,
  normalizeGenerationSelection,
} from '../server/workspace-builder.mjs'

const answers = normalizeBuilderAnswers({
  business: {
    name: 'Builder Verification Studio',
    industry: 'Creative agency',
    size: '2-5',
    country: 'South Africa',
    timezone: 'Africa/Johannesburg',
  },
  activities: ['projects', 'clients', 'documents', 'invalid-activity'],
  tools: ['gmail', 'drive'],
  people: ['clients', 'contractors'],
  inviteTeam: true,
  processes: {
    clientApprovals: true,
    meetings: true,
    documents: true,
  },
  uniqueRequirements: 'Two approvals are required before completion.',
  sampleData: false,
})

assert.deepEqual(answers.activities, ['projects', 'clients', 'documents'])
const deterministicRecommendation = buildWorkspaceRecommendation(answers)
assert(deterministicRecommendation.modules.includes('dashboard'))
assert(deterministicRecommendation.modules.includes('annotations'))
assert(deterministicRecommendation.modules.includes('approvals'))
assert(deterministicRecommendation.automations.some((item) => item.id === 'approval-notification'))
const normalizedSelection = normalizeGenerationSelection({
  modules: ['projects', 'not-a-module'],
  integrations: ['drive', 'not-an-integration'],
  automationIds: ['approval-notification', 'not-an-automation'],
}, deterministicRecommendation)
assert.deepEqual(normalizedSelection.modules, ['dashboard', 'projects'])
assert.deepEqual(normalizedSelection.integrations, ['drive'])
assert.deepEqual(normalizedSelection.automationIds, ['approval-notification'])

const projectDirectory = new URL('..', import.meta.url).pathname
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'lancee-builder-'))
const databasePath = join(temporaryDirectory, 'lancee.sqlite')
const password = 'builder-verification-password'
const passwordSalt = 'builder-verification-salt'
const passwordHash = scryptSync(password, passwordSalt, 64).toString('hex')
const adminEmail = 'workspace-builder@example.com'

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
    cwd: projectDirectory,
    env: {
      ...process.env,
      APP_ENV: 'development',
      PORT: String(port),
      PUBLIC_ORIGIN: origin,
      DATABASE_PATH: databasePath,
      SESSION_SECRET: 'workspace-builder-session-secret-with-sufficient-entropy',
      ADMIN_NAME: 'Builder Owner',
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD_SALT: passwordSalt,
      ADMIN_PASSWORD_HASH: passwordHash,
      WORKSPACE_ID: 'wsp_builder_verification',
      WORKSPACE_NAME: 'Original Builder Workspace',
      AI_PROVIDER: 'openai',
      AI_API_KEY: '',
      HERMES_ENDPOINT_URL: '',
      HERMES_API_KEY: '',
      SMTP_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => output.push(chunk.toString()))
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Application exited before startup:\n${output.join('')}`)
    try {
      const response = await fetch(`${origin}/api/health`)
      if (response.ok) return { child, origin, output }
    } catch {
      // Startup is still in progress.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  child.kill('SIGTERM')
  throw new Error(`Application did not become healthy:\n${output.join('')}`)
}

async function stopApplication(application) {
  if (!application || application.child.exitCode !== null) return
  application.child.kill('SIGTERM')
  await once(application.child, 'exit')
}

async function request(origin, cookie, path, options = {}) {
  return fetch(`${origin}${path}`, {
    ...options,
    headers: {
      Cookie: cookie,
      Origin: origin,
      ...(options.headers || {}),
    },
  })
}

let application
try {
  application = await startApplication()
  const login = await fetch(`${application.origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: application.origin },
    body: JSON.stringify({ email: adminEmail, password }),
  })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0]
  assert(cookie)

  const initialResponse = await request(application.origin, cookie, '/api/workspace-builder')
  assert.equal(initialResponse.status, 200)
  const initial = await initialResponse.json()
  assert.equal(initial.state.requiredSetup, false)
  assert(initial.catalog.modules.some((item) => item.id === 'projects'))

  const draftResponse = await request(application.origin, cookie, '/api/workspace-builder/draft', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'builder-draft-0001' },
    body: JSON.stringify({ answers, step: 5 }),
  })
  assert.equal(draftResponse.status, 200)

  const logoBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  )
  const logoResponse = await request(application.origin, cookie, '/api/workspace/logo', {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png', 'Idempotency-Key': 'builder-logo-0001' },
    body: logoBytes,
  })
  assert.equal(logoResponse.status, 200)
  assert.match((await logoResponse.json()).logoUrl, /^data:image\/png;base64,/)

  const recommendationResponse = await request(application.origin, cookie, '/api/workspace-builder/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'builder-recommend-0001' },
    body: JSON.stringify({ answers }),
  })
  assert.equal(recommendationResponse.status, 200)
  const recommendationPayload = await recommendationResponse.json()
  assert.equal(recommendationPayload.state.status, 'review')
  assert(recommendationPayload.state.recommendation.modules.includes('projects'))

  const aiResponse = await request(application.origin, cookie, '/api/workspace-builder/ai-suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'builder-ai-0001' },
    body: JSON.stringify({ requirement: answers.uniqueRequirements }),
  })
  assert.equal(aiResponse.status, 200)
  const aiPayload = await aiResponse.json()
  assert.equal(aiPayload.aiAvailable, false)

  const selection = {
    modules: recommendationPayload.state.recommendation.modules,
    integrations: recommendationPayload.state.recommendation.integrations,
    automationIds: recommendationPayload.state.recommendation.automations.map((item) => item.id),
    aiSuggestionIds: [],
  }
  const generationResponse = await request(application.origin, cookie, '/api/workspace-builder/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'builder-generate-0001' },
    body: JSON.stringify({ selection }),
  })
  assert.equal(generationResponse.status, 201)
  const generated = await generationResponse.json()
  assert.equal(generated.state.status, 'completed')
  assert.equal(generated.state.requiredSetup, false)
  assert(generated.state.generated.modules.includes('dashboard'))

  const replayResponse = await request(application.origin, cookie, '/api/workspace-builder/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'builder-generate-0001' },
    body: JSON.stringify({ selection }),
  })
  assert.equal(replayResponse.status, 201)
  assert.equal(replayResponse.headers.get('idempotency-replayed'), 'true')
  assert.equal((await replayResponse.json()).state.completedAt, generated.state.completedAt)

  const settingsResponse = await request(application.origin, cookie, '/api/workspace/settings')
  assert.equal(settingsResponse.status, 200)
  const settings = await settingsResponse.json()
  assert.equal(settings.name, answers.business.name)
  assert.match(settings.logoUrl, /^data:image\/png;base64,/)

  const settingsUpdateResponse = await request(application.origin, cookie, '/api/workspace/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'builder-settings-0001' },
    body: JSON.stringify({ travelLocation: 'Cape Town' }),
  })
  assert.equal(settingsUpdateResponse.status, 200)

  const automationsResponse = await request(application.origin, cookie, '/api/automations')
  assert.equal(automationsResponse.status, 200)
  const automations = (await automationsResponse.json()).automations
  assert(automations.length > 0)
  assert(automations.every((automation) => automation.status === 'draft'))

  console.log('Workspace builder verification passed.')
} finally {
  await stopApplication(application)
  await rm(temporaryDirectory, { recursive: true, force: true })
}
