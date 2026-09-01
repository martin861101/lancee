import { createHash, randomBytes, randomUUID } from 'node:crypto'

const MAX_MEETING_LENGTH_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_GUEST_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

export class MeetingError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'MeetingError'
    this.code = code
    this.status = status
  }
}

function text(value, field, maximum, required = false) {
  const normalized = String(value ?? '').trim()
  if (required && !normalized) throw new MeetingError('MEETING_INVALID', `${field} is required.`)
  if (normalized.length > maximum) throw new MeetingError('MEETING_INVALID', `${field} is too long.`)
  return normalized
}

function isoDate(value, field) {
  const timestamp = Date.parse(String(value || ''))
  if (!Number.isFinite(timestamp)) throw new MeetingError('MEETING_INVALID', `${field} must be a valid date-time.`)
  return new Date(timestamp).toISOString()
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function parseJson(value, fallback) {
  try {
    return (typeof value === 'string' ? JSON.parse(value) : value) ?? fallback
  } catch {
    return fallback
  }
}

function mapInvitation(row) {
  if (!row) return null
  return {
    id: row.id,
    meetingId: row.meeting_id,
    email: row.email || null,
    guestName: row.guest_name || null,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at || null,
    createdAt: row.created_at,
  }
}

function mapMeeting(row, context = null) {
  if (!row) return null
  const startedAt = row.started_at || null
  const endedAt = row.ended_at || null
  const scheduledStart = row.start_at
  const scheduledEnd = row.end_at
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    description: row.description || '',
    meetingType: row.meeting_type,
    status: row.meeting_status || row.status,
    projectId: row.project_id || null,
    projectName: row.project_name || null,
    clientId: row.client_id || null,
    clientName: row.client_name || null,
    createdBy: row.created_by,
    creatorName: row.creator_name || null,
    scheduledStart,
    scheduledEnd,
    startedAt,
    endedAt,
    durationMinutes: endedAt && startedAt
      ? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60_000))
      : Math.max(0, Math.round((Date.parse(scheduledEnd) - Date.parse(scheduledStart)) / 60_000)),
    guestAccessEnabled: Boolean(row.guest_access_enabled),
    participants: parseJson(row.participants_json, []),
    createdAt: row.meeting_created_at || row.created_at,
    updatedAt: row.meeting_updated_at || row.updated_at,
    isHost: Boolean(context && (
      row.created_by === context.user?.id || ['owner', 'admin'].includes(context.membership?.role)
    )),
  }
}

