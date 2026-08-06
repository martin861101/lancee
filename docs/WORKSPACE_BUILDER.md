# Workspace Builder

The Workspace Builder turns a short, plain-language interview into the smallest
useful Lancee workspace. It implements `NEW_FEATURES.md` and is available from
**Platform → Workspace builder**. New workspaces must complete it once; existing
workspaces can open it without being interrupted.

## Experience

The responsive, keyboard-accessible flow has ten stages:

1. Welcome and setup expectations.
2. Business name, industry, size, country, timezone, and optional logo.
3. Day-to-day business activities.
4. Services the owner may connect after launch.
5. Clients, contractors, employees, suppliers, or solo work.
6. Practical processes and optional sample data.
7. A deterministic recommendation that can be reduced before installation.
8. Optional AI workflow suggestions, each disabled until explicitly approved.
9. Visible generation progress with a retry path.
10. A launch summary and an optional path to invite the team.

Progress is saved between stages. A failed request leaves the answers intact,
and failed generation can be retried. Generation is idempotent for 24 hours, so
a network retry cannot duplicate the workspace configuration.

## Configuration engine

[`server/workspace-builder.mjs`](../server/workspace-builder.mjs) contains the
profile engine and all allowlists. The engine:

- normalizes and bounds every answer before persistence;
- starts with a dashboard and adds only modules implied by activities,
  industry, and process answers;
- derives dashboards, role profiles, templates, notification preferences, and
  draft automations from predefined rules;
- records selected integrations as connections to finish, never as already
  authorized connections;
- accepts only catalog identifiers during generation; and
- keeps AI output outside the base recommendation.

This keeps the normal path fast and predictable. AI is called only when the
owner enters a unique requirement. Its response must be strict JSON and is
normalized to at most three small workflows. If no AI provider is configured
or the provider fails, the UI explains that the deterministic workspace is
still ready and lets the owner continue.

## Persistence and generated resources

`workspace_builder_configs` stores one resumable record per workspace:

- whether setup is required;
- lifecycle status and current step;
- normalized answers;
- the deterministic recommendation;
- optional AI suggestions;
- the final generated manifest; and
- creation, update, and completion timestamps.

On completion, the backend also:

- updates workspace name, email, timezone, and optional logo;
- persists the selected module manifest and uses it to keep navigation focused;
- prepares selected integrations in a disconnected state for later OAuth or
  credential authorization;
- creates selected rule-based and approved AI workflows as inactive drafts;
- preserves the existing owner/collaborator/viewer permission model;
- optionally creates an unmistakably labelled sample client and project; and
- publishes a workspace-ready notification.

Dashboards, permissions, templates, and notification choices are part of the
generated manifest so later module-specific editors can evolve them without
rerunning onboarding.

## API

All routes require an authenticated workspace. Mutations require owner access.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/workspace-builder` | Load state and the server-owned catalog. |
| `PATCH` | `/api/workspace-builder/draft` | Save normalized answers and resume step. |
| `POST` | `/api/workspace-builder/recommend` | Build the deterministic recommendation. |
| `POST` | `/api/workspace-builder/ai-suggestions` | Request optional, approval-gated workflows. |
| `POST` | `/api/workspace-builder/generate` | Idempotently create the approved setup. |
| `PUT` | `/api/workspace/logo` | Store a validated JPEG, PNG, or WebP logo up to 2 MB. |

Mutation clients send an `Idempotency-Key`. Generation returns the standard
`Idempotency-Replayed` response header on a replay.

## Operational behavior

- A new account receives a builder row with `required_setup = 1` during the
  same transaction that creates its workspace and owner membership.
- Invitation-based members never receive a second onboarding gate.
- A legacy workspace without a builder row receives a non-required default
  state and can opt in from the sidebar.
- Every generated automation starts in `draft`; the builder never activates an
  action or connects a third-party service on the user's behalf.
- Existing connected integrations are not disconnected when a recommendation
  is changed.

## Verification

Run:

```bash
npm run build
npm run lint
npm run verify:workspace-builder
```

The builder verification starts a temporary application and SQLite database.
It checks input allowlists, deterministic profiling, saved drafts,
recommendations, the no-AI fallback, logo persistence, generated draft
automations, workspace settings, and idempotent replay. The test removes its
temporary database on completion.

