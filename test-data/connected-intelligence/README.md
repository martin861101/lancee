# Connected Intelligence synthetic workspace

`business-records.xlsx` is the permanent human-readable source dataset.
`business-records.v1.json` is its deterministic, normalized machine fixture.
The JSON is generated; do not edit either file to make detector results pass.

## Commands

```bash
# Rebuild the versioned JSON after intentionally changing the XLSX source.
npm run fixture:ci

# Validate and inspect without opening or changing the database.
npm run seed:ci -- --dry-run

# Create the dedicated workspace for ADMIN_EMAIL (or CI_FIXTURE_OWNER_EMAIL).
npm run seed:ci

# Compare real detector output with separate fixture ground truth.
npm run benchmark:ci

# Delete and rebuild only the exactly marked fixture workspace.
npm run seed:ci -- --reset

# Exercise dry-run, seed, duplicate rejection, benchmark, reset, reseed, and safety.
npm run verify:ci-fixture
```

The database commands load the existing server-only `.env`. They operate on the
same `DATABASE_PATH`/PostgreSQL configuration as Lancee and require the selected
owner to be an existing active user. They never create an authentication
shortcut or a fake user.

## Marker and reset safety

The importer creates `Connected Intelligence Test` itself and records a durable
`workspace_fixture_markers` row containing:

- `purpose = connected_intelligence_test`
- `dataset = business-records`
- `dataset_version = 1`
- the XLSX SHA-256
- the existing owner user ID

The display name is not a safety boundary. A normal run aborts when the exact
fixture exists. `--reset` verifies marker purpose, dataset, version, source hash,
owner ID, and owner membership before deleting that one resolved workspace ID.
Workspace foreign keys cascade its records. Shared tables are never truncated.

## Normalization and mapping

Every source object has a stable fixture `ref`; the importer creates Lancee IDs
and stores the mapping in `workspace_fixture_refs`.

| Source | Lancee representation | Key transformation |
| --- | --- | --- |
| Clients | `clients` + `client.created` | Source company/industry retained as fixture metadata |
| Projects | `projects` + project events | `Completed` maps to Lancee `Ready`; dates/value retained |
| Quotes | `quotes` + quote events | Row-based refs preserve duplicate source quote labels |
| Invoices | `invoices` + invoice events | `provider=fixture`; no payment link/provider action |
| Payments | `workspace_payments` + payment events | Workspace/invoice scoped; no webhook/provider action |
| Time | `time_entries` | Hours become integer minutes |
| Approvals | `project_approval_records` + project update event | Source timestamp preserved |
| Emails | canonical `communication_messages` + communication events | Fixture-only provenance; no IMAP/SMTP |
| Meetings | `calendar_events` + meeting created/completed events | Date-only source uses documented 09:00 UTC |
| Revisions | `project_change_records` + project update event | Change count preserved |
| Tasks | `project_tasks` + task events | Created/due/completed dates preserved |

The workbook contains no contact emails or meeting attendees. Each Client gets
one deterministic address at `connected-intelligence.test`. Mail and Calendar
use that same address so they resolve to the same workspace-scoped
`connected_people` row. This augmentation is operational fixture metadata, not
source ground truth. The workbook also omits currency; normalized values remain
`null`, while the legacy non-null invoice column uses ISO `XXX` (no currency).

## Side-effect firewall

Fixture communications use the production observation/Person/event pipeline
through a marker-authorized `fixture/import` source. No `mail_accounts` row is
created, so the mailbox poller cannot see the fixture. The importer does not
call SMTP, IMAP, external Calendar, Paystack, payment webhooks, invoice sending,
notifications, n8n, integration execution, automations, Hermes, or semantic
Signal Engine processing.

## Ground truth

`expectedOpportunities` is read only by the benchmark comparator. Detectors do
not import it and opportunities are never seeded.

Expected positives:

- `project_meeting_load`: PRJ-203, PRJ-209, PRJ-210, PRJ-211, PRJ-229,
  PRJ-230, PRJ-233
- `client_attention_load`: CLI-101, CLI-103, CLI-111, CLI-113

Every other project/client is an explicit negative control. Future detector
expectations can be appended using the same detector/subjectRef/expected shape
without changing the importer.

## Known source limitations and warnings

- 46 quote rows contain only 36 quote labels; nine labels repeat.
- Six thread labels collide across clients, so normalized thread identity also
  includes `clientRef`.
- 45 payments and 87 completed tasks are late; these are retained conditions.
- Messages have no subject, address, durable message ID, or project link.
- Meetings have no attendee, title, exact time, or timezone.
- The dataset has no currency.
- Current communication thread counts equal message counts, so that benchmark
  feature is not an independent signal.

Structural relationship errors fail conversion/import. Safe, representable
business imperfections remain warnings.
