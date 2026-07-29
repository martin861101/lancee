# Codex AI Connector

This document covers the outbound **lancee AI for Codex** plugin: Codex calls
lancee's configured AI provider. To run Codex inside the lancee web platform,
use the separate [Embedded Codex App Server](CODEX_APP_SERVER.md) integration.

lancee includes a repo-local Codex plugin at
[`plugins/lancee-ai`](../plugins/lancee-ai). It exposes the AI provider already
configured for a lancee workspace without copying `AI_API_KEY` into Codex.

The plugin uses a bundled stdio MCP server rather than an `.app.json` connector
reference. An `.app.json` file requires a connector ID registered by the Codex
or ChatGPT platform; the bundled server can be developed, tested, and
distributed with this repository.

## Capabilities

The `lancee-ai` MCP server exposes:

| Tool | Purpose |
| --- | --- |
| `connect` | Start or finish device-code authorization. |
| `ai_status` | Read provider, model, workspace, and token-expiry status. |
| `complete` | Send one text prompt through the workspace AI provider. |

`complete` records the generated conversation in the same durable
`ai_conversations` store used by the application.

## Authentication flow

The flow follows the OAuth 2.0 device authorization pattern:

1. `connect` calls `POST /api/codex/device/code`.
2. lancee returns a ten-minute device code, human-readable user code, and
   verification URL.
3. The user opens the URL, signs in to lancee, compares the code, and explicitly
   approves or denies the request.
4. A second `connect` call exchanges the device code once at
   `POST /api/codex/device/token`.
5. The plugin stores the resulting thirty-day `ai:invoke` bearer token in the
   Codex plugin data directory with mode `0600`.

The user can approve in either of two application surfaces:

- Open the verification URL returned by Codex for a focused approval screen.
- Open **Connections → Codex AI**, enter the code shown by Codex, review the
  scope and workspace, then approve.

The Connections panel also shows the number of active Codex devices, the latest
token expiry, any approved request waiting for exchange, and a
**Disconnect all devices** action.

The provider credential remains server-only. Device codes, human codes, and
connector access tokens are SHA-256 hashed before database storage. Approval
binds the grant to the signed-in user and workspace. A consumed code cannot be
exchanged again.

## Endpoints

| Method and path | Authentication | Purpose |
| --- | --- | --- |
| `GET /.well-known/oauth-authorization-server` | Public | Device-flow metadata. |
| `POST /api/codex/device/code` | Public, rate-limited | Issue a pending device request. |
| `GET /api/codex/device/authorization` | lancee session | Load the in-app approval view. |
| `POST /api/codex/device/authorization` | lancee session | Approve or deny the request. |
| `POST /api/codex/device/token` | Public, rate-limited | Poll and exchange once. |
| `GET /api/codex/connection` | lancee session | Read active UI connection status. |
| `POST /api/codex/connection/revoke` | lancee session | Revoke all workspace Codex tokens. |
| `GET /api/codex/ai/status` | `ai:invoke` token | Read AI configuration status. |
| `POST /api/codex/ai/complete` | `ai:invoke` token | Run an AI completion. |

OAuth errors use standard names including `authorization_pending`,
`access_denied`, `expired_token`, and `invalid_grant`.

## Plugin structure

```text
plugins/lancee-ai/
├── .codex-plugin/plugin.json
├── .mcp.json
├── scripts/mcp-server.mjs
└── skills/lancee-ai/SKILL.md
```

The MCP manifest launches:

```text
node ${PLUGIN_ROOT}/scripts/mcp-server.mjs
```

The bridge needs Node.js 18 or newer. It defaults to the production lancee
origin. Set `LANCEE_BASE_URL` in the MCP server environment to use another
deployment.

For a direct local MCP test, point the bridge at the full-stack server:

```bash
LANCEE_BASE_URL=http://127.0.0.1:5177 \
PLUGIN_DATA=/tmp/lancee-ai-plugin-data \
node plugins/lancee-ai/scripts/mcp-server.mjs
```

The process speaks newline-delimited MCP JSON-RPC on standard input/output.

## Codex packaging

The plugin is ready to place in a configured local or team marketplace. Its
manifest has been validated with the Codex `plugin-creator` validator. This
repository intentionally does not modify a personal Codex marketplace or
global Codex configuration.

When distributing it through a marketplace, keep the complete
`plugins/lancee-ai` directory together so `${PLUGIN_ROOT}` resolves the bundled
MCP script.

## Configuration

The lancee server must have an AI provider configured:

```dotenv
AI_PROVIDER=openai
AI_API_KEY=server-only-provider-key
AI_MODEL=your-model
```

Anthropic and Gemini remain supported through the existing AI provider adapter.
`PUBLIC_ORIGIN` must be the externally reachable HTTPS lancee origin because it
is embedded in verification URLs.

The optional plugin-side override is:

```dotenv
LANCEE_BASE_URL=https://your-lancee.example
```

Do not place `AI_API_KEY` in the plugin manifest, Codex config, or plugin data
directory.

## Verification

Run:

```bash
pnpm build
pnpm lint
pnpm verify:ai
pnpm verify:codex-connector
python3 /root/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py \
  plugins/lancee-ai
```

The connector verifier starts temporary local app and provider servers, then
checks:

- pending device exchange;
- explicit session-backed approval;
- one-time token exchange;
- scoped AI status and completion routes;
- Connections catalog state and token revocation;
- MCP initialization, discovery, connection, and completion;
- provider request forwarding;
- hashed token persistence.

The test binds temporary loopback ports. Environments that restrict local
listeners must grant that capability for the verification command.

## Operational notes

- Device issue and token polling share an IP-based rate limit.
- Human codes exclude ambiguous characters.
- Connector tokens expire after thirty days.
- Restarting lancee does not invalidate pending grants or issued tokens because
  both are durable.
- Removing the local plugin token file forces a new device authorization.
- Database-side revocation can be added to a workspace UI later; expiry is the
  current lifecycle boundary.
