You are working directly on the current Lancee repository.

TASK
Investigate and FIX the Hermes Agent conversation/session contamination, context continuity, artifact handling, and Lancee Files integration.

This is a production-blocking issue.

Do not simply modify the system prompt to hide the symptoms.
Trace the actual runtime/session flow and determine the root cause.

============================================================
OBSERVED FAILURE
============================================================

A real Lancee Workspace Assistant conversation behaved like this:

The user was discussing Lancee pricing:

Solo
Pro
Studio

10,000 / 30,000 / 100,000 Lancee Power

They asked the assistant to turn the pricing concept into a document.

The assistant then claimed:

"Done — I created the document here:
/tmp/superpowers-native-plugin-plan.md"

This was WRONG.

The requested document was about Lancee Power pricing, but the generated filename/content referred to an unrelated "superpowers native plugin plan".

The user then asked:

"Can you not add the file in the chat or in my files"

Later clarified:

"No i want you to save the file in my lancee files and add a download link for it in the chat"

The assistant responded that it needed the file/path/content even though it had supposedly just created the file.

The user then asked whether it remembered the conversation.

The assistant responded with completely unrelated context:

"Last few were about:
Herman greeting
Home Affairs queue chat
Custom MCP server setup"

NONE of those topics belonged to the active Lancee Power conversation.

Later it again suggested:

"If you mean the home affairs one..."

This indicates possible:

- Hermes session mapping failure
- stale session reuse
- cross-conversation memory contamination
- incorrect profile/session restoration
- cached session ID reuse
- conversation history not being propagated
- workspace/user/session scoping bug
- incorrect Hermes memory retrieval
- artifact state being lost between runs

This MUST be investigated as a potential tenant-isolation/privacy issue.

============================================================
1. DO NOT ASSUME THE CAUSE
============================================================

Do not immediately change prompts.

Trace:

WorkspaceChat
    ↓
Lancee conversation
    ↓
Agent Gateway
    ↓
Hermes provider
    ↓
Hermes profile
    ↓
Hermes session
    ↓
Hermes run
    ↓
memory/context
    ↓
MCP

Inspect the implementation added during the recent Hermes Agent Runtime refactor.

Review at minimum:

- Hermes agent provider
- agent provider abstraction
- agent gateway
- session persistence
- conversation persistence
- WorkspaceChat
- AI routes/controllers
- Hermes SSE implementation
- Hermes session creation
- Hermes session resume
- Hermes profile selection
- Hermes memory configuration
- Lancee MCP
- file tools
- artifact handling
- any caches/singletons
- any "current", "latest", or default session logic
- database migrations related to agent sessions

Search globally for:

sessionId
conversationId
workspaceId
userId
profile
memory
Hermes
externalSessionId
lastSession
currentSession
activeSession
/tmp
artifact
file
upload
download

============================================================
2. SESSION IDENTITY MUST BE DETERMINISTIC
============================================================

The intended relationship is:

Lancee workspace
       ↓
Hermes workspace/profile

Lancee conversation A
       ↓
Hermes session A

Lancee conversation B
       ↓
Hermes session B

A conversation must NEVER attach itself to another conversation's
Hermes session.

Establish a durable mapping equivalent to:

workspaceId
userId
conversationId
agentProvider
hermesProfileId
hermesSessionId

Use the existing schema where possible.

Do NOT create duplicate persistence mechanisms unnecessarily.

============================================================
3. NEVER RESOLVE SESSION BY "LATEST"
============================================================

Audit for dangerous logic such as:

latest Hermes session
last created session
global current session
default session
first matching session
cached session without workspace key
profile's most recent session

A Lancee conversation must resolve its Hermes session using an
explicit persisted mapping.

Conceptually:

resolveHermesSession({
    workspaceId,
    conversationId
})

NOT:

getLatestHermesSession()

============================================================
4. TENANT ISOLATION
============================================================

This is CRITICAL.

Every session lookup must be scoped by at least:

workspaceId + conversationId

and user authorization must be checked before access.

If conversation A belongs to workspace A:

workspace A
conversation A
Hermes session A

then workspace B must NEVER be capable of retrieving:

Hermes session A
conversation A history
conversation A memory
conversation A artifacts

even if the model generates the ID.

Add server-side enforcement.

Do not trust Hermes-generated identifiers.

============================================================
5. TEST CROSS-WORKSPACE CONTAMINATION
============================================================

Create automated tests with:

Workspace A
  User A
  Conversation A

Workspace B
  User B
  Conversation B

Conversation A contains a unique marker:

