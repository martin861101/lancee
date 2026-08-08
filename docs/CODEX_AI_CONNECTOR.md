# Agent device connector

Lancee provides a device-code authorization flow for external agent clients.
The former repo-local stdio MCP plugin has been removed; clients connect
directly to Lancee's application APIs and its single `/mcp` endpoint.

## Scopes

- `ai:invoke` allows calls to the workspace-configured AI provider.
- `mcp:invoke` allows calls to `POST /mcp` and the local Lancee tool registry.

The approval screen displays every requested scope. A token without
`mcp:invoke` cannot initialize or call Lancee MCP.

## Device flow

1. Request a code:

   ```http
   POST /api/codex/device/code
   Content-Type: application/json

   {"client_id":"lancee-codex-plugin","scope":"mcp:invoke"}
   ```

2. Show `verification_uri_complete` and `user_code` to the user.
3. The signed-in user verifies the matching code, scopes, workspace, and client,
   then approves or denies it.
4. Poll `/api/codex/device/token` with the device-code grant.
5. Store the returned `lnc_codex_...` token in the client's protected
   credential store.

Device codes expire after ten minutes and can be exchanged once. Access tokens
expire after thirty days. Lancee stores only SHA-256 hashes of device codes,
user codes, and access tokens.

## MCP use

```http
POST /mcp
Authorization: Bearer lnc_codex_...
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

The token selects the user and workspace. MCP arguments cannot override that
context. Revoking the device connection invalidates all active tokens for the
workspace user.

## AI use

Tokens with `ai:invoke` can call the existing `/api/codex/ai/*` routes. Provider
credentials remain encrypted/server-side and are never returned to the client.

## Verification

```bash
pnpm verify:codex-connector
```

The verifier covers device approval, one-time exchange, scoped AI access,
direct HTTP MCP initialization and calls, token revocation, and hashed token
storage.
