# Embedded Codex App Server

lancee can run OpenAI Codex inside the authenticated web application. This is
separate from the [`lancee-ai` connector](CODEX_AI_CONNECTOR.md), which lets an
external Codex client call lancee's configured AI provider.

The embedded integration uses the official
[Codex App Server](https://developers.openai.com/codex/app-server) JSON-RPC
protocol over private standard input/output. The App Server is never exposed as
a public WebSocket service.

## Architecture

```text
React Connections UI
        |
authenticated HTTP + SSE
        |
lancee Express backend
        |
private JSONL stdio
        |
codex app-server
        |
OpenAI device login and Codex model service
```

`server/codex-app-server.mjs` owns child-process startup, the required
`initialize` / `initialized` handshake, request correlation, event buffering,
and process shutdown. The backend creates one App Server process per lancee
workspace/user pair.

Each process receives an isolated home at:

```text
.runtime/codex/<sha256(workspace:user)>/
```

OpenAI credentials and Codex thread history remain in that server-only
directory. They are not stored in the lancee database or sent to the browser.

## Install and configure

Local development requires a compatible Codex CLI:

```bash
npm install --global @openai/codex@0.145.0
codex --version
```

Configure the server:

```dotenv
CODEX_BINARY=codex
CODEX_WORKSPACE_ROOT=/absolute/path/to/the/project
```

`CODEX_WORKSPACE_ROOT` is a fixed server setting. The browser cannot submit an
arbitrary working directory. For local development, omitting it defaults to the
lancee repository.

Then start lancee normally:

```bash
pnpm build
pnpm start
```

## Connect in the UI

1. Sign in to lancee.
2. Open **Connections**.
3. Open **Codex Workspace**.
4. Select **Sign in**.
5. Open the displayed OpenAI URL and enter the device code.
6. Return to lancee. The panel checks the App Server account state every two
   seconds.
7. Select **Start session**, enter a coding task, and select **Run task**.

The panel streams agent-message deltas and activity through Server-Sent Events.
Use **Stop** to interrupt the active turn. **Sign out** calls App Server logout
and clears the OpenAI account from that user's isolated Codex home.

## Docker deployment

The production image installs the pinned Codex CLI. Compose mounts the host
workspace at `/workspace`:

```dotenv
CODEX_WORKSPACE_PATH=/srv/repos/customer-project
CODEX_WORKSPACE_ROOT=/workspace
```

Start the deployment:

```bash
POSTGRES_PASSWORD='replace-with-a-long-secret' docker compose up -d --build
```

The existing `.runtime:/app/.runtime` mount persists per-user Codex auth and
thread state across container restarts. Back up and protect this directory as
credential-bearing application state.

## API surface

All routes require a valid lancee session. Mutations also pass the application's
origin checks.

| Method and path | Purpose |
| --- | --- |
| `GET /api/codex/runtime/status` | Read CLI availability and OpenAI account state. |
| `POST /api/codex/runtime/auth/device` | Start native OpenAI device-code login. |
| `POST /api/codex/runtime/auth/logout` | Remove the current App Server account. |
| `POST /api/codex/runtime/threads` | Create a sandboxed Codex thread. |
| `POST /api/codex/runtime/threads/:threadId/turns` | Start a text turn. |
| `POST /api/codex/runtime/threads/:threadId/turns/:turnId/interrupt` | Interrupt a turn. |
| `GET /api/codex/runtime/events?threadId=...` | Stream buffered and live thread events over SSE. |

## Security boundary

Every web-created thread and turn uses:

- `approvalPolicy: "never"`;
- workspace-write sandboxing;
- a single server-configured writable root;
- restricted read access rooted at that workspace;
- tool network access disabled.

Unsupported App Server requests are rejected or declined by the backend. The UI
does not auto-approve command escalation, extra filesystem access, MCP
elicitation, or network permissions.

The Codex model service still needs outbound HTTPS from the container for login
and inference. `networkAccess: false` applies to tools run by the Codex turn, not
to App Server's own OpenAI API traffic.

Do not expose App Server's experimental WebSocket transport to users. Keep the
stdio child behind the authenticated lancee backend.

## Current scope

The first release supports one active UI thread per open panel, text prompts,
streamed agent text/activity, interruption, and logout. App Server persists
thread history, but the UI does not yet list or resume previous threads and
does not provide interactive approval prompts. Those capabilities can be added
without changing the authentication or process boundary.

## Verification

Run:

```bash
pnpm build
pnpm lint
pnpm verify:codex-runtime
```

The verifier uses an in-memory JSONL App Server transport. It checks
initialization, unauthenticated state, native device login, connected account
state, safe thread defaults, turn event streaming, interruption, and logout
without using a real OpenAI account.

A local CLI smoke test was also performed against `codex-cli 0.145.0` using an
isolated `CODEX_HOME`; App Server initialized and returned its unauthenticated
account state successfully.
