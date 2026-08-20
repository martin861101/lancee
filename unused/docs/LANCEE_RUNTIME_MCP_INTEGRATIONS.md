# Lancee MCP & Agentic Runtime Architecture

**Status:** Accepted architecture · V1 phases 0–5 implemented · production deployment smoke pending
**Platform:** Lancee
**Purpose:** AI orchestration, tool execution, automation and global capability framework
**Design principle:** *AI decides. MCP exposes. Services execute. Lancee governs.*

---

# Implementation decision — 2026-08-08

Lancee will have exactly **one MCP server**. It is owned by Lancee, lives in this
repository, and is served by the Lancee application at `/mcp`.

The runtime will not discover, proxy, or operate a grid of other MCP servers.
Browser automation, web research, document generation, and third-party
integrations remain valid capabilities, but they must be implemented as Lancee
modules, service adapters, or workers behind the same authorization and audit
boundary. They are not separate MCP protocol peers.

The deployment invariant is:

```text
MCP client
    │ workspace-scoped Lancee token
    ▼
POST /mcp
    │
    ▼
Lancee MCP protocol adapter
    │
    ▼
Lancee tool registry → policies → API/services/workers
```

The following legacy paths are retired as part of Phase 1:

- the remote MCP Grid gateway and generated client;
- Basebox MCP discovery and invocation;
- per-workspace activation of external MCP servers;
- separate MCP bearer secrets and standalone MCP deployment commands;
- the repository-local MCP capability-grid documentation; and
- the obsolete `mcp_access` and `mcp_service_state` activation tables (startup
  drops them from upgraded databases; `mcp_invocations` remains as audit).

## Integration rollout

| Phase | Status | Deliverable |
| --- | --- | --- |
| 0. Architecture lock | Complete | One in-codebase Lancee MCP boundary; no external MCP federation. |
| 1. Local protocol foundation | Complete | `/mcp` lists and invokes Lancee tools directly with workspace context; remote MCP code/configuration removed. |
| 2. Capability modules | Complete | One typed 40-tool registry covers Lancee platform, web, browser-read, visual, files, documents, integrations, artifacts, jobs, and approvals. |
| 3. Agent runtime | Complete | Persisted planner/executor loop, hard budgets, bounded retries, loop protection, cancellation, and one-use argument-bound approvals. |
| 4. Workers and artifacts | Complete | Database-authoritative leased jobs, recovery, retries, events, artifact integrity, links, and workspace isolation. |
| 5. V1 hardening | Complete in code | Schema parity, policy, SSRF, audit, rate/concurrency/queue limits, SQLite/PostgreSQL portability, and end-to-end tests are implemented. Production deployment and browser smoke remain operator steps. |

Phase 1 is complete when Lancee can initialize MCP, list its local tool schema,
invoke a tool with the authenticated workspace context, and run without any
remote MCP server URL, token, registry, or client package.

## V1 implementation completion — 2026-08-08

The rollout above is implemented in this repository. The application exposes
exactly one MCP protocol endpoint at `/mcp`; it does not discover, proxy, start,
or configure another MCP server. Its dynamic catalog contains 40 public tools
backed by immutable local contracts under `server/capabilities/`. Every
contract declares its schemas, version, provider, permissions, risk, approval
policy, timeout, cost estimate, concurrency limit, async support, and tags.

The completed runtime includes:

- local web search/access/extract/crawl with DNS pinning, public-address checks,
  redirect revalidation, bounded responses, and untrusted-result marking;
- isolated Playwright read/snapshot/screenshot work, visual inspection, file
  read/write/search, PDF/DOCX/HTML/Markdown creation, deterministic document
  merging, and artifact registration;
- a persisted agent thread/run/step/event model with validated JSON planning,
  backward-only result references between steps, normalized tool envelopes,
  hard token/cost/runtime/tool/step budgets, bounded retry backoff,
  cancellation, and repeated-call protection;
- expiring, one-use approvals bound to the exact capability and canonical
  argument hash before an autonomous high-risk invocation can execute;
- database-authoritative execution jobs with idempotent enqueue, atomic leases,
  heartbeats, crash recovery, retries, cancellation, durable events, and a
  queue-depth limit;
- workspace-scoped artifacts with integrity hashes, metadata, links, content
  access, soft deletion, and restoration;
- one authorization and audit boundary shared by MCP clients, the persisted
  dashboard agent, and internal service adapters; and
- focused SQLite and PostgreSQL-compatible persistence checks plus end-to-end
  MCP, policy, connector, worker, artifact, document, and agent verifiers.

The production container supplies a pinned Playwright/Chromium runtime and
runs browser work in a non-root child process. A deployed Chromium screenshot
smoke and normal production rollout checks cannot be completed by source
implementation alone and are explicitly retained as deployment steps.

