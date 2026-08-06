# MCP services and actions

This document records the MCP Grid catalog enabled by integration plan
`3527e5a9-20b6-498f-913c-3b0ba403e15e` through
`https://mcp.hygridtech.co.za`.

The plan currently exposes 29 executable actions. Each action accepts its
tool-specific JSON arguments through the server-side MCP client. The live
gateway can also advertise additional runtime services, so this file describes
the actions installed in this application rather than every possible gateway
extension.

The application serves these actions from the same deployment at `POST /mcp`.
Execution is delegated server-to-server to the configured MCP Grid backend
(`MCP_GATEWAY_URL`), which may be the managed `/home/apps/mcp` gateway.

## Executable actions

| Action | Purpose |
| --- | --- |
| `client_onboard` | Build a structured client onboarding brief from client, contact, and service details. |
| `crm_followup` | Prepare a CRM follow-up package from a last touchpoint and proposed next action. |
| `extract_table_data` | Extract headers and rows from a table on a public webpage. |
| `extract_web_content` | Extract public-page metadata, headings, links, and readable text. |
| `find_replace` | Apply explicit literal find-and-replace substitutions to text. |
| `invoice_remind` | Prepare an invoice reminder or recovery package from invoice and customer details. |
| `lead_capture` | Normalize and capture inbound lead details for follow-up. |
| `meeting_followup` | Turn meeting notes and action items into a follow-up package. |
| `meeting_prepare` | Prepare a meeting brief from the title, date, agenda, and supplied context. |
| `modern_document_pdf` | Create a polished, branded PDF from Markdown. |
| `playwright_screenshot` | Capture a production-quality PNG or JPEG screenshot of a public webpage. |
| `project_complete` | Produce a structured project-completion package from project details. |
| `proposal_accepted` | Produce a proposal-acceptance and onboarding handoff package. |
| `puppeteer_html_pdf` | Convert supplied HTML into a PDF with scripts disabled and private-network assets blocked. |
| `astryx_docs` | Retrieve documentation for Astryx components and related implementation guidance. |
| `playwright_responsive_capture` | Capture mobile, tablet, and desktop evidence for a public webpage in one operation. |
| `playwright_webpage_pdf` | Render a public webpage to a print-ready PDF with Playwright Chromium. |
| `transform_text` | Apply a deterministic text transformation. |
| `text_stats` | Calculate text statistics and constraint information. |
| `web_quality_audit` | Audit a public webpage for metadata, headings, images, links, responsiveness, and browser errors. |
| `hash_text` | Generate a content hash for supplied text. |
| `base64_encode` | Encode supplied data as Base64; this is not encryption. |
| `base64_decode` | Decode Base64 data. |
| `generate_uuids` | Generate opaque UUID values. |
| `seo_metadata_audit` | Inspect canonical, robots, Open Graph, Twitter Card, and JSON-LD metadata. |
| `csv_to_json` | Convert CSV or delimited tabular input into JSON records. |
| `select_fields` | Select specified fields from structured records. |
| `json_to_csv` | Convert consistent JSON records into CSV. |
| `website_smoke_test` | Verify that a public webpage loads and optionally assert its title, visible text, and a CSS selector. |

## Reusable MCP skills

The same catalog also provides these reusable workflows. Skills compose one or
more executable actions and add task-specific instructions.

| Skill | Composed actions |
| --- | --- |
| `client_onboarding` | `client_onboard` |
| `content_normalization` | `transform_text`, `find_replace`, `text_stats` |
| `invoice_recovery` | `invoice_remind` |
| `lead_qualification` | `lead_capture` |
| `meeting_preparation` | `meeting_prepare`, `meeting_followup` |
| `modern_pdf_publisher` | `modern_document_pdf`, `puppeteer_html_pdf` |
| `production_web_evidence` | `playwright_screenshot`, `playwright_webpage_pdf`, `web_quality_audit` |
| `safe_encoding_utilities` | `hash_text`, `base64_encode`, `base64_decode`, `generate_uuids` |
| `sales_follow_up` | `lead_capture`, `crm_followup` |
| `seo_content_review` | `seo_metadata_audit`, `web_quality_audit` |
| `tabular_data_exchange` | `csv_to_json`, `select_fields`, `json_to_csv` |
| `web_research_report` | `extract_web_content`, `playwright_screenshot`, `modern_document_pdf` |
| `web_table_extraction` | `extract_table_data`, `extract_web_content` |
| `website_release_gate` | `web_quality_audit`, `playwright_responsive_capture` |
| `website_smoke_testing` | `website_smoke_test`, `playwright_screenshot` |

## Runtime service model

- The built-in Lancee service provides workspace-scoped workflow, scheduling,
  code, log, and API actions.
- External MCP services are discovered from the gateway capability catalog and
  may add actions when configured and authorized.
- Optional Basebox services are available only when the server-side Basebox
  configuration is present.
- The application invokes tools through the backend. MCP credentials are kept
  server-side and are not exposed to browser clients.
- Actions involving production evidence, document generation, or other
  high-impact operations may be subject to the server's owner-approval and
  risk controls.

## Regeneration

The generated integration lives in
[`src/integrations/mcp-grid.ts`](src/integrations/mcp-grid.ts). Regenerate the
catalog with:

```bash
mcp-grid integrate \
  --gateway "https://mcp.hygridtech.co.za" \
  --plan-id "3527e5a9-20b6-498f-913c-3b0ba403e15e"
```

## Connecting a platform client

Set `MCP_SERVER_TOKEN` in the app's server-only environment and connect an MCP
client to the app URL followed by `/mcp`:

```text
https://lancee.hookitupservices.com/mcp
Authorization: Bearer <MCP_SERVER_TOKEN>
```

The public HTTPS proxy forwards this route to the app listener on port `5177`.

The endpoint supports MCP JSON-RPC `initialize`, `tools/list`, `tools/call`,
`prompts/list`, and `prompts/get`. The stdio form is available with
`pnpm mcp:server`. In production, `MCP_SERVER_TOKEN` is mandatory;
`MCP_HTTP_ALLOW_ANONYMOUS=true` is accepted only for trusted development
listeners.
