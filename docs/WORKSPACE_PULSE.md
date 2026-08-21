# Workspace Pulse Home

## Outcome

Home is now a contextual, atmospheric starting point instead of a compact KPI
dashboard. Its order is intentional:

1. a weather-responsive Workspace Pulse hero;
2. no more than four reliable Today actions;
3. the existing Quick Task launcher;
4. saved automations and recent activity.

Analytics remains unchanged inside Intelligence.

## Visual treatment

The hero uses the repository asset at `public/img/sunny.png`. Weather changes
the tint and lightweight overlay rather than introducing unrelated stock
images:

| Conditions | Pulse mood |
| --- | --- |
| Clear/mainly clear day | `sunny` |
| Cloud, overcast, or fog | `cloudy` |
| Drizzle, rain, or showers | `rainy` |
| Thunderstorm | `stormy` |
| Snow or snow showers | `snowy` |
| Clear night | `clear-night` |
| Cloudy night | `cloudy-night` |
| Weather unavailable | `steady` neutral gradient |

Rain, sunlight, and night-star movement is subtle and disabled by
`prefers-reduced-motion`. Text and weather controls use contrast overlays and
remain responsive down to the mobile dashboard layout.

## Data flow

The browser constructs a deterministic pulse from already-loaded workspace
data and renders it immediately. It then calls:

```text
GET /api/workspace/pulse
```

The authenticated route derives the workspace and user from the server session;
it never accepts tenant identifiers from query parameters or request bodies.
The service reads bounded workspace context from existing projects, project
tasks, invoices, automation runs, notifications, location, and weather.

When a valid per-workspace/per-user AI pulse is cached, it returns immediately.
Otherwise the route returns a deterministic fallback and starts a background
refresh through `completeChat`. The browser performs two short, invisible
rechecks so freshly generated copy can crossfade in without delaying first
paint. Valid AI copy is cached for 90 minutes.

The response contract is:

```json
{
  "headline": "A clear day to move work forward, Martin.",
  "message": "Three projects are active and one is due tomorrow.",
  "mood": "sunny",
  "generatedAt": "2026-08-21T09:00:00.000Z",
  "source": "ai",
  "refreshPending": false,
  "items": [
    {
      "id": "project-prj_123",
      "title": "Website refresh",
      "detail": "Due tomorrow · Northstar Studio",
      "kind": "deadline",
      "target": "work"
    }
  ]
}
```

## AI and failure boundaries

- AI is used only for the headline and supporting message.
- The service calls the existing bounded chat-completion layer, not the Hermes
  agent runtime or full tool-using agent.
- The prompt contains aggregate workspace facts and current local context.
- Output must be JSON, match the expected weather mood, and include non-empty
  plain-text copy.
- Headline and message are sanitized and capped at 80 and 240 characters.
- HTML and Markdown markers are removed; React performs normal text escaping.
- AI/provider errors and malformed output never replace the deterministic
  fallback and never surface as Home error banners.
- No new environment variables are required. Existing AI provider settings are
  optional; without them, Home remains fully usable.

## Verification

Run:

```bash
npm run build
npm run lint
npm run verify:workspace-pulse
```

The focused verifier covers all weather mappings, no-weather fallback, cached
AI output and expiry, tenant isolation, HTML sanitization, malformed output,
and unavailable AI. The production UI was also checked at 1440 px and 390 px
without horizontal overflow or runtime errors.
