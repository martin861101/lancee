import {
  Suspense,
  lazy,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import gsap from 'gsap'
import {
  api,
  type Automation,
  type ApiKey,
  type ApiKeyPermission,
  type CodexConnection,
  type CodexDeviceAuthorization,
  type CodexDeviceLogin,
  type CodexRuntimeEvent,
  type CodexRuntimeStatus,
  type Integration,
  type IntegrationRequest,
  type OpenConnectorProvider,
  type OpenConnectorStatus,
  type McpConnection,
  type McpInvocationResult,
  type McpService,
  type N8nConfig,
  type N8nConfigInput,
  type N8nDelivery,
  type N8nDirection,
  type N8nMethod,
  type N8nTestResult,
  type PaystackConnection,
  type Run,
  type RunEvent,
  type User,
  type WorkspaceMembership,
  type WorkspaceBuilderPayload,
  type WorkspaceBuilderState,
  type WorkspaceContext,
  type WorkspaceNotification,
  type WhatsAppStatus,
} from './lib/api'
import { syncIdeaMutations } from './lib/ideasRepository'
import { IDEA_SYNC_REQUEST_EVENT } from './pwa'
import { applyTheme, getStoredTheme, toggleTheme, type Theme } from './lib/theme'
import { useDialogFocus } from './lib/useDialogFocus'
import type { WorkflowTemplate } from './components/WorkflowsPage'
import { BUSINESS_IDENTITY } from './lib/business'
import Icon, { type IconName } from './components/AppIcon'
import BrandMark from './components/BrandMark'
import HeroWorkspacePreview from './components/marketing/HeroWorkspacePreview'
import ConnectedWorkspacePanel from './components/marketing/ConnectedWorkspacePanel'
import './components/marketing.css'

const IdeasCanvasPage = lazy(() => import('./components/IdeasCanvasPage'))
const OverviewPage = lazy(() => import('./components/OverviewPage'))
const MoneyPage = lazy(() => import('./components/MoneyPage'))
const WorkPage = lazy(() => import('./components/WorkPage'))
const ClientsPage = lazy(() => import('./components/dashboard/ClientsPage'))
const ConnectedIntelligencePage = lazy(() => import('./components/intelligence/ConnectedIntelligencePage'))
const TeamPage = lazy(() => import('./components/dashboard/TeamPage'))
const FilesPage = lazy(() => import('./components/dashboard/FilesPage'))
const MessagesPage = lazy(() => import('./components/dashboard/MessagesPage'))
const DairyPage = lazy(() => import('./components/dashboard/DairyPage'))
const WorkspaceChat = lazy(() => import('./components/dashboard/WorkspaceChat'))
const WorkflowsPage = lazy(() => import('./components/WorkflowsPage'))
const WorkspaceBuilder = lazy(() => import('./components/workspace-builder/WorkspaceBuilder'))
const ReviewPage = lazy(() => import('./components/annotations/ReviewPage'))
const GuestMeetingPage = lazy(() => import('./components/meetings/GuestMeetingPage'))
const PricingPage = lazy(() => import('./components/pricing/PricingPage'))
const PricingLanding = lazy(() => import('./components/pricing/PricingLanding'))
const AdminPage = lazy(() => import('./components/admin/AdminPage'))
import FeaturesPage from './components/FeaturesPage'

const SIDEBAR_STORAGE_KEY = 'lancee:sidebar-collapsed'

function getStoredSidebarState() {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

type Page =
  | 'overview'
  | 'clients'
  | 'work'
  | 'ideas'
  | 'automations'
  | 'workflows'
  | 'storefront'
  | 'runs'
  | 'integrations'
  | 'services'
  | 'money'
  | 'analytics'
  | 'intelligence'
  | 'files'
  | 'messages'
  | 'dairy'
  | 'team'
  | 'builder'
  | 'api'
  | 'pricing'
  | 'settings'
  | 'admin'
const pageIds = new Set<Page>([
  'overview',
  'clients',
  'work',
  'ideas',
  'automations',
  'workflows',
  'storefront',
  'runs',
  'integrations',
  'services',
  'money',
  'analytics',
  'intelligence',
  'files',
  'messages',
  'dairy',
  'team',
  'builder',
  'api',
  'pricing',
  'settings',
  'admin',
])

const legacyDashboardPageAliases: Partial<Record<Page, Page>> = {
  analytics: 'intelligence',
  workflows: 'automations',
  services: 'integrations',
  storefront: 'overview',
}

function canonicalDashboardPage(page: Page) {
  return legacyDashboardPageAliases[page] || page
}
type ModalName =
  | 'automation'
  | 'key'
  | 'n8n'
  | 'mcp'
  | 'codex-ai'
  | 'codex-runtime'
  | 'paystack'
  | 'google-workspace'
  | 'whatsapp'
  | 'integration-request'
  | null

const navItems: { id: Page; label: string; icon: IconName; section: string; modules?: string[]; adminOnly?: boolean }[] = [
  { id: 'overview', label: 'Home', icon: 'grid', section: 'Your work' },
  { id: 'clients', label: 'Clients', icon: 'user', section: 'Your work', modules: ['clients', 'client-portal'] },
  { id: 'work', label: 'Projects', icon: 'briefcase', section: 'Your work', modules: ['projects', 'tasks', 'calendar'] },
  { id: 'ideas', label: 'Ideas', icon: 'lightbulb', section: 'Your work', modules: ['whiteboard', 'notes'] },
  { id: 'files', label: 'Files', icon: 'file', section: 'Your work', modules: ['files', 'annotations', 'knowledge-base'] },
  { id: 'messages', label: 'Messages', icon: 'messages', section: 'Your work', modules: ['clients', 'client-portal'] },
  { id: 'dairy', label: 'Diary', icon: 'calendar', section: 'Your work' },
  { id: 'automations', label: 'Automations & Workflows', icon: 'activity', section: 'Business', modules: ['workflows'] },
  { id: 'money', label: 'Invoicing', icon: 'wallet', section: 'Business', modules: ['quotes', 'invoices', 'time-tracking'] },
  { id: 'intelligence', label: 'Intelligence', icon: 'sparkles', section: 'Business' },
  { id: 'team', label: 'Team', icon: 'user', section: 'Platform' },
  { id: 'settings', label: 'Preferences', icon: 'settings', section: 'Platform' },
  { id: 'admin', label: 'Admin', icon: 'shield', section: 'Platform', adminOnly: true },
]



function UserAvatar({ user, className = '' }: { user: User; className?: string }) {
  const classes = `user-avatar ${className}`.trim()
  if (user.avatarUrl) {
    return <img className={classes} src={user.avatarUrl} alt="" />
  }
  return <span className={`${classes} user-avatar--fallback`}>{user.initials}</span>
}

type LandingTool = 'gmail' | 'calendar' | 'drive' | 'slack' | 'zoom' | 'stripe' | 'paypal' | 'paystack'

function LandingToolLogo({ name }: { name: LandingTool }) {
  const labels: Record<LandingTool, string> = {
    gmail: 'Gmail',
    calendar: 'Google Calendar',
    drive: 'Google Drive',
    slack: 'Slack',
    zoom: 'Zoom',
    stripe: 'Stripe',
    paypal: 'PayPal',
    paystack: 'Paystack',
  }

  return (
    <span
      className={`landing-tool-logo landing-tool-logo--${name}`}
      aria-label={labels[name]}
      role="img"
    >
      <BrandIcon name={name} />
    </span>
  )
}

function LandingAmbientRings() {
  return (
    <div className="landing-ambient-rings" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  )
}
void LandingToolLogo

type BrandName = 'gmail' | 'calendar' | 'drive' | 'docs' | 'sheets' | 'slack' | 'zoom' | 'stripe' | 'paypal' | 'paystack' | 'github' | 'outlook' | 'notion' | 'onedrive' | 'dropbox' | 'linear' | 'figma' | 'asana' | 'trello' | 'teams'

const BRAND_ALIASES: Record<string, BrandName> = {
  gmail: 'gmail',
  'google-mail': 'gmail',
  calendar: 'calendar',
  gcal: 'calendar',
  'google-calendar': 'calendar',
  google_calendar: 'calendar',
  drive: 'drive',
  'google-drive': 'drive',
  google_drive: 'drive',
  docs: 'docs',
  'google-docs': 'docs',
  google_docs: 'docs',
  sheets: 'sheets',
  'google-sheets': 'sheets',
  google_sheets: 'sheets',
  slack: 'slack',
  zoom: 'zoom',
  stripe: 'stripe',
  paypal: 'paypal',
  paystack: 'paystack',
  github: 'github',
  outlook: 'outlook',
  notion: 'notion',
  onedrive: 'onedrive',
  'one-drive': 'onedrive',
  one_drive: 'onedrive',
  'microsoft-onedrive': 'onedrive',
  dropbox: 'dropbox',
  linear: 'linear',
  figma: 'figma',
  asana: 'asana',
  trello: 'trello',
  teams: 'teams',
  'microsoft-teams': 'teams',
  'ms-teams': 'teams',
  microsoft_teams: 'teams',
}

const BRAND_MARKS: Record<BrandName, ReactNode> = {
  gmail: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285f4" d="M3 19V8.1l4 3V19Z" />
      <path fill="#34a853" d="M17 19v-7.9l4-3V19Z" />
      <path fill="#fbbc04" d="M3 8.1V6.5c0-1.5 1.7-2.3 2.9-1.4L12 9.7 18.1 5c1.2-.9 2.9 0 2.9 1.4v1.6l-9 6.8Z" />
      <path fill="#ea4335" d="m3.7 5.3 8.3 6.3 8.3-6.3c.4.3.7.7.7 1.2v1.6l-9 6.8-9-6.8V6.5c0-.5.3-1 .7-1.2Z" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285f4" d="M5 2h14a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z" />
      <path fill="#fff" d="M7 8h10v9H7z" />
      <path fill="#34a853" d="M2 8h5v9H2z" />
      <path fill="#fbbc04" d="M7 17h10v5H7z" />
      <path fill="#ea4335" d="M17 8h5v9h-5z" />
      <path fill="#4285f4" d="M9.2 11.4v1.3h2.1c-.2 1-1 1.5-2.1 1.5a2.2 2.2 0 1 1 0-4.4c.6 0 1.1.2 1.5.6l1-1a3.6 3.6 0 1 0-2.5 6.2c2.1 0 3.5-1.5 3.5-3.5 0-.3 0-.5-.1-.7Z" />
    </svg>
  ),
  drive: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#0f9d58" d="M8.2 3h7.6l6.1 10.6h-7.6Z" />
      <path fill="#f4b400" d="m8.2 3 3.8 6.6-6.1 10.6-3.8-6.6Z" />
      <path fill="#4285f4" d="M5.9 20.2 9.7 13h12.2l-3.8 7.2Z" />
    </svg>
  ),
  docs: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#4285f4" />
      <path fill="#fff" d="M7.5 6h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1 0-1Zm0 3h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1 0-1Zm0 3h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1 0-1Zm0 3h5.5a.5.5 0 0 1 0 1H7.5a.5.5 0 0 1 0-1Z" />
    </svg>
  ),
  sheets: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#34a853" />
      <path fill="#fff" d="M7.5 7h9v10h-9V7Zm1.2 1.2v2.3h3.1V8.2H8.7Zm4.3 0v2.3h3.1V8.2h-3.1ZM8.7 11.6v2.3h3.1v-2.3H8.7Zm4.3 0v2.3h3.1v-2.3h-3.1ZM8.7 15v1.9h3.1V15H8.7Zm4.3 0v1.9h3.1V15h-3.1Z" />
    </svg>
  ),
  slack: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect fill="#36c5f0" x="10.2" y="2" width="3.7" height="9" rx="1.8" />
      <rect fill="#2eb67d" x="13" y="10.2" width="9" height="3.7" rx="1.8" />
      <rect fill="#ecb22e" x="10.2" y="13" width="3.7" height="9" rx="1.8" />
      <rect fill="#e01e5a" x="2" y="10.2" width="9" height="3.7" rx="1.8" />
    </svg>
  ),
  zoom: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect fill="#2d8cff" x="2" y="4" width="20" height="16" rx="5" />
      <path fill="#fff" d="M6 8h7.5A2.5 2.5 0 0 1 16 10.5V16H8.5A2.5 2.5 0 0 1 6 13.5Zm10 3 3-2v6l-3-2Z" />
    </svg>
  ),
  stripe: <strong className="brand-wordmark brand-wordmark--stripe">stripe</strong>,
  paypal: <strong className="brand-wordmark brand-wordmark--paypal"><i>P</i>P</strong>,
  paystack: <strong className="brand-wordmark brand-wordmark--paystack"><i />paystack</strong>,
  github: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path fill="#181717" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  ),
  outlook: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#0078d4" />
      <path fill="#fff" d="M12 6.2a5.8 5.8 0 1 1 0 11.6 5.8 5.8 0 0 1 0-11.6Zm0 2.5a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Z" />
    </svg>
  ),
  notion: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="5.5" fill="#1f1f1f" />
      <path fill="#fff" d="M8.6 7h1.7v6.9l4.3-5.2h1.7v8.5h-1.7v-6.9l-4.3 5.2H8.6V7Z" />
    </svg>
  ),
  onedrive: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="5.5" fill="#fff" />
      <path fill="#0364b8" d="M12 8.3c-1.8 0-3.3 1.3-3.8 3a3.5 3.5 0 0 0-2 3.2 3.6 3.6 0 0 0 3.6 3.5h6.7a3 3 0 0 0 3-2.9c0-1.5-1.1-2.7-2.5-3a4 4 0 0 0-4-3.8Z" />
    </svg>
  ),
  dropbox: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#0061ff" d="M6.5 2 12 5.5 6.5 9 1 5.5 6.5 2Zm11 0 5.5 3.5-5.5 3.5L12 5.5 17.5 2ZM1 11.5l5.5-3.5 5.5 3.5-5.5 3.5-5.5-3.5Zm16.5-3.5 5.5 3.5-5.5 3.5-5.5-3.5 5.5-3.5ZM6.5 16.5 12 13l5.5 3.5L12 20l-5.5-3.5Z" />
    </svg>
  ),
  linear: <span className="logo-linear" />,
  figma: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#f24e1e" d="M9.34 1H4.93a3.4 3.4 0 0 0 0 6.8h4.41V1Z" />
      <path fill="#ff7262" d="M15.07 1h-4.41v6.8h4.41a3.4 3.4 0 0 0 0-6.8Z" />
      <path fill="#a259ff" d="M4.93 8.93h4.41v4.41H4.93a3.41 3.41 0 1 1 0-6.82Z" />
      <path fill="#1abcfe" d="M15.07 8.93h-4.41v4.41h4.41a3.41 3.41 0 1 0 0-6.82Z" />
      <path fill="#0acf83" d="M9.34 15.28v3.31a3.41 3.41 0 1 0 6.82 0v-3.31H9.34Z" />
    </svg>
  ),
  asana: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="6.4" r="3.1" fill="#f06a6a" />
      <circle cx="6.4" cy="17.6" r="3.1" fill="#f8a51b" />
      <circle cx="17.6" cy="17.6" r="3.1" fill="#2684ff" />
    </svg>
  ),
  trello: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="5.5" fill="#fff" />
      <rect x="5" y="5" width="6.2" height="14" rx="1.3" fill="#0079bf" />
      <rect x="12.8" y="5" width="6.2" height="9" rx="1.3" fill="#0079bf" />
    </svg>
  ),
  teams: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="5.5" fill="#fff" />
      <rect x="3.6" y="3.6" width="7.4" height="7.4" rx="1.6" fill="#5059c9" />
      <rect x="13" y="3.6" width="7.4" height="7.4" rx="1.6" fill="#7b83eb" />
      <rect x="3.6" y="13" width="7.4" height="7.4" rx="1.6" fill="#464eb8" />
      <rect x="13" y="13" width="7.4" height="7.4" rx="1.6" fill="#7b83eb" />
    </svg>
  ),
}

function BrandIcon({ name }: { name: BrandName }) {
  return BRAND_MARKS[name]
}

function brandIcon(provider: string): ReactNode | null {
  const name = BRAND_ALIASES[String(provider).toLowerCase()]
  return name ? BRAND_MARKS[name] : null
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
  const titleWords = title.split(' ')
  return (
    <div className="page-header">
      <div>
        {eyebrow && <span className="page-eyebrow">{eyebrow}</span>}
          <h1 aria-label={title}>
            {titleWords.map((word, index) =>
              index % 2 === 1
                ? <em key={`${word}-${index}`}>{word} </em>
                : <span key={`${word}-${index}`}>{word} </span>,
            )}
          </h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}


function RunsTable({ runs, onSelect }: { runs: Run[]; onSelect?: (run: Run) => void }) {
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
            {onSelect && <th>Result</th>}
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
                    {onSelect ? <button className="run-log-link" type="button" onClick={() => onSelect(run)}><strong>{run.instruction}</strong></button> : <strong>{run.instruction}</strong>}
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
              {onSelect && (
                <td>
                  <button className="run-outcome-button" type="button" onClick={() => onSelect(run)}>
                    View outcome
                  </button>
                </td>
              )}
            </tr>
          ))}
          {runs.length === 0 && (
            <tr>
              <td colSpan={onSelect ? 6 : 5}>No automation activity yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function outcomeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function outcomeLabel(value: string) {
  const spaced = value
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : 'Result'
}

function outcomeScalar(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return value.toLocaleString()
  return String(value)
}

function OutcomeValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <div className="automation-outcome-value">
        <p className="automation-outcome-count">{value.length} {value.length === 1 ? 'item' : 'items'} returned</p>
        {value.length > 0 && (
          <div className="automation-outcome-items">
            {value.slice(0, 6).map((item, index) => {
              const record = outcomeRecord(item)
              const title = record
                ? record.name || record.title || record.invoiceNumber || record.number || record.id
                : item
              const detail = record
                ? record.status || record.company || record.email || record.amount || record.total
                : null
              return (
                <article key={`${String(title || 'item')}:${index}`}>
                  <strong>{outcomeScalar(title || `Item ${index + 1}`)}</strong>
                  {detail !== null && detail !== undefined && <small>{outcomeScalar(detail)}</small>}
                </article>
              )
            })}
            {value.length > 6 && <small className="automation-outcome-more">+ {value.length - 6} more</small>}
          </div>
        )}
        <details className="automation-outcome-raw">
          <summary>View full result</summary>
          <pre>{JSON.stringify(value, null, 2)}</pre>
        </details>
      </div>
    )
  }

  const record = outcomeRecord(value)
  if (record) {
    const primitiveEntries = Object.entries(record).filter(([, item]) =>
      item === null || ['string', 'number', 'boolean'].includes(typeof item),
    )
    const hasStructuredValues = primitiveEntries.length !== Object.keys(record).length
    return (
      <div className="automation-outcome-value">
        {primitiveEntries.length > 0 && (
          <dl className="automation-outcome-grid">
            {primitiveEntries.slice(0, 12).map(([key, item]) => (
              <div key={key}>
                <dt>{outcomeLabel(key)}</dt>
                <dd>{outcomeScalar(item)}</dd>
              </div>
            ))}
          </dl>
        )}
        {(hasStructuredValues || primitiveEntries.length > 12) && (
          <details className="automation-outcome-raw">
            <summary>View full result</summary>
            <pre>{JSON.stringify(value, null, 2)}</pre>
          </details>
        )}
      </div>
    )
  }

  return <p className="automation-outcome-text">{outcomeScalar(value)}</p>
}

function RunOutcome({ run, events }: { run: Run; events: RunEvent[] }) {
  const stepOutcomes = events.filter((event) => event.eventType === 'step.completed' && event.output !== null)
  const completedOutcomes = events.filter((event) => event.eventType === 'run.completed' && event.output !== null)
  const failedOutcomes = events.filter((event) => event.eventType === 'run.failed' && event.output !== null)
  const outcomes = stepOutcomes.length > 0
    ? stepOutcomes
    : completedOutcomes.length > 0
      ? completedOutcomes
      : failedOutcomes

  if (outcomes.length === 0) {
    return (
      <div className="automation-outcome-empty">
        <strong>{run.status === 'running' ? 'This automation is still running.' : 'No result details were returned.'}</strong>
        <p>{run.status === 'running' ? 'The result will appear here when it finishes.' : 'The execution log is still available below for troubleshooting.'}</p>
      </div>
    )
  }

  return (
    <div className="automation-outcome-list">
      {outcomes.map((event) => (
        <article className="automation-outcome-card" key={event.id}>
          <header>
            <div>
              <span>{event.toolId ? outcomeLabel(event.toolId) : 'Completed result'}</span>
              <strong>{event.message}</strong>
            </div>
            {event.durationMs !== null && <small>{event.durationMs}ms</small>}
          </header>
          <OutcomeValue value={event.output} />
        </article>
      ))}
    </div>
  )
}

function AutomationsPage({
  automations,
  busyId,
  onCreate,
  onDelete,
  onToggle,
  onRun,
  workflowTemplates,
}: {
  automations: Automation[]
  busyId: string | null
  onCreate: () => void
  onDelete: (automation: Automation) => void
  onToggle: (automation: Automation) => void
  onRun: (automation: Automation) => void
  workflowTemplates: ReactNode
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
        eyebrow="Runs in the Core"
        title="Automations & Workflows"
        description="Create, run, and reuse repeatable business work from one place. Standard workflows execute inside lancee; custom n8n workflows run on the Edge only when you opt in."
        action={
          <button className="button button--primary" onClick={onCreate}>
            <Icon name="plus" size={16} /> New automation
          </button>
        }
      />

      <section className="n8n-showcase">
        <div className="n8n-showcase__logo" aria-label="lancee Core">
          <span>Core</span>
          <i /><i /><i />
        </div>
        <div>
          <span className="micro-label">In-app workflow execution</span>
          <h2>Most automations never leave lancee.</h2>
          <p>Standard business flows run directly in the Core with your data and context. n8n is reserved for customised, specific workflows that need an external connector.</p>
        </div>
        <div className="n8n-showcase__diagram" aria-hidden="true">
          <span>Core</span><i /><span>Edge</span><i /><span>Action</span>
        </div>
      </section>

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
          <strong>
            {automations.some((automation) => automation.status === 'paused')
              ? `${automations.filter((automation) => automation.status === 'paused').length} paused`
              : `${automations.filter((automation) => automation.status === 'active').length} active`}
          </strong>
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
                <button
                  className="automation-delete"
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => onDelete(automation)}
                  title={`Delete ${automation.name}`}
                >
                  <Icon name="trash" size={12} />
                  Delete
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
                disabled={busyId !== null}
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
                disabled={busyId !== null}
                aria-busy={busyId === automation.id}
              >
                {busyId === automation.id ? <span className="spinner" /> : <Icon name="play" size={12} />}
                {busyId === automation.id ? 'Running…' : 'Run now'}
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

      <section className="automation-workflows" aria-label="Workflow recipes">
        {workflowTemplates}
      </section>
    </div>
  )
}

