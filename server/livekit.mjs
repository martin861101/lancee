import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'

const TOKEN_TTL_SECONDS = 15 * 60

export class LiveKitError extends Error {
  constructor(code, message, status = 502) {
    super(message)
    this.name = 'LiveKitError'
    this.code = code
    this.status = status
  }
}

function httpServiceUrl(value) {
  return value.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:')
}

export function createLiveKitService({ env = process.env } = {}) {
  const serverUrl = String(env.LIVEKIT_URL || '').trim().replace(/\/$/, '')
  const apiKey = String(env.LIVEKIT_API_KEY || '').trim()
  const apiSecret = String(env.LIVEKIT_API_SECRET || '').trim()
  const configured = Boolean(serverUrl && apiKey && apiSecret)
  const rooms = configured
    ? new RoomServiceClient(httpServiceUrl(serverUrl), apiKey, apiSecret)
    : null

  function requireConfiguration() {
    if (!configured) {
      throw new LiveKitError(
        'LIVEKIT_NOT_CONFIGURED',
        'Native meetings are not configured. Add the LiveKit server settings and try again.',
        503,
      )
    }
  }

  async function createRoom(meeting) {
    requireConfiguration()
    try {
      return await rooms.createRoom({
        name: meeting.livekitRoomName,
        emptyTimeout: 10 * 60,
        departureTimeout: 30,
        maxParticipants: 100,
        metadata: JSON.stringify({
          meetingId: meeting.id,
          meetingType: meeting.meetingType,
        }),
      })
    } catch (error) {
      if (/already exists/i.test(String(error?.message || ''))) return null
      throw new LiveKitError('LIVEKIT_ROOM_CREATE_FAILED', 'The meeting room could not be started.')
    }
  }

  async function participantToken({ meeting, identity, name, guest = false, host = false }) {
    requireConfiguration()
    try {
      const token = new AccessToken(apiKey, apiSecret, {
        identity,
        name,
        ttl: TOKEN_TTL_SECONDS,
        metadata: JSON.stringify({
          meetingId: meeting.id,
          participantType: guest ? 'guest' : 'member',
          host: Boolean(host),
        }),
      })
      token.addGrant({
        room: meeting.livekitRoomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
      })
      return {
        serverUrl,
        token: await token.toJwt(),
        expiresIn: TOKEN_TTL_SECONDS,
      }
    } catch (error) {
      if (error instanceof LiveKitError) throw error
      throw new LiveKitError('LIVEKIT_TOKEN_FAILED', 'Secure meeting access could not be issued.')
    }
  }

  async function endRoom(roomName) {
    requireConfiguration()
    try {
      await rooms.deleteRoom(roomName)
    } catch (error) {
      if (!/not found/i.test(String(error?.message || ''))) {
        throw new LiveKitError('LIVEKIT_ROOM_END_FAILED', 'The LiveKit room could not be ended.')
      }
    }
  }

  async function removeParticipant(roomName, identity) {
    requireConfiguration()
    try {
      await rooms.removeParticipant(roomName, identity)
    } catch {
      throw new LiveKitError('LIVEKIT_PARTICIPANT_REMOVE_FAILED', 'The participant could not be removed.')
    }
  }

  return {
    configured,
    createRoom,
    participantToken,
    endRoom,
    removeParticipant,
  }
}
