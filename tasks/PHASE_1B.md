You are working directly in the Lancee repository.

PHASE 0 and PHASE 1A ARE COMPLETE.

Phase 1A added the backend foundation:

- connected_inspections
- real Mail/Calendar/detector inspection instrumentation
- GET /api/connected-intelligence/summary
- GET /api/connected-intelligence/activity
- GET /api/connected-intelligence/activity/:id
- typed frontend API support
- Connected Intelligence MCP/Hermes contract
- attention_needed / all_clear / insufficient_activity states

DO NOT redesign or rewrite that backend.

THIS PHASE IS THE HUMAN-FACING CONNECTED INTELLIGENCE REDESIGN.

==================================================
GOAL
==================================================

Transform the current technical Intelligence screen into something a normal freelancer/small-business owner immediately understands.

Current experience exposes too much of Lancee's internal reasoning:

- percentiles
- thresholds
- detector terminology
- comparison sets
- technical evidence
- Decision Intelligence History

New mental model:

LANCEE LOOKED
      ↓
LANCEE NOTICED
      ↓
WHY IT MAY MATTER
      ↓
WHAT YOU CAN CHECK
      ↓
EVIDENCE IF YOU WANT IT

The page should feel like Lancee is briefing the user, NOT like a BI/debugging dashboard.

==================================================
1. AUDIT CURRENT PHASE 1A STATE
==================================================

Before changing anything inspect:

- src/components/intelligence/ConnectedIntelligencePage.tsx
- src/components/intelligence/connected-intelligence.css
- typed Connected Intelligence API client
- summary API contract
- activity API contract
- activity detail contract
- current findings/opportunities
- current filters
- current See Why/evidence drawer
- current Decision Intelligence History section
- existing responsive styles
- AppIcon / BrandMark primitives
- actual Lancee mascot assets if already present

Run/search the current implementation before coding.

Do NOT move Intelligence back into App.tsx.

Further split ConnectedIntelligencePage into focused components as appropriate.

==================================================
2. REMOVE DECISION INTELLIGENCE HISTORY FROM THIS UI
==================================================

Remove the old user-facing:

Decision Intelligence History

section from the Connected Intelligence page.

Do NOT delete legacy backend storage/APIs merely because this UI no longer uses them.

Replace this concept with:

Lancee activity

powered by the REAL connected_inspections/activity API from Phase 1A.

Do not show both old history and new activity.

==================================================
3. PAGE STRUCTURE
==================================================

Implement this hierarchy:

CONNECTED INTELLIGENCE

[ Lancee Briefing ]

