import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConnectedIntelligenceService } from '../server/connected-intelligence.mjs'
import { openDatabase } from '../server/database.mjs'
import { createLiveKitService } from '../server/livekit.mjs'
import { createMeetingService } from '../server/meetings.mjs'

const directory = mkdtempSync(join(tmpdir(), 'lancee-livekit-meetings-'))
let database
let currentTime = new Date('2026-09-01T09:00:00.000Z')
const issued = []
const rooms = new Set()
const livekit = {
  configured: true,
  async createRoom(meeting) { rooms.add(meeting.livekitRoomName) },
  async participantToken(input) {
    assert(rooms.has(input.meeting.livekitRoomName))
    issued.push(input)
    return { serverUrl: 'wss://livekit.example.test', token: `scoped-${issued.length}`, expiresIn: 900 }
  },
  async endRoom(roomName) { rooms.delete(roomName) },
  async removeParticipant(roomName) { assert(rooms.has(roomName)) },
}

try {
  database = await openDatabase({
    databasePath: join(directory, 'meetings.sqlite'),
    adminEmail: 'owner-a@example.test',
    adminName: 'Owner A',
    adminPasswordSalt: 'meeting-salt',
    adminPasswordHash: 'meeting-hash',
    workspaceId: 'wsp_meetings_a',
    workspaceName: 'Meeting Workspace A',
  })
  const contextA = await database.getContextByEmail('owner-a@example.test')
  const timestamp = currentTime.toISOString()
  await database.query(
    `INSERT INTO users (id, email, name, password_salt, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, 'salt', 'hash', $4, $4)`,
    ['usr_meetings_member', 'member-a@example.test', 'Member A', timestamp],
  )
  await database.query(
    `INSERT INTO workspace_members (id, workspace_id, user_id, role, status, joined_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'member', 'active', $4, $4, $4)`,
    ['wsm_meetings_member', contextA.workspace.id, 'usr_meetings_member', timestamp],
  )
  const memberContext = await database.getContextByIds('usr_meetings_member', contextA.workspace.id)
  await database.query(
    `INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $3)`,
    ['wsp_meetings_b', 'Meeting Workspace B', timestamp],
  )
  await database.query(
    `INSERT INTO users (id, email, name, password_salt, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, 'salt', 'hash', $4, $4)`,
    ['usr_meetings_b', 'owner-b@example.test', 'Owner B', timestamp],
  )
  await database.query(
    `INSERT INTO workspace_members (id, workspace_id, user_id, role, status, joined_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'owner', 'active', $4, $4, $4)`,
    ['wsm_meetings_b', 'wsp_meetings_b', 'usr_meetings_b', timestamp],
  )
  const contextB = await database.getContextByIds('usr_meetings_b', 'wsp_meetings_b')
  const client = await database.createClient({
    workspaceId: contextA.workspace.id,
    name: 'Kalahari Ember Gin',
    email: 'hello@kalahari.example.test',
  })
  const project = await database.createProject({
    workspaceId: contextA.workspace.id,
    name: 'Kalahari launch',
    clientId: client.id,
    client: client.name,
    status: 'In progress',
  })
  const intelligence = createConnectedIntelligenceService({ database, now: () => currentTime })
  const meetings = createMeetingService({ database, connectedIntelligence: intelligence, livekit, now: () => currentTime })

  const created = await meetings.create(contextA, {
    title: 'Kalahari client review',
    description: 'Review launch decisions.',
    meetingType: 'client',
    scheduledStart: '2026-09-01T09:30:00.000Z',
    scheduledEnd: '2026-09-01T10:30:00.000Z',
    projectId: project.id,
    clientId: client.id,
    externalParticipants: [{ email: 'client@example.test', name: 'Client Guest' }],
  })
  assert.equal(created.meeting.status, 'scheduled')
  assert.equal(created.meeting.workspaceId, contextA.workspace.id)
  assert.equal(created.meeting.projectId, project.id)
  assert.equal(created.meeting.clientId, client.id)
  assert.equal(created.invitations.length, 1)
  assert.equal((await meetings.list(contextA, { projectId: project.id }))[0].id, created.meeting.id)
  assert.equal((await meetings.list(contextA, { clientId: client.id }))[0].id, created.meeting.id)

  const calendar = await intelligence.listCalendarEvents(contextA)
  assert.equal(calendar.some((event) => event.id === created.meeting.id), true)
  const createdEvents = await database.query(
    `SELECT id FROM workspace_events WHERE workspace_id = $1 AND event_type = 'meeting.created' AND entity_id = $2`,
    [contextA.workspace.id, created.meeting.id],
  )
  assert.equal(createdEvents.length, 1)

  await assert.rejects(meetings.get(contextB, created.meeting.id), (error) => error.code === 'MEETING_NOT_FOUND')
  await assert.rejects(meetings.join(contextB, created.meeting.id), (error) => error.code === 'MEETING_NOT_FOUND')
  assert.equal(issued.length, 0)

  const invitation = created.invitations[0]
  const storedInvitation = (await database.query(
    `SELECT token_hash FROM meeting_guest_invitations WHERE id = $1`,
    [invitation.id],
  ))[0]
  assert.notEqual(storedInvitation.token_hash, invitation.token)
  assert.equal(storedInvitation.token_hash, createHash('sha256').update(invitation.token).digest('hex'))
  const guestMetadata = await meetings.guestMetadata(invitation.token)
  assert.equal(guestMetadata.title, created.meeting.title)
  assert.equal('projectId' in guestMetadata, false)
  assert.equal('clientId' in guestMetadata, false)
  assert.equal('notes' in guestMetadata, false)
  await assert.rejects(meetings.guestJoin(invitation.token, {}), (error) => error.code === 'MEETING_NOT_LIVE')
  await assert.rejects(meetings.start(memberContext, created.meeting.id), (error) => error.code === 'MEETING_HOST_REQUIRED')

  currentTime = new Date('2026-09-01T09:25:00.000Z')
  const live = await meetings.start(contextA, created.meeting.id)
  assert.equal(live.status, 'live')
  const memberCredentials = await meetings.join(contextA, created.meeting.id)
  const regularMemberCredentials = await meetings.join(memberContext, created.meeting.id)
  const guestCredentials = await meetings.guestJoin(invitation.token, {})
  assert.equal(memberCredentials.expiresIn, 900)
  assert.equal(regularMemberCredentials.expiresIn, 900)
  assert.equal(guestCredentials.expiresIn, 900)
  assert.equal(issued[0].identity, `member:${contextA.user.id}`)
  assert.equal(issued[0].host, true)
  assert.equal(issued[1].identity, `member:${memberContext.user.id}`)
  assert.equal(issued[1].host, false)
  assert.equal(issued[2].identity, `guest:${invitation.id}`)
  assert.equal(issued[2].guest, true)
  assert.equal(issued[0].meeting.livekitRoomName, issued[2].meeting.livekitRoomName)

  const tokenService = createLiveKitService({ env: {
    LIVEKIT_URL: 'wss://livekit.example.test',
    LIVEKIT_API_KEY: 'meeting-test-key',
    LIVEKIT_API_SECRET: 'meeting-test-secret-with-at-least-thirty-two-characters',
  } })
  const signed = await tokenService.participantToken({
    meeting: { id: created.meeting.id, livekitRoomName: issued[0].meeting.livekitRoomName },
    identity: 'member:verified',
    name: 'Verified Member',
  })
  const claims = JSON.parse(Buffer.from(signed.token.split('.')[1], 'base64url').toString('utf8'))
  assert.equal(claims.video.room, issued[0].meeting.livekitRoomName)
  assert.equal(claims.video.roomJoin, true)
  assert.equal(claims.exp - claims.nbf, 900)

  const note = await meetings.addNote(contextA, created.meeting.id, { body: 'Internal decision only.' })
  assert.equal(note.authorId, contextA.user.id)
  assert.equal((await meetings.listNotes(contextA, created.meeting.id)).length, 1)
  await assert.rejects(meetings.listNotes(contextB, created.meeting.id), (error) => error.code === 'MEETING_NOT_FOUND')

  const expired = await meetings.createInvitation(contextA, created.meeting.id, {
    guestName: 'Expired guest',
    expiresAt: '2026-09-01T09:26:00.000Z',
  })
  currentTime = new Date('2026-09-01T09:27:00.000Z')
  await assert.rejects(meetings.guestMetadata(expired.token), (error) => error.code === 'MEETING_INVITATION_INVALID')

  const revoked = await meetings.createInvitation(contextA, created.meeting.id, { guestName: 'Revoked guest' })
  await meetings.revokeInvitation(contextA, created.meeting.id, revoked.id)
  await assert.rejects(meetings.guestMetadata(revoked.token), (error) => error.code === 'MEETING_INVITATION_INVALID')

  currentTime = new Date('2026-09-01T10:10:00.000Z')
  const completed = await meetings.end(contextA, created.meeting.id)
  assert.equal(completed.status, 'completed')
  assert.equal(completed.durationMinutes, 45)
  assert.equal((await meetings.end(contextA, created.meeting.id)).status, 'completed')
  const completedEvents = await database.query(
    `SELECT payload_json FROM workspace_events
     WHERE workspace_id = $1 AND event_type = 'meeting.completed' AND entity_id = $2`,
    [contextA.workspace.id, created.meeting.id],
  )
  assert.equal(completedEvents.length, 1)
  assert.equal(JSON.parse(completedEvents[0].payload_json).meetingType, 'client')
  assert.equal(JSON.parse(completedEvents[0].payload_json).durationMinutes, 45)

  const serverSource = readFileSync(new URL('../server/index.mjs', import.meta.url), 'utf8')
  assert.match(serverSource, /app\.get\('\/api\/meetings', requireAuth, requireWorkspaceMember/)
  assert.match(serverSource, /app\.get\('\/api\/meetings\/:meetingId\/notes', requireAuth, requireWorkspaceMember/)
  assert.match(serverSource, /app\.post\('\/api\/meeting-guests\/:token\/join', secureMutations/)
  assert.match(serverSource, /const livekitCspSources =/)
  assert.match(serverSource, /\$\{livekitCspSources\.join\(' '\)\}/)
  const browserSources = [
    '../src/lib/api.ts',
    '../src/App.tsx',
    '../src/components/meetings/MeetingRoom.tsx',
    '../src/components/meetings/GuestMeetingPage.tsx',
  ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n')
  assert.doesNotMatch(browserSources, /LIVEKIT_API_SECRET/)

  console.log('Native meetings verified: workspace isolation, project/client/calendar links, lifecycle idempotency, scoped member/guest access, invitation expiry/revocation, and internal notes.')
} finally {
  await database?.close()
  rmSync(directory, { recursive: true, force: true })
}
