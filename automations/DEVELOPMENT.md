# Development

## Repository Layout

| Path | Purpose |
| --- | --- |
| `src/routes` | TanStack Router pages and layouts |
| `src/components` | Application and reusable UI components |
| `src/components/ui` | Radix-based UI primitives |
| `src/lib` | Frontend clients, AI logic, state, and utilities |
| `agent/routes` | Express routers |
| `agent/lib` | Database, SSH, AI, memory, and integration helpers |
| `agent/scripts` | Hermes and API-key failover scripts |
| `public` | Static images, icons, and video |
| `docs` | Canonical project documentation |

## Commands

Frontend and full build:

```bash
npm run dev
npm run lint
npm run build
npm run build:dev
npm run preview
npm run format
```

Backend agent:

```bash
cd agent
npm start
```

## Adding a Frontend Route

1. Create a file under `src/routes` using `createFileRoute`.
2. Add navigation when the route is user-facing.
3. Run the build so TanStack Router regenerates `src/routeTree.gen.ts`.
4. Do not manually edit the generated route tree.

## Adding an Agent Route

1. Create or update a router under `agent/routes`.
2. Mount it in `agent/server.js` after `app.use(requireAuth)` unless it intentionally has its own authentication.
3. Add typed client methods in `src/lib/agent-client.ts`.
4. Validate request inputs and avoid returning secrets.
5. Update [API Reference](./API_REFERENCE.md).

Public routes require an explicit security design. The MCP public router is mounted before dashboard authentication because it validates dedicated MCP keys itself.

## Database Changes

Schema initialization lives in `agent/lib/db.js` and uses idempotent `CREATE TABLE IF NOT EXISTS` statements. When changing existing tables, add a safe migration rather than assuming a fresh database.

Encrypt confidential values with the existing credential helpers. Never store API keys, passwords, private keys, or refresh tokens as plaintext.

## UI Conventions

- Preserve existing layout, component, and theme patterns.
- Use primitives under `src/components/ui` rather than adding duplicate controls.
- Support desktop and mobile layouts.
- Keep loading, empty, success, and error states explicit.
- Use TanStack Query invalidation after backend mutations.
- Use Sonner toasts for operation results.

## Verification

Before considering a change complete:

```bash
npm run lint
npm run build
git diff --check
```

For backend JavaScript files, also run:

```bash
node --check agent/server.js
node --check agent/routes/<changed-route>.js
```

Exercise authentication and secret masking for security-sensitive endpoints.

## Documentation

Update the appropriate document in `docs/` whenever behavior, routes, configuration, deployment, or user workflow changes. Add a dated file under `docs/CHANGELOGS/` for completed features or fixes.

Do not treat `Overview.md` or `agent/INTEGRATION.md` as current specifications; they contain historical planning content.
