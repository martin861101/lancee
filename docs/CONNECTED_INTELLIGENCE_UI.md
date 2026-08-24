# Connected Intelligence UI

The Intelligence destination is a calm, user-facing briefing over the existing
Connected Intelligence engine. Phase 1B changes presentation only: detector
thresholds, inspection persistence, opportunity generation, evidence, Mail and
Calendar instrumentation, MCP behavior, and Hermes instructions remain
unchanged.

## Page model

The page renders a summary briefing followed by two local views:

- **Things I’ve noticed** is the default. It shows active persisted findings in
  deterministic, human language with factual metrics, careful possible
  explanations, and working Projects/Clients navigation.
- **Lancee activity** lists real `connected_inspections` records grouped into
  Today, Yesterday, and Earlier. Expanding a row loads its semantic detail from
  `/api/connected-intelligence/activity/:id`; only counts present in the payload
  are rendered.

The former Decision Intelligence History section is not part of this page.
Legacy decision storage and APIs are retained for compatibility.

## Briefing states

- `attention_needed` uses the insight character, reports the factual finding
  total, and explains that unusual patterns are not necessarily problems.
- `all_clear` uses the all-clear character and states that inspected recent
  activity has no current unusual result.
- `insufficient_activity` uses the investigate character and explicitly avoids
  normal/all-clear reassurance.

Briefing metrics come only from the summary contract:
`findings`, `clientsInspected`, `meetingsInspected`, and `messagesInspected`.
Zero or unavailable source metrics are not padded into the briefing.

## Finding presentation

`connected-intelligence-presentation.ts` maps detector identifiers without
changing them in storage:

- `client_attention_load` → a client “needs more attention than usual,” with a
  restrained `needs_attention` badge.
- `project_meeting_load` → a project “has had more meeting activity than usual,”
  with a restrained `worth_watching` badge.

`important` remains an available presentation state but is not assigned because
the two current detector contracts do not justify stronger severity. No ranking
or threshold logic is introduced in the frontend.

Cards lead with what happened, factual “What stood out” values, careful “Why
this may matter” copy, and contextual review/explanation actions. Detector,
percentile, threshold, comparison-set, and confidence language is hidden from
the default card.

## Evidence

The explanation drawer starts with the human observation, factual stats,
possible significance, and type-specific checks. **View technical evidence**
then reveals the existing deterministic details:

- authoritative relationship;
- observed workspace records;
- workspace comparison set;
- detector condition and identifier;
- persisted confidence and detector version; and
- exact supporting workspace-event references.

The frontend does not recalculate evidence or detector outcomes.

## Lancee characters

`LanceeAvatar` owns the six asset mappings under `public/img/lancee/`:

| State | Asset |
| --- | --- |
| `mail` | `lancee_mail.png` |
| `calendar` | `lancee_calendar.png` |
| `investigate` | `lancee_inspect.png` |
| `insight` | `lancee_idea.png` |
| `connected` | `lancee_tools.png` |
| `all-clear` | `lancee_allclear.png` |

Activity avatar selection is deterministic: opportunity results use insight,
signals/failures use investigate, Mail and Calendar inspections use their source
characters, and cross-source checks use connected. The large all-clear character
is reserved for all-clear briefing and empty states.

## Responsive and accessible behavior

The briefing, cards, stats, activity rows, and drawer reflow at 1100px, 760px,
and 470px. Narrow layouts prevent mascot/text overlap, wrap finding metrics,
make actions full-width, keep technical IDs wrapping, and reduce the activity
timeline avatar rail. Tabs implement tab roles, selected state, roving focus,
Arrow/Home/End keys, and labelled panels. Drawer and inspection disclosure
controls expose state, the drawer supports Escape and focus restoration, images
are decorative, focus indicators are visible, and motion is disabled for
`prefers-reduced-motion`.

## Verification

Run:

```bash
npm run verify:connected-intelligence-ui
npm run verify:connected-intelligence-mobile
npm run verify:connected-intelligence
npm run verify:connected-inspections
npm run build
npm run lint
```
