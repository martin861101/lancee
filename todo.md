# Implementation Plan: Remove Mock Data & Add Real Integrations

## Status
- [x] Read all core files (server, database, mockApi, App.tsx, lancee.html)
- [x] Added "Documentation" link in `src/App.tsx` landing footer → `lancee.html`
- [x] Added "Documentation" link in `lancee.html` footer
- [x] Fixed favicon in `lancee.html` → `favicon.svg`
- [x] Fixed logo in `lancee.html` header/footer → `img/icon.png`
- [x] Added env vars to `.env.example` (AI, Google Drive, SMTP)
- [x] Created `server/ai.mjs` — OpenAI/Anthropic chat completion module
- [x] Added AI routes + automations/runs routes to `server/index.mjs`
- [x] Added DB tables in `server/database.mjs` (automations, automation_runs, ai_conversations, google_drive_tokens)
- [x] Added AiError handler in index.mjs error middleware
- [x] DB methods: listAutomations, createAutomation, toggleAutomation, listAutomationRuns, createAutomationRun
- [x] mockApi.ts: automations.list/create/toggle and runs.list/dispatch use real fetch()
- [x] mockApi.ts: ai.complete() uses real fetch()
- [x] Build passes (`pnpm build`)
- [x] Lint passes (`pnpm lint`) — warnings only (unused param, hook deps)

## Remaining / Optional
- [ ] Minor lint cleanup: fix unused `onOpenIdeas` param in `WorkPanel.tsx`
- [ ] Minor lint cleanup: fix `useCallback` deps in `IdeasCanvasPage.tsx`
- [ ] Feature requests from user
