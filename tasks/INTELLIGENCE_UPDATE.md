Implement the new **Connected Intelligence user experience** in the Lancee repo.

## IMPORTANT

Audit the existing implementation before editing.

The current Connected Intelligence logic already works and includes persisted opportunities, evidence, workspace comparisons, client attention/meeting signals and the existing “See why” evidence chain.

**Do not rewrite or weaken this intelligence engine.**
This task is primarily:

1. make Intelligence understandable to normal business users;
2. expose real Connected Intelligence inspections even when no opportunity is produced;
3. add the Lancee mascot states;
4. preserve the detailed deterministic evidence as an advanced layer.

Also avoid adding substantially more Intelligence JSX directly into the already-large `src/App.tsx`. Extract sensible components.

---

# 1. AUDIT FIRST

Inspect at minimum:

* `src/App.tsx`
* `src/index.css`
* `src/lib/api*`
* `server/index.mjs`
* existing Connected Intelligence routes/services
* opportunity persistence/schema
* mail + calendar intelligence hooks
* client attention load implementation
* meeting load implementation
* existing “See why” / evidence-chain UI
* relevant migrations / Postgres helpers
* existing verification scripts

Search repo for:

* `connected-intelligence`
* `client_attention`
* `meeting_load`
* `opportunity`
* `workspace_events`
* `comparison`
* `See why`
* `evidence`
* `finding`

Document the current request/data path briefly before changing it.

Reuse existing business logic and data wherever possible.

---

# 2. NEW INTELLIGENCE PAGE MODEL

The Intelligence tab must now have two user-facing views:

### Things I've noticed

Default tab.

Shows actual Connected Intelligence findings/opportunities in simple business language.

### Lancee activity

Shows what Connected Intelligence recently inspected, **including inspections where nothing was found**.

Mental model:

`Lancee looked → Lancee noticed → why it matters → what user can do → evidence`

NOT:

`detector → threshold → percentile → persisted event`

---

# 3. TOP LANCEE BRIEFING

Add a briefing panel at the top of Intelligence.

When findings exist:

**Here's what I've noticed**

Explain that Lancee has been looking across workspace activity and found X things worth attention.

Display useful compact stats derived from real data, e.g.:

* findings
* clients inspected
* messages reviewed
* meetings reviewed

Do not invent counts.

Use the **insight/lightbulb Lancee mascot** here.

When there are no findings:

**Everything looks good**

Explain that recent workspace activity has been checked and nothing unusual currently needs attention.

Use **all-clear Lancee**.

Do not imply Lancee inspected sources that were not actually inspected.

---

# 4. SIMPLIFY FINDING CARDS

Current technical cards expose too much implementation terminology.

Keep the underlying detector data but transform presentation.

Example:

Instead of:

`CLIENT ATTENTION LOAD`
`76.2 percentile → 75th percentile opportunity threshold`

show:

### Vanguard Construction needs more attention than usual

“Lancee noticed you've been spending considerably more time communicating and meeting with this client than you normally do with others.”

Then:

**What stood out**

* 29 conversations
* 15 meetings
* 14 meeting hours

Then:

**Why this may matter**

Use cautious language such as:

“Higher coordination can sometimes indicate changing requirements, additional support, project complexity or a high-touch client.”

Never state an inferred cause as fact.

Actions:

* `Review client` / relevant entity
* `Why did Lancee notice this?`

Do not make percentile/threshold/comparison counts dominant in the card.

They remain available in technical evidence.

---

# 5. PRESENTATION SEVERITY

Introduce user-facing presentation states if useful:

* `worth_watching`
* `needs_attention`
* `important`

These are UI classifications derived deterministically from existing signal strength/confidence where sensible.

Do not alter detector thresholds merely for presentation.

Avoid “critical” unless existing evidence truly establishes that state.

---

# 6. REDESIGN “SEE WHY”

Preserve the existing deterministic evidence chain, but make it the second layer.

Default drawer/modal:

### Why Lancee noticed this

Explain:

* what Lancee observed;
* what stood out;
* what data was compared;
* why the pattern may matter;
* explicitly distinguish evidence from possible explanations.

Example wording:

“Lancee isn't saying there is definitely a problem. This activity is simply unusual compared with how this workspace normally operates.”

Sections:

1. **What Lancee noticed**
2. **What stood out**
3. **Why it may matter**
4. **Things you could check**
5. `View technical evidence`

Only after expanding `View technical evidence`, show the existing detail such as:

* authoritative relationship
* observed workspace records
* workspace comparison set
* detector condition
* exact supporting workspace events
* percentile
* threshold
* confidence
* detector identifier

Reuse the existing evidence component/data rather than recreating the evidence logic.

---

# 7. ADD REAL INSPECTION PERSISTENCE

Add a lightweight persistence layer for Connected Intelligence inspection/activity.

Preferred table concept:

`connected_inspections`

Fields should fit existing Lancee DB conventions, approximately:

* `id`
* `workspace_id`
* `inspection_type`
* `source_type`
* `client_id` nullable
* `project_id` nullable
* `status`
* `summary`
* `records_inspected`
* `signals_found`
* `related_opportunity_id` nullable
* `metadata` JSONB
* `started_at`
* `completed_at`

Statuses can initially include:

* `inspecting`
* `all_clear`
* `signal_found`
* `opportunity_created`
* `failed`

Inspection types initially need to support at least:

* `mail`
* `calendar`
* `client`
* `project`
* `cross_source`

Follow existing migration/schema patterns.

All queries MUST remain workspace scoped.

---

# 8. INSTRUMENT EXISTING INTELLIGENCE

Do not create a fake background agent.

Instrument the **existing real intelligence execution paths**.

Conceptually:

`start inspection`
→ existing feature calculation
→ existing detector(s)
→ persist opportunity if existing logic says so
→ complete inspection

If nothing is detected:

`status = all_clear`

If opportunity is generated:

`status = opportunity_created`
and link the opportunity.

Do not create one inspection per message/event.

Group a logical inspection.

Example:

29 mail messages + thread resolution + client matching + project comparison = one useful inspection journey where appropriate.

Avoid noisy activity logs.

---

# 9. LANCEE ACTIVITY VIEW

Replace the old Decision Intelligence history UI with:

## Lancee activity

Vertical timeline of real inspections.

Examples:

**Checked your recent mail**
Reviewed 29 conversations across active clients.
✓ Nothing unusual found

**Checked recent meetings**
Reviewed recent meeting activity across linked clients.
✓ Everything looks normal

**Something caught my attention**
Vanguard Construction showed unusually high activity, so Lancee checked related workspace context.

**Connected the activity**
Mail → Client → Project → Meetings

**I found something worth looking at**
Link to the resulting finding.

Support expandable:

`See what Lancee checked`

Expanded content should use recorded metadata and show real counts only.

Example:

* ✓ 29 messages
* ✓ 8 conversations
* ✓ known client resolved
* ✓ linked project activity checked
* ✓ meeting activity compared
* Result: nothing unusual found

Do not expose raw internal event IDs in the normal activity view.

---

# 10. MASCOT ASSETS

I will provide six transparent PNG assets.

Create a stable asset convention such as:

`public/img/lancee/`

* `lancee-mail.png`
* `lancee-calendar.png`
* `lancee-investigate.png`
* `lancee-insight.png`
* `lancee-connected.png`
* `lancee-all-clear.png`

If the files are already present under different names, reuse/move them appropriately rather than duplicating.

Create a reusable component, e.g.:

`LanceeAvatar`

States:

* `mail`
* `calendar`
* `investigate`
* `insight`
* `connected`
* `all-clear`

Map activity semantics centrally rather than scattering image paths through JSX.

Use:

* large mascot in briefing;
* medium mascot in activity timeline;
* restrained mascot use on findings.

Do not turn every card into a cartoon.

