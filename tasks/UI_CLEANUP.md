You are working directly in the Lancee repository.

GOAL:
Perform a controlled frontend structural refactor BEFORE we continue developing Connected Intelligence.

This is STRUCTURAL ONLY.

Do not redesign anything.
Do not add features.
Do not modify backend behaviour.
Do not change API contracts.
Do not change Connected Intelligence logic.
Do not intentionally change the rendered UI.

The application must behave and look the same when finished.

FIRST: AUDIT
Inspect the current frontend, especially:

- src/App.tsx
- src/index.css
- src/components/
- src/components/dashboard/
- src/lib/api*
- routing/page selection
- authentication/session state
- workspace state/switching
- lazy imports
- modals
- global/shared components

Identify the major page-sized components currently implemented directly inside App.tsx and feature-specific CSS currently living in index.css.

Do not blindly extract everything.

TARGET ARCHITECTURE

App.tsx should progressively become the application shell responsible primarily for:

- authentication
- workspace/session orchestration
- page/navigation state
- top-level layout
- lazy page loading
- genuinely global modals/state

Page implementations should live under components.

PRIORITY EXTRACTIONS

Focus on code that gives us a clean boundary for upcoming Connected Intelligence work.

1. Extract the current Connected Intelligence page/UI from App.tsx into:

src/components/intelligence/

Use sensible components/files based on the existing implementation.

At minimum establish a dedicated:

ConnectedIntelligencePage.tsx

Do NOT redesign it yet.
Move the EXISTING implementation intact.

2. Extract other obviously large page-sized sections from App.tsx where doing so is low-risk, particularly Overview/Home if it is currently inline.

Do not refactor unrelated working components merely for architectural purity.

3. CSS

Move Connected Intelligence-specific styles out of the giant src/index.css into something like:

src/components/intelligence/connected-intelligence.css

If Overview or another extracted page has a clearly isolated large CSS section, it may also receive its own stylesheet.

Keep genuinely global:
- design tokens
- resets
- typography
- shared buttons
- shared layout primitives
- app shell/navigation styles

Do not perform a giant CSS rewrite.

4. LAZY LOADING

Follow the pattern Lancee already uses for pages.

ConnectedIntelligencePage and other appropriate extracted pages should be lazy-loaded where consistent with the current architecture.

Preserve existing loading/Suspense behaviour.

5. DEPENDENCIES / STATE

Do not duplicate business state inside extracted components.

Pass only the props/callbacks actually required.

If an extracted page needs several existing App-level values, define a clean typed props interface.

Do NOT introduce a new state-management library.

Do NOT introduce React Context simply to avoid passing a few props.

Do not change API fetching behaviour unless required to preserve the existing page after extraction.

6. CONNECTED INTELLIGENCE

This phase must preserve EXACTLY the existing:

- findings/opportunities
- cards
- filtering
- evidence drawer
- “See why”
- detector/evidence presentation
- API calls
- workspace scoping
- loading/error/empty states

We are creating a clean component boundary now so that the NEXT phase can redesign this experience.

Do not implement:
- Lancee Activity
- connected_inspections
- mascot/avatar UI
- new briefing
- simplified findings
- new APIs

Those belong to Phase 1.

7. APP.TSX

Do not chase an arbitrary line-count target.

The goal is simply that App.tsx stops owning major feature implementations that belong elsewhere.

After extraction it should be noticeably smaller and easier to understand.

Do not destabilise auth, workspace switching, navigation, Hermes chat, integrations, billing or other unrelated systems.

8. INDEX.CSS

Likewise, do not attempt to completely modularise the entire stylesheet.

Only extract clearly feature-owned CSS associated with components being moved.

Avoid changing selectors unnecessarily because visual parity is required.

9. CLEANUP

After moving code:

- remove dead imports
- remove duplicated types/helpers
- remove orphaned CSS
- preserve shared helpers where appropriate
- ensure imports remain clean
- avoid circular dependencies

Do not delete code unless you have verified it became unused because of this refactor.

10. VERIFY

Run the project's existing:

- build
- lint/typecheck if configured
- relevant tests/verification scripts

Specifically verify:

- authentication
- dashboard shell
- navigation
- workspace switching
- Overview
- Connected Intelligence
- opportunity cards
- See why/evidence drawer
- Analytics
- Messages
- Files
- Hermes Workspace Chat

No behavioural or visual regressions should be introduced.

FINAL REPORT

When finished, report:

1. Files created
2. Files modified
3. Major components extracted
4. Approximate App.tsx size before/after
5. Approximate index.css size before/after
6. Anything intentionally left in App.tsx and why
7. Build/test results
8. Any existing issues discovered but NOT changed

IMPORTANT:
Do not continue into the Connected Intelligence redesign.

STOP after Phase 0 is complete and verified.

This should leave us with a clean boundary for Phase 1:
Connected Intelligence UX + Lancee inspection/activity system.