function RunsPage({ runs }: { runs: Run[] }) {
  const [filter, setFilter] = useState<'all' | Run['status']>('all')
  const filtered = filter === 'all' ? runs : runs.filter((run) => run.status === filter)
  const currentMonth = new Date().toISOString().slice(0, 7)
  const runsThisMonth = runs.filter((run) => run.startedAt.startsWith(currentMonth))
  const runtimeSeconds = runsThisMonth.reduce(
    (total, run) => total + (run.durationSeconds || 0),
    0,
  )
  const uniqueAutomations = new Set(runsThisMonth.map((run) => run.automationId)).size
  const [selectedRun, setSelectedRun] = useState<Run | null>(null)
  const [selectedEvents, setSelectedEvents] = useState<RunEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const didSelectLatestRun = useRef(false)
  const selectedRunId = selectedRun?.id
  const selectedRunStatus = selectedRun?.status

  const openRun = (run: Run) => {
    setSelectedRun(run)
    setSelectedEvents(run.events || [])
  }

  useEffect(() => {
    if (didSelectLatestRun.current || runs.length === 0) return
    didSelectLatestRun.current = true
    openRun(runs[0])
  }, [runs])

  useEffect(() => {
    setSelectedRun((current) => {
      if (!current) return current
      const refreshed = runs.find((run) => run.id === current.id)
      if (!refreshed || (
        refreshed.status === current.status &&
        refreshed.completedAt === current.completedAt &&
        refreshed.errorCode === current.errorCode
      )) return current
      return { ...refreshed, events: current.events }
    })
  }, [runs])

  useEffect(() => {
    if (!selectedRun) return
    let cancelled = false
    setLoadingEvents(true)
    void api.runs.logs(selectedRun.id)
      .then((events) => {
        if (!cancelled) setSelectedEvents(events)
      })
      .catch(() => {
        if (!cancelled && !selectedRun.events?.length) setSelectedEvents([])
      })
      .finally(() => {
        if (!cancelled) setLoadingEvents(false)
      })
    return () => { cancelled = true }
  }, [selectedRun])

  useEffect(() => {
    if (!selectedRunId || selectedRunStatus !== 'running') return
    let cancelled = false
    const timer = window.setInterval(() => {
      void api.runs.get(selectedRunId).then((run) => {
        if (cancelled) return
        setSelectedRun(run)
        if (run.events) setSelectedEvents(run.events)
      }).catch(() => undefined)
    }, 1_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [selectedRunId, selectedRunStatus])

  return (
    <div className="page">
      <PageHeader
        eyebrow="History"
        title="Automation activity"
        description="See what ran, what changed, and anything that still needs your attention."
        action={<span className="button button--secondary"><Icon name="calendar" size={16} /> Current month</span>}
      />

      <section className="run-stat-grid">
        <article>
          <span>Tasks this month</span>
          <strong>{runsThisMonth.length}</strong>
          <small>{runsThisMonth.filter((run) => run.status === 'completed').length} completed</small>
        </article>
        <article>
          <span>Execution time</span>
          <strong>{Math.floor(runtimeSeconds / 3600)}h {Math.floor((runtimeSeconds % 3600) / 60)}m</strong>
          <small>Recorded automation runtime</small>
        </article>
        <article>
          <span>Needs attention</span>
          <strong>{runsThisMonth.filter((run) => run.status === 'failed').length}</strong>
          <small>Failed runs this month</small>
        </article>
        <article>
          <span>Routines used</span>
          <strong>{uniqueAutomations}</strong>
          <small>Unique automations dispatched</small>
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
        </div>
        <RunsTable runs={filtered} onSelect={openRun} />
      </section>
      {selectedRun && (
        <section className="panel automation-log-panel">
          <div className="panel-heading">
            <div>
              <span className="micro-label">Outcome</span>
              <h2>{selectedRun.automationName}</h2>
            </div>
            <div className="automation-outcome-status"><StatusPill status={selectedRun.status} /><button className="text-button" onClick={() => setSelectedRun(null)}>Close</button></div>
          </div>
          <p className="panel-copy">{selectedRun.instruction}</p>
          {loadingEvents && selectedEvents.length === 0
            ? <p className="empty-copy">Loading outcome…</p>
            : <RunOutcome run={selectedRun} events={selectedEvents} />}
          {!loadingEvents && selectedEvents.length > 0 && (
            <details className="automation-log-details">
              <summary>Execution details ({selectedEvents.length} events)</summary>
              <div className="automation-log-list">
                {selectedEvents.map((event) => (
                  <article key={event.id} className={`automation-log-entry automation-log-entry--${event.level}`}>
                    <div><strong>{event.message}</strong><small>{event.eventType} · {new Date(event.createdAt).toLocaleString()}</small></div>
                    {event.durationMs !== null && <span>{event.durationMs}ms</span>}
                  </article>
                ))}
              </div>
            </details>
          )}
        </section>
      )}
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
    onedrive: <span className="logo-letter">OD</span>,
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
    codex: (
      <span className="logo-codex">
        <i />
        <i />
        <i />
      </span>
    ),
    whatsapp: <span className="logo-letter">WA</span>,
  }
  return (
    <span className="integration-logo" style={{ '--integration-accent': integration.accent } as React.CSSProperties}>
      {marks[integration.icon] || <span className="logo-letter">{integration.name.slice(0, 2)}</span>}
    </span>
  )
}

function OpenConnectorLogo({ provider }: { provider: OpenConnectorProvider }) {
  const [failed, setFailed] = useState(false)
  const mark = brandIcon(provider.provider)
  return (
    <span className="integration-logo" aria-hidden="true">
      {provider.iconUrl && !failed ? (
        <img
          src={provider.iconUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : mark || (
        <span className="logo-letter">{provider.displayName.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  )
}

function IntegrationsPage({
  integrations,
  externalProviders,
  gatewayStatus,
  canManage,
  connectionRequests,
  busyId,
  onToggle,
  onConfigureN8n,
  onConfigureMcp,
  onConfigureCodex,
  onConfigureCodexRuntime,
  onConfigurePaystack,
  onConfigureMail,
  onConfigureWhatsApp,
  onManageGoogleWorkspace,
  onConnectGoogleWorkspace,
  onOpenStorageSetup,
  onRequestConnection,
  onConnectExternal,
  onDisconnectExternal,
  onRefreshExternal,
  onToast,
}: {
  integrations: Integration[]
  externalProviders: OpenConnectorProvider[]
  gatewayStatus: OpenConnectorStatus | null
  canManage: boolean
  connectionRequests: IntegrationRequest[]
  busyId: string | null
  onToggle: (integration: Integration) => void
  onConfigureN8n: () => void
  onConfigureMcp: () => void
  onConfigureCodex: () => void
  onConfigureCodexRuntime: () => void
  onConfigurePaystack: () => void
  onConfigureMail: () => void
  onConfigureWhatsApp: () => void
  onManageGoogleWorkspace: () => void
  onConnectGoogleWorkspace: () => void
  onOpenStorageSetup: (provider: 'dropbox' | 'onedrive') => void
  onRequestConnection: () => void
  onConnectExternal: (provider: OpenConnectorProvider) => void
  onDisconnectExternal: (provider: OpenConnectorProvider) => void
  onRefreshExternal: () => void
  onToast: (message: string) => void
}) {
  // Curated commercial families – Lancee directly integrates with the small set of services required to operate
  // a modern business. Broader third-party connectivity is provided through n8n, webhooks and the Lancee API.
  // Google Workspace + Microsoft 365 are workspace infrastructure. Payments is core business. Standard email
  // and Dropbox provide practical alternatives. n8n provides breadth.
  // Legacy generic catalog helpers remain for internal/hidden marketplace but are not customer-facing.
  void IntegrationLogo; void OpenConnectorLogo;
  void externalProviders; void gatewayStatus; void connectionRequests; void onConfigureMcp; void onConfigureCodex; void onConfigureCodexRuntime; void onConfigureWhatsApp; void onRequestConnection; void onConnectExternal; void onDisconnectExternal; void onRefreshExternal; void canManage; void onToggle;
  const [byoConfig, setByoConfig] = useState<{ configured: boolean; provider: string | null; model: string | null; maskedKey: string | null; updatedAt: string | null } | null>(null)
  const [showByoModal, setShowByoModal] = useState(false)

  const driveIntegration = integrations.find(i => i.id === 'drive')
  const dropboxIntegration = integrations.find(i => i.id === 'dropbox')
  const mailIntegration = integrations.find(i => i.id === 'mail')
  const paystackIntegration = integrations.find(i => i.id === 'paystack')
  const n8nIntegration = integrations.find(i => i.id === 'n8n')

  const googleConnected = Boolean(driveIntegration?.connected)
  const mailConnected = Boolean(mailIntegration?.connected)
  const dropboxConnected = Boolean(dropboxIntegration?.connected)
  const paystackConnected = Boolean(paystackIntegration?.connected)
  const n8nConnected = Boolean(n8nIntegration?.connected)

  useEffect(() => {
    let active = true
    void api.customAi.getConfig().then((config) => {
      if (active) setByoConfig(config)
    }).catch(() => {
      if (active) setByoConfig({ configured: false, provider: null, model: null, maskedKey: null, updatedAt: null })
    })
    return () => { active = false }
  }, [])

  const refreshByo = async () => {
    try { setByoConfig(await api.customAi.getConfig()) } catch { /* keep previous */ }
  }

  return (
    <div className="page connected-apps-page">
      <PageHeader
        eyebrow="Connected Apps"
        title="Connected Apps"
        description="Connect the services that power your business."
      />

      <p className="connected-apps-principle">
        Lancee directly integrates with the small set of services required to operate a modern business.
        Broader third-party connectivity is provided through <strong>n8n</strong>, webhooks and the Lancee API.
      </p>

      {/* WORKSPACE */}
      <section className="connected-apps-section" aria-labelledby="workspace-heading">
        <div className="connected-apps-section__heading">
          <span className="micro-label">Workspace</span>
          <h2 id="workspace-heading">Workspace</h2>
          <p>Your core productivity suite. One account connects mail, files, calendar and contacts.</p>
        </div>
        <div className="connected-family-grid">
          <article className="connected-family-card connected-family-card--google">
            <div className="connected-family-card__top">
              <span className="connected-family-logo connected-family-logo--google">
                <BrandIcon name="gmail" />
                <BrandIcon name="drive" />
                <BrandIcon name="calendar" />
              </span>
              <span className={googleConnected ? 'connected-label' : 'platform-label'}>
                {googleConnected ? <><Icon name="check" size={12} /> Connected</> : 'Available'}
              </span>
            </div>
            <h3>Google Workspace</h3>
            <p>Choose Gmail, Drive, and Calendar access from one Google account for your business.</p>
            <ul className="connected-capabilities">
              <li><Icon name="check" size={11} /> Gmail</li>
              <li><Icon name="check" size={11} /> Drive</li>
              <li><Icon name="check" size={11} /> Calendar</li>
              <li><Icon name="check" size={11} /> Contacts</li>
            </ul>
            {googleConnected && <small className="connected-identity">Gmail, Drive &amp; Calendar connected • Manage permissions in Google</small>}
            <button
              className={`button ${googleConnected ? 'button--secondary' : 'button--dark'}`}
              onClick={googleConnected ? onManageGoogleWorkspace : onConnectGoogleWorkspace}
              disabled={busyId === 'drive'}
            >
              {busyId === 'drive' ? <span className="spinner spinner--dark" /> : <Icon name={googleConnected ? 'settings' : 'plus'} size={14} />}
              {googleConnected ? 'Manage Google Workspace' : 'Connect Google Workspace'}
            </button>
          </article>

          <article className="connected-family-card connected-family-card--microsoft">
            <div className="connected-family-card__top">
              <span className="connected-family-logo connected-family-logo--microsoft">
                <BrandIcon name="outlook" />
                <BrandIcon name="onedrive" />
                <BrandIcon name="teams" />
              </span>
              <span className="platform-label">Requires setup</span>
            </div>
            <h3>Microsoft 365</h3>
            <p>Outlook • OneDrive • Calendar • Contacts — for teams on Microsoft.</p>
            <ul className="connected-capabilities">
              <li>Outlook Mail</li>
              <li>OneDrive</li>
              <li>Calendar</li>
              <li>Contacts</li>
            </ul>
            <small className="connected-identity">Microsoft OAuth is not enabled for this workspace.</small>
            <span className="button button--secondary connected-family-card__static-action">
              <Icon name="settings" size={14} /> Admin setup required
            </span>
          </article>
        </div>
      </section>

      {/* COMMUNICATION & STORAGE */}
      <section className="connected-apps-section" aria-labelledby="comm-storage-heading">
        <div className="connected-apps-section__heading">
          <span className="micro-label">Communication &amp; Storage</span>
          <h2 id="comm-storage-heading">Communication &amp; Storage</h2>
          <p>Bring your existing business mailbox and file storage.</p>
        </div>
        <div className="connected-family-grid">
          <article className="connected-family-card">
            <div className="connected-family-card__top">
              <span className="connected-family-logo"><Icon name="messages" size={22} /></span>
              <span className={mailConnected ? 'connected-label' : 'platform-label'}>
                {mailConnected ? <><Icon name="check" size={12} /> Connected</> : 'Not connected'}
              </span>
            </div>
            <h3>Other Email</h3>
            <p>Connect your existing business mailbox using IMAP and SMTP.</p>
            <ul className="connected-capabilities">
              <li>IMAP inbox</li>
              <li>SMTP sending</li>
              <li>Automation triggers</li>
            </ul>
            {mailConnected && <small className="connected-identity">Mailbox is active</small>}
            <button className={`button ${mailConnected ? 'button--secondary' : 'button--dark'}`} onClick={onConfigureMail} disabled={busyId === 'mail'}>
              <Icon name={mailConnected ? 'settings' : 'plus'} size={14} /> {mailConnected ? 'Manage' : 'Connect'}
            </button>
          </article>

          <article className="connected-family-card">
            <div className="connected-family-card__top">
              <span className="connected-family-logo connected-family-logo--dropbox"><BrandIcon name="dropbox" /></span>
              <span className={dropboxConnected ? 'connected-label' : 'platform-label'}>
                {dropboxConnected ? <><Icon name="check" size={12} /> Connected</> : 'Available'}
              </span>
            </div>
            <h3>Dropbox</h3>
            <p>Cloud file storage for your workspace documents.</p>
            <ul className="connected-capabilities">
              <li>Workspace files</li>
              <li>Client delivery</li>
              <li>Private storage point</li>
            </ul>
            <button className={`button ${dropboxConnected ? 'button--secondary' : 'button--dark'}`} onClick={() => onOpenStorageSetup('dropbox')} disabled={busyId === 'dropbox'}>
              <Icon name={dropboxConnected ? 'settings' : 'plus'} size={14} /> {dropboxConnected ? 'Manage' : 'Connect'}
            </button>
          </article>
        </div>
      </section>

      {/* BUSINESS */}
      <section className="connected-apps-section" aria-labelledby="business-heading">
        <div className="connected-apps-section__heading">
          <span className="micro-label">Business</span>
          <h2 id="business-heading">Business</h2>
          <p>Payments are core business infrastructure — managed natively in Lancee.</p>
        </div>
        <div className="connected-family-grid">
          <article className="connected-family-card connected-family-card--payments">
            <div className="connected-family-card__top">
              <span className="connected-family-logo connected-family-logo--payments">
                <BrandIcon name="paystack" />
                <BrandIcon name="stripe" />
                <BrandIcon name="paypal" />
              </span>
              <span className={paystackConnected ? 'connected-label' : 'platform-label'}>
                {paystackConnected ? <><Icon name="check" size={12} /> Connected</> : 'Set up payments'}
              </span>
            </div>
            <h3>Payments</h3>
            <p>Collect card and bank payments, links, status and reconciliation.</p>
            <ul className="connected-capabilities">
              <li>Invoice payment links</li>
              <li>Payment status</li>
              <li>Reconciliation</li>
              <li>Transaction records</li>
            </ul>
            <small>Paystack is available now. Stripe and PayPal are not enabled in this workspace.</small>
            <button className={`button ${paystackConnected ? 'button--secondary' : 'button--dark'}`} onClick={onConfigurePaystack} disabled={busyId === 'paystack'}>
              <Icon name={paystackConnected ? 'settings' : 'plus'} size={14} /> {paystackConnected ? 'Manage' : 'Connect Paystack'}
            </button>
          </article>
        </div>
      </section>

      {/* AI */}
      <section className="connected-apps-section" aria-labelledby="ai-heading">
        <div className="connected-apps-section__heading">
          <span className="micro-label">AI</span>
          <h2 id="ai-heading">AI</h2>
          <p>Lancee AI is workspace-aware. Bring Your Own AI is chat-only — no privileged tools.</p>
        </div>
        <div className="connected-family-grid">
          <article className="connected-family-card connected-family-card--lancee-ai">
            <div className="connected-family-card__top">
              <span className="connected-family-logo connected-family-logo--ai"><Icon name="sparkles" size={22} /></span>
              <span className="platform-label"><Icon name="shield" size={12} /> Built-in</span>
            </div>
            <h3>Lancee AI</h3>
            <p>Workspace-aware assistant with Lancee tools, files, and automation.</p>
            <ul className="connected-capabilities">
              <li>Workspace intelligence</li>
              <li>Lancee tools / MCP</li>
              <li>Workflow assistance</li>
              <li>Governed context</li>
            </ul>
            <small>Managed by Lancee • Permission-enforced</small>
            <button className="button button--secondary" onClick={() => onToast('Lancee AI is active in this workspace. Use the chat assistant for workspace-aware help.')}>
              <Icon name="sparkles" size={14} /> Active
            </button>
          </article>

          <article className="connected-family-card connected-family-card--byo-ai">
            <div className="connected-family-card__top">
              <span className="connected-family-logo connected-family-logo--byo"><Icon name="command" size={22} /></span>
              <span className={byoConfig?.configured ? 'connected-label' : 'platform-label'}>
                {byoConfig?.configured ? <><Icon name="check" size={12} /> Connected</> : 'Not connected'}
              </span>
            </div>
            <h3>Bring Your Own AI</h3>
            <p>Use your own provider for general AI chat — writing, summarising, brainstorming.</p>
            <ul className="connected-capabilities">
              <li>Chat only</li>
              <li>No privileged tools</li>
              <li>No MCP / workspace data</li>
              <li>Provider: {byoConfig?.provider || 'not set'}</li>
            </ul>
            {byoConfig?.configured && <small className="connected-identity">Model: {byoConfig.model} • Key: {byoConfig.maskedKey}</small>}
            {!byoConfig?.configured && <small>Supports OpenAI, Anthropic, Gemini, OpenAI-compatible</small>}
            <button
              className={`button ${byoConfig?.configured ? 'button--secondary' : 'button--dark'}`}
              onClick={() => setShowByoModal(true)}
            >
              <Icon name={byoConfig?.configured ? 'settings' : 'plus'} size={14} /> {byoConfig?.configured ? 'Manage' : 'Configure'}
            </button>
          </article>
        </div>
        {showByoModal && (
          <BringYourOwnAiModal
            config={byoConfig}
            onClose={() => setShowByoModal(false)}
            onSaved={async () => { await refreshByo(); setShowByoModal(false); onToast('Custom AI provider saved. Chat-only access enabled.') }}
            onRemoved={async () => { await refreshByo(); setShowByoModal(false); onToast('Custom AI provider removed.') }}
            onToast={onToast}
          />
        )}
      </section>

      {/* AUTOMATION & EXTENSIONS */}
      <section className="connected-apps-section" aria-labelledby="automation-heading">
        <div className="connected-apps-section__heading">
          <span className="micro-label">Automation &amp; Extensions</span>
          <h2 id="automation-heading">Automation &amp; Extensions</h2>
          <p>Connect hundreds of other services through n8n, or build with the Lancee API.</p>
        </div>
        <div className="connected-family-grid">
          <article className="connected-family-card connected-family-card--n8n">
            <div className="connected-family-card__top">
              <span className="connected-family-logo connected-family-logo--n8n"><span className="logo-n8n"><i /><i /><i /></span></span>
              <span className={n8nConnected ? 'connected-label' : 'platform-label'}>
                {n8nConnected ? <><Icon name="check" size={12} /> Connected</> : 'Available'}
              </span>
            </div>
            <h3>n8n</h3>
            <p>Connect Lancee to hundreds of other services — CRM, marketing, WhatsApp, GitHub, Slack and more.</p>
            <ul className="connected-capabilities">
              <li>CRM &amp; marketing</li>
              <li>WhatsApp, Slack, GitHub</li>
              <li>Industry SaaS</li>
              <li>Bidirectional webhooks</li>
            </ul>
            <small>External integration gateway • Avoids maintaining hundreds of native connectors</small>
            <button className={`button ${n8nConnected ? 'button--secondary' : 'button--dark'}`} onClick={onConfigureN8n}>
              <Icon name={n8nConnected ? 'settings' : 'plus'} size={14} /> {n8nConnected ? 'Configure' : 'Connect n8n'}
            </button>
          </article>

          <article className="connected-family-card connected-family-card--api">
            <div className="connected-family-card__top">
              <span className="connected-family-logo"><Icon name="code" size={22} /></span>
              <span className="platform-label"><Icon name="shield" size={12} /> Developer</span>
            </div>
            <h3>API &amp; Webhooks</h3>
            <p>Build custom integrations with webhooks and the Lancee API.</p>
            <ul className="connected-capabilities">
              <li>n8n-style webhooks</li>
              <li>Webhook signing</li>
              <li>API keys</li>
              <li>Lancee API</li>
            </ul>
            <small>Technical setup appears after entering this section</small>
            <a className="button button--secondary" href="/lancee.html" target="_blank" rel="noopener">
              <Icon name="code" size={14} /> View docs
            </a>
          </article>
        </div>
      </section>

      <section className="connected-apps-footnote">
        <p>Lancee directly integrates with the small set of services required to operate a modern business. Broader third-party connectivity is provided through n8n, webhooks and the Lancee API.</p>
        <p className="connected-apps-footnote__hidden">Legacy connectors remain executable for existing workflows but are hidden from customer discovery.</p>
      </section>
    </div>
  )
}

function BringYourOwnAiModal({ config, onClose, onSaved, onRemoved, onToast }: {
  config: { configured: boolean; provider: string | null; model: string | null; maskedKey: string | null } | null
  onClose: () => void
  onSaved: () => void
  onRemoved: () => void
  onToast: (m: string) => void
}) {
  const [provider, setProvider] = useState(config?.provider || 'openai')
  const [model, setModel] = useState(config?.model || '')
  const [apiKey, setApiKey] = useState('')
  const [endpointUrl, setEndpointUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (config?.provider) setProvider(config.provider)
    if (config?.model) setModel(config.model)
  }, [config])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.customAi.save({ provider, model, apiKey, endpointUrl: endpointUrl || undefined })
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save provider.')
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setError('')
    try {
      const res = await api.customAi.test()
      onToast(`Test OK • ${res.provider}/${res.model} • ${res.latencyMs}ms`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed.')
    } finally {
      setTesting(false)
    }
  }

  const remove = async () => {
    if (!window.confirm('Remove the custom AI provider and its stored key?')) return
    setBusy(true)
    try {
      await api.customAi.remove()
      await onRemoved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove provider.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Bring Your Own AI"
      description="Configure a provider for general chat only. BYO AI never receives Lancee workspace tools, MCP credentials, or Connected Intelligence."
      onClose={onClose}
      wide
    >
        <form onSubmit={save} className="modal-form">
          {config?.configured && <p className="byo-current-provider">Current: {config.provider} • {config.model} • Key: {config.maskedKey}</p>}
          <label className="form-field">
            <span>Provider</span>
            <select value={provider} onChange={e => setProvider(e.target.value)}>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Google Gemini</option>
              <option value="openai_compatible">OpenAI-compatible</option>
            </select>
            <small>Only supported providers are listed. lancee AI (Hermes) remains separate.</small>
          </label>
          <label className="form-field">
            <span>Model</span>
            <input value={model} onChange={e => setModel(e.target.value)} placeholder={provider === 'openai' ? 'gpt-4o-mini' : provider === 'anthropic' ? 'claude-3-5-haiku-latest' : provider === 'gemini' ? 'gemini-2.0-flash' : 'your-model-name'} required />
          </label>
          {(provider === 'openai_compatible' || provider === 'openai-compatible') && (
            <label className="form-field">
              <span>Endpoint URL</span>
              <input value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)} placeholder="https://your-provider.com/v1" required />
            </label>
          )}
          {provider !== 'openai_compatible' && (
            <label className="form-field">
              <span>Endpoint URL <small>(optional override)</small></span>
              <input value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)} placeholder="Leave blank for default" />
            </label>
          )}
          <label className="form-field">
            <span>API key</span>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={config?.configured ? '•••••••• – enter new key to replace' : 'sk-...'} required={!config?.configured} autoComplete="new-password" />
            <small>Stored encrypted at rest • Masked in UI • Never returned fully • Never logged • Replace or remove anytime</small>
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-form__footer">
            <div>
              {config?.configured && <button type="button" className="button button--danger button--small" onClick={remove} disabled={busy}>Remove</button>}
              {config?.configured && <button type="button" className="button button--secondary button--small" onClick={test} disabled={testing}>{testing ? 'Testing…' : 'Test'}</button>}
            </div>
            <div>
              <button type="button" className="button button--secondary" onClick={onClose}>Close</button>
              <button type="submit" className="button button--primary" disabled={busy}>{busy ? 'Saving…' : config?.configured ? 'Replace key' : 'Save provider'}</button>
            </div>
          </div>
            <p className="byo-boundary-note"><Icon name="shield" size={12} /> BYO AI is chat-only: no MCP tools, no workspace data, no workflow execution.</p>
        </form>
    </Modal>
  )
}

function WhatsAppConnectionPanel({
  status,
  canManage,
  onStatusChange,
  onClose,
  onToast,
}: {
  status: WhatsAppStatus
  canManage: boolean
  onStatusChange: (next: WhatsAppStatus) => void
  onClose: () => void
  onToast: (message: string) => void
}) {
  const [selfNumber, setSelfNumber] = useState(status.selfNumber ? `+${status.selfNumber}` : '')
  const [notificationsEnabled, setNotificationsEnabled] = useState(status.notificationsEnabled)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setNotificationsEnabled(status.notificationsEnabled)
  }, [status.notificationsEnabled])

  useEffect(() => {
    if (!canManage || !['connecting', 'qr'].includes(status.status)) return
    const timer = window.setInterval(() => {
      void api.whatsapp.status().then(onStatusChange).catch(() => undefined)
    }, 1_500)
    return () => window.clearInterval(timer)
  }, [canManage, onStatusChange, status.status])

  const connect = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const next = await api.whatsapp.connect({ selfNumber, notificationsEnabled })
      onStatusChange(next)
      onToast('WhatsApp is ready. Scan the QR code with your phone.')
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Unable to start WhatsApp connection.')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!window.confirm('Disconnect WhatsApp and remove its saved session from this workspace?')) return
    setBusy(true)
    try {
      onStatusChange(await api.whatsapp.disconnect())
      onToast('WhatsApp disconnected.')
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Unable to disconnect WhatsApp.')
    } finally {
      setBusy(false)
    }
  }

  const sendTest = async () => {
    setBusy(true)
    try {
      const result = await api.whatsapp.sendTest()
      onToast(`Test notification sent to +${result.recipient || status.selfNumber}.`)
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Unable to send the WhatsApp test.')
    } finally {
      setBusy(false)
    }
  }

  const toggleNotifications = async (enabled: boolean) => {
    setNotificationsEnabled(enabled)
    if (!status.configured || status.status !== 'connected') return
    setBusy(true)
    try {
      onStatusChange(await api.whatsapp.setNotificationsEnabled(enabled))
      onToast(enabled ? 'WhatsApp platform notifications enabled.' : 'WhatsApp platform notifications paused.')
    } catch (error) {
      setNotificationsEnabled(!enabled)
      onToast(error instanceof Error ? error.message : 'Unable to update WhatsApp notifications.')
    } finally {
      setBusy(false)
    }
  }

  if (!canManage) {
    return <div className="panel-copy">Only the workspace owner can scan a WhatsApp QR code or change notification delivery.</div>
  }

  const statusLabel = status.status === 'connected'
    ? 'Connected'
    : status.status === 'qr'
      ? 'Waiting for QR scan'
      : status.status === 'connecting'
        ? 'Connecting…'
        : status.status === 'error'
          ? 'Connection error'
          : 'Not connected'
  const statusClass = status.status === 'connected'
    ? ' is-connected'
    : ['connecting', 'qr'].includes(status.status)
      ? ' is-pending'
      : status.status === 'error'
        ? ' is-error'
        : ''

  return (
    <div className="connection-form">
      <p className="panel-copy">This connector uses Baileys on the server. It sends platform notifications only to the WhatsApp number you verify below — never to an arbitrary recipient.</p>
      <div className={`connection-state${statusClass}`} role="status" aria-live="polite">
        <span />
        {statusLabel}
      </div>
      <form onSubmit={(event) => void connect(event)}>
        <label className="form-field">
          <span>Your WhatsApp number</span>
          <input
            value={selfNumber}
            onChange={(event) => setSelfNumber(event.target.value)}
            placeholder="+27821234567"
            inputMode="tel"
            autoComplete="tel"
            disabled={busy || status.status === 'connected'}
            required
          />
          <small>Use the full international number, including the country code.</small>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={notificationsEnabled} onChange={(event) => void toggleNotifications(event.target.checked)} disabled={busy} />
          <span>Send platform notifications to me on WhatsApp</span>
        </label>
        {status.error && <p className="form-error">{status.error}</p>}
        {status.qr && status.status !== 'connected' && (
          <div className="whatsapp-qr-card">
            {status.qr.startsWith('data:image/')
              ? <img src={status.qr} alt="WhatsApp pairing QR code" />
              : <pre>{status.qrText || 'QR code is ready; install the QR renderer on the server.'}</pre>}
            <p>Open WhatsApp on your phone → Linked devices → Link a device, then scan this code.</p>
          </div>
        )}
        <div className="form-actions">
          {status.status !== 'connected' && <button className="button button--dark" type="submit" disabled={busy}>{busy ? 'Starting…' : 'Start WhatsApp connection'}</button>}
          {status.status === 'connected' && <button className="button button--secondary" type="button" onClick={() => void sendTest()} disabled={busy}>{busy ? 'Sending…' : 'Send test to me'}</button>}
          {status.configured && <button className="button button--secondary" type="button" onClick={() => void disconnect()} disabled={busy}>Disconnect</button>}
          <button className="text-button" type="button" onClick={onClose}>Close</button>
        </div>
      </form>
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
          {connected && <DisconnectConfirmation service="n8n" consequence="Automations will no longer send to or receive from this n8n webhook." onDisconnect={onDisconnect} />}
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

function GoogleWorkspaceConnectionPanel({
  canManage,
  onReconnect,
  onDisconnect,
  onCancel,
}: {
  canManage: boolean
  onReconnect: () => Promise<void>
  onDisconnect: () => Promise<void>
  onCancel: () => void
}) {
  const [busy, setBusy] = useState<'reconnect' | 'disconnect' | ''>('')
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false)
  const [error, setError] = useState('')

  const reconnect = async () => {
    setBusy('reconnect')
    setError('')
    try {
      await onReconnect()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to re-authorise Google Workspace.')
      setBusy('')
    }
  }

  const disconnect = async () => {
    setBusy('disconnect')
    setError('')
    try {
      await onDisconnect()
      onCancel()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to disconnect Google Workspace.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="modal-form">
      <div className="setting-row">
        <span className="setting-row__icon"><Icon name="check" size={18} /></span>
        <div>
          <strong>Google Workspace is connected</strong>
          <p>Gmail, Drive, Calendar and Contacts use this workspace connection.</p>
        </div>
        <span className="configured-label">Connected</span>
      </div>
      <div className="permission-box">
        <span><Icon name="shield" size={17} /></span>
        <div>
          <strong>Connection permissions</strong>
          <p>Re-authorise to restore access after a Google permission or token change.</p>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!canManage && <p className="form-error">Only a workspace owner can change this connection.</p>}
      {confirmingDisconnect && (
        <div className="connection-danger-confirm" role="alertdialog" aria-label="Confirm Google Workspace disconnect">
          <strong>Disconnect Google Workspace?</strong>
          <p>Gmail, Drive, Calendar and Contacts will stop syncing for this workspace. Your Google data will not be deleted.</p>
          <div>
            <button className="button button--secondary button--small" type="button" onClick={() => setConfirmingDisconnect(false)} disabled={busy === 'disconnect'}>Cancel</button>
            <button className="button button--danger button--small" type="button" onClick={() => void disconnect()} disabled={busy === 'disconnect'}>{busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect workspace'}</button>
          </div>
        </div>
      )}
      <div className="modal-form__footer">
        <div>
          {canManage && !confirmingDisconnect && <button className="button button--danger button--small" type="button" onClick={() => setConfirmingDisconnect(true)}>Disconnect</button>}
        </div>
        <div>
          <button className="button button--secondary" type="button" onClick={onCancel}>Close</button>
          {canManage && <button className="button button--primary" type="button" onClick={() => void reconnect()} disabled={Boolean(busy)}>{busy === 'reconnect' ? 'Opening Google…' : 'Reconnect / re-authorise'}</button>}
        </div>
      </div>
    </div>
  )
}

function DisconnectConfirmation({
  service,
  consequence,
  onDisconnect,
}: {
  service: string
  consequence: string
  onDisconnect: () => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const disconnect = async () => {
    setBusy(true)
    setError('')
    try {
      await onDisconnect()
      setConfirming(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Unable to disconnect ${service}.`)
    } finally {
      setBusy(false)
    }
  }

  if (!confirming) return <button className="button button--danger button--small" type="button" onClick={() => setConfirming(true)}>Disconnect</button>

  return (
    <div className="connection-danger-confirm" role="alertdialog" aria-label={`Confirm ${service} disconnect`}>
      <strong>Disconnect {service}?</strong>
      <p>{consequence}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div>
        <button className="button button--secondary button--small" type="button" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
        <button className="button button--danger button--small" type="button" onClick={() => void disconnect()} disabled={busy}>{busy ? 'Disconnecting…' : 'Disconnect'}</button>
      </div>
    </div>
  )
}

function PaystackConnectionForm({
  connection,
  canManage,
  onSave,
  onDisconnect,
  onCancel,
  onToast,
}: {
  connection: PaystackConnection
  canManage: boolean
  onSave: (secretKey: string) => Promise<void>
  onDisconnect: () => Promise<void>
  onCancel: () => void
  onToast: (message: string) => void
}) {
  const [secretKey, setSecretKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onSave(secretKey)
      setSecretKey('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to connect Paystack.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="modal-form" onSubmit={submit}>
      <div className="setting-row">
        <span className="setting-row__icon">
          <Icon name="plug" size={18} />
        </span>
        <div>
          <strong>
            {connection.configured
              ? `Paystack ${connection.mode} mode`
              : 'Paystack is not connected'}
          </strong>
          <p>
            {connection.configured
              ? `Credential stored ${connection.credentialSource === 'workspace' ? 'for this workspace' : 'in the server environment'}`
              : 'Add this workspace’s Paystack secret key to enable hosted checkout.'}
          </p>
        </div>
        <span className={connection.configured ? 'configured-label' : 'connection-state'}>
          {connection.configured ? 'Connected' : 'Not connected'}
        </span>
      </div>

      <label className="form-field">
        <span>{connection.configured ? 'Replace secret key' : 'Secret key'}</span>
        <input
          type="password"
          value={secretKey}
          onChange={(event) => setSecretKey(event.target.value)}
          placeholder="sk_test_… or sk_live_…"
          autoComplete="new-password"
          required
          disabled={!canManage}
        />
        <small>The key is encrypted by the backend and is never returned to the browser.</small>
      </label>

      <label className="form-field">
        <span>Workspace webhook URL</span>
        <div className="copy-field">
          <input value={connection.webhookUrl} readOnly />
          <button
            className="button button--secondary button--small"
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(connection.webhookUrl)
              onToast('Paystack webhook URL copied')
            }}
          >
            Copy
          </button>
        </div>
        <small>Add this URL in the matching Paystack dashboard for payment reconciliation.</small>
      </label>

      {error && <p className="form-error">{error}</p>}
      {!canManage && (
        <p className="form-error">Only a workspace owner can change payment credentials.</p>
      )}

      <div className="modal-form__footer">
        <div>
          {connection.configured && canManage && <DisconnectConfirmation service="Paystack" consequence="New invoice payments will not be processed until a payment provider is connected again." onDisconnect={onDisconnect} />}
        </div>
        <div>
          <button className="button button--secondary" type="button" onClick={onCancel}>
            Close
          </button>
          {canManage && (
            <button className="button button--primary" type="submit" disabled={busy}>
              {busy ? 'Saving…' : connection.configured ? 'Replace key' : 'Connect Paystack'}
            </button>
          )}
        </div>
      </div>
    </form>
  )
}

function McpIntegrationPanel({
  connection,
  services,
  onSync,
  onInvoke,
  onClose,
}: {
  connection: McpConnection
  services: McpService[]
  onSync: () => Promise<void>
  onInvoke: (
    service: McpService,
    toolId: string,
    toolArguments: Record<string, unknown>,
  ) => Promise<McpInvocationResult>
  onClose: () => void
}) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [results, setResults] = useState<Partial<Record<string, McpInvocationResult>>>({})
  const toolCount = services.reduce((total, service) => total + service.tools.length, 0)
  const activeCount = services.filter((service) => service.active).length
  const accessApproved = connection.connected

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

  const invoke = async (service: McpService) => {
    const preferredTool =
      service.tools.find((tool) => tool.id === 'website_smoke_test') ||
      service.tools.find((tool) => tool.id === 'search_workflows') ||
      service.tools[0]
    if (!preferredTool) return
    const schema = preferredTool.inputSchema || {}
    const properties =
      schema.properties && typeof schema.properties === 'object'
        ? (schema.properties as Record<string, { type?: string; enum?: unknown[] }>)
        : {}
    const required = Array.isArray(schema.required)
      ? schema.required.map(String)
      : []
    const toolArguments: Record<string, unknown> = {}
    for (const name of required) {
      const property = properties[name] || {}
      if (Array.isArray(property.enum) && property.enum.length > 0) {
        toolArguments[name] = property.enum[0]
      } else if (name.toLowerCase().includes('url')) {
        toolArguments[name] = 'https://example.com'
      } else if (name.toLowerCase().includes('selector')) {
        toolArguments[name] = 'h1'
      } else if (property.type === 'number' || property.type === 'integer') {
        toolArguments[name] = 1
      } else if (property.type === 'boolean') {
        toolArguments[name] = false
      } else if (property.type === 'array') {
        toolArguments[name] = []
      } else if (property.type === 'object') {
        toolArguments[name] = {}
      } else {
        toolArguments[name] = 'lancee MCP health check'
      }
    }
    setError('')
    setBusy(`test-${service.id}`)
    try {
      const result = await onInvoke(service, preferredTool.id, toolArguments)
      setResults((current) => ({ ...current, [service.id]: result }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The MCP tool call failed.')
    } finally {
      setBusy('')
    }
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
          <h3>Lancee MCP</h3>
          <p>
            One local MCP route exposes Lancee's workspace-scoped tools without
            an external gateway or separate server configuration.
          </p>
        </div>
        <span className={`connection-state${accessApproved ? ' is-connected' : ''}`}>
          <span />
          {accessApproved ? 'Local MCP active' : 'Unavailable'}
        </span>
      </section>

      <div className="mcp-route-strip">
        <div>
          <span>Application endpoint</span>
          <code>{connection.gatewayUrl}</code>
        </div>
        <Icon name="arrow-right" size={15} />
        <div>
          <span>Local registry</span>
          <code>{connection.capabilityEndpoint}</code>
        </div>
        <Icon name="arrow-right" size={15} />
        <div>
          <span>Authentication</span>
          <strong>
            <Icon name="shield" size={13} />
            Workspace-scoped token
          </strong>
        </div>
      </div>

      <section className={`mcp-access-state mcp-access-state--${connection.accessStatus}`}>
        <span className="mcp-access-state__icon">
          <Icon name={accessApproved ? 'check-circle' : 'activity'} size={22} />
        </span>
        <div>
          <span className="micro-label">Workspace access</span>
          <h3>
            {accessApproved ? 'The local Lancee MCP is active' : 'The local MCP route is unavailable'}
          </h3>
          <p>
            {accessApproved
              ? 'The protocol adapter and tool runtime ship with this Lancee deployment. Dashboard calls inherit the signed-in workspace context.'
              : 'Restart Lancee and inspect the application logs. No external MCP service needs to be configured.'}
          </p>
        </div>
        <span className={`mcp-access-badge${accessApproved ? ' is-approved' : ''}`}>
          <Icon name={accessApproved ? 'check' : 'activity'} size={13} />
          {accessApproved ? 'Built in' : 'Unavailable'}
        </span>
      </section>

      <div className="mcp-service-toolbar">
        <div>
          <strong>{services.length} local service</strong>
          <span>{toolCount} executable tools · {activeCount} active</span>
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
            title="Refresh the local Lancee tool registry"
          >
            {busy === 'sync' ? (
              <span className="spinner spinner--dark" />
            ) : (
              <Icon name="activity" size={14} />
            )}
            Refresh tools
          </button>
        </div>
      </div>

      <section className="mcp-service-grid">
        {services.map((service) => {
          const result = results[service.id]
          return (
            <article
              className={`mcp-service-card${service.active ? ' is-active' : ''}${service.status !== 'live' ? ' is-locked' : ''}`}
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
                    {service.status === 'live' ? 'Live' : 'Needs attention'}
                  </span>
                  <h4>{service.name}</h4>
                  <code>{service.id}</code>
                </div>
                <span className="mcp-access-badge is-approved">Always active</span>
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
                  <Icon name="check-circle" size={12} />
                  Built into this Lancee deployment
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
          <strong>One trusted Lancee execution boundary</strong>
          <p>
            Dashboard calls use <code>POST /api/mcp/invoke</code>; external MCP clients
            use <code>POST /mcp</code> with an approved device token. Both paths invoke
            the same workspace-scoped runtime.
          </p>
        </div>
      </div>

      {error && <p className="form-error n8n-error">{error}</p>}

      <div className="mcp-panel__footer">
        <div />
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
  canManage,
}: {
  keys: ApiKey[]
  onCreate: () => void
  onRevoke: (key: ApiKey) => void
  onToast: (message: string) => void
  canManage: boolean
}) {
  const sampleCode = `curl ${window.location.origin}/api/v1/workspace \\
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
        action={canManage ? (
          <button className="button button--primary" onClick={onCreate}>
            <Icon name="plus" size={16} /> Create API key
          </button>
        ) : null}
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
              {canManage && (
                <button
                  className="icon-button icon-button--danger"
                  aria-label={`Revoke ${key.name} key`}
                  onClick={() => onRevoke(key)}
                >
                  <Icon name="trash" size={16} />
                </button>
              )}
            </div>
          ))}
          {keys.length === 0 && (
            <div className="empty-state">
              <Icon name="key" size={24} />
              <strong>No active API keys</strong>
              <p>
                {canManage
                  ? 'Create a key when you’re ready to make your first API call.'
                  : 'Workspace owners manage API keys.'}
              </p>
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
              <span>curl</span> {window.location.origin}/api/v1/workspace \<br />
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
  onNavigate,
  onSaved,
  onUserUpdated,
  initialSection,
}: {
  user: User
  onToast: (message: string) => void
  onNavigate: (page: Page) => void
  onSaved: (settings: { name: string }) => void
  onUserUpdated: (user: User) => void
  initialSection: 'general' | 'dev'
}) {
  const canEdit = user.role === 'owner'
  const [workspace, setWorkspace] = useState(user.workspace)
  const [displayName, setDisplayName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [timezone, setTimezone] = useState('Africa/Johannesburg')
  const [travelMode, setTravelMode] = useState('none')
  const [travelLocation, setTravelLocation] = useState('')
  const [workspaceLogoUrl, setWorkspaceLogoUrl] = useState('')
  const [savedWorkspaceSettings, setSavedWorkspaceSettings] = useState(() => ({
    name: user.workspace,
    email: user.email,
    timezone: 'Africa/Johannesburg',
    travelMode: 'none',
    travelLocation: '',
  }))
  const [saving, setSaving] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsError, setSettingsError] = useState('')
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [logoSaving, setLogoSaving] = useState(false)
  const [section, setSection] = useState<'profile' | 'integrations' | 'plan' | 'builder' | 'help' | 'dev'>(initialSection === 'dev' ? 'dev' : 'profile')
  const [dbInfo, setDbInfo] = useState<{
    provider: string
    mode: string
    version: string
    status: string
    tablesCount: number
  } | null>(null)
  const [planInfo, setPlanInfo] = useState<{
    name: string
    planCode: string
    billingPeriod: string
    status: string
    isOnTrial: boolean
    trialDaysLeft: number
  } | null>(null)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])

  useEffect(() => {
    setSection(initialSection === 'dev' ? 'dev' : 'profile')
  }, [initialSection])

  useEffect(() => {
    api.workspace
      .getSettings()
      .then((settings) => {
        const nextSettings = {
          name: settings.name || user.workspace,
          email: settings.email || user.email,
          timezone: settings.timezone || 'Africa/Johannesburg',
          travelMode: settings.travelMode || 'none',
          travelLocation: settings.travelLocation || '',
        }
        setWorkspace(nextSettings.name)
        setEmail(nextSettings.email)
        setTimezone(nextSettings.timezone)
        setTravelMode(nextSettings.travelMode)
        setTravelLocation(nextSettings.travelLocation)
        setSavedWorkspaceSettings(nextSettings)
        setWorkspaceLogoUrl(settings.logoUrl || '')
      })
      .catch((caught) => {
        setSettingsError(
          caught instanceof Error
            ? caught.message
            : 'Unable to load workspace settings.',
        )
      })
      .finally(() => setSettingsLoading(false))
    api.database.getInfo().then(setDbInfo).catch(() => undefined)
    api.subscription
      .get()
      .then((state) =>
        setPlanInfo({
          name: state.currentPlan?.name || state.subscription.planCode,
          planCode: state.subscription.planCode,
          billingPeriod: state.subscription.billingPeriod,
          status: state.subscription.status,
          isOnTrial: state.subscription.isOnTrial,
          trialDaysLeft: state.subscription.trialDaysLeft,
        }),
      )
      .catch(() => undefined)
    api.integrations.list().then(setIntegrations).catch(() => undefined)
    if (user.role === 'owner') api.apiKeys.list().then(setApiKeys).catch(() => undefined)
  }, [user.email, user.role, user.workspace])

  const workspaceSettingsDirty = !settingsLoading && canEdit && (
    workspace !== savedWorkspaceSettings.name ||
    email !== savedWorkspaceSettings.email ||
    timezone !== savedWorkspaceSettings.timezone ||
    travelMode !== savedWorkspaceSettings.travelMode ||
    travelLocation !== savedWorkspaceSettings.travelLocation
  )

  const saveWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setSettingsError('')
    try {
      const updated = await api.workspace.updateSettings({
        name: workspace,
        email,
        timezone,
        travelMode,
        travelLocation,
      })
      setWorkspace(updated.name)
      setEmail(updated.email)
      setTimezone(updated.timezone)
      setTravelMode(updated.travelMode)
      setTravelLocation(updated.travelLocation)
      setSavedWorkspaceSettings({
        name: updated.name,
        email: updated.email,
        timezone: updated.timezone,
        travelMode: updated.travelMode,
        travelLocation: updated.travelLocation,
      })
      onSaved(updated)
      onToast('Workspace settings saved')
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : 'Failed to save workspace settings'
      setSettingsError(message)
      onToast(message)
    } finally {
      setSaving(false)
    }
  }

  const saveDisplayName = async () => {
    if (!displayName.trim() || displayName.trim() === user.name) return
    setSavingProfile(true)
    setSettingsError('')
    try {
      const updated = await api.auth.updateProfile({ name: displayName.trim() })
      onUserUpdated(updated)
      onToast('Display name updated')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to update display name.'
      setSettingsError(message)
      onToast(message)
    } finally {
      setSavingProfile(false)
    }
  }

  const checkDatabase = async () => {
    try {
      const info = await api.database.getInfo()
      setDbInfo(info)
      onToast(`${info.provider} is connected · ${info.version}`)
    } catch {
      onToast('Database health check failed')
    }
  }

  const changeAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setSettingsError('Profile images must be JPEG, PNG, or WebP files.')
      return
    }
    if (file.size <= 0 || file.size > 2 * 1024 * 1024) {
      setSettingsError('Profile images must be non-empty and no larger than 2 MB.')
      return
    }
    setAvatarSaving(true)
    setSettingsError('')
    try {
      const updated = await api.auth.updateAvatar(file)
      onUserUpdated(updated)
      onToast('Profile image updated')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to update your profile image.'
      setSettingsError(message)
      onToast(message)
    } finally {
      setAvatarSaving(false)
    }
  }

  const removeAvatar = async () => {
    if (!user.avatarUrl || avatarSaving) return
    setAvatarSaving(true)
    setSettingsError('')
    try {
      const updated = await api.auth.removeAvatar()
      onUserUpdated(updated)
      onToast('Profile image removed')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to remove your profile image.'
      setSettingsError(message)
      onToast(message)
    } finally {
      setAvatarSaving(false)
    }
  }

  const changeWorkspaceLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setSettingsError('Workspace logo must be JPEG, PNG, or WebP.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setSettingsError('Workspace logo must be under 2 MB.')
      return
    }
    setLogoSaving(true)
    setSettingsError('')
    try {
      const updated = await api.workspace.uploadLogo(file)
      setWorkspaceLogoUrl(updated.logoUrl)
      onSaved(updated)
      onToast('Workspace logo updated')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to update workspace logo.'
      setSettingsError(message)
      onToast(message)
    } finally {
      setLogoSaving(false)
    }
  }

  return (
    <div className="page settings-page">
      <PageHeader
        eyebrow="Workspace configuration"
        title="Preferences"
        description="Central configuration for your workspace, account, and connected services."
      />
      <div className="settings-layout">
        <aside className="settings-nav" aria-label="Preferences sections">
          <span className="settings-nav__group-label">Account</span>
          <button type="button" className={section === 'profile' ? 'is-active' : ''} onClick={() => setSection('profile')}>
            <Icon name="user" size={16} /> Profile
          </button>
          <span className="settings-nav__group-label">Workspace</span>
          <button type="button" className={section === 'integrations' ? 'is-active' : ''} onClick={() => setSection('integrations')}>
            <Icon name="plug" size={16} /> Integrations
          </button>
          <button type="button" className={section === 'plan' ? 'is-active' : ''} onClick={() => setSection('plan')}>
            <Icon name="credit-card" size={16} /> Pricing &amp; plan
          </button>
          <button type="button" className={section === 'builder' ? 'is-active' : ''} onClick={() => setSection('builder')}>
            <Icon name="sparkles" size={16} /> Workspace builder
          </button>
          <span className="settings-nav__group-label">Support</span>
          <button type="button" className={section === 'help' ? 'is-active' : ''} onClick={() => setSection('help')}>
            <Icon name="help" size={16} /> Help &amp; documentation
          </button>
          {user.isAdmin && (
            <button type="button" className={section === 'dev' ? 'is-active' : ''} onClick={() => setSection('dev')}>
              <Icon name="code" size={16} /> Dev Tools {user.isAdmin && <span className="settings-nav__badge">Admin</span>}
            </button>
          )}
          {!user.isAdmin && (
            <button type="button" className={section === 'dev' ? 'is-active' : ''} onClick={() => setSection('dev')}>
              <Icon name="code" size={16} /> Dev Tools
            </button>
          )}
          <div className="settings-nav__hint">
            <Icon name="user" size={12} /> Team &amp; collaborators are managed on the <button type="button" className="text-button" onClick={() => onNavigate('team')}>Team page</button>
          </div>
        </aside>
        <div className="settings-content">
          {settingsError && <p className="form-error" role="alert">{settingsError}</p>}

          {section === 'profile' && (
            <>
              <form className="settings-card" onSubmit={saveWorkspace}>
                <div className="settings-card__heading">
                  <h3>Profile</h3>
                  <p>Your personal details and workspace identity.</p>
                </div>
                <div className="workspace-logo-field">
                  <UserAvatar user={user} />
                  <div>
                    <strong>{user.name}</strong>
                    <small>{canEdit ? 'Workspace owner' : 'Workspace collaborator'} · {user.email}</small>
                    <div className="profile-image-actions">
                      <label className="button button--secondary button--small">
                        {avatarSaving ? 'Uploading…' : user.avatarUrl ? 'Change image' : 'Add image'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(event) => void changeAvatar(event)}
                          disabled={avatarSaving}
                        />
                      </label>
                      {user.avatarUrl && (
                        <button
                          type="button"
                          className="button button--ghost button--small"
                          onClick={() => void removeAvatar()}
                          disabled={avatarSaving}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <small className="profile-image-help">JPEG, PNG, or WebP · max 2 MB</small>
                  </div>
                </div>
                <label className="form-field">
                  <span>Display name</span>
                  <div className="form-field__with-action">
                    <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your display name" />
                    <button type="button" className="button button--secondary button--small" onClick={() => void saveDisplayName()} disabled={savingProfile || !displayName.trim() || displayName.trim() === user.name}>
                      {savingProfile ? 'Saving…' : 'Update name'}
                    </button>
                  </div>
                </label>
                <label className="form-field">
                  <span>Workspace / Business name</span>
                  <input value={workspace} onChange={(event) => setWorkspace(event.target.value)} disabled={!canEdit} placeholder="Your workspace name" />
                </label>
                <label className="form-field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={!canEdit}
                  />
                </label>
                <div className="settings-card__split">
                  <label className="form-field">
                    <span>Timezone</span>
                    <input
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                      placeholder="Africa/Johannesburg"
                      disabled={!canEdit}
                    />
                  </label>
                  <label className="form-field">
                    <span>Travel mode</span>
                    <select
                      value={travelMode}
                      onChange={(event) => setTravelMode(event.target.value)}
                      disabled={!canEdit}
                    >
                      <option value="none">Off</option>
                      <option value="traveling">Traveling</option>
                    </select>
                  </label>
                </div>
                {travelMode === 'traveling' && (
                  <label className="form-field">
                    <span>Current location</span>
                    <input
                      value={travelLocation}
                      onChange={(event) => setTravelLocation(event.target.value)}
                      placeholder="Cape Town, South Africa"
                      disabled={!canEdit}
                    />
                  </label>
                )}
                <div className="workspace-logo-field workspace-logo-field--workspace">
                  <span className="workspace-logo-preview">
                    {workspaceLogoUrl ? <img src={workspaceLogoUrl} alt="Workspace logo" /> : <span>{workspace.slice(0,2).toUpperCase() || 'WS'}</span>}
                  </span>
                  <div>
                    <strong>Workspace logo</strong>
                    <small>Shown on invoices, client pages, and shared work.</small>
                    <label className="button button--secondary button--small workspace-logo-upload">
                      {logoSaving ? 'Uploading…' : workspaceLogoUrl ? 'Change logo' : 'Add logo'}
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void changeWorkspaceLogo(event)} disabled={logoSaving || !canEdit} />
                    </label>
                  </div>
                </div>
                {planInfo && (
                  <div className="setting-row">
                    <span className="setting-row__icon"><Icon name="credit-card" size={18} /></span>
                    <div>
                      <strong>{planInfo.name} plan</strong>
                      <p>{planInfo.isOnTrial ? `${planInfo.trialDaysLeft} days of trial remaining` : `${planInfo.billingPeriod} billing · ${planInfo.status}`}</p>
                    </div>
                    <button type="button" className="button button--secondary button--small" onClick={() => setSection('plan')}>Manage plan</button>
                  </div>
                )}
                <div className="form-footer">
                  {canEdit ? (
                    <>
                      <span className={`settings-save-state${workspaceSettingsDirty ? ' is-dirty' : ''}`} aria-live="polite">
                        {settingsLoading ? 'Loading workspace settings…' : workspaceSettingsDirty ? 'Unsaved changes' : 'All changes saved'}
                      </span>
                      <button
                        className="button button--dark"
                        type="submit"
                        disabled={saving || settingsLoading || !workspaceSettingsDirty}
                      >
                        {saving ? 'Saving…' : settingsLoading ? 'Loading…' : 'Save workspace changes'}
                      </button>
                    </>
                  ) : (
                    <small>Only workspace owners can change these settings.</small>
                  )}
                </div>
              </form>
            </>
          )}

          {section === 'integrations' && (
            <div className="settings-stack">
              <section className="settings-card">
                <div className="settings-card__heading">
                  <h3>Connected apps</h3>
                  <p>Manage the services connected to this workspace. These previously lived on a separate page.</p>
                </div>
                <div className="settings-integrations-grid">
                  {integrations.length === 0 ? <p className="empty-copy">Loading integrations…</p> : integrations.slice(0, 8).map((integration) => (
                    <div key={integration.id} className="setting-row">
                      <span className="setting-row__icon"><Icon name={integration.icon as IconName} size={16} /></span>
                      <div>
                        <strong>{integration.name}</strong>
                        <p>{integration.description}</p>
                      </div>
                      <span className={integration.connected ? 'connected-label' : 'platform-label'}>{integration.connected ? 'Connected' : 'Not connected'}</span>
                    </div>
                  ))}
                </div>
                <button type="button" className="button button--secondary" onClick={() => onNavigate('integrations' as Page)}>Open full integrations</button>
              </section>
              <section className="settings-card">
                <div className="settings-card__heading">
                  <h3>API keys</h3>
                  <p>Scoped keys for server integrations. Workspace owners only.</p>
                </div>
                {apiKeys.length === 0 ? <p className="empty-copy">{user.role === 'owner' ? 'No API keys yet.' : 'Only owners can manage keys.'}</p> : (
                  <div className="settings-key-list">
                    {apiKeys.map((k) => (
                      <div key={k.id} className="setting-row">
                        <span className="setting-row__icon"><Icon name="code" size={14} /></span>
                        <div><strong>{k.name}</strong><p>{k.prefix} · {k.permissions.join(', ')}</p></div>
                        <small>{new Date(k.createdAt).toLocaleDateString()}</small>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" className="button button--secondary button--small" onClick={() => onNavigate('api' as Page)}>Manage API keys</button>
              </section>
            </div>
          )}

          {section === 'plan' && (
            <section className="settings-card">
              <div className="settings-card__heading">
                <h3>Pricing &amp; plan</h3>
                <p>Your current plan, billing cycle, and available upgrades. Region is detected automatically.</p>
              </div>
              <div className="setting-row">
                <span className="setting-row__icon">
                  <Icon name="credit-card" size={18} />
                </span>
                <div>
                  <strong>{planInfo ? `${planInfo.name} plan` : 'Loading plan…'}</strong>
                  <p>
                    {planInfo?.isOnTrial
                      ? `${planInfo.trialDaysLeft} days of your Solo trial remaining`
                      : planInfo
                        ? `${planInfo.billingPeriod} billing · ${planInfo.status}`
                        : 'Checking your current plan'}
                  </p>
                </div>
                <button
                  className="button button--dark button--small"
                  onClick={() => onNavigate('pricing' as Page)}
                >
                  {planInfo?.isOnTrial ? 'Choose a plan' : 'Manage plan'}
                </button>
              </div>
              <p className="settings-help">Prefer a full comparison? The detailed pricing page is now accessed from here to keep navigation focused.</p>
            </section>
          )}

          {section === 'builder' && (
            <section className="settings-card">
              <div className="settings-card__heading">
                <h3>Workspace builder</h3>
                <p>Review your workspace setup and refine modules, integrations, and automations.</p>
              </div>
              <div className="setting-row">
                <span className="setting-row__icon"><Icon name="sparkles" size={18} /></span>
                <div>
                  <strong>Tailor your workspace</strong>
                  <p>Adjustment stays in Preferences — the builder no longer clutters primary navigation.</p>
                </div>
                <button type="button" className="button button--dark button--small" onClick={() => onNavigate('builder' as Page)}>Open builder</button>
              </div>
            </section>
          )}

          {section === 'help' && (
            <section className="settings-card">
              <div className="settings-card__heading">
                <h3>Help &amp; documentation</h3>
                <p>Guidance for everyday work and workspace administration.</p>
              </div>
              <div className="settings-help-grid">
                <a href="https://lancee.app/docs" target="_blank" rel="noreferrer" className="setting-row setting-row--link">
                  <span className="setting-row__icon"><Icon name="help" size={18} /></span>
                  <div><strong>Documentation</strong><p>How clients, projects, invoices, and automations fit together.</p></div>
                  <Icon name="arrow-up-right" size={14} />
                </a>
                <a href="mailto:support@lancee.app" className="setting-row setting-row--link">
                  <span className="setting-row__icon"><Icon name="messages" size={18} /></span>
                  <div><strong>Contact support</strong><p>Reach the Lancee team — we keep billing and platform answers together.</p></div>
                  <Icon name="arrow-up-right" size={14} />
                </a>
                <div className="setting-row">
                  <span className="setting-row__icon"><Icon name="file" size={18} /></span>
                  <div><strong>In-app guidance</strong><p>Look for the contextual hints across projects, files, and invoicing.</p></div>
                </div>
              </div>
            </section>
          )}

          {section === 'dev' && (
          <>
          <section className="settings-card">
            <div className="settings-card__heading">
              <h3>Database Backend</h3>
              <p>Database storage engine and real-time schema status.</p>
            </div>
            <div className="setting-row">
              <span className="setting-row__icon">
                <Icon name="layers" size={18} />
              </span>
              <div>
                <strong>{dbInfo ? `${dbInfo.provider} Engine` : 'Loading database status…'}</strong>
                <p>{dbInfo ? `${dbInfo.mode} · ${dbInfo.tablesCount} tables initialized` : 'Waiting for the server health response'}</p>
              </div>
              <span className="configured-label" style={{ background: 'rgba(67, 189, 244, 0.15)', color: '#0070ba' }}>
                {dbInfo?.status || 'Checking'}
              </span>
            </div>
            <div className="setting-row">
              <span className="setting-row__icon">
                <Icon name="code" size={18} />
              </span>
              <div>
                <strong>ANSI SQL & Parameterized Drivers</strong>
                <p>{dbInfo ? `Version: ${dbInfo.version}` : 'Version unavailable until the health check completes'}</p>
              </div>
              <button className="button button--secondary button--small" onClick={() => void checkDatabase()}>
                Check Health
              </button>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card__heading">
              <h3>Developer workspace</h3>
              <p>Technical controls have been grouped here so everyday settings stay approachable.</p>
            </div>
            <div className="setting-row">
              <span className="setting-row__icon">
                <Icon name="shield" size={18} />
              </span>
              <div>
                <strong>API keys</strong>
                <p>Create and revoke scoped keys for server integrations.</p>
              </div>
              <button className="button button--secondary button--small" onClick={() => onNavigate('api')}>
                Manage keys
              </button>
            </div>
            <div className="setting-row">
              <span className="setting-row__icon">
                <Icon name="activity" size={18} />
              </span>
              <div>
                <strong>Activity logs</strong>
                <p>Inspect workflow runs, status changes, and failures.</p>
              </div>
              <button className="button button--secondary button--small" onClick={() => onNavigate('runs')}>
                View logs
              </button>
            </div>
          </section>
          </>
          )}
        </div>
      </div>
    </div>
  )
}

function PolicyFooter() {
  const identity = BUSINESS_IDENTITY
  const year = new Date().getFullYear()
  return (
    <footer className="landing-footer policy-footer">
      <small>© {year} {identity.platformName} All Rights Reserved</small>
      <small>
        {identity.platformLegalStyle}
        {identity.companyRegistrationNumber && (
          <>
            <br />
            Company registration: {identity.companyRegistrationNumber}
          </>
        )}
        {identity.vatRegistrationNumber && (
          <>
            <br />
            VAT registration: {identity.vatRegistrationNumber}
          </>
        )}
      </small>
      {identity.supportEmail && (
        <small>
          Support:{" "}
          <a href={`mailto:${identity.supportEmail}`}>{identity.supportEmail}</a>
        </small>
      )}
      <small>
        Engineered by{" "}
        <a className="landing-footer__credit" href="https://hookitupservices.com" target="_blank" rel="noopener noreferrer">
          Hookitup Solutions
        </a>
      </small>
    </footer>
  )
}

function TermsPage({ onBack }: { onBack: () => void }) {
  return (
    <main className="landing policy-page">
      <header className="landing-nav">
        <a className="landing-brand" href="#" onClick={onBack}>
          <BrandMark />
          <span>lancee</span>
        </a>
        <nav aria-label="Policy navigation">
          <a href="#" onClick={onBack}>Back to home</a>
        </nav>
      </header>
      <section className="policy-content">
        <h1>Terms and Conditions</h1>
        <p>Last updated: July 2026</p>
        <h2>1. Acceptance of Terms</h2>
        <p>By accessing or using lancee ("the Service"), you agree to be bound by these Terms and Conditions. If you do not agree, do not use the Service.</p>
        <h2>2. Description of Service</h2>
        <p>lancee provides a workspace platform for independent professionals to manage projects, ideas, automations, invoices, and payments.</p>
        <h2>3. User Responsibilities</h2>
        <p>You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to use the Service in compliance with all applicable laws.</p>
        <h2>4. Intellectual Property</h2>
        <p>All content, trademarks, and intellectual property within the Service remain the property of lancee or its licensors. You may not reproduce, distribute, or create derivative works without explicit permission.</p>
        <h2>5. Limitation of Liability</h2>
        <p>lancee is provided "as is" without warranties of any kind. lancee shall not be liable for any damages arising from the use or inability to use the Service.</p>
        <h2>6. Termination</h2>
        <p>We reserve the right to suspend or terminate access to the Service at our discretion, without prior notice, for conduct that violates these Terms or is harmful to other users.</p>
        <h2>7. Changes to Terms</h2>
        <p>We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the new Terms.</p>
        <h2>8. Contact</h2>
        <p>For questions about these Terms, please contact us through the Service.</p>
      </section>
      <PolicyFooter />
    </main>
  )
}

function PrivacyPage({ onBack }: { onBack: () => void }) {
  return (
    <main className="landing policy-page">
      <header className="landing-nav">
        <a className="landing-brand" href="#" onClick={onBack}>
          <BrandMark />
          <span>lancee</span>
        </a>
        <nav aria-label="Policy navigation">
          <a href="#" onClick={onBack}>Back to home</a>
        </nav>
      </header>
      <section className="policy-content">
        <h1>Privacy Policy</h1>
        <p>Last updated: July 2026</p>
        <h2>1. Information We Collect</h2>
        <p>We collect information you provide when creating an account, including your name, email address, and workspace details. We also collect data about your usage of the Service. When you connect a Google account, we collect only the Google user profile information and the Gmail, Calendar, Drive, Contacts, Docs, or Sheets data that you explicitly authorize us to access.</p>
        <h2>2. How We Use Your Information</h2>
        <p>Your information is used to provide, maintain, and improve the Service; to process transactions; to communicate with you; and to ensure security and compliance. Authorized Google data is used only to provide the connected functionality you request, such as syncing calendar events, processing mail, and managing files within your workspace.</p>
        <h2>3. Data Storage and Security</h2>
        <p>We implement industry-standard security measures including encryption at rest and in transit. Credentials are stored server-side and never exposed to clients.</p>
        <h2>4. Third-Party Services</h2>
        <p>The Service integrates with third-party tools you explicitly authorize. We do not sell your personal data or share it with third parties except where strictly necessary to provide the Service, where you instruct us to do so, or where required by law. Data shared with connected services is governed by their respective privacy policies.</p>
        <h2>5. Data Retention</h2>
        <p>We retain your data for as long as your account is active. Upon account deletion, data is permanently removed within 30 days.</p>
        <h2>6. Your Rights</h2>
        <p>You may access, update, or delete your personal data at any time through your account settings. You may disconnect your Google account at any time, which stops future access to Google data. You may also request a copy or deletion of your data by contacting us.</p>
        <h2>7. Cookies</h2>
        <p>We use HTTP-only session cookies essential for authentication. No tracking cookies are used.</p>
        <h2>8. Contact</h2>
        <p>For privacy-related inquiries or data deletion requests, email <a href="mailto:support@lancee.app">support@lancee.app</a>.</p>
      </section>
      <PolicyFooter />
    </main>
  )
}

function RefundPage({ onBack }: { onBack: () => void }) {
  return (
    <main className="landing policy-page">
      <header className="landing-nav">
        <a className="landing-brand" href="#" onClick={onBack}>
          <BrandMark />
          <span>lancee</span>
        </a>
        <nav aria-label="Policy navigation">
          <a href="#" onClick={onBack}>Back to home</a>
        </nav>
      </header>
      <section className="policy-content">
        <h1>Refund Policy</h1>
        <p>Last updated: July 2026</p>
        <h2>1. Subscription Billing</h2>
        <p>lancee operates on a subscription billing model. Charges are processed through integrated payment providers (Stripe, PayPal, Paystack) and are subject to their terms.</p>
        <h2>2. Refund Eligibility</h2>
        <p>Refund requests are evaluated on a case-by-case basis. If you experience a technical issue that prevents normal use of the Service, we will work to resolve it promptly.</p>
        <h2>3. Cancellation</h2>
        <p>You may cancel your subscription at any time. Upon cancellation, access to paid features continues until the end of the current billing period.</p>
        <h2>4. Disputes</h2>
        <p>If you believe you have been billed incorrectly, please contact us within 14 days of the charge. We will investigate and correct any errors.</p>
        <h2>5. Changes to This Policy</h2>
        <p>We reserve the right to modify this Refund Policy. Users will be notified of material changes.</p>
        <h2>6. Contact</h2>
        <p>For refund requests or billing questions, please contact us through the Service.</p>
      </section>
      <PolicyFooter />
    </main>
  )
}

function LandingPage({
  onSignIn,
  onSignUp,
  onPricing,
}: {
  onSignIn: () => void
  onSignUp: () => void
  onPricing: () => void
}) {
  const landingRef = useRef<HTMLElement>(null)
  const [policyView, setPolicyView] = useState<'landing' | 'terms' | 'privacy' | 'refund'>('landing')
  const [featuresOpen, setFeaturesOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [signupNotice, setSignupNotice] = useState(false)
  const [registrationEnabled, setRegistrationEnabled] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatDraft, setChatDraft] = useState('')
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'assistant' | 'user'; body: string }>>([
    { role: 'assistant' as const, body: 'Hi! I’m here to help you with anything you need.' },
  ])

  useEffect(() => {
    let active = true
    void api.auth.getConfig()
      .then((config) => {
        if (active) setRegistrationEnabled(config.registrationEnabled)
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!signupNotice) return
    const timeout = window.setTimeout(() => setSignupNotice(false), 4200)
    return () => window.clearTimeout(timeout)
  }, [signupNotice])

  const handleSignUp = () => {
    if (!registrationEnabled) {
      setSignupNotice(true)
      return
    }
    onSignUp()
  }

  const sendChatMessage = (message: string) => {
    const body = message.trim()
    if (!body) return
    setChatMessages((current) => [
      ...current,
      { role: 'user' as const, body },
      { role: 'assistant' as const, body: 'Thanks — this is a demo chat for now. A Lancee specialist will be able to help with that here soon.' },
    ])
    setChatDraft('')
  }

  useEffect(() => {
    const landing = landingRef.current
    if (!landing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    const headings = Array.from(
      landing.querySelectorAll<HTMLElement>(
        '.landing-section h2, .landing-section h3, .landing-workflow h2, .landing-connected h2, .landing-intelligence h2, .landing-pulse h2, .landing-security h2, .landing-cta h2',
      ),
    )
    const heroLines = Array.from(
      landing.querySelectorAll<HTMLElement>('.landing-hero__title-line'),
    )
    const heroProduct = landing.querySelector<HTMLElement>('.landing-product')

    gsap.set(headings, {
      autoAlpha: 0,
      y: 46,
      filter: 'blur(10px)',
      clipPath: 'inset(0 0 24% 0)',
    })

    const heroTimeline = gsap.timeline({ defaults: { ease: 'power4.out' } })
    heroTimeline
      .fromTo(
        '.landing-hero .landing-eyebrow',
        { autoAlpha: 0, y: 16 },
        { autoAlpha: 1, y: 0, duration: 0.65 },
      )
      .fromTo(
        heroLines,
        { autoAlpha: 0, yPercent: 115, rotate: 1.5, filter: 'blur(12px)' },
        {
          autoAlpha: 1,
          yPercent: 0,
          rotate: 0,
          filter: 'blur(0px)',
          duration: 1.05,
          stagger: 0.12,
        },
        '-=0.28',
      )

    if (heroProduct) {
      heroTimeline.fromTo(
        heroProduct,
        { autoAlpha: 0, y: 34, scale: 0.975 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 1.15,
          clearProps: 'opacity,visibility,transform',
        },
        '-=0.8',
      )
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const heading = entry.target as HTMLElement
          gsap.to(heading, {
            autoAlpha: 1,
            y: 0,
            filter: 'blur(0px)',
            clipPath: 'inset(0 0 0% 0)',
            duration: 0.95,
            ease: 'power4.out',
            clearProps: 'transform,filter,clipPath,opacity,visibility',
          })
          observer.unobserve(heading)
        })
      },
      {
        threshold: 0.22,
        rootMargin: '0px 0px -8% 0px',
      },
    )

    headings.forEach((heading) => observer.observe(heading))

    return () => {
      observer.disconnect()
      heroTimeline.kill()
      gsap.killTweensOf([...headings, ...heroLines, ...(heroProduct ? [heroProduct] : [])])
      gsap.set([...headings, ...heroLines, ...(heroProduct ? [heroProduct] : [])], { clearProps: 'all' })
    }
  }, [])

if (policyView !== 'landing') {
    const back = () => setPolicyView('landing')
    if (policyView === 'terms') return <TermsPage onBack={back} />
    if (policyView === 'privacy') return <PrivacyPage onBack={back} />
    if (policyView === 'refund') return <RefundPage onBack={back} />
  }

  if (featuresOpen) {
    return (
      <FeaturesPage
        onBack={() => setFeaturesOpen(false)}
        onSignIn={onSignIn}
        onSignUp={handleSignUp}
        signupsPaused={!registrationEnabled}
      />
    )
  }

  return (
    <main ref={landingRef} className="landing">
      <header className="landing-nav">
        <a className="landing-brand" href="#top" aria-label="lancee home">
          <BrandMark />
          <span>lancee</span>
        </a>
        <nav id="landing-navigation" className={navOpen ? 'is-open' : ''} aria-label="Public navigation">
          <a href="#platform" onClick={() => setNavOpen(false)}>What it does</a>
          <a href="#workflow" onClick={() => setNavOpen(false)}>How it works</a>
          <a href="#connected-intelligence" onClick={() => setNavOpen(false)}>Intelligence</a>
          <a href="#integrations" onClick={() => setNavOpen(false)}>Connections</a>
          <a href="/pricing" onClick={(event) => { event.preventDefault(); setNavOpen(false); onPricing() }}>
            Pricing
          </a>
          <button className="landing-nav-features" onClick={() => { setNavOpen(false); setFeaturesOpen(true) }}>
            Features
          </button>
          <div className="landing-nav__mobile-actions">
            <button className="landing-sign-in" onClick={() => { setNavOpen(false); onSignIn() }}>
              Sign in
            </button>
            <button className="button button--primary btn-shine" onClick={() => { setNavOpen(false); handleSignUp() }}>
              Sign Up
            </button>
          </div>
        </nav>
        <button
          className="landing-menu-toggle"
          aria-controls="landing-navigation"
          aria-expanded={navOpen}
          aria-label={navOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setNavOpen((current) => !current)}
        >
          <Icon name={navOpen ? 'close' : 'menu'} size={19} />
        </button>
        <div>
          <button className="landing-sign-in" onClick={onSignIn}>
            Sign in
          </button>
          <button className="button button--primary btn-shine" onClick={handleSignUp}>
            Sign Up <BrandMark compact />
          </button>
        </div>
      </header>

      <section className="landing-hero" id="top">
        <LandingAmbientRings />
        <div className="landing-hero__glow" aria-hidden="true" />
        <div className="landing-hero__copy">
          <span className="landing-eyebrow">
            <i /> Your work · ideas · tools · money
          </span>
          <h1 aria-label="Run your business. Keep your freedom.">
            <span className="landing-hero__title-mask">
              <span className="landing-hero__title-line">Run your business.</span>
            </span>
            <span className="landing-hero__title-mask">
              <span className="landing-hero__title-line">
                <em>Keep your freedom.</em>
              </span>
            </span>
          </h1>
          <p>
            Lancee connects your projects, clients, conversations, meetings, files, ideas and money — then turns that everyday activity into useful business intelligence.
          </p>
          <p style={{ marginTop: '14px', color: '#9ba495', fontSize: '14px', lineHeight: 1.7 }}>
            Instead of making you search through your business to understand what is happening, Lancee helps surface what matters, what changed, and what may need your attention.
          </p>
          <div className="landing-hero__actions">
            <button className="button button--primary btn-shine" onClick={handleSignUp}>
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
              <Icon name="sparkles" size={14} /> Connected Intelligence
            </span>
            <span>
              <Icon name="wallet" size={14} /> From brief to paid
            </span>
            <span>
              <Icon name="plug" size={14} /> Works with your tools
            </span>
          </div>
        </div>

        <HeroWorkspacePreview />
      </section>

      <section className="landing-proof">
        <span>One workspace for</span>
        <div className="landing-proof__viewport">
          <div className="landing-proof__track">
            {[0, 1].map((set) => (
              <div className="landing-proof__set" key={set} aria-hidden={set === 1}>
                <strong>Clients</strong>
                <Icon name="briefcase" size={15} />
                <strong>Projects</strong>
                <Icon name="lightbulb" size={15} />
                <strong>Ideas</strong>
                <Icon name="activity" size={15} />
                <strong>Automations</strong>
                <Icon name="wallet" size={15} />
                <strong>Invoices</strong>
                <Icon name="check-circle" size={15} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-platform" id="platform">
        <div className="landing-section__heading">
          <span className="landing-eyebrow"><i /> Unified Workspace</span>
          <h2>Your business, connected.</h2>
          <p>
            Lancee brings the activity around your business together so projects, clients, conversations, meetings, ideas and money no longer exist as isolated records.
          </p>
          <p style={{ marginTop: '12px', color: '#727a6f', fontSize: '14px', lineHeight: 1.75 }}>
            As work happens, Lancee builds context around it — helping you understand what needs attention and what should happen next.
          </p>
          <button className="landing-section__cta" onClick={() => setFeaturesOpen(true)}>
            Check out all features <Icon name="arrow-up-right" size={14} />
          </button>
        </div>
        <ConnectedWorkspacePanel />
      </section>

      <section className="landing-connected" id="connected-intelligence" aria-labelledby="connected-intelligence-title">
        <LandingAmbientRings />
        <div className="landing-connected__copy">
          <span className="landing-eyebrow">Connected Intelligence</span>
          <h2 id="connected-intelligence-title">Your work knows more than you think.</h2>
          <p>
            Every email, meeting, project update, payment, deadline and client interaction tells part of a story. Normally those signals live in different places.
          </p>
          <p>
            Lancee connects them. As your workspace grows, Lancee can surface relationships and changes that are difficult to notice when looking at each tool individually.
          </p>
        </div>
        <div className="landing-connected__visual" aria-hidden="true">
          <div className="landing-context-map">
            <svg viewBox="0 0 760 430" preserveAspectRatio="none">
              <path d="M86 92 C220 92 278 166 360 215" />
              <path d="M112 330 C220 324 286 262 360 215" />
              <path d="M248 58 C290 116 322 168 360 215" />
              <path d="M674 92 C542 92 482 166 400 215" />
              <path d="M648 330 C540 324 474 262 400 215" />
              <path d="M512 372 C474 310 436 260 400 215" />
            </svg>
            <span className="landing-context-map__node is-email"><Icon name="briefcase" size={14} /> Projects</span>
            <span className="landing-context-map__node is-calendar"><Icon name="user" size={14} /> Clients</span>
            <span className="landing-context-map__node is-client"><Icon name="lightbulb" size={14} /> Ideas</span>
            <span className="landing-context-map__node is-task"><Icon name="calendar" size={14} /> Meetings</span>
            <span className="landing-context-map__node is-payment"><Icon name="messages" size={14} /> Communication</span>
            <span className="landing-context-map__node is-assistant"><Icon name="activity" size={14} /> Automations</span>
            <div className="landing-context-map__core">
              <BrandMark compact />
              <span>CONNECTED</span>
              <strong>Intelligence</strong>
            </div>
            <i className="landing-context-map__signal landing-context-map__signal--one" />
            <i className="landing-context-map__signal landing-context-map__signal--two" />
            <i className="landing-context-map__signal landing-context-map__signal--three" />
          </div>
          <div className="landing-connected__insights">
            <article className="landing-connected__insight">
              <strong>Client attention <em>↑</em></strong>
              <span>Communication increased 38% this week</span>
            </article>
            <article className="landing-connected__insight">
              <strong>Meeting load <em>↑</em></strong>
              <span>Juniper & Tide has twice its normal meeting activity</span>
            </article>
            <article className="landing-connected__insight">
              <strong>Payment</strong>
              <span>Invoice #1042 due in 3 days</span>
            </article>
            <article className="landing-connected__insight">
              <strong>Follow-up</strong>
              <span>Feedback received but no task created</span>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-workflow" id="workflow">
        <div className="landing-workflow__copy">
          <span className="landing-eyebrow"><i /> Connected Workflow</span>
          <h2>From first idea to paid — without losing the context between.</h2>
          <p>
            Do the creative work yourself. Let Lancee carry the context, surface the next step, and quietly handle only the repeatable parts you choose.
          </p>
          <div className="workflow-steps workflow-steps--four">
            <div>
              <span>1</span>
              <div>
                <strong>Capture</strong>
                <p>Briefs, ideas, references and client requirements.</p>
              </div>
            </div>
            <div>
              <span>2</span>
              <div>
                <strong>Work</strong>
                <p>Projects, communication, meetings, files and feedback stay connected.</p>
              </div>
            </div>
            <div>
              <span>3</span>
              <div>
                <strong>Understand</strong>
                <p>Lancee surfaces changes, risks and useful next actions from the surrounding activity.</p>
              </div>
            </div>
            <div>
              <span>4</span>
              <div>
                <strong>Deliver & Get Paid</strong>
                <p>Approval, delivery, invoices and payments complete the same connected journey.</p>
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

      <section
        className="landing-intelligence"
        id="decision-intelligence"
        aria-labelledby="decision-intelligence-title"
      >
        <LandingAmbientRings />
        <div className="landing-intelligence__copy">
          <span className="landing-eyebrow">
            <i /> Decision intelligence
          </span>
          <h2 id="decision-intelligence-title">
            Make the next call with the last one in view.
          </h2>
          <p>
            Lancee keeps the decision, why you made it, what happened, and the evidence around it. When a similar choice comes up, it brings back the closest lessons and shows where the context matches—or doesn&apos;t.
          </p>
          <div className="landing-intelligence__principles">
            <article>
              <span aria-hidden="true"><Icon name="layers" size={18} /></span>
              <div>
                <h3>Remember the decision</h3>
                <p>Keep the original choice, rationale, and business context together.</p>
              </div>
            </article>
            <article>
              <span aria-hidden="true"><Icon name="activity" size={18} /></span>
              <div>
                <h3>Measure what changed</h3>
                <p>Attach observed outcomes, supporting evidence, and known confounders.</p>
              </div>
            </article>
            <article>
              <span aria-hidden="true"><Icon name="target" size={18} /></span>
              <div>
                <h3>Compare with context</h3>
                <p>See the shared factors and material differences before acting.</p>
              </div>
            </article>
          </div>
          <p className="landing-intelligence__boundary">
            <span aria-hidden="true"><Icon name="shield" size={15} /></span>
            Measured outcomes stay authoritative. AI interprets context; it never rewrites the facts.
          </p>
        </div>

        <div
          className="landing-intelligence__visual"
          role="group"
          aria-label="Example decision comparison"
        >
          <div className="landing-intelligence__visual-header">
            <small>EXAMPLE DECISION FLOW</small>
            <span><i /> Context checked</span>
          </div>
          <div className="landing-decision-chain">
            <div className="landing-decision-chain__step">
              <small>DECISION</small>
              <strong>Increase project scope</strong>
            </div>
            <div className="landing-decision-chain__arrow"><Icon name="chevron-down" size={12} /></div>
            <div className="landing-decision-chain__step">
              <small>WHY</small>
              <strong>Client requested additional deliverables</strong>
            </div>
            <div className="landing-decision-chain__arrow"><Icon name="chevron-down" size={12} /></div>
            <div className="landing-decision-chain__step">
              <small>CONTEXT</small>
              <strong>Deadline +14 days · Budget +R18,000</strong>
            </div>
            <div className="landing-decision-chain__arrow"><Icon name="chevron-down" size={12} /></div>
            <div className="landing-decision-chain__step is-outcome">
              <small>OUTCOME</small>
              <strong>Delivered on time · Margin maintained</strong>
            </div>
          </div>
          <div className="landing-decision-path" aria-hidden="true">
            <span />
            <Icon name="chevron-down" size={14} />
            <span />
          </div>
          <article className="landing-decision-match">
            <small>SIMILAR DECISION FOUND · “Juniper & Tide”</small>
            <h3>Revised a similar proposal</h3>
            <div className="landing-decision-match__meta">
              <span className="landing-decision-match__badge"><Icon name="target" size={12} /> Context match: High</span>
            </div>
            <div className="landing-decision-factors">
              <div>
                <strong><Icon name="check-circle" size={14} /> Shared context</strong>
                <ul>
                  <li>Same service mix</li>
                  <li>Client asked for flexibility</li>
                </ul>
              </div>
              <div>
                <strong><Icon name="layers" size={14} /> Material differences</strong>
                <ul>
                  <li>Shorter deadline</li>
                  <li>Higher meeting load</li>
                  <li>Existing unpaid invoice</li>
                </ul>
              </div>
            </div>
            <button className="landing-decision-match__cta" type="button">Review previous decision <Icon name="arrow-up-right" size={12} /></button>
          </article>
          <div className="landing-decision-status">
            <span><Icon name="target" size={15} /> Comparable, with context</span>
            <small>Evidence stays attached</small>
          </div>
        </div>
      </section>

      <section className="landing-pulse" id="pulse" aria-labelledby="pulse-title">
        <div className="landing-pulse__copy">
          <span className="landing-eyebrow"><i /> Business Pulse</span>
          <h2 id="pulse-title">A calm summary of what&apos;s happening.</h2>
          <p>
            Lancee summarises the state of your workspace without turning it into an alarm-heavy dashboard. What&apos;s moving, what needs attention, and where opportunity is forming.
          </p>
        </div>
        <div className="landing-pulse__visual" role="group" aria-label="Business Pulse example">
          <div className="landing-pulse__header">
            <strong>BUSINESS PULSE</strong>
            <span>Monday, 08:32</span>
          </div>
          <div className="landing-pulse__grid">
            <article className="landing-pulse__card landing-pulse__card--ok">
              <small>Moving well</small>
              <strong>6 projects progressing normally</strong>
            </article>
            <article className="landing-pulse__card landing-pulse__card--attention">
              <small>Needs attention</small>
              <strong>2 client conversations waiting for follow-up</strong>
            </article>
            <article className="landing-pulse__card landing-pulse__card--money">
              <small>Money</small>
              <strong>R46,200 outstanding</strong>
              <span>2 invoices · 1 due in 3 days</span>
            </article>
            <article className="landing-pulse__card landing-pulse__card--opportunity">
              <small>Opportunity</small>
              <strong>Client activity increased around Juniper & Tide</strong>
            </article>
            <article className="landing-pulse__card landing-pulse__card--today">
              <small>Today</small>
              <strong>3 useful actions suggested</strong>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-room" id="room" aria-labelledby="room-title">
        <div className="landing-room__halo" aria-hidden="true" />
        <div className="landing-room__intro">
          <span className="landing-eyebrow"><i /> Lancee Room</span>
          <h2 id="room-title">The room where the work keeps moving.</h2>
          <p>
            Bring your workspace team and external clients into one focused meeting. Every useful moment stays connected to the work that follows.
          </p>
          <div className="landing-room__audience" aria-label="Meeting participants">
            <span>Workspace teams</span>
            <i aria-hidden="true" />
            <span>External meetings</span>
          </div>
        </div>

        <div className="landing-room__stage">
          <div className="landing-room__image-wrap">
            <img src="/img/meeting.png" alt="Four people collaborating in a Lancee Room video meeting" />
            <span className="landing-room__live"><i /> Live collaboration</span>
          </div>
          <div className="landing-room__signal" aria-hidden="true">
            <span /><span /><span /><span />
          </div>
        </div>

        <div className="landing-room__flow" aria-label="Lancee Room capabilities">
          <div className="landing-room__capability">
            <span>01</span>
            <strong>In-meeting chat</strong>
            <p>Decisions and links land beside the conversation.</p>
          </div>
          <div className="landing-room__capability">
            <span>02</span>
            <strong>Screen share</strong>
            <p>Review the work in the same place it lives.</p>
          </div>
          <div className="landing-room__capability">
            <span>03</span>
            <strong>Transcript + AI summary</strong>
            <p>Leave with the important points and next steps clear.</p>
          </div>
          <div className="landing-room__capability landing-room__capability--intelli">
            <span>04</span>
            <strong>Intelli-connect</strong>
            <p>AI links meeting transcripts to the right clients and projects—then uses that context to make smarter connections.</p>
          </div>
        </div>
      </section>

      <section className="landing-section landing-integrations" id="integrations">
        <div className="landing-section__heading">
          <span className="landing-eyebrow"><i /> Connected Tools</span>
          <h2>Lancee connects the work already happening around you.</h2>
          <p>
            Keep using the services your business relies on. Lancee brings the useful context back into your workspace.
          </p>
        </div>
        <div className="landing-integration-grid">
          <article>
            <span className="landing-integration-badge"><Icon name="messages" size={16} /></span>
            <div>
              <small>WORKSPACE</small>
              <h3>Mail · Calendar · Drive · Dropbox</h3>
              <p>Communication, schedules and files connected to your work.</p>
            </div>
          </article>
          <article>
            <span className="landing-integration-badge landing-integration-badge--money"><Icon name="wallet" size={16} /></span>
            <div>
              <small>PAYMENTS</small>
              <h3>Secure online payments</h3>
              <p>Move naturally from completed work to invoicing and payment.</p>
            </div>
          </article>
          <article>
            <span className="landing-integration-badge landing-integration-badge--auto"><Icon name="activity" size={16} /></span>
            <div>
              <small>AUTOMATION</small>
              <h3>Lancee Workflows · n8n</h3>
              <p>Connect repeatable processes without turning Lancee into a generic integration marketplace.</p>
            </div>
          </article>
          <article>
            <span className="landing-integration-badge landing-integration-badge--ai"><Icon name="sparkles" size={16} /></span>
            <div>
              <small>AI</small>
              <h3>Lancee Assistant · Optional external AI</h3>
              <p>AI operates on workspace context where authorised rather than as a standalone chatbot.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="landing-cta">
        <LandingAmbientRings />
        <BrandMark />
        <span className="landing-eyebrow"><i /> A lighter way to run your business</span>
        <h2>Carry the whole studio. Not the whole workload.</h2>
        <button className="button button--primary btn-shine" onClick={handleSignUp}>
          Sign Up <BrandMark compact />
        </button>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer__brand" aria-label="lancee">
          <BrandMark />
          <span>lancee</span>
        </div>
        <small>© {new Date().getFullYear()} {BUSINESS_IDENTITY.platformName} All Rights Reserved</small>
        <small>{BUSINESS_IDENTITY.platformLegalStyle}</small>
        <div className="landing-footer__links">
          <a href="lancee.html" target="_blank" rel="noopener noreferrer">Documentation</a>
          <button onClick={() => setPolicyView('terms')}>Terms &amp; Conditions</button>
          <button onClick={() => setPolicyView('privacy')}>Privacy Policy</button>
          <button onClick={() => setPolicyView('refund')}>Refund Policy</button>
        </div>
        <small>
          Engineered by{" "}
          <a className="landing-footer__credit" href="https://hookitupservices.com" target="_blank" rel="noopener noreferrer">
            Hookitup Solutions
          </a>
        </small>
      </footer>

      <aside className={`landing-chat ${chatOpen ? 'is-open' : ''}`} aria-label="Lancee chat">
        {chatOpen && (
          <section className="landing-chat__panel" aria-label="Chat with Lancee">
            <header className="landing-chat__header">
              <BrandMark compact />
              <div>
                <strong>Hi there! <span aria-hidden="true">👋</span></strong>
                <p>How can we help you today?</p>
              </div>
              <button type="button" onClick={() => setChatOpen(false)} aria-label="Close chat">
                <Icon name="close" size={18} />
              </button>
            </header>
            <div className="landing-chat__body" aria-live="polite">
              {chatMessages.map((message, index) => (
                <div className={`landing-chat__message landing-chat__message--${message.role}`} key={`${message.role}-${index}`}>
                  {message.role === 'assistant' && <BrandMark compact />}
                  <p>{message.body}</p>
                </div>
              ))}
              <small>Just now</small>
              <div className="landing-chat__prompts" aria-label="Suggested questions">
                {['Ask a question', 'See features', 'Contact us'].map((prompt) => (
                  <button type="button" key={prompt} onClick={() => sendChatMessage(prompt)}>{prompt}</button>
                ))}
              </div>
            </div>
            <form className="landing-chat__composer" onSubmit={(event) => { event.preventDefault(); sendChatMessage(chatDraft) }}>
              <input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder="Type your message…" aria-label="Message Lancee" />
              <button type="submit" aria-label="Send message"><Icon name="arrow-right" size={17} /></button>
            </form>
          </section>
        )}
        <button
          className="landing-chat__launcher"
          type="button"
          aria-expanded={chatOpen}
          aria-label={chatOpen ? 'Close Lancee chat' : 'Open Lancee chat'}
          onClick={() => setChatOpen((current) => !current)}
        >
          <img src="/svg/ai-chat.svg" alt="" />
        </button>
      </aside>

      {signupNotice && (
        <div className="signup-paused-toast" role="status">
          <span>
            <Icon name="alert" size={15} />
          </span>
          <div>
            <strong>Sign-ups are temporarily paused</strong>
            <p>New accounts are on hold for now. Existing members can still sign in.</p>
          </div>
          <button onClick={() => setSignupNotice(false)} aria-label="Dismiss">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </main>
  )

}

function AuthStory({ onBack }: { onBack: () => void }) {
  return (
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
            <strong>One</strong>
            <span>Clear view of current projects</span>
          </div>
          <div>
            <strong>Live</strong>
            <span>Invoices and payment status</span>
          </div>
        </div>
      </div>
      <div className="auth-story__visual" aria-hidden="true">
        <div className="orbit orbit--one" />
        <div className="orbit orbit--two" />
        <div className="orbit-center">
          <BrandMark compact />
          <small>Lancee</small>
        </div>
        <span className="orbit-node orbit-node--one">
          <Icon name="messages" size={17} />
          <small>Email</small>
        </span>
        <span className="orbit-node orbit-node--two">
          <Icon name="calendar" size={17} />
          <small>Meeting</small>
        </span>
        <span className="orbit-node orbit-node--three">
          <Icon name="target" size={17} />
          <small>Project</small>
        </span>
        <span className="orbit-node orbit-node--four">
          <Icon name="wallet" size={17} />
          <small>Invoice</small>
        </span>
        <span className="orbit-node orbit-node--five">
          <Icon name="file" size={17} />
          <small>Files</small>
        </span>
        <span className="orbit-node orbit-node--six">
          <Icon name="sparkles" size={17} />
          <small>Context</small>
        </span>
      </div>
      <p className="auth-quote">
        &ldquo;I can land in a new city and know exactly what needs me, what can wait, and
        what has been paid.&rdquo;
        <span>&mdash; Amara, independent packaging designer</span>
      </p>
    </section>
  )
}

function AuthScreen({
  onSignIn,
  onRegister,
  onRegisterStart,
  onBack,
  onNavigate,
  initialMode,
}: {
  onSignIn: (email: string, password: string) => Promise<void>
  onRegister: (
    email: string,
    password: string,
    name?: string,
    workspace?: string,
    invitationToken?: string,
  ) => Promise<void>
  onRegisterStart: (email: string, name?: string, workspace?: string) => Promise<void>
  onBack: () => void
  onNavigate: (view: 'login' | 'register') => void
  initialMode: 'login' | 'register'
}) {
  const [invitationToken] = useState(
    () => new URLSearchParams(window.location.search).get('invite') || '',
  )
  const [mode, setMode] = useState<'login' | 'register'>(
    invitationToken ? 'register' : initialMode,
  )
  const [registrationEnabled, setRegistrationEnabled] = useState(false)
  const [existingInvitedAccount, setExistingInvitedAccount] = useState(false)
  const [invitationLoading, setInvitationLoading] = useState(Boolean(invitationToken))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [workspace, setWorkspace] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmationSent, setConfirmationSent] = useState(false)

  useEffect(() => {
    if (!invitationToken) setMode(initialMode)
  }, [initialMode, invitationToken])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('google') !== 'error') return
    setError(params.get('googleMessage') || 'Google sign-in could not be completed.')
    params.delete('google')
    params.delete('googleMessage')
    window.history.replaceState({}, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`)
  }, [])

  useEffect(() => {
    let active = true
    if (invitationToken) {
      void api.auth
        .getInvitation(invitationToken)
        .then((invitation) => {
          if (!active) return
          setEmail(invitation.email)
          setName(invitation.name)
          setWorkspace(invitation.workspace)
          setExistingInvitedAccount(invitation.existingAccount)
        })
        .catch((caught) => {
          if (active) {
            setError(
              caught instanceof Error ? caught.message : 'Unable to load this invitation.',
            )
          }
        })
        .finally(() => {
          if (active) setInvitationLoading(false)
        })
    } else {
      void api.auth
        .getConfig()
        .then((config) => {
          if (!active) return
          setRegistrationEnabled(config.registrationEnabled)
          if (!config.registrationEnabled && initialMode === 'register') {
            setMode('login')
          }
        })
        .catch(() => undefined)
    }
    return () => {
      active = false
    }
  }, [initialMode, invitationToken])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await onSignIn(email, password)
      } else if (invitationToken) {
        await onRegister(
          email,
          password,
          name || undefined,
          workspace || undefined,
          invitationToken || undefined,
        )
      } else {
        await onRegisterStart(email, name || undefined, workspace || undefined)
        setConfirmationSent(true)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Unable to ${mode}.`)
    } finally {
      setBusy(false)
    }
  }

  const continueWithGoogle = async () => {
    if (mode === 'register' && (!name.trim() || !workspace.trim())) {
      setError('Enter your name and workspace name before continuing with Google.')
      return
    }
    setError('')
    setBusy(true)
    try {
      window.location.assign(await api.auth.getGoogleAuthUrl({
        mode,
        name: name.trim(),
        workspace: workspace.trim(),
      }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to start Google sign-in.')
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <AuthStory onBack={onBack} />
      <section className="auth-form-panel">
        {confirmationSent ? (
          <div className="auth-form auth-confirmation" role="status">
            <img className="auth-form__wordmark" src="/img/logo_with_name.png" alt="lancee" />
            <span className="auth-form__eyebrow">Check your inbox</span>
            <h2>Confirm your email</h2>
            <p>
              We sent a confirmation link to <strong>{email}</strong>. Follow it to return to
              lancee and choose your password.
            </p>
            <button
              className="button button--primary auth-submit"
              type="button"
              onClick={() => {
                setConfirmationSent(false)
                setEmail('')
                setError('')
              }}
            >
              Use a different email
            </button>
            <p className="auth-signup">
              <button type="button" onClick={() => onNavigate('login')}>
                <Icon name="arrow-right" size={12} /> Back to sign in
              </button>
            </p>
          </div>
        ) : <form className="auth-form" onSubmit={submit}>
          <div>
            <img
              className="auth-form__wordmark"
              src="/img/logo_with_name.png"
              alt="lancee"
            />
            <span className="auth-form__eyebrow">
              {invitationToken ? 'Workspace invitation' : mode === 'login' ? 'Welcome back' : 'Get started'}
            </span>
            <h2>
              {invitationToken
                ? `Join ${workspace || 'the workspace'}`
                : mode === 'login'
                  ? 'Sign in to lancee'
                  : 'Create your workspace'}
            </h2>
            <p>
              {invitationToken
                ? existingInvitedAccount
                  ? 'Enter your current account password to accept this invitation.'
                  : 'Choose a password to accept this invitation.'
                : mode === 'login'
                  ? 'Use the email and password for your business workspace.'
                  : 'Enter your details to start using lancee.'}
            </p>
          </div>
          {!invitationToken && (
            <>
              <button className="button button--secondary auth-google" type="button" onClick={() => void continueWithGoogle()} disabled={busy || invitationLoading}>
                <span className="auth-google__mark" aria-hidden="true">G</span>
                {mode === 'login' ? 'Sign in with Google' : 'Sign up with Google'}
              </button>
              <div className="auth-divider" role="separator" aria-label="Or continue with email">
                <span aria-hidden="true" />
                <span className="auth-divider__label">Or continue with email</span>
                <span aria-hidden="true" />
              </div>
            </>
          )}
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
              {!invitationToken && <label className="form-field">
                <span>Workspace / Studio name</span>
                <input
                  type="text"
                  value={workspace}
                  onChange={(event) => setWorkspace(event.target.value)}
                  placeholder="e.g. Rivera Design Studio"
                />
              </label>}
            </>
          )}
          <label className="form-field">
            <span>Email address</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              readOnly={Boolean(invitationToken)}
              required
            />
          </label>
          {(mode === 'login' || invitationToken) && (
            <label className="form-field">
              <span>
                {invitationToken
                  ? existingInvitedAccount
                    ? 'Current password'
                    : 'Choose password'
                  : 'Password'}
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={
                  mode === 'login' || existingInvitedAccount
                    ? 'current-password'
                    : 'new-password'
                }
                required
                minLength={8}
              />
            </label>
          )}
          {error && <p className="form-error">{error}</p>}
          <button className="button button--primary auth-submit" type="submit" disabled={busy || invitationLoading}>
            {busy || invitationLoading ? <span className="spinner spinner--dark" /> : invitationToken ? 'Accept invitation' : mode === 'login' ? 'Sign in' : 'Send confirmation link'}
            {!busy && !invitationLoading && <Icon name="arrow-right" size={16} />}
          </button>
          {!invitationToken && <p className="auth-signup">
            {mode === 'login' && !registrationEnabled ? (
              <span className="auth-signup__paused">Sign-ups are temporarily paused. Existing members can sign in above.</span>
            ) : mode === 'login' && registrationEnabled ? (
              <button type="button" onClick={() => { setMode('register'); setError(''); onNavigate('register') }}>
                <Icon name="arrow-right" size={12} /> Don&rsquo;t have an account? Create one
              </button>
            ) : mode === 'register' ? (
              <button type="button" onClick={() => { setMode('login'); setError(''); onNavigate('login') }}>
                <Icon name="arrow-right" size={12} /> Already have an account? Sign in
              </button>
            ) : null}
          </p>}
          <small className="auth-terms">
            By continuing, you agree to the Terms of Service and Privacy Policy.
          </small>
        </form>}
      </section>
    </main>
  )
}

function SetPasswordScreen({
  token,
  onConfirm,
  onBack,
}: {
  token: string
  onConfirm: (token: string, password: string) => Promise<void>
  onBack: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(token ? '' : 'This confirmation link is missing.')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token) return
    if (password !== confirmation) {
      setError('Passwords do not match.')
      return
    }
    setError('')
    setBusy(true)
    try {
      await onConfirm(token, password)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to finish account setup.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <AuthStory onBack={onBack} />
      <section className="auth-form-panel">
        <form className="auth-form" onSubmit={submit}>
          <img className="auth-form__wordmark" src="/img/logo_with_name.png" alt="lancee" />
          <span className="auth-form__eyebrow">Email confirmed</span>
          <h2>Set your password</h2>
          <p>Choose a password for your new lancee workspace, then you&rsquo;ll go straight into the app.</p>
          <div className="auth-security-note">
            <Icon name="shield" size={17} />
            Use at least 8 characters. Your password is stored securely.
          </div>
          <label className="form-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
              autoFocus
            />
          </label>
          <label className="form-field">
            <span>Confirm password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              minLength={8}
              required
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button--primary auth-submit" type="submit" disabled={busy || !token}>
            {busy ? <span className="spinner spinner--dark" /> : 'Create workspace'}
            {!busy && <Icon name="arrow-right" size={16} />}
          </button>
          <p className="auth-signup">
            <button type="button" onClick={onBack}>
              <Icon name="arrow-right" size={12} /> Back to sign in
            </button>
          </p>
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
  const dialogRef = useDialogFocus<HTMLElement>(true, onClose)

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={`modal${wide ? ' modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
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
  onSubmit: (input: Pick<Automation, 'name' | 'description' | 'model'> & {
    instructionTemplate?: string
    execution?: Automation['execution']
    tools?: string[]
  }) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [instructionTemplate, setInstructionTemplate] = useState('')
  const [model, setModel] = useState('Rules + connected tools')
  const [execution, setExecution] = useState<Automation['execution']>('core')
  const [tools, setTools] = useState<string[]>(['workspace.summary', 'projects.list'])
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    await onSubmit({ name, description, instructionTemplate, model, execution, tools })
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
      <fieldset className="form-fieldset">
        <legend>Core permissions</legend>
        <small className="form-field__hint">Only selected tools can change workspace data. Read-only tools are safe by default.</small>
        <div className="form-checkbox-grid">
          {[
            ['workspace.summary', 'Read workspace summary'],
            ['projects.list', 'Read projects'],
            ['clients.list', 'Read clients'],
            ['invoices.list', 'Read invoices'],
            ['projects.update_status', 'Update project status'],
            ['projects.create', 'Create projects'],
            ['projects.create_draft_invoice', 'Create draft invoices'],
          ].map(([id, label]) => (
            <label key={id}><input type="checkbox" checked={tools.includes(id)} onChange={() => setTools((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} disabled={execution === 'edge'} /><span>{label}</span></label>
          ))}
        </div>
      </fieldset>
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
      <label className="form-field">
        <span>Reusable prompt or step plan</span>
        <textarea
          value={instructionTemplate}
          onChange={(event) => setInstructionTemplate(event.target.value)}
          placeholder='Optional: describe the default instruction, or provide a JSON plan with a "steps" array for an advanced multi-step workflow.'
          rows={5}
          maxLength={5000}
        />
        <small className="form-field__hint">Runs can override this prompt. JSON plans support up to 12 permission-checked Core steps.</small>
      </label>
      <label className="form-field">
        <span>Where it runs</span>
        <select
          value={execution}
          onChange={(event) => setExecution(event.target.value as Automation['execution'])}
        >
          <option value="core">In lancee (Core) — standard automations</option>
          <option value="edge">Custom n8n workflow (Edge)</option>
        </select>
        <small className="form-field__hint">
          Custom n8n workflows need a connected n8n integration. Everything else runs
          inside lancee.
        </small>
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

function RequestIntegrationForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: Pick<IntegrationRequest, 'name' | 'category' | 'details'>) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<IntegrationRequest['category']>('Automation')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onSubmit({ name, category, details })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the connection request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="modal-form" onSubmit={submit}>
      <label className="form-field">
        <span>Connection name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Xero, Calendly, Slack"
          autoFocus
          required
          minLength={2}
          maxLength={120}
        />
      </label>
      <label className="form-field">
        <span>Category</span>
        <select value={category} onChange={(event) => setCategory(event.target.value as IntegrationRequest['category'])}>
          <option value="Automation">Automation</option>
          <option value="Communication">Communication</option>
          <option value="Design">Design</option>
          <option value="Payments">Payments</option>
          <option value="Storage">Storage</option>
          <option value="Other">Other</option>
        </select>
      </label>
      <label className="form-field">
        <span>What should it support? <small>Optional</small></span>
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          placeholder="Describe the workflow, data, or action that should be handled through the app."
          rows={4}
          maxLength={500}
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-form__footer">
        <button className="button button--secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="button button--primary" type="submit" disabled={busy}>
          {busy ? <span className="spinner spinner--dark" /> : <Icon name="plus" size={15} />}
          Save request
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
  isAdmin,
  onClose,
  onNavigate,
  onCreateAutomation,
}: {
  open: boolean
  isAdmin: boolean
  onClose: () => void
  onNavigate: (page: Page) => void
  onCreateAutomation: () => void
}) {
  const [query, setQuery] = useState('')
  const paletteRef = useDialogFocus<HTMLElement>(open, onClose)
  const filtered = navItems
    .filter((item) => !item.adminOnly || isAdmin)
    .filter((item) =>
      `${item.label} ${item.section}`.toLowerCase().includes(query.toLowerCase()),
    )
  if (!open) return null

  return (
    <div className="command-palette-backdrop" onMouseDown={onClose}>
      <section
        ref={paletteRef}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search pages and actions"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
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
  collapsed,
  onNavigate,
  onClose,
  onSignOut,
  onWorkspaceChanged,
  onToast,
  pendingInvoiceCount,
  enabledModules,
}: {
  activePage: Page
  user: User
  mobileOpen: boolean
  collapsed: boolean
  onNavigate: (page: Page) => void
  onClose: () => void
  onSignOut: () => void
  onWorkspaceChanged: (user: User) => void
  onToast: (message: string) => void
  pendingInvoiceCount: number
  enabledModules: string[] | null
}) {
  const workspaceMenuRef = useRef<HTMLDivElement>(null)
  const workspaceButtonRef = useRef<HTMLButtonElement>(null)
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
  const [workspaces, setWorkspaces] = useState<WorkspaceMembership[]>([])
  const [workspaceMenuLoading, setWorkspaceMenuLoading] = useState(false)
  const [workspaceMenuError, setWorkspaceMenuError] = useState('')
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState('')
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const workspaceInitials = user.workspace
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const openWorkspaceMenu = () => {
    if (workspaceMenuOpen) {
      setWorkspaceMenuOpen(false)
      return
    }
    setWorkspaceMenuOpen(true)
    setWorkspaceMenuError('')
    setWorkspaceMenuLoading(true)
    void api.auth
      .listWorkspaces()
      .then(setWorkspaces)
      .catch((error) => {
        setWorkspaceMenuError(
          error instanceof Error ? error.message : 'Unable to load your workspaces.',
        )
      })
      .finally(() => setWorkspaceMenuLoading(false))
  }

  useEffect(() => {
    if (!workspaceMenuOpen) return
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!workspaceMenuRef.current?.contains(event.target as Node)) {
        setWorkspaceMenuOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setWorkspaceMenuOpen(false)
        workspaceButtonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [workspaceMenuOpen])

  const switchWorkspace = async (workspace: WorkspaceMembership) => {
    if (workspace.id === user.workspaceId) {
      setWorkspaceMenuOpen(false)
      return
    }
    setSwitchingWorkspaceId(workspace.id)
    setWorkspaceMenuError('')
    try {
      const nextUser = await api.auth.switchWorkspace(workspace.id)
      onWorkspaceChanged(nextUser)
      onToast(`Switched to ${nextUser.workspace}.`)
      setWorkspaceMenuOpen(false)
      onClose()
    } catch (error) {
      setWorkspaceMenuError(
        error instanceof Error ? error.message : 'Unable to switch workspaces.',
      )
    } finally {
      setSwitchingWorkspaceId('')
    }
  }

  const createWorkspace = async (event: FormEvent) => {
    event.preventDefault()
    const name = newWorkspaceName.trim()
    if (!name) return
    setSwitchingWorkspaceId('new')
    setWorkspaceMenuError('')
    try {
      const nextUser = await api.auth.createWorkspace(name)
      onWorkspaceChanged(nextUser)
      onToast(`${nextUser.workspace} created.`)
      setNewWorkspaceName('')
      setCreatingWorkspace(false)
      setWorkspaceMenuOpen(false)
      onClose()
    } catch (error) {
      setWorkspaceMenuError(
        error instanceof Error ? error.message : 'Unable to create the workspace.',
      )
    } finally {
      setSwitchingWorkspaceId('')
    }
  }

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="sidebar-scrim"
          onClick={onClose}
          aria-label="Close navigation"
        />
      )}
      <aside id="workspace-navigation" className={`sidebar${mobileOpen ? ' is-open' : ''}${collapsed ? ' is-collapsed' : ''}`}>
        <div className="sidebar__logo">
          <BrandMark />
          <span>lancee</span>
          <button className="sidebar-close" onClick={onClose} aria-label="Close navigation">
            <Icon name="close" />
          </button>
        </div>

        <div className="workspace-switcher-shell" ref={workspaceMenuRef}>
          <button
            ref={workspaceButtonRef}
            type="button"
            className="workspace-switcher"
            onClick={openWorkspaceMenu}
            aria-haspopup="dialog"
            aria-expanded={workspaceMenuOpen}
          >
            <span className="workspace-avatar">{workspaceInitials}</span>
            <span>
              <strong>{user.workspace}</strong>
              <small>{user.role === 'owner' ? 'Workspace owner' : 'Collaborator'}</small>
            </span>
            <Icon
              name="chevron-down"
              size={15}
              className={workspaceMenuOpen ? 'workspace-switcher__chevron is-open' : 'workspace-switcher__chevron'}
            />
          </button>

          {workspaceMenuOpen && (
            <section className="workspace-menu" role="dialog" aria-label="Switch workspace">
              <span className="workspace-menu__label">Workspaces</span>
              <div className="workspace-menu__list">
                {workspaceMenuLoading ? (
                  <span className="workspace-menu__status"><span className="spinner" /> Loading workspaces…</span>
                ) : (
                  workspaces.map((workspace) => (
                    <button
                      key={workspace.id}
                      type="button"
                      className="workspace-menu__workspace"
                      onClick={() => void switchWorkspace(workspace)}
                      disabled={Boolean(switchingWorkspaceId)}
                      aria-current={workspace.id === user.workspaceId ? 'true' : undefined}
                    >
                      <span className="workspace-menu__check">
                        {workspace.id === user.workspaceId && <Icon name="check" size={14} />}
                      </span>
                      <span>
                        <strong>{workspace.name}</strong>
                        <small>{workspace.role.charAt(0).toUpperCase() + workspace.role.slice(1)}</small>
                      </span>
                    </button>
                  ))
                )}
              </div>
              {workspaceMenuError && (
                <p className="workspace-menu__error" role="alert">{workspaceMenuError}</p>
              )}
              <div className="workspace-menu__divider" />
              {creatingWorkspace ? (
                <form className="workspace-menu__create-form" onSubmit={(event) => void createWorkspace(event)}>
                  <label htmlFor="new-workspace-name">Workspace name</label>
                  <input
                    id="new-workspace-name"
                    value={newWorkspaceName}
                    onChange={(event) => setNewWorkspaceName(event.target.value)}
                    maxLength={160}
                    autoFocus
                  />
                  <div>
                    <button type="button" onClick={() => setCreatingWorkspace(false)}>Cancel</button>
                    <button type="submit" disabled={!newWorkspaceName.trim() || switchingWorkspaceId === 'new'}>
                      {switchingWorkspaceId === 'new' ? 'Creating…' : 'Create'}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  className="workspace-menu__create"
                  onClick={() => setCreatingWorkspace(true)}
                >
                  <Icon name="plus" size={15} />
                  Create workspace
                </button>
              )}
            </section>
          )}
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {['Your work', 'Business', 'Platform'].map((section) => (
            <div className="nav-group" key={section}>
              <span className="nav-label">{section}</span>
              {navItems
                .filter((item) => item.section === section)
                .filter((item) => !item.adminOnly || user.isAdmin)
                .filter((item) => !enabledModules || !item.modules || item.modules.some((moduleId) => enabledModules.includes(moduleId)))
                .map((item) => (
                  <button
                    key={item.id}
                    className={activePage === item.id ? 'is-active' : ''}
                    aria-current={activePage === item.id ? 'page' : undefined}
                    onClick={() => {
                      onNavigate(item.id)
                      onClose()
                    }}
                  >
                    <Icon name={item.icon} size={17} />
                    {item.label}
                    {item.id === 'money' && pendingInvoiceCount > 0 && (
                      <span className="nav-count">{pendingInvoiceCount}</span>
                    )}
                  </button>
                ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__bottom">
          <a className="sidebar-help" href="/lancee.html" target="_blank" rel="noopener">
            <Icon name="help" size={17} />
            Help & documentation
            <Icon name="arrow-up-right" size={14} />
          </a>
          <button className="sidebar-profile" onClick={onSignOut}>
            <UserAvatar user={user} className="user-avatar--sidebar" />
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

function CodexAiConnectionPanel({
  connection,
  onConnectionChange,
  onClose,
}: {
  connection: CodexConnection
  onConnectionChange: (connection: CodexConnection) => void
  onClose: () => void
}) {
  const [userCode, setUserCode] = useState('')
  const [authorization, setAuthorization] =
    useState<CodexDeviceAuthorization | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const checkCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setAuthorization(null)
    try {
      setAuthorization(await api.codexDevice.getAuthorization(userCode))
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to check this code.',
      )
    } finally {
      setBusy(false)
    }
  }

  const decide = async (decision: 'approve' | 'deny') => {
    if (!authorization) return
    setBusy(true)
    setError('')
    try {
      const result = await api.codexDevice.decide(
        authorization.userCode,
        decision,
      )
      setAuthorization((current) =>
        current ? { ...current, status: result.status } : current,
      )
      onConnectionChange(await api.codexDevice.getConnection())
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to update this request.',
      )
    } finally {
      setBusy(false)
    }
  }

  const refresh = async () => {
    setBusy(true)
    setError('')
    try {
      onConnectionChange(await api.codexDevice.getConnection())
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to refresh the connection.',
      )
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    setBusy(true)
    setError('')
    try {
      onConnectionChange(await api.codexDevice.revoke())
      setAuthorization(null)
      setUserCode('')
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to disconnect Codex.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="codex-connection-panel">
      <section className={`codex-connection-state${connection.connected ? ' is-connected' : ''}`}>
        <span className="codex-connection-state__mark">
          <Icon name={connection.connected ? 'check' : 'command'} size={22} />
        </span>
        <div>
          <span className="micro-label">
            {connection.connected ? 'Connected' : 'Ready to connect'}
          </span>
          <h3>
            {connection.connected
              ? `${connection.activeConnections} active Codex ${
                  connection.activeConnections === 1 ? 'device' : 'devices'
                }`
              : 'No authorized Codex devices'}
          </h3>
          <p>
            {connection.connected && connection.expiresAt
              ? `Latest access expires ${new Date(connection.expiresAt).toLocaleString()}.`
              : 'Provider credentials remain in lancee. Codex receives only AI completion access.'}
          </p>
        </div>
        <button
          className="button button--secondary"
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <Icon name="activity" size={14} /> Refresh
        </button>
      </section>

      <section className="codex-connect-steps">
        <span className="micro-label">Connect a device</span>
        <ol>
          <li>Install or enable the bundled <b>lancee AI</b> Codex plugin.</li>
          <li>Ask Codex to call <b>connect</b> and note the eight-character code.</li>
          <li>Enter that code below, review the scope, and approve it.</li>
          <li>Return to Codex and call <b>connect</b> again.</li>
        </ol>
      </section>

      <form className="codex-code-form" onSubmit={checkCode}>
        <label className="form-field">
          <span>Device code from Codex</span>
          <input
            value={userCode}
            onChange={(event) =>
              setUserCode(event.target.value.toUpperCase().slice(0, 9))
            }
            placeholder="ABCD-EFGH"
            autoComplete="one-time-code"
            required
          />
        </label>
        <button
          className="button button--dark"
          type="submit"
          disabled={busy || userCode.replace(/[^A-Z0-9]/g, '').length !== 8}
        >
          {busy ? <span className="spinner" /> : <Icon name="search" size={14} />}
          Check code
        </button>
      </form>

      {authorization && (
        <section className={`codex-approval codex-approval--${authorization.status}`}>
          <div>
            <span className="micro-label">Authorization request</span>
            <strong>{authorization.userCode}</strong>
            <p>
              Scope: <b>{authorization.scope}</b> · Workspace:{' '}
              <b>{authorization.workspace}</b>
            </p>
          </div>
          {authorization.status === 'pending' ? (
            <div className="codex-approval__actions">
              <button
                className="button button--secondary"
                type="button"
                disabled={busy}
                onClick={() => void decide('deny')}
              >
                Deny
              </button>
              <button
                className="button button--primary"
                type="button"
                disabled={busy}
                onClick={() => void decide('approve')}
              >
                <Icon name="check" size={14} /> Approve
              </button>
            </div>
          ) : (
            <span className="connected-label">
              <Icon name="check" size={12} /> {authorization.status}
            </span>
          )}
        </section>
      )}

      {connection.pendingRequests > 0 && (
        <p className="codex-pending-note">
          <Icon name="activity" size={14} />
          Approval complete. Return to Codex and call <b>connect</b> again to
          finish the token exchange.
        </p>
      )}
      {error && <p className="form-error">{error}</p>}

      <div className="modal-form__footer">
        {connection.connected ? (
          <button
            className="button button--danger"
            type="button"
            disabled={busy}
            onClick={() => void revoke()}
          >
            Disconnect all devices
          </button>
        ) : <span />}
        <button className="button button--secondary" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

function CodexDeviceAuthorizationPage({
  user,
  userCode,
}: {
  user: User
  userCode: string
}) {
  const [authorization, setAuthorization] =
    useState<CodexDeviceAuthorization | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void api.codexDevice
      .getAuthorization(userCode)
      .then((result) => {
        if (active) setAuthorization(result)
      })
      .catch((caught) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Unable to load this device request.',
          )
        }
      })
    return () => {
      active = false
    }
  }, [userCode])

  const decide = async (decision: 'approve' | 'deny') => {
    setBusy(true)
    setError('')
    try {
      const result = await api.codexDevice.decide(userCode, decision)
      setAuthorization((current) =>
        current
          ? { ...current, status: result.status, workspace: result.workspace }
          : current,
      )
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to update this device request.',
      )
    } finally {
      setBusy(false)
    }
  }

  const decided =
    authorization?.status === 'approved' ||
    authorization?.status === 'denied' ||
    authorization?.status === 'consumed'

  return (
    <main className="device-auth">
      <div className="device-auth__glow" aria-hidden="true" />
      <section className="device-auth__card">
        <header className="device-auth__brand">
          <BrandMark />
          <span>Codex connector</span>
        </header>
        <div className="device-auth__icon">
          <Icon
            name={
              authorization?.status === 'approved' ||
              authorization?.status === 'consumed'
                ? 'check'
                : 'command'
            }
            size={28}
          />
        </div>
        <span className="device-auth__eyebrow">
          {decided ? 'Device request updated' : 'Authorize this device'}
        </span>
        <h1>
          {authorization?.status === 'approved' ||
          authorization?.status === 'consumed'
            ? 'Codex is connected'
            : authorization?.status === 'denied'
              ? 'Connection declined'
              : 'Let Codex use lancee AI?'}
        </h1>
        <p className="device-auth__intro">
          {decided
            ? 'Return to Codex to finish the connection.'
            : `Signed in as ${user.email}. Confirm that the code shown in Codex matches this request.`}
        </p>

        <div className="device-auth__code" aria-label={`Device code ${userCode}`}>
          {userCode}
        </div>

        {authorization && !decided && (
          <div className="device-auth__grant">
            <span>
              <Icon name="sparkles" size={16} />
            </span>
            <div>
              <strong>AI completion access</strong>
              <p>
                Codex can send prompts to the AI provider configured for{' '}
                <b>{authorization.workspace}</b>. It cannot access your provider key.
              </p>
            </div>
          </div>
        )}

        {!authorization && !error && (
          <div className="device-auth__loading">
            <span className="spinner spinner--dark" />
            Checking the device request…
          </div>
        )}
        {authorization?.status === 'expired' && (
          <p className="form-error">
            This code has expired. Start a new connection from Codex.
          </p>
        )}
        {error && <p className="form-error">{error}</p>}

        {authorization?.status === 'pending' && (
          <div className="device-auth__actions">
            <button
              className="button button--secondary"
              type="button"
              disabled={busy}
              onClick={() => void decide('deny')}
            >
              Deny
            </button>
            <button
              className="button button--primary"
              type="button"
              disabled={busy}
              onClick={() => void decide('approve')}
            >
              {busy ? <span className="spinner" /> : <Icon name="check" size={15} />}
              Approve connection
            </button>
          </div>
        )}

        <footer>
          <Icon name="shield" size={14} />
          One-time code · 10-minute approval window · 30-day scoped token
        </footer>
      </section>
    </main>
  )
}

type CodexTranscriptEntry = {
  id: string
  role: 'user' | 'assistant' | 'activity'
  text: string
}

function CodexRuntimePanel({
  status,
  onStatusChange,
  onClose,
}: {
  status: CodexRuntimeStatus
  onStatusChange: (status: CodexRuntimeStatus) => void
  onClose: () => void
}) {
  const [deviceLogin, setDeviceLogin] = useState<CodexDeviceLogin | null>(null)
  const [threadId, setThreadId] = useState('')
  const [turnId, setTurnId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [transcript, setTranscript] = useState<CodexTranscriptEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(status.error || '')

  const refreshStatus = async () => {
    const nextStatus = await api.codexRuntime.getStatus()
    onStatusChange(nextStatus)
    if (nextStatus.authenticated) setDeviceLogin(null)
    return nextStatus
  }

  const pollLoginStatus = useEffectEvent(() => {
    void refreshStatus().catch(() => undefined)
  })

  useEffect(() => {
    if (!deviceLogin || status.authenticated) return
    const timer = window.setInterval(pollLoginStatus, 2_000)
    return () => window.clearInterval(timer)
  }, [deviceLogin, status.authenticated])

  useEffect(() => {
    if (!threadId) return
    const source = api.codexRuntime.streamEvents(
      threadId,
      (event: CodexRuntimeEvent) => {
        if (event.method === 'item/agentMessage/delta') {
          const delta =
            typeof event.params.delta === 'string' ? event.params.delta : ''
          if (!delta) return
          setTranscript((current) => {
            const last = current.at(-1)
            if (last?.role === 'assistant') {
              return [
                ...current.slice(0, -1),
                { ...last, text: `${last.text}${delta}` },
              ]
            }
            return [
              ...current,
              {
                id: `assistant-${event.sequence}`,
                role: 'assistant',
                text: delta,
              },
            ]
          })
          return
        }

        if (event.method === 'item/started') {
          const item = event.params.item as
            | { type?: string; command?: string }
            | undefined
          if (item?.type === 'commandExecution' && item.command) {
            setTranscript((current) => [
              ...current,
              {
                id: `activity-${event.sequence}`,
                role: 'activity',
                text: `Running: ${item.command}`,
              },
            ])
          }
          return
        }

        if (event.method === 'turn/completed') {
          const turn = event.params.turn as
            | { status?: string; error?: { message?: string } | null }
            | undefined
          setRunning(false)
          setTurnId('')
          if (turn?.error?.message) setError(turn.error.message)
        }
      },
    )
    return () => source.close()
  }, [threadId])

  const startLogin = async () => {
    setBusy(true)
    setError('')
    try {
      const login = await api.codexRuntime.startDeviceLogin()
      setDeviceLogin(login)
      window.open(login.verificationUrl, '_blank', 'noopener,noreferrer')
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to start Codex login.',
      )
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    setBusy(true)
    setError('')
    try {
      await api.codexRuntime.logout()
      setThreadId('')
      setTranscript([])
      onStatusChange(await api.codexRuntime.getStatus())
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to sign out of Codex.',
      )
    } finally {
      setBusy(false)
    }
  }

  const startSession = async () => {
    setBusy(true)
    setError('')
    try {
      setThreadId(await api.codexRuntime.startThread())
      setTranscript([])
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to start a Codex session.',
      )
    } finally {
      setBusy(false)
    }
  }

  const runTurn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = prompt.trim()
    if (!text || !threadId || running) return
    setPrompt('')
    setError('')
    setRunning(true)
    setTranscript((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', text },
    ])
    try {
      const turn = await api.codexRuntime.startTurn(threadId, text)
      setTurnId(turn.id || '')
    } catch (caught) {
      setRunning(false)
      setError(
        caught instanceof Error ? caught.message : 'Unable to start the Codex task.',
      )
    }
  }

  const interrupt = async () => {
    if (!threadId || !turnId) return
    setBusy(true)
    try {
      await api.codexRuntime.interrupt(threadId, turnId)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to stop this task.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (!status.available) {
    return (
      <div className="codex-runtime-panel">
        <section className="codex-runtime-unavailable">
          <Icon name="alert" size={24} />
          <div>
            <span className="micro-label">Server setup required</span>
            <h3>Codex CLI is not available to lancee</h3>
            <p>{status.error || 'Install the Codex CLI on the application server.'}</p>
            <code>CODEX_BINARY=codex</code>
          </div>
        </section>
        <div className="modal-actions">
          <button className="button button--secondary" onClick={onClose}>
            Close
          </button>
          <button
            className="button button--dark"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void refreshStatus()
                .catch((caught) =>
                  setError(caught instanceof Error ? caught.message : 'Refresh failed.'),
                )
                .finally(() => setBusy(false))
            }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="codex-runtime-panel">
      <section className={`codex-runtime-account${status.authenticated ? ' is-connected' : ''}`}>
        <span className="codex-connection-state__mark">
          <Icon name={status.authenticated ? 'check' : 'command'} size={22} />
        </span>
        <div>
          <span className="micro-label">
            {status.authenticated ? 'OpenAI account connected' : 'OpenAI sign-in'}
          </span>
          <h3>
            {status.account?.email ||
              (status.authenticated ? 'Codex is ready' : 'Connect with device code')}
          </h3>
          <p>
            {status.authenticated
              ? `${status.account?.planType || 'OpenAI'} account · ${status.workspaceRoot}`
              : 'Authentication is handled by OpenAI. lancee never receives your password.'}
          </p>
        </div>
        {status.authenticated ? (
          <button
            className="button button--secondary"
            disabled={busy || running}
            onClick={() => void logout()}
          >
            Sign out
          </button>
        ) : (
          <button
            className="button button--dark"
            disabled={busy}
            onClick={() => void startLogin()}
          >
            {busy ? <span className="spinner" /> : <Icon name="arrow-up-right" size={14} />}
            Sign in
          </button>
        )}
      </section>

      {deviceLogin && !status.authenticated && (
        <section className="codex-runtime-device">
          <div>
            <span className="micro-label">OpenAI device code</span>
            <strong>{deviceLogin.userCode}</strong>
            <p>Enter this code on the OpenAI page, then return here.</p>
          </div>
          <a
            className="button button--dark"
            href={deviceLogin.verificationUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open OpenAI <Icon name="arrow-up-right" size={14} />
          </a>
        </section>
      )}

      {status.authenticated && !threadId && (
        <section className="codex-runtime-start">
          <div>
            <span className="micro-label">Safe workspace session</span>
            <h3>Work inside the configured project root</h3>
            <p>
              Commands and edits are restricted to the workspace. Network access and
              privilege escalation are disabled.
            </p>
          </div>
          <button
            className="button button--dark"
            disabled={busy}
            onClick={() => void startSession()}
          >
            {busy ? <span className="spinner" /> : <Icon name="plus" size={14} />}
            Start session
          </button>
        </section>
      )}

      {threadId && (
        <section className="codex-runtime-session">
          <header>
            <div>
              <span className="online-dot" />
              <strong>Codex session</strong>
              <small>{threadId}</small>
            </div>
            <button
              className="button button--secondary"
              disabled={running}
              onClick={() => void startSession()}
            >
              New session
            </button>
          </header>
          <div className="codex-runtime-transcript" aria-live="polite">
            {transcript.length === 0 ? (
              <div className="codex-runtime-empty">
                <Icon name="sparkles" size={20} />
                <strong>Ask Codex to inspect, explain, or change this workspace.</strong>
                <span>Its progress and answer will stream here.</span>
              </div>
            ) : (
              transcript.map((entry) => (
                <article
                  key={entry.id}
                  className={`codex-runtime-message is-${entry.role}`}
                >
                  <span>{entry.role === 'user' ? 'You' : entry.role === 'assistant' ? 'Codex' : 'Activity'}</span>
                  <p>{entry.text}</p>
                </article>
              ))
            )}
            {running && (
              <div className="codex-runtime-working">
                <span className="spinner spinner--dark" /> Codex is working
              </div>
            )}
          </div>
          <form className="codex-runtime-composer" onSubmit={runTurn}>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the code task..."
              maxLength={20_000}
              rows={3}
              disabled={running}
            />
            {running ? (
              <button
                className="button button--secondary"
                type="button"
                disabled={busy || !turnId}
                onClick={() => void interrupt()}
              >
                Stop
              </button>
            ) : (
              <button
                className="button button--dark"
                type="submit"
                disabled={!prompt.trim()}
              >
                Run task <Icon name="arrow-right" size={14} />
              </button>
            )}
          </form>
        </section>
      )}

      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

type AuthView = 'landing' | 'login' | 'register' | 'confirm'

function authViewFromLocation(): AuthView {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
  if (pathname === '/signup/confirm') return 'confirm'
  if (pathname === '/signup') return 'register'
  if (pathname === '/signin') return 'login'
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return 'login'
  const params = new URLSearchParams(window.location.search)
  return params.has('invite') || params.has('device') || params.has('page')
    ? 'login'
    : 'landing'
}

function authPath(view: AuthView) {
  if (view === 'login') return '/signin'
  if (view === 'register') return '/signup'
  if (view === 'confirm') return '/signup/confirm'
  return '/'
}

function dashboardPageFromLocation(): Page | null {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
  if (pathname === '/dashboard') return 'overview'

  const match = pathname.match(/^\/dashboard\/([^/]+)$/)
  if (match) {
    try {
      const page = decodeURIComponent(match[1])
      return pageIds.has(page as Page) ? canonicalDashboardPage(page as Page) : null
    } catch {
      return null
    }
  }

  const legacyPage = new URLSearchParams(window.location.search).get('page')
  return legacyPage && pageIds.has(legacyPage as Page) ? canonicalDashboardPage(legacyPage as Page) : null
}

function dashboardPath(page: Page) {
  return page === 'overview' ? '/dashboard' : `/dashboard/${page}`
}

function publicReviewRequest() {
  const match = window.location.pathname.match(/^\/review\/([^/]+)\/?$/)
  if (!match) return null
  const token = new URLSearchParams(window.location.search).get('token') || ''
  return token ? { reviewId: decodeURIComponent(match[1]), token } : null
}

function guestMeetingToken() {
  const match = window.location.pathname.match(/^\/meetings\/guest\/([^/]+)\/?$/)
  if (!match) return ''
  try { return decodeURIComponent(match[1]) } catch { return '' }
}

function App() {
  const meetingToken = guestMeetingToken()
  if (meetingToken) {
    return (
      <Suspense fallback={<main className="auth-boot"><span className="spinner spinner--dark" /></main>}>
        <GuestMeetingPage token={meetingToken} />
      </Suspense>
    )
  }
  const review = publicReviewRequest()
  if (review) {
    return (
      <Suspense fallback={<main className="review-page review-page--state"><p>Loading review…</p></main>}>
        <ReviewPage reviewId={review.reviewId} token={review.token} />
      </Suspense>
    )
  }
  return <WorkspaceApp />
}

function WorkspaceApp() {
  const deviceUserCode =
    new URLSearchParams(window.location.search).get('device') || ''
  const [theme, setTheme] = useState<Theme>(getStoredTheme)
  const [user, setUser] = useState<User | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [authView, setAuthView] = useState<AuthView>(authViewFromLocation)
  const [locationPath, setLocationPath] = useState(() => window.location.pathname)
  const [activePage, setActivePage] = useState<Page>(
    () => dashboardPageFromLocation() ?? 'overview',
  )
  const [automations, setAutomations] = useState<Automation[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [workspaceNotifications, setWorkspaceNotifications] = useState<WorkspaceNotification[]>([])
  const [workProjectId, setWorkProjectId] = useState('')
  const [messageFocus, setMessageFocus] = useState<{ folder: string; uid: number } | null>(null)
  const [mailSettingsRequested, setMailSettingsRequested] = useState(false)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [externalProviders, setExternalProviders] = useState<OpenConnectorProvider[]>([])
  const [gatewayStatus, setGatewayStatus] = useState<OpenConnectorStatus | null>(null)
  const [connectionRequests, setConnectionRequests] = useState<IntegrationRequest[]>([])
  const [n8nConfig, setN8nConfig] = useState<N8nConfig | null>(null)
  const [paystackConnection, setPaystackConnection] =
    useState<PaystackConnection | null>(null)
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus | null>(null)
  const [mcpConnection, setMcpConnection] = useState<McpConnection | null>(null)
  const [mcpServices, setMcpServices] = useState<McpService[]>([])
  const [codexConnection, setCodexConnection] =
    useState<CodexConnection | null>(null)
  const [codexRuntimeStatus, setCodexRuntimeStatus] =
    useState<CodexRuntimeStatus | null>(null)
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [analytics, setAnalytics] = useState<{
    openProjects: number; dueSoonProjects: number; totalClients: number
    outstandingAmount: number; pendingInvoices: number; dueThisWeek: number
  } | null>(null)
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContext | null>(null)
  const [builderPayload, setBuilderPayload] = useState<WorkspaceBuilderPayload | null>(null)
  const [builderLoading, setBuilderLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalName>(null)
  const [createdSecret, setCreatedSecret] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [commandOpen, setCommandOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getStoredSidebarState)
  const [storageSetupProvider, setStorageSetupProvider] = useState<'dropbox' | 'onedrive' | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<'general' | 'dev'>('general')
  const [clearingNotifications, setClearingNotifications] = useState(false)

  const navigatePage = (requestedPage: Page, replace = false) => {
    const canonicalPage = canonicalDashboardPage(requestedPage)
    const nextPage = canonicalPage === 'admin' && !user?.isAdmin
      ? 'overview'
      : canonicalPage
    setActivePage(nextPage)
    setMobileOpen(false)
    setNotificationsOpen(false)
    setProfileOpen(false)

    const nextPath = dashboardPath(nextPage)
    const currentPath = `${window.location.pathname}${window.location.search}`
    if (currentPath !== nextPath) {
      const method = replace ? 'replaceState' : 'pushState'
      window.history[method]({ page: nextPage }, '', nextPath)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleWorkspaceChanged = (nextUser: User) => {
    setUser(nextUser)
    setWorkProjectId('')
    setMessageFocus(null)
    setModal(null)
    navigatePage('overview', true)
  }

  const visibleNotifications = workspaceNotifications
  const unreadNotifications = visibleNotifications.filter((notification) => !notification.readAt)

  const clearNotifications = async () => {
    if (workspaceNotifications.length === 0 || clearingNotifications) return
    if (!window.confirm('Clear all notifications for this workspace? This cannot be undone.')) return
    setClearingNotifications(true)
    try {
      const cleared = await api.notifications.clear()
      setWorkspaceNotifications([])
      setToast(cleared === 1 ? '1 notification cleared.' : `${cleared} notifications cleared.`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to clear notifications.')
    } finally {
      setClearingNotifications(false)
    }
  }

  const openClientProject = (projectId: string) => {
    setWorkProjectId(projectId)
    navigatePage('work')
  }

  const openClientMessage = (target: { folder: string; uid: number }) => {
    setMessageFocus(target)
    navigatePage('messages')
  }

  const isPricingPath = (path: string) => path.replace(/\/+$/, '') === '/pricing'

  useEffect(() => {
    if (sessionLoading) return
    if (!user && (authView === 'landing' || isPricingPath(locationPath))) {
      document.documentElement.setAttribute('data-theme', 'dark')
      document.documentElement.removeAttribute('data-theme-variant')
      return
    }
    applyTheme(theme)
  }, [authView, sessionLoading, theme, user, locationPath])

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed))
    } catch {
      // Storage can be unavailable in hardened or private browser contexts.
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    const requestedPage = dashboardPageFromLocation()
    if (requestedPage && window.location.pathname !== dashboardPath(requestedPage)) {
      window.history.replaceState({ page: requestedPage }, '', dashboardPath(requestedPage))
    }
  }, [])

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
    const handlePopState = () => {
      setAuthView(authViewFromLocation())
      setLocationPath(window.location.pathname)
      const requestedPage = dashboardPageFromLocation()
      if (requestedPage) {
        setActivePage(requestedPage)
        if (window.location.pathname !== dashboardPath(requestedPage)) {
          window.history.replaceState({ page: requestedPage }, '', dashboardPath(requestedPage))
          setLocationPath(dashboardPath(requestedPage))
        }
      }
      setMobileOpen(false)
      setNotificationsOpen(false)
      setProfileOpen(false)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!user || deviceUserCode) return

    const locationPage = dashboardPageFromLocation() ?? activePage
    const requestedPage = locationPage === 'admin' && !user.isAdmin
      ? 'overview'
      : locationPage
    setActivePage(requestedPage)

    const params = new URLSearchParams(window.location.search)
    params.delete('page')
    const query = params.toString()
    const canonicalPath = `${dashboardPath(requestedPage)}${query ? `?${query}` : ''}`
    const currentPath = `${window.location.pathname}${window.location.search}`
    if (currentPath !== canonicalPath) {
      window.history.replaceState({ page: requestedPage }, '', canonicalPath)
    }
  }, [user, deviceUserCode, activePage])

  useEffect(() => {
    if (!user) return
    let active = true
    setLoading(true)
    setAutomations([])
    setRuns([])
    setIntegrations([])
    setExternalProviders([])
    setGatewayStatus(null)
    setConnectionRequests([])
    setN8nConfig(null)
    setPaystackConnection(null)
    setWhatsappStatus(null)
    setMcpConnection(null)
    setMcpServices([])
    setCodexConnection(null)
    setCodexRuntimeStatus(null)
    setKeys([])
    setAnalytics(null)
    setWorkspaceNotifications([])
    void Promise.allSettled([
      api.automations.list(),
      api.runs.list(),
      api.integrations.list(),
      api.integrationRequests.list(),
      api.n8n.getConfig(),
      api.money.getPaystackStatus(),
      user.role === 'owner' ? api.whatsapp.status() : Promise.resolve(null),
      api.mcp.getConnection(),
      api.mcp.listServices(),
      api.codexDevice.getConnection(),
      api.codexRuntime.getStatus(),
      user.role === 'owner' ? api.apiKeys.list() : Promise.resolve([]),
      api.analytics.get(),
      api.notifications.list(),
    ])
      .then(([
          automationData,
          runData,
          integrationData,
          integrationRequestData,
          n8nData,
          paystackData,
          whatsappData,
          mcpConnectionData,
          mcpServiceData,
          codexConnectionData,
          codexRuntimeData,
          keyData,
          analyticsData,
          notificationData,
        ]) => {
          if (!active) return

          const loadedAutomations = automationData.status === 'fulfilled'
            ? automationData.value
            : []
          const loadedRuns = runData.status === 'fulfilled' ? runData.value : []
          const loadedN8n = n8nData.status === 'fulfilled' ? n8nData.value : null

          setAutomations(loadedAutomations)
          setRuns(loadedRuns)
          setIntegrations(
            (integrationData.status === 'fulfilled' ? integrationData.value : []).map((integration) =>
              integration.id === 'n8n'
                ? { ...integration, connected: loadedN8n?.connected ?? integration.connected }
                : integration,
            ),
          )
          if (integrationRequestData.status === 'fulfilled') {
            setConnectionRequests(integrationRequestData.value)
          }
          if (loadedN8n) setN8nConfig(loadedN8n)
          if (paystackData.status === 'fulfilled') setPaystackConnection(paystackData.value)
          if (whatsappData.status === 'fulfilled' && whatsappData.value) setWhatsappStatus(whatsappData.value)
          if (mcpConnectionData.status === 'fulfilled') setMcpConnection(mcpConnectionData.value)
          if (mcpServiceData.status === 'fulfilled') setMcpServices(mcpServiceData.value)
          if (codexConnectionData.status === 'fulfilled') setCodexConnection(codexConnectionData.value)
          if (codexRuntimeData.status === 'fulfilled') {
            setCodexRuntimeStatus(codexRuntimeData.value)
            setIntegrations((current) =>
              current.map((integration) =>
                integration.id === 'codex-runtime'
                  ? { ...integration, connected: codexRuntimeData.value.authenticated }
                  : integration,
              ),
            )
          }
          if (keyData.status === 'fulfilled') setKeys(keyData.value)
          if (notificationData.status === 'fulfilled') {
            setWorkspaceNotifications(notificationData.value)
          }
          if (analyticsData.status === 'fulfilled') {
            setAnalytics({
              openProjects: analyticsData.value.metrics.openProjects,
              dueSoonProjects: analyticsData.value.metrics.dueSoonProjects,
              totalClients: analyticsData.value.metrics.totalClients,
              outstandingAmount: analyticsData.value.metrics.outstandingAmount,
              pendingInvoices: analyticsData.value.metrics.pendingInvoices,
              dueThisWeek: analyticsData.value.metrics.dueThisWeek,
            })
          }
          const failures = [
            automationData,
            runData,
            integrationData,
            integrationRequestData,
            n8nData,
            paystackData,
            whatsappData,
            mcpConnectionData,
            mcpServiceData,
            codexConnectionData,
            codexRuntimeData,
            keyData,
            analyticsData,
            notificationData,
          ].filter((result) => result.status === 'rejected').length
          if (failures > 0) {
            setToast(`${failures} workspace ${failures === 1 ? 'service is' : 'services are'} temporarily unavailable.`)
          }
        })
      .catch(() => {
        if (active) setToast('Workspace data could not be loaded. Refresh to try again.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    let active = true
    void Promise.all([api.openConnector.status(), api.openConnector.providers(), api.openConnector.connections()])
      .then(([status, catalog, connections]) => {
        if (!active) return
        const byProvider = new Map(connections.map((connection) => [connection.provider, connection]))
        setGatewayStatus(status)
        setExternalProviders(catalog.providers.map((provider) => ({
          ...provider,
          connection: byProvider.get(provider.provider) || null,
        })))
      })
      .catch(() => {
        if (active) setGatewayStatus({ status: 'unavailable', latencyMs: 0 })
      })
    return () => { active = false }
  }, [user])

  useEffect(() => {
    if (!user) return
    const refreshAssistantChanges = () => {
      void Promise.all([
        api.automations.list(),
        api.runs.list(),
        api.integrations.list(),
        api.integrationRequests.list(),
      ]).then(([nextAutomations, nextRuns, nextIntegrations, nextRequests]) => {
        setAutomations(nextAutomations)
        setRuns(nextRuns)
        setIntegrations(nextIntegrations)
        setConnectionRequests(nextRequests)
      }).catch(() => undefined)
    }
    window.addEventListener('lancee:dashboard-changed', refreshAssistantChanges)
    return () => window.removeEventListener('lancee:dashboard-changed', refreshAssistantChanges)
  }, [user])

  useEffect(() => {
    if (!user) {
      setBuilderPayload(null)
      setBuilderLoading(false)
      return
    }
    let active = true
    setBuilderLoading(true)
    void api.workspaceBuilder
      .get()
      .then((payload) => {
        if (active) setBuilderPayload(payload)
      })
      .catch(() => {
        if (active) setToast('Workspace setup could not be loaded. You can keep using your workspace.')
      })
      .finally(() => {
        if (active) setBuilderLoading(false)
      })
    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      setWorkspaceContext(null)
      return
    }
    let active = true
    const loadWorkspaceContext = () => {
      void api.workspace
        .getContext()
        .then((context) => {
          if (active) setWorkspaceContext(context)
        })
        .catch(() => {
          if (active) {
            setWorkspaceContext({
              location: null,
              weather: null,
              fetchedAt: new Date().toISOString(),
            })
          }
        })
    }
    loadWorkspaceContext()
    const refresh = window.setInterval(loadWorkspaceContext, 15 * 60 * 1000)
    return () => {
      active = false
      window.clearInterval(refresh)
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    const refreshNotifications = () => {
      void api.notifications.list().then(setWorkspaceNotifications).catch(() => undefined)
    }
    const interval = window.setInterval(refreshNotifications, 30_000)
    return () => window.clearInterval(interval)
  }, [user])

  useEffect(() => {
    if (!user) return
    const refreshAutomationState = () => {
      void Promise.all([api.automations.list(), api.runs.list()])
        .then(([automationData, runData]) => {
          setAutomations(automationData)
          setRuns(runData)
        })
        .catch(() => setToast('The action completed, but automation state could not be refreshed.'))
    }
    window.addEventListener('lancee:automations-changed', refreshAutomationState)
    return () => window.removeEventListener('lancee:automations-changed', refreshAutomationState)
  }, [user])

  useEffect(() => {
    if (!user) return
    const syncQueuedIdeas = () => {
      if (!user.workspaceId || !navigator.onLine) return
      void syncIdeaMutations(user.workspaceId)
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const driveResult = params.get('drive')
    if (!driveResult) return
    const message = params.get('driveMessage')
    setToast(
      driveResult === 'connected'
        ? 'Google Drive connected'
        : message || 'Google Drive could not be connected',
    )
    params.delete('drive')
    params.delete('driveMessage')
    const nextQuery = params.toString()
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`,
    )
  }, [])

  const pageLabel = useMemo(
    () =>
      navItems.find((item) => item.id === activePage)?.label ??
      ({ runs: 'Activity', api: 'API keys', settings: 'Settings' } as Partial<Record<Page, string>>)[activePage] ??
      'Home',
    [activePage],
  )

  useEffect(() => {
    document.title = user
      ? `${pageLabel} · lancee`
      : authView === 'landing'
        ? 'lancee - Intelligent work, orchestrated'
        : `${authView === 'register' || authView === 'confirm' ? 'Create account' : 'Sign in'} · lancee`
  }, [pageLabel, user, authView])

  const navigateAuth = (view: AuthView, replace = false) => {
    setAuthView(view)
    const nextPath = authPath(view)
    const method = replace ? 'replaceState' : 'pushState'
    window.history[method]({}, '', nextPath)
    setLocationPath(nextPath)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const signIn = async (email: string, password: string) => {
    const session = await api.auth.signIn(email, password)
    setUser(session)
    if (deviceUserCode) {
      setAuthView('landing')
      window.history.replaceState(
        {},
        '',
        `/?device=${encodeURIComponent(deviceUserCode)}`,
      )
    } else {
      navigatePage(activePage, true)
    }
    setToast('Welcome back to lancee')
  }

  const startRegistration = async (
    email: string,
    name?: string,
    workspace?: string,
  ) => {
    await api.auth.startRegistration(email, name, workspace)
  }

  const confirmRegistration = async (token: string, password: string) => {
    const session = await api.auth.confirmRegistration(token, password)
    setUser(session)
    navigatePage('overview', true)
    setToast('Your workspace is ready')
  }

  const register = async (
    email: string,
    password: string,
    name?: string,
    workspace?: string,
    invitationToken?: string,
  ) => {
    const session = await api.auth.register(
      email,
      password,
      name,
      workspace,
      invitationToken,
    )
    setUser(session)
    navigatePage('overview', true)
    if (invitationToken) {
      window.history.replaceState({}, '', window.location.pathname)
      setToast(`You joined ${session.workspace}`)
    } else {
      setToast('Your workspace is ready')
    }
  }

  const updateBuilderState = (state: WorkspaceBuilderState) => {
    setBuilderPayload((current) => current ? { ...current, state } : current)
  }

  const completeWorkspaceBuilder = (state: WorkspaceBuilderState, name: string) => {
    updateBuilderState(state)
    setUser((current) => current ? { ...current, workspace: name || current.workspace } : current)
    navigatePage('overview', true)
    setToast('Your tailored workspace is ready')
  }

  const signOut = async () => {
    try {
      await api.auth.signOut()
      setUser(null)
      navigateAuth('landing', true)
      setNotificationsOpen(false)
      setProfileOpen(false)
      setMobileOpen(false)
    } catch (caught) {
      setToast(caught instanceof Error ? caught.message : 'Unable to sign out.')
    }
  }

  const createAutomation = async (
    input: Pick<Automation, 'name' | 'description' | 'model'> & {
      instructionTemplate?: string
      execution?: Automation['execution']
      tools?: string[]
    },
  ) => {
    const automation = await api.automations.create(input)
    setAutomations((current) => [automation, ...current])
    setModal(null)
    navigatePage('automations')
    setToast(`${automation.name} was saved as a draft automation`)
  }

  const toggleAutomation = async (automation: Automation) => {
    setBusyId(automation.id)
    try {
      const updated = await api.automations.setStatus(
        automation.id,
        automation.status === 'active' ? 'paused' : 'active',
      )
      setAutomations((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setToast(`${updated.name} is now ${updated.status}`)
    } finally {
      setBusyId(null)
    }
  }

  const useWorkflowTemplate = async (template: WorkflowTemplate) => {
    setBusyId(`template:${template.id}`)
    try {
      const draft = await api.automations.create({
        name: template.title,
        description: template.description,
        model: template.model,
        execution: 'core',
        tools: template.tools,
      })
      const workflow = await api.automations.setStatus(draft.id, 'active')
      setAutomations((current) => [workflow, ...current])
      navigatePage('automations')
      setToast(`${workflow.name} is active and ready to run`)
    } catch (error) {
      void api.automations.list().then(setAutomations).catch(() => undefined)
      setToast(error instanceof Error ? error.message : 'Unable to create this workflow.')
    } finally {
      setBusyId(null)
    }
  }

  const deleteAutomation = async (automation: Automation) => {
    if (
      !window.confirm(
        `Delete “${automation.name}”? Its run history will also be permanently removed.`,
      )
    ) return
    setBusyId(automation.id)
    try {
      await api.automations.remove(automation.id)
      const remaining = automations.filter((item) => item.id !== automation.id)
      setAutomations(remaining)
      setRuns((current) =>
        current.filter((run) => run.automationId !== automation.id),
      )
      setToast(`${automation.name} was deleted`)
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : 'Unable to delete automation.',
      )
    } finally {
      setBusyId(null)
    }
  }

  const runAutomation = async (automation: Automation) => {
    if (busyId) return
    setBusyId(automation.id)
    try {
      const instruction = automation.instructionTemplate || automation.description || automation.name
      const run = await api.runs.dispatch(automation.id, instruction)
      setRuns((current) => [run, ...current])
      setAutomations((current) => current.map((item) => item.id === automation.id ? { ...item, runs: item.runs + 1, lastRun: 'Just now' } : item))
      let completedRun = run
      for (let attempt = 0; attempt < 45 && !['completed', 'failed'].includes(completedRun.status); attempt += 1) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 1_000))
        completedRun = await api.runs.get(run.id)
        setRuns((current) => current.map((item) => item.id === completedRun.id ? completedRun : item))
      }
      const [nextAutomations, nextRuns] = await Promise.all([api.automations.list(), api.runs.list()])
      setAutomations(nextAutomations)
      setRuns(nextRuns)
      if (completedRun.status === 'completed') {
        setToast(`${automation.name} completed successfully`)
      } else if (completedRun.status === 'failed') {
        setToast(completedRun.errorCode || `${automation.name} did not complete`)
      } else {
        setToast(`${automation.name} is still running. View its history for progress.`)
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to run this automation.')
    } finally {
      setBusyId(null)
    }
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
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : 'Unable to update this connection.',
      )
    } finally {
      setBusyId(null)
    }
  }

  const refreshOpenConnector = async () => {
    try {
      const [status, connections] = await Promise.all([
        api.openConnector.status(),
        api.openConnector.connections(),
      ])
      const byProvider = new Map(connections.map((connection) => [connection.provider, connection]))
      setGatewayStatus(status)
      setExternalProviders((current) => current.map((provider) => ({
        ...provider,
        connection: byProvider.get(provider.provider) || null,
      })))
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to refresh external connections.')
    }
  }

  const connectOpenConnector = async (provider: OpenConnectorProvider) => {
    setBusyId(`openconnector:${provider.provider}`)
    try {
      const result = await api.openConnector.connect(provider.provider)
      setExternalProviders((current) => current.map((item) => item.provider === provider.provider
        ? { ...item, connection: result.connection }
        : item))
      window.open(result.authorizationUrl, 'lancee-openconnector', 'popup,width=640,height=760,noopener,noreferrer')
      setToast(`Complete ${provider.displayName} authorization in the new window.`)
      for (const delay of [2_000, 5_000, 10_000, 20_000]) {
        window.setTimeout(() => void refreshOpenConnector(), delay)
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : `Unable to connect ${provider.displayName}.`)
    } finally {
      setBusyId(null)
    }
  }

  const disconnectOpenConnector = async (provider: OpenConnectorProvider) => {
    if (!provider.connection || !window.confirm(`Disconnect ${provider.displayName} from this workspace?`)) return
    setBusyId(`openconnector:${provider.provider}`)
    try {
      await api.openConnector.disconnect(provider.connection.id)
      setExternalProviders((current) => current.map((item) => item.provider === provider.provider
        ? { ...item, connection: null }
        : item))
      setToast(`${provider.displayName} disconnected.`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : `Unable to disconnect ${provider.displayName}.`)
    } finally {
      setBusyId(null)
    }
  }

  const updateCodexConnection = (connection: CodexConnection) => {
    setCodexConnection(connection)
    setIntegrations((current) =>
      current.map((integration) =>
        integration.id === 'codex-ai'
          ? { ...integration, connected: connection.connected }
          : integration,
      ),
    )
  }

  const updateCodexRuntimeStatus = (status: CodexRuntimeStatus) => {
    setCodexRuntimeStatus(status)
    setIntegrations((current) =>
      current.map((integration) =>
        integration.id === 'codex-runtime'
          ? { ...integration, connected: status.authenticated }
          : integration,
      ),
    )
  }

  const connectGoogleWorkspace = async () => {
    setBusyId('drive')
    try {
      const authorizationUrl = await api.googleDrive.getAuthUrl()
      window.location.assign(authorizationUrl)
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : 'Unable to update Google Workspace.',
      )
      setBusyId(null)
    }
  }

  const disconnectGoogleWorkspace = async () => {
    setBusyId('drive')
    try {
      await api.googleDrive.disconnect()
      setIntegrations((current) => current.map((item) =>
        item.id === 'drive' ? { ...item, connected: false } : item,
      ))
      setToast('Google Workspace disconnected.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to disconnect Google Workspace.'
      setToast(message)
      throw error
    } finally {
      setBusyId(null)
    }
  }

  const requestIntegration = async (
    input: Pick<IntegrationRequest, 'name' | 'category' | 'details'>,
  ) => {
    const request = await api.integrationRequests.create({
      name: input.name.trim(),
      category: input.category,
      details: input.details.trim(),
    })
    setConnectionRequests((current) => [request, ...current])
    setModal(null)
    setToast(`${request.name} connection request saved`)
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

  const savePaystackConnection = async (secretKey: string) => {
    const updated = await api.money.configurePaystack(secretKey)
    setPaystackConnection(updated)
    setIntegrations((current) =>
      current.map((integration) =>
        integration.id === 'paystack'
          ? { ...integration, connected: true }
          : integration,
      ),
    )
    setToast(`Paystack connected in ${updated.mode} mode`)
  }

  const disconnectPaystack = async () => {
    const updated = await api.money.disconnectPaystack()
    setPaystackConnection(updated)
    setIntegrations((current) =>
      current.map((integration) =>
        integration.id === 'paystack'
          ? { ...integration, connected: false }
          : integration,
      ),
    )
    setToast('Paystack disconnected')
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

  const syncMcp = async () => {
    const result = await api.mcp.sync()
    setMcpConnection(result.connection)
    setMcpServices(result.services)
    setToast('Local Lancee tools refreshed')
  }

  const invokeMcpTool = async (
    service: McpService,
    toolId: string,
    toolArguments: Record<string, unknown>,
  ) => {
    const result = await api.mcp.invoke(service.id, toolId, toolArguments)
    setToast(`${result.message} · ${result.duration}ms`)
    return result
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
    if (isPricingPath(locationPath)) {
      return (
        <Suspense fallback={<main className="auth-boot"><span className="spinner spinner--dark" /></main>}>
          <PricingLanding
            onSignIn={() => navigateAuth('login')}
            onSignUp={() => navigateAuth('register')}
            onHome={() => navigateAuth('landing')}
          />
        </Suspense>
      )
    }
    if (authView === 'landing') {
      return (
        <LandingPage
          onSignIn={() => navigateAuth('login')}
          onSignUp={() => navigateAuth('register')}
          onPricing={() => {
            window.history.pushState({}, '', '/pricing')
            setLocationPath('/pricing')
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        />
      )
    }
    if (authView === 'confirm') {
      return (
        <SetPasswordScreen
          token={new URLSearchParams(window.location.search).get('token') || ''}
          onConfirm={confirmRegistration}
          onBack={() => navigateAuth('login')}
        />
      )
    }
    return (
      <AuthScreen
        onSignIn={signIn}
        onRegister={register}
        onRegisterStart={startRegistration}
        onNavigate={(view) => navigateAuth(view)}
        initialMode={authView}
        onBack={() => navigateAuth('landing')}
      />
    )
  }

  if (deviceUserCode) {
    return (
      <CodexDeviceAuthorizationPage user={user} userCode={deviceUserCode} />
    )
  }

  if (builderLoading) {
    return (
      <main className="auth-boot" aria-label="Loading workspace setup">
        <BrandMark />
        <span className="spinner spinner--dark" />
        <p>Preparing your workspace builder…</p>
      </main>
    )
  }

  if (
    builderPayload?.state.requiredSetup &&
    builderPayload.state.status !== 'completed'
  ) {
    return (
      <Suspense fallback={<main className="auth-boot"><span className="spinner spinner--dark" /></main>}>
        <WorkspaceBuilder
          initial={builderPayload}
          workspaceName={user.workspace}
          onStateChange={updateBuilderState}
          onComplete={completeWorkspaceBuilder}
          onInviteTeam={() => navigatePage('team')}
        />
      </Suspense>
    )
  }

  let page: ReactNode
  if (loading) {
    page = <EmptySkeleton />
  } else {
    switch (activePage) {
      case 'overview':
        page = (
          <Suspense fallback={<EmptySkeleton />}>
            <OverviewPage
              user={user}
              runs={runs}
              notifications={workspaceNotifications}
              workspaceContext={workspaceContext}
              analytics={analytics}
              onNavigate={navigatePage}
              onCreateProject={() => navigatePage('work')}
            />
          </Suspense>
        )
        break
      case 'work':
        page = (
          <Suspense fallback={<EmptySkeleton />}>
            <WorkPage
              onToast={setToast}
              ownerName={user.name}
              ownerInitials={user.initials}
              initialProjectId={workProjectId || undefined}
            />
          </Suspense>
        )
        break
      case 'clients':
        page = (
          <Suspense fallback={<EmptySkeleton />}>
            <ClientsPage
              onToast={setToast}
              onOpenProject={openClientProject}
              onOpenMessage={openClientMessage}
            />
          </Suspense>
        )
        break
      case 'ideas':
        page = (
          <Suspense fallback={<EmptySkeleton />}>
            <IdeasCanvasPage workspaceId={user.workspaceId} theme={theme} />
          </Suspense>
        )
        break
      case 'automations':
        page = (
          <AutomationsPage
            automations={automations}
            busyId={busyId}
            onCreate={() => setModal('automation')}
            onDelete={deleteAutomation}
            onToggle={toggleAutomation}
            onRun={runAutomation}
            workflowTemplates={
              <Suspense fallback={<EmptySkeleton />}>
                <WorkflowsPage
                  embedded
                  onUseTemplate={useWorkflowTemplate}
                  busyTemplateId={busyId?.startsWith('template:') ? busyId.slice('template:'.length) : null}
                />
              </Suspense>
            }
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
            externalProviders={externalProviders}
            gatewayStatus={gatewayStatus}
            canManage={user.role === 'owner'}
            connectionRequests={connectionRequests}
            busyId={busyId}
            onToggle={toggleIntegration}
            onConfigureN8n={() => setModal('n8n')}
            onConfigureMcp={() => setModal('mcp')}
            onConfigureCodex={() => setModal('codex-ai')}
            onConfigureCodexRuntime={() => setModal('codex-runtime')}
            onConfigurePaystack={() => setModal('paystack')}
            onConfigureMail={() => {
              setMailSettingsRequested(true)
              navigatePage('messages')
            }}
            onConfigureWhatsApp={() => {
              if (user.role !== 'owner') {
                setToast('Only the workspace owner can manage the WhatsApp connection.')
                return
              }
              if (whatsappStatus) {
                setModal('whatsapp')
                return
              }
              void api.whatsapp.status().then((next) => {
                setWhatsappStatus(next)
                setModal('whatsapp')
              }).catch((error) => setToast(error instanceof Error ? error.message : 'Unable to load WhatsApp status.'))
            }}
            onManageGoogleWorkspace={() => setModal('google-workspace')}
            onConnectGoogleWorkspace={() => void connectGoogleWorkspace()}
            onOpenStorageSetup={(provider) => {
              setStorageSetupProvider(provider)
              navigatePage('files')
              setToast(`${provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} storage point setup is ready.`)
            }}
            onRequestConnection={() => setModal('integration-request')}
            onConnectExternal={(provider) => void connectOpenConnector(provider)}
            onDisconnectExternal={(provider) => void disconnectOpenConnector(provider)}
            onRefreshExternal={() => void refreshOpenConnector()}
            onToast={setToast}
          />
        )
        break
      case 'money':
        page = (
          <Suspense fallback={<EmptySkeleton />}>
            <MoneyPage />
          </Suspense>
        )
        break
      case 'intelligence':
        page = (
          <Suspense fallback={<EmptySkeleton />}>
            <ConnectedIntelligencePage
              onOpenProject={openClientProject}
              onOpenClients={() => navigatePage('clients')}
            />
          </Suspense>
        )
        break
      case 'files':
        page = (
          <Suspense fallback={<EmptySkeleton />}>
            <FilesPage
              onOpenConnections={() => navigatePage('integrations')}
              onToast={setToast}
              ownerName={user.name}
              ownerInitials={user.initials}
              initialStorageProvider={storageSetupProvider}
            />
          </Suspense>
        )
        break
      case 'messages':
        page = (
          <Suspense fallback={<EmptySkeleton />}>
            <MessagesPage
              automations={automations}
              canManageConnection={user.role === 'owner'}
              onToast={setToast}
              focusMessage={messageFocus}
              onMessageFocusHandled={() => setMessageFocus(null)}
              openConnectionSettings={mailSettingsRequested}
              onConnectionSettingsHandled={() => setMailSettingsRequested(false)}
            />
          </Suspense>
        )
        break
      case 'dairy':
        page = (
          <Suspense fallback={<EmptySkeleton />}>
            <DairyPage
              workspaceId={user.workspaceId}
              userName={user.name}
              onNavigate={navigatePage}
              onToast={setToast}
            />
          </Suspense>
        )
        break
      case 'team':
        page = (
          <Suspense fallback={<EmptySkeleton />}>
            <TeamPage canManage={user.role === 'owner' || user.role === 'admin'} />
          </Suspense>
        )
        break
      case 'builder':
        page = builderPayload ? (
          <Suspense fallback={<EmptySkeleton />}>
            <WorkspaceBuilder
              initial={builderPayload}
              workspaceName={user.workspace}
              embedded
              onStateChange={updateBuilderState}
              onComplete={completeWorkspaceBuilder}
              onExit={() => navigatePage('overview')}
              onInviteTeam={() => navigatePage('team')}
            />
          </Suspense>
        ) : <EmptySkeleton />
        break
      case 'api':
        page = (
          <ApiPage
            keys={keys}
            onCreate={() => setModal('key')}
            onRevoke={revokeKey}
            onToast={setToast}
            canManage={user.role === 'owner'}
          />
        )
        break
      case 'pricing':
        page = (
          <Suspense fallback={<EmptySkeleton />}>
            <PricingPage onToast={setToast} />
          </Suspense>
        )
        break
      case 'settings':
        page = (
          <SettingsPage
            user={user}
            onToast={setToast}
            onNavigate={navigatePage}
            onSaved={(settings) =>
              setUser((current) =>
                current ? { ...current, workspace: settings.name } : current,
              )
            }
            onUserUpdated={setUser}
            initialSection={settingsSection}
          />
        )
        break
      case 'admin':
        page = user.isAdmin ? (
          <Suspense fallback={<EmptySkeleton />}>
            <AdminPage />
          </Suspense>
        ) : <EmptySkeleton />
        break
    }
  }

  return (
    <div className={`app-shell${sidebarCollapsed ? ' sidebar-is-collapsed' : ''}`}>
      <Sidebar
        activePage={activePage}
        user={user}
        mobileOpen={mobileOpen}
        collapsed={sidebarCollapsed}
        onNavigate={(nextPage) => {
          if (nextPage === 'settings') setSettingsSection('general')
          navigatePage(nextPage)
        }}
        onClose={() => setMobileOpen(false)}
        onSignOut={() => void signOut()}
        onWorkspaceChanged={handleWorkspaceChanged}
        onToast={setToast}
        pendingInvoiceCount={analytics?.pendingInvoices ?? 0}
        enabledModules={
          builderPayload?.state.status === 'completed'
            ? builderPayload.state.generated.modules || null
            : null
        }
      />
      <div className="app-main">
        <header className="topbar">
          <div className="topbar__left">
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarCollapsed((current) => !current)}
              aria-label={sidebarCollapsed ? 'Show navigation' : 'Hide navigation'}
              title={sidebarCollapsed ? 'Show navigation' : 'Hide navigation'}
            >
              <Icon name="menu" />
            </button>
            <button
              className="mobile-menu-button"
              onClick={() => setMobileOpen(true)}
              aria-label={mobileOpen ? 'Navigation is open' : 'Open navigation'}
              aria-expanded={mobileOpen}
              aria-controls="workspace-navigation"
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
            <button
              className="icon-button theme-toggle"
              aria-label={theme === 'dark' ? 'Switch to light theme' : theme === 'light' ? 'Switch to light blue theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Switch to light theme' : theme === 'light' ? 'Switch to light blue theme' : 'Switch to dark theme'}
              onClick={() => setTheme(toggleTheme())}
            >
              <Icon name={theme === 'dark' ? 'sun' : theme === 'light' ? 'cloud-sun' : 'moon'} size={18} />
            </button>
            <div className="notification-wrap">
              <button
                className="icon-button"
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                onClick={() => {
                  const nextOpen = !notificationsOpen
                  setNotificationsOpen(nextOpen)
                  if (nextOpen) {
                    void api.notifications.list().then(setWorkspaceNotifications).catch(() => undefined)
                  }
                }}
              >
                <Icon name="bell" size={18} />
                {unreadNotifications.length > 0 && <span className="notification-dot" />}
              </button>
              {notificationsOpen && (
                <div className="notification-popover">
                  <div>
                    <strong>Notifications</strong>
                    <div className="notification-popover__actions">
                      {unreadNotifications.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            void Promise.all(unreadNotifications.map((notification) => api.notifications.markRead(notification.id)))
                              .then(() => {
                                const readAt = new Date().toISOString()
                                setWorkspaceNotifications((current) => current.map((notification) => ({ ...notification, readAt: notification.readAt || readAt })))
                              })
                              .catch(() => setToast('Unable to mark notifications as read.'))
                          }}
                        >
                          Mark read
                        </button>
                      )}
                      {visibleNotifications.length > 0 && (
                        <button type="button" onClick={() => void clearNotifications()} disabled={clearingNotifications}>
                          {clearingNotifications ? 'Clearing…' : 'Clear all'}
                        </button>
                      )}
                      <button type="button" onClick={() => setNotificationsOpen(false)}>Close</button>
                    </div>
                  </div>
                  {visibleNotifications.slice(0, 20).map((notification) => (
                    <button
                      key={notification.id}
                      className={notification.readAt ? 'is-read' : 'is-unread'}
                      onClick={() => {
                        void api.notifications.markRead(notification.id).catch(() => undefined)
                        setWorkspaceNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: item.readAt || new Date().toISOString() } : item))
                        navigatePage(
                          notification.entityType === 'project'
                            ? 'work'
                            : notification.entityType === 'invoice'
                              ? 'money'
                              : notification.entityType === 'draft_invoice'
                                ? 'money'
                                : notification.entityType === 'mail'
                                  ? 'messages'
                                  : notification.entityType === 'automation_run'
                                    ? 'runs'
                                    : notification.entityType === 'client'
                                      ? 'clients'
                                      : 'overview',
                        )
                        setNotificationsOpen(false)
                      }}
                    >
                      <span className={`notification-icon notification-icon--${notification.kind.includes('failed') ? 'coral' : 'lime'}`}>
                        <Icon
                          name={notification.entityType === 'mail'
                            ? 'messages'
                            : notification.entityType === 'automation_run'
                              ? 'sparkles'
                              : notification.kind.includes('comment')
                                ? 'messages'
                                : notification.entityType === 'project'
                                  ? 'briefcase'
                                  : 'check'}
                          size={14}
                        />
                      </span>
                      <span>
                        <strong>{notification.title}</strong>
                        <small>{notification.body}</small>
                        <small>{new Date(notification.createdAt).toLocaleString()}</small>
                      </span>
                    </button>
                  ))}
                  {visibleNotifications.length === 0 && <p className="empty-copy">No notifications yet.</p>}
                </div>
              )}
            </div>
            <div className="profile-menu-wrap">
              <button
                className="topbar-avatar"
                onClick={() => setProfileOpen((open) => !open)}
                aria-expanded={profileOpen}
                aria-label="Open profile menu"
              >
                <UserAvatar user={user} className="user-avatar--topbar" />
              </button>
              {profileOpen && (
                <div className="profile-popover">
                  <header>
                    <UserAvatar user={user} className="user-avatar--profile" />
                    <div><strong>{user.name}</strong><small>{user.email}</small></div>
                  </header>
                  <button onClick={() => {
                    setSettingsSection('general')
                    navigatePage('settings')
                    setProfileOpen(false)
                  }}>
                    <Icon name="settings" size={16} /><span><strong>Preferences</strong><small>Account, workspace, and developer options</small></span>
                  </button>
                  <button className="profile-popover__signout" onClick={() => void signOut()}>
                    <Icon name="logout" size={16} /><span><strong>Sign out</strong></span>
                  </button>
                </div>
              )}
            </div>
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
      {modal === 'integration-request' && (
        <Modal
          title="Request a connection"
          description="Tell us which business system should be connected through the lancee app. MCP remains for small tools and skills."
          onClose={() => setModal(null)}
        >
          <RequestIntegrationForm onSubmit={requestIntegration} onCancel={() => setModal(null)} />
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
      {modal === 'google-workspace' && (
        <Modal
          title="Manage Google Workspace"
          description="Review this workspace connection, restore access, or disconnect it from the danger zone."
          onClose={() => setModal(null)}
        >
          <GoogleWorkspaceConnectionPanel
            canManage={user.role === 'owner'}
            onReconnect={connectGoogleWorkspace}
            onDisconnect={disconnectGoogleWorkspace}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
      {modal === 'paystack' && paystackConnection && (
        <Modal
          title={paystackConnection.configured ? 'Manage Paystack' : 'Connect Paystack'}
          description="Keep this workspace’s payment credential encrypted in the lancee backend."
          onClose={() => setModal(null)}
        >
          <PaystackConnectionForm
            connection={paystackConnection}
            canManage={user.role === 'owner'}
            onSave={savePaystackConnection}
            onDisconnect={disconnectPaystack}
            onCancel={() => setModal(null)}
            onToast={setToast}
          />
        </Modal>
      )}
      {modal === 'whatsapp' && whatsappStatus && (
        <Modal
          title="Connect WhatsApp"
          description="Scan once to send platform notifications to your own WhatsApp number."
          onClose={() => setModal(null)}
        >
          <WhatsAppConnectionPanel
            status={whatsappStatus}
            canManage={user.role === 'owner'}
            onStatusChange={(next) => {
              setWhatsappStatus(next)
              setIntegrations((current) => current.map((item) => item.id === 'whatsapp' ? { ...item, connected: next.connected } : item))
            }}
            onClose={() => setModal(null)}
            onToast={setToast}
          />
        </Modal>
      )}
      {modal === 'mcp' && mcpConnection && (
        <Modal
          title="Lancee MCP"
          description="Inspect the application-owned MCP route and its local workspace tools."
          onClose={() => setModal(null)}
          wide
        >
          <McpIntegrationPanel
            connection={mcpConnection}
            services={mcpServices}
            onSync={syncMcp}
            onInvoke={invokeMcpTool}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
      {modal === 'codex-ai' && codexConnection && (
        <Modal
          title="Connect Codex AI"
          description="Authorize Codex with a short device code. Your AI provider key stays inside lancee."
          onClose={() => setModal(null)}
          wide
        >
          <CodexAiConnectionPanel
            connection={codexConnection}
            onConnectionChange={updateCodexConnection}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
      {modal === 'codex-runtime' && codexRuntimeStatus && (
        <Modal
          title="Codex Workspace"
          description="Sign in to OpenAI, then run Codex against the server-configured workspace."
          onClose={() => setModal(null)}
          wide
        >
          <CodexRuntimePanel
            status={codexRuntimeStatus}
            onStatusChange={updateCodexRuntimeStatus}
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
        isAdmin={user.isAdmin}
        onClose={() => setCommandOpen(false)}
        onNavigate={navigatePage}
        onCreateAutomation={() => setModal('automation')}
      />
      <Suspense fallback={null}><WorkspaceChat user={user} /></Suspense>
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