export function createMeetingService({ database, connectedIntelligence, livekit, now = () => new Date() }) {
  function trustedContext(context, { write = false } = {}) {
    const workspaceId = String(context?.workspace?.id || '')
    const userId = String(context?.user?.id || '')
    if (!workspaceId || !userId || context?.membership?.status !== 'active') {
      throw new MeetingError('MEETING_AUTH_REQUIRED', 'An active workspace membership is required.', 403)
    }
    if (write && context.membership.role === 'viewer') {
      throw new MeetingError('MEETING_WRITE_DENIED', 'Workspace write access is required.', 403)
    }
    return { workspaceId, userId }
  }

  async function meetingRow(workspaceId, meetingId) {
    const rows = await database.query(
      `SELECT meetings.id, meetings.workspace_id, meetings.description, meetings.meeting_type,
              meetings.status AS meeting_status, meetings.started_at, meetings.ended_at,
              meetings.livekit_room_name, meetings.guest_access_enabled,
              meetings.created_at AS meeting_created_at, meetings.updated_at AS meeting_updated_at,
              calendar_events.title, calendar_events.created_by, calendar_events.project_id,
              calendar_events.client_id, calendar_events.start_at, calendar_events.end_at,
              calendar_events.participants_json, projects.name AS project_name,
              clients.name AS client_name, users.name AS creator_name
       FROM meetings
       JOIN calendar_events
         ON calendar_events.workspace_id = meetings.workspace_id
        AND calendar_events.id = meetings.id
       LEFT JOIN projects
         ON projects.workspace_id = meetings.workspace_id
        AND projects.id = calendar_events.project_id
       LEFT JOIN clients
         ON clients.workspace_id = meetings.workspace_id
        AND clients.id = calendar_events.client_id
       LEFT JOIN users ON users.id = calendar_events.created_by
       WHERE meetings.workspace_id = $1 AND meetings.id = $2`,
      [workspaceId, meetingId],
    )
    return rows[0] || null
  }

  function assertHost(context, row) {
    if (row.created_by !== context.user.id && !['owner', 'admin'].includes(context.membership.role)) {
      throw new MeetingError('MEETING_HOST_REQUIRED', 'Meeting host access is required.', 403)
    }
  }

  async function validateMemberParticipants(workspaceId, participants) {
    if (!Array.isArray(participants) || participants.length > 100) {
      throw new MeetingError('MEETING_INVALID', 'participants must be a bounded list.')
    }
    const normalized = [...new Set(participants.map((item) => text(item, 'participant', 320)).filter(Boolean))]
    if (!normalized.length) return []
    const rows = await database.query(
      `SELECT users.id, users.email
       FROM workspace_members
       JOIN users ON users.id = workspace_members.user_id
       WHERE workspace_members.workspace_id = $1 AND workspace_members.status = 'active'`,
      [workspaceId],
    )
    const allowed = new Set(rows.flatMap((row) => [row.id, String(row.email || '').toLowerCase()]))
    if (normalized.some((item) => !allowed.has(item) && !allowed.has(item.toLowerCase()))) {
      throw new MeetingError('MEETING_PARTICIPANT_INVALID', 'Every internal participant must be an active workspace member.', 403)
    }
    return normalized
  }

  function normalizeExternalParticipants(value) {
    if (value === undefined) return []
    if (!Array.isArray(value) || value.length > 100) {
      throw new MeetingError('MEETING_INVALID', 'externalParticipants must be a bounded list.')
    }
    return value.map((item) => {
      const source = typeof item === 'string' ? { email: item } : (item || {})
      return {
        email: text(source.email, 'guest email', 320),
        guestName: text(source.name, 'guest name', 120),
      }
    }).filter((item) => item.email || item.guestName)
  }

  async function insertInvitation({ workspaceId, meetingId, userId, email = '', guestName = '', expiresAt = null }) {
    const token = randomBytes(32).toString('base64url')
    const id = `mgi_${randomUUID().replaceAll('-', '')}`
    const timestamp = now().toISOString()
    const expiry = expiresAt
      ? isoDate(expiresAt, 'expiresAt')
      : new Date(now().getTime() + DEFAULT_GUEST_EXPIRY_MS).toISOString()
    if (Date.parse(expiry) <= now().getTime()) {
      throw new MeetingError('MEETING_INVITATION_INVALID', 'Guest invitation expiry must be in the future.')
    }
    await database.query(
      `INSERT INTO meeting_guest_invitations (
         id, meeting_id, workspace_id, created_by, token_hash, email, guest_name,
         expires_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [id, meetingId, workspaceId, userId, hashToken(token), email || null, guestName || null, expiry, timestamp],
    )
    return { id, meetingId, email: email || null, guestName: guestName || null, expiresAt: expiry, token }
  }

  async function create(context, input) {
    const { workspaceId, userId } = trustedContext(context, { write: true })
    const title = text(input?.title, 'title', 200, true)
    const description = text(input?.description, 'description', 4_000)
    const meetingType = String(input?.meetingType || '')
    if (!['internal', 'client'].includes(meetingType)) {
      throw new MeetingError('MEETING_INVALID', 'meetingType must be internal or client.')
    }
    const scheduledStart = isoDate(input?.scheduledStart, 'scheduledStart')
    const scheduledEnd = isoDate(input?.scheduledEnd, 'scheduledEnd')
    const duration = Date.parse(scheduledEnd) - Date.parse(scheduledStart)
    if (duration < 60_000 || duration > MAX_MEETING_LENGTH_MS) {
      throw new MeetingError('MEETING_INVALID', 'The meeting must last between one minute and seven days.')
    }
    const participants = await validateMemberParticipants(workspaceId, input?.participants || [])
    const externalParticipants = normalizeExternalParticipants(input?.externalParticipants)
    if (meetingType === 'internal' && externalParticipants.length) {
      throw new MeetingError('MEETING_GUESTS_DENIED', 'Internal meetings cannot invite external guests.')
    }
    const guestAccessEnabled = meetingType === 'client' && input?.guestAccessEnabled !== false

    return database.transaction(async () => {
      const calendar = await connectedIntelligence.createCalendarEvent(context, {
        title,
        kind: 'meeting',
        startAt: scheduledStart,
        endAt: scheduledEnd,
        projectId: input?.projectId || null,
        clientId: input?.clientId || null,
        participants: [...participants, ...externalParticipants.map((item) => item.email).filter(Boolean)],
        meetingType,
        source: 'lancee-native-meeting',
      }, { transactional: false })
      if (meetingType === 'client' && !calendar.clientId) {
        throw new MeetingError('MEETING_CLIENT_REQUIRED', 'Client meetings must be linked to a client.')
      }
      const timestamp = now().toISOString()
      await database.query(
        `INSERT INTO meetings (
           id, workspace_id, description, meeting_type, status, livekit_room_name,
           guest_access_enabled, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'scheduled', $5, $6, $7, $7)`,
        [
          calendar.id,
          workspaceId,
          description,
          meetingType,
          `lkr_${randomBytes(24).toString('hex')}`,
          guestAccessEnabled ? 1 : 0,
          timestamp,
        ],
      )
      const invitations = []
      if (guestAccessEnabled) {
        for (const participant of externalParticipants) {
          invitations.push(await insertInvitation({
            workspaceId,
            meetingId: calendar.id,
            userId,
            expiresAt: new Date(Date.parse(scheduledEnd) + 24 * 60 * 60 * 1_000).toISOString(),
            ...participant,
          }))
        }
      }
      return {
        meeting: mapMeeting(await meetingRow(workspaceId, calendar.id), context),
        invitations,
      }
    })
  }

  async function list(context, filters = {}) {
    const { workspaceId } = trustedContext(context)
    await connectedIntelligence.completeDueMeetings({ workspaceId })
    await database.query(
      `UPDATE meetings
       SET status = 'completed', ended_at = COALESCE(ended_at, (
         SELECT completed_at FROM calendar_events WHERE calendar_events.id = meetings.id
       )), updated_at = $1
       WHERE workspace_id = $2 AND status IN ('scheduled', 'live')
         AND id IN (SELECT id FROM calendar_events WHERE workspace_id = $2 AND status = 'completed')`,
      [now().toISOString(), workspaceId],
    )
    const params = [workspaceId]
    const conditions = ['meetings.workspace_id = $1']
    for (const [field, column] of [['projectId', 'calendar_events.project_id'], ['clientId', 'calendar_events.client_id']]) {
      if (filters[field]) {
        params.push(String(filters[field]))
        conditions.push(`${column} = $${params.length}`)
      }
    }
    const rows = await database.query(
      `SELECT meetings.id, meetings.workspace_id, meetings.description, meetings.meeting_type,
              meetings.status AS meeting_status, meetings.started_at, meetings.ended_at,
              meetings.guest_access_enabled, meetings.created_at AS meeting_created_at,
              meetings.updated_at AS meeting_updated_at, calendar_events.title,
              calendar_events.created_by, calendar_events.project_id, calendar_events.client_id,
              calendar_events.start_at, calendar_events.end_at, calendar_events.participants_json,
              projects.name AS project_name, clients.name AS client_name, users.name AS creator_name
       FROM meetings
       JOIN calendar_events ON calendar_events.id = meetings.id AND calendar_events.workspace_id = meetings.workspace_id
       LEFT JOIN projects ON projects.id = calendar_events.project_id AND projects.workspace_id = meetings.workspace_id
       LEFT JOIN clients ON clients.id = calendar_events.client_id AND clients.workspace_id = meetings.workspace_id
       LEFT JOIN users ON users.id = calendar_events.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY calendar_events.start_at ASC`,
      params,
    )
    return rows.map((row) => mapMeeting(row, context))
  }

  async function get(context, meetingId) {
    const { workspaceId } = trustedContext(context)
    const row = await meetingRow(workspaceId, text(meetingId, 'meeting id', 160, true))
    if (!row) throw new MeetingError('MEETING_NOT_FOUND', 'Meeting not found.', 404)
    return mapMeeting(row, context)
  }

  async function start(context, meetingId) {
    const { workspaceId } = trustedContext(context, { write: true })
    const row = await meetingRow(workspaceId, meetingId)
    if (!row) throw new MeetingError('MEETING_NOT_FOUND', 'Meeting not found.', 404)
    assertHost(context, row)
    if (row.meeting_status === 'cancelled' || row.meeting_status === 'completed') {
      throw new MeetingError('MEETING_NOT_JOINABLE', `This meeting is ${row.meeting_status}.`, 409)
    }
    if (row.meeting_status === 'scheduled') {
      await livekit.createRoom({
        ...mapMeeting(row, context),
        livekitRoomName: row.livekit_room_name,
      })
      const timestamp = now().toISOString()
      await database.query(
        `UPDATE meetings SET status = 'live', started_at = $1, updated_at = $1
         WHERE workspace_id = $2 AND id = $3 AND status = 'scheduled'`,
        [timestamp, workspaceId, row.id],
      )
    }
    return get(context, row.id)
  }

  async function join(context, meetingId) {
    const { workspaceId, userId } = trustedContext(context)
    const row = await meetingRow(workspaceId, meetingId)
    if (!row) throw new MeetingError('MEETING_NOT_FOUND', 'Meeting not found.', 404)
    if (row.meeting_status !== 'live') {
      throw new MeetingError('MEETING_NOT_LIVE', row.meeting_status === 'scheduled'
        ? 'The host has not started this meeting yet.'
        : `This meeting is ${row.meeting_status}.`, 409)
    }
    return livekit.participantToken({
      meeting: { ...mapMeeting(row, context), livekitRoomName: row.livekit_room_name },
      identity: `member:${userId}`,
      name: context.user.name,
      host: row.created_by === userId || ['owner', 'admin'].includes(context.membership.role),
    })
  }

  async function end(context, meetingId) {
    const { workspaceId } = trustedContext(context, { write: true })
    const row = await meetingRow(workspaceId, meetingId)
    if (!row) throw new MeetingError('MEETING_NOT_FOUND', 'Meeting not found.', 404)
    assertHost(context, row)
    if (row.meeting_status === 'completed') return mapMeeting(row, context)
    if (row.meeting_status !== 'live') throw new MeetingError('MEETING_NOT_LIVE', 'Only a live meeting can be ended.', 409)
    await livekit.endRoom(row.livekit_room_name)
    const timestamp = now().toISOString()
    await database.transaction(async () => {
      await database.query(
        `UPDATE meetings SET status = 'completed', ended_at = $1, updated_at = $1
         WHERE workspace_id = $2 AND id = $3 AND status = 'live'`,
        [timestamp, workspaceId, row.id],
      )
      await connectedIntelligence.completeDueMeetings({
        workspaceId,
        eventId: row.id,
        completedAt: timestamp,
        force: true,
      })
    })
    return get(context, row.id)
  }

  async function cancel(context, meetingId) {
    const { workspaceId } = trustedContext(context, { write: true })
    const row = await meetingRow(workspaceId, meetingId)
    if (!row) throw new MeetingError('MEETING_NOT_FOUND', 'Meeting not found.', 404)
    assertHost(context, row)
    if (row.meeting_status === 'live') throw new MeetingError('MEETING_LIVE', 'End the live meeting instead.', 409)
    if (row.meeting_status === 'completed') throw new MeetingError('MEETING_COMPLETED', 'Completed meetings cannot be cancelled.', 409)
    const timestamp = now().toISOString()
    await database.transaction(async () => {
      await database.query(
        `UPDATE meetings SET status = 'cancelled', updated_at = $1 WHERE workspace_id = $2 AND id = $3`,
        [timestamp, workspaceId, row.id],
      )
      await database.query(
        `UPDATE calendar_events SET status = 'cancelled', updated_at = $1 WHERE workspace_id = $2 AND id = $3`,
        [timestamp, workspaceId, row.id],
      )
    })
    return get(context, row.id)
  }

  async function createInvitation(context, meetingId, input) {
    const { workspaceId, userId } = trustedContext(context, { write: true })
    const row = await meetingRow(workspaceId, meetingId)
    if (!row) throw new MeetingError('MEETING_NOT_FOUND', 'Meeting not found.', 404)
    assertHost(context, row)
    if (row.meeting_type !== 'client' || !row.guest_access_enabled) {
      throw new MeetingError('MEETING_GUESTS_DENIED', 'Guest access is not enabled for this meeting.', 403)
    }
    return insertInvitation({
      workspaceId,
      meetingId: row.id,
      userId,
      email: text(input?.email, 'guest email', 320),
      guestName: text(input?.guestName, 'guest name', 120),
      expiresAt: input?.expiresAt || new Date(
        Math.max(now().getTime() + DEFAULT_GUEST_EXPIRY_MS, Date.parse(row.end_at) + 24 * 60 * 60 * 1_000),
      ).toISOString(),
    })
  }

  async function listInvitations(context, meetingId) {
    const { workspaceId } = trustedContext(context)
    const row = await meetingRow(workspaceId, meetingId)
    if (!row) throw new MeetingError('MEETING_NOT_FOUND', 'Meeting not found.', 404)
    assertHost(context, row)
    const invitations = await database.query(
      `SELECT * FROM meeting_guest_invitations
       WHERE workspace_id = $1 AND meeting_id = $2 ORDER BY created_at ASC`,
      [workspaceId, meetingId],
    )
    return invitations.map(mapInvitation)
  }

  async function revokeInvitation(context, meetingId, invitationId) {
    const { workspaceId } = trustedContext(context, { write: true })
    const row = await meetingRow(workspaceId, meetingId)
    if (!row) throw new MeetingError('MEETING_NOT_FOUND', 'Meeting not found.', 404)
    assertHost(context, row)
    const timestamp = now().toISOString()
    const updated = await database.query(
      `UPDATE meeting_guest_invitations SET revoked_at = $1, updated_at = $1
       WHERE workspace_id = $2 AND meeting_id = $3 AND id = $4 AND revoked_at IS NULL
       RETURNING *`,
      [timestamp, workspaceId, meetingId, invitationId],
    )
    if (!updated[0]) throw new MeetingError('MEETING_INVITATION_NOT_FOUND', 'Guest invitation not found.', 404)
    return mapInvitation(updated[0])
  }

  async function invitationRow(token) {
    const tokenHash = hashToken(text(token, 'guest token', 200, true))
    const rows = await database.query(
      `SELECT meeting_guest_invitations.*, meetings.description, meetings.meeting_type,
              meetings.status AS meeting_status, meetings.livekit_room_name,
              meetings.guest_access_enabled, calendar_events.title, calendar_events.start_at,
              calendar_events.end_at, calendar_events.created_by, workspaces.name AS workspace_name,
              users.name AS creator_name
       FROM meeting_guest_invitations
       JOIN meetings ON meetings.id = meeting_guest_invitations.meeting_id
                    AND meetings.workspace_id = meeting_guest_invitations.workspace_id
       JOIN calendar_events ON calendar_events.id = meetings.id
       JOIN workspaces ON workspaces.id = meetings.workspace_id
       LEFT JOIN users ON users.id = calendar_events.created_by
       WHERE meeting_guest_invitations.token_hash = $1`,
      [tokenHash],
    )
    const row = rows[0]
    if (!row || row.revoked_at || Date.parse(row.expires_at) <= now().getTime()) {
      throw new MeetingError('MEETING_INVITATION_INVALID', 'This guest invitation is invalid, expired, or revoked.', 410)
    }
    if (row.meeting_type !== 'client' || !row.guest_access_enabled) {
      throw new MeetingError('MEETING_GUESTS_DENIED', 'Guest access is unavailable for this meeting.', 403)
    }
    return row
  }

  async function guestMetadata(token) {
    const row = await invitationRow(token)
    return {
      title: row.title,
      status: row.meeting_status,
      scheduledStart: row.start_at,
      scheduledEnd: row.end_at,
      guestName: row.guest_name || null,
      hostName: row.creator_name || null,
      companyName: row.workspace_name,
    }
  }

  async function guestJoin(token, input) {
    const row = await invitationRow(token)
    if (row.meeting_status !== 'live') {
      throw new MeetingError('MEETING_NOT_LIVE', row.meeting_status === 'scheduled'
        ? 'The host has not started this meeting yet.'
        : `This meeting is ${row.meeting_status}.`, 409)
    }
    const name = row.guest_name || text(input?.displayName, 'display name', 120, true)
    return livekit.participantToken({
      meeting: {
        id: row.meeting_id,
        workspaceId: row.workspace_id,
        meetingType: row.meeting_type,
        livekitRoomName: row.livekit_room_name,
      },
      identity: `guest:${row.id}`,
      name,
      guest: true,
    })
  }

  async function listNotes(context, meetingId) {
    const { workspaceId } = trustedContext(context)
    if (!await meetingRow(workspaceId, meetingId)) throw new MeetingError('MEETING_NOT_FOUND', 'Meeting not found.', 404)
    const rows = await database.query(
      `SELECT meeting_notes.*, users.name AS author_name
       FROM meeting_notes JOIN users ON users.id = meeting_notes.author_id
       WHERE meeting_notes.workspace_id = $1 AND meeting_notes.meeting_id = $2
       ORDER BY meeting_notes.created_at ASC`,
      [workspaceId, meetingId],
    )
    return rows.map((row) => ({
      id: row.id,
      meetingId: row.meeting_id,
      authorId: row.author_id,
      authorName: row.author_name,
      body: row.body,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  async function addNote(context, meetingId, input) {
    const { workspaceId, userId } = trustedContext(context, { write: true })
    if (!await meetingRow(workspaceId, meetingId)) throw new MeetingError('MEETING_NOT_FOUND', 'Meeting not found.', 404)
    const body = text(input?.body, 'note', 10_000, true)
    const id = `mtn_${randomUUID().replaceAll('-', '')}`
    const timestamp = now().toISOString()
    await database.query(
      `INSERT INTO meeting_notes (id, meeting_id, workspace_id, author_id, body, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)`,
      [id, meetingId, workspaceId, userId, body, timestamp],
    )
    return (await listNotes(context, meetingId)).find((note) => note.id === id)
  }

  async function removeParticipant(context, meetingId, identity) {
    const { workspaceId } = trustedContext(context, { write: true })
    const row = await meetingRow(workspaceId, meetingId)
    if (!row) throw new MeetingError('MEETING_NOT_FOUND', 'Meeting not found.', 404)
    assertHost(context, row)
    if (row.meeting_status !== 'live') throw new MeetingError('MEETING_NOT_LIVE', 'This meeting is not live.', 409)
    const participantIdentity = text(identity, 'participant identity', 256, true)
    await livekit.removeParticipant(row.livekit_room_name, participantIdentity)
  }

  return {
    create,
    list,
    get,
    start,
    join,
    end,
    cancel,
    createInvitation,
    listInvitations,
    revokeInvitation,
    guestMetadata,
    guestJoin,
    listNotes,
    addNote,
    removeParticipant,
  }
}
