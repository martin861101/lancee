You are working on the Lancee repository.

GOAL
Redesign the authenticated Home/Overview page into a dynamic, contextual
"Workspace Pulse" experience rather than another traditional analytics
dashboard.

IMPORTANT
Inspect the repository thoroughly before changing anything.

Do not replace working functionality unnecessarily.
Do not duplicate existing services.
Do not modify Analytics.
Do not put AI inference in the critical page-render path.
Do not call Hermes directly from React.
Do not expose AI/provider credentials to the frontend.

All work MUST be done on a new feature branch:

feature/workspace-pulse-home

Never commit directly to main.

==================================================
1. FIRST: AUDIT THE EXISTING IMPLEMENTATION
==================================================

Before coding, inspect at minimum:

- src/App.tsx
- src/index.css
- src/lib/api.ts
- server/index.mjs
- server/agents/*
- docs/HERMES.md
- existing weather/location implementation
- existing AI completion endpoints
- existing task/project/client/calendar/activity APIs
- existing Home/Overview implementation

Determine how the current OverviewPage works and preserve useful existing
functionality.

The repository already has WorkspaceContext containing weather/location
information including:

- city
- region
- country
- timezone
- temperatureC
- apparentTemperatureC
- weatherCode
- isDay
- windSpeedKmh

REUSE THIS.

Do not add another weather provider unless there is an actual missing
requirement.

The repository also already separates Hermes agent execution from bounded AI
completion.

Workspace Pulse is a SMALL BOUNDED AI OPERATION.

It should NOT launch a full Hermes agent/tool loop merely to generate dashboard
copy.

Reuse the existing completion-provider infrastructure where appropriate.

==================================================
2. HOME PAGE PRODUCT DIRECTION
==================================================

Home should feel like Lancee understands the user's day.

It should NOT look like:

"Here are four metric cards and three graphs."

Analytics already handles analytics.

The new Home experience should primarily answer:

- What's happening today?
- Is anything important?
- What should I probably focus on?
- What is the environment/day like?
- Can Lancee give me a useful contextual observation?

The visual hierarchy should be:

1. Large atmospheric Workspace Pulse hero
2. Dynamic greeting/context
3. Weather/environment
4. Small number of genuinely useful contextual items/actions
5. Existing useful Home functionality below where appropriate

Avoid filling whitespace merely because it exists.

==================================================
3. WORKSPACE PULSE HERO
==================================================

Replace/rework the existing Overview hero into a much more atmospheric
full-width section.

Example:

Welcome back, Martin.

Nice and sunny today. You've got a fairly relaxed morning ahead.
Why not take the laptop outside and get some fresh air while you work?

The language MUST be dynamic.

It must consider available context such as:

- user's first name
- local time
- weather
- temperature
- day/night
- workspace timezone
- tasks
- overdue work
- projects
- client activity
- upcoming events/meetings if available
- recent workspace activity
- Decision Intelligence signals if a safe existing read API exists

DO NOT fabricate unavailable data.

If calendar/meeting data is not available through an existing implementation,
simply omit it.

==================================================
4. INSTANT FALLBACK LANGUAGE
==================================================

CRITICAL PERFORMANCE REQUIREMENT:

The Home page must NEVER wait for AI.

Implement deterministic fallback greeting generation locally/server-side from
known context.

Examples:

Morning + sunny:

"Good morning, Martin."
"Beautiful morning outside. Looks like a good day to get some fresh air while
you work."

Afternoon + sunny:

"Good afternoon, Martin."
"Nice and sunny today. Not a bad excuse to take the laptop outside."

Rain:

"Good morning, Martin."
"Looks like a wet one today. Probably a good day to settle in and focus."

Cold:

"Morning, Martin."
"It's a chilly start today. Coffee weather."

Evening:

"Good evening, Martin."
"You're getting toward the end of the day. Here's what still deserves your
attention."

These are examples, NOT hardcoded universal responses.

Create a small deterministic context-to-copy function with multiple variants so
the fallback does not feel robotic.

The fallback must be available essentially immediately.

==================================================
5. AI-ENRICHED WORKSPACE PULSE
==================================================

After Home has rendered, asynchronously request an AI-enriched Workspace Pulse.

Preferred architecture:

Dashboard
    |
    +--> GET /api/workspace/pulse
             |
             +--> return cached pulse immediately if valid
             |
             +--> context builder
             |      weather
             |      tasks
             |      projects
             |      deadlines
             |      activity
             |      available workspace signals
             |
             +--> bounded AI completion
             |
             +--> cached pulse

Do not make React directly communicate with Hermes.

Do not use the full Hermes agent runtime unless repository architecture makes
that absolutely necessary.

Reuse the existing completeChat()/bounded completion infrastructure.

==================================================
6. STRUCTURED OUTPUT
==================================================

Workspace Pulse should return structured data rather than uncontrolled prose.

Something similar to:

{
  "headline": "Beautiful day outside.",
  "message": "You've got a relatively quiet morning. It might be a good time to
              get some focused work done outside.",
  "mood": "sunny_relaxed",
  "generatedAt": "...",
  "source": "ai"
}

Fallback:

{
  "headline": "Good morning, Martin.",
  "message": "Nice and sunny today.",
  "mood": "sunny",
  "generatedAt": "...",
  "source": "fallback"
}

Validate and sanitize model output.

Maximum:

headline: ~80 chars
message: ~240 chars

Never render arbitrary model HTML.

==================================================
7. AI SYSTEM INSTRUCTION
==================================================

Use a tightly constrained instruction similar to:

"You generate the short contextual greeting displayed on the Lancee Home
screen.

Sound natural, warm, concise and occasionally playful.

Use ONLY facts contained in the supplied workspace context.

Never invent meetings, deadlines, clients, tasks, weather, activity or
business events.

Do not mechanically list statistics.

Prefer an observation or useful suggestion.

Maximum one short headline and two short sentences.

Avoid corporate jargon.

Avoid repeating the same phrasing.

Do not use markdown.

Return valid JSON only."

Include the required response schema in the actual implementation.

==================================================
8. CACHING / PERFORMANCE
==================================================

AI must never block Home.

Implement sensible caching.

Suggested behaviour:

- return an existing valid Pulse immediately
- fallback greeting available instantly
- refresh AI Pulse asynchronously
- TTL around 60-120 minutes
- invalidate/refresh when practical after meaningful workspace events

Do NOT build a massive event system just for this feature.

If existing events/hooks make invalidation straightforward, use them.

Otherwise TTL + asynchronous refresh is acceptable for v1.

The frontend should gracefully cross-fade from fallback/cached copy to newly
generated copy.

No layout jump.

If AI fails:

DO NOTHING VISIBLE TO THE USER.

Keep the deterministic greeting.

Do not show:

"AI unavailable"
"Hermes error"
"Unable to generate greeting"

This feature is enhancement, not infrastructure.

==================================================
9. WEATHER VISUAL SYSTEM
==================================================

Use the EXISTING weatherCode/isDay values.

Create a small mapping layer for visual states, for example:

sunny_day
cloudy_day
rain_day
storm_day
snow_day
clear_night
cloudy_night

The hero should react visually.

Examples:

SUNNY
- warm daylight
- subtle sunlight beam
- outdoor work background
- cold beverage rather than coffee

RAIN
- cooler ambience
- rain/window treatment
- coffee/hot beverage may be appropriate

COLD/CLOUDY
- cooler muted scene

NIGHT
- moon/night ambience
- subdued lighting

Keep effects subtle and premium.

Respect:

prefers-reduced-motion

Do not introduce expensive continuous JS animations.

Prefer CSS opacity/transform effects.

==================================================
10. BACKGROUND ASSET
==================================================

The desired sunny scene is the previously created Lancee Home visual:

- outdoor patio/garden working environment
- wooden desk/table
- open laptop
- greenery
- sunlight
- cold beverage
- NO coffee for the sunny version
- NO text baked into the image
- NO weather icon baked into the image
- NO dynamic UI baked into the image

The weather, greeting and dynamic elements belong to React/CSS.

If the asset is available in the working environment, optimize it for web and
place it in an appropriate public/assets location.

Prefer WebP/AVIF where compatible.

Do not ship an unnecessarily huge source image.

If the asset is NOT present, create the implementation with a clearly named
asset placeholder and document the expected path.

Do not substitute random stock imagery.

==================================================
11. VISUAL DESIGN
==================================================

Stay consistent with Lancee's existing visual language.

The hero should feel:

- calm
- premium
- spacious
- personal
- atmospheric
- modern

NOT:

- generic SaaS dashboard
- giant KPI wall
- gaming UI
- AI chatbot page

The background should blend/fade into the application rather than appear as a
hard rectangular photograph.

Use gradients/masks/overlays where appropriate.

Ensure text remains readable regardless of image.

Responsive behaviour is required.

Desktop:
large atmospheric hero

Tablet:
reduced visual footprint

Mobile:
prioritize greeting/context and crop/hide decorative imagery intelligently

==================================================
12. CONTEXTUAL ITEMS
==================================================

Below the hero, show only a few useful "Today" items if reliable data exists.

Examples:

"2 things need your attention"

"Invoice waiting for approval"

"Project due tomorrow"

"Nothing urgent right now"

"Continue where you left off"

Use existing APIs/data.

Do not fabricate functionality.

Where an existing route/action exists, make the item actionable.

Do not build placeholder buttons that do nothing.

==================================================
13. KEEP EXISTING FUNCTIONALITY
==================================================

Do not casually delete current Overview functionality.

Determine what belongs on:

Home
vs
Analytics

Move nothing into Analytics unless necessary.

Preserve useful automation/command functionality currently available from
Home, but visually subordinate it to Workspace Pulse if appropriate.

Existing navigation must continue working.

==================================================
14. TYPES / API
==================================================

Add proper TypeScript types to src/lib/api.ts.

For example:

WorkspacePulse
WorkspacePulseMood
WorkspacePulseSource

Add a typed API client method.

Do not scatter raw fetch() calls throughout components if the existing api
abstraction should own them.

==================================================
15. SECURITY
==================================================

Never expose:

- Hermes API keys
- provider credentials
- workspace secrets
- MCP credentials
- database credentials

The server must derive workspace/user context from authenticated Lancee
middleware.

Never trust workspaceId supplied by browser input to establish authorization.

AI context should contain only the minimum information necessary to generate
the Pulse.

==================================================
16. TESTING
==================================================

Run the project's existing verification/build/test commands.

At minimum verify:

- TypeScript/build succeeds
- Home loads with AI unavailable
- Home loads with weather unavailable
- Home loads with weather available
- fallback copy works
- AI Pulse failure doesn't break Home
- malformed AI response falls back safely
- cache behaviour works
- mobile layout works
- existing Overview actions still work
- Analytics remains unaffected
- authentication/workspace boundaries remain intact

Add focused tests where the repository's current testing structure makes sense.

Do not weaken existing tests to make this feature pass.

==================================================
17. GIT
==================================================

Work ONLY on:

feature/workspace-pulse-home

Make logical commits.

Suggested commits:

feat: add workspace pulse service
feat: add contextual home experience
style: add weather-aware home atmosphere
test: verify workspace pulse fallbacks

Do not merge into main.

At completion provide:

1. Summary of architecture
2. Files changed
3. API endpoints added/changed
4. How fallback works
5. How AI generation works
6. Cache behaviour
7. Weather visual mappings
8. Tests/build results
9. Any environment/config requirements
10. Any TODOs
11. Commit hashes
12. Branch name

==================================================
DESIGN PRINCIPLE
==================================================

Lancee Home is not another dashboard.

Analytics explains the workspace.

Home understands the day.

The user should be able to open Lancee and immediately feel:

"Lancee knows what's going on."