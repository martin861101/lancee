Restore Native Hermes Experience in Lancee

You are working in the existing Lancee repository.

The repository has already been inspected. Do NOT perform a broad architecture investigation.

The objective is to restore Hermes as the primary conversational/personal agent while Lancee MCP supplies Lancee-specific business capabilities.

Architecture Rule

Hermes owns:

- natural conversation
- personality
- conversational context
- personal/user memory
- general reasoning
- web/research
- browser capabilities
- general file/document reasoning
- agent orchestration

Lancee owns:

- workspace authorization
- clients/projects/tasks
- invoices/payments
- workspace files/storage
- workspace activity
- Decision Intelligence
- business events/outcomes
- Lancee-specific mutations

Lancee MCP should ADD business capabilities to Hermes rather than recreate Hermes.

---

CONFIRMED CURRENT IMPLEMENTATION

Do not rediscover these facts unless needed to safely edit code.

Hermes Runtime

Primary file:

"server/agents/hermes-agent-provider.mjs"

The implementation already correctly uses:

- Hermes "/v1/runs"
- Hermes native session IDs
- "/api/sessions"
- persisted "agent_threads.external_thread_id"
- reconstructed conversation history
- SSE events
- approval handling
- artifact persistence

Do NOT replace this architecture.

Do NOT revert to the old Lancee planner.

Preserve tenant isolation.

---

TASK 1 — FIX PERSONAL MEMORY

Relevant file:

"server/memory-router.mjs"

Current problem:

The code defines a "Hermes" memory destination but actually stores preferences in Lancee PostgreSQL table:

"hermes_user_preferences"

"getHermesPreferences()" is not consumed by the Hermes agent runtime.

Therefore this is not functioning as real Hermes agent memory.

Current Hermes supports native memory/session recall capabilities.

Required change

Inspect the deployed/current Hermes API/tool configuration and determine the supported native mechanism for persistent personal memory.

Integrate stable USER preferences with Hermes's native memory rather than pretending the Lancee DB table itself is Hermes memory.

Examples:

- response preferences
- communication style
- preferred document style
- working conventions
- recurring personal preferences

Preserve the distinction:

SESSION MEMORY
= temporary active conversation

HERMES MEMORY
= the person

LANCEE MEMORY
= the business

Do NOT put business decisions/events/outcomes into Hermes personal memory.

Do NOT weaken workspace/user isolation.

If Lancee needs to retain the PostgreSQL preference table as a safe authoritative/fallback copy, that is acceptable, but Hermes must actually RECEIVE/USE the preferences.

Do not build another vector database.

---

TASK 2 — RESTORE HERMES PERSONALITY

Relevant file:

"server/agents/hermes-agent-provider.mjs"

Inspect:

"trustedInstructions(context)"

The current instructions are heavily focused on:

- authorization
- Decision Intelligence
- memory restrictions
- tool rules
- business evidence
- isolation

Keep the security rules, but reduce unnecessary behavioural micromanagement.

Hermes should remain conversational.

The prompt should establish Lancee context and security boundaries without replacing Hermes's native personality.

Do NOT create a huge new personality prompt.

The goal is:

Hermes remains Hermes.

Lancee tells Hermes where it is and what business tools are available.

Preserve:

- tenant security
- truthful mutation reporting
- Decision Intelligence evidence requirements
- no filesystem path leakage
- workspace authorization

But avoid making Hermes sound like a database/query router.

---

TASK 3 — STOP DUPLICATING GENERAL HERMES TOOLS

Relevant file:

"server/capabilities/index.mjs"

Current Lancee MCP exposes general capabilities including:

- web_search
- access_webpage
- extract_web_content
- crawl_website
- browser_read
- browser_snapshot
- browser_screenshot
- browser_pdf
- browser_research
- execute_python
- execute_javascript
- create_pdf
- create_document

Hermes itself has native/general toolsets for web, browser, terminal/files, memory, session search and agent orchestration.

Do NOT blindly delete tools.

First determine which Lancee tools are genuinely needed because they:

1. persist something into Lancee,
2. require Lancee authorization,
3. operate on Lancee workspace data,
4. produce a Lancee artifact/file,
5. provide functionality Hermes cannot provide natively.

Prefer Hermes native tools for general web/research/browser work.

Lancee MCP should focus on Lancee-specific capabilities.

IMPORTANT:

"create_document" may still be needed as the FINAL persistence/rendering operation because it saves the output into Lancee Files.

The distinction should become:

Hermes:
researches + plans + writes content

Lancee:
renders/persists the requested final workspace artifact

Do not break existing MCP consumers.

---

