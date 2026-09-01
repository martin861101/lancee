import { useEffect, useMemo, useState } from 'react'
import {
  api,
  type Run,
  type User,
  type WorkspaceContext,
  type WorkspaceNotification,
  type WorkspacePulse,
  type WorkspacePulseItem,
  type WorkspacePulseMood,
} from '../lib/api'
import Icon, { type IconName } from './AppIcon'
import BrandMark from './BrandMark'

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

function weatherBackgroundAsset(weather: WorkspaceContext['weather'] | null, mood: WorkspacePulseMood): string | null {
  if (!weather) return null
  const code = weather.weatherCode
  const isDay = weather.isDay
  if (!isDay) {
    if (code === 0) return '/img/clear-night.png'
    if (code === 3) return '/img/overcast-night.png'
    if (code === 2 || code === 1) return '/img/cloudy-night.png'
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return '/img/cloudy-night.png'
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return '/img/overcast-night.png'
    return mood === 'clear-night' ? '/img/clear-night.png' : '/img/cloudy-night.png'
  }
  if (code === 0) return '/img/clear.png'
  if (code === 3) return '/img/overcast.png'
  if (mood === 'sunny') return '/img/sunny.png'
  if (mood === 'cloudy') return '/img/cloudy.png'
  if (mood === 'rainy' || mood === 'stormy') return '/img/rainy.png'
  if (mood === 'snowy') return '/img/overcast.png'
  if (code === 1) return '/img/sunny.png'
  if (code === 2) return '/img/cloudy.png'
  return '/img/clear.png'
}

function overviewLocationLabel(location: WorkspaceContext['location']) {
  if (!location) return 'Location unavailable'
  return [location.city, location.country].filter(Boolean).join(', ') || 'Local conditions'
}

function workspacePulseMood(weather: WorkspaceContext['weather']): WorkspacePulseMood {
  if (!weather) return 'steady'
  const code = weather.weatherCode
  if (!weather.isDay) return code <= 1 ? 'clear-night' : 'cloudy-night'
  if (code <= 1) return 'sunny'
  if (code === 2 || code === 3 || code === 45 || code === 48) return 'cloudy'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rainy'
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snowy'
  if (code >= 95) return 'stormy'
  return 'cloudy'
}

function localWorkspacePulse({
  user,
  workspaceContext,
  analytics,
  runs,
  notifications,
  generatedAt,
}: {
  user: User
  workspaceContext: WorkspaceContext | null
  analytics: {
    openProjects: number; dueSoonProjects: number; totalClients: number
    outstandingAmount: number; pendingInvoices: number; dueThisWeek: number
  } | null
  runs: Run[]
  notifications: WorkspaceNotification[]
  generatedAt: string
}): WorkspacePulse {
  const firstName = user.name.split(' ')[0] || 'there'
  const mood = workspacePulseMood(workspaceContext?.weather || null)
  const failedRun = runs.find((run) => run.status === 'failed')
  const alert = notifications.find((notification) =>
    !notification.readAt && /warning|alert|decision|failed|overdue/i.test(`${notification.kind} ${notification.title}`),
  )
  const needsAttention = (analytics?.pendingInvoices || 0) + (failedRun ? 1 : 0) + (alert ? 1 : 0)
  const headline = needsAttention > 0
    ? `A few things need your eye, ${firstName}.`
    : mood === 'rainy' || mood === 'stormy'
      ? `A good day for focused progress, ${firstName}.`
      : mood === 'clear-night' || mood === 'cloudy-night'
        ? `A calm evening to close the loop, ${firstName}.`
        : mood === 'sunny'
          ? `A clear day to move work forward, ${firstName}.`
          : `Your workspace is ready, ${firstName}.`
  const facts: string[] = []
  if ((analytics?.openProjects || 0) > 0) facts.push(`${analytics!.openProjects} active project${analytics!.openProjects === 1 ? '' : 's'}`)
  if ((analytics?.dueThisWeek || 0) > 0) facts.push(`${analytics!.dueThisWeek} due this week`)
  if ((analytics?.pendingInvoices || 0) > 0) facts.push(`${analytics!.pendingInvoices} invoice${analytics!.pendingInvoices === 1 ? '' : 's'} awaiting payment`)
  const items: WorkspacePulseItem[] = []
  if ((analytics?.dueThisWeek || 0) > 0) {
    items.push({
      id: 'local-due-this-week',
      title: `${analytics!.dueThisWeek} project${analytics!.dueThisWeek === 1 ? '' : 's'} due this week`,
      detail: 'Review milestones and client handoffs',
      kind: 'deadline',
      target: 'work',
    })
  }
  if ((analytics?.pendingInvoices || 0) > 0) {
    items.push({
      id: 'local-pending-invoices',
      title: `${analytics!.pendingInvoices} invoice${analytics!.pendingInvoices === 1 ? '' : 's'} awaiting payment`,
      detail: 'Open invoicing to review follow-ups',
      kind: 'money',
      target: 'money',
    })
  }
  if (alert) {
    items.push({
      id: `local-alert-${alert.id}`,
      title: alert.title,
      detail: alert.body || 'Needs your attention',
      kind: 'attention',
      target: alert.entityType === 'project' ? 'work' : alert.entityType === 'invoice' ? 'money' : 'intelligence',
    })
  } else if (failedRun) {
    items.push({
      id: `local-run-${failedRun.id}`,
      title: failedRun.automationName || 'Automation needs attention',
      detail: 'The latest run did not complete',
      kind: 'attention',
      target: 'automations',
    })
  }
  if (items.length === 0) {
    items.push({
      id: 'local-clear',
      title: 'Nothing urgent is waiting',
      detail: 'Your workspace is clear for focused work',
      kind: 'clear',
      target: 'work',
    })
  }
  return {
    headline,
    message: facts.length > 0
      ? `Today’s view: ${facts.slice(0, 3).join(', ')}. Start with the item that creates the most breathing room.`
      : 'Nothing urgent is crowding the day. Choose one meaningful next step and give it your full attention.',
    mood,
    generatedAt,
    source: 'fallback',
    items: items.slice(0, 4),
    refreshPending: false,
  }
}

