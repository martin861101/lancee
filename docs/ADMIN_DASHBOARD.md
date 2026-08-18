# Lancee Admin Dashboard

## Access

The platform admin dashboard is available at `/dashboard/admin`. Access is
restricted to the authenticated account whose normalized email is exactly
`martin@hookitupservices.com`.

Authorization is enforced in two places:

- The browser receives `isAdmin` in the signed-in user response and only shows
  the **Admin** sidebar and command-palette option to that account.
- The server independently checks the session email on every `/api/admin/*`
  request. A hidden link or manually entered URL cannot grant access.

Workspace ownership is separate from platform administration. Other workspace
owners do not receive platform-wide access.

## Views

- **Overview** shows registered-user, workspace, API, agent-run, automation-run,
  and active-job totals, plus workspace activity.
- **Users** lists registered accounts, status, registration date, and workspace
  memberships.
- **API usage** shows total calls, errors, error rate, and daily traffic for the
  last 30 days.
- **Logs** shows the latest 100 sanitized agent, execution-worker, and automation
  events with level and workspace context.
- **System** shows database provider, mode, version, table count, query latency,
  query count, and snapshot freshness.

All dashboard data is read-only. It is sourced from the existing durable Lancee
tables rather than browser analytics or third-party tracking.

## Signup control

The **Allow new signups** switch on the Overview tab controls public account
registration. Its value is stored in `platform_settings`, so it survives server
restarts.

When disabled:

- public signup start, confirmation, and account-creation calls are rejected;
- the landing page presents the paused-signup notice;
- the sign-in screen hides the public account-creation link; and
- existing users and members joining through a valid invitation can still
  authenticate.

`ALLOW_REGISTRATION` remains the initial default until the admin saves a value
with the switch.

## API

- `GET /api/admin/dashboard` returns the complete read-only admin snapshot.
- `PATCH /api/admin/settings/registration` accepts `{ "enabled": boolean }` and
  persists the public-signup setting.

Both endpoints require the normal signed session and the platform-admin email.
The mutation also uses the application's origin validation.
