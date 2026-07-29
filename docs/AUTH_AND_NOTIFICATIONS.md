# Authentication and Notifications

## Authentication decision

lancee currently uses an application-owned Express session instead of Firebase.
This keeps authentication, MCP grants, n8n signing secrets, SMTP credentials,
and future provider tokens behind one trusted backend.

Firebase remains a reasonable future identity provider for self-service signup,
social login, MFA, and account recovery. When added, the backend should verify
the Firebase ID token, resolve workspace membership and roles, and issue the
same lancee session cookie. Provider tokens should not become the application's
authorization model.

## Current session flow

1. The public landing page is rendered for a visitor with no session.
2. `GET /api/auth/session` restores an existing signed session.
3. `POST /api/auth/login` resolves the user and workspace membership from the
   configured database, then verifies the password with `scrypt`.
4. The server issues `lancee_session` as an `HttpOnly`, `Secure`,
   `SameSite=Lax` cookie.
5. `POST /api/auth/logout` expires the cookie and returns the visitor to the
   public landing page, then clears the browser's lancee IndexedDB data.

After one authenticated load, the browser retains a non-secret display snapshot
of the last user/workspace so the installed shell can reopen cached Idea notes
when the API is unreachable. This snapshot is not accepted by the server and
does not replace the signed cookie. If the server returns `401`, the client
removes the local snapshot; reconnect sync requires a valid server session.

Controls in `server/index.mjs` include:

- 12-hour default session expiry;
- a persistent 384-bit signing secret in `.runtime/session-secret`;
- configurable public registration through `ALLOW_REGISTRATION`;
- owner-only, seven-day team invitations stored as token hashes;
- SMTP delivery of invitation links when configured, with a copy/share fallback;
- constant-time password comparison;
- five failed attempts per IP per 15 minutes;
- same-origin checks for mutations;
- CSP, frame denial, MIME sniffing protection, referrer policy, and restrictive
  browser permissions;
- `Cache-Control: no-store` on authentication and MCP grant state.

The service worker separately excludes every `/api/` request from Cache
Storage. See [`OFFLINE_PWA.md`](OFFLINE_PWA.md).

The database now contains real `users`, `workspaces`, and `workspace_members`
records. The configured administrator is the initial bootstrap owner and the
environment remains its password-rotation source. Self-service registration
still requires email verification, password reset, invitations, and account
management rather than extending the environment-file bootstrap mechanism.

New sessions carry stable user and workspace IDs. Sessions issued before the
database migration are resolved by email for a compatible transition.

## Administrator sign-in

Open [https://agents.hygridtech.co.za](https://agents.hygridtech.co.za), select
**Sign in**, and use the email configured in `ADMIN_EMAIL` with the password
used to generate the current hash. There is no dashboard bypass or plaintext
password stored on the server.

To verify an active deployment without exposing credentials, confirm that a
successful login returns `200`, `/api/auth/session` returns `200` with the
issued cookie, and logout returns `204`.

## Password rotation

Run:

```bash
pnpm auth:hash
```

The script prompts without echoing the password and prints a new
`ADMIN_PASSWORD_SALT` and `ADMIN_PASSWORD_HASH`. Replace those two values in
`.env`, then reload PM2 with `--update-env`. Never place the plaintext password
in `.env`, source control, documentation, or a browser variable.

## SMTP notifications

SMTP is disabled safely by default. Configure these values in `.env`:

```dotenv
SMTP_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_NAME=lancee
SMTP_FROM_EMAIL=notifications@example.com
SMTP_REPLY_TO=
SMTP_TEST_TO=
```

Use port `465` with `SMTP_SECURE=true`, or the provider's STARTTLS port
commonly exposed as `587` with `SMTP_SECURE=false`.

Authenticated endpoints:

- `GET /api/notifications/status` reports whether the transport is enabled and
  configured without returning credentials.
- `POST /api/notifications/test` sends a test message to `SMTP_TEST_TO`.
- MCP bearer requests emit a notification when SMTP is enabled; notification
  failure never leaks credentials or blocks the access request.

After editing `.env`, reload the process and use the notification test action or
endpoint. SMTP failures returned to the browser are intentionally generic;
provider-specific detail belongs in protected server logs.

## Files and permissions

- `.env` is ignored and has mode `0600`.
- `.env.example` contains names and safe defaults only.
- `.runtime/session-secret` is generated with mode `0600` and ignored.
- `.runtime/lancee.sqlite` is persisted with mode `0600` and ignored.
- `server/notifications.mjs` creates the SMTP transport lazily, so missing
  credentials cannot prevent the application from starting.

See [`DURABLE_FOUNDATION.md`](DURABLE_FOUNDATION.md) for schema, API-key, MCP,
and idempotency details.
