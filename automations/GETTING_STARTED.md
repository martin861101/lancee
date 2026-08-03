# Getting Started

## Prerequisites

- Node.js 20 or newer
- npm
- A Linux, macOS, or container host for the backend agent
- Network access from the agent to any SSH servers, AI providers, or MCP providers you configure
- Chromium when running browser automation outside the supplied Docker image

## 1. Install the Frontend

From the repository root:

```bash
npm install
```

Create or update the root `.env` if you want to set the agent URL at build time:

```dotenv
VITE_AGENT_URL=http://localhost:8787
```

Start the frontend:

```bash
npm run dev
```

The Vite development server listens on port `8080`.

## 2. Install the Backend Agent

```bash
cd agent
npm install
cp .env.example .env
```

Set at least these values in `agent/.env`:

```dotenv
PORT=8787
DATA_DIR=./data
DASHBOARD_PASSWORD=replace-with-a-strong-password
JWT_SECRET=replace-with-a-long-random-secret
OLLAMA_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
```

Start the agent:

```bash
npm start
```

The agent refuses to start when `DASHBOARD_PASSWORD` is empty or set to `changeme`.

## 3. Connect the Dashboard

1. Open the frontend in a browser.
2. Sign in with `DASHBOARD_PASSWORD`.
3. Open **Settings**.
4. Confirm the agent URL, normally `http://localhost:8787` during local development.
5. Add an SSH server and run its connection test.

The browser stores the selected agent URL under `homelab.agentUrl` and the dashboard JWT under `homelab.token`.

## Docker Agent

The supplied Docker image includes Chromium and SSH tooling:

```bash
cd agent
cp .env.example .env
docker compose up -d --build
```

The Compose service publishes port `8787` and mounts `agent/data` at `/data`. Set `DASHBOARD_PASSWORD` in the environment used by Docker Compose.

## Initial Setup Checklist

- Configure a strong dashboard password.
- Keep `agent/data` on persistent storage.
- Add and test an SSH server from Settings.
- Configure AI providers from AI Settings if AI features are required.
- Configure Ollama and the embedding model if local memory is required.
- Configure MCP connections and create separate external access keys if remote MCP clients are required.
- Put the agent behind HTTPS before exposing it beyond a trusted local network.

## Build Verification

```bash
npm run lint
npm run build
```

The build produces client assets under `dist/client` and the TanStack Start server bundle under `dist/server`.
