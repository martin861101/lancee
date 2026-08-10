Agent Task: Integrate OpenConnector into Lancee as the External Integration Gateway

Objective

Integrate OpenConnector into the existing Lancee platform as the primary gateway for third-party SaaS integrations.

OpenConnector repository:

https://github.com/oomol-lab/open-connector

The purpose of this integration is to allow Lancee users to connect external services such as:

- Google Workspace
- Gmail
- Google Drive
- Microsoft 365
- Outlook
- Slack
- GitHub
- Notion
- Airtable
- Dropbox
- HubSpot
- Other OpenConnector-supported providers

OpenConnector must NOT replace the existing Lancee MCP server, Lancee API, existing workers, registry, permissions system, automation system, or native tools.

Instead, OpenConnector becomes a lower-level Integration Gateway used by Lancee.

The intended architecture is:

User
 │
 ▼
Lancee UI
 │
 ▼
Lancee AI / Agent
 │
 ▼
lancee-mcp
 │
 ├── Native Lancee capabilities
 │     ├── web
 │     ├── browser
 │     ├── playwright
 │     ├── files
 │     ├── documents
 │     ├── pdf
 │     ├── data
 │     ├── code
 │     └── lancee platform operations
 │
 └── Integration Gateway
       │
       ▼
 OpenConnector Adapter
       │
       ▼
 OpenConnector
       │
       ├── Google
       ├── Microsoft
       ├── Slack
       ├── GitHub
       ├── Notion
       ├── Airtable
       └── other providers

---

1. CRITICAL RULE: INSPECT BEFORE IMPLEMENTING

Before writing code, inspect the complete Lancee repository.

Determine whether Lancee already contains implementations for:

- MCP tool registry
- MCP tool discovery
- worker registry
- worker execution
- HTTP workers
- integrations
- OAuth
- credential storage
- secrets management
- user connections
- external providers
- permissions
- scopes
- audit logging
- execution logging
- automation execution
- job queues
- Redis leases
- tool policies
- tenant/workspace isolation
- API routes
- AI tool execution
- dynamic tool discovery

Search the codebase thoroughly.

Do NOT create duplicate architecture.

If an existing abstraction can support OpenConnector, extend it.

If functionality already exists and works, preserve it.

Do not refactor unrelated working systems simply because another architecture might appear cleaner.

---

2. READ OPENCONNECTOR BEFORE IMPLEMENTATION

Study the current OpenConnector repository and documentation before implementing anything.

Repository:

https://github.com/oomol-lab/open-connector

Determine the CURRENT supported interfaces and architecture, including:

- deployment
- Docker support
- HTTP API
- OpenAPI
- MCP support
- authentication
- providers
- actions
- OAuth
- API-key credentials
- connection identities
- scopes
- token refresh
- policies
- execution logs
- action discovery
- action schemas
- provider metadata

Do not assume API routes or schemas.

Use the actual current OpenConnector implementation.

Document which OpenConnector version/commit the Lancee integration targets.

---

3. ARCHITECTURAL PRINCIPLE

Lancee remains the intelligence and orchestration layer.

OpenConnector is an execution gateway.

OpenConnector must NOT decide:

- user intent
- workflow planning
- task decomposition
- tool selection strategy
- automation logic
- Lancee permissions
- project/client context
- business rules

Example:

User:
"Research Company X, take a screenshot of their website,
create a PDF summary and email it to John."

Lancee should orchestrate:

research_company
        ↓
browse_web
        ↓
access_webpage
        ↓
playwright_screenshot
        ↓
create_pdf
        ↓
resolve_contact
        ↓
integration.execute
        ↓
OpenConnector
        ↓
gmail.send_email

OpenConnector performs the external provider operation.

It does NOT orchestrate the workflow.

---

4. DO NOT EXPOSE THOUSANDS OF ACTIONS TO THE LLM

OpenConnector may expose thousands of actions.

DO NOT register every OpenConnector action as a permanent Lancee MCP tool.

This would:

- increase context size
- make tool selection unreliable
- create unnecessary token usage
- expose irrelevant capabilities
- complicate permissions

