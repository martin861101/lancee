import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ConnectionState,
  Participant,
  Room,
  RoomEvent,
  Track,
  type LocalVideoTrack,
  type RemoteTrack,
} from 'livekit-client'
import type { Meeting, MeetingCredentials, MeetingNote } from '../../lib/api'
import BrandMark from '../BrandMark'
import './meeting-room.css'

type MeetingView = Pick<Meeting,
  'id' | 'title' | 'status' | 'scheduledStart' | 'scheduledEnd' | 'startedAt' |
  'projectName' | 'clientName' | 'isHost'
>

type MeetingRoomProps = {
  meeting: MeetingView
  displayName: string
  guest?: boolean
  companyName?: string
  getCredentials: (displayName: string) => Promise<MeetingCredentials>
  startMeeting?: () => Promise<Meeting>
  endMeeting?: () => Promise<Meeting>
  removeParticipant?: (identity: string) => Promise<void>
  loadNotes?: () => Promise<MeetingNote[]>
  addNote?: (body: string) => Promise<MeetingNote>
  onMeetingChange?: (meeting: Meeting) => void
  onLeave: () => void
}

type ControlIcon = 'mic' | 'camera' | 'screen' | 'people' | 'info' | 'leave' | 'notes'

function Icon({ name }: { name: ControlIcon }) {
  const paths: Record<ControlIcon, React.ReactNode> = {
    mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></>,
    camera: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></>,
    screen: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4M8 9l4-3 4 3M12 6v7" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 5a3 3 0 0 1 0 6M17 14c3 .5 4 2.5 4 6" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    leave: <><path d="M9 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M14 8l5 4-5 4M19 12H8" /></>,
    notes: <><path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5" /></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function elapsedLabel(startedAt: string | null, now: number) {
  if (!startedAt) return '00:00'
  const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1_000))
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const remainder = seconds % 60
  return hours
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function ParticipantTile({
  participant,
  active,
  local,
  canRemove,
  onRemove,
}: {
  participant: Participant
  active: boolean
  local: boolean
  canRemove: boolean
  onRemove?: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const screenPublication = participant.getTrackPublication(Track.Source.ScreenShare)
  const cameraPublication = participant.getTrackPublication(Track.Source.Camera)
  const publication = screenPublication?.track ? screenPublication : cameraPublication
  const videoTrack = publication?.track as LocalVideoTrack | RemoteTrack | undefined
  const name = participant.name || (local ? 'You' : 'Participant')

  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoTrack || videoTrack.kind !== Track.Kind.Video) return
    videoTrack.attach(video)
    return () => { videoTrack.detach(video) }
  }, [videoTrack])

  return (
    <article className={`lancee-participant${active ? ' is-active' : ''}`}>
      {videoTrack && !publication?.isMuted ? (
        <video ref={videoRef} autoPlay playsInline muted={local} className={local && !screenPublication?.track ? 'is-mirrored' : ''} />
      ) : (
        <div className="lancee-participant__fallback" aria-label={`${name}'s camera is off`}>{initials(name)}</div>
      )}
      <footer>
        <span>{local ? `${name} (you)` : name}</span>
        {participant.isMicrophoneEnabled ? <Icon name="mic" /> : <span aria-label="Microphone off">⌁</span>}
      </footer>
      {canRemove && <button type="button" onClick={onRemove} aria-label={`Remove ${name}`}>Remove</button>}
    </article>
  )
}