Sections 58 and 59 describe post-V1 expansion ideas. Interactive browser
mutation tools, broad SaaS families, agent delegation, and arbitrary custom
modules are not part of this completed V1 and must enter through the same local
registry and policy boundary if added later.

---

# 1. Objective

Lancee should not implement AI as a chatbot with a handful of functions.

The goal is to create an **agentic runtime** capable of taking a high-level user request, determining the required operations, selecting appropriate capabilities, executing them safely, combining their outputs, and producing a useful result.

For example:

> "Find some information on Company X, visit their website and take a screenshot so I can see their colours. Create a nice PDF with everything."

Lancee should be capable of translating that into something resembling:

```text
User Request
     │
     ▼
Intent + Planning
     │
     ├── Need public information
     ├── Need company website
     ├── Need website content
     ├── Need visual screenshot
     ├── Need colour analysis
     └── Need final document
     │
     ▼
Tool orchestration
     │
     ├── browse_web
     ├── access_webpage
     ├── extract_web_content
     ├── playwright_screenshot
     ├── analyze_visual
     ├── combine_content
     ├── document_designer
     ├── create_pdf
     └── write_file
     │
     ▼
Final Artifact
```

The user should not need to know which tools exist.

They specify the **goal**.

Lancee determines the execution path.

---

# 2. Core Philosophy

Lancee should support three execution models simultaneously.

```text
                  LANCEE
                     │
       ┌─────────────┼─────────────┐
       │             │             │
       ▼             ▼             ▼
    MANUAL       AUTOMATED      AGENTIC
       │             │             │
 User clicks      Trigger       User intent
   button           fires           │
       │             │              ▼
       │        Workflow engine     AI
       │             │              │
       └─────────────┼──────────────┘
                     ▼
                Lancee API
                     │
               Core Services
```

### Manual

User explicitly performs an operation.

```text
Create Invoice button
        ↓
Lancee API
        ↓
Invoice Service
```

### Automated

A deterministic event causes predefined operations.

```text
invoice.overdue
      ↓
Automation Engine
      ↓
send_reminder
```

### Agentic

The user specifies an outcome.

```text
"Deal with John's overdue invoice."
                ↓
               AI
                ↓
        determine required actions
```

These models should **share the same underlying business services**.

---

# 3. Fundamental Responsibility Model

This distinction must remain consistent throughout Lancee.

```text
AI
"What needs to happen?"

MCP
"What capabilities are available?"

API
"Is this operation valid and authorized?"

WORKER
"Execute the operation."

EVENT BUS
"What happened?"

QUEUE
"What needs asynchronous processing?"

DATABASE
"What is true?"
```

Or:

```text
       THINK
         │
         ▼
        AI
         │
       CHOOSE
         │
         ▼
        MCP
         │
      REQUEST
         │
         ▼
        API
         │
      EXECUTE
         │
         ▼
 SERVICE / WORKER
```

MCP must **not become a second Lancee backend**.

---

# 4. High-Level Architecture

```text
                         USER
                          │
                          ▼
                    LANCEE WEB
                     React 19+
                          │
             ┌────────────┴────────────┐
             │                         │
             ▼                         ▼
        Normal API                  AI API
             │                         │
             │                         ▼
             │                  AI ORCHESTRATOR
             │                         │
             │                         ▼
             │                 LANCEE MCP
             │              (local `/mcp` route)
             │                       │
             │                       ▼
             │               CAPABILITY ROUTER
             │                       │
             └───────────────────────┼───────────────────────┐
                                     ▼                       │
                                LANCEE API                   │
                                     │                       │
                         ┌───────────┼───────────┐            │
                         │           │           │            │
                         ▼           ▼           ▼            ▼
                      Services    Event Bus    Job Queue   Integration
                                                             adapters
          │                       │
          ▼                 ┌─────┼──────┐
      PostgreSQL            ▼     ▼      ▼
                          Docs   AI   Integration
                         Worker Worker   Worker
```

---

# 5. The Lancee Agent

The Lancee Agent is the primary reasoning/orchestration layer.

It should **not**:

* access PostgreSQL directly;
* contain business logic;
* calculate authoritative financial values;
* bypass permissions;
* store credentials;
* execute arbitrary shell commands by default;
* independently modify tenant boundaries.

It should:

* understand intent;
* gather context;
* discover appropriate tools;
* construct an execution plan;
* invoke tools;
* evaluate results;
* recover from recoverable failures;
* request approval when necessary;
* combine outputs;
* determine when the task is complete.

---

# 6. Agent Execution Loop

A standard agent run should follow:

```text
REQUEST
   ↓
CONTEXT
   ↓
PLAN
   ↓
DISCOVER
   ↓
AUTHORIZE
   ↓
EXECUTE
   ↓
OBSERVE
   ↓
CONTINUE?
 ┌─┴─┐
YES  NO
 │    │
 └────┘
      ↓
   RESPOND
```

Conceptually:

```text
while goal_not_complete:

    understand_current_state()

    select_next_capability()

    check_policy()

    execute_tool()

    inspect_result()

    update_working_state()

return final_result
```

A hard maximum number of steps must exist.

---

# 7. Lancee MCP boundary

Create one logical `lancee-mcp` module inside this repository. Its
responsibility is to expose **Lancee-governed capabilities** to agents using
MCP.

For V1 it is part of the Lancee application process and shares the normal
public origin:

```text
lancee application
├── web
├── API
├── AI orchestrator
└── POST /mcp
```

`/mcp` is a protocol adapter, not a proxy. It lists schemas from Lancee's local
tool registry and invokes the same application services used by manual and
automated flows. The authenticated token supplies the workspace and user
context for every call.

There must be no independent MCP registry, discovery gateway, Basebox bridge,
or worker MCP endpoint in the V1 deployment. A worker may execute a queued job,
but it receives an internal job contract rather than an MCP request.

The MCP module may become a separate process later only for scaling or failure
isolation. If that happens it remains code from this repository, uses Lancee
authentication, and still exposes the single canonical `/mcp` surface.

---

# 8. MCP Is Not the Business Layer

For example:

```text
MCP TOOL
create_invoice
      │
      ▼
Lancee API
      │
      ▼
Invoice Service
      │
      ├── validation
      ├── authorization
      ├── calculations
      ├── database
      ├── audit
      └── events
```

Do NOT duplicate:

```text
/api/invoices/createInvoice.ts

AND

/mcp/tools/createInvoice.ts
```

with separate implementations.

The MCP handler should mostly be an adapter.

---

# 9. Tool Taxonomy

Lancee should divide tools into four broad classes.

```text
TOOLS
│
├── PLATFORM
│
├── GLOBAL
│
├── INTEGRATION
│
└── SYSTEM
```

## Platform Tools

Operations belonging specifically to Lancee.

Examples:

```text
client.search
client.get
client.create

project.search
project.get
project.create

task.create
task.assign

invoice.create
invoice.send

approval.request
```

## Global Tools

General capabilities independent of Lancee.

Examples:

```text
web.search
web.fetch
web.extract

browser.navigate
browser.screenshot

document.create
pdf.create

file.read
file.write

content.combine
```

## Integration Tools

Third-party systems.

Examples:

```text
google.*
microsoft.*
adobe.*
slack.*
accounting.*
storage.*
```

## System Tools

Internal agent/runtime operations.

Examples:

```text
job.status
artifact.register
approval.request
capability.search
```

---

# 10. Lancee Platform Tool Domains

The Lancee MCP should expose domain-oriented capabilities.

## Workspace

```text
workspace.get_context
workspace.get_settings
workspace.get_capabilities
```

User/workspace identity should normally come from authenticated context rather than LLM arguments.

---

## Clients

```text
client.search
client.get
client.get_context
client.create
client.update
client.get_activity
client.get_contacts
```

`client.get_context` is particularly valuable.

Instead of:

```text
get client
get projects
get invoices
get tasks
get comments
get approvals
```

the agent can request:

```text
client.get_context
```

and receive a normalized overview.

---

# 11. Projects

```text
project.search
project.get
project.get_context
project.create
project.update
project.archive
project.get_activity
project.get_files
project.get_financials
```

---

# 12. Tasks / Work

```text
task.search
task.get
task.create
task.update
task.assign
task.move
task.complete
task.bulk_create
```

---

# 13. Finance

Financial tools should be particularly tightly controlled.

```text
invoice.search
invoice.get
invoice.create
invoice.update
invoice.send
invoice.get_status

payment.search
payment.get_status

quote.create
quote.send

finance.get_summary
```

The LLM should never independently calculate authoritative totals where Lancee already has a financial calculation service.

---

# 14. Client Approval / Annotation

This should become a first-class Lancee capability.

```text
approval.create_request
approval.get_status
approval.get_feedback
approval.cancel
approval.list

annotation.get
annotation.list
```

This lets the AI answer:

> "Which projects are waiting for clients?"

without understanding internal database structures.

---

# 15. Communication

Prefer intent-level capabilities:

```text
communication.send
communication.draft
communication.search
communication.get_thread
communication.notify
```

rather than exposing provider implementation details everywhere.

For example:

```text
communication.send
       ↓
Lancee Communication Service
       ↓
appropriate provider
```

---

# 16. Lancee Search

One of the most important capabilities should be:

