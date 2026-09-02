import { useState } from 'react'
import ProductFrame from './ProductFrame'

const workspaceItems = [
  {
    code: '01',
    title: 'Connected Projects',
    subject: 'Proposal feedback',
    time: '10:24',
    description: 'Briefs, files, client conversations, meetings, decisions, deadlines, approvals and invoices remain attached to the work they belong to.',
  },
  {
    code: '02',
    title: 'Connected Intelligence',
    subject: 'Delivery risk surfaced',
    time: '09:15',
    description: 'Lancee looks across activity already happening in your workspace and surfaces useful patterns, risks and opportunities.',
  },
  {
    code: '03',
    title: 'Ideas Connected to Work',
    subject: 'References linked',
    time: 'Yesterday',
    description: 'Notes, images, palettes, references and files stay connected to clients and projects instead of becoming forgotten fragments.',
  },
  {
    code: '04',
    title: 'Communication Intelligence',
    subject: 'Follow-up needed',
    time: 'Yesterday',
    description: 'Unanswered conversations, increasing activity, recent feedback and follow-ups are surfaced before they get missed.',
  },
  {
    code: '05',
    title: 'Meetings Become Context',
    subject: 'Call notes connected',
    time: 'Mon',
    description: 'Meetings remain attached to clients and projects so the surrounding activity stays visible after the call ends.',
  },
  {
    code: '06',
    title: 'Automation with Context',
    subject: 'Invoice ready to approve',
    time: 'Mon',
    description: 'Routine work moves automatically while important decisions remain yours and visible in the workspace.',
  },
]

export default function ConnectedWorkspacePanel({ compact = false }: { compact?: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const active = workspaceItems[activeIndex]

  return (
    <ProductFrame
      label="Inbox"
      meta="Context connected"
      className={`connected-workspace-panel${compact ? ' is-compact' : ''}`}
    >
      <div className="connected-workspace-panel__layout">
        <aside className="connected-workspace-panel__rail" aria-label="Workspace areas">
          <span className="connected-workspace-panel__mark"><img src="/img/icon.png" alt="" /></span>
          {workspaceItems.slice(0, 5).map((item, index) => (
            <button
              key={item.code}
              type="button"
              className={activeIndex === index ? 'is-active' : ''}
              onClick={() => setActiveIndex(index)}
              aria-label={item.title}
            >
              {item.code}
            </button>
          ))}
        </aside>

        <section className="connected-workspace-panel__list" aria-label="Connected activity">
          <div className="connected-workspace-panel__search">Search your workspace…</div>
          <div className="connected-workspace-panel__tabs"><span className="is-active">All</span><span>Clients</span><span>Projects</span></div>
          <div className="connected-workspace-panel__items">
            {workspaceItems.map((item, index) => (
              <button
                key={item.code}
                type="button"
                className={activeIndex === index ? 'is-active' : ''}
                onClick={() => setActiveIndex(index)}
              >
                <span className="connected-workspace-panel__avatar">{item.code}</span>
                <span><strong>{item.title}</strong><small>{item.subject}</small></span>
                <time>{item.time}</time>
              </button>
            ))}
          </div>
        </section>

        <article className="connected-workspace-panel__detail">
          <header>
            <span className="connected-workspace-panel__avatar is-large">{active.code}</span>
            <span><strong>{active.title}</strong><small>To: You · Connected workspace</small></span>
            <time>{active.time}</time>
          </header>
          <div className="connected-workspace-panel__message">
            <h3>Re: {active.subject}</h3>
            <p>Hi Martin,</p>
            <p>{active.description}</p>
            <p>Everything remains in context, ready for the next decision.</p>
            <p>Regards,<br />Lancee</p>
          </div>
          <div className="connected-workspace-panel__linked">
            <span>↗</span><div><strong>Project linked</strong><small>Juniper &amp; Tide · Packaging refresh</small></div>
          </div>
          <div className="connected-workspace-panel__reply"><span>Reply…</span><button type="button" aria-label="Send reply">→</button></div>
        </article>
      </div>
    </ProductFrame>
  )
}
