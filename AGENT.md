You are working directly on the Lancee repository.

GOAL
Refactor Lancee's AI architecture so that Hermes Agent becomes the primary AGENT RUNTIME for interactive Workspace AI, instead of Lancee treating Hermes mainly as an OpenAI-compatible /v1/chat/completions LLM.

IMPORTANT:
Do not blindly rewrite the existing AI system.
First inspect the repository, understand the existing implementation, and preserve working functionality.

The architectural change is:

CURRENT

Workspace Chat
    ↓
Lancee agent-runtime
    ↓
ai.mjs / completeChat()
    ↓
Hermes /v1/chat/completions
    ↓
Lancee executes tools

TARGET

Workspace Chat
    ↓
Lancee Agent Gateway
    ↓
Hermes Agent Runtime
    ├── reasoning / agent loop
    ├── sessions
    ├── memory
    ├── skills
    ├── tools
    ├── MCP
    └── scheduling/cron where supported
             ↓
         Lancee MCP
             ↓
      Lancee capabilities
             ↓
      Lancee API / database


==================================================
1. AUDIT BEFORE CHANGING ANYTHING
==================================================

Inspect at minimum:

- server/ai.mjs
- server/agent-runtime.mjs
- server/lancee-mcp.mjs
- capability registry
- execution worker
- browser worker
- integration gateway
- WorkspaceChat components
- AI routes/controllers
- AI status endpoints
- conversation/session persistence
- existing MCP implementation
- docs/HERMES.md
- relevant environment configuration
- existing tests/verification scripts

Search the entire repository for:

Hermes
completeChat
AI_PROVIDER
toolCall
agent-runtime
lancee-mcp
conversation
session
memory
MCP

Document the current request path before modifying it.

Do not delete working code simply because the new architecture supersedes it.


==================================================
2. SEPARATE "AI COMPLETION" FROM "AGENT"
==================================================

Lancee needs two distinct concepts.

A) AI COMPLETION

Keep server/ai.mjs and completeChat() for simple bounded AI operations such as:

- summarisation
- classification
- title generation
- extraction
- rewriting
- structured generation
- other single-shot AI operations

These may continue supporting:

OpenAI
Anthropic
Gemini
Hermes completion endpoint

Do NOT break these providers.


B) AGENT RUNTIME

Interactive Workspace AI must use an agent abstraction.

Introduce something along the lines of:

server/agents/
    agent-provider.mjs
    hermes-agent-provider.mjs
    lancee-agent-provider.mjs

Exact naming may change to fit the repository.

Expose an interface roughly equivalent to:

runAgent({
    workspaceId,
    userId,
    conversationId,
    message,
    context
})

The implementation must allow Hermes to become the actual runtime rather than simply the underlying completion model.


==================================================
3. HERMES AGENT INTEGRATION
==================================================

Research the CURRENT official Hermes Agent API/runtime documentation before implementation.

Do not assume /v1/chat/completions exposes all Hermes Agent functionality.

Determine the supported interfaces for:

- agent execution
- sessions
- persistent conversations
- memory
- MCP servers
- skills
- tool execution
- cron/scheduling
- streaming if available

Use Hermes' native agent interfaces wherever appropriate.

If a capability is not exposed by the installed Hermes API/runtime, DO NOT invent an endpoint.

Create an adapter around what Hermes actually supports.

Clearly document any Hermes functionality that requires configuration on the Hermes server itself.


==================================================
4. LANCEE MCP BECOMES THE BUSINESS CAPABILITY LAYER
==================================================

The existing Lancee MCP implementation should become the primary mechanism through which Hermes interacts with Lancee.

Do NOT duplicate Lancee business logic inside Hermes.

Hermes should be able to discover and call Lancee MCP tools for things such as:

clients
projects
tasks
comments
files
invoices
payments
email
Google Drive
browser/search
workspace information
automations
commitments

Use the existing tools wherever possible.

If tools already exist, reuse them.

If existing tools are internal-only and need MCP exposure, create thin MCP wrappers around the existing service functions.

Do NOT create two independent implementations of the same operation.


==================================================
5. SECURITY BOUNDARY
==================================================

This is critical.

Hermes must NEVER be trusted to choose arbitrary workspaceId or userId values.

Every Hermes request must originate from an authenticated Lancee request.

Lancee determines:

authenticated user
workspace
permissions
conversation/session

MCP calls must retain this authorization context.

A Hermes-generated argument such as:

workspaceId: "abc"

must NEVER override the workspace established by Lancee authentication.

Enforce tenant isolation server-side.

Never expose:

database credentials
provider API keys
Hermes API keys
internal secrets

to the browser or model.


==================================================
6. HERMES SESSION MAPPING
==================================================

Create persistent mapping between Lancee conversations and Hermes sessions if Hermes supports native sessions.

Conceptually:

LanceeConversation
    id
    workspaceId
    userId
    agentProvider
    externalSessionId
    createdAt
    updatedAt

Do not necessarily use this exact schema if equivalent storage already exists.

Reuse existing conversation tables wherever practical.

A user returning to a conversation should resume the corresponding Hermes session rather than creating a completely new agent context every message.


==================================================
7. MEMORY OWNERSHIP
==================================================

Establish a clear boundary.

LANCEE DATABASE:
authoritative business information

Examples:
clients
projects
invoices
tasks
payments
files
commitments
workspace configuration

HERMES MEMORY:
agent/user working memory where appropriate

Examples:
interaction preferences
useful conversational context
agent observations
non-authoritative working knowledge