TASK 4 — FIX DOCUMENT INTELLIGENCE

Relevant files:

"server/capabilities/documents.mjs"

"server/browser-worker.mjs"

"server/pdf.mjs"

Confirmed current behaviour:

"document.create" receives already-written "content" and simply renders it.

There is no content planning/depth/quality stage.

Therefore short model output produces a short document.

Do NOT turn the renderer into an LLM.

Hermes should own document reasoning/content creation.

Ensure tool descriptions make this explicit.

Before invoking document creation Hermes should generate complete content appropriate to user intent.

Example:

"Create a short one-page summary"

should result in concise content.

"Create a comprehensive analysis covering history, performance, financial position, risks and recommendations"

should result in substantial structured content BEFORE "document.create" is called.

Improve the document tool description/schema guidance so Hermes understands:

- content must be complete
- content must reflect requested depth
- renderer does not expand content
- use structured Markdown/HTML
- headings/tables/lists should be included where useful

Do not impose arbitrary page counts globally.

---

TASK 5 — REMOVE THE ONE-TEMPLATE DOCUMENT PROBLEM

Relevant file:

"server/browser-worker.mjs"

Confirmed problem:

General PDFs are rendered through:

"professionalPdfHtml({ title, content })"

This hardcodes one "Lancee · Executive document" appearance.

This is why unrelated documents all look the same.

Refactor document rendering to support a SMALL set of layout intents rather than one universal template.

For example:

- professional
- report
- proposal
- brief
- minimal

Do NOT build a giant design system.

Do NOT add large dependencies.

Allow Hermes/document.create to select an appropriate supported style based on user intent.

Keep sensible defaults.

Preserve sanitization/security.

Do not change invoice rendering.

---

TASK 6 — IMPROVE PDF FALLBACK

Relevant file:

"server/pdf.mjs"

Current fallback is intentionally primitive:

- Helvetica
- fixed 9pt body
- simple wrapping
- minimal hierarchy

Do not spend large effort redesigning it.

It should remain a fallback.

Ensure the normal Playwright/HTML renderer is preferred and failures are observable.

Do not silently use the primitive fallback for normal healthy production document generation without logging/diagnostic visibility.

---

TASK 7 — PRESERVE DECISION INTELLIGENCE

Do NOT redesign Decision Intelligence.

Hermes should consume Lancee Decision Intelligence through Lancee MCP.

The desired experience is:

Lancee supplies evidence:

- user worked late
- deadline tomorrow
- tasks incomplete
- historical outcome patterns

Hermes naturally communicates:

"I noticed you were working pretty late on this last night..."

Do NOT hardcode sentences like this.

Facts come from Lancee.

Personality/language comes from Hermes.

---

TASK 8 — VERIFY NATIVE HERMES TOOLS

Check the actual Hermes deployment/configuration.

Verify that Hermes has its expected native toolsets enabled, especially:

- memory
- session_search
- web
- browser
- file/terminal where appropriate

Lancee MCP must be an additional MCP server.

Do NOT replace Hermes's native tool registry with Lancee MCP.

Current Hermes design expects MCP servers to contribute external tools alongside built-in tools.

---

DO NOT TOUCH

Do NOT:

- add Gemini
- add Google Workspace
- replace Hermes
- replace "/v1/runs"
- rewrite session mapping
- weaken workspace isolation
- rewrite Decision Intelligence
- rewrite Lancee MCP authentication
- redesign the UI
- perform broad refactoring

The current native Hermes run/session integration is valuable and should remain.

---

TESTS

Keep testing focused.

Conversation

Verify:

User: "How is ABC doing?"
Assistant responds.
User: "Why?"

Hermes understands the reference.

Personal preference

Store a harmless preference such as preferred document style.

Verify Hermes can use it later.

Native web

Ask Hermes to research a public topic.

Verify native Hermes web tooling is preferred rather than unnecessarily routing through Lancee's duplicate web stack.

Lancee data

Ask about a real workspace project.

Verify Lancee MCP is used.

Document depth

Generate:

1. short project brief
2. comprehensive project analysis

The comprehensive document must contain materially greater depth.

Document design

Generate two different document intents.

Verify they do not automatically receive the exact same visual template.

Do not repeatedly regenerate documents for aesthetic tuning.

---

FINAL REPORT

Return only:

Fixed

Short list.

Memory

How Hermes personal memory now works.

Native Hermes

Which native capabilities are active.

Lancee MCP

Which responsibilities remain with Lancee.

Documents

What changed in content generation/rendering.

Tests

Pass/fail.

Remaining

Only genuine unresolved issues.

Files Changed

Exact list.

Then STOP.