Mascots should feel like a premium assistant integrated into the existing Lancee navy UI.

Use subtle CSS motion only:
floating/breathing/very small entrance animation.

Respect `prefers-reduced-motion`.

---

# 11. COMPONENT STRUCTURE

Prefer extracting the Intelligence experience rather than growing `App.tsx`.

Something along these lines is acceptable:

`src/components/intelligence/`

* `ConnectedIntelligencePage.tsx`
* `IntelligenceBriefing.tsx`
* `FindingsView.tsx`
* `FindingCard.tsx`
* `LanceeActivity.tsx`
* `InspectionActivity.tsx`
* `FindingExplanationDrawer.tsx`
* `LanceeAvatar.tsx`
* `connected-intelligence.css`

Exact names may change to suit current architecture.

Do not unnecessarily refactor unrelated App functionality.

---

# 12. API

Reuse existing Connected Intelligence endpoints.

Add only what is needed, preferably:

* `GET /api/connected-intelligence/summary`
* `GET /api/connected-intelligence/activity`
* `GET /api/connected-intelligence/activity/:id`

Use existing authenticated workspace context.

Never accept arbitrary workspace IDs from the browser where existing auth middleware already establishes workspace context.

API activity objects should ideally return semantic presentation data such as:

* type
* status
* title
* summary
* counts
* related client/project
* related opportunity
* occurred/completed time
* mascot/state key

Do not expose sensitive message bodies merely to render the timeline.

---

# 13. LANGUAGE RULES

Normal UI should NOT lead with terms such as:

* Client Attention Load
* opportunity threshold
* percentile
* comparison set
* detector condition
* persisted finding
* authoritative relationship
* persisted workspace events

Translate them into normal business language.

Technical terminology remains available under technical evidence.

Connected Intelligence must be careful about causation.

Good:

“High coordination can sometimes indicate scope changes or additional support.”

Bad:

“This client has scope creep.”

Evidence = fact.
Explanation = possibility.

Maintain that distinction throughout.

---

# 14. EMPTY / LOADING / ERROR STATES

Implement proper states for both views.

No findings is not a failure.

Use all-clear Lancee and explain that nothing unusual currently needs attention.

If no inspections exist yet, explain that Lancee has not built enough recent activity history yet.

Do not fabricate activity for visual effect.

---

# 15. MOBILE

Must work properly on mobile.

* briefing mascot must scale/reposition cleanly;
* finding cards become single-column;
* timeline remains readable;
* mascot does not cover text;
* evidence drawer becomes mobile-friendly/full-screen where appropriate;
* no horizontal overflow.

---

# 16. DO NOT BREAK

Preserve:

* existing opportunity persistence
* client attention detector
* meeting-related intelligence
* mail/calendar functionality
* workspace scoping
* existing evidence records
* current Connected Intelligence APIs unless deliberately superseded compatibly
* other dashboard routes
* Analytics page
* Hermes/workspace chat
* existing test dataset behaviour

This task is NOT a rewrite of Connected Intelligence.

---

# 17. VERIFICATION

Add focused verification/tests for:

* inspection persists when no opportunity is produced;
* inspection links correctly when an opportunity is produced;
* workspace isolation;
* summary counts;
* activity API;
* existing opportunity endpoints still work;
* existing evidence chain still resolves correctly.

Then run:

* build
* lint
* relevant existing verification scripts
* new Connected Intelligence verification

Fix regressions caused by this work.

---

# FINAL RESULT

Opening Intelligence should feel like Lancee is briefing the business owner:

**Things I've noticed**
= outcomes worth attention.

**Lancee activity**
= what Lancee has actually inspected.

The experience should flow:

`I looked → I noticed → here's why it may matter → here's what you can check → here's my evidence`

Keep all sophisticated Connected Intelligence logic underneath, but make the default experience understandable without technical knowledge.

Before coding, inspect the current implementation and adapt these instructions to the actual repository rather than blindly creating duplicate architecture.
