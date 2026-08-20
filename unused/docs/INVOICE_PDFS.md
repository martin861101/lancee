# Invoice PDFs

Lancee's Invoicing dashboard creates invoice, estimate, and receipt PDFs with
the existing server-side Playwright browser worker.

## Styles and colour

The document form offers four A4 styles:

- **Modern** — a bold total, card-based billing metadata, and a dark payment panel.
- **Classic** — serif typography, a formal page border, and restrained rules.
- **Studio** — an editorial layout with an oversized title and vertical colour rail.
- **Minimal** — generous whitespace, fine rules, and quiet typography.

Users can select one of six curated colours or use the native colour picker.
The selected colour is applied to the PDF's identity mark, headings, totals,
detail fields, and payment treatment. The renderer calculates light or dark
foreground text for filled accents.

## Payment options

Payment details are optional. When enabled, users can choose:

- **Paystack checkout** — creates the existing hosted ZAR payment link and
  prints the HTTPS checkout URL on the PDF.
- **Bank transfer** — requires an account holder, bank name, and account
  number. Branch and SWIFT/BIC codes are optional. These details and the
  document number as payment reference are printed directly on the PDF; no
  payment-provider configuration is required.

The dashboard stores generated-document metadata in the current browser so a
PDF can be downloaded again. Lancee does not email or message the document
automatically.

## Rendering and security

`POST /api/money/invoice-pdf` is authenticated and validates the document type,
template, colour, amount, currency, dates, payment URL, custom fields, and bank
fields. Dynamic content is HTML-escaped. The Playwright context disables
JavaScript, service workers, permissions, downloads, and all external requests
before producing a print-background A4 PDF capped at 10 MB.

The workspace name and signed-in user's email are used as the sender identity.
Chromium must be available through Playwright or `LANCEE_BROWSER_EXECUTABLE`,
matching the existing browser-worker deployment.

Run the four-template render check with:

```bash
npm run verify:invoice-pdf
```
