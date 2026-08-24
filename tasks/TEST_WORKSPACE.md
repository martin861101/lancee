You are building the reusable Connected Intelligence synthetic test-workspace
importer and benchmark for Lancee.

Repository:
martin861101/lancee

Working branch:
feature/workspace-pulse-home

Input file already exists at:

test-data/connected-intelligence/business-records.xlsx

IMPORTANT:
DO NOT ask the user to modify the spreadsheet.
DO NOT require the user to manually create a workspace.
DO NOT manually alter production/user workspaces.

You own the entire safe import lifecycle.

========================================================
MISSION
========================================================

We now have production Connected Intelligence foundations:

Phase 1:
Calendar
→ Project/Client
→ workspace_events
→ meeting features
→ project_meeting_load
→ connected_opportunities

Phase 2:
Existing Lancee Mail
→ communication observations
→ Person
→ Client
→ confirmed Project
→ workspace_events
→ communication features

Mail + Calendar
→ client_attention_load
→ connected_opportunities

We need a permanent synthetic workspace containing realistic historical
business activity so these systems can be tested against known patterns.

The spreadsheet:

test-data/connected-intelligence/business-records.xlsx

contains the source business records.

Build an automated importer around IT.

========================================================
CRITICAL PRINCIPLE
========================================================

This is NOT merely database seed data.

We are creating a controlled historical business environment through which
Lancee's Connected Intelligence can be tested.

Where existing Lancee domain functions/events exist, reuse them.

Do not populate pretty UI records while bypassing the intelligence pipeline.

The desired flow is:

business-records.xlsx
        ↓
parse + validate
        ↓
normalised fixture
        ↓
synthetic workspace
        ↓
real Lancee domain records
        ↓
workspace_events
        ↓
features
        ↓
detectors
        ↓
connected_opportunities
        ↓
benchmark report

========================================================
STAGE A — INSPECT BEFORE IMPLEMENTING
========================================================

First inspect:

- test-data/connected-intelligence/business-records.xlsx

Programmatically inspect:

- workbook sheets
- headers
- record counts
- data types
- identifiers
- relationships
- dates
- monetary fields
- clients
- projects
- meetings
- communications
- tasks
- time records
- invoices
- payments
- quotes
- revisions
- any other business objects

DO NOT assume sheet names or columns.

Then inspect the CURRENT Lancee branch.

At minimum:

- AGENT.md
- server/database.mjs
- server/index.mjs
- server/workspace-events.mjs
- server/connected-intelligence.mjs
- server/signal-engine.mjs
- server/mail.mjs
- Clients implementation
- Projects implementation
- Tasks implementation
- Calendar implementation
- Mail/communication persistence
- Time tracking implementation
- Quotes implementation
- Invoice implementation
- Payment implementation
- workspace creation logic
- current verification scripts
- docs/CONNECTED_INTELLIGENCE.md

Print an audit containing:

1. Spreadsheet structure.
2. Record counts by object.
3. Relationships represented in the spreadsheet.
4. Spreadsheet fields that map directly to Lancee.
5. Fields requiring transformation.
6. Fields Lancee currently cannot represent.
7. Missing data required by Lancee.
8. Current domain functions that should be reused.
9. Which records require controlled direct persistence because no suitable
   domain function exists.
10. How historical workspace_events should be generated.
11. Expected Connected Intelligence detector coverage.
12. Files you intend to create/change.
13. Safety strategy for creating/resetting the workspace.

Then continue unless there is a genuinely blocking ambiguity.

Do NOT stop merely because spreadsheet terminology differs from Lancee.

Map it intelligently and document the mapping.

========================================================
WORKSPACE
========================================================

The importer must create its OWN dedicated synthetic workspace.

Preferred name:

Connected Intelligence Test

Do not require it to exist beforehand.

Create a durable machine-readable marker proving this is a synthetic fixture
workspace.

Use an existing metadata mechanism if available.

If no suitable mechanism exists, implement the smallest safe mechanism.

Conceptually:

workspace purpose:
connected_intelligence_test

dataset:
business-records

dataset version:
1

DO NOT rely only on the workspace display name for destructive operations.

========================================================
OWNERSHIP
========================================================

The test workspace still needs valid Lancee ownership/membership.

Inspect existing workspace creation logic.

