# Agent Task — Migrate Lancee to `lancee.work`

You are working on the **Lancee** repository.

## Objective

Move Lancee from its existing Hookitup-hosted/subdomain identity to its new permanent product domain:

**https://lancee.work**

This is a **domain migration only**.

IMPORTANT:

**Supabase is NOT part of the current Lancee architecture/migration phase.**

Do not introduce Supabase, migrate anything to Supabase, modify database architecture, or prepare the application for the future Supabase deployment as part of this task.

Work with the architecture that exists in the repository today.

---

# 1. Inspect Before Changing

First inspect the repository and determine the CURRENT production architecture.

Identify:

* frontend
* backend/API
* authentication
* database configuration
* current hosting assumptions
* environment variables
* Google integrations
* Microsoft integrations if active
* email integration
* Dropbox
* payment integrations
* n8n/webhooks
* Hermes
* MCP
* CORS
* cookies/sessions
* deployment scripts
* Docker configuration
* nginx/Apache configuration
* CI/CD
* SEO/public metadata

Do not make assumptions based on future Lancee architecture plans.

The repository is the source of truth for this task.

---

# 2. Find the Old Domain

Search the entire repository for the current Lancee domain/subdomain.

Specifically search for:

`lancee.hookitupservices.com`

and:

`hookitupservices.com`

Also search environment examples, documentation, deployment scripts and configuration files.

Categorise each occurrence before changing it.

Do NOT replace legitimate Hookitup Solutions company/legal references just because they contain `hookitupservices.com`.

We are replacing Lancee's PRODUCT URL, not erasing Hookitup references.

---

# 3. New Canonical Domain

The new canonical product URL is:

`https://lancee.work`

Use this for:

* public URLs
* canonical metadata
* generated application links
* authentication redirects
* email links
* share links
* integration callbacks where required
* production origin configuration

Prefer:

`https://lancee.work`

over:

`https://www.lancee.work`

If `www.lancee.work` is configured, it should redirect to `https://lancee.work`.

---

# 4. Do Not Invent New Infrastructure

Do not automatically introduce:

`app.lancee.work`

or:

`api.lancee.work`

The current Lancee deployment architecture should determine whether these are needed.

If Lancee currently serves the frontend and API through one public domain, preserve that architecture.

If a separate API hostname is genuinely required by the existing deployment, report the recommendation before introducing it.

The goal is the smallest safe migration.

---

# 5. Environment Configuration

Remove unnecessary hardcoded production-domain assumptions.

Where appropriate, use the project's existing environment configuration.

For example:

`APP_URL`
`PUBLIC_URL`
`API_URL`
`ALLOWED_ORIGINS`

Use existing naming conventions rather than creating duplicate variables.

Production should resolve to:

`https://lancee.work`

Local development must continue to work.

Do not hardcode production behaviour that breaks localhost.

---

# 6. Authentication

Inspect the CURRENT authentication implementation.

Verify:

* sign in
* sign up
* logout
* session handling
* email verification if present
* password reset if present
* invitations
* team invitations
* OAuth callbacks
* post-login redirects
* generated authentication URLs

Replace old Lancee-domain assumptions with `lancee.work`.

Do not rewrite authentication.

---

# 7. Google Workspace

Google Workspace is an important Lancee integration.

Audit any domain-dependent configuration for:

* Google Sign-In
* Gmail
* Google Drive
* Google Calendar
* Google Picker
* Workspace OAuth

Identify any Google Cloud Console changes required for the new domain.

Examples include:

Authorized JavaScript origins:

`https://lancee.work`

and any required redirect URI such as:

`https://lancee.work/<existing-oauth-callback-path>`

DO NOT invent the callback path.

Find the actual callback path in the repository.

Report the exact values that need to be added to Google Cloud.

Keep old production redirect URIs temporarily if necessary during migration.

---

# 8. Other Integrations

Audit existing integrations for references to the old domain.

Check only integrations that actually exist, including potentially:

* Microsoft
* Dropbox
* payment providers
* mail
* n8n
* Hermes
* MCP
* external AI APIs

Update callback URLs/origins only when required.

Do not redesign integration architecture.

---

# 9. CORS

Inspect current backend CORS configuration.

Ensure the new production origin is allowed:

`https://lancee.work`

Remove the old Lancee origin once it is safe to do so.

Do not use wildcard CORS for authenticated endpoints.

Preserve localhost development origins.

---

# 10. Cookies / Sessions

Check for hardcoded cookie domains or session-domain assumptions.

Ensure cookies function correctly on:

`lancee.work`

Check:

* Secure
* HttpOnly
* SameSite
* domain
* CSRF behaviour
* session refresh

Prefer host-only cookies unless cross-subdomain cookies are genuinely required.

---

# 11. Public Metadata