```text
workspace.search
```

Example:

```text
workspace.search({
    query:
      "the client that complained about
       the homepage colours last week"
})
```

It can search across authorized:

```text
clients
projects
tasks
comments
files
approvals
communications
invoices
activity
```

This becomes the primary Lancee intelligence retrieval layer.

---

# 17. Global Capability Framework

This is where your Company X example becomes possible.

Do **not** put all implementation logic directly into the MCP protocol
adapter. Keep each capability in a typed Lancee module or worker and register
its tool contract with the local capability router.

```text
                   AI
                    │
           CAPABILITY ROUTER
                    │
       ┌────────────┼─────────────┐
       ▼            ▼             ▼
   Platform        Web          Browser
    module        adapter        worker
```

---

# 18. Web Research Framework

Recommended semantic capabilities:

```text
web.search
web.access
web.extract
web.crawl
web.find
```

### `web.search`

Search the public internet.

Input conceptually:

```text
query
domains?
recency?
limit?
```

Return normalized search results.

### `web.access`

Retrieve a particular webpage.

### `web.extract`

Extract meaningful structured content.

For example:

```text
web.extract({
    url: "...",
    schema: {
        company_name,
        description,
        services,
        contact_details
    }
})
```

### `web.crawl`

Crawl an explicitly bounded website.

Important:

```text
max_pages
max_depth
allowed_domain
timeout
robots_policy
```

must exist.

Never allow an unbounded agent crawl.

---

# 19. Browser / Playwright Framework

Use a specialized Playwright-backed Lancee worker rather than placing browser
automation inside the MCP protocol handler. It is an internal capability, not
a second MCP server.

Capabilities might include:

```text
browser.navigate
browser.snapshot
browser.click
browser.type
browser.select
browser.wait
browser.screenshot
browser.download
browser.extract
browser.close
```

A screenshot tool should support:

```text
url
full_page
viewport
element?
output_format
```

The output should become an **artifact**, not just a random filesystem path.

Example:

```text
artifact://run_128/screenshot_01.png
```

---

# 20. Visual Intelligence

A screenshot alone isn't sufficient for many Lancee workflows.

Add a visual-analysis capability:

```text
visual.analyze
visual.extract_palette
visual.describe_layout
visual.compare
```

Company website:

```text
browser.screenshot
       ↓
visual.extract_palette
```

might produce:

```text
Primary:
#14213D

Secondary:
#FCA311

Background:
#FFFFFF

Text:
#111827
```

This makes:

> "Show me what colours they use"

much more useful than merely attaching a screenshot.

---

# 21. Content Framework

Create normalized content-processing capabilities.

```text
content.combine
content.summarize
content.rewrite
content.structure
content.extract
content.compare
content.transform
```

`content.combine` is especially important.

Input:

```text
research
website extraction
visual analysis
Lancee data
user notes
files
```

Output:

```text
Normalized Content Document
```

This prevents document generation tools from having to understand ten different input formats.

---

# 22. Artifact Model

Lancee should introduce a universal **Artifact** abstraction.

An artifact could be:

```text
PDF
DOCX
PNG
JPG
CSV
JSON
Markdown
Video
ZIP
Screenshot
Generated report
```

Example schema:

```text
Artifact

id
workspace_id
user_id
run_id

type
mime_type
name

storage_key
size

source
created_at
expires_at

metadata
```

Tools pass around:

```text
artifact_id
```

rather than arbitrary filesystem paths whenever possible.

---

# 23. File Framework

Global file capabilities:

```text
file.search
file.read
file.write
file.copy
file.move
file.delete
file.metadata
```

Lancee-specific files should remain scoped through:

```text
artifact.*
project.files.*
client.files.*
```

A tool must never accept something like:

```text
../../etc/passwd
```

File access requires sandboxing and workspace-level authorization.

---

# 24. Document Framework

This deserves its own service.

```text
document-worker
```

Capabilities:

```text
document.create
document.render
document.convert
document.merge

pdf.create
pdf.merge
pdf.extract
```

Supported outputs could eventually include:

```text
PDF
DOCX
PPTX
XLSX
HTML
Markdown
```

---

# 25. Document Designer

Your proposed:

```text
document_designer
```

should not simply mean:

> "LLM writes HTML."

Treat it as a proper layout capability.

Input:

```text
content
brand
document_type
audience
style
assets
```

For example:

```text
document.design({
   document_type: "company_research",
   content: artifact_123,
   assets: [
      screenshot_456
   ],
   style: "professional"
})
```

Output:

```text
DocumentLayout
```

Then:

```text
DocumentLayout
      ↓
document.render
      ↓
PDF
```

This separates **content intelligence from visual presentation**.

---

