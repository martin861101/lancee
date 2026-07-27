# lancee Product Vision

## Product Direction

lancee is a portable operating workspace for freelancers and small business owners. It brings client work, ideas, lightweight automation, connections, and money into one calm interface that can travel with the owner.

The primary reference user is an independent designer who travels frequently and manages many liquor-label and packaging clients. They need to move from a client request to research, concepts, approvals, delivery, and payment without reconstructing context across scattered tools.

lancee is not an enterprise collaboration suite, corporate system of record, or agent-centric product. The user's business and work remain the organizing model; AI is an optional capability inside that model.

## Audience

Primary:

- Independent designers, consultants, makers, and other client-service freelancers.
- Small business owners who personally manage both delivery and operations.
- People working across locations, devices, clients, currencies, and external tools.

Secondary:

- Small studios or partnerships that need shared visibility without enterprise administration.
- Solo operators growing from informal workflows into repeatable business processes.

## Jobs to Be Done

Users hire lancee to:

- See what needs attention across clients, projects, deadlines, and payments.
- Keep briefs, files, decisions, references, and deliverables attached to the work they support.
- Capture ideas quickly and turn selected ideas into real work.
- Reuse repeatable workflows without becoming an automation specialist.
- Maintain useful client and collaborator context.
- Create invoices, collect payments, and understand outstanding revenue.
- Connect existing tools while keeping one understandable operating view.
- Use AI for specific assistance without surrendering control or changing their workflow.

## Product Principles

1. **Work first.** Organize around clients, projects, deliverables, and outcomes—not agents, prompts, or infrastructure.
2. **Portable by default.** Core workflows must remain useful across devices, locations, and intermittent connectivity; preserve clear ownership and export paths for user data.
3. **One calm overview.** Surface priorities, risks, and next actions without dashboard overload.
4. **Progressive depth.** Simple actions stay simple; advanced automation and configuration appear only when requested.
5. **Optional intelligence.** Every essential workflow works without AI. AI suggestions require explicit review before consequential changes.
6. **Connected, not captive.** Integrate with tools users already trust and make connection status, permissions, and failures visible.
7. **Money belongs beside work.** Quotes, invoices, payments, and project status share context.
8. **Honest product states.** Clearly distinguish live data, sample data, placeholders, drafts, queued actions, and completed actions.
9. **Small-business scale.** Prefer speed, clarity, and low setup cost over enterprise controls and organizational complexity.

## Navigation and Information Architecture

The primary navigation is stable and user-centered:

### Home

An attention view: today's priorities, upcoming deadlines, recent activity, blocked work, unpaid invoices, and failed automations. Cards link to their source records; Home does not become a separate data silo.

### Work

Clients, projects, briefs, tasks, milestones, files, approvals, and deliverables. The default hierarchy is `Client → Project → Work items`, with lightweight work allowed before a client is assigned.

### Ideas

Fast capture for notes, references, images, links, and early concepts. Ideas can be tagged, grouped, linked to clients/projects, or promoted into a brief, task, or project while retaining provenance.

### Automations

User-visible recipes, triggers, runs, approvals, and failure history. Recipes describe outcomes in plain language. Advanced configuration may expose n8n details without making n8n terminology the primary interface.

### Connections

External services, credentials, permission scopes, sync health, last successful sync, and reconnect controls. Connections include storage, communication, calendars, payments, n8n, and MCP-enabled services.

### Money

Estimates, invoices, payment links, payment status, expenses where supported, and a simple cash overview. Stripe, PayPal, and Paystack are first-class payment/invoicing providers; provider-specific capabilities and fees must be represented accurately rather than flattened into false parity.

Global search and quick capture span all sections. Each record supports links to related clients, projects, ideas, invoices, connections, and automation runs.

## AI's Role

AI appears only when it removes meaningful effort or helps the user make sense of existing context. Suitable uses include summarizing a brief, extracting tasks from approved notes, drafting client communication, finding related references, or suggesting invoice line items from completed work.

AI is always optional:

- No essential workflow depends on model availability.
- Users can dismiss, disable, or avoid AI entry points.
- Generated content is labeled and editable.
- Sending messages, changing project state, creating charges, issuing invoices, or running external actions requires explicit confirmation unless the user has deliberately configured a bounded automation.
- AI must not be the primary navigation, product identity, or default owner of work.

## Integration Roles

### Payments and Invoicing

- **Stripe:** card payments, hosted payment links, invoices, webhooks, refunds, and status reconciliation where available.
- **PayPal:** PayPal checkout/invoicing and payment status reconciliation where available.
- **Paystack:** regionally relevant card and bank payment flows, payment links/invoices where available, and webhook reconciliation.