ORANGE-PENGUIN-92841

Conversation B asks:

"What were we discussing?"

The marker must NEVER appear.

Also test the reverse direction.

Then create two conversations within the SAME workspace:

Conversation A:
LANCEE-POWER-7742

Conversation B:
HOME-AFFAIRS-9921

Resume Conversation A.

It must retain:

LANCEE-POWER-7742

and must NOT surface:

HOME-AFFAIRS-9921

These should become permanent regression tests.

============================================================
6. ACTIVE CONVERSATION CONTINUITY
============================================================

Recent conversational context should NOT depend on RAG.

If the conversation is:

User:
"Create a document about Lancee Power."

Assistant:
"Done."

User:
"Put the file in my Lancee files."

the assistant MUST understand what:

"the file"

refers to.

Verify whether Hermes native sessions retain conversational history.

If Hermes requires explicit message history or session resume semantics,
implement them according to the CURRENT official Hermes API.

Do not invent API behavior.

============================================================
7. REOPEN / RESUME TEST
============================================================

Test:

1. Start conversation
2. User says unique information
3. Hermes responds
4. Close/reload WorkspaceChat
5. Resume same Lancee conversation
6. Ask about previous context

The same Hermes session must be restored.

Expected:

conversationId
      ↓
persisted mapping
      ↓
same Hermes sessionId

NOT:

reload
 ↓
new Hermes session

============================================================
8. ARTIFACT CONTINUITY
============================================================

The agent lost track of a file it claimed to create.

Fix artifact tracking.

When Hermes creates a file/artifact during a conversation, Lancee should
retain structured metadata linking it to:

workspaceId
conversationId
message/run
artifactId
filename
storage location/reference
MIME type
createdAt

Reuse existing artifact/file tables if available.

Do not store critical artifact identity solely inside model memory.

============================================================
9. /tmp IS NOT A USER DOWNLOAD
============================================================

The assistant exposed:

/tmp/superpowers-native-plugin-plan.md

This must not happen.

Internal temporary paths are implementation details.

Never tell the user:

/tmp/...
/var/...
internal container path
server filesystem path

as though it is a usable download.

If an artifact only exists temporarily, either:

A. upload/store it using Lancee's file capability

or

B. clearly report that the file has not yet been persisted.

Never claim:

"Done"

until the requested persistence operation succeeded.

============================================================
10. LANCEE FILES TOOLING
============================================================

Audit the existing Lancee MCP file capabilities.

The Workspace Assistant must be able to:

- create a file
- save/upload a generated file
- list workspace files
- search workspace files
- retrieve file metadata
- obtain an appropriate user-facing reference/download link

Reuse existing Lancee MCP capabilities.

Do NOT build a second independent file system.

If an existing capability is insufficient, extend it cleanly.

============================================================
11. EXPECTED FILE WORKFLOW
============================================================

Example:

User:
"Create a document with the Solo, Pro and Studio Lancee Power pricing."

Hermes:
    ↓
generate content
    ↓
create artifact
    ↓
Lancee MCP
    ↓
save_workspace_file(...)
    ↓
Lancee storage
    ↓
return fileId/reference
    ↓
assistant response

"Done — I've saved the Lancee Power pricing document to your
Lancee Files."

The UI should then expose the appropriate downloadable/openable file.

If the user says:

"the file you just created"

Hermes should either:

A. know from session context

AND/OR

B. resolve the latest artifact linked to that conversation.

It should NOT ask the user to provide the file again.

============================================================
12. SYSTEM INSTRUCTIONS
============================================================

ONLY AFTER the underlying session/artifact issues are fixed, review the
Hermes workspace system instructions.

Hermes should understand:

You are the Lancee Workspace Assistant.

You operate inside a business workspace.

Lancee MCP provides authoritative access to workspace capabilities
such as clients, projects, tasks, invoices, files, email, integrations,
and other business data.

Use Lancee MCP when authoritative workspace information is required.

Never invent workspace records.

Never claim a tool action succeeded unless the tool returned success.

Never expose internal filesystem paths as user-facing downloads.

When asked to save something to Lancee Files, use the appropriate
Lancee MCP file capability.

Recent conversation continuity should come from the active Hermes
session rather than guessed memory.

Do not retrieve unrelated conversation history unless the user
explicitly asks for it and authorization permits it.

Keep this prompt concise.

Do NOT compensate for broken session handling with a giant system prompt.

============================================================
13. MEMORY SCOPING
============================================================

Audit Hermes memory.

Determine:

