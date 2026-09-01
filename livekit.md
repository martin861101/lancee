Agent Task: Implement Native Lancee Meetings with LiveKit

You are working inside the Lancee repository.

Your task is to implement Lancee's native meeting system using LiveKit as the realtime audio/video infrastructure.

This must feel like a native Lancee capability, not an embedded third-party conferencing product.

Core Principle

LiveKit is infrastructure only.

Lancee owns:

- Meeting UI
- Meeting lifecycle
- Scheduling
- Authentication
- Guest access
- Workspace permissions
- Client/project relationships
- Notes
- Tasks
- Meeting metadata
- Connected Intelligence events
- Future transcripts and AI functionality

Do not redesign Lancee's architecture unnecessarily.

Before changing code, inspect the existing repository and identify:

- frontend architecture
- backend/API architecture
- authentication implementation
- workspace and membership model
- client model
- project model
- calendar implementation
- Connected Intelligence implementation
- existing meeting tables/models
- existing "meeting.created" / "meeting.completed" events
- notification system
- Hermes integration
- existing permission helpers
- existing design system/components
- environment-variable conventions

Reuse existing systems wherever possible.

---

PHASE 1: Architecture Assessment

Before implementation, inspect the repository and write a short implementation plan.

Determine what already exists for:

- meetings
- calendar events
- workspace members
- clients
- projects
- notifications
- activity/events
- Connected Intelligence
- AI/Hermes

Do not create duplicate models if Lancee already has suitable structures.

Document the intended flow:

User
→ Lancee Meeting UI
→ Lancee Meeting API
→ LiveKit
→ Room

And separately:

Meeting lifecycle
→ Lancee events
→ Connected Intelligence
→ project/client context

Then implement.

---

PHASE 2: LiveKit Infrastructure

Add LiveKit support to the Lancee backend.

Required environment configuration:

LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET

Never expose the API secret to the frontend.

Create a server-side LiveKit service responsible for:

- creating rooms
- generating participant tokens
- generating guest tokens
- room metadata
- terminating rooms where appropriate

All LiveKit token generation MUST happen server-side.

Tokens should contain the minimum permissions required.

Do not allow the frontend to arbitrarily request access to any room.

The Lancee backend must validate access first.

---

PHASE 3: Lancee Meeting Model

Reuse the existing meeting/calendar structures where practical.

A Lancee meeting should support at minimum:

- id
- workspaceId
- title
- description
- meetingType
- status
- projectId nullable
- clientId nullable
- createdBy
- scheduledStart
- scheduledEnd
- startedAt
- endedAt
- livekitRoomName
- guestAccessEnabled
- createdAt
- updatedAt

Meeting types:

internal
client

Statuses:

scheduled
live
completed
cancelled

Do not store LiveKit credentials in meeting records.

Use opaque/non-predictable identifiers for room names where appropriate.

---

PHASE 4: Permissions

Meeting permissions must follow Lancee workspace authorization.

Internal meetings:

Only authorized workspace members may join.

Client meetings:

Workspace members join through normal Lancee authentication.

External clients may join through secure guest invitations.

A guest must NEVER gain normal workspace access.

Guest access must be scoped exclusively to the meeting.

Implement server-issued guest tokens/invitations with:

- cryptographically secure token
- hashed token storage where appropriate
- expiration
- meeting binding
- optional guest name
- revocation
- single meeting scope

Do not trust:

workspaceId
meetingId
role
participant identity

simply because the frontend submitted them.

Resolve and validate permissions server-side.

---

PHASE 5: Meeting Creation

Add native meeting creation.

Users should be able to create:

Internal Meeting

Fields:

- title
- date/time
- duration
- participants
- optional project

Client Meeting

Fields:

- title
- date/time
- duration
- client
- optional project
- external participants

When a meeting is created:

1. Validate workspace permissions.
2. Persist the Lancee meeting.
3. Associate the project/client where applicable.
4. Create/update the corresponding Lancee calendar event using the existing calendar architecture.
5. Emit the existing Connected Intelligence meeting-created event if available.
6. Generate invitations as required.

Do not create a second disconnected scheduling system.

---

PHASE 6: Meeting UI

Build a native Lancee meeting interface.

Follow Lancee's existing premium visual language.

Do NOT copy LiveKit's default UI.

Required layout:

Main stage

Large active speaker/video area.

Participant strip/grid

Responsive participant video tiles.

Bottom control bar

Controls:

- microphone
- camera
- screen share
- participants
- meeting information
- leave

Host-only controls where appropriate:

- remove participant
- end meeting

Meeting header

Show:

- meeting title
- client/project context where applicable
- meeting duration
- participant count

Keep the UI calm, minimal and professional.

Avoid excessive gradients, oversized cards, generic SaaS styling or unnecessary visual noise.

Use Lancee's existing components and tokens.

---

PHASE 7: Pre-Join Experience

Create a pre-join screen.

Before entering, allow the participant to:

- preview camera
- select camera
- select microphone
- test microphone
- toggle camera
- toggle microphone
- choose/display participant name where applicable

Workspace users should inherit their Lancee identity.

Guests should enter a display name if one was not provided.

Do not join the LiveKit room until the user explicitly selects Join Meeting.

---

PHASE 8: Guest Meeting Experience

Guest links should open a minimal Lancee-branded meeting experience.

Guests must NOT see:

- Lancee navigation
- workspace dashboard
- internal project information
- internal notes
- Connected Intelligence data
- internal participants' private metadata
- admin controls

They should see only:

meeting title
host/company identity where appropriate
pre-join controls
meeting room
basic participant controls

The experience should still feel premium and intentional.

---

PHASE 9: Project and Client Context

Meetings should integrate into Lancee's existing work graph.

A project-linked meeting should appear in the project's relevant activity/history area.