Never rely on Hermes memory as the source of truth for financial/project/business records.

When business information is needed, Hermes should query Lancee through MCP.


==================================================
8. WORKSPACE CONTEXT
==================================================

When starting/resuming an agent session provide minimal trusted context such as:

user identity
workspace identity
user role
timezone
available Lancee capabilities

Avoid dumping huge database records into the system prompt.

Hermes should retrieve business information on demand using Lancee MCP tools.


==================================================
9. TOOL EXECUTION
==================================================

Review the existing Lancee agent-runtime.

Identify which responsibilities Hermes can now perform itself.

Do NOT immediately delete agent-runtime.mjs.

Gradually move orchestration responsibility behind the agent provider abstraction.

Legacy Lancee runtime may remain as:

fallback
development mode
testing provider

if useful.

Avoid:

Hermes decides tool
→ Lancee agent decides another tool
→ model decides another tool

There should ideally be ONE primary reasoning/tool loop.

For Hermes mode, that loop belongs to Hermes.


==================================================
10. COMMITMENTS / FOLLOW-UP ARCHITECTURE
==================================================

Prepare the architecture for requests such as:

"Remind me if John hasn't approved the Acme proposal by Friday."

Hermes should eventually be capable of:

1. understanding the request
2. querying Lancee MCP
3. identifying client/project
4. creating a structured commitment/follow-up
5. scheduling or registering the future check
6. waking/checking at the appropriate time
7. querying Lancee for current state
8. resolving automatically if completed
9. notifying the user if still outstanding

IMPORTANT:

Business commitments should preferably remain structured Lancee records.

Hermes cron/scheduling may trigger the reasoning/check.

Do not store critical commitments solely in model memory.


==================================================
11. STREAMING
==================================================

If Hermes native agent execution supports streaming:

implement server-side streaming through Lancee.

Prefer:

Hermes
→ Lancee backend
→ SSE/stream
→ WorkspaceChat

Never connect the browser directly to the private Hermes instance.

Gracefully fall back to non-streamed responses if necessary.


==================================================
12. CONFIGURATION
==================================================

Separate completion provider configuration from agent provider configuration.

For example:

AI_PROVIDER=openai
AI_MODEL=...

AGENT_PROVIDER=hermes

HERMES_ENDPOINT_URL=...
HERMES_API_KEY=...

Potential additional values may be introduced based on the real Hermes API.

Do not require Hermes for simple completion functionality.

Maintain backwards compatibility where reasonable.


==================================================
13. HEALTH / STATUS
==================================================

Extend the AI/agent status API so the application can distinguish:

Completion provider:
OpenAI / Anthropic / Gemini / Hermes

Agent provider:
Hermes / Lancee

Return useful non-secret diagnostics such as:

configured
reachable
provider
agent runtime available
MCP available

Never return secrets.


==================================================
14. FAILURE HANDLING
==================================================

Handle independently:

Hermes unavailable
Hermes timeout
Hermes authentication failure
MCP unavailable
MCP tool failure
invalid Hermes response
session creation failure
session recovery failure

A Hermes failure should not crash the Lancee backend.

Return bounded user-friendly errors.

Log detailed server-side diagnostics without leaking secrets.


==================================================
15. OBSERVABILITY
==================================================

Add useful structured logging for:

conversation ID
workspace ID
agent provider
Hermes session ID
agent execution duration
tool name
tool duration
tool success/failure

NEVER log:

API keys
access tokens
email OAuth tokens
sensitive document contents
full prompts unnecessarily


==================================================
16. TESTING
==================================================

Add tests covering at minimum:

- Hermes agent provider configuration
- agent provider selection
- Lancee fallback provider
- session mapping
- workspace isolation
- MCP authorization context
- Hermes unavailable
- Hermes timeout
- malformed Hermes response
- completion API still works
- OpenAI/Anthropic/Gemini completion providers are unaffected

Create a verification command if appropriate:

npm run verify:agent

It should validate architecture/configuration without requiring destructive actions.


==================================================
17. DOCUMENTATION
==================================================

Update docs/HERMES.md.

Explain clearly that there are now TWO integration modes:

1. Hermes Completion Provider
2. Hermes Agent Runtime

Document the architecture:

WorkspaceChat
      ↓
Lancee Backend
      ↓
Agent Provider
      ↓
Hermes Agent
      ↓
Lancee MCP
      ↓
Lancee services/database

Document required Hermes-side configuration.

Include troubleshooting instructions.


==================================================
18. REMOVE DUPLICATION ONLY AFTER VERIFICATION
==================================================

Once Hermes Agent mode works, review the old Lancee agent runtime.

Classify existing code as:

KEEP
REUSE
LEGACY FALLBACK
REMOVE

Do not remove anything until references and tests prove it is safe.

Prefer simplifying the architecture rather than maintaining two competing agent systems.


==================================================
19. DELIVERABLE
==================================================

Implement the refactor, not merely a design document.

At completion provide:

1. Architecture before
2. Architecture after
3. Files added
4. Files modified
5. Existing components reused
6. Legacy components retained and why
7. Hermes features actually supported
8. Hermes features unavailable through the current API
9. Required environment variables
10. Required Hermes configuration
11. Database migration details, if any
12. Security decisions
13. Tests added
14. Commands to verify
15. Remaining TODOs


==================================================
CORE DESIGN RULE
==================================================

Hermes owns agent reasoning.

Lancee owns business truth.

Lancee MCP is the bridge.

completeChat() is for AI completions, not the primary Workspace agent loop.

Do not recreate Hermes inside Lancee.xy

