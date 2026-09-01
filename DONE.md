# Lancee domain migration notes

## Migration summary

Lancee's canonical product URL is now `https://lancee.work` throughout the active runtime defaults, production environment, examples, deployment documentation, public links, crawler identity, and SEO metadata. API examples use the current browser origin so localhost and future same-origin deployments continue to work.

The current architecture was preserved:

- React/TypeScript/Vite frontend and Express API are served by one process and one public origin on port `5177`.
- Nginx Proxy Manager terminates public TLS and forwards to the Compose application listener.
- PostgreSQL is the production database, Redis backs queues, and SQLite remains the local single-process fallback.
- Authentication remains the existing signed host-only `HttpOnly`, `SameSite=Lax`, production-`Secure` session cookie. Mutations enforce same-origin requests; no wildcard CORS was added.
- Signup confirmation and team-invitation links continue to derive from `PUBLIC_ORIGIN`. Password reset is not implemented in the current repository.
- Google Drive OAuth and Picker remain the native Google integration. There is no native Google Sign-In, Gmail, or Calendar OAuth flow in this repository.
- Microsoft and Dropbox appear through the OpenConnector/gateway or connection-request model, not separate native Lancee callback implementations.
- Paystack, n8n, mail, OpenConnector, Hermes, MCP, AI, and Connected Intelligence retain their existing architecture.
- No Supabase code or configuration was introduced or changed.

## Files changed

- `.env` — production `PUBLIC_ORIGIN`, Paystack return URL, and existing Google Drive callback URL definitions now use `lancee.work`.
- `.env.example` — production URL examples now use `lancee.work`.
- `server/index.mjs` — default public origin now uses the canonical domain. All generated signup, invitation, share/payment, n8n, MCP, and OAuth links continue to derive from this value.
- `vite.config.ts` — development/preview host allowlist now accepts `lancee.work`; Vite continues to allow normal localhost development.
- `src/App.tsx` and `src copy/App.tsx` — API examples now use `window.location.origin` instead of a hardcoded production hostname.
- `server/browser-worker.mjs` and `server/capabilities/web.mjs` — public crawler user-agent contact URL now uses `lancee.work`.
- `index.html` — canonical and OpenGraph URL metadata now identifies `https://lancee.work`.
- `README.md` and `public/lancee.html` — public, deployment, MCP, Google, n8n, and Paystack examples now use the new domain.
- `DONE.md` — this migration and go-live report.

## Environment changes

The effective production values now resolve to:

```dotenv
PUBLIC_ORIGIN=https://lancee.work
PAYSTACK_CALLBACK_URL=https://lancee.work/?payment=paystack
GOOGLE_DRIVE_REDIRECT_URI=https://lancee.work/api/integrations/google/callback
```

The current `.env` contains duplicated configuration sections; both `PUBLIC_ORIGIN` definitions were migrated. Node's effective Google callback is the last definition shown above. `.env.example` uses the also-supported `/oauth/callback` route. Keep one intended `GOOGLE_DRIVE_REDIRECT_URI` per deployed environment and register that exact value externally.

No new environment variable is required. Local full-stack development can continue with `APP_ENV=development PUBLIC_ORIGIN=http://localhost:5177`; relative browser API calls continue to work.

If `HERMES_MCP_URL` is explicitly configured on the Hermes side, update it to `https://lancee.work/mcp` while retaining its workspace-scoped credential.

## DNS changes

Live checks on 31 August 2026 found:

- `lancee.hookitupservices.com` resolves through Cloudflare and still returns the Lancee HTML for `GET /`.
- `lancee.work` does not currently resolve.
- `www.lancee.work` does not currently resolve.

The repository does not expose the current reverse-proxy origin IP/hostname, and the old public record is Cloudflare-proxied, so its origin cannot safely be inferred from the public Cloudflare address.

Configure:

| Host | Type | Destination | Purpose |
| --- | --- | --- | --- |
| `@` | `A`/`AAAA`, or provider-supported flattened `CNAME` | The existing Lancee reverse-proxy origin used behind the old Cloudflare record | Canonical Lancee application |
| `www` | `CNAME` | `lancee.work` | Alias that redirects to the canonical apex |

Do not use the observed Cloudflare anycast IP as the origin destination. Copy the actual origin target from the old hostname's DNS/proxy configuration or provide the server's real public IP/hostname.

Issue/attach a valid TLS certificate for `lancee.work` and, if enabled, `www.lancee.work`. Keep Cloudflare SSL mode end-to-end secure (normally Full/Strict) and retain HSTS only after certificate/proxy validation.

## Hosting changes

In Nginx Proxy Manager:

1. Add `lancee.work` as a proxy host forwarding HTTP to the existing Lancee application listener on port `5177`.
2. Attach the new certificate, force HTTPS, and preserve the existing security headers and WebSocket/proxy settings.
3. If `www` is enabled, redirect it permanently to `https://lancee.work`, preserving path and query string.
4. Rebuild/restart the Compose `app` service so the updated build and `.env` are loaded.
5. Keep the old hostname serving the application during validation and external callback migration.
6. After all integrations and clients use the new URLs, permanently redirect browser routes on the old hostname to the matching `https://lancee.work` path/query. Do not redirect `/api`, `/oauth`, `/openconnector`, or `/mcp` until their callers and provider callbacks have been migrated and verified.