# 26. Global Document Pipeline

Your desired chain becomes:

```text
Sources
   │
   ▼
content.combine
   │
   ▼
document.design
   │
   ▼
document.render
   │
   ▼
pdf.create
   │
   ▼
artifact.register
```

This pipeline should be reusable everywhere.

---

# 27. Workers

I'd implement the following worker architecture.

```text
workers/
│
├── automation-worker
├── integration-worker
├── communication-worker
├── document-worker
├── media-worker
├── ai-worker
├── index-worker
├── event-worker
├── scheduler-worker
└── audit-worker
```

They do not all need to be independent containers initially.

They are **logical worker boundaries** that can be separated as scale requires.

---

# 28. Job Queue

Anything potentially slow should become a job.

For example:

```text
web crawl
large PDF generation
media processing
bulk emails
large imports
AI document analysis
exports
integration synchronization
```

Architecture:

```text
MCP
 ↓
API
 ↓
create job
 ↓
QUEUE
 ↓
WORKER
 ↓
result
 ↓
ARTIFACT / EVENT
```

Redis-backed queues would be perfectly reasonable for this architecture.

---

# 29. MCP Long-Running Operations

The agent should not maintain an HTTP request for several minutes waiting for a document.

Conceptually:

```text
document.create
      ↓
{
  job_id: "job_872",
  status: "queued"
}
```

The agent/runtime can later resolve:

```text
job.get_status(job_872)
```

or receive completion through Lancee's runtime/event mechanism.

---

# 30. Event Bus

This should be foundational.

Use canonical events:

```text
workspace.created

client.created
client.updated

project.created
project.updated
project.completed

task.created
task.completed

invoice.created
invoice.sent
invoice.paid
invoice.overdue

file.uploaded

approval.requested
approval.completed

comment.created

automation.started
automation.completed
automation.failed

agent.started
agent.completed
agent.failed

artifact.created
```

Then:

```text
invoice.paid
    │
    ├── dashboard
    ├── automation engine
    ├── notification service
    └── audit
```

Services no longer need to know about each other directly.

---

# 31. Tool Registry

Do not hard-code an enormous tool array into the agent.

Build a registry.

Each tool should have metadata resembling:

```text
name
namespace
version

description

input_schema
output_schema

provider

required_permissions

risk_level

requires_approval

estimated_cost

timeout

supports_async

enabled

tags
```

Example:

```text
browser.screenshot

namespace:
browser

risk:
low

permissions:
browser:read

approval:
false

provider:
playwright-mcp

tags:
browser
visual
website
screenshot
```

---

# 32. Capability Discovery

Eventually Lancee may have hundreds of tools.

Do not automatically dump every tool schema into every LLM request.

Introduce:

```text
capability.search
```

For:

> "Research Company X and create a PDF."

Capability resolution might identify:

```text
web.search
web.access
browser.screenshot
visual.extract_palette
content.combine
document.design
pdf.create
```

Only relevant tools need to enter the active agent context.

This is extremely important as Lancee grows.

---

# 33. Tool Namespaces

Use predictable namespaces.

```text
workspace.*
client.*
project.*
task.*
finance.*
invoice.*
payment.*
approval.*
communication.*

web.*
browser.*
visual.*
content.*
document.*
pdf.*
file.*
artifact.*

automation.*
integration.*
job.*
```

Avoid an uncontrolled registry containing:

```text
search
search2
search_web
google_search
do_search
research
research_web
```

Semantic consistency matters tremendously for tool selection.

---

# 34. Composite Tools

Don't force the AI to execute 20 primitive operations for common tasks.

Primitive:

```text
client.get
project.search
invoice.search
comment.search
file.search
```

Composite:

```text
client.get_context
project.get_context
workspace.get_daily_brief
finance.get_overview
```

Use both.

Primitive tools provide flexibility.

Composite tools provide efficiency.

---

# 35. Authentication Context

Every Lancee agent run must have trusted server-side context.

Example:

```text
AgentContext

user_id
workspace_id
session_id

roles
permissions

subscription
enabled_integrations

locale
timezone

run_id
```

The LLM should generally **not provide**:

```text
user_id
workspace_id
```

as arbitrary tool arguments.

The runtime injects them.

---

# 36. Authorization

Every tool execution follows:

```text
AI requests tool
       ↓
MCP receives
       ↓
Policy Engine
       ↓
Permission?
       ↓
Tenant scope?
       ↓
Risk?
       ↓
Approval required?
       ↓
Execute
```

Never trust:

> "The AI wouldn't do that."

The AI isn't the security boundary.

**Lancee is.**

---

# 37. Risk Classification

Every tool should receive a risk level.

### Level 0 — Read

```text
search
read
summarize
inspect
```

