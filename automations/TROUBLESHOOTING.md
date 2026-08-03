# Troubleshooting

## Frontend Cannot Reach the Agent

Symptoms include timeouts, `Cannot reach agent`, or failed login requests.

1. Open `http://<agent-host>:8787/health`.
2. Confirm the agent process is running.
3. Check the agent URL in Settings.
4. Check firewall and reverse-proxy routing.
5. If the frontend uses HTTPS, ensure the agent also uses HTTPS.
6. Check browser developer tools for CORS or mixed-content errors.

Frontend requests time out after 15 seconds.

## Agent Refuses to Start

The agent requires a non-empty `DASHBOARD_PASSWORD` that is not `changeme`. Check `agent/.env` and the process environment.

If the port is occupied, change `PORT` or stop the conflicting process.

## Login Returns Unauthorized

- Confirm the password matches `DASHBOARD_PASSWORD` used by the running process.
- Restart the agent after changing its environment.
- Clear `homelab.token` or sign out and back in if a JWT secret changed.
- Preserve `jwt.key` across restarts when `JWT_SECRET` is not explicitly configured.

## SSH Connection Fails

- Verify host, port, username, and authentication type.
- Confirm the agent host can route to the SSH server.
- Confirm the server accepts password or key authentication as configured.
- Check private-key formatting and passphrase.
- Test with an SSH client from the same machine or container running the agent.

## Terminal Does Not Connect

- Confirm the SSH server test succeeds first.
- Ensure the reverse proxy supports WebSocket upgrades for `/ws/terminal`.
- Use `wss://` when the dashboard and agent use HTTPS.
- Sign in again if the dashboard JWT expired or was invalidated.

## Commands or Files Fail

- Verify the selected server ID.
- Check remote filesystem permissions.
- Confirm required commands such as Docker or PM2 exist on the remote host.
- Check upload size and available disk space.
- Review agent logs for SSH or SFTP errors.

## AI Models Are Missing

- Confirm the provider is enabled and its base URL is reachable.
- Check the provider key and model name.
- For Ollama, verify `OLLAMA_URL` and run `ollama list` on the Ollama host.
- When using multiple Ollama URLs, confirm every URL is reachable from the agent.

## Memory or Embeddings Fail

- Confirm the configured embedding model exists.
- Verify Ollama or the configured embedding provider is reachable.
- Check write permissions for `DATA_DIR`.
- Inspect `chroma-state.json` and agent logs for persistence errors.

## Browser Research Fails

- In Docker, confirm Chromium exists at the configured executable path.
- Outside Docker, install a compatible Chromium build.
- Confirm the target site is reachable and does not block automation.
- Reduce crawl scope when jobs time out or consume excessive memory.

## Hermes Fails

- Confirm `HERMES_API_URL` and `HERMES_API_KEY`.
- Check `/api/hermes/health` through an authenticated request.
- Verify remote SSH configuration before using key rotation.
- Use failover dry-run or status modes before switching keys.

## MCP Client Fails

- Open `https://<agent-host>/mcp` to verify the public route.
- Use a dedicated `bb_mcp_...` token, not the dashboard JWT.
- Include `Authorization: Bearer <token>`.
- Recreate the key if it was revoked or lost.
- Confirm the client supports remote Streamable HTTP MCP servers.
- Check the MCP page for connection enabled state and last health message.
- If a Custom MCP test reports `Not Acceptable`, rebuild the backend agent. Current builds use the official Streamable HTTP client transport and advertise both `application/json` and `text/event-stream`.

## MCP Access-Key Registration Returns `404`

The frontend and backend deployments are out of sync. Rebuild and restart the agent so it includes the MCP routes and database schema:

```bash
cd agent
docker compose up -d --build
```

After restart, confirm authenticated requests to `/api/mcp/catalog` and `/api/mcp/access-keys` succeed. Rebuilding only the frontend does not update the backend agent.

## Data Cannot Be Decrypted After Restore

The restored `agent.db` must use the matching `secret.key`. Restore the entire data directory from the same backup set.

## Build Fails

```bash
npm install
npm run lint
npm run build
```

If generated routing types are stale, run the build to regenerate them. Do not edit `src/routeTree.gen.ts` manually.
