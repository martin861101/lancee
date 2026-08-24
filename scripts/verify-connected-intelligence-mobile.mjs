import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const css = readFileSync(new URL('../src/components/intelligence/connected-intelligence.css', import.meta.url), 'utf8')
const theme = `
  *, *::before, *::after { box-sizing: border-box; }
  :root {
    --surface: #fff; --surface-soft: #f5f7fb; --line: #dbe1ea;
    --line-strong: #bdc7d6; --ink: #172033; --muted: #647087;
    --success: #24845b; --danger: #b74755; --shadow-sm: 0 8px 24px rgba(20,30,50,.08);
  }
  body { margin: 0; background: #eef2f7; font-family: Arial, sans-serif; }
`
const markup = `
  <div class="connected-intelligence-page">
    <header class="connected-page-header"><div><span>Workspace intelligence</span><h1>Connected Intelligence</h1></div><button class="button">Refresh</button></header>
    <section class="intelligence-briefing">
      <div class="intelligence-briefing__avatar"><img class="lancee-avatar lancee-avatar--large" alt=""></div>
      <div class="intelligence-briefing__copy"><span>Your Lancee briefing</span><h2>Here's what I've noticed</h2><p>I found things that may be worth your attention.</p><p class="intelligence-briefing__explanation">These aren't necessarily problems.</p></div>
      <dl class="intelligence-briefing__metrics"><div><dd>4</dd><dt>worth looking at</dt></div><div><dd>207</dd><dt>meetings reviewed</dt></div></dl>
    </section>
    <div class="intelligence-view-tabs"><button aria-selected="true"><span>Things I've noticed</span><small>4</small></button><button><span>Lancee activity</span><small>12</small></button></div>
    <main class="connected-view-panel"><section>
      <header class="view-heading"><div><span>Things I've noticed</span><h2>Patterns worth a closer look</h2><p>These are differences, not conclusions.</p></div><div class="finding-filters"><button>All</button><button>Communication</button><button>Meetings</button></div></header>
      <div class="finding-grid"><article class="finding-card"><header class="finding-card__header"><span class="finding-severity"><i></i>Needs attention</span><time>Noticed today</time></header><div class="finding-card__intro"><h3>Vanguard Construction needs more attention than usual</h3><p>Lancee noticed more coordination than usual.</p></div><section class="finding-card__section"><h4>What stood out</h4><dl class="finding-stats"><div><dd>29</dd><dt>Messages</dt></div><div><dd>14 hrs</dd><dt>Meeting time</dt></div></dl></section><section class="finding-card__section finding-card__matter"><h4>Why this may matter</h4><p>More coordination is not necessarily a problem.</p></section><footer class="finding-card__actions"><button class="button">Review clients</button><button class="finding-card__why">Why did Lancee notice this?</button></footer></article></div>
      <div class="activity-groups"><section class="activity-group"><h3>Today</h3><div class="activity-timeline"><article class="inspection-activity"><div class="inspection-activity__avatar"><img class="lancee-avatar lancee-avatar--medium" alt=""></div><div class="inspection-activity__content"><header><div><h3>Checked your recent mail</h3><p>Reviewed recent messages across your workspace.</p></div><time>10:42</time></header><div class="inspection-activity__result">Nothing unusual found</div><div class="inspection-activity__actions"><button>See what Lancee checked</button></div></div></article></div></section></div>
      <details class="technical-evidence" open><summary><span>View technical evidence</span></summary><div class="technical-evidence__body"><ol class="technical-evidence__chain"><li><span>1</span><div><strong>Authoritative relationship</strong><p>Observed workspace record</p><code>workspace_event:cinsp_extremely_long_technical_identifier_that_must_wrap_on_mobile</code></div></li></ol></div></details>
    </section></main>
  </div>
`

const browser = await chromium.launch({ headless: true })
try {
  for (const width of [390, 760]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.setContent(`<style>${theme}${css}</style>${markup}`)
    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll('.connected-intelligence-page, .intelligence-briefing, .connected-view-panel, .finding-card, .inspection-activity, .technical-evidence')]
        .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
        .map((element) => element.className),
    }))
    assert(overflow.document <= overflow.viewport + 1, `${width}px layout overflowed by ${overflow.document - overflow.viewport}px`)
    assert.deepEqual(overflow.offenders, [], `${width}px layout has overflowing components`)
    await page.setContent(`<style>${theme}${css}</style><div class="finding-drawer-backdrop"><aside class="finding-drawer"><header class="finding-drawer__header"><div><span>Why Lancee noticed this</span><h2>A long finding explanation must fit the viewport</h2></div><button>×</button></header><div class="finding-drawer__body"><section><p>Human explanation.</p></section><details class="technical-evidence" open><summary><span>View technical evidence</span></summary><div class="technical-evidence__body"><code>workspace_event:cinsp_extremely_long_technical_identifier_that_must_wrap_on_mobile</code></div></details></div></aside></div>`)
    const drawerWidth = await page.locator('.finding-drawer').evaluate((element) => element.getBoundingClientRect().width)
    assert(drawerWidth <= width, `${width}px drawer exceeded the viewport`)
    await page.close()
  }
} finally {
  await browser.close()
}

console.log('Connected Intelligence mobile layout verified at 390px and 760px with no horizontal overflow.')

