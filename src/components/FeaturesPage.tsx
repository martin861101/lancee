import { useEffect, useState } from 'react'
import { BUSINESS_IDENTITY } from '../lib/business'

type FeatureIconName =
  | 'briefcase'
  | 'grid'
  | 'lightbulb'
  | 'file'
  | 'user'
  | 'wallet'
  | 'check-circle'
  | 'activity'
  | 'sparkles'
  | 'plug'
  | 'store'
  | 'bot'
  | 'code'
  | 'layers'
  | 'messages'
  | 'bell'
  | 'target'
  | 'shield'
  | 'key'
  | 'moon'
  | 'alert'
  | 'close'
  | 'arrow-right'
  | 'arrow-up-right'

function FeatureIcon({
  name,
  size = 18,
}: {
  name: FeatureIconName
  size?: number
}) {
  const paths: Record<FeatureIconName, React.ReactNode> = {
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    lightbulb: (
      <>
        <path d="M9 18h6M10 22h4M8.7 15.3A7 7 0 1 1 15.3 15.3C14.5 16 14 17 14 18h-4c0-1-.5-2-1.3-2.7Z" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M8 13h8M8 17h6" />
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
    'check-circle': (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16.5 9" />
      </>
    ),
    activity: (
      <>
        <path d="M3 12h4l2.2-7 4.3 14 2.2-7H21" />
      </>
    ),
    sparkles: (
      <>
        <path d="m12 3-1.2 3.3L7.5 7.5l3.3 1.2L12 12l1.2-3.3 3.3-1.2-3.3-1.2L12 3Z" />
        <path d="m5 13-.8 2.2L2 16l2.2.8L5 19l.8-2.2L8 16l-2.2-.8L5 13ZM19 13l-.6 1.4L17 15l1.4.6L19 17l.6-1.4L21 15l-1.4-.6L19 13Z" />
      </>
    ),
    plug: (
      <>
        <path d="m12 22 1-5-5-1 8-8 4 4-8 8" />
        <path d="m15 5 4 4M17 3l4 4M8 16l-5 5" />
      </>
    ),
    store: (
      <>
        <path d="M4 9 5 3h14l1 6M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M4 9h16M9 9v1a3 3 0 0 0 6 0V9" />
      </>
    ),
    bot: (
      <>
        <rect x="4" y="7" width="16" height="13" rx="3" />
        <path d="M12 3v4M8 12h.01M16 12h.01M9 16h6" />
      </>
    ),
    code: <path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" />,
    layers: (
      <>
        <path d="m12 2 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
      </>
    ),
    messages: (
      <>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    key: (
      <>
        <circle cx="8" cy="15" r="4" />
        <path d="m11 12 9-9M15 8l3 3M17 6l2 2" />
      </>
    ),
    moon: (
      <>
        <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
      </>
    ),
    alert: (
      <>
        <path d="M10.3 3.5 2.6 17a2 2 0 0 0 1.8 3h15.2a2 2 0 0 0 1.8-3L13.7 3.5a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    'arrow-right': <path d="M5 12h14m-5-5 5 5-5 5" />,
    'arrow-up-right': <path d="M7 17 17 7M8 7h9v9" />,
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

type FeatureCard = {
  icon: FeatureIconName
  title: string
  description: string
  tags: string[]
}

type FeatureGroup = {
  id: string
  number: string
  icon: FeatureIconName
  title: string
  description: string
  accent: string
  features: FeatureCard[]
}

const groups: FeatureGroup[] = [
  {
    id: 'workspace',
    number: '01',
    icon: 'grid',
    title: 'Workspace & organisation',
    description:
      'One calm place for the everyday surface of your business — from a focused overview to every project, client, and document.',
    accent: '#6d61ca',
    features: [
      {
        icon: 'briefcase',
        title: 'Overview dashboard',
        description:
          'Open projects, due dates, outstanding invoices, recent activity, and one quick-task entry point.',
        tags: ['Analytics', 'Quick actions', 'Command palette'],
      },
      {
        icon: 'user',
        title: 'Client directory',
        description:
          'Searchable client directory with contact details, status controls, project counts, and focused client workspaces.',
        tags: ['Search', 'Archiving', 'Project counts'],
      },
      {
        icon: 'grid',
        title: 'Kanban project workspaces',
        description:
          'Drag-and-drop project boards with status lanes, custom buckets, progress, deadlines, owners, and attachments.',
        tags: ['Board', 'Details', 'Files', 'Links'],
      },
      {
        icon: 'lightbulb',
        title: 'Ideas canvas',
        description:
          'A full Excalidraw workspace for drawing, notes, shapes, images, and reusable libraries that restores offline.',
        tags: ['Excalidraw', 'Offline', 'Export', 'PDF to Files'],
      },
      {
        icon: 'file',
        title: 'Files & document library',
        description:
          'Upload, edit, and sync documents to Google Drive — or keep them local — with a searchable workspace library.',
        tags: ['Upload', 'In-app editing', 'Drive sync'],
      },
      {
        icon: 'layers',
        title: 'Team & roles',
        description:
          'Invite collaborators with owner, collaborator, or viewer roles and keep a clear picture of who does what.',
        tags: ['Invitations', 'Roles', 'Membership'],
      },
    ],
  },
  {
    id: 'money',
    number: '02',
    icon: 'wallet',
    title: 'Money & payments',
    description:
      'Durable invoices, hosted payment links, and verified payments — from brief to paid without the back-and-forth.',
    accent: '#2e9b6f',
    features: [
      {
        icon: 'wallet',
        title: 'ZAR invoices',
        description:
          'Durable invoices with client, project, line items, custom fields, and due dates, tracked through every state.',
        tags: ['Drafts', 'Custom fields', 'Due dates'],
      },
      {
        icon: 'check-circle',
        title: 'Paystack payment links',
        description:
          'One click creates a hosted Paystack payment link with a verified, duplicate-safe webhook reconciliation.',
        tags: ['HMAC verified', 'Webhooks', 'Test & live'],
      },
      {
        icon: 'target',
        title: 'Approval-to-invoice flow',
        description:
          'Client approval moves a draft invoice to ready-for-review, then to sent, right inside the project workspace.',
        tags: ['Draft invoices', 'Client approval', 'Status tracking'],
      },
      {
        icon: 'activity',
        title: 'Money analytics',
        description:
          'Paid totals, outstanding amounts, and upcoming invoices at a glance from the dashboard and Money page.',
        tags: ['Outstanding', 'Paid total', 'Upcoming'],
      },
    ],
  },
  {
    id: 'automations',
    number: '03',
    icon: 'activity',
    title: 'Automations & workflows',
    description:
      'Plain-language routines for the repeatable parts of your work — with real execution logs, not simulated status.',
    accent: '#d4613f',
    features: [
      {
        icon: 'activity',
        title: 'Core automations',
        description:
          'Native automations that run in-process with permission-checked tools, durable runs, and a Redis queue.',
        tags: ['workspace.summary', 'projects.list', 'invoices.list'],
      },
      {
        icon: 'plug',
        title: 'Edge (n8n) automations',
        description:
          'Connect your own n8n workflows with signed webhook deliveries and verified callbacks in both directions.',
        tags: ['Signed webhooks', 'Retry lineage', 'Delivery ledger'],
      },
      {
        icon: 'layers',
        title: 'Runs & results',
        description:
          'A dedicated Results screen with outcome cards, full execution logs, and per-step data for every run.',
        tags: ['Run events', 'Outcome cards', 'Logs'],
      },
      {
        icon: 'sparkles',
        title: 'Workflow templates',
        description:
          'Recipe cards that create active, persisted automations in one click — no setup required.',
        tags: ['Recipes', 'Instant activation'],
      },
      {
        icon: 'messages',
        title: 'Mail-triggered rules',
        description:
          'Dispatch automations from incoming mail by sender, recipient, subject, or body keywords with all/any logic.',
        tags: ['Sender', 'Subject', 'Keywords'],
      },
    ],
  },
  {
    id: 'connections',
    number: '04',
    icon: 'plug',
    title: 'Connections & integrations',
    description:
      'Connect the tools you already use — and leave everything else out. Real connections, honestly shown.',
    accent: '#2d7fc0',
    features: [
      {
        icon: 'file',
        title: 'Google Drive',
        description:
          'Independent OAuth with Google Picker, a folder tree, document editing, and links to clients and projects.',
        tags: ['OAuth', 'Picker', 'In-app editing'],
      },
      {
        icon: 'plug',
        title: 'n8n',
        description:
          'A durable webhook integration with encrypted secrets, test panel, delivery history, and retry support.',
        tags: ['Signed GET/POST', 'Nonces', 'Correlation IDs'],
      },
      {
        icon: 'store',
        title: 'Storefront',
        description:
          'An optional client storefront in five styles — preview, play/pause, and guided custom-domain setup.',
        tags: ['5 styles', 'DNS verification', 'Preview video'],
      },
      {
        icon: 'layers',
        title: 'MCP gateway & services',
        description:
          'A built-in MCP catalog with the nine Lancee tools plus activatable external services, all approval-gated.',
        tags: ['Lancee tools', 'Bearer grants', 'Audited invocations'],
      },
      {
        icon: 'grid',
        title: 'Integration catalog',
        description:
          'Browse communication, storage, design, automation, and payment connections with honest status toggles.',
        tags: ['Payments', 'Storage', 'Automation'],
      },
    ],
  },
  {
    id: 'ai',
    number: '05',
    icon: 'bot',
    title: 'AI integration',
    description:
      'Helpful intelligence that stays optional — a workspace assistant with typed tools that approves every action before it runs.',
    accent: '#c25bd6',
    features: [
      {
        icon: 'sparkles',
        title: 'Workspace AI assistant',
        description:
          'A floating assistant with workspace-scoped data tools that proposes actions and always asks before running.',
        tags: ['Approve & run', 'Typed tools', 'No SQL in browser'],
      },
      {
        icon: 'file',
        title: 'PDF Studio',
        description:
          'Generate styled, branded PDF documents from a simple form — theme, accent, footer, and page format.',
        tags: ['Themes', 'A4', 'Accent colours'],
      },
    ],
  },
  {
    id: 'review',
    number: '06',
    icon: 'target',
    title: 'Review & collaboration',
    description:
      'Close the loop with clients through tokenized review links, annotated feedback, and clear approval states.',
    accent: '#b8862e',
    features: [
      {
        icon: 'messages',
        title: 'Client review links',
        description:
          'Send a signed, expiring review URL and email only the link — artwork is revealed only with the token.',
        tags: ['Expiring tokens', 'Email delivery', 'Private'],
      },
      {
        icon: 'target',
        title: 'Artwork annotations',
        description:
          'Clients mark rectangles and polygons on artwork with comments, priority, and category for structured feedback.',
        tags: ['Annotorious', 'Priority', 'Category'],
      },
      {
        icon: 'check-circle',
        title: 'Designer review panel',
        description:
          'Filter annotations by priority, category, and status, then mark each open, in progress, resolved, or rejected.',
        tags: ['Filters', 'Statuses', 'Threads'],
      },
      {
        icon: 'bell',
        title: 'Workspace notifications',
        description:
          'Approval notifications surface the moment clients respond, with read/unread tracking in the dashboard.',
        tags: ['Approvals', 'Unread badges'],
      },
    ],
  },
  {
    id: 'platform',
    number: '07',
    icon: 'shield',
    title: 'Security & platform',
    description:
      'A trustworthy foundation: encrypted secrets, server sessions, installable offline support, and durable audit trails.',
    accent: '#4f6b37',
    features: [
      {
        icon: 'shield',
        title: 'Server-side security',
        description:
          'scrypt-hashed passwords, signed HttpOnly session cookies, origin validation, and rate-limited login.',
        tags: ['Sessions', 'Rate limits', 'Origin checks'],
      },
      {
        icon: 'key',
        title: 'Encrypted secrets & API keys',
        description:
          'Provider credentials AES-256-GCM encrypted at rest, plus scoped API keys with workspace and MCP permissions.',
        tags: ['AES-256-GCM', 'API keys', 'Scopes'],
      },
      {
        icon: 'moon',
        title: 'PWA & offline ideas',
        description:
          'Installable as a PWA with a cached app shell, while high-impact mutations and payments stay online-only.',
        tags: ['Service worker', 'Offline canvas', 'Online-only actions'],
      },
      {
        icon: 'layers',
        title: 'Durable backend',
        description:
          'A real Express API on PostgreSQL (SQLite fallback) with Redis queues, health checks, and durable audit trails.',
        tags: ['PostgreSQL', 'Redis', 'Express'],
      },
    ],
  },
]

const quickLinks = groups.map((group) => ({
  id: group.id,
  number: group.number,
  title: group.title,
  icon: group.icon,
}))

export default function FeaturesPage({
  onBack,
  onSignIn,
  onSignUp,
  signupsPaused = false,
}: {
  onBack: () => void
  onSignIn: () => void
  onSignUp: () => void
  signupsPaused?: boolean
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [signupNotice, setSignupNotice] = useState(false)

  useEffect(() => {
    if (!signupNotice) return
    const timeout = window.setTimeout(() => setSignupNotice(false), 4200)
    return () => window.clearTimeout(timeout)
  }, [signupNotice])

  const handleSignUp = () => {
    if (signupsPaused) {
      setSignupNotice(true)
      return
    }
    onSignUp()
  }

  const scrollToGroup = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    setActiveId(id)
    document.querySelector(`#feature-group-${id}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  return (
    <main className="landing features-page">
      <header className="features-nav">
        <a className="landing-brand" href="#" onClick={(e) => { e.preventDefault(); onBack() }}>
          <span className="brand-mark brand-mark--compact">
            <img src="/img/icon.png" alt="" />
          </span>
          <span>lancee</span>
        </a>
        <nav aria-label="Public navigation">
          <a href="#" onClick={(e) => { e.preventDefault(); onBack() }}>Home</a>
        </nav>
        <div>
          <button className="landing-sign-in" onClick={onSignIn}>
            Sign in
          </button>
          <button className="button button--primary btn-shine" onClick={handleSignUp}>
            Sign Up
          </button>
        </div>
      </header>

      <section className="features-hero">
        <div className="features-hero__glow" aria-hidden="true" />
        <span className="landing-eyebrow">
          <i /> Every included feature
        </span>
        <h1>
          Everything lancee does,
          <br />
          <em>in one calm place.</em>
        </h1>
        <p>
          Clients, projects, ideas, files, mail, storefronts, automations,
          invoices, payments, and intelligent tools — a complete operating
          workspace for independent work. Here is every feature, organised.
        </p>
        <div className="features-hero__actions">
          <button className="button button--primary" onClick={handleSignUp}>
            Start your workspace <FeatureIcon name="arrow-right" size={15} />
          </button>
          <a href="#feature-group-workspace" onClick={(e) => scrollToGroup(e, 'workspace')}>
            Browse the catalog <FeatureIcon name="arrow-up-right" size={14} />
          </a>
        </div>
        <div className="features-hero__stats">
          <span><strong>30+</strong> product areas</span>
          <span><strong>5</strong> storefront styles</span>
          <span><strong>9</strong> built-in Lancee tools</span>
          <span><strong>60s</strong> mail sync</span>
        </div>
      </section>

      <nav className="features-index" aria-label="Feature categories">
        {quickLinks.map((link) => (
          <a
            key={link.id}
            href={`#feature-group-${link.id}`}
            onClick={(e) => scrollToGroup(e, link.id)}
            className={activeId === link.id ? 'is-active' : ''}
          >
            <span className="features-index__icon">
              <FeatureIcon name={link.icon} size={14} />
            </span>
            <span>{link.number}</span>
            {link.title}
          </a>
        ))}
      </nav>

      {groups.map((group) => (
        <section
          key={group.id}
          id={`feature-group-${group.id}`}
          className="features-group"
        >
          <div className="features-group__heading">
            <span
              className="features-group__icon"
              style={{ color: group.accent, borderColor: `${group.accent}55`, background: `${group.accent}12` }}
            >
              <FeatureIcon name={group.icon} size={20} />
            </span>
            <span className="landing-eyebrow">
              <i /> {group.number} — {group.title}
            </span>
            <h2>{group.title}</h2>
            <p>{group.description}</p>
          </div>
          <div className="features-card-grid">
            {group.features.map((feature) => (
              <article key={feature.title} className="features-card">
                <span
                  className="features-card__icon"
                  style={{ color: group.accent, borderColor: `${group.accent}55`, background: `${group.accent}12` }}
                >
                  <FeatureIcon name={feature.icon} size={18} />
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                <div className="features-card__tags">
                  {feature.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <section className="features-cta">
        <span className="landing-eyebrow">A lighter way to run your business</span>
        <h2>Carry the whole studio. Not the whole workload.</h2>
        <div className="features-cta__actions">
          <button className="button button--primary btn-shine" onClick={handleSignUp}>
            Sign Up
          </button>
          <button className="features-cta__back" onClick={onBack}>
            Back to home
          </button>
        </div>
      </section>

      <footer className="landing-footer features-footer">
        <small>© {new Date().getFullYear()} {BUSINESS_IDENTITY.platformName} All Rights Reserved</small>
        <small>{BUSINESS_IDENTITY.platformLegalStyle}</small>
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
            <FeatureIcon name="alert" size={15} />
          </span>
          <div>
            <strong>Sign-ups are temporarily paused</strong>
            <p>New accounts are on hold for now. Existing members can still sign in.</p>
          </div>
          <button onClick={() => setSignupNotice(false)} aria-label="Dismiss">
            <FeatureIcon name="close" size={14} />
          </button>
        </div>
      )}
    </main>
  )
}
