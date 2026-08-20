# Dashboard Update 31

This update records the product changes delivered during the dashboard update
31 cycle.

## Navigation and account experience

- The authenticated content canvas is lighter than the sidebar while retaining
  the dark navy visual system.
- The landing-page Connections navigation item is text-only.
- Workflows and Invoicing are first-class sidebar destinations.
- Activity Logs and API Keys are available under Settings → Dev Tools instead
  of occupying everyday navigation.
- The top-right avatar opens an account card with Profile, Settings, Dev Tools,
  and Sign out actions.
- Page-header alternate words use the landing-page brand gradient and serif
  treatment.

## Projects

Project workspaces now provide independent Board, Details, Files, and Links
views. Files can be uploaded and removed in the Files view, while external URLs
can be added and removed in Links.

Board bucket menus are functional. Built-in buckets explain their fixed stage
behavior, and custom buckets can be added, renamed, or removed. Every bucket can
be assigned to an active team member. Custom bucket definitions and assignments
are scoped to the project and persisted in browser storage; project records,
files, links, status changes, and Drive relationships remain server-persisted.

## Ideas and project files

All `.excalidrawlib` extensions under
`src/components/canvasui/library/` are loaded and merged with the user's custom
library whenever the editor opens.

Export PDF to Files renders the active scene, builds a real PDF locally,
downloads it, and uploads the same PDF to the authenticated workspace document
library. When the board is attached to a project, the PDF is also added to that
project's Files section. It therefore appears in Files and can later be synced
to Google Drive.

## Files

The workspace document library and Google Drive tree use file-explorer rows with
three-dot menus. Available actions include link, edit/view, download/open, sync,
and Remove from platform. Existing client/project relationship records remain
intact.

## Automations and workflows

Automations is explicitly presented as the n8n workflow area, including an n8n
visual explainer. Workflows is a separate discovery page containing approval,
notification, intake, invoicing, delivery, and trigger-based templates. Choosing
a template routes the user to Automations to configure it in n8n.

## Invoicing

The Invoicing page supports three visual styles (Modern, Classic, and Studio),
invoice/estimate/receipt document types, common currencies, custom fields, and
an optional Pay me button branching to Stripe, PayPal, or Paystack.
Documents without a Pay me button are retained as browser-scoped drafts and can
be downloaded as styled, printable HTML documents.

Paystack ZAR links continue to use the live server integration. Stripe and
PayPal options clearly direct the user to Connections until their provider
adapters are configured. Non-ZAR Paystack conversion remains guarded until
`CURRENCYLAYER_API_KEY` is added; no external conversion request is made by this
update.

## Connections and team

The two Codex connection cards are hidden from the business connection catalog.
A provider-neutral General AI connection placeholder represents the future AI
layer, while existing popular business connections remain available.

Workspace admins can now edit a member's name and role or remove the member.
Roles are Admin (`owner`), Collaborator, and Viewer. Server routes enforce owner
authorization, prevent self-removal and removal/demotion of the last admin, and
support pending invitations. Database constraints are migrated for Viewer on
PostgreSQL and SQLite.

## Verification

- `npm run build`
- `npm run lint`
- `node --check server/index.mjs`
- `node --check server/database.mjs`
- `npm run verify:durability`
- `npm run verify:workspace-flows`

Vite's existing advisory about the lazy-loaded Ideas/Excalidraw bundle size
remains non-blocking.
