import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, type CalendarEvent, type Client, type Meeting, type MeetingInvitation, type Project } from '../../lib/api'
import { useDialogFocus } from '../../lib/useDialogFocus'
import MeetingRoom from '../meetings/MeetingRoom'
import './dairy-page.css'

type DairySection = 'calendar' | 'meetings'
type LinkedPage = 'work' | 'clients' | 'files'

type CalendarDisplayEvent = {
  id: string
  title: string
  date: string
  time: string
  kind: 'meeting' | 'deadline'
  projectId: string | null
  clientId: string | null
  projectName: string | null
  clientName: string | null
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

function timeKey(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
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
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [entryDialogOpen, setEntryDialogOpen] = useState(false)
  const [eventTitle, setEventTitle] = useState('')
  const [eventDate, setEventDate] = useState(() => dateKey(new Date()))
  const [eventTime, setEventTime] = useState('09:00')
  const [eventEndTime, setEventEndTime] = useState('10:00')
  const [eventKind, setEventKind] = useState<CalendarEvent['kind']>('meeting')
  const [eventProject, setEventProject] = useState('')
  const [eventClient, setEventClient] = useState('')
  const [savingEvent, setSavingEvent] = useState(false)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [teamMembers, setTeamMembers] = useState<Array<{ userId: string | null; name: string; email: string; status: string }>>([])
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null)
  const [meetingFormOpen, setMeetingFormOpen] = useState(false)
  const [meetingType, setMeetingType] = useState<Meeting['meetingType']>('internal')
  const [meetingDescription, setMeetingDescription] = useState('')
  const [meetingParticipants, setMeetingParticipants] = useState<string[]>([])
  const [externalParticipants, setExternalParticipants] = useState('')
  const [creatingMeeting, setCreatingMeeting] = useState(false)
  const [newInvitations, setNewInvitations] = useState<MeetingInvitation[]>([])
  const [liveKitConfigured, setLiveKitConfigured] = useState(true)
  const entryDialogRef = useDialogFocus<HTMLElement>(entryDialogOpen, () => setEntryDialogOpen(false))
  const meetingDialogRef = useDialogFocus<HTMLElement>(meetingFormOpen, () => setMeetingFormOpen(false))

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      api.projects.list(),
      api.clients.list(),
      api.calendar.list(),
      api.meetings.list(),
      api.team.list(),
      api.meetings.status(),
    ]).then(([nextProjects, nextClients, nextEvents, nextMeetings, nextTeam, meetingStatus]) => {
      if (!cancelled) {
        setProjects(nextProjects)
        setClients(nextClients)
        setEvents(nextEvents)
        setMeetings(nextMeetings)
        setTeamMembers(nextTeam)
        setLiveKitConfigured(meetingStatus.configured)
      }
    }).catch(() => onToast('Unable to load the calendar.'))
    return () => { cancelled = true }
  }, [workspaceId, onToast])

  const calendarEvents = useMemo<CalendarDisplayEvent[]>(() => events.map((event) => {
    const startAt = new Date(event.startAt)
    return {
      id: event.id,
      title: event.title,
      date: dateKey(startAt),
      time: timeKey(startAt),
      kind: event.kind,
      projectId: event.projectId,
      clientId: event.clientId,
      projectName: event.projectName,
      clientName: event.clientName,
    }
  }), [events])

  const projectDeadlines = useMemo<CalendarDisplayEvent[]>(() => projects
    .filter((project) => /^\d{4}-\d{2}-\d{2}/.test(project.due || ''))
    .map((project) => ({
      id: `project-${project.id}`,
      title: project.name,
      date: project.due.slice(0, 10),
      time: '',
      kind: 'deadline',
      projectId: project.id,
      clientId: project.clientId || null,
      projectName: project.name,
      clientName: project.client,
    })), [projects])

  const allEvents = useMemo(() => [...calendarEvents, ...projectDeadlines], [calendarEvents, projectDeadlines])
  const days = useMemo(() => monthDays(month), [month])
  const upcomingMeetings = useMemo(() => meetings
    .filter((meeting) => ['scheduled', 'live'].includes(meeting.status) && new Date(meeting.scheduledEnd) >= new Date())
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)), [meetings])

  const selectProject = (projectId: string) => {
    setEventProject(projectId)
    if (projectId) {
      setEventClient(projects.find((project) => project.id === projectId)?.clientId || '')
    }
  }

  const saveEvent = async (event: FormEvent, closeDialog = false) => {
    event.preventDefault()
    setSavingEvent(true)
    try {
      const startAt = new Date(`${eventDate}T${eventTime}:00`).toISOString()
      const endAt = new Date(`${eventDate}T${eventEndTime}:00`).toISOString()
      if (eventKind === 'meeting') {
        const created = await api.meetings.create({
          title: eventTitle.trim(),
          meetingType: eventClient ? 'client' : 'internal',
          scheduledStart: startAt,
          scheduledEnd: endAt,
          projectId: eventProject || null,
          clientId: eventClient || null,
          guestAccessEnabled: Boolean(eventClient),
        })
        setMeetings((current) => [...current, created.meeting])
        setEvents(await api.calendar.list())
      } else {
        const nextEvent = await api.calendar.create({
          title: eventTitle.trim(),
          kind: eventKind,
          startAt,
          endAt,
          projectId: eventProject || null,
          clientId: eventClient || null,
        })
        setEvents((current) => [...current, nextEvent])
      }
      setEventTitle('')
      if (closeDialog) setEntryDialogOpen(false)
      onToast('Entry added to Diary calendar')
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Unable to add the calendar entry.')
    } finally {
      setSavingEvent(false)
    }
  }

  const createMeeting = async (event: FormEvent) => {
    event.preventDefault()
    setCreatingMeeting(true)
    setNewInvitations([])
    try {
      const created = await api.meetings.create({
        title: eventTitle.trim(),
        description: meetingDescription.trim(),
        meetingType,
        scheduledStart: new Date(`${eventDate}T${eventTime}:00`).toISOString(),
        scheduledEnd: new Date(`${eventDate}T${eventEndTime}:00`).toISOString(),
        projectId: eventProject || null,
        clientId: eventClient || null,
        participants: meetingParticipants,
        externalParticipants: meetingType === 'client'
          ? externalParticipants.split(/\n|,/).map((email) => email.trim()).filter(Boolean).map((email) => ({ email }))
          : [],
        guestAccessEnabled: meetingType === 'client',
      })
      setMeetings((current) => [...current, created.meeting].sort((left, right) => left.scheduledStart.localeCompare(right.scheduledStart)))
      setEvents(await api.calendar.list())
      setNewInvitations(created.invitations)
      setEventTitle('')
      setMeetingDescription('')
      setMeetingParticipants([])
      setExternalParticipants('')
      if (!created.invitations.length) setMeetingFormOpen(false)
      onToast('Meeting scheduled and added to Calendar')
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Unable to create the meeting.')
    } finally {
      setCreatingMeeting(false)
    }
  }

  if (activeMeeting) {
    return (
      <div className="dairy-live-meeting">
        <MeetingRoom
          meeting={activeMeeting}
          displayName={userName}
          getCredentials={() => api.meetings.join(activeMeeting.id)}
          startMeeting={() => api.meetings.start(activeMeeting.id)}
          endMeeting={() => api.meetings.end(activeMeeting.id)}
          removeParticipant={(identity) => api.meetings.removeParticipant(activeMeeting.id, identity)}
          loadNotes={() => api.meetings.notes(activeMeeting.id)}
          addNote={(body) => api.meetings.addNote(activeMeeting.id, body)}
          onMeetingChange={(nextMeeting) => {
            setActiveMeeting(nextMeeting)
            setMeetings((current) => current.map((item) => item.id === nextMeeting.id ? nextMeeting : item))
          }}
          onLeave={() => {
            setActiveMeeting(null)
            void api.meetings.list().then(setMeetings).catch(() => undefined)
          }}
        />
      </div>
    )
  }

  return (
    <div className="content-container dashboard-page dairy-page animate-fade-in">
      <header className="dairy-hero">
        <div>
          <span className="dairy-eyebrow">Your schedule, connected</span>
          <h1>Diary</h1>
          <p>Plan work in Calendar and host secure native meetings without leaving lancee.</p>
        </div>
        <div className="dairy-hero__mark"><CalendarGlyph /></div>
      </header>

      <nav className="dairy-tabs" aria-label="Diary sections">
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
                      <small
                        className={item.kind === 'deadline' ? 'is-deadline' : ''}
                        data-project-id={item.projectId || undefined}
                        data-client-id={item.clientId || undefined}
                        title={[item.projectName, item.clientName].filter(Boolean).join(' · ')}
                        key={item.id}
                      >{item.time} {item.title}</small>
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
                <label>Starts<input required type="time" value={eventTime} onChange={(event) => setEventTime(event.target.value)} /></label>
              </div>
              <label>Ends<input required type="time" value={eventEndTime} min={eventTime} onChange={(event) => setEventEndTime(event.target.value)} /></label>
              <label>Project<select value={eventProject} onChange={(event) => selectProject(event.target.value)}><option value="">No project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
              <label>Client<select value={eventClient} disabled={Boolean(eventProject)} onChange={(event) => setEventClient(event.target.value)}><option value="">No client</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label>
              {eventProject && <small>Client is derived from the selected project and persisted with both relationship IDs.</small>}
              <button className="dairy-primary" type="submit" disabled={savingEvent}>{savingEvent ? 'Adding…' : 'Add entry'}</button>
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
              <article ref={entryDialogRef} className="dairy-side-card dairy-entry-dialog" role="dialog" aria-modal="true" aria-labelledby="dairy-entry-dialog-title" tabIndex={-1}>
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
                    <label>Starts<input required type="time" value={eventTime} onChange={(event) => setEventTime(event.target.value)} /></label>
                  </div>
                  <label>Ends<input required type="time" value={eventEndTime} min={eventTime} onChange={(event) => setEventEndTime(event.target.value)} /></label>
                  <label>Project<select value={eventProject} onChange={(event) => selectProject(event.target.value)}><option value="">No project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
                  <label>Client<select value={eventClient} disabled={Boolean(eventProject)} onChange={(event) => setEventClient(event.target.value)}><option value="">No client</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label>
                  {eventProject && <small>Client is derived from the selected project and persisted with both relationship IDs.</small>}
                  <button className="dairy-primary" type="submit" disabled={savingEvent}>{savingEvent ? 'Adding…' : 'Add entry'}</button>
                </form>
              </article>
            </div>
          )}
        </div>
      ) : (
        <div className="dairy-meetings-layout">
          <section className="dairy-side-card dairy-native-meeting-card">
            <span className="dairy-card-label">Native meetings</span>
            <h2>Meet in lancee</h2>
            <p>Secure workspace and client calls with project context, internal notes, and no third-party meeting interface.</p>
            {!liveKitConfigured && <div className="dairy-error" role="alert">LiveKit is not configured on this server. Meetings can be scheduled, but rooms cannot start yet.</div>}
            <button className="dairy-primary" type="button" onClick={() => { setMeetingFormOpen(true); setNewInvitations([]) }}>New meeting</button>
            <small className="dairy-security-note">Room access is authorized and issued by the lancee server.</small>
          </section>

          <section className="dairy-meeting-stage dairy-meeting-stage--native" aria-label="Next native meeting">
            {upcomingMeetings[0] ? (
              <div className="dairy-next-meeting">
                <span className={`dairy-meeting-status is-${upcomingMeetings[0].status}`}>{upcomingMeetings[0].status}</span>
                <div className="dairy-next-meeting__icon"><VideoGlyph /></div>
                <span className="dairy-card-label">{upcomingMeetings[0].meetingType === 'client' ? 'Client meeting' : 'Internal meeting'}</span>
                <h2>{upcomingMeetings[0].title}</h2>
                <p>{new Date(upcomingMeetings[0].scheduledStart).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}</p>
                <div className="dairy-next-meeting__context">{[upcomingMeetings[0].clientName, upcomingMeetings[0].projectName].filter(Boolean).map((item) => <span key={item || ''}>{item}</span>)}</div>
                <button className="dairy-primary" type="button" disabled={!liveKitConfigured} onClick={() => setActiveMeeting(upcomingMeetings[0])}>{upcomingMeetings[0].status === 'live' ? 'Join live meeting' : upcomingMeetings[0].isHost ? 'Open pre-join' : 'Open pre-join'}</button>
              </div>
            ) : (
              <div className="dairy-stage-empty"><span><VideoGlyph /></span><h2>No meeting is waiting</h2><p>Schedule an internal or client meeting and it will appear here.</p></div>
            )}
          </section>

          <section className="dairy-upcoming">
            <header><div><span className="dairy-card-label">Calendar</span><h2>Upcoming meetings</h2></div><button type="button" onClick={() => setSection('calendar')}>Open calendar</button></header>
            {upcomingMeetings.length ? upcomingMeetings.slice(0, 5).map((meeting) => (
              <article key={meeting.id} role="button" tabIndex={0} onClick={() => setActiveMeeting(meeting)} onKeyDown={(event) => { if (event.key === 'Enter') setActiveMeeting(meeting) }}>
                <time dateTime={meeting.scheduledStart}><strong>{new Date(meeting.scheduledStart).toLocaleDateString(undefined, { day: '2-digit' })}</strong><span>{new Date(meeting.scheduledStart).toLocaleDateString(undefined, { month: 'short' })}</span></time>
                <div data-project-id={meeting.projectId || undefined} data-client-id={meeting.clientId || undefined}>
                  <strong>{meeting.title}</strong>
                  <span>{timeKey(new Date(meeting.scheduledStart))} · {meeting.durationMinutes} min · {meeting.meetingType}{meeting.projectName ? ` · ${meeting.projectName}` : ''}{meeting.clientName ? ` · ${meeting.clientName}` : ''}</span>
                </div>
                <button type="button" onClick={(event) => { event.stopPropagation(); setActiveMeeting(meeting) }}>Open</button>
              </article>
            )) : <div className="dairy-upcoming__empty">No upcoming meetings yet. Schedule one here or from Calendar.</div>}
          </section>

          {meetingFormOpen && (
            <div className="dairy-entry-dialog__backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setMeetingFormOpen(false) }}>
              <article ref={meetingDialogRef} className="dairy-side-card dairy-entry-dialog dairy-meeting-dialog" role="dialog" aria-modal="true" aria-labelledby="dairy-meeting-dialog-title" tabIndex={-1}>
                <header><div><span className="dairy-card-label">Native lancee meeting</span><h2 id="dairy-meeting-dialog-title">Schedule a meeting</h2></div><button type="button" aria-label="Close meeting form" onClick={() => setMeetingFormOpen(false)}>×</button></header>
                {newInvitations.length ? (
                  <div className="dairy-invitation-results">
                    <h3>Guest links are ready</h3>
                    <p>Send each secure link to its intended guest. Links expire automatically.</p>
                    {newInvitations.map((invitation) => <label key={invitation.id}>{invitation.email || invitation.guestName || 'Guest'}<span><input readOnly value={invitation.guestUrl || ''} /><button type="button" onClick={() => void navigator.clipboard.writeText(invitation.guestUrl || '').then(() => onToast('Guest link copied'))}>Copy</button></span></label>)}
                    <button className="dairy-primary" type="button" onClick={() => { setNewInvitations([]); setMeetingFormOpen(false) }}>Done</button>
                  </div>
                ) : (
                  <form onSubmit={createMeeting}>
                    <div className="dairy-meeting-type" role="group" aria-label="Meeting type">
                      <button type="button" className={meetingType === 'internal' ? 'is-active' : ''} onClick={() => { setMeetingType('internal'); setEventClient('') }}><strong>Internal</strong><span>Workspace members only</span></button>
                      <button type="button" className={meetingType === 'client' ? 'is-active' : ''} onClick={() => setMeetingType('client')}><strong>Client</strong><span>Secure external guests</span></button>
                    </div>
                    <label>Title<input autoFocus required value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} placeholder="Weekly project check-in" /></label>
                    <label>Description<textarea value={meetingDescription} onChange={(event) => setMeetingDescription(event.target.value)} placeholder="Agenda or context for workspace members" /></label>
                    <div className="dairy-form-row"><label>Date<input required type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></label><label>Starts<input required type="time" value={eventTime} onChange={(event) => setEventTime(event.target.value)} /></label></div>
                    <label>Ends<input required type="time" min={eventTime} value={eventEndTime} onChange={(event) => setEventEndTime(event.target.value)} /></label>
                    <label>Project<select value={eventProject} onChange={(event) => selectProject(event.target.value)}><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
                    {meetingType === 'client' && <label>Client<select required value={eventClient} disabled={Boolean(eventProject && projects.find((project) => project.id === eventProject)?.clientId)} onChange={(event) => setEventClient(event.target.value)}><option value="">Select client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>}
                    <fieldset className="dairy-participants"><legend>Workspace participants</legend>{teamMembers.filter((member) => member.status === 'active').map((member) => <label key={member.email}><input type="checkbox" checked={meetingParticipants.includes(member.userId || member.email)} onChange={(event) => setMeetingParticipants((current) => event.target.checked ? [...current, member.userId || member.email] : current.filter((item) => item !== (member.userId || member.email)))} /><span><strong>{member.name}</strong><small>{member.email}</small></span></label>)}</fieldset>
                    {meetingType === 'client' && <label>External guest emails<textarea value={externalParticipants} onChange={(event) => setExternalParticipants(event.target.value)} placeholder={'client@example.com\nproducer@example.com'} /><small>One email per line. Secure guest links are generated after scheduling; they are not emailed automatically.</small></label>}
                    <button className="dairy-primary" type="submit" disabled={creatingMeeting}>{creatingMeeting ? 'Scheduling…' : 'Schedule meeting'}</button>
                  </form>
                )}
              </article>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
