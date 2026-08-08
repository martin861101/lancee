# Automation Inventory

This inventory summarizes the automation capabilities documented in the `automations/` directory. The documentation names **Lead Generator** as the first purpose-built workflow; the other entries are platform automation capabilities and workflow interfaces.

## Documented automation capabilities

### 1. Repeatable operational actions

- Run repeatable remote commands from **Actions** with streamed output.
- Use database tools from the Actions workspace.
- Run browser automation from the backend agent.
- Test configured SSH connections before operating on a server.
- Monitor host metrics, Docker containers, and PM2 processes.
- Start, stop, and restart Docker containers or PM2 workloads where supported.
- Browse remote files and automate uploads, downloads, directory creation, and removal.

Sources: [User Guide](automations/USER_GUIDE.md), [Architecture](automations/ARCHITECTURE.md).

### 2. Document-generation workflows

- Read local files.
- Crawl or extract web content.
- Compile collected results.
- Export generated documents.

Source: [User Guide](automations/USER_GUIDE.md).

### 3. Research and browser-extraction workflows

- Research public web content through browser and extraction workflows.
- Use Chromium/Playwright when browser rendering is required.
- Run the research agent from Docker with the supplied Chromium environment, or configure a compatible Chromium executable outside Docker.

Sources: [Architecture](automations/ARCHITECTURE.md), [Configuration and Storage](automations/CONFIGURATION_AND_STORAGE.md), [Troubleshooting](automations/TROUBLESHOOTING.md).

### 4. Orchestration pipelines

- Build pipelines with conditional steps.
- Retry failed steps.
- Run agent steps in parallel.
- Cache step results with expiration.
- Stream workflow run logs.
- Persist pipeline definitions and run metadata.

Sources: [User Guide](automations/USER_GUIDE.md), [Architecture](automations/ARCHITECTURE.md).

### 5. AI-agent and swarm workflows

- Execute tasks through the AI Assistant.
- Configure agents, tools, skills, memory, and embeddings.
- Use agent-swarm interfaces from the Services workspace.
- Stream AI responses and workflow logs.

Sources: [User Guide](automations/USER_GUIDE.md), [Architecture](automations/ARCHITECTURE.md).

### 6. Lead Generator workflow

The Lead Generator is the most detailed automation documented in the directory.

#### Lead discovery and enrichment

- Accept an industry and either a local location or global scope.
- Discover official business websites with one SerpApi request.
- Crawl each result and relevant same-site pages with Crawlee HTTP/Cheerio.
- Fall back lazily to Playwright when the initial HTML requires JavaScript rendering.
- Extract public JSON-LD, email addresses, phone numbers, staff size, and senior-member text.
- Store leads, crawl evidence, crawl method, and run status in PostgreSQL.

#### Outreach preparation

- Store a separate subject and body template for each normalized industry.
- Render lead fields into template placeholders.
- Optionally personalize drafts with a configured AI agent.
- Allow manual editing and require explicit human approval.
- Invalidate approval after any later UI edit.

#### Outreach sending and response handling

- Send only explicitly approved drafts through the connected Email/SMTP service.
- Enforce global hourly and daily limits under a PostgreSQL advisory lock.
- Block suppressed, bounced, opted-out, and manually blocked addresses.
- Mark a lead as contacted only when SMTP accepts the recipient.
- Accept authenticated reply, bounce, and opt-out events.
- Add bounce and opt-out addresses to the durable suppression list automatically.
- Record drafts, approvals, sends, failures, suppressions, bounces, and opt-outs as audit events.

#### Lead Generator safeguards

- Inspect only public business pages.
- Reject private, loopback, and local-network crawl targets.
- Honor `robots.txt`, limit same-domain concurrency, delay requests, and cap pages per business.
- Reuse successful recent crawls from PostgreSQL.
- Do not use CAPTCHA solving, residential proxy rotation, or access-control bypasses.
- Review results before outreach and handle consent, opt-outs, rate limits, and applicable privacy rules.
- BaseBox does not poll IMAP directly; mailbox webhooks or adapters must submit response events.

Source: [Lead Generator Workflow](automations/LEAD_GENERATOR_WORKFLOW.md).

### 7. MCP-connected service workflows

The MCP workspace supports connected-service automation through:

- Google Drive
- Email/SMTP
- Slack
- GitHub
- Notion
- PostgreSQL
- Custom HTTP MCP servers

Connection automation includes encrypted credential storage, connection testing, health messages, enable/pause controls, external endpoint access, and named revocable access keys.

Sources: [User Guide](automations/USER_GUIDE.md), [Deployment and Security](automations/DEPLOYMENT_AND_SECURITY.md).

### 8. Hermes gateway operations

The optional Hermes workspace proxies gateway operations for models, chat, skills, memory, sessions, state, health, logs, configuration reload, and provider-key rotation. Failover tooling also supports dry-run and status modes before switching keys.

Sources: [User Guide](automations/USER_GUIDE.md), [Troubleshooting](automations/TROUBLESHOOTING.md).

## Documents reviewed

- `automations/README.md`
- `automations/GETTING_STARTED.md`
- `automations/USER_GUIDE.md`
- `automations/ARCHITECTURE.md`
- `automations/CONFIGURATION_AND_STORAGE.md`
- `automations/LEAD_GENERATOR_WORKFLOW.md`
- `automations/DEPLOYMENT_AND_SECURITY.md`
- `automations/DEVELOPMENT.md`
- `automations/TROUBLESHOOTING.md`

