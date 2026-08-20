# Excalidraw Ideas workspace

Date: 2026-07-29

## Overview

The Ideas route uses the MIT-licensed Excalidraw React editor. It replaces the
production-licensed tldraw integration and requires no production license key.
The editor is lazy-loaded with the route so the main dashboard and landing page
do not pay the canvas bundle cost until Ideas is opened.

The embedded editor keeps its complete default interface, including:

- selection, hand, freehand drawing, eraser, laser, shapes, arrows, lines, text,
  frames, and embeddable content;
- snapping, arrow binding, grouping, arranging, locking, duplication, undo,
  redo, zooming, and panning;
- images, reusable shape libraries, dark mode, localization, keyboard
  shortcuts, and touch input;
- `.excalidraw` open/save and PNG, SVG, and clipboard export workflows.

The surrounding lancee UI adds authenticated named-board management, responsive
dark glass framing, connectivity status, and a compact capability legend.

## Persistence model

The board directory continues to use the authenticated `/api/ideas/boards`
endpoints. It is cached locally so the last directory can render when the
network is temporarily unavailable.

Each Excalidraw document uses this browser persistence key:

```text
lancee:excalidraw:<workspace-id>:<board-id>
```

The scene elements, view state, and binary files are debounced into the
`lancee-excalidraw` IndexedDB database. Reusable library items are stored per
workspace. This enables local offline editing without sending potentially large
embedded images through the existing board-label API.

Canvas contents do not yet synchronize across devices or users. Excalidraw's
hosted app includes collaboration, but the embedded npm editor does not provide
that server infrastructure as a drop-in feature. Adding it requires a separate
realtime backend, access control, encryption, and durable asset storage.

Legacy Konva, quick-note, and tldraw records are not deleted automatically.
Their formats are incompatible with Excalidraw and they are no longer rendered.

## Licensing

The Excalidraw repository and npm editor are distributed under the MIT License.
No environment variable, production key, console suppression, or license-check
workaround is used.

## Main files

- `src/components/IdeasCanvasPage.tsx` — board management, IndexedDB
  persistence, and Excalidraw mount.
- `src/components/ideas-canvas.css` — responsive glass frame and route styling.