Usually automatic.

### Level 1 — Internal Write

```text
create task
update project
create draft
```

Generally allowed based on permissions.

### Level 2 — External Action

```text
send email
submit form
publish content
send invoice
```

May require user approval depending on settings.

### Level 3 — Financial / Destructive

```text
issue refund
delete project
cancel invoice
bulk delete
```

Require strong authorization and usually confirmation.

### Level 4 — Administrative

```text
change permissions
manage integrations
access secrets
workspace deletion
```

Highly restricted.

---

# 38. Human Approval Gates

Agent execution should be able to pause:

```text
AI PLAN

✓ Research company
✓ Visit website
✓ Take screenshot
✓ Generate report

⚠ Send report to client

          ↓

      APPROVAL

"Send Company X report to John?"

[Approve] [Cancel]
```

After approval, execution resumes from the stored run state.

---

# 39. Agent Run State

Persist every agent execution.

```text
agent_runs

id
workspace_id
user_id

request
status

plan

current_step
step_count

started_at
completed_at

token_usage
tool_cost

result
error
```

And:

```text
agent_steps

run_id
sequence

tool
input
output

duration
status
cost

approval_id
```

This gives Lancee resumability and observability.

---

# 40. Cost Governance

Every run needs budgets.

Example:

```text
max_llm_tokens
max_tool_calls
max_web_requests
max_browser_minutes
max_crawl_pages
max_generated_files
max_runtime
max_cost
```

Plans can influence limits.

For example:

```text
Solo
10 automation executions etc.

Pro
higher limits

Studio
larger organizational limits
```

AI usage can then be independently metered.

---

# 41. Loop Protection

Agentic systems absolutely require loop controls.

Prevent:

```text
search
 ↓
search
 ↓
search
 ↓
search
 ↓
...
```

Use:

```text
MAX_STEPS
MAX_IDENTICAL_CALLS
MAX_RUNTIME
MAX_TOOL_FAILURES
MAX_COST
```

and detect repeated equivalent actions.

---

# 42. Tool Result Standard

Every Lancee tool should return a normalized envelope.

For example:

```text
{
  success,
  data,
  artifacts,
  warnings,
  error,
  metadata
}
```

Metadata:

```text
tool
provider
duration
cost
request_id
```

This makes orchestration significantly easier.

---

# 43. Error Taxonomy

Standardize errors:

```text
AUTH_REQUIRED

PERMISSION_DENIED

NOT_FOUND

VALIDATION_ERROR

RATE_LIMITED

PROVIDER_ERROR

TIMEOUT

APPROVAL_REQUIRED

BUDGET_EXCEEDED

UNAVAILABLE

CONFLICT
```

Then the agent knows what it can recover from.

For example:

```text
RATE_LIMITED
```

should normally trigger deterministic retry logic.

Not LLM improvisation.

---

# 44. Retries

Retries belong primarily to infrastructure.

```text
Integration Worker
   ↓
request
   ↓
429
   ↓
backoff
   ↓
retry
```

Don't waste AI tokens having the LLM reason:

> "Maybe I'll try again in 10 seconds."

---

# 45. Secrets

Never expose secrets to the model.

The AI calls:

```text
integration.execute(
   connection="google_workspace"
)
```

The runtime resolves credentials server-side.

Architecture:

```text
AI
 │
 │ connection_id
 ▼
Worker
 │
 ▼
Secret Store
 │
 ▼
Provider
```

The model never receives:

```text
API_KEY
refresh_token
password
client_secret
```

---

# 46. Audit Framework

Every meaningful action should be traceable.

Example:

```text
Actor:
Martin

Origin:
AI

Request:
"Research Company X"

Agent run:
run_992

Tool:
browser.screenshot

Provider:
Playwright

URL:
companyx.com

Result:
artifact_882

Timestamp:
...

Duration:
1.4 sec
```

For writes:

```text
before
after
```

should be recorded where practical.

---

# 47. Observability

Use a shared correlation ID:

```text
run_id
```

across:

```text
AI
MCP
API
queue
worker
provider
events
```

So logs can reconstruct:

```text
run_283
  ├── agent
  ├── web.search
  ├── web.access
  ├── playwright
  ├── document-worker
  └── artifact
```

---

# 48. Example: Company Research

Now your original example.

User:

> "Find some information on Company X and also take a screenshot of their website so I can see the colours."

Agent interprets:

```text
Goal:
Research company + visual reference
```

Plan:

```text
1 Find authoritative company sources
2 Identify official website
3 Extract relevant information
4 Visit website
5 Capture screenshot
6 Analyse visual palette
7 Combine results
8 Return findings
```

Execution:

```text
AI
 │
 ├── web.search
 │
 ▼
Search Results
 │
 ├── official website
 ├── company profile
 └── trusted sources
 │
 ▼
web.access
 │
 ▼
web.extract
 │
 ▼
Structured company information


AI
 │
 ▼
browser.navigate
 │
 ▼
companyx.com
 │
 ▼
browser.screenshot
 │
 ▼
artifact:screenshot


AI
 │
 ▼
visual.extract_palette
 │
 ▼
Brand Colours
```

Final answer can contain:

```text
Company overview

Services

Website

Brand colours

Screenshot
```

No PDF required unless requested.

---

# 49. Extended Example: Generate Report

User:

> "Great. Put that into something nice I can send to the client."

The agent already has the previous run's artifacts/context.

It does:

```text
Previous Research
      +
Screenshot
      +
Palette
      ↓
content.combine
      ↓
document.design
      ↓
document.render
      ↓
pdf.create
      ↓
artifact.register
```

Result:

```text
Company-X-Research.pdf
```

---

# 50. Even More Powerful Example

User:

> "Research Company X, see what their current website looks like, check the projects we've done for similar companies, and create a proposal for a website redesign."

Now multiple MCP domains cooperate:

```text
                AI
                 │
      ┌──────────┼───────────┐
      ▼          ▼           ▼
     WEB      PLAYWRIGHT    LANCEE
      │          │           │
 Research     Screenshot   Search projects
      │          │           │
      └──────────┼───────────┘
                 ▼
           CONTENT ENGINE
                 │
                 ▼
         DOCUMENT DESIGNER
                 │
                 ▼
              PDF
```

This is where Lancee starts becoming substantially more than a project-management app with an AI chat window.

---

# 51. Automation + AI

Agents and automations should be able to call the same capability framework.

For example:

```text
EVENT
client.created
     ↓
AUTOMATION
     ↓
research_company
     ↓
AI JOB
     ↓
web.search
web.extract
browser.screenshot
     ↓
save research to client
```

The AI doesn't need to be interactive.

---

# 52. Skills Layer

Above raw tools, Lancee should eventually introduce **Skills**.

Tools are atomic capabilities.

Skills describe how capabilities are used effectively for a domain.

Example:

```text
Skill:
company-research

Knows how to use:

web.search
web.access
web.extract
browser.screenshot
visual.extract_palette
content.combine
```

Another:

```text
Skill:
proposal-builder

Uses:

client.get_context
project.search
file.search
content.combine
document.design
pdf.create
```

This gives you:

```text
TOOLS
   ↓
SKILLS
   ↓
AGENTS
   ↓
GOALS
```

rather than encoding everything into system prompts.

---

# 53. Agent Profiles

Lancee could eventually provide specialized agent profiles.

```text
General Assistant

Project Assistant

Finance Assistant

Research Assistant

Creative Assistant

Operations Assistant
```

But these should mostly represent **different policies + skills + tool scopes**, not completely separate AI systems.

For example:

```text
Research Agent

Allowed:
web.*
browser.read*
visual.*
content.*
document.*

Not allowed:
payment.*
workspace.admin.*
```

---

# 54. Global vs Lancee Capabilities

A simple rule should govern architecture:

### Lancee owns it?

Put the business capability behind:

```text
lancee-mcp
```

Examples:

```text
client.get
project.create
invoice.send
approval.request
```

### General computer capability?

Use specialized Lancee modules or workers:

```text
Playwright-backed browser worker
Web/search adapter
Governed file service
Document worker
GitHub integration adapter
```

### External SaaS?

Use an application-owned integration adapter:

```text
Lancee tool → integration adapter → provider API
```

Credentials remain in the Lancee vault and provider failures use the shared
tool-result and audit contracts. External SaaS systems are never added as MCP
servers.

---

# 55. Suggested Repository Architecture

I'd ultimately structure Lancee approximately like:

```text
lancee/
│
├── apps/
│   │
│   ├── web/
│   │
│   └── api/
│
├── services/
│   │
│   ├── mcp/
│   │   ├── protocol/
│   │   ├── tools/
│   │   └── policies/
│   │
│   ├── agent-runtime/
│   │   ├── planner/
│   │   ├── executor/
│   │   ├── context/
│   │   ├── approvals/
│   │   └── budgets/
│   │
│   ├── capabilities/
│   │   ├── web/
│   │   ├── browser/
│   │   ├── files/
│   │   ├── documents/
│   │   ├── visual/
│   │   └── integrations/
│   │
│   └── workers/
│       ├── automation/
│       ├── document/
│       ├── integration/
│       ├── communication/
│       ├── media/
│       ├── index/
│       └── ai/
│
├── packages/
│   │
│   ├── auth/
│   ├── database/
│   ├── events/
│   ├── queue/
│   ├── artifacts/
│   ├── tool-contracts/
│   ├── permissions/
│   └── observability/
│
└── docs/
    └── agentic-runtime/
```