Update Lancee's public identity to:

`https://lancee.work`

Check:

* canonical URLs
* OpenGraph
* social metadata
* structured data
* sitemap
* robots.txt
* manifest
* PWA configuration
* public share URLs
* footer links
* generated links
* email templates

Do not change unrelated branding or redesign the site.

---

# 12. Old Domain Redirect

Where infrastructure permits:

`OLD LANCEE DOMAIN → https://lancee.work`

Use a permanent redirect after the new deployment has been validated.

Preserve paths and query strings.

Example:

`OLD/features?source=test`

should become:

`https://lancee.work/features?source=test`

Do not blindly redirect OAuth/API endpoints where doing so could break callbacks.

---

# 13. DNS

Determine the DNS configuration required for the architecture actually found.

At minimum determine what is required for:

`lancee.work`

and optionally:

`www.lancee.work`

Do NOT invent IP addresses.

Provide the required structure such as:

| Host | Type    | Destination             | Purpose                  |
| ---- | ------- | ----------------------- | ------------------------ |
| @    | A/CNAME | `<current Lancee host>` | Lancee                   |
| www  | CNAME   | `<appropriate target>`  | Redirect/canonical alias |

If the exact server IP/hostname exists in deployment configuration, report it.

Otherwise explicitly state that I need to provide/configure the hosting destination.

Also identify SSL/TLS certificate changes required.

---

# 14. Security

Do not weaken security during the migration.

No:

* wildcard authenticated CORS
* insecure production cookies
* disabled CSRF
* OAuth wildcard callbacks
* committed secrets
* TLS verification bypasses

Also inspect CSP configuration for old-domain references, including:

* connect-src
* frame-src
* img-src
* script-src

Update only where necessary.

---

# 15. Validation

Run the existing project validation pipeline.

At minimum run the appropriate existing equivalents of:

* lint
* typecheck
* tests
* production build

Fix domain-migration-related failures.

Do not perform unrelated refactoring to obtain a green result.

---

# 16. Final Legacy-Domain Search

After implementation search again for:

`lancee.hookitupservices.com`

and:

`hookitupservices.com`

For every remaining occurrence classify it as:

**Intentional**
or
**Needs removal**

There must be no unexplained dependency on the old Lancee domain.

---

# 17. Functional Verification

Verify or provide manual verification instructions for:

### Website

* `https://lancee.work` loads
* HTTPS valid
* assets load
* navigation works
* refresh/direct routes work
* canonical metadata correct
* Keep the current URL for testing

### Authentication

* signup
* login
* logout
* session persistence
* verification/reset if supported
* invitations

### Core Lancee

* dashboard
* clients
* projects
* ideas
* automations
* invoices

### Connected Intelligence

Confirm existing Connected Intelligence functionality is unaffected.

### Google Workspace

Verify applicable:

* Google login
* Gmail
* Drive
* Calendar
* Picker

### AI

Verify the existing:

Lancee UI → Lancee backend → Hermes/MCP/AI

flow still works.

Do not change this architecture.

### Workflows

Verify existing workflows still communicate correctly and are not blocked by CORS/origin changes.

---

# 18. Explicitly Out of Scope

DO NOT:

* introduce Supabase
* configure Supabase
* migrate database infrastructure
* split frontend/backend
* move hosting providers
* redesign Lancee
* rewrite authentication
* redesign integrations
* restructure Connected Intelligence
* replace Hermes
* replace MCP
* perform unrelated refactoring

Those are separate future phases.

---

# 19. Final Report

When finished provide:

## Migration Summary

What changed.

## Files Changed

File and reason.

## Environment Changes

Variables requiring updates.

## DNS Changes

Exactly what I need to configure.

## Hosting Changes

Anything required on the current Lancee server.

## Google Cloud Changes

Exact origins/redirect URLs discovered from the code.

## Other External Services

Any callbacks/origins requiring manual updates.

## Old Domain

What remains temporarily and why.

## Validation Results

Report:

* lint
* typecheck
* tests
* build
* legacy-domain search

## Go-Live Checklist

Give me a concise ordered checklist for moving production from the old domain to:

`https://lancee.work`

---

# Success Criteria

Complete only when:

1. `lancee.work` is Lancee's canonical product domain.
2. Existing Lancee architecture is preserved.
3. Supabase has not been introduced or modified.
4. Local development still works.
5. Authentication still works.
6. Google Workspace integrations remain functional.
7. Existing API communication works.
8. Hermes/MCP/AI remains functional.
9. Connected Intelligence remains functional.
10. CORS/cookies remain secure.
11. Production build passes.
12. Legacy-domain references are either removed or explicitly justified.

Do not commit or push until validation is complete.

Stop after implementation and provide the final report plus the manual DNS/hosting/OAuth changes I need to perform.
