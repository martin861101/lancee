import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type AdminDashboard } from '../../lib/api'
import '../dashboard/dashboard-page.css'
import './admin-page.css'

type AdminView = 'overview' | 'users' | 'api' | 'logs' | 'system'

const tabs: Array<{ id: AdminView; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'api', label: 'API usage' },
  { id: 'logs', label: 'Logs' },
  { id: 'system', label: 'System' },
]

function formatDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value))
}

function Stat({ label, value, caption }: { label: string; value: string | number; caption: string }) {
  return (
    <article className="admin-stat">
      <span>{label}</span>
      <strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong>
      <small>{caption}</small>
    </article>
  )
}

function EmptyState({ children }: { children: string }) {
  return <div className="admin-empty">{children}</div>
}

export default function AdminPage() {
  const [data, setData] = useState<AdminDashboard | null>(null)
  const [view, setView] = useState<AdminView>('overview')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [savingSignups, setSavingSignups] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [logLevel, setLogLevel] = useState('all')

  const load = useCallback(async () => {
    setError('')
    setData(await api.admin.getDashboard())
  }, [])

  useEffect(() => {
    let active = true
    api.admin.getDashboard()
      .then((dashboard) => {
        if (active) setData(dashboard)
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to load admin data.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return data?.users || []
    return (data?.users || []).filter((user) =>
      `${user.name} ${user.email} ${user.workspaces.map((workspace) => workspace.name).join(' ')}`
        .toLowerCase()
        .includes(query),
    )
  }, [data, search])

  const filteredLogs = useMemo(
    () => (data?.logs || []).filter((log) => logLevel === 'all' || log.level === logLevel),
    [data, logLevel],
  )

  const refresh = async () => {
    setRefreshing(true)
    try {
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to refresh admin data.')
    } finally {
      setRefreshing(false)
    }
  }

  const toggleSignups = async () => {
    if (!data) return
    setSavingSignups(true)
    setError('')
    try {
      const registrationEnabled = await api.admin.setRegistrationEnabled(
        !data.settings.registrationEnabled,
      )
      setData((current) => current ? {
        ...current,
        settings: { registrationEnabled },
      } : current)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update signup access.')
    } finally {
      setSavingSignups(false)
    }
  }

  if (loading) {
    return (
      <div className="content-container dashboard-page admin-page">
        <div className="skeleton-line" style={{ width: 240, height: 32, marginBottom: 24 }} />
        <div className="admin-stat-grid">
          {[1, 2, 3, 4].map((item) => <div className="card-skeleton" key={item} />)}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="content-container dashboard-page admin-page">
        <div className="dashboard-alert">{error || 'Unable to load the admin dashboard.'}</div>
        <button className="button button--secondary" type="button" onClick={() => void refresh()}>
          Try again
        </button>
      </div>
    )
  }

  const { summary } = data
  const errorRate = summary.apiCalls > 0
    ? ((summary.apiErrors / summary.apiCalls) * 100).toFixed(1)
    : '0.0'
  const runSuccessRate = summary.agentRuns > 0
    ? Math.round((summary.completedAgentRuns / summary.agentRuns) * 100)
    : 0
  const maxDailyCalls = Math.max(...data.apiUsage.map((item) => item.calls), 1)

  return (
    <div className="content-container animate-fade-in dashboard-page admin-page">
      <header className="dashboard-page__header admin-header">
        <div>
          <span className="admin-eyebrow">Platform administration</span>
          <h2 className="dashboard-page__title">Lancee Admin</h2>
          <p className="dashboard-page__description">
            Global users, usage, platform activity, and service health.
          </p>
        </div>
        <div className="dashboard-page__actions">
          <span className="admin-live"><i /> Live data</span>
          <button className="button button--secondary" type="button" disabled={refreshing} onClick={() => void refresh()}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && <div className="dashboard-alert">{error}</div>}

      <nav className="admin-tabs" aria-label="Admin views">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={view === tab.id ? 'is-active' : ''}
            aria-current={view === tab.id ? 'page' : undefined}
            onClick={() => setView(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {view === 'overview' && (
        <div className="admin-view">
          <section className="admin-stat-grid" aria-label="Platform summary">
            <Stat label="Registered users" value={summary.users} caption={`+${summary.newUsers} in the last 7 days`} />
            <Stat label="Workspaces" value={summary.workspaces} caption="Across the Lancee platform" />
            <Stat label="API calls" value={summary.apiCalls} caption={`${errorRate}% error rate`} />
            <Stat label="Agent runs" value={summary.agentRuns} caption={`${runSuccessRate}% completed`} />
          </section>

          <div className="admin-overview-grid">
            <section className="admin-panel admin-signup-panel">
              <div>
                <span className="admin-panel__eyebrow">Access control</span>
                <h3>Public signups</h3>
                <p>
                  {data.settings.registrationEnabled
                    ? 'New users can create a Lancee account from the signup page.'
                    : 'New account registration is paused. Existing users and invited members can still sign in.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={data.settings.registrationEnabled}
                aria-label="Allow new signups"
                className={`admin-switch${data.settings.registrationEnabled ? ' is-on' : ''}`}
                disabled={savingSignups}
                onClick={() => void toggleSignups()}
              >
                <span />
              </button>
              <strong className={data.settings.registrationEnabled ? 'is-enabled' : ''}>
                {savingSignups ? 'Saving…' : data.settings.registrationEnabled ? 'Enabled' : 'Disabled'}
              </strong>
            </section>

            <section className="admin-panel admin-activity-card">
              <span className="admin-panel__eyebrow">Runtime</span>
              <h3>{summary.activeJobs} active job{summary.activeJobs === 1 ? '' : 's'}</h3>
              <p>{summary.automationRuns.toLocaleString()} automation runs have been recorded.</p>
              <div className="admin-progress"><span style={{ width: `${runSuccessRate}%` }} /></div>
              <small>{runSuccessRate}% agent completion rate</small>
            </section>
          </div>

          <section className="admin-panel">
            <div className="admin-panel__header">
              <div><span className="admin-panel__eyebrow">Tenancy</span><h3>Workspaces</h3></div>
              <button type="button" onClick={() => setView('users')}>View all users</button>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Workspace</th><th>Members</th><th>Clients</th><th>Projects</th><th>API calls</th><th>Created</th></tr></thead>
                <tbody>
                  {data.workspaces.map((workspace) => (
                    <tr key={workspace.id}>
                      <td><strong>{workspace.name}</strong><small>{workspace.id}</small></td>
                      <td>{workspace.memberCount}</td><td>{workspace.clientCount}</td><td>{workspace.projectCount}</td>
                      <td>{workspace.apiCalls.toLocaleString()}</td><td>{formatDate(workspace.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.workspaces.length === 0 && <EmptyState>No workspaces registered yet.</EmptyState>}
            </div>
          </section>
        </div>
      )}

      {view === 'users' && (
        <section className="admin-panel admin-view">
          <div className="admin-panel__header">
            <div><span className="admin-panel__eyebrow">Directory</span><h3>Registered users</h3></div>
            <input
              className="admin-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email, workspace…"
              aria-label="Search registered users"
            />
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>User</th><th>Workspace access</th><th>Status</th><th>Registered</th></tr></thead>
              <tbody>
                {filteredUsers.map((registeredUser) => (
                  <tr key={registeredUser.id}>
                    <td><strong>{registeredUser.name}</strong><small>{registeredUser.email}</small></td>
                    <td>
                      <div className="admin-workspace-tags">
                        {registeredUser.workspaces.map((workspace) => (
                          <span key={workspace.id}>{workspace.name} · {workspace.role}</span>
                        ))}
                        {registeredUser.workspaces.length === 0 && <span>No workspace</span>}
                      </div>
                    </td>
                    <td><span className={`admin-status ${registeredUser.disabledAt ? 'is-disabled' : ''}`}><i />{registeredUser.disabledAt ? 'Disabled' : 'Active'}</span></td>
                    <td>{formatDate(registeredUser.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredUsers.length === 0 && <EmptyState>No users match this search.</EmptyState>}
          </div>
        </section>
      )}

      {view === 'api' && (
        <div className="admin-view">
          <section className="admin-stat-grid">
            <Stat label="All API calls" value={summary.apiCalls} caption="Authenticated requests recorded" />
            <Stat label="Request errors" value={summary.apiErrors} caption={`${errorRate}% of all calls`} />
            <Stat label="30-day calls" value={data.apiUsage.reduce((sum, day) => sum + day.calls, 0)} caption="Rolling daily usage" />
            <Stat label="Peak daily volume" value={Math.max(...data.apiUsage.map((day) => day.calls), 0)} caption="Within the last 30 days" />
          </section>
          <section className="admin-panel">
            <div className="admin-panel__header"><div><span className="admin-panel__eyebrow">Last 30 days</span><h3>API traffic</h3></div></div>
            {data.apiUsage.length > 0 ? (
              <div className="admin-chart" aria-label="API requests over the last 30 days">
                {data.apiUsage.map((day) => (
                  <div className="admin-chart__column" key={day.date} title={`${day.date}: ${day.calls} calls, ${day.errors} errors`}>
                    <span className="admin-chart__value">{day.calls}</span>
                    <div className="admin-chart__track"><i style={{ height: `${Math.max((day.calls / maxDailyCalls) * 100, 3)}%` }} /></div>
                    <small>{new Date(`${day.date}T00:00:00`).toLocaleDateString('en', { day: 'numeric', month: 'short' })}</small>
                  </div>
                ))}
              </div>
            ) : <EmptyState>No API traffic has been recorded yet.</EmptyState>}
          </section>
        </div>
      )}

      {view === 'logs' && (
        <section className="admin-panel admin-view">
          <div className="admin-panel__header">
            <div><span className="admin-panel__eyebrow">Latest 100 events</span><h3>Platform logs</h3></div>
            <select value={logLevel} onChange={(event) => setLogLevel(event.target.value)} aria-label="Filter logs by level">
              <option value="all">All levels</option><option value="info">Info</option><option value="warning">Warning</option><option value="error">Error</option>
            </select>
          </div>
          <div className="admin-log-list">
            {filteredLogs.map((log) => (
              <article className="admin-log" key={log.id}>
                <span className={`admin-log__level is-${log.level}`}>{log.level}</span>
                <div><strong>{log.eventType}</strong><p>{log.message}</p><small>{log.source} · {log.workspace}</small></div>
                <time>{formatDate(log.createdAt, true)}</time>
              </article>
            ))}
            {filteredLogs.length === 0 && <EmptyState>No logs match this filter.</EmptyState>}
          </div>
        </section>
      )}

      {view === 'system' && (
        <div className="admin-view admin-system-grid">
          <section className="admin-panel">
            <span className="admin-panel__eyebrow">Database</span><h3>System health</h3>
            <dl className="admin-definition-list">
              <div><dt>Status</dt><dd><span className="admin-status"><i />{data.system.status}</span></dd></div>
              <div><dt>Provider</dt><dd>{data.system.provider}</dd></div>
              <div><dt>Mode</dt><dd>{data.system.mode}</dd></div>
              <div><dt>Version</dt><dd>{data.system.version}</dd></div>
              <div><dt>Tables</dt><dd>{data.system.tablesCount}</dd></div>
              <div><dt>Average query latency</dt><dd>{data.system.averageQueryLatencyMs} ms</dd></div>
              <div><dt>Process queries</dt><dd>{data.system.queryCount.toLocaleString()}</dd></div>
            </dl>
          </section>
          <section className="admin-panel">
            <span className="admin-panel__eyebrow">Snapshot</span><h3>Data freshness</h3>
            <p className="admin-system-copy">This read-only snapshot combines platform-wide account, workspace, API metric, agent, automation, worker, and database records.</p>
            <dl className="admin-definition-list">
              <div><dt>Generated</dt><dd>{formatDate(data.generatedAt, true)}</dd></div>
              <div><dt>Log retention shown</dt><dd>Latest 100 events</dd></div>
              <div><dt>API chart window</dt><dd>Last 30 days</dd></div>
              <div><dt>Platform admin</dt><dd>martin@hookitupservices.com</dd></div>
            </dl>
          </section>
        </div>
      )}
    </div>
  )
}
