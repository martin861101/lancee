import type { ConnectedIntelligenceSummary, ConnectedOpportunity } from '../../lib/api'
import IntelligenceIcon from './IntelligenceIcon'
import { formatDate, presentFinding } from './connected-intelligence-presentation'

export default function FindingCard({ opportunity, summary, onExplain, onOpenProject, onOpenClients }: {
  opportunity: ConnectedOpportunity
  summary: ConnectedIntelligenceSummary
  onExplain: () => void
  onOpenProject?: (projectId: string) => void
  onOpenClients?: () => void
}) {
  const presentation = presentFinding(opportunity, summary)
  const reviewAction = presentation.project && onOpenProject
    ? { label: 'Review project', onClick: () => onOpenProject(presentation.project!.id), icon: 'project' as const }
    : presentation.client && onOpenClients
      ? { label: 'Review clients', onClick: onOpenClients, icon: 'client' as const }
      : null

  return (
    <article className="finding-card" data-severity={presentation.severity}>
      <header className="finding-card__header">
        <span className="finding-severity"><i aria-hidden="true" />{presentation.severityLabel}</span>
        <time dateTime={opportunity.lastDetectedAt}>Noticed {formatDate(opportunity.lastDetectedAt)}</time>
      </header>
      <div className="finding-card__intro"><h3>{presentation.title}</h3><p>{presentation.explanation}</p></div>
      {presentation.stats.length > 0 && (
        <section className="finding-card__section" aria-label="What stood out">
          <h4>What stood out</h4>
          <dl className="finding-stats">{presentation.stats.map((stat) => <div key={stat.key}><dd>{stat.value}</dd><dt>{stat.label}</dt></div>)}</dl>
        </section>
      )}
      <section className="finding-card__section finding-card__matter"><h4>Why this may matter</h4><p>{presentation.whyItMayMatter}</p></section>
      <footer className="finding-card__actions">
        {reviewAction && <button type="button" className="button button--secondary" onClick={reviewAction.onClick}><IntelligenceIcon name={reviewAction.icon} size={16} />{reviewAction.label}</button>}
        <button type="button" className="finding-card__why" onClick={onExplain}>Why did Lancee notice this?<IntelligenceIcon name="arrow" size={16} /></button>
      </footer>
    </article>
  )
}

