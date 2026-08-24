import { useCallback, useEffect, useState } from 'react'
import { api, type ConnectedIntelligenceActivity, type ConnectedIntelligenceSummary, type ConnectedOpportunity } from '../../lib/api'
import FindingExplanationDrawer from './FindingExplanationDrawer'
import FindingsView from './FindingsView'
import IntelligenceBriefing from './IntelligenceBriefing'
import IntelligenceIcon from './IntelligenceIcon'
import IntelligenceViewTabs, { type IntelligenceView } from './IntelligenceViewTabs'
import LanceeActivity from './LanceeActivity'
import '../dashboard/dashboard-page.css'
import './connected-intelligence.css'

export default function ConnectedIntelligencePage({ onOpenProject, onOpenClients }: {
  onOpenProject?: (projectId: string) => void
  onOpenClients?: () => void
}) {
  const [summary, setSummary] = useState<ConnectedIntelligenceSummary | null>(null)
  const [opportunities, setOpportunities] = useState<ConnectedOpportunity[]>([])
  const [activity, setActivity] = useState<ConnectedIntelligenceActivity[]>([])
  const [activityTotal, setActivityTotal] = useState(0)
  const [activeView, setActiveView] = useState<IntelligenceView>('findings')
  const [selectedOpportunity, setSelectedOpportunity] = useState<ConnectedOpportunity | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadConnected = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const [nextSummary, nextOpportunities, nextActivity] = await Promise.all([
        api.connectedIntelligence.summary(),
        api.connectedIntelligence.opportunities(),
        api.connectedIntelligence.activity({ limit: 50, offset: 0 }),
      ])
      setSummary(nextSummary)
      setOpportunities(nextOpportunities)
      setActivity(nextActivity.activity)
      setActivityTotal(nextActivity.pagination.total)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Connected Intelligence is unavailable.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadConnected() }, [loadConnected])

  if (loading) {
    return <div className="content-container dashboard-page connected-intelligence-page" role="status" aria-label="Loading Connected Intelligence"><div className="connected-skeleton connected-skeleton--briefing" /><div className="connected-skeleton connected-skeleton--tabs" /><div className="connected-skeleton-grid"><div className="connected-skeleton" /><div className="connected-skeleton" /></div></div>
  }

  if (!summary) {
    return <div className="content-container dashboard-page connected-intelligence-page"><div className="dashboard-alert" role="alert">{error || 'Connected Intelligence is unavailable.'}</div><button type="button" className="button button--secondary" onClick={() => void loadConnected()}>Try again</button></div>
  }

  return (
    <div className="content-container animate-fade-in dashboard-page connected-intelligence-page">
      <header className="connected-page-header">
        <div><span>Workspace intelligence</span><h1>Connected Intelligence</h1></div>
        <button type="button" className="button button--secondary" onClick={() => void loadConnected()}><IntelligenceIcon name="refresh" size={16} />Refresh</button>
      </header>
      {error && <div className="intelligence-inline-error" role="alert">{error}</div>}

      <IntelligenceBriefing summary={summary} />
      <IntelligenceViewTabs activeView={activeView} findingCount={summary.findings} activityCount={activityTotal} onChange={setActiveView} />
      <main className="connected-view-panel">
        {activeView === 'findings' ? (
          <section role="tabpanel" id="intelligence-panel-findings" aria-labelledby="intelligence-tab-findings" tabIndex={0}>
            <FindingsView summary={summary} opportunities={opportunities} onExplain={setSelectedOpportunity} onOpenProject={onOpenProject} onOpenClients={onOpenClients} />
          </section>
        ) : (
          <section role="tabpanel" id="intelligence-panel-activity" aria-labelledby="intelligence-tab-activity" tabIndex={0}>
            <LanceeActivity key={`${activityTotal}-${activity[0]?.id || 'empty'}`} summary={summary} initialActivity={activity} initialTotal={activityTotal} opportunities={opportunities} onViewFinding={setSelectedOpportunity} />
          </section>
        )}
      </main>
      {selectedOpportunity && <FindingExplanationDrawer opportunity={selectedOpportunity} summary={summary} onClose={() => setSelectedOpportunity(null)} />}
    </div>
  )
}
