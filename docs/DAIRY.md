# Dairy workspace

Dairy is the dashboard schedule workspace at `/dashboard/dairy`. The page is
lazy-loaded from `src/components/dashboard/DairyPage.tsx`; the Zoom client is a
second dynamic import, so its large media bundle is downloaded only when a user
chooses **Join meeting**.

## Calendar

- Renders a responsive six-week month view.
- Opens a focused entry dialog when a user taps or keyboard-selects a date;
  Escape, the close button, or the backdrop closes it.
- Keeps the persistent entry form available alongside or below the calendar,
  depending on viewport width.
- Includes project deadlines returned by the authenticated Projects API.
- Adds meeting or deadline entries with optional project and client relationships.
- Stores scheduled meeting metadata in workspace-scoped browser storage.
- Links directly to Meetings, Projects, and Clients.
- Leaves provider synchronization intentionally open for later calendar
  connector work.

## Meetings and Zoom

The Meetings view links to Calendar, Projects, Clients, and Files. It uses
Zoom Meeting SDK for Web component view (`@zoom/meetingsdk` 6.2.0), which keeps
the meeting interface inside the dashboard on supported desktop browsers.

Create a Meeting SDK app in the Zoom App Marketplace and set these server-only
environment variables:

```dotenv
ZOOM_MEETING_SDK_KEY=
ZOOM_MEETING_SDK_SECRET=
```

Restart the server after changing them. The browser sends only the meeting
number to `POST /api/zoom/signature`; the authenticated server validates it and
returns a short-lived, participant-role Meeting SDK JWT. The SDK secret is never
sent to the client or stored in the calendar.

The global Content Security Policy permits Zoom's documented WebAssembly,
worker, media, and WebSocket endpoints. The Permissions Policy grants camera,
microphone, and screen-capture access only to the same origin.

Zoom requires additional ZAK or OBF authorization for some meetings outside the
Meeting SDK app's account. That authorization belongs in a future Zoom account
connector; the current server signs participant joins and does not request or
store a Zoom OAuth token.

Official references:

- https://developers.zoom.us/docs/meeting-sdk/web/get-started/
- https://developers.zoom.us/docs/meeting-sdk/web/component-view/
- https://developers.zoom.us/docs/meeting-sdk/auth/

## Verification

```bash
npm run build
npm run lint
node --check server/index.mjs
```

The production build should emit separate `DairyPage` and `embedded` chunks,
confirming that both the page and Zoom SDK remain off the initial dashboard
bundle.