Associate the synthetic workspace with the user/account executing the seed
using the normal membership model.

Do not create fake authentication shortcuts.

Do not weaken workspace authorization.

========================================================
SAFETY
========================================================

This is extremely important.

The reset command must NEVER delete an ordinary workspace.

Destructive reset is allowed ONLY when the target workspace carries the
explicit synthetic fixture marker created by this importer.

Before deletion/reset verify:

- expected synthetic marker
- expected dataset identifier
- workspace ownership/context where applicable

If verification fails:

ABORT.

Never implement:

DELETE FROM workspaces WHERE name = 'Connected Intelligence Test'

as the safety mechanism.

Never TRUNCATE shared tables.

Never delete all clients/projects/etc.

========================================================
NORMALISED FIXTURE
========================================================

Do not make runtime seeding permanently dependent on Excel parsing if a
versioned fixture is more maintainable.

Preferred architecture:

business-records.xlsx
        ↓
fixture conversion
        ↓
test-data/connected-intelligence/business-records.v1.json
        ↓
workspace seeder

The original XLSX remains the source reference.

The JSON fixture becomes deterministic/versionable.

However:

Do not blindly convert cells.

Normalise relationships.

Use stable fixture references.

Example:

{
  "ref": "client_acme",
  "name": "Acme Ltd"
}

Project:

{
  "ref": "project_acme_website",
  "clientRef": "client_acme"
}

Meeting:

{
  "ref": "meeting_acme_kickoff",
  "projectRef": "project_acme_website",
  "participantRefs": [...]
}

Actual Lancee UUIDs are generated during import.

Maintain an internal:

fixtureRef → Lancee ID

map.

========================================================
DATES
========================================================

Historical chronology is CRITICAL.

Preserve the spreadsheet's original historical relationships wherever
possible.

Do NOT replace historical timestamps with NOW.

We need realistic ordering:

client created
      ↓
project
      ↓
communication
      ↓
meeting
      ↓
work/time
      ↓
completion
      ↓
invoice
      ↓
payment

Preserve:

occurred_at
sent/received dates
meeting dates
project dates
invoice dates
payment dates
time-entry dates

where represented.

If the spreadsheet contains chronology contradictions:

DO NOT silently "fix" them.

Record them as data-quality findings unless clearly caused by a parsing
problem.

Connected Intelligence needs to be tested against imperfect data too.

========================================================
PEOPLE / CONTACTS
========================================================

Reuse the Phase 2:

connected_people

identity architecture.

Spreadsheet contacts/emails should resolve to canonical workspace-scoped
People.

Where Mail and Calendar contain the same email address:

they should resolve to the SAME Person.

Test this explicitly.

========================================================
CLIENTS
========================================================

Create clients through existing Lancee domain logic where practical.

Preserve stable fixture references.

Ensure all Person → Client relationships remain workspace scoped.

========================================================
PROJECTS
========================================================

Create projects with correct:

- client
- lifecycle state
- dates
- values/estimates where represented
- other relevant spreadsheet attributes

Remember:

Phase 1 established that `Ready` is currently Lancee's historical/completed
project state.

Do not arbitrarily rewrite lifecycle semantics.

========================================================
CALENDAR / MEETINGS
========================================================

Import historical meetings through the SAME authoritative path expected by
Phase 1 where practical.

They must contribute to:

meeting.created
meeting.completed

and meeting features.

Historical meetings already in the past should end in a state consistent
with completed meetings.

Avoid depending on the live completion scheduler to process hundreds of
historical fixture meetings one-by-one if a safe historical ingestion path
is appropriate.

But preserve the same canonical event semantics.

Idempotency is required.

========================================================
COMMUNICATION
========================================================

IMPORTANT:

DO NOT send synthetic emails through the real Xneelo mailbox.

DO NOT use SMTP.

DO NOT pollute the user's actual mailbox.

Synthetic historical communication should enter through the canonical
communication observation layer created in Phase 2.

Populate:

communication_messages

using the same metadata/provenance semantics.

Generate canonical:

communication.received
communication.sent

workspace events.

Do NOT create a parallel fake communication analytics path.

Use synthetic source provenance, e.g. fixture/import, so these records can
be distinguished operationally while remaining equivalent intelligence
observations.

No real credentials.

No SMTP.

No IMAP writes.

========================================================
TIME
========================================================

