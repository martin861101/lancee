import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/database.mjs'

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const analyticsSource = readFileSync(new URL('../src/components/dashboard/AnalyticsPage.tsx', import.meta.url), 'utf8')
const intelligenceSource = readFileSync(new URL('../src/components/dashboard/IntelligencePage.tsx', import.meta.url), 'utf8')
const serverSource = readFileSync(new URL('../server/index.mjs', import.meta.url), 'utf8')

for (const expected of [
  "label: 'Automations & Workflows'",
  "label: 'Connected Apps'",
  "label: 'Preferences'",
  "analytics: 'intelligence'",
  "workflows: 'automations'",
  "services: 'integrations'",
  'connected-apps-diagram',
  'Clear all',
  "api.notifications.clear()",
]) assert.match(appSource, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

for (const absent of [
  "label: 'Results'",
  "label: 'Storefront'",
  "label: 'Analytics'",
  "label: 'Services'",
  "label: 'Workflows'",
]) assert.equal(appSource.includes(absent), false, `${absent} must not be in workspace navigation`)

assert.match(analyticsSource, /embedded = false/)
assert.match(intelligenceSource, /<AnalyticsPage embedded \/>/)
assert.equal(analyticsSource.includes('Export JSON'), false)
assert.equal(analyticsSource.includes('Cloud files'), false)
assert.match(serverSource, /app\.delete\('\/api\/notifications'/)

const directory = mkdtempSync(join(tmpdir(), 'lancee-ui-fixes-'))
try {
  const database = await openDatabase({
    databasePath: join(directory, 'ui-fixes.sqlite'),
    adminEmail: 'ui-fixes@example.test',
    adminName: 'UI Fixes Test',
    adminPasswordSalt: 'ui-fixes-salt',
    adminPasswordHash: 'ui-fixes-hash',
    workspaceId: 'wsp_ui_fixes',
    workspaceName: 'UI Fixes',
  })
  const context = await database.getContextByEmail('ui-fixes@example.test')
  await database.createWorkspaceNotification({
    workspaceId: context.workspace.id,
    kind: 'automation.completed',
    title: 'Automation complete',
    body: 'The workspace-scoped test routine completed.',
  })
  assert.equal((await database.listWorkspaceNotifications(context.workspace.id)).length, 1)
  assert.equal(await database.clearWorkspaceNotifications(context.workspace.id), 1)
  assert.equal((await database.listWorkspaceNotifications(context.workspace.id)).length, 0)
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('UI fixes verified: consolidated navigation, Intelligence analytics, Connected Apps diagram, and workspace-scoped notification clearing.')
