# Native lancee meetings

## Architecture assessment and implementation plan

The meeting implementation reuses the repository's existing systems:

- Express session authentication and active `workspace_members` authorization
- `calendar_events` for scheduling, project/client relationships, participants, and calendar display
- `projects` and `clients` as the work graph; no duplicate relationship models
- `workspace_events` plus Connected Intelligence's idempotent `meeting.created` and `meeting.completed` events
- existing project/client event linkage and meeting-load inspection
- workspace notifications and Hermes remain downstream consumers of the existing work graph
- existing CSS tokens, Diary page, toast handling, and dashboard navigation

The implementation sequence is: extend a calendar meeting with native meeting state, authorize every member or guest on the server, issue a short-lived LiveKit room token, render the call with lancee-owned React UI, and complete the existing calendar/Connected Intelligence lifecycle when the host ends the room.

```text
User -> lancee Meeting UI -> lancee Meeting API -> LiveKit -> Room

Meeting lifecycle -> calendar_events/workspace_events -> Connected Intelligence
                  -> project/client context -> Hermes/future intelligence
```

LiveKit supplies realtime media only. It is not the source of truth for meeting identity, scheduling, permissions, notes, guests, projects, clients, or lifecycle state.

## Local setup

Add these server-only values to `.env`:

```dotenv
LIVEKIT_URL=wss://your-livekit-host
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
```

Start lancee normally with `npm start`. The Diary can schedule meetings without LiveKit configured, but starting or joining a room returns a clear configuration error.

For local media testing, serve the app from `localhost` or HTTPS because browsers restrict camera, microphone, and screen capture on insecure origins.

## Production setup

Use a browser-reachable TLS LiveKit endpoint in `LIVEKIT_URL`. Keep the API key and secret in the lancee server environment and do not create `VITE_LIVEKIT_*` variables. Allow the lancee web origin to connect to the LiveKit endpoint through the deployment firewall/proxy. LiveKit ingress/egress services are optional and are not used by this phase.

## Persistence

`calendar_events` remains the canonical schedule. Three tables extend it:

- `meetings`: one-to-one native state, type, actual start/end, opaque room name, and guest-access flag
- `meeting_guest_invitations`: meeting-bound SHA-256 token hashes, expiry, and revocation
- `meeting_notes`: workspace-scoped internal notes with author and timestamps

There are no LiveKit credentials in meeting records. The IDs support future transcript, summary, decision, action-item, and Hermes records without changing the base meeting relationship.

## API surface

Authenticated workspace routes:

- `GET/POST /api/meetings`
- `GET /api/meetings/status`
- `GET /api/meetings/:meetingId`
- `POST /api/meetings/:meetingId/start|join-token|end|cancel`
- `POST /api/meetings/:meetingId/participants/remove`
- `GET/POST /api/meetings/:meetingId/notes`
- `GET/POST /api/meetings/:meetingId/invitations`
- `DELETE /api/meetings/:meetingId/invitations/:invitationId`

Meeting-only guest routes:

- `GET /api/meeting-guests/:token`
- `POST /api/meeting-guests/:token/join`

## Security boundary

lancee is the authorization authority. Authenticated routes derive the workspace and participant identity from the signed server session; submitted workspace IDs, room names, roles, and identities are not trusted. Meeting lookup always includes the authenticated workspace. Host operations require the creator or an active workspace owner/admin.

Guest invitation tokens contain 256 bits of randomness. Only their hashes are stored. Lookup checks the bound client meeting, guest-access flag, expiry, and revocation before issuing a guest identity scoped to that one LiveKit room. Guest routes do not create a workspace session and cannot access notes or authenticated workspace APIs.

LiveKit participant credentials are generated only on the server, expire after 15 minutes, and grant join/publish/subscribe/data access only to the resolved opaque room name. The LiveKit secret never appears in API responses or browser bundles.

Internal notes are never included in guest responses. Ending and participant removal resolve the room from the authorized meeting record, preventing a submitted room name from crossing workspaces.

## Manual test

1. Configure LiveKit and sign in as a workspace owner.
2. Open **Diary -> Meetings -> New meeting**.
3. Schedule an internal meeting with a project and verify it appears in Calendar.
4. Open it, preview/select devices, start it, and join from a second workspace-member browser.
5. Verify camera, microphone, screen share, participant drawer, internal notes, leave, remove participant, and end-for-all.
6. Schedule a client meeting with a client and external email, copy the generated guest link, and open it in a private window.
7. Verify the guest sees only the branded meeting flow, cannot see notes/project context/navigation, and can join only after the host starts.
8. End the meeting and verify completed status, actual duration, project/client relationship, and one `meeting.completed` event.
9. Revoke another guest link and confirm it fails; repeat with an expired test invitation.

## Known limitations and next phase

- Invitation links are generated for the host to send; a dedicated meeting email template/delivery job is not included.
- Waiting room, chat, recording, dial-in, moderation roles beyond host/member/guest, and recurring meetings are not included.
- Connected Intelligence receives creation/completion and relationship/duration data; participant join/leave signals are intentionally omitted to avoid noisy events.
- Transcription, summaries, decisions, action items, task creation, follow-up drafts, and an AI participant are extension points only. A later phase can attach a transcript pipeline to the stable meeting ID and route structured output through Hermes.