Don't interpret this as "create 30 microservices immediately."

Keep logical boundaries first.

Split deployment units when justified.

---

# 56. Initial Deployment

For V1, keep deployment much simpler:

```text
Lancee application
  ├── web
  ├── API
  ├── AI runtime
  └── /mcp

lancee-worker

postgres

redis
```

There is no separately deployed MCP server in V1. `lancee-mcp` is a logical
module and route within the Lancee application deployment.

Where `lancee-worker` initially hosts:

```text
automation
documents
integrations
AI jobs
events
indexing
```

Later:

```text
lancee-worker
      ↓ scale requires separation
      │
      ├── document-worker
      ├── automation-worker
      └── integration-worker
```

Don't prematurely microservice the platform.

---

# 57. V1 Tool Set

I'd target approximately **30–50 excellent tools**, rather than hundreds of mediocre tools.

Initial Lancee-native set:

```text
workspace.get_context
workspace.search

client.search
client.get
client.get_context
client.create
client.update

project.search
project.get
project.get_context
project.create
project.update

task.search
task.create
task.update
task.complete

invoice.search
invoice.get
invoice.create
invoice.send

approval.list
approval.get
approval.request

file.search
file.get

communication.search
communication.draft
communication.send

automation.list
automation.run

artifact.get
artifact.register

job.get
```

Global capabilities:

```text
web.search
web.access
web.extract

browser.navigate
browser.snapshot
browser.screenshot

visual.analyze
visual.extract_palette

content.combine
content.summarize
content.structure

file.read
file.write

document.design
document.render

pdf.create
```

That's already an extremely capable agent.

---

# 58. Phase 2

Add:

```text
web.crawl

browser.click
browser.type
browser.download

document.merge

media.inspect
media.transform

calendar.*

advanced integration tools

workspace intelligence

agent delegation
```

Browser **write/interact** tools should arrive after browser read/screenshot capabilities because they introduce substantially greater risk.

---

# 59. Phase 3 — Dynamic Capability Ecosystem

Eventually Lancee can support:

```text
                    LANCEE
                       │
              TOOL REGISTRY
                       │
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
   Platform         Official         Approved custom
    tools          integrations      Lancee modules
```

A workspace could enable:

```text
✓ Lancee
✓ Google Workspace
✓ Adobe
✓ GitHub
✓ Playwright
✓ Custom company adapter
```

The runtime discovers them from Lancee's governed registry. Every entry has a
local owner, schema, risk policy, authorization rule, and execution adapter.

The agent does not care where implementation logic lives.

It sees capabilities.

Federating arbitrary third-party MCP servers is explicitly outside this
architecture. A third-party capability must be wrapped as an approved Lancee
integration module before it can enter the registry.

---

# 60. The End-State

The real architecture isn't:

```text
Lancee
+
AI chatbot
```

It's:

```text
                         USER INTENT
                              │
                              ▼
                      LANCEE INTELLIGENCE
                              │
                     Understand / Plan
                              │
                              ▼
                     CAPABILITY ROUTER
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
       ▼                      ▼                      ▼
 LANCEE CAPABILITIES     GLOBAL CAPABILITIES    INTEGRATIONS
       │                      │                      │
 Clients                  Web/Search                Google
 Projects                 Browser                   Microsoft
 Tasks                    Files                     Adobe
 Finance                  Documents                 GitHub
 Approvals                Visual                    etc.
       │                      │                      │
       └──────────────────────┼──────────────────────┘
                              ▼
                         EXECUTION
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
                   API      Workers   Adapters
                    │
                    ▼
                 EVENTS
                    │
                    ▼
                 ARTIFACTS
                    │
                    ▼
                  RESULT
```

And the principle I would put at the very top of the implementation documentation is:

> **Lancee AI does not own the user's work. It understands the user's goal and orchestrates trusted capabilities that perform the work.**

That distinction keeps the platform maintainable, auditable and secure while still allowing something as simple as:

> **"Research this company and show me what their brand looks like."**

to dynamically become:

```text
web.search
    ↓
web.access
    ↓
web.extract
    ↓
browser.navigate
    ↓
browser.screenshot
    ↓
visual.extract_palette
    ↓
content.combine
```

while:

> **"Now make me a beautiful client-ready PDF from that."**

continues the same run:

```text
existing artifacts
      ↓
content.structure
      ↓
document.design
      ↓
document.render
      ↓
pdf.create
      ↓
artifact.register
```

without the user needing to know that **MCP, Playwright, workers, queues, APIs, artifact storage, tool registries or multiple models even exist.**
