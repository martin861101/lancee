# Canvas V2

Date: 2026-07-31

This note records the Ideas canvas (Excalidraw) changes delivered in this round,
which supersede the earlier IndexedDB-only persistence described in
[`IDEAS_CANVAS.md`](IDEAS_CANVAS.md).

## 1. Workspace edits persist to PostgreSQL (no browser cache)

Canvas scenes are no longer saved to the browser's IndexedDB cache. Every board
edit is debounced and written to the workspace's PostgreSQL database, scoped by
the authenticated workspace id.

- New `idea_canvas_scenes` table keyed by `(workspace_id, board_id)` — created
  automatically at server startup; deleted rows cascade when a board is removed.
- New server methods `getIdeaCanvasScene` / `saveIdeaCanvasScene`
  (`server/database.mjs`); `deleteIdeaBoard` now also deletes the scene row.
- New endpoints:
  - `GET /api/ideas/boards/:boardId/scene` — loads the saved scene for a board.
  - `PUT /api/ideas/boards/:boardId/scene` — saves the full scene JSON
    (elements, appState, files) under the request's workspace.
- Client API: `api.ideas.getScene(boardId)` / `api.ideas.saveScene(boardId, scene)`
  (`src/lib/api.ts`).
- `IdeasCanvasPage.tsx`: removed all IndexedDB scene helpers; load/save now call
  the server. Save failures surface in the on-page error banner. The header
  indicator now reads "Saved to workspace" (or "Offline · reconnect to save").
- The board directory is still cached locally for a fast first paint, but the
  source of truth for scene content is the database.

## 2. Library extensions available in the canvas at all times

The library `.excalidrawlib` files added in `src/components/canvasui/library/`
are bundled via `import.meta.glob` and loaded into every canvas session, merged
with each workspace's custom library items. No manual import step is required.

## 3. PDF export from the canvas, synced to project files

The "Export PDF to Files" button renders the live scene to a PDF and:

- uploads it to the workspace documents list;
- attaches it to every linked project (projects whose `boardId` matches the
  board);
- triggers a local download of the generated file.

## 4. Grouped library panel (headings)

A new **Libraries** toggle opens a sidebar beside the canvas. Each
`.excalidrawlib` file becomes a collapsible heading (e.g. "Awesome Icons",
"Forms", "System Design"). Each item shows an SVG thumbnail and a name
(from item metadata, or derived from text elements when unnamed).

Clicking an item inserts it onto the canvas at the viewport center with
regenerated element ids (no collisions), and the change auto-saves to the
database. Thumbnails render through a bounded (4-way) concurrency queue.

## 10 MB body-size restriction

**Scenes are stored as a single JSON blob per board, and the scene-save
endpoint accepts a request body of at most 10 MB (the same cap used for file
uploads).** A board carrying many large embedded images can approach this limit;
if that becomes a problem, embedded files should be stored separately rather
than inside the scene blob.

## Main files

- `server/database.mjs` — `idea_canvas_scenes` schema + scene methods.
- `server/index.mjs` — `GET`/`PUT /api/ideas/boards/:boardId/scene` routes.
- `src/lib/api.ts` — `api.ideas.getScene` / `api.ideas.saveScene`.
- `src/components/IdeasCanvasPage.tsx` — server persistence, library groups,
  library panel, click-to-insert.
- `src/components/ideas-canvas.css` — library panel styling.
- `scripts/verify-offline-sync.mjs` — verification of scene persistence
  (save/load/restart) under the workspace id.
- `scripts/migrate-sqlite-to-postgres.mjs` — includes `idea_canvas_scenes`.
