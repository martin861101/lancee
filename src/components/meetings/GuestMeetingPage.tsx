import { useEffect, useState } from 'react'
import { api, type GuestMeeting } from '../../lib/api'
import BrandMark from '../BrandMark'
import MeetingRoom from './MeetingRoom'

export default function GuestMeetingPage({ token }: { token: string }) {
  const [meeting, setMeeting] = useState<GuestMeeting | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void api.meetingGuests.get(token).then((value) => {
      if (active) setMeeting(value)
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : 'This meeting invitation is unavailable.')
    })
    return () => { active = false }
  }, [token])

  if (error) {
    return (
      <main className="lancee-prejoin lancee-prejoin--guest">
        <header className="lancee-prejoin__brand"><BrandMark /><strong>lancee</strong></header>
        <section className="lancee-prejoin__layout" style={{ gridTemplateColumns: 'minmax(280px, 560px)', justifyContent: 'center' }}>
          <div className="lancee-prejoin__panel"><span className="lancee-meeting-kicker">Invitation unavailable</span><h1>We can’t open this meeting link.</h1><div className="lancee-meeting-error" role="alert">{error}</div><small>Ask the meeting host for a new invitation.</small></div>
        </section>
      </main>
    )
  }

  if (!meeting) {
    return <main className="lancee-prejoin" aria-label="Loading guest meeting"><header className="lancee-prejoin__brand"><BrandMark /><strong>lancee</strong></header></main>
  }

  return (
    <MeetingRoom
      meeting={{
        id: 'guest-meeting',
        title: meeting.title,
        status: meeting.status,
        scheduledStart: meeting.scheduledStart,
        scheduledEnd: meeting.scheduledEnd,
        startedAt: null,
        projectName: null,
        clientName: null,
        isHost: false,
      }}
      displayName={meeting.guestName || ''}
      guest
      companyName={meeting.companyName}
      getCredentials={(name) => api.meetingGuests.join(token, name)}
      onLeave={() => window.location.assign('/')}
    />
  )
}
