# Configuration and Storage

## Frontend Environment

| Variable | Default behavior | Purpose |
| --- | --- | --- |
| `VITE_AGENT_URL` | Same host on port `8787`, or `http://localhost:8787` | Build-time backend agent URL |

The URL saved from Settings overrides `VITE_AGENT_URL`.

## Backend Environment

The agent loads `agent/.env` before importing the application. Existing process environment values take precedence.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | Agent HTTP port |
| `DATA_DIR` | `agent/data` | SQLite, encryption keys, and runtime state |
| `DASHBOARD_PASSWORD` | Required | Dashboard login password |
| `JWT_SECRET` | Generated and persisted when absent | Dashboard JWT signing key |
| `OLLAMA_URL` | Route-specific fallback | Ollama API base URL |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Model used for embeddings |
| `HERMES_API_URL` | Empty unless configured | Hermes/OpenAI-compatible gateway URL |
| `HERMES_API_KEY` | Empty | Hermes gateway bearer key |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | Runtime default | System Chromium used by Playwright workflows |

`JWT_SECRET` values equal to the development placeholder are ignored. If a valid secret is not configured, the agent creates `DATA_DIR/jwt.key` with restricted permissions.

## Browser Storage

Important keys include:

| Key | Purpose |
| --- | --- |
| `homelab.agentUrl` | Active backend URL |
| `homelab.token` | Dashboard JWT |
| `homelab.ai.providers` | Provider configurations |
| `homelab.ai.modelSettings` | Model options |
| `homelab.ai.tools` | Tool enablement |
| `homelab.ai.skills` | Skill enablement |
| `homelab.ai.memory` | Memory settings |
| `homelab.ai.embedding` | Embedding configuration |
| `homelab.ai.agents` | Agent definitions |
| `homelab.tavily.key` | Tavily search key when configured |

The authenticated layout merges backend AI settings into browser storage after login.

## Backend Data

The default `agent/data` directory contains:

- `agent.db`: SQLite operational state
- `secret.key`: AES-256-GCM key for encrypted credentials
- `jwt.key`: generated JWT key when `JWT_SECRET` is absent
- `ai-settings.json`: synchronized AI settings
- `chroma-state.json`: local vector-memory state
- Hermes configuration and failover state
- WhatsApp session and configuration state

## Credential Handling

SSH and MCP provider credentials are encrypted before insertion into SQLite. API responses replace stored secret values with `********`. Sending that placeholder in an update preserves the existing secret.

MCP access keys use a different model: BaseBox returns the complete token once, stores only its SHA-256 hash, and later displays only a prefix.

## Backup and Restore

Stop or quiesce the agent before taking a consistent backup. Back up the entire data directory rather than selected files:

```bash
tar -czf basebox-data-backup.tar.gz -C agent data
```

Restore `agent.db` and `secret.key` together. Encrypted records cannot be recovered without the matching encryption key.

For Docker, back up the host directory mounted at `/data`.

## Secret Files

Do not commit:

- `.env` or `.env.api`
- `agent/data`
- private SSH keys
- MCP access tokens
- AI provider keys
- WhatsApp session files

Use filesystem permissions, container secrets, or a secret manager in production.
