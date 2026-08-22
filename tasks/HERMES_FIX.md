You are fixing two confirmed production issues in the Lancee ↔ Hermes
integration.

Repository:
martin861101/lancee

Working branch:
feature/workspace-pulse-home

IMPORTANT:
The Hermes integration already exists and mostly works.

DO NOT redesign it.
DO NOT replace Hermes.
DO NOT create another memory system.
DO NOT create another file-generation system.

Fix the existing implementation.

========================================================
CONFIRMED PRODUCTION BUG #1
BROKEN GENERATED FILE / GHOST ARTIFACT
========================================================

Observed behaviour:

Hermes can now generate files.

However, when Hermes generates files, at least one returned file/artifact
can appear in Lancee but opening it results in a "no file" / missing-file
condition.

Another generated file in the same general workflow works correctly.

This suggests that Lancee may be surfacing:

- a Hermes intermediate artifact
- metadata-only artifact
- JSON/tool-result artifact
- local Hermes path
- artifact without storageDocumentId
- artifact that was never successfully imported into Lancee document storage

while another artifact is correctly persisted.

AUDIT:

Inspect:

server/agents/hermes-agent-provider.mjs
server/agents/agent-provider.mjs
agent artifact persistence
workspace document persistence
artifact_links
artifact import logic
WorkspaceChat attachment rendering
file/document download/open routes
Hermes run/event parsing
Hermes structured artifact parsing
MEDIA import behaviour
relevant verification scripts

Trace the COMPLETE lifecycle:

Hermes tool
   ↓
Hermes native result
   ↓
Hermes run/event payload
   ↓
artifact detection
   ↓
Lancee import
   ↓
workspace document
   ↓
agent artifact
   ↓
conversation response
   ↓
frontend attachment
   ↓
authenticated file retrieval

Determine exactly where the ghost artifact is introduced.

========================================================
ARTIFACT INVARIANT
========================================================

A file MUST NOT be presented to the user as an openable Lancee file
unless Lancee has verified that a durable workspace-scoped file exists.

Conceptually:

Hermes artifact
      ↓
validate
      ↓
import/persist
      ↓
storageDocumentId exists
      ↓
workspace ownership verified
      ↓
artifact link persisted
      ↓
ONLY THEN
      ↓
surface attachment

Do not create fake attachment metadata.

If Hermes returns an intermediate JSON/tool artifact that is not intended
as a user document, do not expose it as a downloadable user file.

If Hermes returns multiple representations of the SAME generated
document, identify and expose the canonical persisted representation.

Do not simply hide errors.

Log bounded diagnostic metadata sufficient to determine why import failed,
without logging file contents, credentials, or private paths.

========================================================
FILE TEST MATRIX
========================================================

Add focused verification for at least:

TXT
Markdown
JSON
PDF

Test:

1. Hermes returns one valid file
2. Hermes returns multiple artifacts
3. intermediate metadata artifact + final file
4. artifact without storageDocumentId
5. artifact import failure
6. duplicate artifact
7. same artifact returned in run status and event stream
8. workspace isolation
9. file survives subsequent conversation turn
10. returned attachment opens through the existing authenticated Lancee
    document route

A ghost artifact must never be rendered as a valid attachment.

========================================================
CONFIRMED PRODUCTION BUG #2
CONVERSATION CONTEXT IS LOST BETWEEN IMMEDIATE TURNS
========================================================

Observed production behaviour:

Turn 1:

User:
"Create file X."

Hermes creates the file.

Immediately afterward, SAME chat:

User:
"Rename that file to A."

Hermes has lost the context of the previous request/file.

This is a critical bug.

Hermes is expected to preserve conversational continuity inside the same
Lancee conversation.

========================================================
IMPORTANT DISTINCTION
========================================================

There are TWO types of memory.

1. CONVERSATION MEMORY

Required for:

"Create X."
"Rename it."
"Summarise that."
"Send it to the client."

This must work reliably within the same conversation.

2. LONG-TERM USER MEMORY

Examples:

- user preferences
- stable personal preferences
- recurring behaviour/preferences

This already has separate Hermes preference/memory concepts.

DO NOT try to solve the current bug by stuffing chat history into
long-term preferences.

The reported bug is primarily CONVERSATION CONTINUITY.

========================================================
AUDIT CONVERSATION CONTINUITY
========================================================

Inspect:

agent_threads
agent_runs
agent_steps
agent artifacts
external_thread_id
conversation IDs
Hermes native session IDs
X-Hermes-Session-Key
X-Hermes-Session-Id
POST /api/sessions
GET /api/sessions/:id
POST /v1/runs
explicit history construction
WorkspaceChat frontend conversation state
browser/local storage conversation selection
new-conversation creation
provider fallback behaviour

Trace:

FIRST TURN

WorkspaceChat
   ↓
Lancee conversation ID
   ↓
agent_thread
   ↓
Hermes session
   ↓
Hermes run
   ↓
response/artifact persisted

SECOND TURN

WorkspaceChat
   ↓
SAME Lancee conversation ID
   ↓
SAME agent_thread
   ↓
SAME Hermes session
   ↓
previous conversation/history available
   ↓
new Hermes run

Determine where continuity breaks.

========================================================
HARD INVARIANTS
========================================================

Within one Lancee conversation:

conversationId MUST remain stable.

agent_thread MUST remain stable.

external_thread_id / Hermes session mapping MUST remain stable.

Workspace/user/profile isolation MUST remain stable.