function workspacePulseItemIcon(kind: WorkspacePulseItem['kind']): IconName {
  if (kind === 'deadline') return 'calendar'
  if (kind === 'money') return 'wallet'
  if (kind === 'attention') return 'alert'
  if (kind === 'activity') return 'activity'
  if (kind === 'task') return 'briefcase'
  return 'check-circle'
}

export interface OverviewPageProps {
  user: User
  runs: Run[]
  notifications: WorkspaceNotification[]
  workspaceContext: WorkspaceContext | null
  analytics: {
    openProjects: number; dueSoonProjects: number; totalClients: number
    outstandingAmount: number; pendingInvoices: number; dueThisWeek: number
  } | null
  onNavigate: (page: WorkspacePulseItem['target'] | 'clients') => void
  onCreateProject: () => void
}

export default function OverviewPage(props: OverviewPageProps) {
  const {
    user,
    runs,
    notifications,
    workspaceContext,
    analytics,
    onNavigate,
    onCreateProject,
  } = props
  const [now, setNow] = useState(() => new Date())
  const [remotePulse, setRemotePulse] = useState<WorkspacePulse | null>(null)
  const [fallbackGeneratedAt] = useState(() => new Date().toISOString())
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
  const firstName = user.name.split(' ')[0] || 'there'
  const runningAutomations = runs.filter((run) => run.status === 'running').length
  const fallbackPulse = useMemo(() => localWorkspacePulse({
    user,
    workspaceContext,
    analytics,
    runs,
    notifications,
    generatedAt: fallbackGeneratedAt,
  }), [user, workspaceContext, analytics, runs, notifications, fallbackGeneratedAt])
  const pulse = remotePulse || fallbackPulse

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1_000)
    return () => window.clearInterval(clock)
  }, [])

  useEffect(() => {
    let active = true
    let retry: number | undefined
    let attempts = 0
    setRemotePulse(null)
    const load = () => {
      attempts += 1
      void api.workspace.getPulse().then((nextPulse) => {
        if (!active) return
        setRemotePulse(nextPulse)
        if (nextPulse.source === 'fallback' && nextPulse.refreshPending && attempts < 3) {
          retry = window.setTimeout(load, 1_800)
        }
      }).catch(() => undefined)
    }
    load()
    return () => {
      active = false
      if (retry) window.clearTimeout(retry)
    }
  }, [user.workspaceId])

  const weatherAsset = weatherBackgroundAsset(weather ?? null, pulse.mood)

  return (
    <div
      className="page page--overview"
      data-has-weather={weatherAsset ? 'true' : 'false'}
      style={weatherAsset ? ({ '--overview-weather-image': `url(${weatherAsset})` } as React.CSSProperties) : undefined}
    >
      <div
        className="overview-scene"
        data-mood={pulse.mood}
      >
        <section className="overview-welcome" aria-labelledby="workspace-pulse-title">
          <span className="overview-welcome__eyebrow">Welcome back</span>
          <h1 id="workspace-pulse-title">{firstName} <span aria-hidden="true">👋</span></h1>
          <div className="overview-welcome__weather-line">
            {weather ? `${weatherInfo.label} today.` : `${greeting}, your workspace is ready.`}
            <span className="overview-welcome__sun" aria-hidden="true"><Icon name={weatherInfo.icon} size={30} /></span>
          </div>
          <p className="overview-welcome__note" aria-live="polite" key={`${pulse.source}-${pulse.generatedAt}`}>
            {pulse.message}
          </p>
        </section>

        <aside className="overview-weather" aria-label={`Weather in ${locationLabel}`}>
          <div className="overview-weather__summary">
            <span className="overview-weather__icon" aria-hidden="true"><Icon name={weatherInfo.icon} size={50} /></span>
            <span>
              <strong>{temperatureLabel}</strong>
              <small><Icon name="map-pin" size={12} /> {locationLabel}</small>
              <em>{weatherInfo.label}</em>
            </span>
          </div>
          <div className="overview-weather__details">
            <span><small>Now</small><Icon name={weatherInfo.icon} size={23} /><strong>{temperatureLabel}</strong></span>
            <span><small>Today</small><Icon name="calendar" size={22} /><strong>{today.split(',')[0]}</strong></span>
            <span><small>Local</small><Icon name={hour >= 18 || hour < 6 ? 'moon' : 'sun'} size={22} /><strong>{localTime}</strong></span>
          </div>
        </aside>

        <nav className="overview-quick-actions" aria-label="Quick actions">
          <button className="is-primary" onClick={onCreateProject}><Icon name="plus" size={19} /> Create Project</button>
          <button onClick={() => onNavigate('work')}><Icon name="check-circle" size={18} /> Add Task</button>
          <button onClick={() => onNavigate('clients')}><Icon name="user" size={18} /> New Client</button>
          <button onClick={() => onNavigate('intelligence')}><Icon name="sparkles" size={18} /> Ask AI</button>
        </nav>
      </div>

      <section className="overview-dock" aria-label="Workspace at a glance">
        <article className="overview-glass-card overview-focus-card">
          <header>
            <span className="overview-card-icon overview-card-icon--gold"><Icon name="target" size={22} /></span>
            <span><strong>Today’s Focus</strong><small>{pulse.items.length} items</small></span>
          </header>
          <div className="overview-card-list">
            {pulse.items.slice(0, 3).map((item, index) => (
              <button key={item.id} onClick={() => onNavigate(item.target)}>
                <span className={index === 0 ? 'is-complete' : ''}><Icon name={index === 0 ? 'check' : workspacePulseItemIcon(item.kind)} size={12} /></span>
                <strong>{item.title}</strong>
              </button>
            ))}
          </div>
          <button className="overview-card-link" onClick={() => onNavigate('work')}>View all tasks <Icon name="arrow-right" size={13} /></button>
        </article>

        <article className="overview-glass-card">
          <header>
            <span className="overview-card-icon"><Icon name="calendar" size={21} /></span>
            <span><strong>Upcoming</strong><small>{analytics?.dueThisWeek || 0} due this week</small></span>
          </header>
          <div className="overview-signal-list">
            <button onClick={() => onNavigate('work')}><span>Projects</span><strong>{analytics?.dueSoonProjects || 0} due soon</strong></button>
            <button onClick={() => onNavigate('money')}><span>Invoices</span><strong>{analytics?.pendingInvoices || 0} pending</strong></button>
            <button onClick={() => onNavigate('automations')}><span>Automations</span><strong>{runningAutomations} running</strong></button>
          </div>
          <button className="overview-card-link" onClick={() => onNavigate('work')}>Open calendar <Icon name="arrow-right" size={13} /></button>
        </article>

        <article className="overview-glass-card">
          <header>
            <span className="overview-card-icon overview-card-icon--amber"><Icon name="layers" size={21} /></span>
            <span><strong>Active Projects</strong><small>{analytics?.openProjects || 0} ongoing</small></span>
          </header>
          <div className="overview-project-list">
            <button onClick={() => onNavigate('work')}><i className="is-blue" /><span>Open projects</span><strong>{analytics?.openProjects || 0}</strong></button>
            <button onClick={() => onNavigate('work')}><i className="is-pink" /><span>Due this week</span><strong>{analytics?.dueThisWeek || 0}</strong></button>
            <button onClick={() => onNavigate('clients')}><i className="is-amber" /><span>Active clients</span><strong>{analytics?.totalClients || 0}</strong></button>
          </div>
          <button className="overview-card-link" onClick={() => onNavigate('work')}>View all projects <Icon name="arrow-right" size={13} /></button>
        </article>

        <article className="overview-glass-card overview-ai-card">
          <header>
            <span className="overview-card-icon overview-card-icon--violet"><Icon name="sparkles" size={22} /></span>
            <span><strong>AI Assistant</strong><small className="is-online">● Online</small></span>
          </header>
          <p>Need help with something? I can research, create documents, analyse data and more.</p>
          <button className="overview-ai-card__button" onClick={() => onNavigate('intelligence')}><BrandMark compact /> Chat with AI</button>
        </article>
      </section>

      <footer className="overview-footer">
        <span className="overview-footer__brand"><BrandMark compact /><strong>lancee</strong><small>Work smarter, not harder.</small></span>
        <span>Perfect day for progress <Icon name={weatherInfo.icon} size={17} /></span>
      </footer>
    </div>
  )
}
