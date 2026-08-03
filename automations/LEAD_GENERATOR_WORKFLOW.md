# Lead Generator Workflow

The Lead Generator is the first purpose-built workflow under **Services > Workflows**. Phase 1
discovers businesses by industry and search reach, enriches each result from its public website,
and stores the resulting lead records in PostgreSQL. Phase 2 creates reviewed outreach drafts from
industry-specific templates and sends approved messages through BaseBox's connected SMTP service.

## Phase 1 flow

1. The operator enters an industry keyword, such as `Law firms`.
2. The operator chooses `Local` and supplies a location, or chooses `Global`.
3. The backend makes one SerpApi request to discover official business websites. Search-result
   content is treated as transient discovery data.
4. Crawlee's HTTP/Cheerio crawler visits the result and a limited number of relevant same-site pages,
   such as contact, team, leadership, or about pages.
5. Playwright is started lazily only when the initial HTML is unavailable or appears to require
   JavaScript rendering. Access denials and robots exclusions do not trigger a browser fallback.
6. Publicly displayed JSON-LD, email addresses, phone numbers, stated staff size, and senior-member
   text are extracted deterministically when available.
7. Leads, crawl method, crawl evidence, and run status are inserted or updated in PostgreSQL.

## Phase 2 flow

1. Configure and enable an **Email / SMTP** connection under **MCP** in BaseBox. The workflow reads
   that encrypted platform connection directly; email is not sent through an MCP protocol call.
2. Save a separate subject and body template for each industry. Templates are keyed by normalized
   industry name and never shared across different industries.
3. Open a lead with a public email address and generate a draft. Template placeholders are rendered
   from stored lead data. If an AI agent is configured, it personalizes the rendered template
   without being allowed to invent facts. Otherwise, the rendered template remains available for
   manual review.
4. Edit the recipient, subject, and body, then explicitly approve the draft. Any later UI edit
   invalidates that local approval and requires another approval.
5. Send the approved draft. Global hourly and daily limits are checked under a PostgreSQL advisory
   lock. Suppressed, bounced, opted-out, and manually blocked addresses cannot be sent.
6. `contacted` becomes `true` only when the SMTP server includes the recipient in its accepted list.
   SMTP acceptance means the provider queued the message; it is not proof that the destination
   mailbox delivered or read it.
7. Authenticated mailbox or provider adapters submit replies, bounces, and opt-outs. Bounces and
   opt-outs are added to the durable suppression list automatically.

## Required configuration

Set these values in `agent/.env` or the backend process environment:

```dotenv
LEAD_DATABASE_URL=postgresql://basebox:strong-password@localhost:5432/basebox_leads
SERPAPI_API_KEY=your-serpapi-key
```

Optional values:

```dotenv
SERPAPI_ENGINE=google
SERPAPI_COUNTRY=za
SERPAPI_LANGUAGE=en
LEAD_CRAWL_MAX_PAGES=3
LEAD_CRAWL_DELAY_MS=1000
LEAD_CRAWL_CACHE_DAYS=14
LEAD_CRAWLER_USER_AGENT=BaseBoxLeadResearch/1.0 (+public-business-contact-research)
PGSSL=require
LEAD_DB_POOL_SIZE=5
LEAD_EMAIL_HOURLY_LIMIT=20
LEAD_EMAIL_DAILY_LIMIT=100
LEAD_DRAFT_AGENT_ID=
```

`LEAD_CRAWL_MAX_PAGES` is restricted to 1-5 and defaults to 3. `LEAD_CRAWL_DELAY_MS` is restricted
to 0-10000 milliseconds and defaults to 1000. Successful crawls are reused for
`LEAD_CRAWL_CACHE_DAYS` (0-90, default 14); set it to 0 to force every run to refresh. Use a crawler
user agent that accurately identifies your deployment and provides appropriate contact information.

`LEAD_EMAIL_HOURLY_LIMIT` accepts 1-500 and defaults to 20. `LEAD_EMAIL_DAILY_LIMIT` accepts
1-5000 and defaults to 100. Limits apply across the Lead Generator, not per operator or industry.

`LEAD_DRAFT_AGENT_ID` optionally pins draft generation to one configured BaseBox AI agent. When it
is empty, the first configured agent is used. If no agent is configured or inference fails, BaseBox
renders the industry template and shows a warning so the operator can continue with manual review.

The Docker Compose stack includes a private PostgreSQL 16 service and supplies its connection
string to the agent. Set `LEAD_DB_PASSWORD` before using that stack outside local development.
When setting `LEAD_DATABASE_URL` explicitly for Compose, use `postgres` as its hostname. Quote
dotenv values containing `#`, or URL-encode reserved password characters.

