import { useState } from 'react'
import { api, type ConnectedIntelligenceActivity, type ConnectedIntelligenceSummary } from '../../lib/api'
import IntelligenceIcon from './IntelligenceIcon'
import LanceeAvatar from './LanceeAvatar'
import { activityAvatar, activityCountLabels, activityDescription, activityResult, activityTitle, formatNumber } from './connected-intelligence-presentation'

function activityTime(activity: ConnectedIntelligenceActivity) {
  const date = new Date(activity.completedAt || activity.startedAt)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit' }).format(date) : ''
}

export default function InspectionActivity({ activity, summary, canViewFinding, onViewFinding }: {
  activity: ConnectedIntelligenceActivity
  summary: ConnectedIntelligenceSummary
  canViewFinding: boolean
  onViewFinding: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState<ConnectedIntelligenceActivity | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const counts = Object.entries(detail?.counts || {}).filter(([key, value]) => activityCountLabels[key] && Number.isFinite(value) && value > 0)

  const toggleDetail = async () => {
    const nextExpanded = !expanded
    setExpanded(nextExpanded)
    if (!nextExpanded || detail || loading) return
    setLoading(true)
    setError('')
    try {
      setDetail(await api.connectedIntelligence.activityById(activity.id))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load this inspection detail.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <article className="inspection-activity" data-status={activity.status}>
      <div className="inspection-activity__avatar"><LanceeAvatar state={activityAvatar(activity)} size="medium" /></div>
      <div className="inspection-activity__content">
        <header><div><h3>{activityTitle(activity)}</h3><p>{activityDescription(activity, summary)}</p></div><time dateTime={activity.completedAt || activity.startedAt}>{activityTime(activity)}</time></header>
        <div className="inspection-activity__result"><IntelligenceIcon name={activity.status === 'all_clear' ? 'check' : 'eye'} size={15} /><span>{activityResult(activity.status)}</span></div>
        <div className="inspection-activity__actions">
          <button type="button" aria-expanded={expanded} aria-controls={`inspection-detail-${activity.id}`} onClick={() => void toggleDetail()}>{expanded ? 'Hide inspection detail' : 'See what Lancee checked'}</button>
          {canViewFinding && <button type="button" className="inspection-activity__finding" onClick={onViewFinding}>View finding<IntelligenceIcon name="arrow" size={15} /></button>}
        </div>
        {expanded && (
          <div className="inspection-detail" id={`inspection-detail-${activity.id}`}>
            {loading && <p role="status">Loading inspection detail…</p>}
            {error && <p role="alert" className="inspection-detail__error">{error}</p>}
            {detail && <>
              <h4>Lancee checked</h4>
              {counts.length > 0 ? <ul>{counts.map(([key, value]) => <li key={key}><IntelligenceIcon name="check" size={14} /><span>{formatNumber(value)} {activityCountLabels[key]}</span></li>)}</ul> : <p>No count details were recorded for this check.</p>}
              <div className="inspection-detail__result"><span>Result</span><strong>{activityResult(detail.status)}</strong></div>
              {canViewFinding && <button type="button" onClick={onViewFinding}>View finding<IntelligenceIcon name="arrow" size={15} /></button>}
            </>}
          </div>
        )}
      </div>
    </article>
  )
}