Instead create a small dynamic integration interface.

Preferred Lancee MCP capabilities:

integrations.search
integrations.describe
integrations.execute
integrations.connections

Potential optional capabilities:

integrations.providers
integrations.connect
integrations.disconnect
integrations.status

Use the existing Lancee tool naming convention if one already exists.

---

5. INTEGRATION SEARCH

Implement dynamic action discovery.

Example:

{
  "query": "send an email"
}

Lancee should be able to receive relevant actions such as:

gmail.send_email
outlook.send_email

Search should preferably consider:

- user query
- connected providers
- action name
- action description
- required scopes
- provider
- workspace permissions

Do not return hundreds of irrelevant actions.

Return a small ranked set.

Suggested default:

5-10 actions

Make the result limit configurable.

---

6. ACTION DESCRIPTION

"integrations.describe" should return enough information for Lancee to safely call an action.

Example:

{
  "action": "gmail.send_email"
}

Potential response:

{
  "provider": "gmail",
  "action": "send_email",
  "description": "Send an email",
  "input_schema": {},
  "required_scopes": [],
  "connection_required": true
}

Use OpenConnector's actual schema rather than inventing one.

Normalize it into Lancee's internal format where useful.

---

7. ACTION EXECUTION

Implement a single controlled execution path.

Conceptually:

integrations.execute()

Example:

{
  "action": "gmail.send_email",
  "connection_id": "...",
  "input": {
    "to": "person@example.com",
    "subject": "Company Research",
    "body": "...",
    "attachments": []
  }
}

Execution path:

AI
 ↓
lancee-mcp
 ↓
integration service
 ↓
permission validation
 ↓
connection validation
 ↓
action validation
 ↓
OpenConnector adapter
 ↓
OpenConnector
 ↓
provider API

Never allow the LLM to directly construct arbitrary OpenConnector HTTP requests.

All calls must pass through the Lancee integration service.

---

8. CREATE AN OPENCONNECTOR ADAPTER

OpenConnector-specific implementation details must be isolated.

Preferred conceptual structure:

integrations/
├── integration.service
├── integration.registry
├── integration.permissions
├── integration.types
├── integration.errors
│
└── providers/
    └── openconnector/
        ├── client
        ├── adapter
        ├── mapper
        ├── config
        ├── types
        └── health

Adapt this structure to the existing repository.

Do NOT create this exact structure if Lancee already has an appropriate provider/adapter architecture.

The rest of Lancee should depend on an internal interface rather than OpenConnector-specific implementation.

Example:

interface IntegrationGateway {
  searchActions(...)
  describeAction(...)
  executeAction(...)
  listConnections(...)
}

OpenConnector then implements that interface.

This makes it possible to add another gateway later without changing Lancee's orchestration system.

---

9. CONNECTION MODEL

Users/workspaces must have isolated provider connections.

Conceptually:

Workspace
   │
   ├── Google Workspace
   ├── Microsoft 365
   ├── Slack
   └── GitHub

Connection metadata should belong to Lancee.

Example conceptual record:

integration_connections

id
workspace_id
user_id
provider
external_connection_id
display_name
status
scopes
created_at
updated_at
last_used_at

Do NOT store OAuth access tokens in Lancee if OpenConnector is responsible for credential storage.

Store only the identifiers and metadata Lancee requires.

Never expose credentials to the frontend or LLM.

Use the existing Lancee database conventions and migrations.

---

10. MULTI-TENANT SECURITY

Lancee is multi-tenant.

Every integration operation must validate:

user
 ↓
workspace
 ↓
connection
 ↓
provider
 ↓
action
 ↓
permissions

A connection belonging to Workspace A must NEVER be usable by Workspace B.

Never trust a connection ID supplied by the frontend or LLM without checking ownership.

Enforce isolation server-side.

---

11. PERMISSIONS

OpenConnector capabilities must pass through Lancee's permission system.

Examples:

integration.gmail.read
integration.gmail.send

integration.drive.read
integration.drive.write

integration.github.read
integration.github.write

However, do not unnecessarily hard-code every provider/action if Lancee already supports dynamic permissions.