function PreJoin({
  meeting,
  initialName,
  guest,
  companyName,
  busy,
  error,
  onJoin,
}: {
  meeting: MeetingView
  initialName: string
  guest: boolean
  companyName?: string
  busy: boolean
  error: string
  onJoin: (settings: { name: string; camera: boolean; microphone: boolean; cameraId: string; microphoneId: string }) => Promise<void>
}) {
  const [name, setName] = useState(initialName)
  const [camera, setCamera] = useState(true)
  const [microphone, setMicrophone] = useState(true)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [cameraId, setCameraId] = useState('')
  const [microphoneId, setMicrophoneId] = useState('')
  const [mediaError, setMediaError] = useState('')
  const [meter, setMeter] = useState(0)
  const [previewKey, setPreviewKey] = useState(0)
  const previewRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let disposed = false
    let stream: MediaStream | null = null
    let animationFrame = 0
    let audioContext: AudioContext | null = null
    const openPreview = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMediaError('Camera and microphone preview is unavailable in this browser.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: camera ? { deviceId: cameraId ? { exact: cameraId } : undefined } : false,
          audio: microphone ? { deviceId: microphoneId ? { exact: microphoneId } : undefined } : false,
        })
        if (disposed) return
        if (previewRef.current) previewRef.current.srcObject = stream
        const devices = await navigator.mediaDevices.enumerateDevices()
        setCameras(devices.filter((device) => device.kind === 'videoinput'))
        setMicrophones(devices.filter((device) => device.kind === 'audioinput'))
        setMediaError('')
        const audioTrack = stream.getAudioTracks()[0]
        if (audioTrack) {
          audioContext = new AudioContext()
          const analyser = audioContext.createAnalyser()
          analyser.fftSize = 256
          audioContext.createMediaStreamSource(new MediaStream([audioTrack])).connect(analyser)
          const samples = new Uint8Array(analyser.frequencyBinCount)
          const updateMeter = () => {
            analyser.getByteFrequencyData(samples)
            setMeter(Math.min(100, Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length)))
            animationFrame = requestAnimationFrame(updateMeter)
          }
          updateMeter()
        }
      } catch (caught) {
        const message = caught instanceof DOMException && caught.name === 'NotAllowedError'
          ? 'Camera or microphone permission was denied. You can still join with them turned off.'
          : 'The selected camera or microphone could not be opened.'
        setMediaError(message)
        setCamera(false)
        setMicrophone(false)
      }
    }
    void openPreview()
    return () => {
      disposed = true
      cancelAnimationFrame(animationFrame)
      stream?.getTracks().forEach((track) => track.stop())
      void audioContext?.close()
    }
  }, [camera, microphone, cameraId, microphoneId, previewKey])

  return (
    <main className={`lancee-prejoin${guest ? ' lancee-prejoin--guest' : ''}`}>
      <header className="lancee-prejoin__brand"><BrandMark /><strong>lancee</strong>{companyName && <em>for {companyName}</em>}</header>
      <section className="lancee-prejoin__layout">
        <div className="lancee-prejoin__preview">
          {camera ? <video ref={previewRef} autoPlay muted playsInline /> : <div className="lancee-prejoin__avatar">{initials(name || 'Guest')}</div>}
          <div className="lancee-prejoin__preview-controls">
            <button type="button" className={!microphone ? 'is-off' : ''} onClick={() => setMicrophone((value) => !value)} aria-pressed={microphone}><Icon name="mic" /></button>
            <button type="button" className={!camera ? 'is-off' : ''} onClick={() => setCamera((value) => !value)} aria-pressed={camera}><Icon name="camera" /></button>
          </div>
        </div>
        <form onSubmit={(event) => {
          event.preventDefault()
          const previewStream = previewRef.current?.srcObject
          if (previewStream instanceof MediaStream) {
            previewStream.getTracks().forEach((track) => track.stop())
            if (previewRef.current) previewRef.current.srcObject = null
          }
          void onJoin({ name, camera, microphone, cameraId, microphoneId })
            .finally(() => setPreviewKey((value) => value + 1))
        }} className="lancee-prejoin__panel">
          <span className="lancee-meeting-kicker">Ready to join?</span>
          <h1>{meeting.title}</h1>
          <p>{new Date(meeting.scheduledStart).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>
          {guest && <label>Display name<input required value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /></label>}
          <label>Camera<select value={cameraId} onChange={(event) => setCameraId(event.target.value)} disabled={!camera}><option value="">System default</option>{cameras.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label>
          <label>Microphone<select value={microphoneId} onChange={(event) => setMicrophoneId(event.target.value)} disabled={!microphone}><option value="">System default</option>{microphones.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select></label>
          <div className="lancee-mic-meter" aria-label="Microphone level"><span style={{ width: `${microphone ? meter : 0}%` }} /></div>
          {(mediaError || error) && <div className="lancee-meeting-error" role="alert">{error || mediaError}</div>}
          <button className="lancee-meeting-primary" type="submit" disabled={busy || !name.trim()}>{busy ? 'Joining…' : meeting.status === 'scheduled' && meeting.isHost ? 'Start and join' : 'Join meeting'}</button>
          {meeting.status === 'scheduled' && !meeting.isHost && <small>The room opens when the host starts the meeting.</small>}
        </form>
      </section>
    </main>
  )
}

export default function MeetingRoom({
  meeting,
  displayName,
  guest = false,
  companyName,
  getCredentials,
  startMeeting,
  endMeeting,
  removeParticipant,
  loadNotes,
  addNote,
  onMeetingChange,
  onLeave,
}: MeetingRoomProps) {
  const [room, setRoom] = useState<Room | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [activeIdentity, setActiveIdentity] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [connectionLabel, setConnectionLabel] = useState('Connected')
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [screenSharing, setScreenSharing] = useState(false)
  const [drawer, setDrawer] = useState<'participants' | 'info' | 'notes' | null>(null)
  const [notes, setNotes] = useState<MeetingNote[]>([])
  const [noteBody, setNoteBody] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [ending, setEnding] = useState(false)
  const [clock, setClock] = useState(0)
  const audioRoot = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!room) return
    const timer = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [room])

  useEffect(() => {
    if (!loadNotes) return
    void loadNotes().then(setNotes).catch(() => undefined)
  }, [loadNotes])

  useEffect(() => () => { room?.disconnect() }, [room])

  const activeParticipant = participants.find((participant) => participant.identity === activeIdentity)
    || participants.find((participant) => participant.getTrackPublication(Track.Source.ScreenShare)?.track)
    || participants[0]

  const join = async (settings: { name: string; camera: boolean; microphone: boolean; cameraId: string; microphoneId: string }) => {
    setJoining(true)
    setError('')
    try {
      if (meeting.status === 'scheduled' && meeting.isHost && startMeeting) {
        const startedMeeting = await startMeeting()
        onMeetingChange?.(startedMeeting)
      }
      const credentials = await getCredentials(settings.name)
      const nextRoom = new Room({ adaptiveStream: true, dynacast: true })
      const updateParticipants = () => setParticipants([
        nextRoom.localParticipant,
        ...nextRoom.remoteParticipants.values(),
      ])
      nextRoom.on(RoomEvent.ParticipantConnected, updateParticipants)
      nextRoom.on(RoomEvent.ParticipantDisconnected, updateParticipants)
      nextRoom.on(RoomEvent.TrackPublished, updateParticipants)
      nextRoom.on(RoomEvent.TrackUnpublished, updateParticipants)
      nextRoom.on(RoomEvent.TrackMuted, updateParticipants)
      nextRoom.on(RoomEvent.TrackUnmuted, updateParticipants)
      nextRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => setActiveIdentity(speakers[0]?.identity || ''))
      nextRoom.on(RoomEvent.ConnectionStateChanged, (state) => {
        setConnectionLabel(state === ConnectionState.Reconnecting ? 'Reconnecting…' : state === ConnectionState.Connected ? 'Connected' : state)
      })
      nextRoom.on(RoomEvent.MediaDevicesError, () => setError('A camera or microphone became unavailable.'))
      nextRoom.on(RoomEvent.TrackSubscribed, (track) => {
        updateParticipants()
        if (track.kind === Track.Kind.Audio && audioRoot.current) {
          audioRoot.current.appendChild(track.attach())
        }
      })
      nextRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
        updateParticipants()
        track.detach().forEach((element) => element.remove())
      })
      nextRoom.on(RoomEvent.Disconnected, () => {
        setRoom(null)
        setConnectionLabel('Meeting ended')
        setError('The meeting ended or your connection was closed.')
      })
      await nextRoom.connect(credentials.serverUrl, credentials.token)
      if (settings.microphone) {
        await nextRoom.localParticipant.setMicrophoneEnabled(true, settings.microphoneId ? { deviceId: settings.microphoneId } : undefined)
      }
      if (settings.camera) {
        await nextRoom.localParticipant.setCameraEnabled(true, settings.cameraId ? { deviceId: settings.cameraId } : undefined)
      }
      setMicrophoneEnabled(settings.microphone)
      setCameraEnabled(settings.camera)
      setRoom(nextRoom)
      updateParticipants()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The meeting could not be joined.')
    } finally {
      setJoining(false)
    }
  }

  const toggleMicrophone = async () => {
    if (!room) return
    try {
      await room.localParticipant.setMicrophoneEnabled(!microphoneEnabled)
      setMicrophoneEnabled((value) => !value)
    } catch { setError('The microphone could not be changed.') }
  }

  const toggleCamera = async () => {
    if (!room) return
    try {
      await room.localParticipant.setCameraEnabled(!cameraEnabled)
      setCameraEnabled((value) => !value)
    } catch { setError('The camera could not be changed.') }
  }

  const toggleScreen = async () => {
    if (!room) return
    try {
      await room.localParticipant.setScreenShareEnabled(!screenSharing)
      setScreenSharing((value) => !value)
      setParticipants([room.localParticipant, ...room.remoteParticipants.values()])
    } catch { setError('Screen sharing was cancelled or is unavailable.') }
  }

  const leave = () => {
    room?.disconnect()
    onLeave()
  }

  const end = async () => {
    if (!endMeeting || !window.confirm('End this meeting for everyone?')) return
    setEnding(true)
    try {
      const completed = await endMeeting()
      onMeetingChange?.(completed)
      room?.disconnect()
      onLeave()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The meeting could not be ended.')
    } finally {
      setEnding(false)
    }
  }

  const remove = async (identity: string) => {
    if (!removeParticipant) return
    try {
      await removeParticipant(identity)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The participant could not be removed.')
    }
  }

  const saveNote = async (event: FormEvent) => {
    event.preventDefault()
    if (!addNote || !noteBody.trim()) return
    setSavingNote(true)
    try {
      const note = await addNote(noteBody.trim())
      setNotes((current) => [...current, note])
      setNoteBody('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The note could not be saved.')
    } finally { setSavingNote(false) }
  }

  if (!room) {
    return <PreJoin meeting={meeting} initialName={displayName} guest={guest} companyName={companyName} busy={joining} error={error} onJoin={join} />
  }

  return (
    <main className={`lancee-meeting${guest ? ' lancee-meeting--guest' : ''}`}>
      <header className="lancee-meeting__header">
        <div className="lancee-meeting__identity">
          <div className="lancee-meeting__brand" aria-label="lancee"><BrandMark compact /><span>lancee</span></div>
          <div className="lancee-meeting__title"><div><span className="lancee-meeting__live">Live</span><h1>{meeting.title}</h1></div><p>{[meeting.clientName, meeting.projectName].filter(Boolean).join(' · ')}</p></div>
        </div>
        <div className="lancee-meeting__header-actions">
          <div className="lancee-meeting__meta"><span>{connectionLabel}</span><time>{elapsedLabel(meeting.startedAt || new Date().toISOString(), clock)}</time><span>{participants.length} participant{participants.length === 1 ? '' : 's'}</span></div>
          {meeting.isHost && !guest && <button type="button" className="lancee-meeting__end" onClick={() => void end()} disabled={ending}>{ending ? 'Ending…' : 'End meeting'}</button>}
        </div>
      </header>

      <section className="lancee-meeting__body">
        <div className="lancee-meeting__stage">
          {activeParticipant && <ParticipantTile participant={activeParticipant} active local={activeParticipant === room.localParticipant} canRemove={false} />}
          {participants.length > 1 && <div className="lancee-meeting__strip">{participants.filter((participant) => participant !== activeParticipant).map((participant) => <ParticipantTile key={participant.identity} participant={participant} active={false} local={participant === room.localParticipant} canRemove={false} />)}</div>}
        </div>

        {drawer && (
          <aside className="lancee-meeting__drawer" aria-label={`${drawer} panel`}>
            <header><h2>{drawer === 'participants' ? 'Participants' : drawer === 'notes' ? 'Internal notes' : 'Meeting information'}</h2><button type="button" onClick={() => setDrawer(null)} aria-label="Close panel">×</button></header>
            {drawer === 'participants' && <div className="lancee-meeting__people">{participants.map((participant) => (
              <div key={participant.identity}><span>{initials(participant.name || 'P')}</span><strong>{participant.name || 'Participant'}{participant === room.localParticipant ? ' (you)' : ''}</strong>{meeting.isHost && participant !== room.localParticipant && !guest && <button type="button" onClick={() => void remove(participant.identity)}>Remove</button>}</div>
            ))}</div>}
            {drawer === 'info' && <dl><dt>Scheduled</dt><dd>{new Date(meeting.scheduledStart).toLocaleString()}</dd>{meeting.clientName && <><dt>Client</dt><dd>{meeting.clientName}</dd></>}{meeting.projectName && <><dt>Project</dt><dd>{meeting.projectName}</dd></>}</dl>}
            {drawer === 'notes' && !guest && <><p className="lancee-meeting__private">Only workspace members can see these notes.</p><div className="lancee-meeting__notes">{notes.map((note) => <article key={note.id}><strong>{note.authorName}</strong><p>{note.body}</p><time>{new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></article>)}</div><form onSubmit={saveNote}><textarea required value={noteBody} onChange={(event) => setNoteBody(event.target.value)} placeholder="Capture a decision or follow-up…" /><button type="submit" disabled={savingNote}>{savingNote ? 'Saving…' : 'Add note'}</button></form></>}
          </aside>
        )}
      </section>

      {error && <div className="lancee-meeting__toast" role="alert">{error}<button type="button" onClick={() => setError('')}>×</button></div>}
      <footer className="lancee-meeting__controls">
        <button type="button" className={!microphoneEnabled ? 'is-off' : ''} onClick={() => void toggleMicrophone()}><Icon name="mic" /><span>{microphoneEnabled ? 'Mute' : 'Unmute'}</span></button>
        <button type="button" className={!cameraEnabled ? 'is-off' : ''} onClick={() => void toggleCamera()}><Icon name="camera" /><span>{cameraEnabled ? 'Camera' : 'Start video'}</span></button>
        <button type="button" className={screenSharing ? 'is-active' : ''} onClick={() => void toggleScreen()}><Icon name="screen" /><span>Share</span></button>
        <button type="button" className={drawer === 'participants' ? 'is-active' : ''} onClick={() => setDrawer(drawer === 'participants' ? null : 'participants')}><Icon name="people" /><span>People</span></button>
        {!guest && <button type="button" className={drawer === 'notes' ? 'is-active' : ''} onClick={() => setDrawer(drawer === 'notes' ? null : 'notes')}><Icon name="notes" /><span>Notes</span></button>}
        <button type="button" className={drawer === 'info' ? 'is-active' : ''} onClick={() => setDrawer(drawer === 'info' ? null : 'info')}><Icon name="info" /><span>Info</span></button>
        <button type="button" className="is-leave" onClick={leave}><Icon name="leave" /><span>Leave</span></button>
      </footer>
      <div ref={audioRoot} className="lancee-meeting__audio" />
    </main>
  )
}