If the spreadsheet contains time/work records:

map them to Lancee's authoritative existing representation.

Preserve:

- project
- duration
- date
- user where applicable
- provenance

If Lancee lacks an appropriate domain operation, implement the narrowest safe
fixture import mechanism.

Do not invent time records merely to satisfy future detectors unless the
spreadsheet explicitly lacks them and synthetic augmentation is deliberately
documented.

========================================================
INVOICES / PAYMENTS / QUOTES
========================================================

Import the financial records represented by the spreadsheet.

Preserve:

- client
- project where available
- amounts
- issue dates
- due dates
- payment dates
- status
- quote outcome
- invoice/payment relationship

Do not trigger:

- real payment providers
- real invoice emails
- real webhooks
- real accounting connectors
- external side effects

This is fixture ingestion.

However, internally produce the same authoritative Lancee records/events
needed for Connected Intelligence.

========================================================
SIDE-EFFECT FIREWALL
========================================================

Synthetic workspace import MUST NOT:

- send email
- create external calendar events
- charge payments
- contact clients
- invoke webhooks
- call external accounting providers
- send notifications to synthetic people
- invoke Hermes
- invoke external automations
- trigger production integrations

Internal Lancee event generation is desired.

External side effects are forbidden.

========================================================
IDEMPOTENCY
========================================================

Running:

npm run seed:ci

twice must NOT duplicate the workspace/data.

Choose safe behaviour:

- detect existing matching fixture workspace and abort with instructions

OR

- perform idempotent reconciliation

For development convenience provide:

npm run seed:ci -- --reset

`--reset` must:

1. find the workspace using its explicit synthetic marker
2. verify marker + dataset
3. safely remove ONLY that fixture workspace/data
4. recreate it
5. reseed deterministic data
6. rerun verification

========================================================
DRY RUN
========================================================

Provide:

npm run seed:ci -- --dry-run

Dry run should:

- parse fixture
- validate relationships
- validate mappings
- show intended counts
- show warnings
- perform NO database writes

Example:

Connected Intelligence Fixture v1

Clients:          8
People:          14
Projects:        31
Meetings:        96
Communications: 428
Time entries:   214
Invoices:        38
Payments:        35

Warnings: 2

No changes made.

======================================================== BENCHMARK GROUND TRUTH

This is not merely a demo workspace.

It should become a Connected Intelligence benchmark.

Inspect the spreadsheet and identify patterns intentionally represented by the data.

At minimum determine whether sufficient data exists to exercise:

project_meeting_load

client_attention_load

Do not invent expected results merely to make tests green.

If the dataset genuinely contains a clear expected pattern, add it to a ground-truth section in the normalised fixture.

Conceptually:

"expectedOpportunities": [ { "detector": "project_meeting_load", "subjectRef": "..." }, { "detector": "client_attention_load", "subjectRef": "..." } ]

Also support expected NON-opportunities if useful.

Example:

{ "detector": "client_attention_load", "subjectRef": "client_control", "expected": false }

This helps detect false positives.

======================================================== DO NOT CHEAT

The detector must NEVER read expectedOpportunities.

Ground truth is ONLY for benchmark comparison.

Architecture:

fixture records ↓ Lancee ↓ Connected Intelligence ↓ actual opportunities

SEPARATELY:

expected opportunities ↓ benchmark comparator

Then compare:

expected vs actual.

Never:

expected opportunity ↓ insert connected_opportunity

That invalidates the test.

======================================================== BENCHMARK COMMAND

Provide something equivalent to:

npm run benchmark:ci

It should inspect the designated synthetic workspace and report:

CONNECTED INTELLIGENCE BENCHMARK

Dataset: business-records.v1

Records

People Clients Projects Meetings Messages Time entries Invoices Payments

Intelligence

Expected opportunities Detected opportunities True positives False positives False negatives

Detectors

project_meeting_load       PASS/FAIL client_attention_load      PASS/FAIL

Evidence integrity         PASS/FAIL Workspace isolation        PASS/FAIL

Do not hide false positives.

======================================================== DATA QUALITY REPORT

Generate useful fixture diagnostics.

Examples:

orphan project

missing client

invalid payment chronology

invoice before project

meeting with unknown attendee

duplicate source ID

unknown fixtureRef

malformed email

impossible duration

ambiguous relationship


The importer should fail on structural integrity errors.