Prefer hierarchical permission matching such as:

integration.*
integration.gmail.*
integration.gmail.send_email

Use the existing Lancee permission architecture where possible.

---

12. DESTRUCTIVE ACTION CLASSIFICATION

Actions must be classified by risk.

Example:

READ
WRITE
DESTRUCTIVE
FINANCIAL
ADMIN

Examples:

search_email      → READ
send_email        → WRITE
delete_email      → DESTRUCTIVE

list_files        → READ
upload_file       → WRITE
delete_file       → DESTRUCTIVE

If Lancee already has tool risk levels, use them.

Do not introduce another parallel system.

High-risk actions must support Lancee's approval/confirmation system if one exists.

---

13. AI SAFETY BOUNDARY

The AI must never receive:

- OAuth tokens
- refresh tokens
- API keys
- client secrets
- OpenConnector administrative credentials
- raw encrypted credential payloads

The AI should only see things such as:

provider
connection
action
description
input schema
execution result

Secrets remain server-side.

---

14. INTEGRATIONS UI

Add an Integrations area to Lancee if an appropriate interface does not already exist.

Suggested:

Settings
└── Integrations

Example:

Integrations

Google Workspace       Connected
Microsoft 365          Connected
Slack                   Connect
GitHub                  Connected
Notion                  Connect
Dropbox                 Connect
Airtable                Connect

Each provider should support appropriate states:

Available
Connecting
Connected
Expired
Error
Disabled

Connected providers should display useful non-sensitive information such as:

Account
Workspace
Scopes
Connected date
Status

Provide:

Connect
Reconnect
Disconnect

Use Lancee's existing design system.

Do not introduce a visually unrelated UI framework.

---

15. OAUTH FLOW

Where OpenConnector provides OAuth handling, Lancee should initiate the connection flow and allow OpenConnector to manage the provider authentication.

Conceptual flow:

User
 ↓
Lancee
 ↓
Connect Google
 ↓
Lancee Backend
 ↓
OpenConnector
 ↓
Google OAuth
 ↓
OpenConnector callback
 ↓
Lancee connection association
 ↓
Connected

Protect against:

- CSRF
- state tampering
- workspace switching
- account confusion
- connection hijacking

Do not expose OpenConnector administrative endpoints publicly.

---

16. OPENCONNECTOR DEPLOYMENT

Add OpenConnector to Lancee's deployment architecture.

Prefer containerized deployment.

Conceptually:

services:

lancee-api
lancee-mcp
postgres
redis
openconnector

OpenConnector should communicate over the private/internal network wherever possible.

Do not expose OpenConnector directly to the public internet unless technically required.

If an OAuth callback must be externally accessible, expose only the required callback/gateway route through the appropriate reverse proxy.

Add health checks.

Example conceptual dependency:

lancee-api
   ↓
openconnector

Add environment configuration.

Example only:

OPENCONNECTOR_URL=
OPENCONNECTOR_API_KEY=
OPENCONNECTOR_TIMEOUT=
OPENCONNECTOR_ENABLED=

Use the actual OpenConnector configuration requirements.

Never commit secrets.

Update ".env.example".

---

17. HEALTH MONITORING

Lancee should know whether the integration gateway is available.

Add OpenConnector to existing health/status infrastructure.

Example:

{
  "openconnector": {
    "status": "healthy",
    "latency_ms": 24
  }
}

Handle:

healthy
degraded
unavailable

Do not allow an unavailable OpenConnector service to crash Lancee.

Native Lancee capabilities must continue working.

---

18. TIMEOUTS AND RETRIES

External integrations are unreliable by nature.

Implement sensible:

- connection timeout
- request timeout
- retry
- backoff
- rate-limit handling
- provider error handling

Do not blindly retry destructive actions.

Example:

READ action:
safe retry possible

WRITE action:
retry only when idempotency is known

DESTRUCTIVE action:
do not automatically retry unless explicitly safe

Use existing Lancee retry infrastructure if available.

---

19. NORMALIZED ERRORS

OpenConnector/provider errors should be normalized.

Example:

INTEGRATION_NOT_CONNECTED
INTEGRATION_PERMISSION_DENIED
INTEGRATION_SCOPE_REQUIRED
INTEGRATION_RATE_LIMITED
INTEGRATION_AUTH_EXPIRED
INTEGRATION_PROVIDER_ERROR
INTEGRATION_GATEWAY_UNAVAILABLE
INTEGRATION_ACTION_NOT_FOUND
INTEGRATION_INVALID_INPUT

Preserve the underlying error internally for debugging.

Return safe messages to the AI/frontend.

---

20. EXECUTION LOGGING

Every integration execution should be auditable.

Record metadata such as:

execution_id
workspace_id
user_id
provider
connection_id
action
risk_level
status
duration
timestamp
source

Potential sources:

user
ai
automation
workflow
api

Do NOT log:

- access tokens
- refresh tokens
- API keys
- secrets
- sensitive authorization headers

Redact sensitive fields.

---

21. AUTOMATIONS

OpenConnector actions must eventually be usable by Lancee Automations.

Example:

Trigger:
Project approved

Actions:

generate_invoice
      ↓
create_pdf
      ↓
integration.execute(
    provider = "gmail",
    action = "send_email"
)

Do not create a separate automation engine.

Expose integrations through the existing Lancee automation/action architecture.

---

22. MCP INTEGRATION

Expose the integration gateway to Lancee AI through the existing MCP registry.

Prefer a minimal tool surface.

Target conceptual tools:

integrations_search
integrations_describe
integrations_execute
integrations_connections

Follow the existing registry/tool format exactly.

Do not change existing MCP tools.

Do not rename working tools.

Do not alter existing worker behavior.

---

23. INTELLIGENT TOOL DISCOVERY

This is important.

Lancee should be able to dynamically discover external capabilities.

Example user request:

"Send the finished proposal to John."

Lancee reasoning:

Need external communication capability.

Then:

integrations.search("send email")

Potential result:

gmail.send_email
outlook.send_email

Then inspect available connections:

integrations.connections()

Suppose:

Microsoft 365 → connected

Lancee can then describe:

outlook.send_email

and execute it.

This avoids permanently exposing thousands of external tools to the model.

---

24. FUTURE-PROOF THE INTEGRATION LAYER

Do not make Lancee dependent on OpenConnector throughout the codebase.

The architecture should remain:

Lancee
   ↓
IntegrationGateway interface
   ↓
OpenConnectorAdapter
   ↓
OpenConnector

NOT:

Lancee
   ↓
OpenConnector everywhere

This allows future adapters:

IntegrationGateway
│
├── OpenConnectorAdapter
├── NativeGoogleAdapter
├── EnterpriseAdapter
└── CustomClientAdapter

without changing Lancee's AI orchestration.

---

25. FEATURE FLAG

OpenConnector should initially be feature-flagged.

Example:

OPENCONNECTOR_ENABLED=true

If disabled:

Native Lancee tools → continue working
External integrations → unavailable

This allows gradual rollout.

---

26. TESTING

Implement comprehensive tests.

At minimum test:

Adapter

search actions
describe action
execute action
list connections
errors
timeouts

Security

workspace isolation
connection ownership
permission validation
credential leakage
invalid connection IDs
unauthorized actions

MCP

integration search
description
execution
connection discovery

Failure scenarios

OpenConnector offline
provider offline
OAuth expired
scope missing
rate limit
invalid action
invalid input
timeout

Existing tests must continue passing.

---

27. INITIAL PROVIDER VALIDATION

Do not attempt to manually test 1,000 providers.

Select a small validation set.

Prefer:

Google / Gmail
Microsoft / Outlook
GitHub
Slack

Validate the architecture using these providers.

Once the generic adapter works correctly, additional OpenConnector providers should require little or no Lancee-specific implementation.

---

28. END-TO-END TEST

Create at least one end-to-end test demonstrating:

User request
      ↓
Lancee AI
      ↓
MCP
      ↓
integration search
      ↓
provider selection
      ↓
connection selection
      ↓
action description
      ↓
permission validation
      ↓
OpenConnector
      ↓