## Google Cloud changes

For the current deployed `.env`, add this exact OAuth redirect URI:

```text
https://lancee.work/api/integrations/google/callback
```

The application also implements these callback aliases, but they only need registration if `GOOGLE_DRIVE_REDIRECT_URI` is deliberately configured to use one of them:

```text
https://lancee.work/oauth/callback
https://lancee.work/api/google-drive/oauth/callback
```

For Google Picker/browser restrictions, add:

```text
Authorized JavaScript origin: https://lancee.work
API key HTTP referrer: https://lancee.work/*
```

Keep the corresponding old production redirect URI and old origin temporarily during the cutover. Remove them only after reconnect and token-refresh testing succeeds on the new domain.

## Other external services

- Paystack browser return: `https://lancee.work/?payment=paystack`
- Paystack webhook: `https://lancee.work/api/webhooks/paystack`
- n8n inbound callback: `https://lancee.work/api/hooks/n8n/<workspace-id>`
- OpenConnector public base: `https://lancee.work/openconnector`
- OpenConnector OAuth callback exposed by Lancee: `https://lancee.work/openconnector/oauth/callback`
- Lancee MCP: `https://lancee.work/mcp`
- Hermes workspace profiles that call Lancee MCP: update their MCP URL to `https://lancee.work/mcp`
- API clients and generated examples: `https://lancee.work/api/v1/...`

SMTP has no domain callback. Signup-confirmation and invitation links automatically follow `PUBLIC_ORIGIN`. No separate native Microsoft or Dropbox callback was found; providers managed by OpenConnector must be updated in the relevant provider console if their registered callback includes the old OpenConnector origin.

## Old domain

Remaining `hookitupservices.com` references in active files are intentional Hookitup Solutions company/admin/email references: platform-admin identity, SMTP sender/reply/test accounts, and footer/company links. They are not Lancee product URLs and were preserved.

Remaining occurrences of `lancee.hookitupservices.com` are:

- `DONE.md` — intentional: this migration record identifies and classifies the legacy hostname.
- `tasks/DOMAIN_AUDIT.md` — intentional: the migration specification names the legacy domain.
- `graft/.cache/extract.0842226550a7cce8.json` — stale generated analysis cache; it is not runtime source or configuration and should be regenerated or purged by its owning tool.

No active source, environment, deployment example, public document, or runtime configuration depends on the old Lancee hostname.

## Validation results

- Production build and TypeScript typecheck: passed (`npm run build`, via `verify:platform`).
- Lint: passed with pre-existing warnings (`npm run lint`, via `verify:platform`).
- Server syntax: passed (`node --check server/index.mjs`).
- Google Drive: passed.
- Paystack: passed.
- n8n: passed.
- Mail connector: passed.
- Hermes integration: passed.
- Lancee MCP: passed.
- Workspace/auth flows: passed, including sessions, same-origin mutations, and Google OAuth callback handling.
- Final active-source legacy-product-domain search: passed; no active occurrence remains.
- Built canonical/OpenGraph metadata: passed.

The declared `verify:platform` pipeline continued through build, lint, and AI verification, then stopped at the existing `verify:agent` assertion because the modified Hermes prompt no longer contains the test's expected `Lancee decision tools` wording. This is unrelated to the domain migration. The Connected Intelligence verifier also fails in existing fixture setup because `workspace_members.updated_at` is null; its fixture verifier separately fails an existing expected-output assertion. No unrelated agent, database, or test behavior was changed.

Live website verification is pending DNS/proxy deployment: `lancee.work` and `www.lancee.work` currently do not resolve. The old URL remains available for testing and returns HTTP 200 for `GET /`.

## Go-live checklist

1. Copy the existing Lancee origin destination into the new `lancee.work` DNS record; add optional `www` CNAME.
2. Add the Nginx Proxy Manager host and valid TLS certificate for the new name.
3. Add the exact Google OAuth redirect URI and Picker origin/referrer restrictions above, retaining old entries temporarily.
4. Update Paystack, n8n, OpenConnector-managed providers, Hermes, and MCP/API clients where their registered URL includes the old hostname.
5. Deploy/rebuild the application and restart it with the migrated `.env`.
6. Verify HTTPS, assets, navigation/direct-route refresh, canonical metadata, signup/login/logout/session persistence, signup confirmation, invitations, dashboard, clients, projects, ideas, automations, invoices, Connected Intelligence, Google Drive/Picker, mail, Paystack, n8n, Hermes/MCP/AI, and workflows on `https://lancee.work`.
7. Verify `www` redirects to the apex while preserving path/query.
8. Keep the old hostname live during callback and client migration; then redirect safe browser routes permanently while handling API/OAuth/MCP routes explicitly.
9. Remove old OAuth/provider entries and retire the old host only after logs show no remaining callback/client traffic.
