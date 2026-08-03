# Agent Prompt: Add lancee Business, Legal and Subscription Infrastructure

You are working inside the existing **lancee** service-management platform.

lancee is not a separate legal entity. It is a product, brand, or trading division operated by the existing South African company **Hookitup Pty (Ltd)**.

Your objective is to add the required business disclosures, legal-document infrastructure, subscription billing foundation, invoice identity, revenue classification, and compliance administration features without breaking or rewriting working functionality.

## Critical Operating Rules

1. Inspect the complete repository before making changes.
2. Read all applicable `AGENTS.md`, architecture documents, environment examples, database schemas, API conventions, authentication logic, billing code, UI components, and tests.
3. Determine what is already implemented before creating anything.
4. Reuse existing components, routes, services, configuration systems, styling conventions, and database abstractions.
5. Do not replace or refactor working features unless required for this implementation.
6. Make the smallest safe set of changes.
7. Do not invent company information, registration numbers, VAT numbers, addresses, email addresses, gateway credentials, legal conclusions, or cancellation terms.
8. Represent unknown company information using validated configuration fields and clearly documented placeholders.
9. Never store payment-card details.
10. Never expose secrets, private gateway keys, webhook secrets, or internal accounting metadata to the frontend.
11. Do not activate production billing, submit trademark applications, purchase domains, or modify an external accounting system automatically.
12. Complete the implementation, tests, migrations, documentation, and verification. Do not stop after producing a plan.

---

# 1. Discovery and Implementation Report

Before editing, inspect the platform and document:

- Application framework and package manager
- Frontend and backend structure
- Database and migration system
- Existing authentication and authorization
- Existing organisation/workspace model
- Existing subscription or payment functionality
- Existing legal pages
- Existing footer and checkout interfaces
- Existing invoice or receipt generation
- Existing webhook infrastructure
- Existing event, audit-log, job-queue, and email services
- Existing admin configuration
- Existing environment-variable validation
- Existing test framework
- Existing integrations that must remain unchanged

Create a concise implementation checklist showing:

- Existing and reusable
- Missing
- Partially implemented
- External/manual configuration required
- Implemented during this task

Continue with implementation after completing the inspection.

---

# 2. Canonical Business Identity

Create one central, typed business-identity configuration rather than hardcoding company details across the application.

Use fields equivalent to:

```ts
export interface BusinessIdentity {
  platformName: string;
  platformLegalStyle: string;
  legalEntityName: string;
  companyRegistrationNumber?: string;
  vatRegistrationNumber?: string;
  registeredAddress?: string;
  supportEmail?: string;
  legalEmail?: string;
  informationOfficerEmail?: string;
  jurisdiction: string;
  countryCode: string;
  currency: string;
  isVatRegistered: boolean;
}