# Browser and Document Worker

## Purpose

`browser-worker` is a deployed Node.js MCP worker for guarded public-web
automation and document publishing. Its public Streamable HTTP endpoint is:

```text
https://mcp.hygridtech.co.za/services/browser-worker/mcp
```

Use the same `PUBLIC_API_TOKEN` bearer token as the registry and other public
MCP routes. Generated artifacts are returned as authenticated URLs under
`/services/browser-worker/artifacts/{opaque-name}` and expire after 24 hours.

## Executable tools

| Tool | Function |
| --- | --- |
| `playwright_screenshot` | PNG/JPEG capture with configurable viewport and full-page mode |
| `playwright_responsive_capture` | Mobile, tablet, and desktop screenshot set |
| `playwright_webpage_pdf` | Public webpage to PDF with Playwright |
| `puppeteer_html_pdf` | Supplied HTML to PDF with Puppeteer APIs and scripts disabled |
| `modern_document_pdf` | Sanitized Markdown to styled PDF with four modern themes |
| `web_quality_audit` | Metadata, headings, image-alt, viewport, and browser-error checks |
| `extract_web_content` | Structured metadata, headings, links, and readable text extraction |
| `website_smoke_test` | Deterministic HTTP, title, text, and selector assertions |
| `extract_table_data` | Bounded table headers and rows as structured JSON |
| `seo_metadata_audit` | Canonical, robots, social-card, and JSON-LD metadata checks |

The dashboard is seeded with matching definitions and seven agent workflows:
`website_release_gate`, `modern_pdf_publisher`, `web_research_report`, and
`production_web_evidence`, plus `website_smoke_testing`,
`web_table_extraction`, and `seo_content_review`.

## Safety and operating limits

- Only absolute HTTP and HTTPS destinations are accepted.
- URL credentials, localhost, private/link-local addresses, reserved networks,
  and hostnames resolving to those networks are rejected.
- Playwright intercepts navigation and subresource requests. Puppeteer attaches
  to the same managed Chromium instance and applies equivalent request checks.
- Raw HTML rendering disables JavaScript. Markdown is sanitized before it is
  inserted into the themed document.
- The container runs as `pwuser`, read-only, with all Linux capabilities
  dropped, `no-new-privileges`, bounded memory/CPU/PIDs, and a concurrency limit
  of two render operations.
- Artifacts use UUID filenames, authenticated delivery, a 24-hour TTL, and a
  maximum retained file count of 500.

The SSRF controls reduce risk but do not turn arbitrary browsing into a fully
trusted operation. Keep the worker isolated, retain gateway authentication, and
do not expose its container port directly.

## Deployment

Build and start with the public gateway origin explicitly set:

```bash
PUBLIC_GATEWAY_URL=https://mcp.hygridtech.co.za \
  docker compose up --build --detach --wait browser-worker traefik
```

Seed or reconcile every dashboard catalog after deployment from the repository
root:

```bash
set -a
. ./.env
set +a
MCP_API_TOKEN="$PUBLIC_API_TOKEN" make seed
```

`make seed` is idempotent: existing objects are updated and missing objects are
created.

## Verification

List the executable tools through the authenticated gateway:

```bash
curl --fail --silent \
  --header "Authorization: Bearer $PUBLIC_API_TOKEN" \
  --header 'Accept: application/json, text/event-stream' \
  --header 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  http://localhost:8089/services/browser-worker/mcp
```

Inspect worker health and registration:

```bash
docker compose ps browser-worker
docker compose logs --tail=50 browser-worker
```

## Adding another real tool

A dashboard entry alone is not executable. Add the SDK handler to
`automation_worker/src/tools.js`, add and pin any dependency in `package.json`,
write focused tests, rebuild/redeploy the worker, verify `tools/list`, then add
the matching catalog definition to `scripts/seed-catalog.js`.
