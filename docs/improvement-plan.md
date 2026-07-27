# lancee — Improvement Plan

Two kinds of work below: **Section 1** closes gaps between what the docs promise and what's actually built. **Section 2** is new, standout features. Everything here respects your own Product Principles (work-first, optional AI, small-business scale) — nothing enterprise, nothing agent-centric.

---

## Section 1: Changes to existing implementation

These aren't new ideas — they're places where `PRODUCT_VISION.md` makes a promise that `PLATFORM.md` / `INTEGRATIONS.md` don't yet back up.

| Area | Current state | Change needed |
|---|---|---|
| **Offline / portability** | Completed on 2026-07-26: installable production shell, static-only service-worker caching, workspace-partitioned Idea-note snapshots, IndexedDB create/edit queue, reconnect sync, and version-conflict decisions. | Extend the proven queue contract only after tasks/milestones become durable; keep payments, credentials, grants, and deliveries online-only. |
| **Payments** | Paystack depth-first flow completed on 2026-07-26: server-side key configuration, workspace connection state, durable ZAR invoices, idempotent hosted links, immutable references, and verified webhook reconciliation. Stripe/PayPal remain previews. | Add refunds, partial-payment/dispute states, tax, and recovery verification before broadening to another provider. |
| **n8n bridge** | Completed on 2026-07-26: encrypted workspace configuration, HTTPS/exact-origin/public-DNS policy, timestamped nonce signatures, real timeout-bounded GET/POST, inbound replay protection, durable attempts, and linked retry. | Dispatch verified inbound events into the future persisted automation engine while retaining the delivery ledger. |
| **MCP grants** | Completed on 2026-07-26: bearer and service-activation state use persisted, workspace-scoped SQLite rows. | Connect durable catalog discovery and tool transport without moving credentials into the browser. |
| **API keys** | Completed on 2026-07-26: secrets are hashed at rest, scoped to workspace permissions, shown only in the logical creation response, soft-revoked, and tracked with `last_used_at`. | Add scopes only as real server routes become available. |
| **Auth** | Durable `users`, `workspaces`, and `workspace_members` tables now back session authorization. The initial owner is still bootstrapped and rotated through `.env`; invitation and account-management flows do not exist. | Before adding collaborators, add invitation, verification, password-reset, and member-management flows on top of the existing owner/collaborator schema. |
| **Automation naming** | Completed on 2026-07-26: contracts, run references, mock methods, UI identifiers, and styles now use `Automation` consistently. | Keep future persisted routes and records on the same `automation` terminology. |

**Do this section first.** None of Section 2 is worth much if invoices can't actually charge anyone yet.

---

## Section 2: Features to add

Chosen for high leverage relative to effort, and because they fit a solo/small-studio tool rather than pushing it toward enterprise or agent-hype territory.

### 1. WhatsApp as a first-class Connection
Not a notification channel bolted onto SMTP — a real Connection with its own card in **Connections**, usable from **Automations** ("notify client on WhatsApp when invoice is overdue") and **Money** (payment link sent via WhatsApp). This is the single biggest differentiator versus HoneyBook/Bonsai/Dubsado, none of which take WhatsApp seriously, and you already have working WhatsApp automation code to draw from.

### 2. A local SA payment rail alongside Stripe/PayPal/Paystack
PayPal has weak SA payout support; Paystack doesn't cover every SA bank flow. Adding one instant-EFT rail (Ozow or similar) signals the product understands the market it's actually being built in, rather than importing US assumptions wholesale.

### 3. Idea → Invoice as a literal, one-tap product moment
It's already in your Jobs to Be Done list but not called out as a *feature*. Build the explicit flow: promote an Idea card → creates linked Task/Milestone → completed milestone surfaces as a suggested invoice line item → one tap sends it. Keep the provenance chain visible (which idea, which milestone, which invoice) at every step. This loop, done well, is the thing a demo should open with.

### 4. An Automation/AI action ledger
A visible, per-workspace log: what ran, what it changed, why, and a one-click revert. This turns your "Optional intelligence" principle from a policy statement into something the user can actually see and trust — increasingly a real selling point in 2026 as people get wary of automations acting without a paper trail.

### 5. Multi-currency invoicing
SA freelancers serving international clients routinely need ZAR alongside USD/EUR/GBP. Real exchange-rate handling and currency-aware line items (not flattened provider parity) — this was already flagged as a requirement in the vision doc; worth prioritizing now that it's a common case, not an edge case.

---

## Explicitly out of scope

Consistent with Principle 9 (small-business scale) — skip these even if they seem obviously "2026":

- Agent marketplaces or multi-agent orchestration UI
- Role-based permission systems beyond a simple owner/collaborator split
- A general-purpose AI chat surface as a primary nav item
- Anything that makes AI the default owner of a workflow rather than an assist

---

## Suggested order

1. ~~Durable domain foundation (`users`, `workspaces`, memberships, MCP grants,
   API keys, and stable mutation identifiers)~~ — completed 2026-07-26
2. ~~One real Paystack payment flow using its documented authentication
   model~~ — completed 2026-07-26
3. ~~Durable n8n delivery and replay protection~~ — completed 2026-07-26
4. ~~PWA install support and offline sync against the durable domain model~~ —
   completed 2026-07-26
5. Idea → Invoice loop (proves the core thesis)
6. WhatsApp connection (market differentiator)
7. Automation ledger (trust/differentiator, moderate effort)
8. Local SA payment rail + multi-currency (rounds out Money)
