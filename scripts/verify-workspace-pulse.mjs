import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createWorkspacePulseService,
  pulseMoodForWeather,
} from '../server/workspace-pulse.mjs'

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const serverSource = readFileSync(new URL('../server/index.mjs', import.meta.url), 'utf8')
const pulseSource = readFileSync(new URL('../server/workspace-pulse.mjs', import.meta.url), 'utf8')

assert.match(appSource, /localWorkspacePulse/)
assert.match(appSource, /api\.workspace\.getPulse\(\)/)
assert.match(cssSource, /url\('\/img\/sunny\.png'\)/)
assert.match(cssSource, /prefers-reduced-motion: reduce/)
assert.match(serverSource, /app\.get\('\/api\/workspace\/pulse', requireAuth/)
assert.equal(pulseSource.includes('agent-runtime'), false)
assert.equal(pulseSource.includes('completeHermes'), false)

const weather = (weatherCode, isDay = true) => ({ weatherCode, isDay })
assert.equal(pulseMoodForWeather(weather(0)), 'sunny')
assert.equal(pulseMoodForWeather(weather(3)), 'cloudy')
assert.equal(pulseMoodForWeather(weather(61)), 'rainy')
assert.equal(pulseMoodForWeather(weather(95)), 'stormy')
assert.equal(pulseMoodForWeather(weather(73)), 'snowy')
assert.equal(pulseMoodForWeather(weather(0, false)), 'clear-night')
assert.equal(pulseMoodForWeather(weather(3, false)), 'cloudy-night')
assert.equal(pulseMoodForWeather(null), 'steady')

function fakeDatabase() {
  return {
    async listProjects(workspaceId) {
      return workspaceId === 'wsp_busy'
        ? [{ id: 'prj_1', name: 'Launch refresh', client: 'Northstar', due: '2026-08-21', status: 'In progress' }]
        : []
    },
    async listInvoices(workspaceId) {
      return workspaceId === 'wsp_busy'
        ? [{ id: 'inv_1', status: 'overdue' }]
        : []
    },
    async listAutomationRuns(workspaceId) {
      return workspaceId === 'wsp_busy'
        ? [{ id: 'run_1', status: 'completed', startedAt: '2026-08-20T12:00:00.000Z', automationName: 'Client update' }]
        : []
    },
    async listWorkspaceNotifications() {
      return []
    },
    async listProjectTasks(workspaceId) {
      return workspaceId === 'wsp_busy'
        ? [{ id: 'tsk_1', projectId: 'prj_1', title: 'Send final proof', completed: false }]
        : []
    },
  }
}

let currentTime = new Date('2026-08-21T09:00:00.000Z')
let completions = 0
const database = fakeDatabase()
const complete = async ({ messages, systemPrompt }) => {
  completions += 1
  assert.match(systemPrompt, /Use only the supplied facts/)
  const supplied = JSON.parse(messages[0].content)
  return {
    content: JSON.stringify({
      headline: '<b>A clear plan for Martin.</b>',
      message: `You have ${supplied.workspace.activeProjects} active project and a useful next step ready.`,
      mood: supplied.expectedMood,
    }),
  }
}
const service = createWorkspacePulseService({ database, complete, now: () => currentTime })
const input = {
  workspaceId: 'wsp_busy',
  userId: 'usr_1',
  userName: 'Martin Example',
  workspaceContext: {
    location: { city: 'Cape Town', country: 'South Africa', timezone: 'UTC' },
    weather: weather(0),
  },
}

const immediate = await service.get(input)
assert.equal(immediate.source, 'fallback')
assert.equal(immediate.refreshPending, true)
assert.equal(immediate.items[0].target, 'work')
await service.refresh(input)

const cached = await service.get(input)
assert.equal(cached.source, 'ai')
assert.equal(cached.refreshPending, false)
assert.equal(cached.headline, 'A clear plan for Martin.')
assert.equal(completions, 1)

const cachedAgain = await service.get(input)
assert.equal(cachedAgain.source, 'ai')
assert.equal(completions, 1)

currentTime = new Date('2026-08-21T10:31:00.000Z')
const expired = await service.get(input)
assert.equal(expired.source, 'fallback')

const unavailable = createWorkspacePulseService({
  database,
  complete: async () => { throw new Error('AI unavailable') },
  now: () => new Date('2026-08-21T09:00:00.000Z'),
})
const unavailablePulse = await unavailable.get({ ...input, userId: 'usr_2' })
assert.equal(unavailablePulse.source, 'fallback')
await unavailable.refresh({ ...input, userId: 'usr_2' })

const malformed = createWorkspacePulseService({
  database,
  complete: async () => ({ content: '{"headline":"Missing fields"}' }),
  now: () => new Date('2026-08-21T09:00:00.000Z'),
})
const malformedInput = { ...input, workspaceId: 'wsp_empty', userId: 'usr_3' }
const malformedPulse = await malformed.get(malformedInput)
await malformed.refresh(malformedInput)
assert.equal(malformedPulse.source, 'fallback')
assert.equal((await malformed.get(malformedInput)).source, 'fallback')

const isolatedInput = { ...input, workspaceId: 'wsp_other', userId: 'usr_1' }
assert.equal((await service.get(isolatedInput)).source, 'fallback')

console.log('Workspace Pulse verified: instant fallback, bounded AI copy, weather states, cache expiry, tenant isolation, malformed output, and AI failure.')
