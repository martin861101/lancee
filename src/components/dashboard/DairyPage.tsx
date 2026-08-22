import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { api, type Client, type Project } from '../../lib/api'
import './dairy-page.css'

type DairySection = 'calendar' | 'meetings'
type LinkedPage = 'work' | 'clients' | 'files'

type CalendarEvent = {
  id: string
  title: string
  date: string
  time: string
  kind: 'meeting' | 'deadline'
  projectId: string
  clientId: string
}

type DairyPageProps = {
  workspaceId: string
  userName: string
  onNavigate: (page: LinkedPage) => void
  onToast: (message: string) => void
}

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function monthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const startOffset = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - startOffset)
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })
}

function storedCalendarEvents(workspaceId: string) {
  try {
    const stored = window.localStorage.getItem(`lancee:dairy:${workspaceId}`)
    return stored ? JSON.parse(stored) as CalendarEvent[] : []
  } catch {
    return []
  }
}

function CalendarGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
    </svg>
  )
}

function VideoGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="6" width="12" height="12" rx="2" />
      <path d="m15 10 5-3v10l-5-3" />
    </svg>
  )
}

export default function DairyPage({ workspaceId, userName, onNavigate, onToast }: DairyPageProps) {
  const [section, setSection] = useState<DairySection>('calendar')
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>(() => storedCalendarEvents(workspaceId))
  const [entryDialogOpen, setEntryDialogOpen] = useState(false)
  const [eventTitle, setEventTitle] = useState('')
  const [eventDate, setEventDate] = useState(() => dateKey(new Date()))
  const [eventTime, setEventTime] = useState('09:00')
  const [eventKind, setEventKind] = useState<CalendarEvent['kind']>('meeting')
  const [eventProject, setEventProject] = useState('')
  const [eventClient, setEventClient] = useState('')
  const [meetingNumber, setMeetingNumber] = useState('')
  const [meetingPassword, setMeetingPassword] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')
  const meetingRoot = useRef<HTMLDivElement>(null)
  const storageKey = `lancee:dairy:${workspaceId}`

  useEffect(() => {
    let cancelled = false
    void Promise.all([api.projects.list(), api.clients.list()]).then(([nextProjects, nextClients]) => {
      if (!cancelled) {
        setProjects(nextProjects)
        setClients(nextClients)
      }
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!entryDialogOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEntryDialogOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [entryDialogOpen])

  const projectDeadlines = useMemo<CalendarEvent[]>(() => projects
    .filter((project) => /^\d{4}-\d{2}-\d{2}/.test(project.due || ''))
    .map((project) => ({
      id: `project-${project.id}`,
      title: project.name,
      date: project.due.slice(0, 10),
      time: '',
      kind: 'deadline',
      projectId: project.id,
      clientId: project.clientId || '',
    })), [projects])

  const allEvents = useMemo(() => [...events, ...projectDeadlines], [events, projectDeadlines])
  const days = useMemo(() => monthDays(month), [month])
  const upcomingMeetings = useMemo(() => events
    .filter((event) => event.kind === 'meeting' && event.date >= dateKey(new Date()))
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)), [events])

  const saveEvent = (event: FormEvent, closeDialog = false) => {
    event.preventDefault()
    const nextEvent: CalendarEvent = {
      id: crypto.randomUUID(),
      title: eventTitle.trim(),
      date: eventDate,
      time: eventTime,
      kind: eventKind,
      projectId: eventProject,
      clientId: eventClient,
    }
    const nextEvents = [...events, nextEvent]
    setEvents(nextEvents)
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextEvents))
    } catch {
      // Keep the event in React state if browser storage is unavailable.
    }
    setEventTitle('')
    if (closeDialog) setEntryDialogOpen(false)
    onToast('Entry added to Dairy calendar')
  }

  const joinZoomMeeting = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedNumber = meetingNumber.replace(/\D/g, '')
    if (!meetingRoot.current || normalizedNumber.length < 9) {
      setJoinError('Enter a valid Zoom meeting number.')
      return
    }
    setJoining(true)
    setJoinError('')
    try {
      const response = await fetch('/api/zoom/signature', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingNumber: normalizedNumber }),
      })
      const payload = (await response.json()) as { signature?: string; error?: string }
      if (!response.ok || !payload.signature) throw new Error(payload.error || 'Unable to authorize Zoom.')
      const { default: ZoomMtgEmbedded } = await import('@zoom/meetingsdk/embedded')
      const client = ZoomMtgEmbedded.createClient()
      await client.init({
        zoomAppRoot: meetingRoot.current,
        language: 'en-US',
        patchJsMedia: true,
      })
      await client.join({
        signature: payload.signature,
        meetingNumber: normalizedNumber,
        password: meetingPassword,
        userName,
      })
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Unable to join the Zoom meeting.')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="content-container dashboard-page dairy-page animate-fade-in">
      <header className="dairy-hero">
        <div>
          <span className="dairy-eyebrow">Your schedule, connected</span>
          <h1>Dairy</h1>
          <p>Plan work in Calendar and meet with clients through Zoom without leaving lancee.</p>
        </div>
        <div className="dairy-hero__mark"><CalendarGlyph /></div>
      </header>

      <nav className="dairy-tabs" aria-label="Dairy sections">
        <button type="button" aria-pressed={section === 'calendar'} className={section === 'calendar' ? 'is-active' : ''} onClick={() => setSection('calendar')}>
          <CalendarGlyph /> Calendar
        </button>
        <button type="button" aria-pressed={section === 'meetings'} className={section === 'meetings' ? 'is-active' : ''} onClick={() => setSection('meetings')}>
          <VideoGlyph /> Meetings
        </button>
      </nav>

      <div className="dairy-links" aria-label="Linked workspaces">
        <span>Linked to</span>
        {section === 'meetings' && <button type="button" onClick={() => setSection('calendar')}>Calendar</button>}
        {section === 'calendar' && <button type="button" onClick={() => setSection('meetings')}>Meetings</button>}
        <button type="button" onClick={() => onNavigate('work')}>Projects</button>
        <button type="button" onClick={() => onNavigate('clients')}>Clients</button>
        {section === 'meetings' && <button type="button" onClick={() => onNavigate('files')}>Files</button>}
      </div>

      {section === 'calendar' ? (
        <div className="dairy-calendar-layout">
          <section className="dairy-calendar-card">
            <header className="dairy-calendar-card__header">
              <div>
                <span>Calendar</span>
                <h2>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
              </div>
              <div className="dairy-month-controls">
                <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
                <button type="button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button>
                <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
              </div>
            </header>
            <div className="dairy-calendar-grid dairy-calendar-grid--labels">
              {weekdays.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="dairy-calendar-grid">
              {days.map((day) => {
                const key = dateKey(day)
                const dayEvents = allEvents.filter((item) => item.date === key)
                return (
                  <button
                    type="button"
                    key={key}
                    className={`dairy-day${day.getMonth() !== month.getMonth() ? ' is-outside' : ''}${key === dateKey(new Date()) ? ' is-today' : ''}${key === eventDate ? ' is-selected' : ''}`}
                    aria-label={`Add an entry on ${day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`}
                    onClick={() => {
                      setEventDate(key)
                      setEntryDialogOpen(true)
                    }}
                  >
                    <span>{day.getDate()}</span>
                    {dayEvents.slice(0, 2).map((item) => (
                      <small className={item.kind === 'deadline' ? 'is-deadline' : ''} key={item.id}>{item.time} {item.title}</small>
                    ))}
                    {dayEvents.length > 2 && <em>+{dayEvents.length - 2} more</em>}
                  </button>
                )
              })}
            </div>
          </section>

          <aside className="dairy-side-card">
            <span className="dairy-card-label">Add to calendar</span>
            <h2>Add an entry</h2>
            <form onSubmit={saveEvent}>
              <label>Title<input required value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} placeholder="Client check-in" /></label>
              <label>Entry type<select value={eventKind} onChange={(event) => setEventKind(event.target.value as CalendarEvent['kind'])}><option value="meeting">Meeting</option><option value="deadline">Deadline</option></select></label>
              <div className="dairy-form-row">
                <label>Date<input required type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></label>
                <label>Time<input required type="time" value={eventTime} onChange={(event) => setEventTime(event.target.value)} /></label>
              </div>
              <label>Project<select value={eventProject} onChange={(event) => setEventProject(event.target.value)}><option value="">No project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
              <label>Client<select value={eventClient} onChange={(event) => setEventClient(event.target.value)}><option value="">No client</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label>
              <button className="dairy-primary" type="submit">Add entry</button>
            </form>
            <div className="dairy-connector-note">
              <strong>Calendar connectors</strong>
              <p>Google Calendar, Outlook, and other providers can be connected here in a later integration.</p>
            </div>
          </aside>

          {entryDialogOpen && (
            <div
              className="dairy-entry-dialog__backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.currentTarget === event.target) setEntryDialogOpen(false)
              }}
            >
              <article className="dairy-side-card dairy-entry-dialog" role="dialog" aria-modal="true" aria-labelledby="dairy-entry-dialog-title">
                <header>
                  <div>
                    <span className="dairy-card-label">New calendar entry</span>
                    <h2 id="dairy-entry-dialog-title">{new Date(`${eventDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
                  </div>
                  <button type="button" aria-label="Close entry form" onClick={() => setEntryDialogOpen(false)}>×</button>
                </header>
                <form onSubmit={(event) => saveEvent(event, true)}>
                  <label>Title<input autoFocus required value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} placeholder="Add a title" /></label>
                  <label>Entry type<select value={eventKind} onChange={(event) => setEventKind(event.target.value as CalendarEvent['kind'])}><option value="meeting">Meeting</option><option value="deadline">Deadline</option></select></label>
                  <div className="dairy-form-row">
                    <label>Date<input required type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></label>
                    <label>Time<input required type="time" value={eventTime} onChange={(event) => setEventTime(event.target.value)} /></label>
                  </div>
                  <label>Project<select value={eventProject} onChange={(event) => setEventProject(event.target.value)}><option value="">No project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
                  <label>Client<select value={eventClient} onChange={(event) => setEventClient(event.target.value)}><option value="">No client</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label>
                  <button className="dairy-primary" type="submit">Add entry</button>
                </form>
              </article>
            </div>
          )}
        </div>
      ) : (
        <div className="dairy-meetings-layout">
          <section className="dairy-side-card dairy-join-card">
            <span className="dairy-card-label">Zoom Meeting SDK</span>
            <h2>Join inside lancee</h2>
            <p>Enter the details from your Zoom invitation. Your camera and microphone stay in the embedded meeting.</p>
            <form onSubmit={joinZoomMeeting}>
              <label>Meeting number<input required inputMode="numeric" value={meetingNumber} onChange={(event) => setMeetingNumber(event.target.value)} placeholder="123 456 7890" /></label>
              <label>Passcode<input value={meetingPassword} onChange={(event) => setMeetingPassword(event.target.value)} placeholder="Meeting passcode" /></label>
              {joinError && <div className="dairy-error" role="alert">{joinError}</div>}
              <button className="dairy-primary dairy-primary--zoom" type="submit" disabled={joining}>{joining ? 'Opening Zoom…' : 'Join meeting'}</button>
            </form>
            <small className="dairy-security-note">Meeting credentials are signed securely by the lancee server.</small>
          </section>

          <section className="dairy-meeting-stage" aria-label="Embedded Zoom meeting">
            <div ref={meetingRoot} className="dairy-zoom-root" />
            <div className="dairy-stage-empty">
              <span><VideoGlyph /></span>
              <h2>Your meeting will open here</h2>
              <p>Zoom’s component view keeps video, participants, chat, and meeting controls inside this workspace.</p>
            </div>
          </section>

          <section className="dairy-upcoming">
            <header><div><span className="dairy-card-label">Calendar</span><h2>Upcoming meetings</h2></div><button type="button" onClick={() => setSection('calendar')}>Open calendar</button></header>
            {upcomingMeetings.length ? upcomingMeetings.slice(0, 5).map((meeting) => (
              <article key={meeting.id}>
                <time dateTime={`${meeting.date}T${meeting.time}`}><strong>{new Date(`${meeting.date}T00:00:00`).toLocaleDateString(undefined, { day: '2-digit' })}</strong><span>{new Date(`${meeting.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' })}</span></time>
                <div><strong>{meeting.title}</strong><span>{meeting.time || 'Time not set'}</span></div>
              </article>
            )) : <div className="dairy-upcoming__empty">No upcoming meetings yet. Add one from Calendar.</div>}
          </section>
        </div>
      )}
    </div>
  )
}