PostgreSQL only applies `POSTGRES_PASSWORD` when it initializes an empty data directory. If
`LEAD_DB_PASSWORD` changes after the volume exists, update the `basebox` database role to the same
password or recreate the database intentionally. Rebuilding a container alone does not change
credentials stored in the persistent database.

The status panel in the workflow verifies PostgreSQL access and detects the SerpApi credential.
The Run button remains disabled until both dependencies are ready. The same panel reports the
enabled SMTP connection and configured hourly rate limit. Run **Test connection** on the Email/SMTP
connection to verify SMTP authentication.

`SERPAPI_ENGINE=google` is the recommended default because it returns conventional organic results
suited to official-site discovery. SerpApi also documents `brave_ai_mode`; set
`SERPAPI_ENGINE=brave_ai_mode` to use its Brave AI web results. This is Brave AI Mode, not Brave's
direct Search API.

The SerpApi free plan currently includes 250 successful searches per month. Each workflow run makes
one search request, regardless of the selected `maxResults` value, and does not paginate. Cached,
failed, and errored SerpApi requests are not counted under the current pricing rules. BaseBox stores
official-site URLs and extracted lead data, not search snippets. Review the current
[SerpApi pricing](https://serpapi.com/pricing) and terms before production use.

## Stored records

The backend creates:

- `lead_generator_runs` for run inputs, status, counts, and errors.
- `workflow_leads` for business details, contact information, enrichment status, and outreach state.
- `workflow_lead_email_templates` for one reusable template per normalized industry.
- `workflow_lead_suppressions` for manual, bounce, and opt-out blocks.
- `workflow_lead_outreach_events` for draft, approval, send, failure, suppression, bounce, and
  opt-out audit events.

Websites are unique. A later run refreshes the enriched fields for an existing website without
resetting its contacted or replied state.

Each lead also records:

- `source_provider` for the discovery provider.
- `crawl_method` as `http` or `playwright`.
- `crawled_at` for freshness tracking.
- `crawl_evidence` with visited page URLs, extraction method, and rendered-browser fallback reason.

## API

All routes require the normal BaseBox dashboard authentication:

- `GET /api/workflows/lead-generator/status`
- `GET /api/workflows/lead-generator/leads?limit=50`
- `POST /api/workflows/lead-generator/run`
- `GET /api/workflows/lead-generator/email-templates`
- `PUT /api/workflows/lead-generator/email-templates`
- `POST /api/workflows/lead-generator/leads/:id/draft`
- `POST /api/workflows/lead-generator/leads/:id/approve`
- `POST /api/workflows/lead-generator/leads/:id/send`
- `PATCH /api/workflows/lead-generator/leads/:id/suppression`
- `PATCH /api/workflows/lead-generator/leads/:id/contacted`
- `POST /api/workflows/lead-generator/reply-events`
- `POST /api/workflows/lead-generator/bounce-events`
- `POST /api/workflows/lead-generator/opt-out-events`

Example run body:

```json
{
  "industry": "Law firms",
  "scope": "local",
  "location": "Cape Town",
  "maxResults": 10
}
```

The reply-events route accepts an inbound sender address and message ID. It flags only a matching
lead whose `contacted` value is already true. Bounce and opt-out adapters submit an address and
optional reason; both routes suppress the address even if no lead is matched.

The legacy contacted route now permits only `{"contacted": false}`. Setting contacted state to true
manually is rejected because the SMTP acceptance response is the source of truth.

Template bodies support:

- `{{greeting}}`
- `{{business_name}}`
- `{{industry}}`
- `{{location}}`
- `{{location_phrase}}`
- `{{website}}`
- `{{business_size}}`

## Safety and operating notes

- Only public business pages are inspected.
- Private, loopback, and local network result addresses are rejected before crawling.
- The crawler honors `robots.txt`, uses one concurrent request per business, delays same-domain
  requests, and limits each business to no more than five pages.
- Successful recent crawls are reused from PostgreSQL to avoid unnecessary repeat requests.
- HTTP `401`, `403`, and `429` responses do not trigger browser-based retry attempts.
- CAPTCHA solving, residential proxy rotation, and access-control bypasses are not part of this
  workflow.
- Results must be reviewed before outreach.
- Operators are responsible for consent, lawful basis, opt-out handling, rate limits, and applicable
  email and privacy rules.
- Discovery uses SerpApi instead of automating a search-results website.
- SMTP credentials remain encrypted in the BaseBox SQLite connection registry and are never copied
  into PostgreSQL or returned by workflow APIs.
- BaseBox does not currently poll IMAP directly. Connect a mailbox webhook or adapter to the
  authenticated reply, bounce, and opt-out event routes.
