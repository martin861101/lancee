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
  type WorkspaceBuilderPayload,
  type WorkspaceBuilderState,
  type WorkspaceContext,
  type WorkspaceNotification,
  type WhatsAppStatus,
} from './lib/api'
import { syncIdeaMutations } from './lib/ideasRepository'
import { IDEA_SYNC_REQUEST_EVENT } from './pwa'
import { applyTheme, getStoredTheme, toggleTheme, type Theme } from './lib/theme'
import type { WorkflowTemplate } from './components/WorkflowsPage'
import { BUSINESS_IDENTITY } from './lib/business'

const IdeasCanvasPage = lazy(() => import('./components/IdeasCanvasPage'))
const MoneyPage = lazy(() => import('./components/MoneyPage'))
const WorkPage = lazy(() => import('./components/WorkPage'))
const ClientsPage = lazy(() => import('./components/dashboard/ClientsPage'))
const AnalyticsPage = lazy(() => import('./components/dashboard/AnalyticsPage'))
const TeamPage = lazy(() => import('./components/dashboard/TeamPage'))
const FilesPage = lazy(() => import('./components/dashboard/FilesPage'))
const MessagesPage = lazy(() => import('./components/dashboard/MessagesPage'))
const ServicesPage = lazy(() => import('./components/dashboard/ServicesPage'))
const WorkspaceChat = lazy(() => import('./components/dashboard/WorkspaceChat'))
const WorkflowsPage = lazy(() => import('./components/WorkflowsPage'))
const WorkspaceBuilder = lazy(() => import('./components/workspace-builder/WorkspaceBuilder'))
const StorefrontPage = lazy(() => import('./components/StorefrontPage'))
const ReviewPage = lazy(() => import('./components/annotations/ReviewPage'))
const PricingPage = lazy(() => import('./components/pricing/PricingPage'))
const PricingLanding = lazy(() => import('./components/pricing/PricingLanding'))
import FeaturesPage from './components/FeaturesPage'

const SIGNUPS_PAUSED = false
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
  | 'files'
  | 'messages'
  | 'team'
  | 'builder'
  | 'api'
  | 'pricing'
  | 'settings'
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
  'files',
  'messages',
  'team',
  'builder',
  'api',
  'pricing',
  'settings',
])
type ModalName =
  | 'automation'
  | 'key'
  | 'n8n'
  | 'mcp'
  | 'codex-ai'
  | 'codex-runtime'
  | 'paystack'
  | 'whatsapp'
  | 'integration-request'
  | null
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
  | 'cloud'
  | 'cloud-rain'
  | 'cloud-sun'
  | 'code'
  | 'command'
  | 'copy'
  | 'credit-card'
  | 'file'
  | 'filter'
  | 'grid'
  | 'help'
  | 'key'
  | 'layers'
  | 'lightbulb'
  | 'logout'
  | 'map-pin'
  | 'menu'
  | 'messages'
  | 'moon'
  | 'more'
  | 'pause'
  | 'play'
  | 'plug'
  | 'plus'
  | 'search'
  | 'settings'
  | 'shield'
  | 'sparkles'
  | 'snowflake'
  | 'sun'
  | 'target'
  | 'trash'
  | 'user'
  | 'wallet'

