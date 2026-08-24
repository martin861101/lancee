import { useMemo, useState } from 'react'
import type { ConnectedIntelligenceSummary, ConnectedOpportunity } from '../../lib/api'
import FindingCard from './FindingCard'
import LanceeAvatar from './LanceeAvatar'
import { findingFilterLabels, presentFinding, type FindingFilter } from './connected-intelligence-presentation'

export default function FindingsView({ summary, opportunities, onExplain, onOpenProject, onOpenClients }: {
  summary: ConnectedIntelligenceSummary
  opportunities: ConnectedOpportunity[]
  onExplain: (opportunity: ConnectedOpportunity) => void
  onOpenProject?: (projectId: string) => void
  onOpenClients?: () => void
}) {
  const [filter, setFilter] = useState<FindingFilter>('all')
  const presented = useMemo(() => opportunities.map((opportunity) => ({ opportunity, presentation: presentFinding(opportunity, summary) })), [opportunities, summary])
  const availableFilters = useMemo(() => {
    const filters: FindingFilter[] = ['all']
    for (const candidate of ['clients', 'projects', 'communication', 'meetings'] as FindingFilter[]) {
      if (presented.some((item) => item.presentation.filters.includes(candidate))) filters.push(candidate)
    }
    return filters
  }, [presented])
  const visible = filter === 'all' ? presented : presented.filter((item) => item.presentation.filters.includes(filter))

  if (opportunities.length === 0) {
    const insufficient = summary.status === 'insufficient_activity'
    return (
      <div className="intelligence-empty-state" data-state={summary.status}>
        <LanceeAvatar state={insufficient ? 'investigate' : 'all-clear'} size="large" />
        <div>
          <h2>{insufficient ? 'I’m still getting the picture' : 'Nothing needs your attention right now'}</h2>
          <p>{insufficient ? 'There isn’t enough recent connected workspace activity yet to identify meaningful patterns.' : 'Lancee has checked recent activity and will continue watching as connected work changes.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="findings-view">
      <header className="view-heading">
        <div><span>Things I’ve noticed</span><h2>Patterns worth a closer look</h2><p>These are differences Lancee found in your workspace activity. They are prompts to check, not conclusions.</p></div>
        {availableFilters.length > 1 && <div className="finding-filters" aria-label="Filter findings">{availableFilters.map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>{findingFilterLabels[item]}</button>)}</div>}
      </header>
      {visible.length > 0 ? (
        <div className="finding-grid">{visible.map(({ opportunity }) => <FindingCard key={opportunity.id} opportunity={opportunity} summary={summary} onExplain={() => onExplain(opportunity)} onOpenProject={onOpenProject} onOpenClients={onOpenClients} />)}</div>
      ) : <p className="finding-filter-empty">No current findings match this filter.</p>}
    </div>
  )
}