A second request must receive sufficient previous conversational context.

Do not accidentally create a new Hermes session for every run.

Do not select "latest conversation" as a workaround.

Do not leak context between separate Lancee conversations.

Do not leak context between users/workspaces.

========================================================
HISTORY
========================================================

The current integration documentation says explicit conversation history
is reconstructed from persisted scoped Lancee runs and artifacts.

Verify that this ACTUALLY happens.

Check whether:

- user messages are persisted
- assistant responses are persisted
- artifact metadata is persisted
- history query uses correct conversation/thread
- current run is accidentally queried instead of prior completed runs
- history ordering is correct
- history truncation removes the immediately previous turn
- safeDisplayText/historyText removes useful references
- artifact references are omitted from reconstructed context
- Hermes request schema actually receives the history field being built

Do not assume documentation equals implementation.

========================================================
ARTIFACT CONTEXT
========================================================

This is particularly important.

If previous turn created:

proposal.pdf

then subsequent:

"rename that file to final-proposal.pdf"

must provide Hermes with enough authoritative context to identify the
previous artifact.

Conversation history should not need to contain raw file contents.

It SHOULD contain safe artifact metadata such as:

artifactId
storageDocumentId where appropriate internally
display name
mime type
relationship to previous run

Hermes must be able to resolve conversational references such as:

"that file"
"the PDF"
"the document you just created"
"rename it"

without guessing.

If Lancee MCP is responsible for the actual rename operation, Hermes should
receive/resolve the authoritative Lancee file ID and invoke the appropriate
workspace-scoped tool.

========================================================
DO NOT RELY ONLY ON HERMES INTERNAL MEMORY
========================================================

Lancee already persists authoritative conversation/run state.

Use it.

Even if Hermes native session memory disappears after restart, Lancee should
be capable of reconstructing enough bounded conversation history to resume
the conversation safely.

Expected:

Lancee conversation
       ↓
persisted runs/messages/artifacts
       +
Hermes session
       ↓
next run

This provides durability and isolation.

========================================================
CONTEXT TEST MATRIX
========================================================

Implement verification for:

TEST A

User:
"Remember the code word is pineapple."

Hermes:
acknowledges

Same conversation:

"What was the code word?"

Expected:
pineapple

TEST B

User:
"Create notes.md containing hello."

Hermes creates valid artifact.

Same conversation:

"Rename that file to meeting-notes.md."

Expected:
Hermes understands "that file" refers to notes.md and invokes the correct
authorized file operation.

TEST C

Same conversation:

"What file did you just create?"

Expected:
meeting-notes.md

TEST D

Create NEW Lancee conversation.

Ask:
"What file did I just create?"

Expected:
It must NOT inherit unrelated raw conversation context.

TEST E

Restart/reinitialize provider adapter while retaining database state.

Resume original conversation.

Ask:
"What file did you create earlier?"

Expected:
Context can be reconstructed from persisted Lancee conversation state.

TEST F

Different workspace/user.

Expected:
No context leakage.

========================================================
CHECK FRONTEND TOO
========================================================

Do not assume backend is at fault.

Verify WorkspaceChat sends the SAME conversation/thread identifier on
subsequent messages.

Check:

- React state
- route changes
- page rerenders
- mobile behaviour
- refresh behaviour
- localStorage/sessionStorage
- conversation selection
- race conditions after artifact generation
- whether generated attachment causes chat state reset

The production report occurred immediately between consecutive messages.

========================================================
LONG-TERM MEMORY
========================================================

After fixing conversation continuity, audit persistent Hermes preference
memory separately.

Do NOT expand scope into a giant memory/RAG project.

Verify only that existing intended stable preferences:

hermes_user_preferences

are:

- workspace scoped
- user scoped
- retrieved correctly
- injected correctly
- not used for ordinary conversation history

Document the distinction clearly.

========================================================
SECURITY
========================================================

Do not solve continuity by sending every historical conversation to Hermes.

History must be:

- exact conversation only
- exact authenticated user
- exact workspace
- bounded
- ordered
- sanitized
- artifact-aware

No cross-conversation guessing.

No cross-workspace memory.

No raw credentials.

No arbitrary local filesystem paths.

========================================================
REGRESSION
========================================================

Run existing:

verify:agent
verify:ai
verify:mcp
verify:codex-connector

and any artifact/document verification.

Add focused Hermes continuity/artifact tests.

Also run:

npm run build
npm run lint
git diff --check

Clearly distinguish:

PASS
FAIL
NOT RUN
ENVIRONMENT BLOCKED

========================================================
DELIVERABLE
========================================================

First output an AUDIT explaining the root cause of BOTH bugs.

Then implement fixes.

Report:

BUG 1
- why the ghost/missing file appeared
- exact artifact type
- where it entered the response
- how it was fixed

BUG 2
- exactly where conversational continuity broke
- whether frontend conversation ID changed
- whether agent_thread changed
- whether Hermes session changed
- whether history was missing/malformed
- whether artifacts were absent from context
- how it was fixed

Then report:

- files changed
- schema changes, if any
- tests added
- test results
- security implications
- example two-turn file workflow
- restart/resume behaviour

Do not claim fixed merely because Hermes can answer two generic chat
messages.

The acceptance test is:

"Create a file called test.md containing hello."

THEN, IN THE SAME LANCEE CHAT:

"Rename that file to final.md."

Hermes must understand exactly which file "that file" refers to and the
final Lancee attachment must be durable and openable.