const navItems: { id: Page; label: string; icon: IconName; section: string; modules?: string[] }[] = [
  { id: 'overview', label: 'Home', icon: 'grid', section: 'Your work' },
  { id: 'clients', label: 'Clients', icon: 'user', section: 'Your work', modules: ['clients', 'client-portal'] },
  { id: 'work', label: 'Projects', icon: 'briefcase', section: 'Your work', modules: ['projects', 'tasks', 'calendar'] },
  { id: 'ideas', label: 'Ideas', icon: 'lightbulb', section: 'Your work', modules: ['whiteboard', 'notes'] },
  { id: 'files', label: 'Files', icon: 'file', section: 'Your work', modules: ['files', 'annotations', 'knowledge-base'] },
  { id: 'messages', label: 'Messages', icon: 'messages', section: 'Your work', modules: ['clients', 'client-portal'] },
  { id: 'automations', label: 'Automations', icon: 'activity', section: 'Business', modules: ['workflows'] },
  { id: 'runs', label: 'Results', icon: 'play', section: 'Business', modules: ['workflows'] },
  { id: 'workflows', label: 'Workflows', icon: 'layers', section: 'Business', modules: ['workflows', 'approvals'] },
  { id: 'storefront', label: 'Storefront', icon: 'layers', section: 'Business', modules: ['client-portal'] },
  { id: 'integrations', label: 'Connections', icon: 'plug', section: 'Business' },
  { id: 'services', label: 'Services', icon: 'plug', section: 'Business', modules: ['workflows'] },
  { id: 'money', label: 'Invoicing', icon: 'wallet', section: 'Business', modules: ['quotes', 'invoices', 'time-tracking'] },
  { id: 'analytics', label: 'Analytics', icon: 'target', section: 'Business' },
  { id: 'team', label: 'Team', icon: 'user', section: 'Platform' },
  { id: 'pricing', label: 'Pricing', icon: 'credit-card', section: 'Platform' },
  { id: 'builder', label: 'Workspace builder', icon: 'sparkles', section: 'Platform' },
  { id: 'settings', label: 'Settings', icon: 'settings', section: 'Platform' },
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
    cloud: (
      <path d="M7.5 18.5h9a4.5 4.5 0 0 0 .5-8.97A5.5 5.5 0 0 0 6.32 11 3.75 3.75 0 0 0 7.5 18.5Z" />
    ),
    'cloud-rain': (
      <>
        <path d="M7.5 16.5h9a4.5 4.5 0 0 0 .5-8.97A5.5 5.5 0 0 0 6.32 9 3.75 3.75 0 0 0 7.5 16.5Z" />
        <path d="m8 19-1 2M13 19l-1 2M18 19l-1 2" />
      </>
    ),
    'cloud-sun': (
      <>
        <circle cx="16.5" cy="7.5" r="3" />
        <path d="M16.5 2.5v1M16.5 11.5v1M11.5 7.5h1M20.5 7.5h1M13 4l.7.7M19.3 10.3l.7.7M13.7 16.5h6a4 4 0 0 0 .45-7.98A5 5 0 0 0 4.3 10.2a3.5 3.5 0 0 0 1.2 6.3h3.2" />
      </>
    ),
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
    'credit-card': (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20M6 15h4" />
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
    'map-pin': (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    messages: (
      <>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
    moon: (
      <>
        <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
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
    snowflake: (
      <>
        <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
        <path d="m9 5 3 2 3-2M9 19l3-2 3 2M5 11l3 1-1 3M19 11l-3 1 1 3" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
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
      {name === 'gmail' && (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285f4" d="M3 19V8.1l4 3V19Z" />
          <path fill="#34a853" d="M17 19v-7.9l4-3V19Z" />
          <path fill="#fbbc04" d="M3 8.1V6.5c0-1.5 1.7-2.3 2.9-1.4L12 9.7 18.1 5c1.2-.9 2.9 0 2.9 1.4v1.6l-9 6.8Z" />
          <path fill="#ea4335" d="m3.7 5.3 8.3 6.3 8.3-6.3c.4.3.7.7.7 1.2v1.6l-9 6.8-9-6.8V6.5c0-.5.3-1 .7-1.2Z" />
        </svg>
      )}
      {name === 'calendar' && (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285f4" d="M5 2h14a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z" />
          <path fill="#fff" d="M7 8h10v9H7z" />
          <path fill="#34a853" d="M2 8h5v9H2z" />
          <path fill="#fbbc04" d="M7 17h10v5H7z" />
          <path fill="#ea4335" d="M17 8h5v9h-5z" />
          <path fill="#4285f4" d="M9.2 11.4v1.3h2.1c-.2 1-1 1.5-2.1 1.5a2.2 2.2 0 1 1 0-4.4c.6 0 1.1.2 1.5.6l1-1a3.6 3.6 0 1 0-2.5 6.2c2.1 0 3.5-1.5 3.5-3.5 0-.3 0-.5-.1-.7Z" />
        </svg>
      )}
      {name === 'drive' && (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#0f9d58" d="M8.2 3h7.6l6.1 10.6h-7.6Z" />
          <path fill="#f4b400" d="m8.2 3 3.8 6.6-6.1 10.6-3.8-6.6Z" />
          <path fill="#4285f4" d="M5.9 20.2 9.7 13h12.2l-3.8 7.2Z" />
        </svg>
      )}
      {name === 'slack' && (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect fill="#36c5f0" x="10.2" y="2" width="3.7" height="9" rx="1.8" />
          <rect fill="#2eb67d" x="13" y="10.2" width="9" height="3.7" rx="1.8" />
          <rect fill="#ecb22e" x="10.2" y="13" width="3.7" height="9" rx="1.8" />
          <rect fill="#e01e5a" x="2" y="10.2" width="9" height="3.7" rx="1.8" />
        </svg>
      )}
      {name === 'zoom' && (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect fill="#2d8cff" x="2" y="4" width="20" height="16" rx="5" />
          <path fill="#fff" d="M6 8h7.5A2.5 2.5 0 0 1 16 10.5V16H8.5A2.5 2.5 0 0 1 6 13.5Zm10 3 3-2v6l-3-2Z" />
        </svg>
      )}
      {name === 'stripe' && <strong>stripe</strong>}
      {name === 'paypal' && <strong><i>P</i>P</strong>}
      {name === 'paystack' && <strong><i />paystack</strong>}
    </span>
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

function formatOverviewDate(
  value: Date,
  options: Intl.DateTimeFormatOptions,
  timeZone?: string | null,
) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      ...options,
      ...(timeZone ? { timeZone } : {}),
    }).format(value)
  } catch {
    return new Intl.DateTimeFormat('en-US', options).format(value)
  }
}

function overviewLocalHour(value: Date, timeZone?: string | null) {
  try {
    const hour = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hourCycle: 'h23',
      ...(timeZone ? { timeZone } : {}),
    })
      .formatToParts(value)
      .find((part) => part.type === 'hour')?.value
    const parsedHour = Number(hour)
    return Number.isFinite(parsedHour) ? parsedHour : value.getHours()
  } catch {
    return value.getHours()
  }
}

function weatherPresentation(weather: WorkspaceContext['weather']): {
  label: string
  icon: IconName
} {
  if (!weather) return { label: 'Weather unavailable', icon: 'cloud' }

  const { weatherCode: code, isDay } = weather
  if (code === 0) return { label: isDay ? 'Clear sky' : 'Clear night', icon: isDay ? 'sun' : 'moon' }
  if (code === 1) return { label: 'Mainly clear', icon: 'cloud-sun' }
  if (code === 2) return { label: 'Partly cloudy', icon: 'cloud-sun' }
  if (code === 3) return { label: 'Overcast', icon: 'cloud' }
  if (code === 45 || code === 48) return { label: 'Foggy', icon: 'cloud' }
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: 'cloud-rain' }
  if (code >= 61 && code <= 67) return { label: 'Rain', icon: 'cloud-rain' }
  if (code >= 71 && code <= 77) return { label: 'Snow', icon: 'snowflake' }
  if (code >= 80 && code <= 82) return { label: 'Rain showers', icon: 'cloud-rain' }
  if (code >= 85 && code <= 86) return { label: 'Snow showers', icon: 'snowflake' }
  if (code >= 95) return { label: 'Thunderstorms', icon: 'cloud-rain' }
  return { label: 'Current conditions', icon: 'cloud' }
}

