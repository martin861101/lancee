import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import './dashboard-page.css'

type AnalyticsData = {
  metrics: {
    activeAutomations: number
    connectedIntegrations: number
    totalRuns: number
    successRate: number
    averageRunDurationSec: number
    automationRuntimeHoursThisMonth: number
    apiCallsThisMonth: number
    databaseQueryTimeMs: number
    openProjects: number
    dueSoonProjects: number
    totalClients: number
    outstandingAmount: number
    pendingInvoices: number
    dueThisWeek: number
  }
  weeklyActivity: Array<{ day: string; runs: number; success: number }>
}

type DatabaseInfo = {
  provider: string
  mode: string
  version: string
  status: string
}

function queryLatencyCaption(ms: number) {
  if (ms <= 0) return 'No samples yet'
  if (ms < 1) return 'Sub-millisecond average'
  if (ms < 50) return 'Healthy query latency'
  return 'Elevated query latency'
}

function formatMoneyMinor(amountMinor: number) {
  if (amountMinor <= 0) return 'R 0.00'
  return `R ${(amountMinor / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function AnalyticsPage({ onOpenFiles }: { onOpenFiles?: () => void }) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [databaseInfo, setDatabaseInfo] = useState<DatabaseInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [analytics, dbInfo] = await Promise.all([
      api.analytics.get(),
      api.database.getInfo().catch(() => null),
    ])
    setData(analytics)
    setDatabaseInfo(dbInfo)
  }, [])

  useEffect(() => {
    let isMounted = true
    load()
      .catch(() => {
        if (isMounted) setError('Unable to load analytics. Refresh the page or try again shortly.')
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [load])

  const handleRefresh = async () => {
    setRefreshing(true)
    setError('')
    try {
      await load()
    } catch {
      setError('Unable to refresh analytics.')
    } finally {
      setRefreshing(false)
    }
  }

  const handleExport = () => {
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `lancee-analytics-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="content-container dashboard-page">
        <div className="skeleton-line" style={{ width: '200px', height: '28px', marginBottom: '24px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card-skeleton" style={{ height: '110px' }} />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="content-container dashboard-page">
        <div className="dashboard-alert">{error || 'Unable to load analytics.'}</div>
        <button type="button" className="button button--secondary" onClick={() => void handleRefresh()}>
          Try again
        </button>
      </div>
    )
  }

  const { metrics, weeklyActivity } = data
  const maxRuns = Math.max(...weeklyActivity.map((w) => w.runs), 1)
  const databaseLabel = databaseInfo
    ? `${databaseInfo.provider} · ${databaseInfo.mode}`
    : 'PostgreSQL'
  const weeklySuccessTotal = weeklyActivity.reduce((sum, day) => sum + day.success, 0)
  const weeklyRunTotal = weeklyActivity.reduce((sum, day) => sum + day.runs, 0)

  return (
    <div className="content-container animate-fade-in dashboard-page">
      <header className="dashboard-page__header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h2 className="dashboard-page__title" style={{ margin: 0 }}>
              Platform Analytics
            </h2>
            <span className="badge badge--success" style={{ fontSize: '12px' }}>
              Live sync
            </span>
          </div>
          <p className="dashboard-page__description">
            Workspace automation throughput, business pipeline signals, and database health from live API data.
          </p>
        </div>
        <div className="dashboard-page__actions">
          <button type="button" className="button button--ghost" disabled={refreshing} onClick={() => void handleRefresh()}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="button button--secondary" onClick={handleExport}>
            Export JSON
          </button>
          {onOpenFiles && (
            <button type="button" className="button button--primary" onClick={onOpenFiles}>
              Cloud files
            </button>
          )}
        </div>
      </header>

      <div className="dashboard-stat-grid">
        <div className="dashboard-stat">
          <span>Open projects</span>
          <strong>{metrics.openProjects}</strong>
        </div>
        <div className="dashboard-stat">
          <span>Due this week</span>
          <strong>{metrics.dueThisWeek}</strong>
        </div>
        <div className="dashboard-stat">
          <span>Outstanding</span>
          <strong>{formatMoneyMinor(metrics.outstandingAmount)}</strong>
        </div>
        <div className="dashboard-stat">
          <span>Clients</span>
          <strong>{metrics.totalClients}</strong>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <div className="stat-card" style={{ background: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>Active Automations</span>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--ink)', margin: '8px 0 4px' }}>{metrics.activeAutomations}</div>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            {metrics.connectedIntegrations} connected integration{metrics.connectedIntegrations === 1 ? '' : 's'}
          </span>
        </div>

        <div className="stat-card" style={{ background: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>Execution Success Rate</span>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--ink)', margin: '8px 0 4px' }}>{metrics.successRate}%</div>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Across {metrics.totalRuns} total runs</span>
        </div>

        <div className="stat-card" style={{ background: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>Automation Runtime</span>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#6854e8', margin: '8px 0 4px' }}>{metrics.automationRuntimeHoursThisMonth} hrs</div>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Completed runs this month</span>
        </div>

        <div className="stat-card" style={{ background: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>Database Query Latency</span>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#43bdf4', margin: '8px 0 4px' }}>{metrics.databaseQueryTimeMs} ms</div>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{queryLatencyCaption(metrics.databaseQueryTimeMs)}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '16px', border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Weekly Automation Activity</h3>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
              {weeklySuccessTotal} successful of {weeklyRunTotal} runs
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '180px', padding: '10px 0 0' }}>
            {weeklyActivity.map((item) => {
              const daySuccessRate = item.runs > 0 ? Math.round((item.success / item.runs) * 100) : 0
              return (
                <div key={item.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%' }}>
                  <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div
                      style={{
                        width: '60%',
                        maxWidth: '28px',
                        height: `${(item.runs / maxRuns) * 100}%`,
                        minHeight: item.runs > 0 ? '8px' : '0',
                        background: 'linear-gradient(180deg, #6854e8 0%, #43bdf4 100%)',
                        borderRadius: '6px 6px 0 0',
                        transition: 'height 0.4s ease',
                      }}
                      title={`${item.runs} runs · ${item.success} successful (${daySuccessRate}%) on ${item.day}`}
                    />
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500 }}>{item.day}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '16px', border: '1px solid var(--line)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>System Health & Business</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px dashed var(--line)' }}>
              <span style={{ fontSize: '14px', color: 'var(--muted)' }}>Database Engine</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', textAlign: 'right', maxWidth: '60%' }}>{databaseLabel}</span>
            </div>
            {databaseInfo && (
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px dashed var(--line)' }}>
                <span style={{ fontSize: '14px', color: 'var(--muted)' }}>Database Status</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>{databaseInfo.status}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px dashed var(--line)' }}>
              <span style={{ fontSize: '14px', color: 'var(--muted)' }}>Projects due soon</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>{metrics.dueSoonProjects}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px dashed var(--line)' }}>
              <span style={{ fontSize: '14px', color: 'var(--muted)' }}>Pending invoices</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>{metrics.pendingInvoices}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px dashed var(--line)' }}>
              <span style={{ fontSize: '14px', color: 'var(--muted)' }}>API Calls Processed</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>{metrics.apiCallsThisMonth.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px dashed var(--line)' }}>
              <span style={{ fontSize: '14px', color: 'var(--muted)' }}>Avg Run Duration</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>{metrics.averageRunDurationSec}s</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '14px', color: 'var(--muted)' }}>Connected Tools</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>{metrics.connectedIntegrations}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
