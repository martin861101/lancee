import ProductFrame from './ProductFrame'

const activity = [
  { label: 'Client feedback received', meta: 'Juniper & Tide · 5m ago', tone: 'violet' },
  { label: 'Invoice ready to review', meta: 'R30,500 · Project linked', tone: 'blue' },
  { label: 'Meeting notes connected', meta: '3 useful actions found', tone: 'pink' },
]

export default function HeroWorkspacePreview() {
  return (
    <ProductFrame label="Today in your workspace" meta="All systems connected" className="hero-workspace-preview">
      <div className="hero-workspace-preview__body">
        <header>
          <span className="hero-workspace-preview__brand"><img src="/img/icon.png" alt="" /></span>
          <div><small>GOOD MORNING</small><strong>Your business, at a glance.</strong></div>
          <span className="hero-workspace-preview__date">MON · 08:32</span>
        </header>

        <div className="hero-workspace-preview__metrics">
          <article><small>Active work</small><strong>8 projects</strong><span>6 moving normally</span></article>
          <article><small>Client attention</small><strong>2 follow-ups</strong><span>One due today</span></article>
          <article><small>Money</small><strong>R46,200</strong><span>Outstanding</span></article>
        </div>

        <section className="hero-workspace-preview__activity">
          <div className="hero-workspace-preview__section-title"><strong>Recent activity</strong><span>Live context</span></div>
          {activity.map((item) => (
            <article key={item.label}>
              <i className={`is-${item.tone}`} />
              <div><strong>{item.label}</strong><small>{item.meta}</small></div>
              <span>↗</span>
            </article>
          ))}
        </section>

        <footer>
          <span><i /> Connected Intelligence is ready</span>
          <button type="button">Open workspace <b>→</b></button>
        </footer>
      </div>
    </ProductFrame>
  )
}