function overviewLocationLabel(location: WorkspaceContext['location']) {
  if (!location) return 'Location unavailable'
  return [location.city, location.country].filter(Boolean).join(', ') || 'Local conditions'
}

function OverviewPage({
  user,
  automations,
  runs,
  workspaceContext,
  prompt,
  selectedAutomation,
  busy,
  analytics,
  onPromptChange,
  onAutomationChange,
  onDispatch,
  onNavigate,
  onCreateProject,
}: {
  user: User
  automations: Automation[]
  runs: Run[]
  workspaceContext: WorkspaceContext | null
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
  onCreateProject: () => void
}) {
  const [now, setNow] = useState(() => new Date())
  const activeAutomations = automations.filter((automation) => automation.status === 'active').length
  const chartValues = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - 13)
    const values = Array.from({ length: 14 }, () => 0)
    for (const run of runs) {
      if (run.status !== 'completed') continue
      const started = new Date(run.startedAt)
      const index = Math.floor((started.getTime() - start.getTime()) / 86_400_000)
      if (index >= 0 && index < values.length) values[index] += 1
    }
    return values
  }, [runs])
  const completedInPeriod = chartValues.reduce((total, value) => total + value, 0)
  const chartMaximum = Math.max(...chartValues, 1)
  const failedRuns = runs.filter((run) => run.status === 'failed').length
  const timeZone = workspaceContext?.location?.timezone
  const today = formatOverviewDate(now, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }, timeZone)
  const localTime = formatOverviewDate(now, {
    hour: 'numeric',
    minute: '2-digit',
  }, timeZone)
  const hour = overviewLocalHour(now, timeZone)
  const greeting = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const weather = workspaceContext?.weather
  const weatherInfo = weatherPresentation(weather ?? null)
  const locationLabel = overviewLocationLabel(workspaceContext?.location || null)
  const temperatureLabel = weather ? `${Math.round(weather.temperatureC)}°C` : '—'

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1_000)
    return () => window.clearInterval(clock)
  }, [])

  return (
    <div className="page page--overview">
      <section className="overview-hero" aria-labelledby="overview-greeting">
        <div className="overview-hero__copy">
          <div className="overview-date" aria-label={`${today} at ${localTime}`}>
            <span className="overview-date__icon" aria-hidden="true">
              <Icon name="calendar" size={15} />
            </span>
            <span>{today}</span>
            <span className="overview-date__divider" aria-hidden="true" />
            <strong>{localTime}</strong>
          </div>
          <h1 id="overview-greeting">
            {greeting}, <em>{user.name.split(' ')[0]}.</em>
          </h1>
          <p>A clear view of your projects, cash flow, and the next best things to move forward.</p>
        </div>

        <div className="overview-hero__aside">
          <div className="overview-context" aria-live="polite">
            <span className={`overview-context__icon overview-context__icon--${weatherInfo.icon}`} aria-hidden="true">
              <Icon name={weatherInfo.icon} size={25} />
            </span>
            <span className="overview-context__body">
              <span className="overview-context__reading">
                <strong>{temperatureLabel}</strong>
                <span>{weatherInfo.label}</span>
              </span>
              <span className="overview-context__location">
                <Icon name="map-pin" size={12} />
                {locationLabel}
              </span>
            </span>
          </div>
          <button className="button button--primary overview-hero__action" onClick={onCreateProject}>
            <Icon name="plus" size={16} />
            New project
          </button>
        </div>
      </section>

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
          <button onClick={() => onPromptChange('Turn the latest client feedback into a revision checklist')}>
            Make a revision list
          </button>
          <button onClick={() => onPromptChange('Prepare a friendly reminder for the oldest unpaid invoice')}>
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
            <span>{failedRuns > 0 ? `${failedRuns} failed run${failedRuns === 1 ? '' : 's'}` : 'No failed runs'}</span>
          </div>
        </article>
      </section>

      <section className="overview-grid">
        <article className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h3>Projects</h3>
              <p>Work completed over the last 14 days</p>
            </div>
            <span className="period-button">
              14 days
            </span>
          </div>
          <div className="chart-summary">
            <strong>{completedInPeriod} completed</strong>
            <span className="trend trend--up">last 14 days</span>
          </div>
          <div className="chart-wrap">
            <div className="chart-y-labels" aria-hidden="true">
              <span>{chartMaximum}</span>
              <span>{Math.ceil(chartMaximum * 0.67)}</span>
              <span>{Math.ceil(chartMaximum * 0.33)}</span>
              <span>0</span>
            </div>
            <div className="bar-chart">
              {chartValues.map((value, index) => (
                <div className="bar-column" key={`${value}-${index}`}>
                  <span style={{ height: `${(value / chartMaximum) * 100}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div className="chart-dates" aria-hidden="true">
            <span>13 days ago</span>
            <span>9 days ago</span>
            <span>5 days ago</span>
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
            {automations.length === 0 && (
              <p className="empty-copy">No automations saved yet.</p>
            )}
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
}: {
  automations: Automation[]
  busyId: string | null
  onCreate: () => void
  onDelete: (automation: Automation) => void
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
        eyebrow="Runs in the Core"
        title="Automations"
        description="Standard workflows execute inside lancee; custom n8n workflows run on the Edge only when you opt in."
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
                  disabled={busyId === automation.id}
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

function IntegrationsPage({
  integrations,
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
  onToggleGoogleDrive,
  onOpenStorageSetup,
  onRequestConnection,
  onToast,
}: {
  integrations: Integration[]
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
  onToggleGoogleDrive: (integration: Integration) => void
  onOpenStorageSetup: (provider: 'dropbox' | 'onedrive') => void
  onRequestConnection: () => void
  onToast: (message: string) => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const categories = ['All', 'Payments', 'Design', 'Storage', 'Automation', 'Communication', 'Other']
  const connectionCatalog: Integration[] = [
    {
      id: 'general-ai',
      name: 'General AI',
      description: 'One provider-neutral connection for OpenAI-compatible and other leading AI services.',
      category: 'Automation',
      connected: false,
      icon: 'ai',
      accent: 'violet',
    },
    ...integrations.filter(
      (integration) => !['codex-ai', 'codex-runtime'].includes(integration.id),
    ),
    ...connectionRequests.map((request) => ({
      id: `request:${request.id}`,
      name: request.name,
      description: request.details || 'Requested connector awaiting workspace setup.',
      category: request.category,
      connected: false,
      icon: 'plug',
      accent: '#786bff',
    })),
  ]
  const filtered = connectionCatalog.filter(
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
            onClick={onRequestConnection}
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
            {connectionCatalog.filter((item) => item.connected && item.id !== 'mcp-grid').length}{' '}
            tools are connected, plus the built-in Lancee MCP surface.
          </p>
        </div>
        <div className="integration-banner__status">
          <span className="online-dot" />
          Backend status is live
        </div>
      </section>

      <p className="integration-boundary-note">
        Business connections and MCP tools share the Lancee application backend. Provider capabilities are local adapters, not separate MCP servers.
      </p>

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
              ) : integration.id.startsWith('request:') ? (
                <span className="platform-label">
                  <Icon name="plus" size={12} /> Requested
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
                <small>Local tool registry</small>
              </div>
            )}
            {integration.id === 'codex-ai' && (
              <div className="protocol-badges" aria-label="Codex AI authorization">
                <span>Device API</span>
                <span>Scoped</span>
                <small>Agent calls Lancee AI</small>
              </div>
            )}
            {integration.id === 'codex-runtime' && (
              <div className="protocol-badges" aria-label="Embedded Codex runtime">
                <span>App Server</span>
                <span>Device auth</span>
                <small>Codex runs inside lancee</small>
              </div>
            )}
            {integration.id === 'mail' && (
              <div className="protocol-badges" aria-label="Mail protocols">
                <span>IMAP</span>
                <span>SMTP</span>
                <small>Native message triggers</small>
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
                else if (integration.id === 'general-ai') {
                  onToast('General AI is ready for provider configuration in the upcoming AI layer.')
                }
                else if (integration.id === 'codex-ai') onConfigureCodex()
                else if (integration.id === 'codex-runtime') onConfigureCodexRuntime()
                else if (integration.id === 'paystack') onConfigurePaystack()
                else if (integration.id.startsWith('request:')) onToast(`${integration.name} is saved as a pending connection request.`)
                else if (integration.id === 'mail') onConfigureMail()
                else if (integration.id === 'whatsapp') onConfigureWhatsApp()
                else if (integration.id === 'drive') onToggleGoogleDrive(integration)
                else if (integration.id === 'dropbox' || integration.id === 'onedrive') onOpenStorageSetup(integration.id)
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
                      : integration.id === 'codex-ai' ||
                          integration.id === 'codex-runtime'
                        ? 'command'
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
                ? 'View Lancee MCP'
                : integration.id.startsWith('request:')
                  ? 'Pending setup'
                : integration.id === 'codex-ai'
                  ? integration.connected
                    ? 'Manage connection'
                    : 'Connect Codex'
                : integration.id === 'codex-runtime'
                  ? integration.connected
                    ? 'Open Codex'
                    : 'Set up Codex'
                : integration.id === 'n8n' && integration.connected
                  ? 'Configure'
                  : integration.id === 'mail'
                    ? integration.connected
                      ? 'Open Messages'
                      : 'Set up mail'
                  : integration.id === 'whatsapp'
                    ? integration.connected
                      ? 'Manage WhatsApp'
                      : 'Scan WhatsApp QR'
                  : integration.id === 'paystack'
                    ? integration.connected
                      ? 'Configure'
                      : 'Connect'
                  : integration.category === 'Payments'
                    ? 'Preview setup'
                  : integration.category === 'Storage'
                    ? integration.connected
                      ? integration.id === 'dropbox' || integration.id === 'onedrive'
                        ? 'Manage storage point'
                        : 'Disconnect'
                      : integration.id === 'dropbox' || integration.id === 'onedrive'
                        ? 'Set storage point'
                        : 'Connect'
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
  const [disconnecting, setDisconnecting] = useState(false)
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

  const disconnect = async () => {
    setDisconnecting(true)
    setError('')
    try {
      await onDisconnect()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to disconnect Paystack.')
    } finally {
      setDisconnecting(false)
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
          {connection.configured && canManage && (
            <button
              className="button button--danger button--small"
              type="button"
              onClick={() => void disconnect()}
              disabled={disconnecting}
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          )}
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
  const sampleCode = `curl https://lancee.hookitupservices.com/api/v1/workspace \\
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
              <span>curl</span> https://lancee.hookitupservices.com/api/v1/workspace \<br />
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
  onSignOut,
  initialSection,
}: {
  user: User
  onToast: (message: string) => void
  onNavigate: (page: Page) => void
  onSaved: (settings: { name: string }) => void
  onUserUpdated: (user: User) => void
  onSignOut: () => void
  initialSection: 'profile' | 'general' | 'dev'
}) {
  const canEdit = user.role === 'owner'
  const [workspace, setWorkspace] = useState(user.workspace)
  const [email, setEmail] = useState(user.email)
  const [timezone, setTimezone] = useState('Africa/Johannesburg')
  const [travelMode, setTravelMode] = useState('none')
  const [travelLocation, setTravelLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsError, setSettingsError] = useState('')
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [section, setSection] = useState(initialSection)
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

  useEffect(() => {
    setSection(initialSection)
  }, [initialSection])

  useEffect(() => {
    api.workspace
      .getSettings()
      .then((settings) => {
        if (settings.name) setWorkspace(settings.name)
        if (settings.email) setEmail(settings.email)
        setTimezone(settings.timezone)
        setTravelMode(settings.travelMode)
        setTravelLocation(settings.travelLocation)
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
  }, [])

  const save = async (event: FormEvent<HTMLFormElement>) => {
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

  return (
    <div className="page settings-page">
      <PageHeader
        eyebrow="Your account"
        title={section === 'profile' ? 'Your Profile' : section === 'dev' ? 'Dev Tools' : 'Settings'}
        description={
          section === 'dev'
            ? 'Technical diagnostics, API access, and activity records for workspace administrators.'
            : 'Manage your account and workspace preferences in plain language.'
        }
      />
      <div className="settings-layout">
        <aside className="settings-nav">
          <button type="button" className={section === 'profile' ? 'is-active' : ''} onClick={() => setSection('profile')}>
            <Icon name="user" size={16} /> Profile
          </button>
          <button type="button" className={section === 'general' ? 'is-active' : ''} onClick={() => setSection('general')}>
            <Icon name="grid" size={16} /> General
          </button>
          <button type="button" onClick={() => onNavigate('team')}>
            <Icon name="user" size={16} /> Collaborators
          </button>
          <button type="button" onClick={() => onNavigate('pricing')}>
            <Icon name="credit-card" size={16} /> Pricing &amp; plan
          </button>
          <button type="button" className={section === 'dev' ? 'is-active' : ''} onClick={() => setSection('dev')}>
            <Icon name="code" size={16} /> Dev Tools
          </button>
        </aside>
        <div className="settings-content">
          {section !== 'dev' && (
          <form className="settings-card" onSubmit={save}>
            <div className="settings-card__heading">
              <h3>Workspace profile</h3>
              <p>Used on shared work, invoices, and client-facing pages.</p>
            </div>
            {settingsError && <p className="form-error">{settingsError}</p>}
            <div className="workspace-logo-field">
              <UserAvatar user={user} />
              <div>
                <strong>{user.name}</strong>
                <small>{canEdit ? 'Workspace owner' : 'Workspace collaborator'}</small>
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
              <span>Workspace name</span>
              <input value={workspace} onChange={(event) => setWorkspace(event.target.value)} disabled={!canEdit} />
            </label>
            <label className="form-field">
              <span>Owner email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={!canEdit}
              />
            </label>
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
            <div className="form-footer">
              {canEdit ? (
                <button
                  className="button button--dark"
                  type="submit"
                  disabled={saving || settingsLoading}
                >
                  {saving ? 'Saving…' : settingsLoading ? 'Loading…' : 'Save changes'}
                </button>
              ) : (
                <small>Only workspace owners can change these settings.</small>
              )}
              {section === 'profile' && (
                <button type="button" className="button button--danger" onClick={onSignOut}>
                  <Icon name="logout" size={14} /> Log out
                </button>
              )}
            </div>
          </form>
          )}

          <section className="settings-card">
            <div className="settings-card__heading">
              <h3>Workspace plan</h3>
              <p>Your current plan, billing cycle, and trial availability.</p>
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
                      ? `${planInfo.billingPeriod} billing`
                      : 'Checking your current plan'}
                </p>
              </div>
              <button
                className="button button--secondary button--small"
                onClick={() => onNavigate('pricing')}
              >
                {planInfo?.isOnTrial ? 'Choose a plan' : 'Manage plan'}
              </button>
            </div>
          </section>

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
        <p>We collect information you provide when creating an account, including your name, email address, and workspace details. We also collect data about your usage of the Service.</p>
        <h2>2. How We Use Your Information</h2>
        <p>Your information is used to provide, maintain, and improve the Service; to process transactions; to communicate with you; and to ensure security and compliance.</p>
        <h2>3. Data Storage and Security</h2>
        <p>We implement industry-standard security measures including encryption at rest and in transit. Credentials are stored server-side and never exposed to clients.</p>
        <h2>4. Third-Party Services</h2>
        <p>The Service integrates with third-party tools you explicitly authorize. Data shared with these services is governed by their respective privacy policies.</p>
        <h2>5. Data Retention</h2>
        <p>We retain your data for as long as your account is active. Upon account deletion, data is permanently removed within 30 days.</p>
        <h2>6. Your Rights</h2>
        <p>You may access, update, or delete your personal data at any time through your account settings. You may also request a copy of your data.</p>
        <h2>7. Cookies</h2>
        <p>We use HTTP-only session cookies essential for authentication. No tracking cookies are used.</p>
        <h2>8. Contact</h2>
        <p>For privacy-related inquiries, please contact us through the Service.</p>
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
  const [signupNotice, setSignupNotice] = useState(false)

  useEffect(() => {
    if (!signupNotice) return
    const timeout = window.setTimeout(() => setSignupNotice(false), 4200)
    return () => window.clearTimeout(timeout)
  }, [signupNotice])

  const handleSignUp = () => {
    if (SIGNUPS_PAUSED) {
      setSignupNotice(true)
      return
    }
    onSignUp()
  }

  useEffect(() => {
    const landing = landingRef.current
    if (!landing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    const headings = Array.from(
      landing.querySelectorAll<HTMLElement>(
        '.landing-section h2, .landing-section h3, .landing-workflow h2, .landing-security h2, .landing-cta h2',
      ),
    )
    const heroLines = Array.from(
      landing.querySelectorAll<HTMLElement>('.landing-hero__title-line'),
    )

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
      gsap.killTweensOf([...headings, ...heroLines])
      gsap.set([...headings, ...heroLines], { clearProps: 'all' })
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
        signupsPaused={SIGNUPS_PAUSED}
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
        <nav aria-label="Public navigation">
          <a href="#platform">What it does</a>
          <a href="#workflow">How it works</a>
          <a href="#integrations">Connections</a>
          <a href="/pricing" onClick={(event) => { event.preventDefault(); onPricing() }}>
            Pricing
          </a>
          <button className="landing-nav-features" onClick={() => setFeaturesOpen(true)}>
            Features
          </button>
        </nav>
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
            One calm place for client work, ideas, useful automations, connected tools,
            invoices, and payments, wherever you happen to be working.
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
            <button aria-label="Open sign in" onClick={onSignIn}>
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
            <span>Your projects view</span>
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
          <span className="landing-eyebrow">The small-business operating space</span>
          <h2>Everything around the work, finally in one place.</h2>
          <p>
            lancee keeps projects, inspiration, admin, and money connected without
            turning your business into a complicated system.
          </p>
          <button className="landing-section__cta" onClick={() => setFeaturesOpen(true)}>
            Check out all features <Icon name="arrow-up-right" size={14} />
          </button>
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
            <h3>Automated Workflows</h3>
            <p>From client approvals, straight to secure payments, in one seamless workflow
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
          <h2>Connect what you use. Ignore what you don't.</h2>
          <p>
            Storage, design, communication, automation, and payments all linked together. Where mobility meets productivity. Travel, work, earn.
          </p>
        </div>
        <div className="landing-integration-row">
          <article>
            <span className="landing-integration-logos" aria-hidden="true">
              <LandingToolLogo name="stripe" />
              <LandingToolLogo name="paypal" />
              <LandingToolLogo name="paystack" />
            </span>
            <div>
              <small>GET PAID</small>
              <h3>Stripe · PayPal · Paystack</h3>
              <p>Give every client a practical way to pay.</p>
            </div>
            <Icon name="arrow-up-right" size={17} />
          </article>
          <article>
            <span className="landing-process-logos" aria-hidden="true">
              <span><Icon name="activity" size={17} /></span>
              <span><Icon name="check-circle" size={17} /></span>
              <span><Icon name="wallet" size={17} /></span>
            </span>
            <div>
              <small>USEFUL AUTOMATION</small>
              <h3>Workflows · Approvals · Invoices</h3>
              <p>Move routine work forward while every important decision stays yours.</p>
            </div>
            <Icon name="arrow-up-right" size={17} />
          </article>
          <article>
            <span className="landing-integration-logos" aria-hidden="true">
              <LandingToolLogo name="gmail" />
              <LandingToolLogo name="calendar" />
              <LandingToolLogo name="drive" />
              <LandingToolLogo name="slack" />
              <LandingToolLogo name="zoom" />
            </span>
            <div>
              <small>YOUR EVERYDAY TOOLS</small>
              <h3>Gmail · Calendar · Drive · Slack · Zoom</h3>
              <p>Bring communication, meetings, schedules, and files into the same flow.</p>
            </div>
            <Icon name="arrow-up-right" size={17} />
          </article>
        </div>
      </section>

      <section className="landing-security" id="security">
        <div className="landing-security__mark">
          <Icon name="briefcase" size={29} />
        </div>
        <div>
          <span className="landing-eyebrow">Built around real business</span>
          <h2>Your business. Your way.</h2>
          <p>
            Set up the way you like to work, keep every client moving, and always know
            what needs your attention next.
          </p>
        </div>
        <div className="landing-security__points">
          <span>
            <Icon name="check" size={13} /> Your work stays organised
          </span>
          <span>
            <Icon name="check" size={13} /> You choose what connects
          </span>
          <span>
            <Icon name="check" size={13} /> Important steps need your say
          </span>
          <span>
            <Icon name="check" size={13} /> Clear progress at a glance
          </span>
        </div>
      </section>

      <section className="landing-cta">
        <BrandMark />
        <span className="landing-eyebrow">A lighter way to run your business</span>
        <h2>Carry the whole studio. Not the whole workload.</h2>
        <button className="button button--primary btn-shine" onClick={handleSignUp}>
          Sign Up <BrandMark compact />
        </button>
      </section>

      <footer className="landing-footer">
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
          if (active) setRegistrationEnabled(config.registrationEnabled)
        })
        .catch(() => undefined)
    }
    return () => {
      active = false
    }
  }, [invitationToken])

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
            {mode === 'login' && SIGNUPS_PAUSED ? (
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
  collapsed,
  onNavigate,
  onClose,
  onSignOut,
  projectCount,
  automationCount,
  connectionCount,
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
  projectCount: number
  automationCount: number
  connectionCount: number
  pendingInvoiceCount: number
  enabledModules: string[] | null
}) {
  const workspaceInitials = user.workspace
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
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
      <aside className={`sidebar${mobileOpen ? ' is-open' : ''}${collapsed ? ' is-collapsed' : ''}`}>
        <div className="sidebar__logo">
          <BrandMark />
          <span>lancee</span>
          <button className="sidebar-close" onClick={onClose} aria-label="Close navigation">
            <Icon name="close" />
          </button>
        </div>

        <div className="workspace-switcher">
          <span className="workspace-avatar">{workspaceInitials}</span>
          <span>
            <strong>{user.workspace}</strong>
            <small>{user.role === 'owner' ? 'Workspace owner' : 'Collaborator'}</small>
          </span>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {['Your work', 'Business', 'Platform'].map((section) => (
            <div className="nav-group" key={section}>
              <span className="nav-label">{section}</span>
              {navItems
                .filter((item) => item.section === section)
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
          <div className="usage-card">
            <div>
              <span>Workspace at a glance</span>
              <strong>{projectCount} project{projectCount === 1 ? '' : 's'}</strong>
            </div>
            <div className="usage-bar">
              <span />
            </div>
            <p>{automationCount} automations · {connectionCount} connections</p>
            <button onClick={() => onNavigate('analytics')}>View analytics</button>
          </div>
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
      return pageIds.has(page as Page) ? (page as Page) : null
    } catch {
      return null
    }
  }

  const legacyPage = new URLSearchParams(window.location.search).get('page')
  return legacyPage && pageIds.has(legacyPage as Page) ? (legacyPage as Page) : null
}

function dashboardPath(page: Page) {
  return page === 'overview' ? '/dashboard' : `/dashboard/${page}`
}

function publicPricingPage() {
  return window.location.pathname.replace(/\/+$/, '') === '/pricing'
}

function publicReviewRequest() {
  const match = window.location.pathname.match(/^\/review\/([^/]+)\/?$/)
  if (!match) return null
  const token = new URLSearchParams(window.location.search).get('token') || ''
  return token ? { reviewId: decodeURIComponent(match[1]), token } : null
}

function App() {
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
  const [activePage, setActivePage] = useState<Page>(
    () => dashboardPageFromLocation() ?? 'overview',
  )
  const [automations, setAutomations] = useState<Automation[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [workspaceNotifications, setWorkspaceNotifications] = useState<WorkspaceNotification[]>([])
  const [workProjectId, setWorkProjectId] = useState('')
  const [messageFocus, setMessageFocus] = useState<{ folder: string; uid: number } | null>(null)
  const [integrations, setIntegrations] = useState<Integration[]>([])
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
  const [prompt, setPrompt] = useState('')
  const [selectedAutomation, setSelectedAutomation] = useState('')
  const [dispatching, setDispatching] = useState(false)
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
  const [settingsSection, setSettingsSection] =
    useState<'profile' | 'general' | 'dev'>('general')

  const navigatePage = (nextPage: Page, replace = false) => {
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

  const visibleNotifications = workspaceNotifications
  const unreadNotifications = visibleNotifications.filter((notification) => !notification.readAt)

  const openClientProject = (projectId: string) => {
    setWorkProjectId(projectId)
    navigatePage('work')
  }

  const openClientMessage = (target: { folder: string; uid: number }) => {
    setMessageFocus(target)
    navigatePage('messages')
  }

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed))
    } catch {
      // Storage can be unavailable in hardened or private browser contexts.
    }
  }, [sidebarCollapsed])

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
      const requestedPage = dashboardPageFromLocation()
      if (requestedPage) setActivePage(requestedPage)
      setMobileOpen(false)
      setNotificationsOpen(false)
      setProfileOpen(false)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!user || deviceUserCode) return

    const requestedPage = dashboardPageFromLocation() ?? activePage
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
    setSelectedAutomation('')
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
          setSelectedAutomation((current) => current || loadedAutomations[0]?.id || '')

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
          setSelectedAutomation((current) => current || automationData[0]?.id || '')
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
    const method = replace ? 'replaceState' : 'pushState'
    window.history[method]({}, '', authPath(view))
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
      const pollRun = (attempt: number) => {
        if (attempt >= 8) return
        window.setTimeout(() => {
          void api.runs
            .get(run.id)
            .then((updated) => {
              setRuns((current) =>
                current.map((item) => (item.id === updated.id ? updated : item)),
              )
              if (updated.status === 'running') {
                pollRun(attempt + 1)
              } else {
                setToast(
                  `${updated.automationName} ${updated.status}${
                    updated.errorCode ? ` · ${updated.errorCode}` : ''
                  }`,
                )
              }
            })
            .catch(() => undefined)
        }, 750)
      }
      pollRun(0)
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to start automation.')
    } finally {
      setDispatching(false)
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
      setSelectedAutomation(workflow.id)
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
      setSelectedAutomation((current) =>
        current === automation.id ? (remaining[0]?.id || '') : current,
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

  const runAutomation = (automation: Automation) => {
    setSelectedAutomation(automation.id)
    setPrompt(`Run ${automation.name} with its default workflow`)
    navigatePage('overview')
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
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : 'Unable to update this connection.',
      )
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

  const toggleGoogleDrive = async (integration: Integration) => {
    setBusyId(integration.id)
    try {
      if (integration.connected) {
        await api.googleDrive.disconnect()
        setIntegrations((current) =>
          current.map((item) =>
            item.id === integration.id ? { ...item, connected: false } : item,
          ),
        )
        setToast('Google Drive disconnected')
        setBusyId(null)
        return
      }
      const authorizationUrl = await api.googleDrive.getAuthUrl()
      window.location.assign(authorizationUrl)
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : 'Unable to update Google Drive.',
      )
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
    if (publicPricingPage()) {
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
            setAuthView(authViewFromLocation())
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
        initialMode={authView === 'register' && SIGNUPS_PAUSED ? 'login' : authView}
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
          <OverviewPage
            user={user}
            automations={automations}
            runs={runs}
            workspaceContext={workspaceContext}
            prompt={prompt}
            selectedAutomation={selectedAutomation}
            busy={dispatching}
            analytics={analytics}
            onPromptChange={setPrompt}
            onAutomationChange={setSelectedAutomation}
            onDispatch={dispatch}
            onNavigate={navigatePage}
            onCreateProject={() => navigatePage('work')}
          />
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
          />
        )
        break
      case 'workflows':
        page = (
          <Suspense fallback={<EmptySkeleton />}>
            <WorkflowsPage
              onUseTemplate={useWorkflowTemplate}
              busyTemplateId={busyId?.startsWith('template:') ? busyId.slice('template:'.length) : null}
            />
          </Suspense>
        )
        break
      case 'storefront':
        page = (
          <Suspense fallback={<EmptySkeleton />}>
            <StorefrontPage workspaceId={user.workspaceId} />
          </Suspense>
        )
        break
      case 'runs':
        page = <RunsPage runs={runs} />
        break
      case 'integrations':
        page = (
          <IntegrationsPage
            integrations={integrations}
            connectionRequests={connectionRequests}
            busyId={busyId}
            onToggle={toggleIntegration}
            onConfigureN8n={() => setModal('n8n')}
            onConfigureMcp={() => setModal('mcp')}
            onConfigureCodex={() => setModal('codex-ai')}
            onConfigureCodexRuntime={() => setModal('codex-runtime')}
            onConfigurePaystack={() => setModal('paystack')}
            onConfigureMail={() => navigatePage('messages')}
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
            onToggleGoogleDrive={(integration) => void toggleGoogleDrive(integration)}
            onOpenStorageSetup={(provider) => {
              setStorageSetupProvider(provider)
              navigatePage('files')
              setToast(`${provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} storage point setup is ready.`)
            }}
            onRequestConnection={() => setModal('integration-request')}
            onToast={setToast}
          />
        )
        break
      case 'services':
        page = (
          <Suspense fallback={<EmptySkeleton />}>
            <ServicesPage
              connection={mcpConnection}
              services={mcpServices}
              onSync={async () => {
                const result = await api.mcp.sync()
                setMcpConnection(result.connection)
                setMcpServices(result.services)
                setToast('Local Lancee tools refreshed.')
              }}
              onInvoke={async (service, toolId, args) => api.mcp.invoke(service.id, toolId, args)}
              onToast={setToast}
            />
          </Suspense>
        )
        break
      case 'money':
        page = (
          <Suspense fallback={<EmptySkeleton />}>
            <MoneyPage />
          </Suspense>
        )
        break
      case 'analytics':
        page = (
          <Suspense fallback={<EmptySkeleton />}>
            <AnalyticsPage onOpenFiles={() => navigatePage('files')} />
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
            />
          </Suspense>
        )
        break
      case 'team':
        page = (
          <Suspense fallback={<EmptySkeleton />}>
            <TeamPage canInvite={user.role === 'owner'} />
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
            onSignOut={() => void signOut()}
            initialSection={settingsSection}
          />
        )
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
        projectCount={analytics?.openProjects ?? 0}
        automationCount={automations.length}
        connectionCount={integrations.filter((integration) => integration.connected).length}
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
            <button
              className="icon-button theme-toggle"
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={() => setTheme(toggleTheme())}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
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
                      <button type="button" onClick={() => setNotificationsOpen(false)}>Close</button>
                    </div>
                  </div>
                  {visibleNotifications.slice(0, 20).map((notification) => (
                    <button
                      key={notification.id}
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
                    setSettingsSection('profile')
                    navigatePage('settings')
                    setProfileOpen(false)
                  }}>
                    <Icon name="user" size={16} /><span><strong>Profile</strong><small>Personal details and account</small></span>
                  </button>
                  <button onClick={() => {
                    setSettingsSection('general')
                    navigatePage('settings')
                    setProfileOpen(false)
                  }}>
                    <Icon name="settings" size={16} /><span><strong>Settings</strong><small>Workspace preferences</small></span>
                  </button>
                  <button onClick={() => {
                    setSettingsSection('dev')
                    navigatePage('settings')
                    setProfileOpen(false)
                  }}>
                    <Icon name="code" size={16} /><span><strong>Dev Tools</strong><small>Database, API keys, and logs</small></span>
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
      {modal === 'paystack' && paystackConnection && (
        <Modal
          title="Connect Paystack"
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
        onClose={() => setCommandOpen(false)}
        onNavigate={navigatePage}
        onCreateAutomation={() => setModal('automation')}
      />
      <Suspense fallback={null}><WorkspaceChat /></Suspense>
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