[ Things I've noticed ] [ Lancee activity ]

Default:
Things I've noticed

The page should not immediately overwhelm the user with analytics.

Keep the existing Lancee navy/blue visual language and premium dashboard styling.

Do not make this look like a children's app.

==================================================
4. LANCEE BRIEFING
==================================================

Create:

IntelligenceBriefing

Use REAL summary API data.

ATTENTION_NEEDED:

Heading:

"Here's what I've noticed"

Example supporting language:

"I've been looking across your work and found 4 things that may be worth your attention."

Important secondary explanation:

"These aren't necessarily problems. They're patterns that look different from how your workspace normally operates."

Use the insight/lightbulb Lancee character.

Show a restrained compact summary using only factual available values, e.g.:

4 worth looking at
15 clients checked
207 meetings reviewed
311 messages reviewed

Only render metrics actually supported by the API.

Do NOT fabricate missing values.

--------------------------------------------------

ALL_CLEAR:

Use all-clear Lancee.

Heading:

"Everything looks good"

Explain that Lancee inspected recent activity and nothing unusual currently needs attention.

Only mention sources actually represented by inspection data.

Example:

"I've checked your recent workspace activity and nothing unusual needs your attention right now."

--------------------------------------------------

INSUFFICIENT_ACTIVITY:

Do NOT say everything is normal.

Use investigate or neutral Lancee.

Heading:

"I'm still getting the picture"

Example:

"There isn't enough recent workspace activity yet for me to identify meaningful patterns."

Explain that Lancee will become more useful as connected work accumulates.

No fake positive reassurance.

==================================================
5. PRIMARY VIEWS
==================================================

Directly beneath briefing create a polished two-option segmented/tab control:

Things I've noticed
Lancee activity

Default to Things I've noticed.

This is NOT primary app navigation.
It is local Intelligence page state.

Optionally show factual counts:

Things I've noticed · 4
Lancee activity · 12

Do not make it look like developer tabs.

==================================================
6. THINGS I'VE NOTICED
==================================================

Redesign existing opportunity/finding cards.

The user should immediately understand:

WHAT happened?
WHY should I care?
WHAT can I do?

Do not lead with detector terminology.

Example existing concept:

CLIENT ATTENTION LOAD
High coordination attention for Vanguard Construction
92.9 percentile → 75 percentile threshold

New:

NEEDS ATTENTION

Vanguard Construction needs more attention than usual

"Lancee noticed you've been spending considerably more time communicating and meeting with this client than you normally do with others."

Then:

WHAT STOOD OUT

29 conversations
15 meetings
14 meeting hours

Use clean icon/stat presentation.

Then:

WHY THIS MAY MATTER

"More coordination isn't necessarily a problem. It can sometimes happen because of changing requirements, additional support, project complexity or a high-touch client."

Then contextual actions:

Review client
Why did Lancee notice this?

Use actual existing navigation capabilities where available.

Do not create dead buttons.

==================================================
7. HUMAN-FRIENDLY FINDING LANGUAGE
==================================================

Create a deterministic presentation layer/helper that maps existing finding types to understandable language.

Do NOT modify detector IDs/storage merely for UI wording.

For example:

client_attention_load
→ "Client needs more attention than usual"

project_meeting_load
→ "This project has had more meeting activity than usual"

Keep this deterministic.

Do NOT call an LLM to generate card copy.

Normal UI should avoid leading with:

Client Attention Load
Project Meeting Load
opportunity threshold
percentile
detector
comparison set
persisted finding
authoritative relationship
workspace event

Those remain available in technical evidence.

==================================================
8. PRESENTATION SEVERITY
==================================================

Where existing data safely supports it, map findings to user-facing presentation states such as:

worth_watching
needs_attention
important

Do not alter detector thresholds.

Do not exaggerate severity.

Avoid "critical" unless actual existing semantics justify it.

Use subtle badges rather than alarming red dashboards.

==================================================
9. FINDING CARD LAYOUT
==================================================

Cards should be easier to scan than the current dense technical cards.

Desktop:
Use responsive cards/grid where appropriate.

Cards should contain:

severity
human title
short explanation
What stood out
Why this may matter
actions

Avoid huge walls of text.

Keep strong whitespace and hierarchy.

If one finding is materially more important than others, styling may distinguish it, but do not invent ranking logic.

==================================================
10. WHY DID LANCEE NOTICE THIS?
==================================================

Redesign the existing See Why drawer.

DO NOT delete its deterministic evidence capabilities.

Instead implement progressive disclosure.

Default drawer:

WHY LANCEE NOTICED THIS

Human explanation of what was observed.

Then:

WHAT STOOD OUT

Factual metrics.

Then:

WHY IT MAY MATTER

Careful interpretation.

Then:

THINGS YOU COULD CHECK

Contextual suggestions such as:

- whether extra meetings were expected
- whether requirements changed
- whether additional client support was required
- whether project complexity increased

Only show suggestions appropriate to the finding type.

These are checks, not claims.

Then:

View technical evidence

==================================================
11. TECHNICAL EVIDENCE
==================================================

"View technical evidence" expands/reveals the EXISTING detailed evidence UI.

Preserve information such as:

- authoritative relationship
- observed workspace records
- workspace comparison set
- detector condition
- supporting workspace events
- percentile
- threshold
- confidence
- detector identifier

Reuse existing data and evidence components.

Do NOT recreate evidence calculations in frontend code.

Technical users should still be able to inspect exactly why the deterministic finding fired.

The redesign HIDES complexity by default.
It does NOT remove explainability.

==================================================
12. LANCEE ACTIVITY
==================================================

Build the second view from the Phase 1A activity APIs.

This completely replaces old Decision Intelligence History in this page.

Use a vertical activity timeline.

Group by friendly time periods where useful:

Today
Yesterday
Earlier

Each activity represents REAL persisted inspection data.

Examples:

[MAIL LANCEE]

Checked your recent mail

"Reviewed 29 recent messages across your workspace."

✓ Nothing unusual found

10:42

--------------------------------------------------

[CALENDAR LANCEE]

Checked recent meetings

"Looked across recent meeting activity."

✓ Everything looks normal

10:41

--------------------------------------------------

[INVESTIGATE LANCEE]

Something caught my attention

"Vanguard Construction showed unusually high activity, so I took a closer look."

--------------------------------------------------

[CONNECTED LANCEE]

Connected the activity

"Communication and meeting activity pointed to the same client."

--------------------------------------------------

[INSIGHT LANCEE]

I found something worth looking at

"Vanguard Construction is requiring more coordination than usual."

[View finding]

IMPORTANT:

Copy must be generated deterministically from real activity data.

Do not make claims unsupported by the activity payload.

==================================================
13. ACTIVITY DETAIL
==================================================

Each appropriate activity should support:

See what Lancee checked

Expand inline or use a lightweight detail treatment.

Use activity detail API.

Example:

Lancee checked:

✓ 29 messages
✓ 8 conversations
✓ 5 known contacts
✓ 3 clients
✓ 2 linked projects
✓ recent meeting activity

Result:

Nothing unusual found.

OR:

Result:

Coordination activity was unusually high.

[View finding]

ONLY render counts actually present.

Do not infer missing counts.

Do not expose raw IDs.

==================================================
14. ACTIVITY STATUS LANGUAGE
==================================================

Map backend states into normal language.

all_clear:
"Nothing unusual found"
"Everything looks normal"

Use only when Phase 1A summary/activity state establishes that.

opportunity_created:
"I found something worth looking at"

signal_found:
"Something caught my attention"

failed:
Do not dramatise.

Example:
"Couldn't complete this check"

Optionally provide retry only if an actual safe retry mechanism already exists.

inspecting:
"Checking workspace activity…"

if such rows can realistically appear while the page is open.

==================================================
15. LANCEE MASCOT ASSETS
==================================================

We created SIX transparent Lancee character images specifically for this feature.

Locate them in the repository first.

If they have not yet been copied into the repo, DO NOT fabricate replacements.

Report the expected asset paths and implement the component so the supplied images can be dropped in.

Preferred convention:

public/img/lancee/

lancee-mail.png
lancee-calendar.png
lancee-investigate.png
lancee-insight.png
lancee-connected.png
lancee-all-clear.png

If equivalent files already exist under different names, reuse them.

Create a reusable:

LanceeAvatar

with states:

mail
calendar
investigate
insight
connected
all-clear

Centralise the mapping.

Do not scatter image paths through components.

==================================================
16. AVATAR USAGE
==================================================

Use characters intentionally.

BRIEFING:
large character, approximately 130–180px desktop depending on actual composition.

ACTIVITY:
medium character, approximately 70–110px.

FINDINGS:
restrained use.
Do NOT put a giant mascot on every finding card.

EMPTY/ALL CLEAR:
all-clear Lancee can be prominent.

The transparent character may visually overlap/peek outside card boundaries where tasteful.

Ensure no clipping.

The mascot should make Lancee feel alive without turning the business platform childish.

==================================================
17. MASCOT MOTION
==================================================

Use subtle CSS only.

Examples:

- tiny float
- very slight breathing movement
- soft entrance
- small hover response

NO:
- bouncing continuously
- cartoon explosions
- aggressive spinning
- distracting movement

Respect:

prefers-reduced-motion

Do not add animation libraries just for this.

==================================================
18. EMPTY STATES
==================================================

THINGS I'VE NOTICED — ALL CLEAR:

Use all-clear Lancee.

"Nothing needs your attention right now."

Explain that Lancee has checked recent activity and will continue watching.

Only if supported by actual summary state.

--------------------------------------------------

INSUFFICIENT ACTIVITY:

Use investigate/neutral Lancee.

"I'm still getting the picture."

Explain that more connected workspace activity is required.

Do NOT display:

"Everything looks good."

--------------------------------------------------

ACTIVITY EMPTY:

"Lancee hasn't completed any recent inspections yet."

Explain naturally.

Do not fabricate example activity rows.

==================================================
19. FILTERING
==================================================

Review current finding filters.

Keep filters useful to a normal user.

Avoid exposing detector names as primary filter labels.

Prefer concepts such as:

All
Clients
Projects
Communication
Meetings

Only include filters actually supported by existing data.

Do not remove useful functionality simply because cards are simplified.

==================================================
20. RESPONSIVE / MOBILE
==================================================

The page must be genuinely responsive.

On mobile:

- briefing stacks cleanly
- mascot scales/repositions
- no mascot overlaps text
- tabs remain usable
- finding cards become single column
- What stood out metrics wrap cleanly
- activity timeline remains readable
- evidence drawer becomes appropriate for small screens
- technical evidence does not horizontally overflow
- touch targets remain usable

Test narrow widths.

==================================================
21. ACCESSIBILITY
==================================================

Mascot images are decorative unless conveying state not otherwise represented.

Use appropriate alt/aria handling.

Tabs/segmented controls must be keyboard accessible.

Expandable activity/evidence controls must expose state.

Maintain readable contrast.

Respect reduced motion.

Do not rely solely on colour for severity/status.

==================================================
22. COMPONENT ARCHITECTURE
==================================================

Do NOT rebuild this inside one giant ConnectedIntelligencePage.

Prefer focused components under:

src/components/intelligence/

Likely structure:

ConnectedIntelligencePage.tsx
IntelligenceBriefing.tsx
IntelligenceViewTabs.tsx
FindingsView.tsx
FindingCard.tsx
LanceeActivity.tsx
InspectionActivity.tsx
FindingExplanationDrawer.tsx
LanceeAvatar.tsx
connected-intelligence.css

Exact names may adapt to current architecture.

Keep data orchestration reasonably high and presentation components focused.

Do not introduce a new state-management library.

==================================================
23. DO NOT TOUCH THE ENGINE
==================================================

Phase 1B should NOT alter:

- connected_inspections schema
- detector thresholds
- workspace_events
- opportunity generation logic
- opportunity deduplication
- mail intelligence instrumentation
- calendar intelligence instrumentation
- MCP intelligence behaviour
- Hermes intelligence instructions

If frontend data exposes a genuine API deficiency, make the SMALLEST compatible backend adjustment necessary and document it.

Do not casually modify Phase 1A.

==================================================
24. VISUAL DIRECTION
==================================================

Maintain Lancee's existing design system:

- navy/dark blue
- clean surfaces
- subtle borders
- restrained gradients
- premium SaaS feel
- strong whitespace
- soft depth
- existing typography

This should feel:

intelligent
calm
approachable
trustworthy

NOT:

enterprise BI dashboard
debug console
children's cartoon dashboard
generic AI purple-gradient interface

The Lancee characters provide warmth.
The rest of the UI should remain sophisticated.

==================================================
25. IMPORTANT COPY PRINCIPLE
==================================================

The page should consistently distinguish:

FACT:
"This client has required more coordination than usual."

from:

POSSIBLE EXPLANATION:
"This can sometimes happen because of changing requirements, additional support or project complexity."

Never convert correlation into causation.

Do not make business accusations.

==================================================
26. VERIFY
==================================================

Add/update focused UI verification.

Verify at minimum:

A. attention_needed summary
- briefing correctly reports findings
- insight Lancee state
- findings visible

B. all_clear
- all-clear Lancee
- no false warning
- correct explanation

C. insufficient_activity
- does NOT say everything is normal
- neutral/investigate state

D. finding card
- human title
- technical detector language hidden by default
- factual metrics correct

E. explanation drawer
- human explanation first
- technical evidence still accessible
- existing evidence preserved

F. activity
- real activity renders
- no Decision Intelligence History visible
- correct avatar mapping
- opportunity links work

G. activity with missing optional counts
- does not render invented/zero placeholders misleadingly

H. mobile layout
- no obvious overflow

I. build/typecheck

J. lint

K. existing Connected Intelligence verification

L. Phase 1A connected-inspection verification

M. git diff --check

Do not weaken tests merely to make them pass.

==================================================
27. FINAL REPORT
==================================================

Report:

1. Files created.
2. Files modified.
3. Components extracted/created.
4. How findings were translated into human language.
5. How severity mapping works.
6. How Lancee avatar states map to activity.
7. Whether all six supplied assets were found and their paths.
8. How all_clear vs insufficient_activity renders.
9. How technical evidence was preserved.
10. Confirmation that Decision Intelligence History is gone from the current Intelligence UI.
11. Mobile/accessibility work.
12. Verification results.
13. Any backend adjustment made and why.
14. Anything intentionally deferred.

IMPORTANT:

Do not redesign unrelated Lancee pages.

Do not continue into additional Connected Intelligence features.

Complete and verify Phase 1B, then STOP.