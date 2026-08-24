import { useState } from 'react'
import { api, type ConnectedIntelligenceActivity, type ConnectedIntelligenceSummary, type ConnectedOpportunity } from '../../lib/api'
import InspectionActivity from './InspectionActivity'
import LanceeAvatar from './LanceeAvatar'

type ActivityGroup = { label: string; activity: ConnectedIntelligenceActivity[] }

function groupActivity(activity: ConnectedIntelligenceActivity[]): ActivityGroup[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 24 * 60 * 60 * 1_000
  const groups: Record<'Today' | 'Yesterday' | 'Earlier', ConnectedIntelligenceActivity[]> = { Today: [], Yesterday: [], Earlier: [] }
  for (const item of activity) {
    const time = new Date(item.completedAt || item.startedAt).getTime()
    if (time >= today) groups.Today.push(item)
    else if (time >= yesterday) groups.Yesterday.push(item)
    else groups.Earlier.push(item)
  }
  return Object.entries(groups).filter(([, items]) => items.length > 0).map(([label, items]) => ({ label, activity: items }))
}

export default function LanceeActivity({ summary, initialActivity, initialTotal, opportunities, onViewFinding }: {
  summary: ConnectedIntelligenceSummary
  initialActivity: ConnectedIntelligenceActivity[]
  initialTotal: number
  opportunities: ConnectedOpportunity[]
  onViewFinding: (opportunity: ConnectedOpportunity) => void
}) {
  const [activity, setActivity] = useState(initialActivity)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const opportunityById = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]))
  const groups = groupActivity(activity)

  const loadMore = async () => {
    setLoadingMore(true)
    setError('')
    try {
      const next = await api.connectedIntelligence.activity({ limit: 50, offset: activity.length })
      setActivity((current) => [...current, ...next.activity])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load more Lancee activity.')
    } finally {
      setLoadingMore(false)
    }
  }

  if (activity.length === 0) {
    return <div className="intelligence-empty-state intelligence-empty-state--activity"><LanceeAvatar state="connected" size="large" /><div><h2>Lancee hasn’t completed any recent inspections yet</h2><p>Inspection activity will appear here as connected workspace records are checked.</p></div></div>
  }

  return (
    <div className="lancee-activity">
      <header className="view-heading"><div><span>Lancee activity</span><h2>What I’ve been checking</h2><p>A factual timeline of persisted workspace inspections. No message bodies or raw provider data appear here.</p></div></header>
      <div className="activity-groups">
        {groups.map((group) => <section key={group.label} className="activity-group" aria-labelledby={`activity-group-${group.label.toLowerCase()}`}><h3 id={`activity-group-${group.label.toLowerCase()}`}>{group.label}</h3><div className="activity-timeline">{group.activity.map((item) => {
          const opportunity = item.opportunityId ? opportunityById.get(item.opportunityId) : undefined
          return <InspectionActivity key={item.id} activity={item} summary={summary} canViewFinding={Boolean(opportunity)} onViewFinding={() => { if (opportunity) onViewFinding(opportunity) }} />
        })}</div></section>)}
      </div>
      {error && <p className="intelligence-inline-error" role="alert">{error}</p>}
      {activity.length < initialTotal && <button type="button" className="button button--secondary activity-load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Loading…' : 'Load earlier activity'}</button>}
    </div>
  )
}
