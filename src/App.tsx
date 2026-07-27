import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  api,
  type Automation,
  type ApiKey,
  type ApiKeyPermission,
  type Integration,
  type McpConnection,
  type McpInvocationResult,
  type McpService,
  type N8nConfig,
  type N8nConfigInput,
  type N8nDelivery,
  type N8nDirection,
  type N8nMethod,
  type N8nTestResult,
  type Run,
  type User,
} from './lib/api'
import IdeasCanvasPage from './components/IdeasCanvasPage'
import MoneyPage from './components/MoneyPage'
import WorkPage from './components/WorkPage'
import AnalyticsPage from './components/dashboard/AnalyticsPage'
import TeamPage from './components/dashboard/TeamPage'
import { syncIdeaMutations } from './lib/ideasRepository'
import { IDEA_SYNC_REQUEST_EVENT } from './pwa'

type Page =
  | 'overview'
  | 'work'
  | 'ideas'
  | 'automations'
  | 'runs'
  | 'integrations'
  | 'money'
  | 'analytics'
  | 'team'
  | 'api'
  | 'settings'
type ModalName = 'automation' | 'key' | 'n8n' | 'mcp' | null
type IconName =
  | 'activity'
  | 'alert'
  | 'arrow-right'
  | 'arrow-up-right'
  | 'bell'
  | 'bot'
  | 'briefcase'
  | 'calendar'
  | 'check'
  | 'check-circle'
  | 'chevron-down'
  | 'close'
  | 'code'
  | 'command'
  | 'copy'
  | 'file'
  | 'filter'
  | 'grid'
  | 'help'
  | 'key'
  | 'layers'
  | 'lightbulb'
  | 'logout'
  | 'menu'
  | 'messages'
  | 'more'
  | 'pause'
  | 'play'
  | 'plug'
  | 'plus'
  | 'search'
  | 'settings'
  | 'shield'
  | 'sparkles'
  | 'target'
  | 'trash'
  | 'user'
  | 'wallet'

const navItems: { id: Page; label: string; icon: IconName; section: string }[] = [
  { id: 'overview', label: 'Home', icon: 'grid', section: 'Your work' },
  { id: 'work', label: 'Work', icon: 'briefcase', section: 'Your work' },
  { id: 'ideas', label: 'Ideas', icon: 'lightbulb', section: 'Your work' },
  { id: 'automations', label: 'Automations', icon: 'activity', section: 'Business' },
  { id: 'runs', label: 'Activity Logs', icon: 'layers', section: 'Business' },
  { id: 'integrations', label: 'Connections', icon: 'plug', section: 'Business' },
  { id: 'money', label: 'Money', icon: 'wallet', section: 'Business' },
  { id: 'analytics', label: 'Analytics', icon: 'target', section: 'Business' },
  { id: 'team', label: 'Team', icon: 'user', section: 'Platform' },
  { id: 'api', label: 'API Keys', icon: 'key', section: 'Platform' },
  { id: 'settings', label: 'Settings & DB', icon: 'settings', section: 'Platform' },
]

