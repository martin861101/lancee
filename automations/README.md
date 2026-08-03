# BaseBox Documentation

This directory is the canonical documentation set for BaseBox. It describes the current React/TanStack frontend, Express backend agent, operational features, and MCP server.

## Start Here

| Document                                                    | Purpose                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| [Getting Started](./GETTING_STARTED.md)                     | Install, configure, and run BaseBox locally or with Docker           |
| [User Guide](./USER_GUIDE.md)                               | Use the dashboard, remote servers, AI workflows, and MCP connections |
| [Architecture](./ARCHITECTURE.md)                           | Understand the frontend, backend, protocols, and data flow           |
| [Configuration and Storage](./CONFIGURATION_AND_STORAGE.md) | Environment variables, browser state, SQLite, and backups            |
| [API Reference](./API_REFERENCE.md)                         | Current backend HTTP and WebSocket route inventory                   |
| [MCP Server](./MCP_SERVER.md)                               | Configure connectors and integrate external MCP applications         |
| [Lead Generator Workflow](./LEAD_GENERATOR_WORKFLOW.md)     | Configure and operate lead discovery and enrichment                  |
| [Deployment and Security](./DEPLOYMENT_AND_SECURITY.md)     | Deploy safely behind HTTPS and protect credentials                   |
| [Development](./DEVELOPMENT.md)                             | Repository structure, commands, conventions, and verification        |
| [Troubleshooting](./TROUBLESHOOTING.md)                     | Diagnose frontend, agent, SSH, AI, and MCP failures                  |
| [Changelogs](./CHANGELOGS/)                                 | Dated records of implemented changes                                 |

## Current Application

BaseBox consists of two applications:

- The frontend in `src/`, built with React 19, TanStack Start, TanStack Router, Vite, Tailwind CSS, and Radix UI.
- The agent in `agent/`, built with Node.js, Express, SQLite, SSH2, WebSocket, and Playwright/Crawlee.

The frontend normally runs on port `8080`. The backend agent normally runs on port `8787` and owns credentials, SSH connections, file operations, AI proxying, workflow state, and MCP integrations.

## Documentation Status

These documents reflect the repository as of **2026-07-29**. Older root documents such as `BASEBOX.md`, `Overview.md`, and `agent/INTEGRATION.md` are retained for history but are not authoritative when they conflict with this directory.
