# Deployment and Security

## Deployment Model

The frontend and agent deploy independently:

- Build the frontend with `npm run build`. It supports TanStack Start deployment and includes a Wrangler configuration for Cloudflare Workers.
- Run the agent with Node.js, Docker Compose, or a service manager on infrastructure that can reach managed SSH hosts and providers.

## HTTPS Requirement

When the frontend uses HTTPS, the browser blocks calls to an HTTP agent. Publish the agent over HTTPS using a reverse proxy, Cloudflare Tunnel, or an equivalent private-network gateway.

Proxy these transports correctly:

- HTTP APIs under `/api`
- external MCP at `/mcp`
- terminal WebSocket at `/ws/terminal`
- SSE responses without buffering

## Network Exposure

- Keep port `8787` private when a reverse proxy is used.
- Restrict the agent to trusted source networks when possible.
- Do not expose SSH hosts directly through the frontend.
- Apply outbound restrictions carefully: AI, research, provider tests, and custom MCP connections require outbound network access.

## Authentication

- Use a unique, strong `DASHBOARD_PASSWORD`.
- Set a long random `JWT_SECRET`, or preserve the generated `jwt.key`.
- Dashboard JWTs are valid for 30 days.
- Create a separate MCP access key for every external application.
- Revoke unused MCP keys promptly.

## Credential Protection

- SSH and provider secrets are encrypted at rest with AES-256-GCM.
- The encryption key is stored in `DATA_DIR/secret.key` with restricted permissions.
- MCP access tokens are stored only as SHA-256 hashes.
- API responses mask persisted credentials.
- HTTPS is still required because encryption at rest does not protect network traffic.

## Least Privilege

- Use dedicated SSH users instead of unrestricted root access where possible.
- Restrict private keys and server commands to required hosts.
- Use read-only PostgreSQL roles unless writes are necessary.
- Scope Google, Slack, GitHub, and Notion permissions to the minimum required access.
- Grant AI agents only the tools necessary for their workflows.

## Container Deployment

The agent Dockerfile includes Chromium, SSH clients, build tools, and CA certificates. The image exposes port `8787` and stores persistent state under `/data`.

Operational requirements:

- mount a persistent host directory or volume at `/data`
- supply secrets at runtime rather than baking them into the image
- rebuild after dependency or Dockerfile changes
- monitor disk usage for browser artifacts, sessions, and data files

## Backups

Back up the entire data directory. At minimum, preserve `agent.db`, `secret.key`, `jwt.key`, AI settings, memory state, and session data.

Test restoration periodically. Restoring the database without its matching `secret.key` makes encrypted credentials unusable.

## Production Checklist

- Strong dashboard password configured
- Stable JWT secret configured or generated key persisted
- Agent published only through HTTPS
- WebSocket upgrades enabled
- SSE proxy buffering disabled
- Direct agent port firewalled
- Persistent data volume mounted
- Automated backups configured
- Provider credentials scoped minimally
- External MCP clients each use a separate key
- Logs and disk usage monitored
- Dependencies and base image patched regularly