function Icon({
  name,
  size = 18,
  strokeWidth = 1.8,
  className,
}: {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
}) {
  const paths: Record<IconName, ReactNode> = {
    activity: (
      <>
        <path d="M3 12h4l2.2-7 4.3 14 2.2-7H21" />
      </>
    ),
    alert: (
      <>
        <path d="M10.3 3.5 2.6 17a2 2 0 0 0 1.8 3h15.2a2 2 0 0 0 1.8-3L13.7 3.5a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    'arrow-right': <path d="M5 12h14m-5-5 5 5-5 5" />,
    'arrow-up-right': <path d="M7 17 17 7M8 7h9v9" />,
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    bot: (
      <>
        <rect x="4" y="7" width="16" height="13" rx="3" />
        <path d="M12 3v4M8 12h.01M16 12h.01M9 16h6" />
      </>
    ),
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    'check-circle': (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16.5 9" />
      </>
    ),
    'chevron-down': <path d="m7 10 5 5 5-5" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    code: <path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" />,
    command: (
      <>
        <path d="M9 6V5a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3Z" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M8 13h8M8 17h6" />
      </>
    ),
    filter: <path d="M4 6h16M7 12h10M10 18h4" />,
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.7 2.7 0 1 1 3.6 2.5c-.8.3-1.1.8-1.1 1.5v.5M12 17h.01" />
      </>
    ),
    key: (
      <>
        <circle cx="8" cy="15" r="4" />
        <path d="m11 12 9-9M15 8l3 3M17 6l2 2" />
      </>
    ),
    layers: (
      <>
        <path d="m12 2 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
      </>
    ),
    lightbulb: (
      <>
        <path d="M9 18h6M10 22h4M8.7 15.3A7 7 0 1 1 15.3 15.3C14.5 16 14 17 14 18h-4c0-1-.5-2-1.3-2.7Z" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    messages: (
      <>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    pause: (
      <>
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7Z" />,
    plug: (
      <>
        <path d="m12 22 1-5-5-1 8-8 4 4-8 8" />
        <path d="m15 5 4 4M17 3l4 4M8 16l-5 5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    sparkles: (
      <>
        <path d="m12 3-1.2 3.3L7.5 7.5l3.3 1.2L12 12l1.2-3.3 3.3-1.2-3.3-1.2L12 3Z" />
        <path d="m5 13-.8 2.2L2 16l2.2.8L5 19l.8-2.2L8 16l-2.2-.8L5 13ZM19 13l-.6 1.4L17 15l1.4.6L19 17l.6-1.4L21 15l-1.4-.6L19 13Z" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    wallet: (
      <>
        <path d="M4 6h14a2 2 0 0 1 2 2v11H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12" />
        <path d="M16 11h6v5h-6a2.5 2.5 0 0 1 0-5Z" />
      </>
    ),
  }

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-mark${compact ? ' brand-mark--compact' : ''}`} aria-hidden="true">
      <img src="/img/icon.png" alt="" />
    </div>
  )
}

function StatusPill({ status }: { status: Automation['status'] | Run['status'] }) {
  return (
    <span className={`status-pill status-pill--${status}`}>
      <span className="status-dot" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function EmptySkeleton() {
  return (
    <div className="page-loading" aria-label="Loading workspace">
      <div className="skeleton skeleton--title" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton--card" />
        <div className="skeleton skeleton--card" />
        <div className="skeleton skeleton--card" />
      </div>
      <div className="skeleton skeleton--wide" />
    </div>
  )
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <span className="page-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}

function OverviewPage({
  user,
  automations,
  runs,
  prompt,
  selectedAutomation,
  busy,
  analytics,
  onPromptChange,
  onAutomationChange,
  onDispatch,
  onNavigate,
  onCreateAutomation,
}: {
  user: User
  automations: Automation[]
  runs: Run[]
  prompt: string
  selectedAutomation: string
  busy: boolean
  analytics: {
    openProjects: number; dueSoonProjects: number; totalClients: number
    outstandingAmount: number; pendingInvoices: number; dueThisWeek: number
  } | null
  onPromptChange: (value: string) => void
  onAutomationChange: (value: string) => void
  onDispatch: (event: FormEvent<HTMLFormElement>) => void
  onNavigate: (page: Page) => void
  onCreateAutomation: () => void
}) {
  const activeAutomations = automations.filter((automation) => automation.status === 'active').length
  const chartValues = [42, 52, 47, 66, 58, 72, 68, 84, 79, 91, 88, 101, 96, 116]
  const today = new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date())

  return (
    <div className="page page--overview">
      <PageHeader
        eyebrow={today}
        title={`Good morning, ${user.name.split(' ')[0]}.`}
        description="A simple view of your projects, money, and the few things that need you."
        action={
          <button className="button button--primary" onClick={onCreateAutomation}>
            <Icon name="plus" size={16} />
            New project
          </button>
        }
      />

      <section className="command-card">
        <div className="command-card__glow" aria-hidden="true" />
        <div className="command-card__header">
          <div className="command-orb">
            <BrandMark compact />
          </div>
          <div>
            <span className="micro-label">Quick task</span>
            <h2>What would you like to move forward?</h2>
          </div>
        </div>
        <form className="command-box" onSubmit={onDispatch}>
          <textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder="Describe a task, such as preparing a client update or following up on an invoice…"
            rows={2}
          />
          <div className="command-box__footer">
            <label className="automation-select">
              <span className="automation-select__dot" />
              <select
                aria-label="Choose an automation"
                value={selectedAutomation}
                onChange={(event) => onAutomationChange(event.target.value)}
              >
                {automations.map((automation) => (
                  <option key={automation.id} value={automation.id}>
                    {automation.name}
                  </option>
                ))}
              </select>
              <Icon name="chevron-down" size={14} />
            </label>
            <button
              className="dispatch-button"
              type="submit"
              disabled={busy || !prompt.trim()}
              aria-label="Start task"
            >
              {busy ? <span className="spinner" /> : <Icon name="arrow-up-right" size={18} />}
            </button>
          </div>
        </form>
        <div className="prompt-suggestions">
          <span>Quick starts:</span>
          <button onClick={() => onPromptChange('Turn the Ember Gin feedback into a revision checklist')}>
            Make a revision list
          </button>
          <button onClick={() => onPromptChange('Prepare a friendly reminder for the overdue Casa Lumbre invoice')}>
            Follow up an invoice
          </button>
          <button onClick={() => onPromptChange('Prepare a short client update for every project due this week')}>
            Draft client updates
          </button>
        </div>
      </section>

      <section className="metric-grid" aria-label="Workspace metrics">
        <article className="metric-card">
          <div className="metric-card__top">
            <span>Open projects</span>
            <span className="metric-icon metric-icon--lime">
              <Icon name="layers" size={17} />
            </span>
          </div>
          <strong>{analytics?.openProjects ?? 0}</strong>
          <div className="metric-card__bottom">
            <span className="trend trend--up">{analytics?.dueSoonProjects ?? 0} due soon</span>
            <span>across {analytics?.totalClients ?? 0} clients</span>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-card__top">
            <span>Outstanding</span>
            <span className="metric-icon metric-icon--violet">
              <Icon name="activity" size={17} />
            </span>
          </div>
          <strong>R {(analytics?.outstandingAmount ?? 0) > 0 ? ((analytics!.outstandingAmount / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : '0.00'}</strong>
          <div className="metric-card__bottom">
            <span className="trend trend--up">{analytics?.pendingInvoices ?? 0} invoices</span>
            <span>awaiting payment</span>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-card__top">
            <span>Due this week</span>
            <span className="metric-icon metric-icon--blue">
              <Icon name="check-circle" size={17} />
            </span>
          </div>
          <strong>{analytics?.dueThisWeek ?? 0}</strong>
          <div className="metric-card__bottom">
            <span className="trend trend--up">{analytics?.dueSoonProjects ?? 0} due soon</span>
            <span>across {analytics?.totalClients ?? 0} clients</span>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-card__top">
            <span>Automations on</span>
            <span className="metric-icon metric-icon--coral">
              <Icon name="bot" size={17} />
            </span>
          </div>
          <strong>
            {activeAutomations}
            <small> / {automations.length}</small>
          </strong>
          <div className="metric-card__bottom">
            <span className="online-dot" />
            <span>Everything healthy</span>
          </div>
        </article>
      </section>

      <section className="overview-grid">
        <article className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h3>Studio rhythm</h3>
              <p>Work completed over the last 14 days</p>
            </div>
            <button className="period-button">
              14 days
              <Icon name="chevron-down" size={14} />
            </button>
          </div>
          <div className="chart-summary">
            <strong>46 tasks</strong>
            <span className="trend trend--up">8 ahead</span>
          </div>
          <div className="chart-wrap">
            <div className="chart-y-labels" aria-hidden="true">
              <span>120</span>
              <span>80</span>
              <span>40</span>
              <span>0</span>
            </div>
            <div className="bar-chart">
              {chartValues.map((value, index) => (
                <div className="bar-column" key={`${value}-${index}`}>
                  <span style={{ height: `${(value / 120) * 100}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div className="chart-dates" aria-hidden="true">
            <span>Jul 13</span>
            <span>Jul 17</span>
            <span>Jul 21</span>
            <span>Today</span>
          </div>
        </article>

        <article className="panel workforce-panel">
          <div className="panel-heading">
            <div>
              <h3>Saved automations</h3>
              <p>Small routines handling repeat work</p>
            </div>
            <button className="text-button" onClick={() => onNavigate('automations')}>
              View all <Icon name="arrow-right" size={14} />
            </button>
          </div>
          <div className="workforce-list">
            {automations.slice(0, 4).map((automation) => (
              <button
                className="workforce-row"
                key={automation.id}
                onClick={() => onNavigate('automations')}
              >
                <span className={`automation-avatar automation-avatar--${automation.accent}`}>
                  <Icon name={automation.icon as IconName} size={17} />
                </span>
                <span className="workforce-row__name">
                  <strong>{automation.name}</strong>
                  <small>{automation.lastRun}</small>
                </span>
                <StatusPill status={automation.status} />
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="panel runs-panel">
        <div className="panel-heading">
          <div>
            <h3>Recent activity</h3>
            <p>What changed across your business</p>
          </div>
          <button className="text-button" onClick={() => onNavigate('runs')}>
            View automation history <Icon name="arrow-right" size={14} />
          </button>
        </div>
        <RunsTable runs={runs.slice(0, 5)} />
      </section>
    </div>
  )
}

function RunsTable({ runs }: { runs: Run[] }) {
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Activity</th>
            <th>Automation</th>
            <th>Status</th>
            <th>Started</th>
            <th>Duration</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>
                <div className="run-title">
                  <span className="run-icon">
                    <Icon name={run.status === 'running' ? 'activity' : 'play'} size={14} />
                  </span>
                  <span>
                    <strong>{run.instruction}</strong>
                    <small>{run.id}</small>
                  </span>
                </div>
              </td>
              <td>{run.automationName}</td>
              <td>
                <StatusPill status={run.status} />
              </td>
              <td>{run.startedAt}</td>
              <td>{run.duration}</td>
              <td>
                <button className="icon-button icon-button--quiet" aria-label={`Open ${run.id}`}>
                  <Icon name="arrow-up-right" size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AutomationsPage({
  automations,
  busyId,
  onCreate,
  onToggle,
  onRun,
}: {
  automations: Automation[]
  busyId: string | null
  onCreate: () => void
  onToggle: (automation: Automation) => void
  onRun: (automation: Automation) => void
}) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | Automation['status']>('all')
  const filtered = automations.filter(
    (automation) =>
      (status === 'all' || automation.status === status) &&
      `${automation.name} ${automation.description}`.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div className="page">
      <PageHeader
        eyebrow="Repeatable routines"
        title="Automations"
        description="Save the repeat work you do every week, then run it manually or on a schedule."
        action={
          <button className="button button--primary" onClick={onCreate}>
            <Icon name="plus" size={16} /> New automation
          </button>
        }
      />

      <section className="automation-summary">
        <div>
          <span className="summary-dot summary-dot--active" />
          <strong>{automations.filter((automation) => automation.status === 'active').length}</strong>
          <span>Active</span>
        </div>
        <div>
          <span className="summary-dot summary-dot--paused" />
          <strong>{automations.filter((automation) => automation.status === 'paused').length}</strong>
          <span>Paused</span>
        </div>
        <div>
          <span className="summary-dot summary-dot--draft" />
          <strong>{automations.filter((automation) => automation.status === 'draft').length}</strong>
          <span>Draft</span>
        </div>
        <div className="automation-summary__health">
          <Icon name="shield" size={16} />
          <span>Automation health</span>
          <strong>Everything running</strong>
        </div>
      </section>

      <div className="toolbar">
        <label className="search-field">
          <Icon name="search" size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search automations..."
          />
        </label>
        <div className="filter-tabs">
          {(['all', 'active', 'paused', 'draft'] as const).map((item) => (
            <button
              key={item}
              className={status === item ? 'is-active' : ''}
              onClick={() => setStatus(item)}
            >
              {item.charAt(0).toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <section className="automation-grid">
        {filtered.map((automation) => (
          <article className="automation-card" key={automation.id}>
            <div className="automation-card__top">
              <span className={`automation-avatar automation-avatar--large automation-avatar--${automation.accent}`}>
                <Icon name={automation.icon as IconName} size={21} />
              </span>
              <div className="automation-card__actions">
                <StatusPill status={automation.status} />
                <button className="icon-button icon-button--quiet" aria-label="More automation actions">
                  <Icon name="more" size={17} />
                </button>
              </div>
            </div>
            <div className="automation-card__body">
              <h3>{automation.name}</h3>
              <p>{automation.description}</p>
              <div className="automation-model">
                <Icon name="layers" size={13} />
                {automation.model}
              </div>
            </div>
            <div className="automation-card__stats">
              <div>
                <span>Times run</span>
                <strong>{automation.runs.toLocaleString()}</strong>
              </div>
              <div>
                <span>Completed</span>
                <strong>{automation.successRate ? `${automation.successRate}%` : '—'}</strong>
              </div>
              <div>
                <span>Last used</span>
                <strong>{automation.lastRun}</strong>
              </div>
            </div>
            <div className="tool-stack">
              {automation.tools.map((tool) => (
                <span key={tool}>{tool}</span>
              ))}
              {automation.tools.length === 0 && <span>No tools connected</span>}
            </div>
            <div className="automation-card__footer">
              <button
                className="button button--secondary button--small"
                onClick={() => onToggle(automation)}
                disabled={busyId === automation.id}
              >
                {busyId === automation.id ? (
                  <span className="spinner spinner--dark" />
                ) : (
                  <Icon name={automation.status === 'active' ? 'pause' : 'play'} size={13} />
                )}
                {automation.status === 'active' ? 'Pause' : 'Activate'}
              </button>
              <button
                className="button button--dark button--small"
                onClick={() => onRun(automation)}
              >
                <Icon name="play" size={12} />
                Run now
              </button>
            </div>
          </article>
        ))}
        <button className="automation-card automation-card--new" onClick={onCreate}>
          <span className="new-automation-icon">
            <Icon name="plus" size={20} />
          </span>
          <strong>Create a useful routine</strong>
          <p>Start with a plain-language task or a simple template.</p>
        </button>
      </section>
    </div>
  )
}

function RunsPage({ runs }: { runs: Run[] }) {
  const [filter, setFilter] = useState<'all' | Run['status']>('all')
  const filtered = filter === 'all' ? runs : runs.filter((run) => run.status === filter)

  return (
    <div className="page">
      <PageHeader
        eyebrow="History"
        title="Automation activity"
        description="See what ran, what changed, and anything that still needs your attention."
        action={
          <button className="button button--secondary">
            <Icon name="calendar" size={16} /> Last 30 days
            <Icon name="chevron-down" size={14} />
          </button>
        }
      />

      <section className="run-stat-grid">
        <article>
          <span>Tasks this month</span>
          <strong>36</strong>
          <small className="trend trend--up">8 more than June</small>
        </article>
        <article>
          <span>Time returned</span>
          <strong>6h 24m</strong>
          <small>Mostly admin and follow-ups</small>
        </article>
        <article>
          <span>Needs attention</span>
          <strong>1</strong>
          <small>Client file permission expired</small>
        </article>
        <article>
          <span>Connected routines</span>
          <strong>3</strong>
          <small>n8n, email, and storage</small>
        </article>
      </section>

      <section className="panel runs-page-panel">
        <div className="runs-toolbar">
          <div className="filter-tabs">
            {(['all', 'running', 'completed', 'failed'] as const).map((item) => (
              <button
                key={item}
                className={filter === item ? 'is-active' : ''}
                onClick={() => setFilter(item)}
              >
                {item.charAt(0).toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
          <button className="button button--secondary button--small">
            <Icon name="filter" size={14} /> Filters
          </button>
        </div>
        <RunsTable runs={filtered} />
      </section>
    </div>
  )
}

function IntegrationLogo({ integration }: { integration: Integration }) {
  const marks: Record<string, ReactNode> = {
    slack: (
      <span className="logo-slack">
        <i />
        <i />
        <i />
        <i />
      </span>
    ),
    hubspot: <span className="logo-letter">H</span>,
    figma: <span className="logo-letter">Fi</span>,
    email: <span className="logo-letter">@</span>,
    stripe: <span className="logo-letter">S</span>,
    paypal: <span className="logo-letter">P</span>,
    paystack: <span className="logo-letter">PS</span>,
    dropbox: <span className="logo-letter">Db</span>,
    notion: <span className="logo-notion">N</span>,
    github: <span className="logo-letter">GH</span>,
    drive: <span className="logo-drive" />,
    linear: <span className="logo-linear" />,
    n8n: (
      <span className="logo-n8n">
        <i />
        <i />
        <i />
      </span>
    ),
    mcp: (
      <span className="logo-mcp">
        <i />
        <i />
        <i />
        <i />
      </span>
    ),
  }
  return (
    <span className="integration-logo" style={{ '--integration-accent': integration.accent } as React.CSSProperties}>
      {marks[integration.icon]}
    </span>
  )
}

function IntegrationsPage({
  integrations,
  busyId,
  onToggle,
  onConfigureN8n,
  onConfigureMcp,
  onOpenMoney,
  onToast,
}: {
  integrations: Integration[]
  busyId: string | null
  onToggle: (integration: Integration) => void
  onConfigureN8n: () => void
  onConfigureMcp: () => void
  onOpenMoney: () => void
  onToast: (message: string) => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const categories = ['All', 'Payments', 'Design', 'Storage', 'Automation', 'Communication']
  const filtered = integrations.filter(
    (integration) =>
      (category === 'All' || integration.category === category) &&
      `${integration.name} ${integration.description}`.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div className="page">
      <PageHeader
        eyebrow="Your tools, together"
        title="Connections"
        description="Bring in the apps you already use. lancee keeps the work connected without replacing them."
        action={
          <button
            className="button button--secondary"
            onClick={() => onToast('Integration request form opened in demo mode')}
          >
            <Icon name="plus" size={16} /> Request a connection
          </button>
        }
      />

      <section className="integration-banner">
        <div className="integration-banner__icon">
          <Icon name="plug" size={24} />
        </div>
        <div>
          <span className="micro-label">Connection health</span>
          <h2>Your everyday tools, in one view.</h2>
          <p>
            {integrations.filter((item) => item.connected && item.id !== 'mcp-grid').length}{' '}
            tools are connected, plus the built-in service connector.
          </p>
        </div>
        <div className="integration-banner__status">
          <span className="online-dot" />
          All connections healthy
        </div>
      </section>

      <div className="toolbar integrations-toolbar">
        <label className="search-field">
          <Icon name="search" size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search connections..."
          />
        </label>
        <div className="category-select">
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <Icon name="chevron-down" size={14} />
        </div>
      </div>

      <section className="integration-grid">
        {filtered.map((integration) => (
          <article className="integration-card" key={integration.id}>
            <div className="integration-card__top">
              <IntegrationLogo integration={integration} />
              {integration.id === 'mcp-grid' ? (
                <span className="platform-label">
                  <Icon name="shield" size={12} /> Included
                </span>
              ) : integration.connected ? (
                <span className="connected-label">
                  <Icon name="check" size={12} /> Connected
                </span>
              ) : null}
            </div>
            <span className="integration-category">{integration.category}</span>
            <h3>{integration.name}</h3>
            <p>{integration.description}</p>
            {integration.id === 'n8n' && (
              <div className="protocol-badges" aria-label="Supported HTTP methods">
                <span>GET</span>
                <span>POST</span>
                <small>Bidirectional</small>
              </div>
            )}
            {integration.id === 'mcp-grid' && (
              <div className="protocol-badges protocol-badges--mcp" aria-label="MCP features">
                <span>MCP</span>
                <span>Built in</span>
                <small>Managed service access</small>
              </div>
            )}
            <button
              className={`button ${
                integration.id === 'mcp-grid'
                  ? 'button--dark'
                  : integration.connected
                    ? 'button--secondary'
                    : 'button--dark'
              }`}
              onClick={() => {
                if (integration.id === 'n8n') onConfigureN8n()
                else if (integration.id === 'mcp-grid') onConfigureMcp()
                else if (integration.id === 'paystack') onOpenMoney()
                else if (integration.category === 'Payments') {
                  onToast(`Configure ${integration.name} from the connections page`)
                }
                else onToggle(integration)
              }}
              disabled={busyId === integration.id}
            >
              {busyId === integration.id ? (
                <span className={`spinner${integration.connected ? ' spinner--dark' : ''}`} />
              ) : (
                <Icon
                  name={
                    integration.id === 'mcp-grid'
                      ? 'shield'
                      : integration.connected
                      ? integration.id === 'n8n' || integration.id === 'mcp-grid'
                        ? 'settings'
                        : 'plug'
                      : 'plus'
                  }
                  size={15}
                />
              )}
              {integration.id === 'mcp-grid'
                ? 'Manage platform access'
                : integration.id === 'n8n' && integration.connected
                  ? 'Configure'
                  : integration.id === 'paystack'
                    ? 'Manage in Money'
                  : integration.category === 'Payments'
                    ? 'Preview setup'
                  : integration.connected
                    ? 'Disconnect'
                    : 'Connect'}
            </button>
          </article>
        ))}
      </section>
    </div>
  )
}

function N8nIntegrationForm({
  config,
  connected,
  onSave,
  onTest,
  onDisconnect,
  onCancel,
  onToast,
}: {
  config: N8nConfig
  connected: boolean
  onSave: (input: N8nConfigInput) => Promise<void>
  onTest: (
    direction: N8nDirection,
    method: N8nMethod,
  ) => Promise<N8nTestResult>
  onDisconnect: () => Promise<void>
  onCancel: () => void
  onToast: (message: string) => void
}) {
  const [outboundUrl, setOutboundUrl] = useState(config.outboundUrl)
  const [signingSecret, setSigningSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [testing, setTesting] = useState('')
  const [error, setError] = useState('')
  const [results, setResults] = useState<Partial<Record<string, N8nTestResult>>>({})
  const [deliveries, setDeliveries] = useState<N8nDelivery[]>([])
  const [retrying, setRetrying] = useState('')

  useEffect(() => {
    if (!connected) {
      setDeliveries([])
      return
    }
    void api.n8n
      .listDeliveries()
      .then(setDeliveries)
      .catch(() => undefined)
  }, [connected])

  const runTest = async (direction: N8nDirection, method: N8nMethod) => {
    const testId = `${direction}-${method}`
    setError('')
    setTesting(testId)
    try {
      const result = await onTest(direction, method)
      setResults((current) => ({ ...current, [testId]: result }))
      setDeliveries((current) => [
        result.delivery,
        ...current.filter((delivery) => delivery.id !== result.delivery.id),
      ])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The webhook test failed.')
    } finally {
      setTesting('')
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSave({
        outboundUrl,
        methods: ['GET', 'POST'],
        signingSecret,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the integration.')
    } finally {
      setSaving(false)
    }
  }

  const disconnect = async () => {
    setDisconnecting(true)
    await onDisconnect()
    setDisconnecting(false)
  }

  const retryDelivery = async (delivery: N8nDelivery) => {
    setError('')
    setRetrying(delivery.id)
    try {
      const retried = await api.n8n.retry(delivery.id)
      setDeliveries((current) => [retried, ...current])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The n8n retry failed.')
    } finally {
      setRetrying('')
    }
  }

  const copyCallback = () => {
    void navigator.clipboard?.writeText(config.callbackUrl)
    onToast('n8n callback URL copied')
  }

  const renderTest = (direction: N8nDirection, method: N8nMethod) => {
    const testId = `${direction}-${method}`
    const result = results[testId]
    return (
      <button
        className={`webhook-test webhook-test--${method.toLowerCase()}${result ? ' is-success' : ''}`}
        type="button"
        onClick={() => void runTest(direction, method)}
        disabled={Boolean(testing) || !connected}
      >
        {testing === testId ? (
          <span className="spinner spinner--dark" />
        ) : result ? (
          <Icon name="check" size={13} />
        ) : (
          <Icon name="play" size={11} />
        )}
        <strong>{method}</strong>
        <span>
          {result
            ? `${result.status} · ${result.latency}ms`
            : direction === 'from-n8n'
              ? 'Verify signing'
              : 'Send delivery'}
        </span>
      </button>
    )
  }

  return (
    <form className="n8n-form" onSubmit={submit}>
      <div className="n8n-intro">
        <span className="n8n-intro__logo">
          <span className="logo-n8n">
            <i />
            <i />
            <i />
          </span>
        </span>
        <div>
          <strong>Bidirectional webhook bridge</strong>
          <p>
            lancee can trigger n8n, and n8n can trigger lancee. Both directions accept GET
            and POST with the same signing secret.
          </p>
        </div>
        <span className={`connection-state${connected ? ' is-connected' : ''}`}>
          <span />
          {connected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      <div className="webhook-directions">
        <section className="webhook-direction">
          <div className="webhook-direction__heading">
            <span>
              <Icon name="arrow-up-right" size={18} />
            </span>
            <div>
              <small>Outbound</small>
              <h3>lancee → n8n</h3>
            </div>
          </div>
          <p>Send project events or manual triggers to an n8n production webhook.</p>
          <label className="form-field">
            <span>n8n webhook URL</span>
            <input
              value={outboundUrl}
              onChange={(event) => setOutboundUrl(event.target.value)}
              placeholder="https://n8n.hygridtech.co.za/webhook/lancee"
              type="url"
              required
            />
          </label>
          <div className="webhook-direction__tests">
            {renderTest('to-n8n', 'GET')}
            {renderTest('to-n8n', 'POST')}
          </div>
        </section>

        <div className="direction-bridge" aria-hidden="true">
          <span />
          <Icon name="arrow-right" size={14} />
          <Icon name="arrow-right" size={14} />
          <span />
        </div>

        <section className="webhook-direction">
          <div className="webhook-direction__heading">
            <span>
              <Icon name="arrow-up-right" size={18} />
            </span>
            <div>
              <small>Inbound</small>
              <h3>n8n → lancee</h3>
            </div>
          </div>
          <p>
            Use this endpoint in an n8n HTTP Request node. The controls below verify the
            stored signing and nonce contract without impersonating n8n.
          </p>
          <label className="form-field">
            <span>Generated lancee callback</span>
            <span className="copy-field">
              <input value={config.callbackUrl} readOnly aria-label="Generated lancee callback" />
              <button type="button" onClick={copyCallback} aria-label="Copy callback URL">
                <Icon name="copy" size={15} />
              </button>
            </span>
          </label>
          <div className="webhook-direction__tests">
            {renderTest('from-n8n', 'GET')}
            {renderTest('from-n8n', 'POST')}
          </div>
        </section>
      </div>

      <section className="webhook-security">
        <div className="webhook-security__heading">
          <span>
            <Icon name="shield" size={17} />
          </span>
          <div>
            <strong>Request security</strong>
            <p>
              AES-GCM encrypted secret, timestamp, nonce, method, path, and body hash.
            </p>
          </div>
        </div>
        <label className="form-field">
          <span>Shared signing secret</span>
          <input
            value={signingSecret}
            onChange={(event) => setSigningSecret(event.target.value)}
            placeholder={
              config.signingSecretConfigured
                ? 'Leave blank to keep the encrypted secret'
                : 'Enter at least 32 characters'
            }
            required={!config.signingSecretConfigured}
            minLength={config.signingSecretConfigured ? undefined : 32}
          />
        </label>
        <div className="method-support">
          <span>
            <Icon name="check" size={12} /> GET enabled
          </span>
          <span>
            <Icon name="check" size={12} /> POST enabled
          </span>
          <code>X-Lancee-Signature</code>
          <code>X-Lancee-Timestamp</code>
          <code>X-Lancee-Nonce</code>
        </div>
      </section>

      {connected && (
        <section className="n8n-history">
          <div className="n8n-history__heading">
            <div>
              <strong>Durable delivery attempts</strong>
              <p>Successes, failures, inbound accepts, and explicit retries.</p>
            </div>
            <span>{deliveries.length} recent</span>
          </div>
          <div className="n8n-history__list">
            {deliveries.slice(0, 8).map((delivery) => (
              <article key={delivery.id}>
                <span className={`delivery-state delivery-state--${delivery.status}`}>
                  {delivery.status}
                </span>
                <div>
                  <strong>
                    {delivery.direction} · {delivery.method} · {delivery.eventType}
                  </strong>
                  <small>
                    attempt {delivery.attemptNumber} · {delivery.correlationId}
                  </small>
                </div>
                <span>
                  {delivery.responseStatus || '—'}
                  {delivery.duration !== null ? ` · ${delivery.duration}ms` : ''}
                </span>
                {delivery.direction === 'outbound' && delivery.status === 'failed' && (
                  <button
                    className="button button--secondary button--small"
                    type="button"
                    disabled={retrying === delivery.id}
                    onClick={() => void retryDelivery(delivery)}
                  >
                    {retrying === delivery.id ? (
                      <span className="spinner spinner--dark" />
                    ) : (
                      <Icon name="activity" size={13} />
                    )}
                    Retry
                  </button>
                )}
              </article>
            ))}
            {deliveries.length === 0 && (
              <p className="n8n-history__empty">No delivery attempts yet.</p>
            )}
          </div>
        </section>
      )}

      {error && <p className="form-error n8n-error">{error}</p>}

      <div className="n8n-form__footer">
        <div>
          {connected && (
            <button
              className="button button--danger button--small"
              type="button"
              onClick={() => void disconnect()}
              disabled={disconnecting}
            >
              {disconnecting ? <span className="spinner spinner--dark" /> : <Icon name="plug" size={14} />}
              Disconnect
            </button>
          )}
        </div>
        <div>
          <button className="button button--secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="button button--primary" type="submit" disabled={saving}>
            {saving ? <span className="spinner spinner--dark" /> : <Icon name="check" size={15} />}
            {connected ? 'Save configuration' : 'Connect n8n'}
          </button>
        </div>
      </div>
    </form>
  )
}

function McpIntegrationPanel({
  connection,
  services,
  onRequestAccess,
  onSync,
  onToggle,
  onInvoke,
  onRevokeAccess,
  onClose,
}: {
  connection: McpConnection
  services: McpService[]
  onRequestAccess: () => Promise<void>
  onSync: () => Promise<void>
  onToggle: (service: McpService) => Promise<void>
  onInvoke: (service: McpService, toolId: string) => Promise<McpInvocationResult>
  onRevokeAccess: () => Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [results, setResults] = useState<Partial<Record<string, McpInvocationResult>>>({})
  const toolCount = services.reduce((total, service) => total + service.tools.length, 0)
  const activeCount = services.filter((service) => service.active).length
  const accessApproved = connection.accessStatus === 'approved'
  const accessPending = connection.accessStatus === 'pending'

  const requestAccess = async () => {
    setError('')
    setBusy('request')
    try {
      await onRequestAccess()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to request bearer access.')
    } finally {
      setBusy('')
    }
  }

  const sync = async () => {
    setError('')
    setBusy('sync')
    try {
      await onSync()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sync MCP services.')
    } finally {
      setBusy('')
    }
  }

  const toggle = async (service: McpService) => {
    setError('')
    setBusy(service.id)
    try {
      await onToggle(service)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update the service.')
    } finally {
      setBusy('')
    }
  }

  const invoke = async (service: McpService) => {
    const preferredTool =
      service.id === 'browser-worker'
        ? 'website_smoke_test'
        : service.tools[0]?.id
    if (!preferredTool) return
    setError('')
    setBusy(`test-${service.id}`)
    try {
      const result = await onInvoke(service, preferredTool)
      setResults((current) => ({ ...current, [service.id]: result }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The MCP tool call failed.')
    } finally {
      setBusy('')
    }
  }

  const revokeAccess = async () => {
    setBusy('revoke')
    await onRevokeAccess()
    setBusy('')
  }

  return (
    <div className="mcp-panel">
      <section className="mcp-connection">
        <div className="mcp-connection__mark">
          <span className="logo-mcp">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="mcp-connection__identity">
          <span className="micro-label">Included platform capability</span>
          <h3>MCP Service Grid</h3>
          <p>
            Every lancee workspace can browse the catalog and request managed bearer
            access—without configuring a server URL or API key.
          </p>
        </div>
        <span className={`connection-state${accessApproved ? ' is-connected' : ''}${accessPending ? ' is-pending' : ''}`}>
          <span />
          {accessApproved
            ? 'Bearer access active'
            : accessPending
              ? 'Approval pending'
              : 'Included'}
        </span>
      </section>

      <div className="mcp-route-strip">
        <div>
          <span>DNS gateway</span>
          <code>{connection.gatewayUrl}</code>
        </div>
        <Icon name="arrow-right" size={15} />
        <div>
          <span>Discovery</span>
          <code>{connection.capabilityEndpoint}</code>
        </div>
        <Icon name="arrow-right" size={15} />
        <div>
          <span>Authentication</span>
          <strong>
            <Icon name="shield" size={13} />
            {accessApproved
              ? 'Managed bearer grant'
              : accessPending
                ? 'Request pending'
                : 'Request required'}
          </strong>
        </div>
      </div>

      <section className={`mcp-access-state mcp-access-state--${connection.accessStatus}`}>
        <span className="mcp-access-state__icon">
          <Icon name={accessApproved ? 'check-circle' : accessPending ? 'activity' : 'key'} size={22} />
        </span>
        <div>
          <span className="micro-label">Workspace access</span>
          <h3>
            {accessApproved
              ? 'Your bearer grant is active'
              : accessPending
                ? 'Your access request is being reviewed'
                : 'Request bearer access once'}
          </h3>
          <p>
            {accessApproved
              ? 'Approved services can now be activated for automations. The platform injects the bearer credential only during server-side calls.'
              : accessPending
                ? 'The MCP catalog remains visible while access is pending. lancee will enable service activation when the grant is approved.'
                : 'No endpoint, token, or individual API key setup is required. Submit one request and lancee handles the secure server-to-server connection.'}
          </p>
        </div>
        {connection.accessStatus === 'available' ? (
          <button
            className="button button--primary"
            type="button"
            onClick={() => void requestAccess()}
            disabled={busy === 'request'}
          >
            {busy === 'request' ? (
              <span className="spinner spinner--dark" />
            ) : (
              <Icon name="key" size={15} />
            )}
            Request bearer access
          </button>
        ) : (
          <span className={`mcp-access-badge${accessApproved ? ' is-approved' : ''}`}>
            <Icon name={accessApproved ? 'check' : 'activity'} size={13} />
            {accessApproved ? 'Access approved' : 'Request submitted'}
          </span>
        )}
      </section>

      <div className="mcp-service-toolbar">
        <div>
          <strong>{services.length} platform services</strong>
          <span>{toolCount} executable tools · {activeCount} activated</span>
        </div>
        <div>
          <span className="runtime-verified">
            <Icon name="check-circle" size={13} /> Runtime catalog
          </span>
          <button
            className="button button--secondary button--small"
            type="button"
            onClick={() => void sync()}
            disabled={busy === 'sync' || !accessApproved}
            title={accessApproved ? 'Refresh live MCP services' : 'Bearer access is required'}
          >
            {busy === 'sync' ? (
              <span className="spinner spinner--dark" />
            ) : (
              <Icon name="activity" size={14} />
            )}
            Sync services
          </button>
        </div>
      </div>

      <section className="mcp-service-grid">
        {services.map((service) => {
          const result = results[service.id]
          return (
            <article
              className={`mcp-service-card${service.active ? ' is-active' : ''}${!accessApproved ? ' is-locked' : ''}`}
              key={service.id}
            >
              <div className="mcp-service-card__top">
                <span className={`mcp-service-icon mcp-service-icon--${service.category.toLowerCase()}`}>
                  <Icon
                    name={
                      service.category === 'Browser'
                        ? 'search'
                        : service.category === 'Text'
                          ? 'file'
                          : service.category === 'Data'
                            ? 'layers'
                            : 'code'
                    }
                    size={18}
                  />
                </span>
                <div className="mcp-service-card__title">
                  <span>
                    <i />
                    Live
                  </span>
                  <h4>{service.name}</h4>
                  <code>{service.id}</code>
                </div>
                <button
                  className={`service-switch${service.active ? ' is-active' : ''}`}
                  type="button"
                  role="switch"
                  aria-checked={service.active}
                  aria-label={`${service.active ? 'Deactivate' : 'Activate'} ${service.name}`}
                  onClick={() => void toggle(service)}
                  disabled={busy === service.id || !accessApproved}
                  title={accessApproved ? undefined : 'Request bearer access to activate'}
                >
                  <span />
                </button>
              </div>
              <p>{service.description}</p>
              <div className="mcp-tool-preview">
                {service.tools.slice(0, 3).map((tool) => (
                  <span key={tool.id}>{tool.name}</span>
                ))}
                {service.tools.length > 3 && (
                  <span>+{service.tools.length - 3} tools</span>
                )}
              </div>
              <div className="mcp-service-card__footer">
                <span>
                  <Icon name={accessApproved ? 'key' : 'shield'} size={12} />
                  {accessApproved ? service.credentialMode : 'Bearer access required'}
                </span>
                {service.active && (
                  <button
                    type="button"
                    onClick={() => void invoke(service)}
                    disabled={busy === `test-${service.id}`}
                  >
                    {busy === `test-${service.id}` ? (
                      <span className="spinner spinner--dark" />
                    ) : result ? (
                      <Icon name="check" size={12} />
                    ) : (
                      <Icon name="play" size={11} />
                    )}
                    {result ? `${result.duration}ms` : 'Test tool'}
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </section>

      <div className="mcp-call-note">
        <Icon name="shield" size={17} />
        <div>
          <strong>The browser never receives the bearer token</strong>
          <p>
            Activated tools use the stable <code>POST /api/v1/tools/:tool_id/call</code>{' '}
            route. lancee injects the workspace grant server-side, and the MCP service
            resolves any predefined API keys inside its own vault.
          </p>
        </div>
      </div>

      {error && <p className="form-error n8n-error">{error}</p>}

      <div className="mcp-panel__footer">
        <div>
          {accessApproved && (
            <button
              className="button button--danger button--small"
              type="button"
              onClick={() => void revokeAccess()}
              disabled={busy === 'revoke'}
            >
              {busy === 'revoke' ? (
                <span className="spinner spinner--dark" />
              ) : (
                <Icon name="key" size={14} />
              )}
              Revoke bearer access
            </button>
          )}
        </div>
        <button className="button button--secondary" type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}

function ApiPage({
  keys,
  onCreate,
  onRevoke,
  onToast,
}: {
  keys: ApiKey[]
  onCreate: () => void
  onRevoke: (key: ApiKey) => void
  onToast: (message: string) => void
}) {
  const sampleCode = `curl https://agents.hygridtech.co.za/api/v1/workspace \\
  -H "Authorization: Bearer $LANCEE_API_KEY"`
  const formatTimestamp = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(value))
      : 'Never'

  return (
    <div className="page">
      <PageHeader
        eyebrow="Advanced connections"
        title="API keys"
        description="Authenticate server-side requests to the lancee API."
        action={
          <button className="button button--primary" onClick={onCreate}>
            <Icon name="plus" size={16} /> Create API key
          </button>
        }
      />

      <section className="security-note">
        <span>
          <Icon name="shield" size={20} />
        </span>
        <div>
          <strong>Treat your keys like passwords.</strong>
          <p>
            Keep them out of client-side code and public repositories. Keys are shown only
            once when created.
          </p>
        </div>
      </section>

      <section className="panel keys-panel">
        <div className="panel-heading">
          <div>
            <h3>Secret keys</h3>
            <p>{keys.length} active keys in this workspace</p>
          </div>
        </div>
        <div className="key-list">
          {keys.map((key) => (
            <div className="key-row" key={key.id}>
              <span className="key-icon">
                <Icon name="key" size={18} />
              </span>
              <div className="key-name">
                <strong>{key.name}</strong>
                <code>{key.prefix}</code>
                <small className="key-permissions">{key.permissions.join(' · ')}</small>
              </div>
              <div>
                <span>Created</span>
                <strong>{formatTimestamp(key.createdAt)}</strong>
              </div>
              <div>
                <span>Last used</span>
                <strong>{formatTimestamp(key.lastUsedAt)}</strong>
              </div>
              <button
                className="icon-button icon-button--danger"
                aria-label={`Revoke ${key.name} key`}
                onClick={() => onRevoke(key)}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          {keys.length === 0 && (
            <div className="empty-state">
              <Icon name="key" size={24} />
              <strong>No active API keys</strong>
              <p>Create a key when you’re ready to make your first API call.</p>
            </div>
          )}
        </div>
      </section>

      <section className="api-quickstart">
        <div>
          <span className="micro-label">Quick start</span>
          <h2>Make your first request</h2>
          <p>
            Use an environment variable for your key, then read the authenticated
            workspace profile.
          </p>
          <a className="text-button" href="/lancee.html" target="_blank" rel="noopener">
            API documentation <Icon name="arrow-up-right" size={14} />
          </a>
        </div>
        <div className="code-window">
          <div className="code-window__top">
            <span>
              <i />
              <i />
              <i />
            </span>
            <small>Terminal</small>
            <button
              aria-label="Copy API example"
              onClick={() => {
                void navigator.clipboard?.writeText(sampleCode)
                onToast('API example copied')
              }}
            >
              <Icon name="copy" size={14} />
            </button>
          </div>
          <pre>
            <code>
              <span>curl</span> https://agents.hygridtech.co.za/api/v1/workspace \<br />
              {'  '}-H <em>&quot;Authorization: Bearer $LANCEE_API_KEY&quot;</em>
            </code>
          </pre>
        </div>
      </section>
    </div>
  )
}

function SettingsPage({
  user,
  onToast,
}: {
  user: User
  onToast: (message: string) => void
}) {
  const [workspace, setWorkspace] = useState(user.workspace)
  const [email, setEmail] = useState(user.email)
  const [saving, setSaving] = useState(false)
  const [dbInfo, setDbInfo] = useState<{
    provider: string
    mode: string
    version: string
    status: string
    tablesCount: number
  } | null>(null)

  useEffect(() => {
    api.workspace.getSettings().then((settings) => {
      if (settings.name) setWorkspace(settings.name)
      if (settings.email) setEmail(settings.email)
    })
    api.database.getInfo().then(setDbInfo).catch(() => undefined)
  }, [])

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    try {
      await api.workspace.updateSettings({ name: workspace, email })
      onToast('Workspace settings saved')
    } catch {
      onToast('Failed to save workspace settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page settings-page">
      <PageHeader
        eyebrow="Your account"
        title="Settings & Database"
        description="Manage your workspace details, security, and PostgreSQL database configuration."
      />
      <div className="settings-layout">
        <aside className="settings-nav">
          <button className="is-active">
            <Icon name="grid" size={16} /> General
          </button>
          <button>
            <Icon name="user" size={16} /> Collaborators
          </button>
          <button>
            <Icon name="shield" size={16} /> Security
          </button>
          <button>
            <Icon name="activity" size={16} /> Plan & usage
          </button>
        </aside>
        <div className="settings-content">
          <form className="settings-card" onSubmit={save}>
            <div className="settings-card__heading">
              <h3>Workspace profile</h3>
              <p>Used on shared work, invoices, and client-facing pages.</p>
            </div>
            <div className="workspace-logo-field">
              <span>AO</span>
              <div>
                <button type="button" className="button button--secondary button--small">
                  Change logo
                </button>
                <small>PNG or JPG. Maximum 2 MB.</small>
              </div>
            </div>
            <label className="form-field">
              <span>Workspace name</span>
              <input value={workspace} onChange={(event) => setWorkspace(event.target.value)} />
            </label>
            <label className="form-field">
              <span>Owner email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <div className="form-footer">
              <button className="button button--dark" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>

          <section className="settings-card">
            <div className="settings-card__heading">
              <h3>PostgreSQL Database Backend</h3>
              <p>Database storage engine and real-time schema status.</p>
            </div>
            <div className="setting-row">
              <span className="setting-row__icon">
                <Icon name="layers" size={18} />
              </span>
              <div>
                <strong>{dbInfo?.provider || 'PostgreSQL'} Engine</strong>
                <p>{dbInfo?.mode || 'PostgreSQL Engine'} · {dbInfo?.tablesCount || 22} Tables Initialized</p>
              </div>
              <span className="configured-label" style={{ background: 'rgba(67, 189, 244, 0.15)', color: '#0070ba' }}>
                {dbInfo?.status || 'Connected'}
              </span>
            </div>
            <div className="setting-row">
              <span className="setting-row__icon">
                <Icon name="code" size={18} />
              </span>
              <div>
                <strong>ANSI SQL & Parameterized Drivers</strong>
                <p>Version: {dbInfo?.version || '16.2 Compliant'} · Sub-millisecond latency</p>
              </div>
              <button className="button button--secondary button--small" onClick={() => onToast('PostgreSQL connection healthy')}>
                Check Health
              </button>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card__heading">
              <h3>Authentication</h3>
              <p>Control access to your business workspace.</p>
            </div>
            <div className="setting-row">
              <span className="setting-row__icon">
                <Icon name="shield" size={18} />
              </span>
              <div>
                <strong>Email and password</strong>
                <p>Protected by the live lancee server session</p>
              </div>
              <span className="configured-label">Configured</span>
            </div>
            <div className="setting-row">
              <span className="setting-row__icon">
                <Icon name="key" size={18} />
              </span>
              <div>
                <strong>Travel & timezone</strong>
                <p>Keep client deadlines and reminders in their local time</p>
              </div>
              <button className="button button--secondary button--small">Review</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function LandingPage({ onSignIn }: { onSignIn: () => void }) {
  return (
    <main className="landing">
      <header className="landing-nav">
        <a className="landing-brand" href="#top" aria-label="lancee home">
          <BrandMark />
          <span>lancee</span>
        </a>
        <nav aria-label="Public navigation">
          <a href="#platform">What it does</a>
          <a href="#workflow">How it works</a>
          <a href="#integrations">Connections</a>
          <a href="#security">Security</a>
        </nav>
        <div>
          <button className="landing-sign-in" onClick={onSignIn}>
            Sign in
          </button>
          <button className="button button--primary" onClick={onSignIn}>
            Open lancee <Icon name="arrow-up-right" size={14} />
          </button>
        </div>
      </header>

      <section className="landing-hero" id="top">
        <div className="landing-hero__glow" aria-hidden="true" />
        <div className="landing-hero__copy">
          <span className="landing-eyebrow">
            <i /> Your work · ideas · tools · money
          </span>
          <h1>
            Run your business.
            <br />
            <em>Keep your freedom.</em>
          </h1>
          <p>
            One calm place for client work, ideas, useful automations, connected tools,
            invoices, and payments—wherever you happen to be working.
          </p>
          <div className="landing-hero__actions">
            <button className="button button--primary" onClick={onSignIn}>
              Start your workspace <Icon name="arrow-right" size={15} />
            </button>
            <a href="#platform">
              See how it helps <Icon name="arrow-right" size={14} />
            </a>
          </div>
          <div className="landing-trust">
            <span>
              <Icon name="briefcase" size={14} /> Built for independent work
            </span>
            <span>
              <Icon name="wallet" size={14} /> From brief to paid
            </span>
            <span>
              <Icon name="plug" size={14} /> Works with your tools
            </span>
          </div>
        </div>

        <div className="landing-product" aria-label="lancee product preview">
          <div className="landing-product__top">
            <div>
              <BrandMark compact />
              <span>lancee today</span>
            </div>
            <span className="landing-live">
              <i /> 3 projects moving
            </span>
          </div>
          <div className="landing-command-preview">
            <div>
              <Icon name="sparkles" size={17} />
              <span>Turn the Ember Gin feedback into a clean revision checklist.</span>
            </div>
            <button aria-label="Dispatch example task">
              <Icon name="arrow-up-right" size={16} />
            </button>
          </div>
          <div className="landing-run">
            <div className="landing-run__automation">
              <span className="automation-avatar automation-avatar--lime">
                <Icon name="briefcase" size={17} />
              </span>
              <span>
                <strong>Kalahari Ember Gin</strong>
                <small>Client feedback ready to review</small>
              </span>
            </div>
            <span className="landing-run__status">
              <i /> Due today
            </span>
            <div className="landing-run__progress">
              <span />
            </div>
          </div>
          <div className="landing-mini-grid">
            <article>
              <span>Open projects</span>
              <strong>8</strong>
              <small>3 due this week</small>
            </article>
            <article>
              <span>Outstanding</span>
              <strong>R46.2k</strong>
              <small>2 invoices</small>
            </article>
            <article>
              <span>Automations</span>
              <strong>3</strong>
              <small>All healthy</small>
            </article>
          </div>
          <div className="landing-activity">
            <span>Your studio rhythm</span>
            <div>
              {[32, 45, 39, 58, 53, 72, 65, 84, 76, 92, 88, 100].map(
                (height, index) => (
                  <i key={`${height}-${index}`} style={{ height: `${height}%` }} />
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="landing-proof">
        <span>One workspace for</span>
        <div>
          <strong>Clients</strong>
          <strong>Projects</strong>
          <strong>Ideas</strong>
          <strong>Automations</strong>
          <strong>Invoices</strong>
        </div>
      </section>

      <section className="landing-section landing-platform" id="platform">
        <div className="landing-section__heading">
          <span className="landing-eyebrow">The small-business operating space</span>
          <h2>Everything around the work, finally in one place.</h2>
          <p>
            lancee keeps projects, inspiration, admin, and money connected without
            turning your business into a complicated system.
          </p>
        </div>
        <div className="landing-feature-grid">
          <article className="landing-feature landing-feature--command">
            <span className="landing-feature__icon">
              <Icon name="briefcase" size={20} />
            </span>
            <span className="landing-feature__number">01</span>
            <h3>Keep client work together</h3>
            <p>
              Briefs, references, decisions, deadlines, files, and approvals stay with
              the project they belong to.
            </p>
            <div className="feature-prompt">
              <span>Kalahari Ember Gin · In review</span>
              <Icon name="arrow-up-right" size={14} />
            </div>
          </article>
          <article className="landing-feature landing-feature--connect">
            <span className="landing-feature__icon">
              <Icon name="lightbulb" size={20} />
            </span>
            <span className="landing-feature__number">02</span>
            <h3>Catch ideas anywhere</h3>
            <p>
              Save visual references, notes, colours, and loose thoughts on a flexible
              canvas, then connect the strongest ideas to real work.
            </p>
            <div className="feature-connections">
              <span>Notes</span>
              <span>Images</span>
              <span>Palettes</span>
              <span>+ Files</span>
            </div>
          </article>
          <article className="landing-feature landing-feature--observe">
            <span className="landing-feature__icon">
              <Icon name="wallet" size={20} />
            </span>
            <span className="landing-feature__number">03</span>
            <h3>Finish the job and get paid</h3>
            <p>
              Turn approved work into a clear invoice and let clients pay through the
              provider that works best for both of you.
            </p>
            <div className="feature-events">
              <span>
                <i /> Invoice sent
              </span>
              <span>
                <i /> Payment received
              </span>
            </div>
          </article>
        </div>
      </section>

      <section className="landing-workflow" id="workflow">
        <div className="landing-workflow__copy">
          <span className="landing-eyebrow">From first idea to paid invoice</span>
          <h2>A natural flow for the way independent work really happens.</h2>
          <p>
            Do the creative work yourself. Let lancee carry the context, surface the next
            step, and quietly handle only the repeatable parts you choose.
          </p>
          <div className="workflow-steps">
            <div>
              <span>1</span>
              <div>
                <strong>Capture the brief and ideas</strong>
                <p>Keep inspiration and client constraints close from the start.</p>
              </div>
            </div>
            <div>
              <span>2</span>
              <div>
                <strong>Move the project forward</strong>
                <p>Track feedback, files, approvals, and the next useful action.</p>
              </div>
            </div>
            <div>
              <span>3</span>
              <div>
                <strong>Deliver, invoice, and get paid</strong>
                <p>Connect finished work directly to billing and payment status.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="landing-workflow__visual">
          <div className="workflow-automation-card">
            <span className="automation-avatar automation-avatar--violet">
              <Icon name="messages" size={17} />
            </span>
            <div>
              <small>ACTIVE PROJECT</small>
              <strong>Juniper & Tide</strong>
            </div>
            <span className="status-pill status-pill--active">
              <i className="status-dot" /> Active
            </span>
          </div>
          <div className="workflow-path">
            <span />
            <i />
            <span />
          </div>
          <div className="workflow-tool-row">
            <span>
              <Icon name="lightbulb" size={15} /> Ideas
            </span>
            <span>
              <Icon name="file" size={15} /> Client files
            </span>
            <span>
              <Icon name="plug" size={15} /> Print partner
            </span>
          </div>
          <div className="workflow-result">
            <span>
              <Icon name="check" size={15} />
            </span>
            <div>
              <small>OUTCOME</small>
              <strong>Final artwork delivered</strong>
              <p>Invoice sent · payment link included</p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-integrations" id="integrations">
        <div className="landing-section__heading">
          <span className="landing-eyebrow">Keep the tools that already work</span>
          <h2>Connect what you use. Ignore what you don’t.</h2>
          <p>
            Storage, design, communication, automation, and payment services meet in one
            understandable workspace.
          </p>
        </div>
        <div className="landing-integration-row">
          <article>
            <span className="landing-stack-logo">
              <Icon name="wallet" size={20} />
            </span>
            <div>
              <small>GET PAID</small>
              <h3>Stripe · PayPal · Paystack</h3>
              <p>Give every client a practical way to pay.</p>
            </div>
            <Icon name="arrow-up-right" size={17} />
          </article>
          <article>
            <span className="integration-logo">
              <span className="logo-mcp">
                <i />
                <i />
                <i />
                <i />
              </span>
            </span>
            <div>
              <small>USEFUL AUTOMATION</small>
              <h3>n8n + service connector</h3>
              <p>Run repeatable tasks across approved tools when you need them.</p>
            </div>
            <Icon name="arrow-up-right" size={17} />
          </article>
          <article>
            <span className="landing-stack-logo">
              <Icon name="layers" size={20} />
            </span>
            <div>
              <small>YOUR EVERYDAY TOOLS</small>
              <h3>Design, files, calendar, email</h3>
              <p>Keep using the specialist apps that make your work better.</p>
            </div>
            <Icon name="arrow-up-right" size={17} />
          </article>
        </div>
      </section>

      <section className="landing-security" id="security">
        <div className="landing-security__mark">
          <Icon name="shield" size={29} />
        </div>
        <div>
          <span className="landing-eyebrow">Security by design</span>
          <h2>Your business stays yours.</h2>
          <p>
            Credentials stay server-side, connections are explicitly activated, and
            automated actions remain visible and under your control.
          </p>
        </div>
        <div className="landing-security__points">
          <span>
            <Icon name="check" size={13} /> HTTP-only sessions
          </span>
          <span>
            <Icon name="check" size={13} /> Server-side secrets
          </span>
          <span>
            <Icon name="check" size={13} /> Scoped capabilities
          </span>
          <span>
            <Icon name="check" size={13} /> Review before sending
          </span>
        </div>
      </section>

      <section className="landing-cta">
        <BrandMark />
        <span className="landing-eyebrow">A lighter way to run your business</span>
        <h2>Carry the whole studio. Not the whole workload.</h2>
        <button className="button button--primary" onClick={onSignIn}>
          Enter lancee <Icon name="arrow-right" size={15} />
        </button>
      </section>

      <footer className="landing-footer">
        <a className="landing-brand" href="#top">
          <BrandMark />
          <span>lancee</span>
        </a>
        <p>Work freely. Stay organised. Get paid.</p>
        <div>
          <a href="#security">Security</a>
          <a href="#integrations">Connections</a>
          <button onClick={onSignIn}>Sign in</button>
        </div>
        <small>© 2026 Hookitup Solutions</small>
      </footer>
    </main>
  )
}

function AuthScreen({
  onSignIn,
  onRegister,
  onBack,
}: {
  onSignIn: (email: string, password: string) => Promise<void>
  onRegister: (email: string, password: string, name?: string, workspace?: string) => Promise<void>
  onBack: () => void
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [workspace, setWorkspace] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await onSignIn(email, password)
      } else {
        await onRegister(email, password, name || undefined, workspace || undefined)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Unable to ${mode}.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="auth-story__top">
          <button className="auth-logo" onClick={onBack}>
            <BrandMark />
            <span>lancee</span>
          </button>
          <span className="demo-badge">
            <span /> Secure workspace
          </span>
        </div>
        <div className="auth-story__content">
          <span className="auth-kicker">Your business, carried lightly</span>
          <h1>
            Keep the work.
            <br />
            Lose the <em>busywork.</em>
          </h1>
          <p>
            Clients, projects, ideas, useful routines, invoices, and payments&mdash;ready
            wherever your work takes you.
          </p>
          <div className="auth-proof">
            <div>
              <strong>8</strong>
              <span>Projects in one clear view</span>
            </div>
            <div>
              <strong>R46.2k</strong>
              <span>Outstanding invoices tracked</span>
            </div>
          </div>
        </div>
        <div className="auth-story__visual" aria-hidden="true">
          <div className="orbit orbit--one" />
          <div className="orbit orbit--two" />
          <div className="orbit-center">
            <BrandMark compact />
          </div>
          <span className="orbit-node orbit-node--one">
            <Icon name="messages" size={17} />
          </span>
          <span className="orbit-node orbit-node--two">
            <Icon name="file" size={17} />
          </span>
          <span className="orbit-node orbit-node--three">
            <Icon name="target" size={17} />
          </span>
        </div>
        <p className="auth-quote">
          &ldquo;I can land in a new city and know exactly what needs me, what can wait, and
          what has been paid.&rdquo;
          <span>&mdash; Amara, independent packaging designer</span>
        </p>
      </section>
      <section className="auth-form-panel">
        <form className="auth-form" onSubmit={submit}>
          <div>
            <img
              className="auth-form__wordmark"
              src="/img/logo_with_name.png"
              alt="lancee"
            />
            <span className="auth-form__eyebrow">{mode === 'login' ? 'Welcome back' : 'Get started'}</span>
            <h2>{mode === 'login' ? 'Sign in to lancee' : 'Create your workspace'}</h2>
            <p>{mode === 'login' ? 'Use the email and password for your business workspace.' : 'Enter your details to start using lancee.'}</p>
          </div>
          <div className="auth-security-note">
            <Icon name="shield" size={17} />
            Protected by an encrypted, HTTP-only workspace session.
          </div>
          {mode === 'register' && (
            <>
              <label className="form-field">
                <span>Your name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Alex Rivera"
                  autoFocus
                />
              </label>
              <label className="form-field">
                <span>Workspace / Studio name</span>
                <input
                  type="text"
                  value={workspace}
                  onChange={(event) => setWorkspace(event.target.value)}
                  placeholder="e.g. Rivera Design Studio"
                />
              </label>
            </>
          )}
          <label className="form-field">
            <span>Email address</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="form-field">
            <span>
              Password
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => setError('Contact the workspace owner to reset access.')}
                >
                  Forgot password?
                </button>
              )}
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={8}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="button button--primary auth-submit" type="submit" disabled={busy}>
            {busy ? <span className="spinner spinner--dark" /> : mode === 'login' ? 'Sign in' : 'Create workspace'}
            {!busy && <Icon name="arrow-right" size={16} />}
          </button>
          <p className="auth-signup">
            {mode === 'login' ? (
              <button type="button" onClick={() => { setMode('register'); setError('') }}>
                <Icon name="arrow-right" size={12} /> Don&rsquo;t have an account? Create one
              </button>
            ) : (
              <button type="button" onClick={() => { setMode('login'); setError('') }}>
                <Icon name="arrow-right" size={12} /> Already have an account? Sign in
              </button>
            )}
          </p>
          <small className="auth-terms">
            By continuing, you agree to the Terms of Service and Privacy Policy.
          </small>
        </form>
      </section>
    </main>
  )
}

function Modal({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string
  description: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal${wide ? ' modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal__heading">
          <div>
            <h2 id="modal-title">{title}</h2>
            <p>{description}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}

function CreateAutomationForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: Pick<Automation, 'name' | 'description' | 'model'>) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [model, setModel] = useState('Rules + connected tools')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    await onSubmit({ name, description, model })
    setBusy(false)
  }

  return (
    <form className="modal-form" onSubmit={submit}>
      <label className="form-field">
        <span>Automation name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Send proof reminders"
          autoFocus
          required
        />
      </label>
      <label className="form-field">
        <span>What should happen?</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Describe the trigger, the useful outcome, and anything you want to approve first."
          rows={4}
          required
        />
      </label>
      <label className="form-field">
        <span>How it should run</span>
        <select value={model} onChange={(event) => setModel(event.target.value)}>
          <option>Rules + connected tools</option>
          <option>Scheduled workflow</option>
          <option>AI-assisted, with review</option>
        </select>
      </label>
      <div className="modal-form__footer">
        <button className="button button--secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="button button--primary" type="submit" disabled={busy}>
          {busy ? <span className="spinner spinner--dark" /> : <Icon name="sparkles" size={15} />}
          Create automation
        </button>
      </div>
    </form>
  )
}

function CreateKeyForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string, permissions: ApiKeyPermission[]) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [permissions, setPermissions] = useState<ApiKeyPermission[]>(['workspace:read'])
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    try {
      await onSubmit(name, permissions)
    } finally {
      setBusy(false)
    }
  }

  const togglePermission = (permission: ApiKeyPermission) => {
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    )
  }

  return (
    <form className="modal-form" onSubmit={submit}>
      <label className="form-field">
        <span>Key name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Production server"
          autoFocus
          required
        />
        <small>Choose a name that identifies where this key will be used.</small>
      </label>
      <div className="permission-box">
        <span>
          <Icon name="shield" size={17} />
        </span>
        <div>
          <strong>Scoped permissions</strong>
          <p>Grant only the read access this server needs.</p>
          <div className="permission-options">
            <label>
              <input
                type="checkbox"
                checked={permissions.includes('workspace:read')}
                onChange={() => togglePermission('workspace:read')}
              />
              <span>
                <strong>Workspace profile</strong>
                <small>workspace:read</small>
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={permissions.includes('mcp:read')}
                onChange={() => togglePermission('mcp:read')}
              />
              <span>
                <strong>MCP access state</strong>
                <small>mcp:read</small>
              </span>
            </label>
          </div>
        </div>
      </div>
      <div className="modal-form__footer">
        <button className="button button--secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="button button--primary"
          type="submit"
          disabled={busy || permissions.length === 0}
        >
          {busy ? <span className="spinner spinner--dark" /> : <Icon name="key" size={15} />}
          Create secret key
        </button>
      </div>
    </form>
  )
}

function SecretModal({
  secret,
  onClose,
  onToast,
}: {
  secret: string
  onClose: () => void
  onToast: (message: string) => void
}) {
  return (
    <Modal
      title="Save your secret key"
      description="This key will only be shown once. Store it somewhere secure."
      onClose={onClose}
    >
      <div className="secret-box">
        <code>{secret}</code>
        <button
          className="icon-button"
          onClick={() => {
            void navigator.clipboard?.writeText(secret)
            onToast('Secret key copied')
          }}
          aria-label="Copy secret key"
        >
          <Icon name="copy" size={17} />
        </button>
      </div>
      <div className="secret-warning">
        <Icon name="alert" size={18} />
        You won’t be able to view this key again after closing this dialog.
      </div>
      <button className="button button--primary button--full" onClick={onClose}>
        I’ve saved my key
      </button>
    </Modal>
  )
}

function CommandPalette({
  open,
  onClose,
  onNavigate,
  onCreateAutomation,
}: {
  open: boolean
  onClose: () => void
  onNavigate: (page: Page) => void
  onCreateAutomation: () => void
}) {
  const [query, setQuery] = useState('')
  const filtered = navItems.filter((item) =>
    `${item.label} ${item.section}`.toLowerCase().includes(query.toLowerCase()),
  )
  if (!open) return null

  return (
    <div className="command-palette-backdrop" onMouseDown={onClose}>
      <section className="command-palette" onMouseDown={(event) => event.stopPropagation()}>
        <label>
          <Icon name="search" size={19} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages and actions..."
            autoFocus
          />
          <kbd>ESC</kbd>
        </label>
        <div className="command-results">
          <span className="command-group-label">Navigate</span>
          {filtered.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onNavigate(item.id)
                onClose()
              }}
            >
              <span>
                <Icon name={item.icon} size={17} />
              </span>
              {item.label}
              <small>{item.section}</small>
            </button>
          ))}
          <span className="command-group-label">Quick action</span>
          <button
            onClick={() => {
              onCreateAutomation()
              onClose()
            }}
          >
            <span>
              <Icon name="plus" size={17} />
            </span>
            Create a new automation
            <small>Action</small>
          </button>
        </div>
      </section>
    </div>
  )
}

function Sidebar({
  activePage,
  user,
  mobileOpen,
  onNavigate,
  onClose,
  onSignOut,
}: {
  activePage: Page
  user: User
  mobileOpen: boolean
  onNavigate: (page: Page) => void
  onClose: () => void
  onSignOut: () => void
}) {
  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onClose} />}
      <aside className={`sidebar${mobileOpen ? ' is-open' : ''}`}>
        <div className="sidebar__logo">
          <BrandMark />
          <span>lancee</span>
          <button className="sidebar-close" onClick={onClose} aria-label="Close navigation">
            <Icon name="close" />
          </button>
        </div>

        <button className="workspace-switcher">
          <span className="workspace-avatar">AO</span>
          <span>
            <strong>{user.workspace}</strong>
            <small>Business plan</small>
          </span>
          <Icon name="chevron-down" size={14} />
        </button>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {['Your work', 'Business', 'Platform'].map((section) => (
            <div className="nav-group" key={section}>
              <span className="nav-label">{section}</span>
              {navItems
                .filter((item) => item.section === section)
                .map((item) => (
                  <button
                    key={item.id}
                    className={activePage === item.id ? 'is-active' : ''}
                    onClick={() => {
                      onNavigate(item.id)
                      onClose()
                    }}
                  >
                    <Icon name={item.icon} size={17} />
                    {item.label}
                    {item.id === 'money' && <span className="nav-count">2</span>}
                  </button>
                ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__bottom">
          <div className="usage-card">
            <div>
              <span>This month</span>
              <strong>8 projects</strong>
            </div>
            <div className="usage-bar">
              <span />
            </div>
            <p>3 automations · 6 connected tools</p>
            <button>View your plan</button>
          </div>
          <a className="sidebar-help" href="/lancee.html" target="_blank" rel="noopener">
            <Icon name="help" size={17} />
            Help & documentation
            <Icon name="arrow-up-right" size={14} />
          </a>
          <button className="sidebar-profile" onClick={onSignOut}>
            <span>{user.initials}</span>
            <span>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
            <Icon name="logout" size={15} />
          </button>
        </div>
      </aside>
    </>
  )
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [authView, setAuthView] = useState<'landing' | 'login'>('landing')
  const [activePage, setActivePage] = useState<Page>('overview')
  const [automations, setAutomations] = useState<Automation[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [n8nConfig, setN8nConfig] = useState<N8nConfig | null>(null)
  const [mcpConnection, setMcpConnection] = useState<McpConnection | null>(null)
  const [mcpServices, setMcpServices] = useState<McpService[]>([])
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [analytics, setAnalytics] = useState<{
    openProjects: number; dueSoonProjects: number; totalClients: number
    outstandingAmount: number; pendingInvoices: number; dueThisWeek: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [prompt, setPrompt] = useState('')
  const [selectedAutomation, setSelectedAutomation] = useState('')
  const [dispatching, setDispatching] = useState(false)
  const [modal, setModal] = useState<ModalName>(null)
  const [createdSecret, setCreatedSecret] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [commandOpen, setCommandOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  useEffect(() => {
    let active = true

    void api.auth
      .session()
      .then((session) => {
        if (active && session) setUser(session)
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setSessionLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    void Promise.all([
      api.automations.list(),
      api.runs.list(),
      api.integrations.list(),
      api.n8n.getConfig(),
      api.mcp.getConnection(),
      api.mcp.listServices(),
      api.apiKeys.list(),
      api.analytics.get(),
    ])
      .then(
        ([
          automationData,
          runData,
          integrationData,
          n8nData,
          mcpConnectionData,
          mcpServiceData,
          keyData,
          analyticsData,
        ]) => {
          setAutomations(automationData)
          setRuns(runData)
          setIntegrations(
            integrationData.map((integration) =>
              integration.id === 'n8n'
                ? { ...integration, connected: n8nData.connected }
                : integration,
            ),
          )
          setN8nConfig(n8nData)
          setMcpConnection(mcpConnectionData)
          setMcpServices(mcpServiceData)
          setKeys(keyData)
          setAnalytics({
            openProjects: analyticsData.metrics.openProjects,
            dueSoonProjects: analyticsData.metrics.dueSoonProjects,
            totalClients: analyticsData.metrics.totalClients,
            outstandingAmount: analyticsData.metrics.outstandingAmount,
            pendingInvoices: analyticsData.metrics.pendingInvoices,
            dueThisWeek: analyticsData.metrics.dueThisWeek,
          })
          setSelectedAutomation((current) => current || automationData[0]?.id || '')
        },
      )
      .catch(() => {
        setToast('Some workspace data could not be loaded. Refresh to try again.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [user])

  useEffect(() => {
    if (!user) return
    const syncQueuedIdeas = () => {
      if (navigator.onLine) void syncIdeaMutations(user.workspaceId)
    }
    window.addEventListener('online', syncQueuedIdeas)
    window.addEventListener(IDEA_SYNC_REQUEST_EVENT, syncQueuedIdeas)
    syncQueuedIdeas()
    return () => {
      window.removeEventListener('online', syncQueuedIdeas)
      window.removeEventListener(IDEA_SYNC_REQUEST_EVENT, syncQueuedIdeas)
    }
  }, [user])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((open) => !open)
      }
      if (event.key === 'Escape') {
        setModal(null)
        setCreatedSecret('')
        setCommandOpen(false)
        setNotificationsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const pageLabel = useMemo(
    () =>
      navItems.find((item) => item.id === activePage)?.label ??
      ({ runs: 'Activity', api: 'API keys', settings: 'Settings' } as Partial<Record<Page, string>>)[activePage] ??
      'Home',
    [activePage],
  )

  const signIn = async (email: string, password: string) => {
    const session = await api.auth.signIn(email, password)
    setUser(session)
    setAuthView('landing')
    setActivePage('overview')
    setToast('Welcome back to lancee')
  }

  const register = async (email: string, password: string, name?: string, workspace?: string) => {
    const session = await api.auth.register(email, password, name, workspace)
    setUser(session)
    setAuthView('landing')
    setActivePage('overview')
    setToast('Your workspace is ready')
  }

  const signOut = async () => {
    await api.auth.signOut()
    setUser(null)
    setAuthView('landing')
    setNotificationsOpen(false)
  }

  const dispatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!prompt.trim() || !selectedAutomation) return
    setDispatching(true)
    try {
      const run = await api.runs.dispatch(selectedAutomation, prompt.trim())
      setRuns((current) => [run, ...current])
      setAutomations((current) =>
        current.map((automation) =>
          automation.id === run.automationId
            ? {
                ...automation,
                runs: automation.runs + 1,
                lastRun: 'Just now',
                status: 'active',
              }
            : automation,
        ),
      )
      setPrompt('')
    setToast(`${run.automationName} started`)
    } finally {
      setDispatching(false)
    }
  }

  const createAutomation = async (input: Pick<Automation, 'name' | 'description' | 'model'>) => {
    const automation = await api.automations.create(input)
    setAutomations((current) => [automation, ...current])
    setModal(null)
    setActivePage('automations')
    setToast(`${automation.name} was saved as a draft automation`)
  }

  const toggleAutomation = async (automation: Automation) => {
    setBusyId(automation.id)
    try {
      const updated = await api.automations.toggle(automation.id)
      setAutomations((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setToast(`${updated.name} is now ${updated.status}`)
    } finally {
      setBusyId(null)
    }
  }

  const runAutomation = (automation: Automation) => {
    setSelectedAutomation(automation.id)
    setPrompt(`Run ${automation.name} with its default workflow`)
    setActivePage('overview')
    setToast('Task prepared — review it, then start')
  }

  const toggleIntegration = async (integration: Integration) => {
    setBusyId(integration.id)
    try {
      const updated = await api.integrations.toggle(integration.id)
      setIntegrations((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
      setToast(
        `${updated.name} ${updated.connected ? 'connected' : 'disconnected'}`,
      )
    } finally {
      setBusyId(null)
    }
  }

  const saveN8nConfig = async (input: N8nConfigInput) => {
    const result = await api.n8n.configure(input)
    setN8nConfig(result.config)
    setIntegrations((current) =>
      current.map((integration) =>
        integration.id === result.integration.id ? result.integration : integration,
      ),
    )
    setToast('n8n configuration encrypted and saved')
  }

  const testN8n = async (
    direction: N8nDirection,
    method: N8nMethod,
  ) => {
    const result = await api.n8n.trigger(direction, method)
    setN8nConfig((current) =>
      current ? { ...current, lastDeliveryAt: new Date().toISOString() } : current,
    )
    setToast(`${result.message} · ${result.status}`)
    return result
  }

  const disconnectN8n = async () => {
    const result = await api.n8n.disconnect()
    setN8nConfig(result.config)
    setIntegrations((current) =>
      current.map((integration) =>
        integration.id === result.integration.id ? result.integration : integration,
      ),
    )
    setModal(null)
    setToast('n8n was disconnected')
  }

  const requestMcpAccess = async () => {
    const result = await api.mcp.requestAccess()
    setMcpConnection(result.connection)
    setMcpServices(result.services)
    setToast(
      result.connection.accessStatus === 'approved'
        ? 'MCP bearer access approved · services are ready to activate'
        : 'MCP bearer access request submitted for approval',
    )
  }

  const syncMcp = async () => {
    const result = await api.mcp.sync()
    setMcpConnection(result.connection)
    setMcpServices(result.services)
    setToast('MCP capabilities synced through the DNS gateway')
  }

  const toggleMcpService = async (service: McpService) => {
    const updated = await api.mcp.toggleService(service.id)
    setMcpServices((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    )
    setToast(`${updated.name} ${updated.active ? 'activated' : 'deactivated'}`)
  }

  const invokeMcpTool = async (service: McpService, toolId: string) => {
    const result = await api.mcp.invoke(service.id, toolId)
    setToast(`${result.message} · ${result.duration}ms`)
    return result
  }

  const revokeMcpAccess = async () => {
    const result = await api.mcp.revokeAccess()
    setMcpConnection(result.connection)
    setMcpServices(result.services)
    setToast('MCP bearer access was revoked; the platform feature remains available')
  }

  const createKey = async (name: string, permissions: ApiKeyPermission[]) => {
    const result = await api.apiKeys.create(name, permissions)
    setKeys((current) => [result.key, ...current])
    setModal(null)
    setCreatedSecret(result.secret)
  }

  const revokeKey = async (key: ApiKey) => {
    setBusyId(key.id)
    try {
      await api.apiKeys.revoke(key.id)
      setKeys((current) => current.filter((item) => item.id !== key.id))
      setToast(`${key.name} key revoked`)
    } finally {
      setBusyId(null)
    }
  }

  if (sessionLoading) {
    return (
      <main className="auth-boot" aria-label="Restoring secure session">
        <BrandMark />
        <span className="spinner spinner--dark" />
        <p>Restoring your secure workspace…</p>
      </main>
    )
  }

  if (!user) {
    return authView === 'landing' ? (
      <LandingPage onSignIn={() => setAuthView('login')} />
    ) : (
      <AuthScreen
        onSignIn={signIn}
        onRegister={register}
        onBack={() => {
          setAuthView('landing')
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />
    )
  }

  let page: ReactNode
  if (loading) {
    page = <EmptySkeleton />
  } else {
    switch (activePage) {
      case 'overview':
        page = (
          <OverviewPage
            user={user}
            automations={automations}
            runs={runs}
            prompt={prompt}
            selectedAutomation={selectedAutomation}
            busy={dispatching}
            analytics={analytics}
            onPromptChange={setPrompt}
            onAutomationChange={setSelectedAutomation}
            onDispatch={dispatch}
            onNavigate={setActivePage}
            onCreateAutomation={() => setActivePage('work')}
          />
        )
        break
      case 'work':
        page = (
          <WorkPage
            onToast={setToast}
          />
        )
        break
      case 'ideas':
        page = <IdeasCanvasPage workspaceId={user.workspaceId} />
        break
      case 'automations':
        page = (
          <AutomationsPage
            automations={automations}
            busyId={busyId}
            onCreate={() => setModal('automation')}
            onToggle={toggleAutomation}
            onRun={runAutomation}
          />
        )
        break
      case 'runs':
        page = <RunsPage runs={runs} />
        break
      case 'integrations':
        page = (
          <IntegrationsPage
            integrations={integrations}
            busyId={busyId}
            onToggle={toggleIntegration}
            onConfigureN8n={() => setModal('n8n')}
            onConfigureMcp={() => setModal('mcp')}
            onOpenMoney={() => setActivePage('money')}
            onToast={setToast}
          />
        )
        break
      case 'money':
        page = <MoneyPage />
        break
      case 'analytics':
        page = <AnalyticsPage />
        break
      case 'team':
        page = <TeamPage />
        break
      case 'api':
        page = (
          <ApiPage
            keys={keys}
            onCreate={() => setModal('key')}
            onRevoke={revokeKey}
            onToast={setToast}
          />
        )
        break
      case 'settings':
        page = <SettingsPage user={user} onToast={setToast} />
        break
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        user={user}
        mobileOpen={mobileOpen}
        onNavigate={setActivePage}
        onClose={() => setMobileOpen(false)}
        onSignOut={() => void signOut()}
      />
      <div className="app-main">
        <header className="topbar">
          <div className="topbar__left">
            <button
              className="mobile-menu-button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Icon name="menu" />
            </button>
            <span className="breadcrumb-workspace">{user.workspace}</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{pageLabel}</strong>
          </div>
          <div className="topbar__right">
            <button className="global-search" onClick={() => setCommandOpen(true)}>
              <Icon name="search" size={16} />
              <span>Search anything</span>
              <kbd>
                <Icon name="command" size={11} /> K
              </kbd>
            </button>
            <div className="notification-wrap">
              <button
                className="icon-button"
                aria-label="Notifications"
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <Icon name="bell" size={18} />
                <span className="notification-dot" />
              </button>
              {notificationsOpen && (
                <div className="notification-popover">
                  <div>
                    <strong>Notifications</strong>
                    <button onClick={() => setNotificationsOpen(false)}>Mark all read</button>
                  </div>
                  <button>
                    <span className="notification-icon notification-icon--lime">
                      <Icon name="check" size={14} />
                    </span>
                    <span>
                      <strong>Ember Gin feedback is ready</strong>
                      <small>2 minutes ago</small>
                    </span>
                  </button>
                  <button>
                    <span className="notification-icon notification-icon--coral">
                      <Icon name="alert" size={14} />
                    </span>
                    <span>
                      <strong>Casa Lumbre invoice is overdue</strong>
                      <small>Yesterday at 4:18 PM</small>
                    </span>
                  </button>
                </div>
              )}
            </div>
            <button className="topbar-avatar" onClick={() => setActivePage('settings')}>
              {user.initials}
            </button>
          </div>
        </header>
        <main className="content">{page}</main>
      </div>

      {modal === 'automation' && (
        <Modal
          title="Create an automation"
          description="Start with the repetitive task. Add tools, timing, and approval only where useful."
          onClose={() => setModal(null)}
        >
          <CreateAutomationForm onSubmit={createAutomation} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal === 'key' && (
        <Modal
          title="Create an API key"
          description="Use this key to authenticate requests from your server."
          onClose={() => setModal(null)}
        >
          <CreateKeyForm onSubmit={createKey} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal === 'n8n' && n8nConfig && (
        <Modal
          title="Configure n8n"
          description="Connect signed webhooks that can trigger workflows in both directions."
          onClose={() => setModal(null)}
          wide
        >
          <N8nIntegrationForm
            config={n8nConfig}
            connected={Boolean(
              integrations.find((integration) => integration.id === 'n8n')?.connected,
            )}
            onSave={saveN8nConfig}
            onTest={testN8n}
            onDisconnect={disconnectN8n}
            onCancel={() => setModal(null)}
            onToast={setToast}
          />
        </Modal>
      )}
      {modal === 'mcp' && mcpConnection && (
        <Modal
          title="Service connector"
          description="Request secure access, then turn on only the backend services your workflows need."
          onClose={() => setModal(null)}
          wide
        >
          <McpIntegrationPanel
            connection={mcpConnection}
            services={mcpServices}
            onRequestAccess={requestMcpAccess}
            onSync={syncMcp}
            onToggle={toggleMcpService}
            onInvoke={invokeMcpTool}
            onRevokeAccess={revokeMcpAccess}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
      {createdSecret && (
        <SecretModal
          secret={createdSecret}
          onClose={() => setCreatedSecret('')}
          onToast={setToast}
        />
      )}
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onNavigate={setActivePage}
        onCreateAutomation={() => setModal('automation')}
      />
      {toast && (
        <div className="toast" role="status">
          <span>
            <Icon name="check" size={14} />
          </span>
          {toast}
        </div>
      )}
    </div>
  )
}

export default App
