# User Guide

## Dashboard and Navigation

The sidebar contains the primary workspaces. Use `Ctrl+K` or `Command+K` to open the command palette for navigation and common server commands.

## SSH Servers

Open **Settings** to add a server with a name, host, port, username, and either password or private-key authentication. Saved credentials are encrypted by the backend.

Run **Test** after saving. A successful result confirms the agent can establish the SSH session.

## Monitoring

Monitoring displays host metrics plus Docker and PM2 workloads. Container and PM2 actions support `start`, `stop`, and `restart` where available.

Use monitoring before executing changes to confirm the target server and current system state.

## Actions and Terminal

- Use **Actions** for repeatable commands, streamed output, database tools, and browser automation.
- Use **Terminal** for an interactive SSH shell.
- Use **Files** for structured remote browsing, upload, download, directory creation, and removal.

Commands and file operations run from the backend agent, not directly from the browser.

## AI Assistant

Open **AI Settings** before using the assistant:

1. Enable an AI provider.
2. Enter its API URL and credential where required.
3. Select a model.
4. Configure agents, tools, and skills.
5. Configure memory and embeddings if recall is required.
6. Save settings so they synchronize with the backend.

Grant agents only the tools needed for their job. Shell, file-write, database, and browser tools can alter systems or data.

## Services and Automation

The Services workspace includes document generation, research, automation, orchestration, and
agent-swarm interfaces. Available workflows can read local files, crawl or extract web content,
compile results, and export documents. The Lead Generator also supports separate outreach templates
per industry, AI-assisted drafts, human approval, SMTP sending, and do-not-contact controls. See
[Lead Generator Workflow](./LEAD_GENERATOR_WORKFLOW.md).

Orchestration pipelines support conditions, retries, parallel agent steps, cached results, and streamed run logs.

## Hermes

The Hermes workspace proxies configured gateway functions including models, chat, skills, memory, sessions, state, health, logs, configuration reload, and provider-key rotation.

Hermes is optional. Configure `HERMES_API_URL` and `HERMES_API_KEY` before using it.

## MCP Connections

The MCP workspace provides:

- provider configuration cards
- expandable setup instructions
- encrypted credential storage
- connection testing and health messages
- enable and pause controls
- external MCP endpoint information
- named, revocable access keys

Supported connection definitions include Google Drive, email/SMTP, Slack, GitHub, Notion, PostgreSQL, and custom HTTP MCP servers.

External clients connect to `https://<agent-host>/mcp` with a dedicated MCP bearer key. See [MCP Server](./MCP_SERVER.md).

## Operational Safety

- Verify the active server before running commands.
- Prefer scoped provider credentials and read-only database users.
- Keep MCP and dashboard tokens out of source control.
- Confirm file paths before deletion.
- Back up `agent/data` before migrations or major configuration changes.
- Revoke credentials and MCP keys that are no longer used.
