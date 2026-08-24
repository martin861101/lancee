import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const page = read('../src/components/intelligence/ConnectedIntelligencePage.tsx')
const briefing = read('../src/components/intelligence/IntelligenceBriefing.tsx')
const presentation = read('../src/components/intelligence/connected-intelligence-presentation.ts')
const card = read('../src/components/intelligence/FindingCard.tsx')
const findings = read('../src/components/intelligence/FindingsView.tsx')
const drawer = read('../src/components/intelligence/FindingExplanationDrawer.tsx')
const activity = read('../src/components/intelligence/LanceeActivity.tsx')
const inspection = read('../src/components/intelligence/InspectionActivity.tsx')
const avatar = read('../src/components/intelligence/LanceeAvatar.tsx')
const tabs = read('../src/components/intelligence/IntelligenceViewTabs.tsx')
const css = read('../src/components/intelligence/connected-intelligence.css')
const app = read('../src/App.tsx')
const currentUi = [page, briefing, presentation, card, findings, drawer, activity, inspection, avatar, tabs].join('\n')

for (const expected of [
  "summary.status === 'attention_needed'",
  'Here’s what I’ve noticed',
  "avatar: 'insight'",
  'Things I’ve noticed',
]) assert(currentUi.includes(expected), `Missing attention-needed UI contract: ${expected}`)

for (const expected of [
  "summary.status === 'all_clear'",
  'Everything looks good',
  "avatar: 'all-clear'",
  'Nothing needs your attention right now',
]) assert(currentUi.includes(expected), `Missing all-clear UI contract: ${expected}`)

for (const expected of [
  "avatar: 'investigate'",
  'I’m still getting the picture',
  'There isn’t enough recent workspace activity yet',
]) assert(currentUi.includes(expected), `Missing insufficient-activity UI contract: ${expected}`)
assert.equal(findings.includes("insufficient ? 'I’m still getting the picture' : 'Nothing needs your attention right now'"), true)

for (const expected of [
  'needs more attention than usual',
  'has had more meeting activity than usual',
  'What stood out',
  'Why this may matter',
]) assert(currentUi.includes(expected), `Missing human finding presentation: ${expected}`)
for (const hiddenByDefault of ['percentile', 'threshold', 'detector', 'comparison set', 'confidence']) {
  assert.equal(card.toLowerCase().includes(hiddenByDefault), false, `${hiddenByDefault} must not lead finding cards`)
}

for (const expected of [
  'Why Lancee noticed this',
  'Things you could check',
  'View technical evidence',
  'Authoritative relationship',
  'Observed workspace records',
  'Workspace comparison set',
  'Detector condition',
  'Supporting workspace events',
  'Detector identifier',
]) assert(drawer.includes(expected), `Missing progressive evidence state: ${expected}`)

for (const expected of [
  'api.connectedIntelligence.activity({ limit: 50, offset: 0 })',
  'api.connectedIntelligence.activityById(activity.id)',
  'Lancee activity',
  'See what Lancee checked',
  'View finding',
  "activity.status === 'opportunity_created'",
  "activity.type === 'mail'",
  "activity.type === 'calendar'",
  "activity.type === 'cross_source'",
]) assert(currentUi.includes(expected), `Missing persisted activity UI contract: ${expected}`)
assert.equal(currentUi.includes('Decision Intelligence history'), false)
assert.equal(currentUi.includes('Decision Intelligence History'), false)
assert.match(inspection, /value > 0/)
assert.match(inspection, /activityCountLabels\[key\]/)

for (const [state, path] of Object.entries({
  mail: '/img/lancee/lancee_mail.png',
  calendar: '/img/lancee/lancee_calendar.png',
  investigate: '/img/lancee/lancee_inspect.png',
  insight: '/img/lancee/lancee_idea.png',
  connected: '/img/lancee/lancee_tools.png',
  'all-clear': '/img/lancee/lancee_allclear.png',
})) {
  assert(avatar.includes(`${state.includes('-') ? `'${state}'` : state}: '${path}'`), `Missing ${state} avatar mapping`)
  assert(existsSync(new URL(`../public${path}`, import.meta.url)), `Missing supplied avatar asset: ${path}`)
}

for (const expected of [
  'role="tablist"',
  'aria-selected',
  "event.key === 'ArrowRight'",
  "event.key === 'ArrowLeft'",
  'aria-expanded={expanded}',
  'aria-modal="true"',
]) assert(currentUi.includes(expected), `Missing accessibility contract: ${expected}`)
for (const expected of [
  '@media (max-width: 760px)',
  '@media (max-width: 470px)',
  '@media (prefers-reduced-motion: reduce)',
  'overflow-wrap: anywhere',
  'grid-template-columns: 1fr;',
]) assert(css.includes(expected), `Missing responsive contract: ${expected}`)

assert(app.includes('onOpenProject={openClientProject}'))
assert(app.includes("onOpenClients={() => navigatePage('clients')}"))
console.log('Connected Intelligence UI verified: human briefing states, finding presentation, progressive evidence, real inspection activity, avatar mapping, navigation, accessibility, and mobile safeguards.')