A client-linked meeting should appear in the client's relevant activity/history area.

Do not duplicate activity systems if one already exists.

Meeting context should eventually be accessible to Connected Intelligence.

---

PHASE 10: Meeting Notes

Add an internal meeting notes panel.

Notes must support:

- meeting association
- author
- timestamp
- workspace access control

For client meetings, notes are INTERNAL by default.

Never expose internal notes to guests.

Design the data model so a future explicit "shared with client" state can be added without changing the fundamental structure.

Do not automatically implement client sharing unless an existing Lancee permission model already supports it cleanly.

---

PHASE 11: Connected Intelligence

Integrate meetings with the existing Connected Intelligence architecture.

Reuse existing events if available:

meeting.created
meeting.completed

Consider additional events only if they fit the current architecture:

meeting.started
meeting.participant_joined
meeting.participant_left

Do not create noisy intelligence signals without a concrete use.

When a meeting ends, Connected Intelligence should know:

- meeting
- workspace
- client if linked
- project if linked
- duration
- participant identities where appropriate
- meeting type

This should feed existing meeting-load/project-load intelligence where already implemented.

---

PHASE 12: Prepare for AI Without Overbuilding

Do NOT implement a large transcription/AI system during this task unless the repository already contains the necessary infrastructure.

Instead create clean extension points for future:

LiveKit audio
→ transcription
→ Lancee transcript
→ Hermes
→ structured meeting intelligence

Future capabilities will include:

- transcript
- summary
- decisions
- action items
- task creation
- follow-up email drafting
- project updates
- searchable meeting context
- AI meeting participant

Design today's meeting IDs and persistence model so these can attach cleanly later.

Do not fake these capabilities.

---

PHASE 13: Security

Perform a specific security pass.

Verify:

- LiveKit secret never reaches browser
- room tokens are short-lived
- workspace membership is verified server-side
- users cannot join another workspace's meeting
- users cannot change workspace IDs to escalate access
- guest links cannot access other meetings
- expired guest links fail
- revoked guest links fail
- guests cannot call workspace APIs
- client meetings don't expose internal notes
- meeting host actions require authorization
- LiveKit room names cannot be abused to bypass Lancee authorization

Pay particular attention to cross-workspace authorization.

Lancee has previously required hardening around server-issued authorization, so authorization decisions must never rely solely on client-provided state.

---

PHASE 14: Failure Handling

Handle:

- LiveKit unavailable
- token generation failure
- camera denied
- microphone denied
- disconnected participant
- network interruption
- meeting ended by host
- invalid guest invitation
- expired invitation
- revoked invitation
- meeting cancelled
- user attempting to join too early/late where relevant

Failures should use Lancee's existing error/toast system.

Never leave users on an indefinite loading screen.

---

PHASE 15: Tests

Add meaningful tests.

At minimum verify:

Authorization

User A cannot join Workspace B meeting.

Guest cannot access workspace APIs.

Expired guest invitation fails.

Revoked guest invitation fails.

Meeting lifecycle

Create
→ scheduled

Start
→ live

End
→ completed

Relationships

Meeting correctly links to:

workspace
project
client
calendar event

Connected Intelligence

Correct lifecycle event is emitted.

No duplicate event is generated from retries.

LiveKit

Token endpoint refuses unauthorized requests.

Authorized user receives correctly scoped credentials.

Guest receives guest-scoped credentials.

---

PHASE 16: Documentation

Add documentation explaining:

Local setup

Required LiveKit variables.

Production setup

How Lancee connects to LiveKit.

Architecture

Lancee
→ Meeting API
→ LiveKit

and

Meeting
→ Connected Intelligence
→ Hermes/future intelligence

Security

Explain the trust boundary between Lancee and LiveKit.

---

UX REQUIREMENT

A user should ultimately experience this flow:

Projects
→ Kalahari Ember Gin
→ Meetings
→ New Meeting
→ Client Meeting
→ Schedule

At meeting time:

Open Meeting
→ camera/mic preview
→ Join

During meeting:

Video
Screen share
Participants
Internal notes

After meeting:

Meeting completed
Duration recorded
Meeting attached to project/client
Connected Intelligence updated

Later phases will extend this into:

Transcript
→ summary
→ decisions
→ tasks
→ follow-up
→ searchable project intelligence

---

IMPORTANT NON-GOALS

Do NOT:

- redesign the entire Lancee application
- replace the existing calendar
- replace Connected Intelligence
- create a separate authentication system
- expose LiveKit secrets
- copy LiveKit's default conferencing UI
- implement Zoom/Teams integration
- implement a huge AI transcription system prematurely
- create duplicate project/client/activity models
- weaken existing workspace authorization
- introduce unrelated refactors

---

Definition of Done

The task is complete when:

1. A Lancee user can create an internal or client meeting.
2. The meeting is persisted and associated with the workspace.
3. Project/client association works.
4. Calendar integration works.
5. Authorized workspace users can securely obtain LiveKit access.
6. External guests can securely join client meetings.
7. Guests cannot access Lancee workspace data.
8. Audio/video works through LiveKit.
9. Camera/microphone pre-join works.
10. Screen sharing works.
11. The meeting UI looks native to Lancee.
12. Internal meeting notes work.
13. Meeting lifecycle updates correctly.
14. Connected Intelligence receives the appropriate lifecycle information.
15. Cross-workspace security tests pass.
16. Existing Lancee functionality remains working.
17. Build, lint, typecheck and relevant tests pass.

At completion provide:

- implementation summary
- architecture changes
- database migrations
- new environment variables
- API endpoints added/changed
- frontend routes/components added
- tests added
- security decisions
- known limitations
- manual test procedure
- recommended Phase 2 work

Do not claim functionality is complete unless it has actually been implemented and verified.