provider
      ↓
result

Example scenario:

"Send an email through my connected Gmail account."

Do not send a real external email in automated tests.

Use mocking/test credentials where appropriate.

---

29. DOCUMENTATION

Create:

docs/integrations/openconnector.md

or place documentation in Lancee's existing documentation structure.

Document:

- architecture
- why OpenConnector exists
- responsibility boundaries
- deployment
- configuration
- OAuth
- connections
- permissions
- MCP tools
- dynamic discovery
- action execution
- error handling
- security
- adding providers
- troubleshooting

Include an architecture diagram.

Example:

                    LANCEE

                  User / UI
                      │
                      ▼
                  Lancee AI
                      │
                      ▼
                 lancee-mcp
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
    Native Workers         Integration Gateway
                                  │
                                  ▼
                         OpenConnector Adapter
                                  │
                                  ▼
                            OpenConnector
                                  │
                 ┌────────────────┼──────────────┐
                 ▼                ▼              ▼
               Google          Microsoft        Slack

---

30. IMPLEMENTATION REPORT

When implementation is complete, provide a report containing:

Existing architecture discovered

Explain what relevant systems already existed.

Changes made

List every important file created or modified.

Architecture

Explain how OpenConnector now fits into Lancee.

Database

List migrations/tables/fields added.

MCP

List tools added.

API

List endpoints added.

UI

Describe the integrations interface.

Security

Explain:

- workspace isolation
- permission checks
- secret handling
- OAuth handling

Deployment

Explain how OpenConnector runs.

Testing

List tests added and results.

Remaining work

Clearly identify anything requiring:

- OAuth application credentials
- provider configuration
- DNS
- production secrets
- external account configuration
- manual testing

---

31. NON-NEGOTIABLE REQUIREMENTS

Do NOT:

- replace lancee-mcp
- replace lancee-api
- replace existing workers
- replace the existing registry
- expose all OpenConnector actions directly to the LLM
- store OAuth tokens in frontend state
- expose secrets to the AI
- hard-code credentials
- weaken workspace isolation
- bypass Lancee permissions
- duplicate existing architecture
- unnecessarily refactor working functionality
- make OpenConnector a hard dependency for native Lancee functionality

DO:

- inspect first
- reuse existing architecture
- isolate OpenConnector behind an adapter
- use dynamic action discovery
- enforce permissions server-side
- maintain tenant isolation
- add auditing
- add health checks
- use feature flags
- test failure scenarios
- document the implementation

---

32. TARGET END STATE

The final Lancee architecture should effectively provide:

LANCEE
│
├── Intelligence
│   └── AI orchestration
│
├── MCP Capability Layer
│   ├── tool discovery
│   ├── permissions
│   ├── execution
│   └── orchestration
│
├── Native Capability Workers
│   ├── Web
│   ├── Browser
│   ├── Playwright
│   ├── Files
│   ├── Documents
│   ├── PDF
│   ├── Data
│   └── Code
│
├── External Integration Gateway
│   │
│   └── OpenConnector
│       └── 1,000+ external providers
│
├── Lancee Platform API
│   ├── Users
│   ├── Workspaces
│   ├── Clients
│   ├── Projects
│   ├── Billing
│   └── Automations
│
└── Infrastructure
    ├── PostgreSQL
    ├── Redis
    └── Jobs / workers

The user should ultimately experience this simply as:

Lancee
Settings
Integrations

Google Workspace       ✓ Connected
Microsoft 365          ✓ Connected
Slack                   + Connect
GitHub                  ✓ Connected
Notion                  + Connect

While Lancee AI can dynamically discover and safely execute capabilities from those connected services without needing thousands of permanently registered LLM tools.

---

Final Instruction

Work incrementally.

First:

1. Inspect Lancee.
2. Inspect OpenConnector.
3. Map existing Lancee architecture to the proposed integration.
4. Produce a short implementation plan.
5. Implement the integration.
6. Run existing and new tests.
7. Fix regressions.
8. Produce the implementation report.

Do not stop after producing the plan unless a genuinely blocking decision requires user input.

Preserve all currently working Lancee functionality.
