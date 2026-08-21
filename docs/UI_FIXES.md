# UI Fixes

## Navigation consolidation

- The sidebar no longer shows the **Workspace at a glance** card.
- **Automations & Workflows** combines saved automations with the existing
  workflow recipe catalog on `/dashboard/automations`.
- **Storefront** and the standalone **Results** navigation entries are removed.
- **Connected Apps** combines connections with the former Services context on
  `/dashboard/integrations`.
- **Preferences** combines profile and workspace settings; developer tools are
  available only inside Preferences.

Legacy dashboard URLs remain safe: Analytics redirects to Intelligence,
Workflows and Results redirect to Automations & Workflows, Services redirects to
Connected Apps, and Storefront redirects to Home.

## Intelligence and connected apps

The existing live business analytics view now renders below Decision
Intelligence. It keeps refresh but omits Cloud files and JSON export actions.

Connected Apps replaces the former Lancee MCP tool listing with an explanatory
architecture diagram:

```text
AI and external tools → Lancee MCP and internal tools → PostgreSQL memory
research/web search     workspace reads                    durable records
```

The diagram is explanatory only; it does not expose new tools, credentials, or
data paths.

## Notifications

The notification popover now includes a confirmed **Clear all** action. It calls
`DELETE /api/notifications`, which deletes only notifications belonging to the
authenticated workspace. The operation is an idempotent, authenticated mutation.

## Verification

Run:

```bash
npm run verify:ui-fixes
npm run verify:decision-ui
npm run build
npm run lint
```
