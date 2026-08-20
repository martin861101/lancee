# Files, storage points, and live workspace context

## Home context

`GET /api/workspace/context` is authenticated and derives the request address
from the current Express session request. Private, loopback, link-local, and
carrier-grade NAT addresses are ignored, so development traffic gets a safe
empty context instead of a misleading location.

For a public address, the server uses IPWho to resolve city, region, country,
coordinates, and timezone. It then asks Open-Meteo for current temperature,
feels-like temperature, WMO weather code, day/night state, and wind speed. The
response intentionally excludes the IP address. Results are cached per public
IP for 15 minutes, and provider failures leave the page usable with a local
clock fallback.

The client refreshes the context every 15 minutes and updates the displayed
clock every second. The greeting is calculated from the resolved timezone, not
from the server's timezone. The Home masthead keeps the presentation concise:
one date/time pill plus one city, temperature, and conditions card, without
provider or live-status wording.

## File explorer

The Files page is organized around a local lancee library and workspace-scoped
storage points. A storage point records:

- provider: `drive`, `dropbox`, or `onedrive`;
- a human-readable label;
- the folder or destination URL;
- optional notes; and
- whether it is the workspace default.

The supported upload choices shown to users are local workspace, Google Drive,
Dropbox, and Microsoft OneDrive. Local files are stored in the existing
workspace document library and retain their selected `storagePointId` when a
cloud point is chosen. Google Drive uploads use the existing server-side Drive
integration. Dropbox and OneDrive currently use the storage-point model: the
workspace records the destination and does not browse, mirror, or claim access
to the provider. Provider API upload/browse work can be added later without
changing the workspace document or storage-point contract.

Google Drive has a dedicated workspace-folder workflow. The Files page opens
the Google Picker in folder-only mode and stores one selected folder as the
workspace's Drive root. On later visits, the page loads that folder's direct
children automatically, supports nested-folder breadcrumbs, and keeps the
folder's Drive URL available as an escape hatch. The selected folder is also
used as the destination for Drive uploads and local-document syncs.

Supported Drive documents open in the existing in-app workspace: Markdown and
Word-compatible documents can be edited and saved back to Drive, while PDFs
and images open as previews. Unsupported formats remain available through the
Open in Drive action. The existing resource-link tools remain available below
the primary browser for associating Drive files or folders with clients and
projects.

Saved Drive selections are resolved independently. If Google reports that a
selected file no longer exists or is no longer accessible, the Files endpoint
omits that item and removes its stale selection, resource links, and local
document sync pointer. Other available files continue to load, and local
document content is retained.

The primary explorer UI follows the dark reference layout: a storage sidebar,
top utility bar, large search and filter controls, a selected-folder Drive
browser, quick access, aligned folder metadata, and a full local-document
table. Cloud rows expose View/Edit, Open in Drive, and file actions in one
compact menu. Controls use inline SVG icons instead of font-dependent text
glyphs, and the layout reduces to a compact mobile table.

## Desktop navigation

The global dashboard sidebar has a desktop toggle in the top bar. It applies a
transform-based slide transition and removes the sidebar width from the main
content while hidden. The existing mobile scrim and slide-in drawer continue to
use their own breakpoint behavior.

## Relevant implementation files

- `src/App.tsx` — live Home context presentation and global sidebar toggle.
- `server/index.mjs` — public-IP context resolution and document routes.
- `server/database.mjs` — storage-point schema, defaults, and workspace queries.
- `src/components/dashboard/FilesPage.tsx` — file explorer interaction model.
- `src/components/dashboard/dashboard-page.css` — reference-style explorer layout.
- `src/lib/api.ts` — typed client contracts for context, documents, and storage points.