It may warn on intentionally imperfect business data where Lancee can safely represent it.

======================================================== CONNECTED INTELLIGENCE VERIFICATION

After seeding:

Verify that historical fixture records genuinely flow into the current algorithms.

At minimum:

1. workspace exists and is marked synthetic


2. expected client count


3. expected Person count


4. Person identity shared between Mail + Calendar


5. expected project count


6. meetings exist


7. meeting.completed events exist


8. communication events exist


9. workspace event timestamps preserve history


10. communication features return fixture data


11. meeting features return fixture data


12. project_meeting_load executes


13. client_attention_load executes


14. opportunity evidence points to fixture-generated authoritative events


15. opportunities are deduplicated


16. no external Mail send occurred


17. no external Calendar event occurred


18. no external payment action occurred


19. reset cannot target a normal workspace


20. reseed produces deterministic counts



======================================================== EXISTING REGRESSION TESTS

Run relevant existing verification including:

npm run verify:connected-intelligence npm run verify:signals npm run verify:dynamics npm run verify:decision-phase2 npm run verify:decision-phase3 npm run verify:mcp

Also run relevant Mail/Calendar verification.

Then:

npm run build npm run lint git diff --check

Clearly distinguish:

PASS FAIL NOT RUN ENVIRONMENT BLOCKED

======================================================== FILES

Prefer placing fixture tooling somewhere obvious, e.g.:

scripts/ test-data/connected-intelligence/

Do not put test fixture parsing into production request handlers.

Likely outputs may include:

test-data/connected-intelligence/business-records.v1.json test-data/connected-intelligence/README.md scripts/seed-connected-intelligence.mjs scripts/benchmark-connected-intelligence.mjs

These are suggestions.

Follow repository conventions where better.

======================================================== DOCUMENTATION

Document:

npm run seed:ci -- --dry-run npm run seed:ci npm run seed:ci -- --reset npm run benchmark:ci

Explain:

purpose

fixture location

source XLSX

synthetic workspace marker

mapping rules

side-effect firewall

reset safety

expected opportunities

known fixture limitations


Update docs/CONNECTED_INTELLIGENCE.md where appropriate.

======================================================== IMPORTANT FUTURE USE

Design this so future Connected Intelligence detectors can add benchmark expectations without rewriting the importer.

Future detectors may include:

client_value_efficiency late_payment_risk service_line_efficiency scope_change_risk invoice_timing_cashflow automation_candidate

The fixture/benchmark architecture should accommodate them.

DO NOT implement those detectors now.

======================================================== DO NOT

Do not ask the user to create the workspace manually.

Do not modify the XLSX manually.

Do not seed production workspaces.

Do not identify reset targets by display name alone.

Do not TRUNCATE shared tables.

Do not send synthetic emails.

Do not modify the real Xneelo mailbox.

Do not create external calendar events.

Do not trigger payments.

Do not trigger webhooks.

Do not trigger Hermes.

Do not trigger production automations.

Do not create a second intelligence pipeline.

Do not create fake opportunities.

Do not modify detectors to match expected fixture output.

Do not replace workspace_events.

Do not create a graph database.

Do not introduce ML.

Do not redesign existing Lancee features.


======================================================== FINAL REPORT

At completion report:

1. Spreadsheet analysis.


2. Normalised fixture structure.


3. Workspace creation strategy.


4. Synthetic marker strategy.


5. Exact import mapping.


6. Historical event strategy.


7. External side-effect protections.


8. Files created/changed.


9. npm commands added.


10. Record counts imported.


11. Data-quality warnings/errors.


12. Expected opportunities.


13. Actual opportunities.


14. True positives.


15. False positives.


16. False negatives.


17. Detector benchmark results.


18. Regression test results.


19. Reset/reseed verification.


20. Known limitations.



Finally print the exact commands I should run locally to:

A. inspect without changing anything

B. create the test workspace

C. benchmark Connected Intelligence

D. completely reset and rebuild ONLY the synthetic test workspace

Do not claim success unless the fixture was actually parsed and the relevant verification passed.

One extra benefit of doing it this way: **keep `business-records.xlsx` permanently**. It becomes the human-readable source dataset, while the generated JSON becomes the deterministic machine fixture. That gives us a repeatable benchmark as Connected Intelligence gets more sophisticated.