- what memory is stored
- how it is keyed
- profile ownership
- workspace ownership
- conversation ownership
- retrieval behavior
- whether memory from unrelated conversations is automatically injected

Workspace-level memory may intentionally be shared when appropriate.

Conversation-level state must remain isolated.

User-specific memory must not leak across users.

Cross-workspace memory is prohibited.

Document the resulting memory model.

============================================================
14. OBSERVABILITY
============================================================

Add safe structured logging around session resolution.

Example fields:

workspaceId
userId
conversationId
agentProvider
hermesProfileId
hermesSessionId
runId
sessionCreated
sessionResumed

DO NOT log:

message contents
API keys
OAuth tokens
sensitive file contents

This should make future session contamination easy to diagnose.

============================================================
15. FILE/ACTION TRUTHFULNESS
============================================================

Enforce a general agent rule:

Tool success determines action success.

For example:

Hermes says:
"I created the file."

Only permit that state when:

create/save tool → SUCCESS

If the tool fails:

"I couldn't save the file."

not:

"Done."

Apply the same principle where practical to:

tasks
invoices
emails
files
calendar operations
automations
other mutations

============================================================
16. REGRESSION TESTS
============================================================

Add focused tests for:

- conversation → Hermes session mapping
- same conversation resumes same session
- different conversations use different sessions
- different workspaces cannot share sessions
- different users cannot access unauthorized sessions
- workspace reload resumes correctly
- Hermes memory scoping
- artifact association
- generated artifact survives subsequent message
- Lancee Files save operation
- failed save does not report success
- /tmp paths are never exposed as download references
- active conversation understands "the file you just created"
- unrelated conversation content is not injected

Keep all existing:

agent provider tests
AI provider regression tests
MCP protocol tests
legacy runtime tests

passing.

============================================================
17. INVESTIGATE THE 40 vs 42 MCP TOOL TEST
============================================================

The previous implementation reported:

"expected 40 MCP tools, current catalog reports 42"

Do not blindly change 40 → 42.

Identify the two additional tools.

Verify that they are intentional.

If intentional:
update the fixture/test correctly.

If accidental:
fix the catalog.

Report exactly which two tools caused the difference.

============================================================
18. VERIFY REAL HERMES BEHAVIOR
============================================================

Use current official Hermes documentation when necessary.

Verify that the implementation's assumptions around:

sessions
runs
memory
profiles
SSE
MCP

match the deployed Hermes version.

Do not replace native Hermes session behavior with guessed behavior.

============================================================
19. VERIFICATION COMMAND
============================================================

Extend:

npm run verify:agent

so it verifies at least:

Agent provider configured
Hermes reachable where applicable
Session persistence available
MCP configured
Workspace scoping active
Artifact/file capability available

Do not expose secrets in output.

============================================================
20. FINAL MANUAL TEST
============================================================

After automated tests pass, reproduce this scenario:

Conversation A:

User:
"Solo gets 10,000 Lancee Power.
Pro gets 30,000.
Studio gets 100,000."

Then:

"Create a document containing those tiers."

Then:

"Save the file to my Lancee Files."

Then:

"What file did you just create?"

EXPECTED:

The assistant correctly identifies the Lancee Power pricing document.

Then create Conversation B with unrelated content.

Return to Conversation A and ask:

"What were we discussing?"

EXPECTED:

Lancee Power pricing.

It must NOT mention unrelated conversations such as:

Home Affairs
Herman greeting
other projects
other users

unless the user explicitly requested cross-conversation retrieval.

============================================================
DELIVERABLE
============================================================

Implement the fix.

At completion report:

1. Root cause of the contamination
2. Why "Home Affairs" appeared
3. Why the wrong artifact was generated
4. Why the agent lost the artifact reference
5. Files modified
6. Database changes
7. Hermes session mapping design
8. Hermes memory scoping design
9. Artifact persistence design
10. Lancee Files integration changes
11. Security/tenant-isolation changes
12. The two additional MCP tools causing 40 → 42
13. Tests added
14. Verification results
15. Manual reproduction results
16. Any remaining risks

Do not mark this task complete merely because tests compile.

The real acceptance criteria are:

A) Active Lancee conversations maintain continuity.
B) Separate conversations remain separate.
C) Workspaces cannot leak context into one another.
D) Generated artifacts remain addressable.
E) Hermes can save generated artifacts into Lancee Files.
F) Internal temporary paths are never presented as downloads.
G) The assistant never claims a mutation succeeded unless its tool
   actually succeeded.

Treat any cross-workspace context leakage as a release-blocking
security defect.