lancee stores normalized business records plus immutable provider references. The provider remains authoritative for transaction settlement. Idempotency, webhook verification, currency, tax, refund, and partial-payment states must be handled explicitly.

### n8n

n8n is the workflow execution layer for multi-step integrations, schedules, and long-running automations. lancee owns the user-facing recipe, approval state, run summary, and error recovery experience. Each execution must carry a lancee correlation ID and report durable status back to the originating record.

### MCP

MCP is a standardized capability boundary for discovering and invoking connected tools or retrieving context. It supports interoperable connections and optional AI-assisted actions; it is not the user's information architecture. MCP tool availability, permission scope, and invocation results must be inspectable, and consequential calls follow the same confirmation rules as native integrations.

## Reference End-to-End Workflow

1. While travelling, a designer captures a photo and note in **Ideas** after seeing an interesting bottle treatment.
2. A liquor client sends a packaging brief. The designer creates a project in **Work**, attaches the brief, and links the captured idea.
3. AI is optionally used to summarize constraints and suggest a task list; the designer reviews and accepts only useful items.
4. The project tracks research, label concepts, regulatory copy, dieline preparation, client review, revisions, and final production files.
5. An approved automation uses n8n to copy final files to connected storage, notify the client, and record the run against the project. Any failure appears on Home and in Automations.
6. The designer creates an invoice in **Money** from approved milestones, selects Stripe, PayPal, or Paystack, verifies the amount and recipient, and explicitly sends it.
7. A verified provider webhook marks the invoice paid. Home clears the outstanding-payment alert, and the project timeline records the event.

The full workflow remains possible manually if AI, n8n, MCP, or a payment connection is unavailable.

## Placeholder and Live Boundaries

Every surface must expose its data state:

- **Live:** backed by persisted user data or a verified provider response, with last-updated time.
- **Pending:** submitted but awaiting provider, sync, webhook, or automation completion.
- **Draft/local:** saved by the user but not sent or synchronized.
- **Sample:** demo or onboarding content, visually labeled and removable in one action.
- **Placeholder:** intentionally unavailable capability; non-interactive unless it opens an explanation or waitlist.
- **Error/stale:** failed or outdated data with the last successful state preserved and a recovery path.

No fabricated balances, activity, client records, automation success, or payment status may appear as live. Prototype actions must not imply an external side effect occurred.

## Success Metrics

Measure activation, durable use, and business outcomes:

- Time from signup to first client/project and first useful Home view.
- Percentage of activated users completing a full `brief → delivery → invoice` workflow.
- Weekly active owners who use at least two core sections, excluding passive page views.
- Median time to capture an idea and convert it into linked work.
- On-time milestone rate and reduction in overdue work.
- Invoice creation rate, payment-link send rate, paid-invoice rate, and median days to payment.
- Automation success rate, recoverable failure rate, and time to resolve failed runs.
- Connection health and successful sync/webhook reconciliation rate.
- AI suggestion acceptance, edit, dismissal, and disablement rates—without treating higher AI usage as an objective.
- Four- and twelve-week retention for activated freelancers and small businesses.
- User-reported reduction in tool switching and confidence that nothing important is being missed.

## Phased Roadmap

### Phase 1: Coherent Core

- Ship the six-section navigation and shared record-linking model.
- Deliver Home attention view, clients/projects/tasks/files in Work, quick capture in Ideas, and basic Money records.
- Implement explicit sample/live/pending/error states.
- Support manual workflows end to end with export and responsive mobile/desktop behavior.

### Phase 2: Get Paid and Stay Connected

- Add production-grade Stripe, PayPal, and Paystack connections in a capability-based sequence.
- Add invoice sending, provider references, verified webhooks, reconciliation, and payment alerts.
- Ship Connections health, permission visibility, reconnect flows, and audit history.

### Phase 3: Repeatable Operations

- Add n8n-backed recipes, approval gates, correlated run history, retries, and failure recovery.
- Introduce MCP connections for well-bounded context retrieval and actions.
- Add templates for common freelancer workflows, including packaging/design delivery.

### Phase 4: Optional Intelligence and Growth

- Add contextual AI assistance only to validated high-effort tasks.
- Expand cross-workspace search, summaries, and suggestions with transparent sources and controls.
- Add lightweight shared access for small studios, richer financial insight, and more provider capabilities without introducing enterprise administration.

Each phase must improve the non-AI product first; optional intelligence can accelerate a working workflow but cannot substitute for one.
