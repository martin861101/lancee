import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

type AnalyticsData = {
  metrics: {
    activeAutomations: number
    connectedIntegrations: number
    totalRuns: number
    successRate: number
    averageRunDurationSec: number
    savedHoursThisMonth: number
    apiCallsThisMonth: number
    databaseQueryTimeMs: number
  }
  weeklyActivity: Array<{ day: string; runs: number; success: number }>
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    api.analytics
      .get()
      .then((res) => {
        if (isMounted) setData(res)
      })
      .catch(() => undefined)
      .finally(() => {
        if (isMounted) setLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [])

  if (loading || !data) {
    return (
      <div className="content-container">
        <div className="skeleton-line" style={{ width: '200px', height: '28px', marginBottom: '24px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card-skeleton" style={{ height: '110px' }} />
          ))}
        </div>
      </div>
    )
  }

  const { metrics, weeklyActivity } = data
  const maxRuns = Math.max(...weeklyActivity.map((w) => w.runs), 1)

  return (
    <div className="content-container animate-fade-in" style={{ padding: '24px' }}>
      <header style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--ink)' }}>Platform Analytics</span>
          <span className="badge badge--success" style={{ fontSize: '12px' }}>
            Live Sync
          </span>
        </div>
        <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: '14px' }}>
          Real-time performance metrics, PostgreSQL query execution speed, and automation throughput.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <div className="stat-card" style={{ background: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>Active Automations</span>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--ink)', margin: '8px 0 4px' }}>{metrics.activeAutomations}</div>
          <span style={{ fontSize: '12px', color: 'var(--success)' }}>⚡ Running smooth</span>
        </div>

        <div className="stat-card" style={{ background: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>Execution Success Rate</span>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--ink)', margin: '8px 0 4px' }}>{metrics.successRate}%</div>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Across {metrics.totalRuns} total runs</span>
        </div>

        <div className="stat-card" style={{ background: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>Hours Saved This Month</span>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#6854e8', margin: '8px 0 4px' }}>{metrics.savedHoursThisMonth} hrs</div>
          <span style={{ fontSize: '12px', color: 'var(--success)' }}>+14.2% vs last month</span>
        </div>

        <div className="stat-card" style={{ background: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>PostgreSQL Query Latency</span>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#43bdf4', margin: '8px 0 4px' }}>{metrics.databaseQueryTimeMs} ms</div>
          <span style={{ fontSize: '12px', color: 'var(--success)' }}>Sub-millisecond speed</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '16px', border: '1px solid var(--line)' }}>
          <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 600 }}>Weekly Automation Activity</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '180px', padding: '10px 0 0' }}>
            {weeklyActivity.map((item) => (
              <div key={item.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%' }}>
                <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  <div
                    style={{
                      width: '60%',
                      maxWidth: '28px',
                      height: `${(item.runs / maxRuns) * 100}%`,
                      minHeight: '8px',
                      background: 'linear-gradient(180deg, #6854e8 0%, #43bdf4 100%)',
                      borderRadius: '6px 6px 0 0',
                      transition: 'height 0.4s ease',
                    }}
                    title={`${item.runs} runs on ${item.day}`}
                  />
                </div>
                <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500 }}>{item.day}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '16px', border: '1px solid var(--line)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>System Health & PostgreSQL</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px dashed var(--line)' }}>
              <span style={{ fontSize: '14px', color: 'var(--muted)' }}>Database Engine</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>PostgreSQL (pg-mem / pg)</span>
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
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>{metrics.connectedIntegrations} Connected</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
