# Threat Model

## Assets

- Public client credentials and service registration credentials.
- MCP tool inputs, results, and audit history.
- Registry integrity and worker routing metadata.
- Host resources reachable by privileged future workers.

## Trust boundaries

| Boundary | Main risks | Implemented controls |
| --- | --- | --- |
| Internet/client to Traefik | Unauthenticated calls, flooding, unsafe browser origins | ForwardAuth, rate limits, security headers, worker origin allowlist |
| TooS façade to worker | Confused-deputy calls, arbitrary upstream access, long-running work | Authenticated public route, catalog enabled-state checks, validated live lease URLs, bounded timeout |
| Worker to registry | Service spoofing, lease takeover | Service-scoped token, exact service-ID/hostname match, opaque lease ID |
| Registry to Redis | Lease tampering, data exposure | Internal-only network, no published Redis port |
| Traefik to Docker | Host control through socket | Read-only socket mount and explicit exposure; production socket proxy still required |
| Agent to tool | Prompt-driven destructive action | Only harmless example tools are included; tool scopes/approval required before privileged workers |

## Specific threats

- **SSRF through registration:** internal MCP and health URL schemes, hosts, and paths are strictly validated.
- **SSRF through the REST façade:** callers select service and tool names but
  cannot supply an upstream URL; the façade calls only validated live records.
- **Stale or spoofed heartbeat:** Redis updates compare the active opaque lease ID atomically.
- **Registry data leakage:** discovery responses omit internal URLs, health URLs, instance IDs, and lease IDs.
- **Secret leakage:** secrets are excluded from version control and are not stored in labels or registry records.
- **DNS rebinding/browser abuse:** MCP requests with an `Origin` header must match the worker allowlist.
- **Resource exhaustion:** services have CPU, memory, process, log-size, and gateway rate limits.
- **Replay:** static bearer tokens remain replayable; production OIDC with short-lived tokens is required.
- **Confused deputy/tool misuse:** per-tool scopes, user confirmation, sandboxing, and audit events remain mandatory before adding destructive services.

## Residual risks

The local auth adapter has no token expiry, issuer validation, audience validation, or fine-grained scopes. The Docker socket is still mounted into Traefik. Traffic is plain HTTP. These are accepted only for a private local deployment and are explicit production blockers.
