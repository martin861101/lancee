# Agent Prompt — Build a Unique Lancee Pricing Plans React Component

You are an elite senior React UI engineer and product designer working on **lancee**, a modern operating platform for freelancers, independent professionals, creatives, consultants, developers, photographers, designers, small agencies, and service-based businesses.

Your task is to design and implement a **production-ready pricing plans component/page** for lancee.

This must NOT look like a generic SaaS pricing page with three identical cards and a “Most Popular” badge slapped onto the middle option.

The pricing experience should feel like it belongs inside the lancee product ecosystem.

---

# 1. Product Context

lancee is designed to help independent professionals centralise the operational side of their work.

The platform brings together capabilities such as:

* Clients
* Projects
* Tasks
* Kanban workflows
* Invoicing
* Payments
* Automations
* Integrations
* Files
* Forms
* Communication
* Reporting
* Scheduling
* Business workflows
* AI-assisted productivity
* Adobe-related integrations
* External service integrations

The philosophy behind lancee is:

> Give people more time to do the work that actually creates value.

The product should therefore feel like a **professional workspace**, not an AI gimmick and not another Silicon Valley SaaS clone.

Do not overuse terms such as:

* AI-powered
* revolutionary
* game-changing
* supercharge
* unlock your potential
* next-generation

Keep the language practical, confident, human, and professional.

---

# 2. Technical Requirements

Build the component using:

* React 19+
* TypeScript
* Tailwind CSS
* Lucide React icons
* Framer Motion only where subtle motion genuinely improves the experience
* Existing project component system where available
* Existing project theme tokens wherever possible

Component structure should be clean and reusable.

Suggested structure:

```text
components/
  pricing/
    PricingSection.tsx
    PricingCard.tsx
    PricingFeature.tsx
    PricingComparison.tsx
    BillingToggle.tsx
    AddOns.tsx
    pricing-data.ts
```

Do not introduce unnecessary dependencies.

The implementation must be:

* Responsive
* Accessible
* Keyboard friendly
* Mobile-first
* Easy to maintain
* Data driven
* Production ready

---

# 3. First Inspect the Existing Lancee UI

Before implementing anything:

1. Inspect the existing application.
2. Identify the existing:

   * typography
   * border radius
   * spacing
   * card design
   * sidebar/dashboard styling
   * button styles
   * accent colours
   * dark/light theme behaviour
3. Reuse those conventions.
4. Do not redesign the entire visual language.
5. Do not modify unrelated working components.

If a pricing component already exists:

* inspect it first
* preserve working business logic
* improve the UI incrementally
* do not remove existing functionality without a reason

---

# 4. Design Direction

The pricing page should look like an extension of the lancee workspace.

Think:

**Not:** three marketing cards floating in empty space.

**Instead:** a structured workspace where the user is choosing how much operational capacity they need.

The design should communicate:

> Start with what you need. Add capacity as your business grows.

Use a sophisticated modern dashboard aesthetic.

Visual characteristics:

* restrained use of borders
* soft depth
* subtle glass effects if already present in lancee
* excellent spacing
* strong typography hierarchy
* large plan price
* compact feature descriptions
* minimal decorative noise
* subtle animations
* polished hover states
* excellent dark mode

Avoid excessive gradients.

Avoid oversized blobs, glowing circles, random illustrations, and excessive visual decoration.

---

# 5. Unique Lancee Pricing Concept

Do not simply present pricing as Bronze / Silver / Gold.

Create plans based around how people actually work.

Use:

## Solo

For independent professionals who need a central place to run their work.

Example positioning:

> Everything you need to organise clients, projects and getting paid.

Include capabilities such as:

* 5 active clients
* Unlimited projects
* Project workspace
* Kanban boards
* Tasks
* Basic invoicing
* Payment tracking
* Basic forms
* File management
* Calendar
* Basic integrations
* 2 workflow automations
* Email support

---

## Pro

For freelancers and professionals who increasingly rely on lancee to operate their business.

Example positioning:

> Run the operational side of your business from one workspace.

Include:

* Unlimited clients
* Unlimited projects
* Advanced project workflows
* Custom project statuses
* Advanced invoicing
* Payment integrations
* Recurring invoices
* Proposals / estimates
* Advanced forms
* Client portal
* Automations
* Scheduled workflows
* Webhooks
* External integrations
* Reporting
* Time tracking
* Branding controls
* Priority support

This should visually be the recommended plan, but DO NOT use the tired giant ribbon design.

Instead, highlight it through:

* slightly stronger border
* subtle elevation
* small understated `Recommended` label
* maybe a slight size difference on desktop

---

## Studio

For small teams, studios, agencies and growing businesses.

Example positioning:

> Bring your clients, team and workflows into one operating system.

Include:

* Everything in Pro
* Multiple team members
* Roles & permissions
* Shared workspace
* Team assignments
* Approval workflows
* Client collaboration
* Advanced reporting
* Workflow templates
* More automation runs
* Shared integrations
* Custom workspace branding
* Audit history
* Priority onboarding

---

# 6. Dynamic Regional Pricing Strategy

The pricing system must support **automatic regional pricing** based on the user's detected country after authentication.

Pricing should update automatically whenever:

* A user signs in
* Their account region changes
* Their billing region changes
* Their location is revalidated

Do **not** simply change the currency symbol.

Each supported region has its own pricing.

The frontend should never hardcode pricing values.

Instead, load pricing from a centralized configuration or API.

Example structure:

```ts
type Region = "ZA" | "US" | "UK" | "OTHER";
```

Example configuration:

```ts
const pricing = {
  ZA: {
    currency: "ZAR",
    symbol: "R"
  },
  US: {
    currency: "USD",
    symbol: "$"
  },
  UK: {
    currency: "GBP",
    symbol: "£"
  }
}
```

Unknown countries should default to:

* USD pricing
* converted into the user's local currency using the application's exchange-rate service
* rounded appropriately for display

Never attempt conversion in the UI using hardcoded exchange rates.

The backend should provide converted pricing.

---

# 7. Plans

## Solo

### Pricing

South Africa

```text
R199.99 / month
```

United States

```text
$15.00 / month
```

United Kingdom

```text
£10.00 / month
```

Other Countries

Automatically convert from the USD price.

---

### Includes

* Unlimited clients
* Unlimited projects
* Up to 10 workflow automations
* All integrated workflows
* Add up to 5 team members
* AI available as an optional add-on
* Includes 5 complimentary AI actions per month
* Everything else included

Primary CTA:

```text
Start with Solo
```

---

## Pro

### Pricing

South Africa

```text
R399.99 / month
```

United States

```text
$29.00 / month
```

United Kingdom

```text
£20.00 / month
```

Other Countries

Automatically convert from the USD price.

---

### Includes

* Unlimited clients
* Unlimited projects
* Up to 50 workflow automations
* All integrated workflows
* Add up to 50 team members
* AI available as an optional add-on
* Includes 20 complimentary AI actions each month
* Everything else included

Primary CTA:

```text
Choose Pro
```

This should remain the recommended plan.

Highlight it subtly using:

* stronger border
* slightly elevated card
* understated "Recommended" label

Do not use oversized ribbons or excessive visual effects.

---

## Studio

Studio pricing is charged **per active team member**.

Display pricing as:

South Africa

```text
R799.99
per user / month
```

United States

```text
$50.00
per user / month
```

United Kingdom

```text
£38.00
per user / month
```

Other Countries

Automatically convert from the USD price.

---

### Includes

* Unlimited clients
* Unlimited projects
* Unlimited workflow automations
* All integrated workflows
* Fully featured AI included for every licensed user
* Unlimited team members
* Everything included

Primary CTA

```text
Start with Studio
```

---

# 8. Free Trial

Instead of a permanently restricted free plan, lancee should provide a generous onboarding experience.

Every newly registered workspace receives:

```text
14-day Solo Trial
```

The trial includes:

* Every Solo feature
* No client limitations
* No project limitations
* Up to 10 automations
* Full workflow access
* Team collaboration
* 5 AI actions

After the trial expires:

Users can:

* Subscribe to Solo
* Upgrade to Pro
* Upgrade to Studio

If no subscription is chosen:

* Workspace becomes read-only
* Existing data is preserved
* Users can still sign in
* Billing prompts remain available
* No data should be deleted

---

# 9. Pricing Behaviour

The pricing component must automatically:

* Detect the user's billing region
* Display the correct regional pricing
* Display the correct currency symbol
* Format numbers using locale-aware formatting
* Animate pricing transitions when billing region changes
* Animate pricing transitions when Monthly/Yearly billing changes

Never flash incorrect pricing while loading.

Use loading placeholders until pricing has been resolved.

---

# 10. Annual Billing

Provide both billing options.

Monthly

Yearly

Yearly should display approximately two months free.

Examples:

Solo

```text
R199.99/month

or

R1,999/year
```

Display a small label:

```text
Save 2 months
```

Apply the same logic to every supported region.

---

# 11. AI Messaging

Do not market AI as the primary product.

Instead present it as another productivity capability.

Example wording:

> AI is available when you need it. Complimentary AI actions are included with every subscription, with additional usage available as your business grows.

This reinforces that lancee is a business operating platform first, with AI as one of many integrated tools.


# 12. Primary CTA Behaviour

Each plan should have a clear CTA.

Examples:

Solo:

```text
Start with Solo
```

Pro:

```text
Choose Pro
```

Studio:

```text
Start with Studio
```

If the user is already authenticated and has a subscription context available:

Display:

```text
Current plan
```

or:

```text
Upgrade to Pro
```

Do not fake subscription state.

Reuse the application's existing billing/subscription logic if available.

---

# 13. Enterprise / Custom Needs

Do NOT add a giant fourth Enterprise pricing card.

Instead add a slim section beneath the pricing area:

```text
Need something more specific?

For larger teams, custom integrations or dedicated workflows,
we can configure lancee around the way your business operates.

Talk to us →
```

This should look like a professional callout rather than another pricing plan.

---

# 14. Copywriting Style

The writing should feel like lancee.

Use language such as:

```text
Run the work. Not the admin.

One workspace for the operational side of your business.
```

Possible pricing heading:

```text
Choose how you want to work
```

Supporting copy:

```text
Start with the workspace you need today and expand as your business grows.
```

Another acceptable direction:

```text
A workspace that grows with the work.
```

Avoid:

```text
Pricing that scales with your success!
```

or generic SaaS phrases.

---

# 15. Recommended Page Structure

Build the page roughly as:

```text
-------------------------------------------------

Pricing Eyebrow

Choose how you want to work

Start with the workspace you need today and
expand as your business grows.

          Monthly | Yearly

-------------------------------------------------

      SOLO         PRO         STUDIO

      price        price        price

      purpose      purpose      purpose

      CTA          CTA          CTA

      key          key          key
      features     features     features

-------------------------------------------------

Build your workspace

[ Automation+ ] [ Forms+ ] [ Adobe+ ]
[ Payments+ ]   [ Storage+ ] [ Team Seats ]

-------------------------------------------------

Compare plans

Core Workspace
Business
Automation
Collaboration

-------------------------------------------------

Need something more specific?
Custom integrations / teams / workflows

Talk to us →

-------------------------------------------------
```

---

# 16. Interaction Details

Add subtle interaction polish.

Use:

* hover elevation
* subtle card border transitions
* animated pricing change when billing frequency changes
* accordion transitions for comparison groups
* subtle checkmark entrance animation
* button hover feedback

Do not make cards bounce, rotate, float, or constantly animate.

Animations should feel like a professional productivity application.

---

# 17. Desktop Layout

For desktop:

* max-width around 1200–1400px
* three main plan cards in one row
* Pro may be subtly elevated
* cards should have consistent vertical alignment
* CTA buttons should line up
* feature groups should remain visually balanced

Avoid enormous empty spaces.

---

# 18. Mobile Layout

On mobile:

* pricing cards stack vertically
* billing toggle stays visible near heading
* recommended plan can appear first or second depending on existing product strategy
* buttons should be full width
* tap targets must be generous
* avoid horizontal scrolling unless absolutely necessary
* comparison table must transform appropriately

---

# 19. Accessibility

Implement:

* semantic sections
* accessible buttons
* keyboard interaction
* visible focus states
* appropriate `aria-*` labels
* correct heading hierarchy
* sufficient contrast
* no critical information communicated exclusively through colour

---

# 20. Data Architecture

Keep pricing content separate from presentation.

Example:

```ts
export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  recommended?: boolean;
  capacity: number;
  cta: string;
  features: {
    label: string;
    included: boolean;
    value?: string;
  }[];
}
```

Create:

```ts
pricing-data.ts
```

The main components should render from this configuration.

This will allow pricing data to eventually come from an API without rewriting the interface.

---

# 21. Component APIs

Aim for reusable APIs.

Example:

```tsx
<PricingSection
  plans={plans}
  billingPeriod={billingPeriod}
  onBillingPeriodChange={setBillingPeriod}
  currentPlan={currentPlan}
/>
```

and:

```tsx
<PricingCard
  plan={plan}
  billingPeriod="monthly"
  current={false}
/>
```

---

# 22. Visual Details

Where appropriate, include subtle lancee-specific elements.

For example, cards could use a visual structure resembling connected workflow blocks:

```text
Clients
   ↓
Projects
   ↓
Work
   ↓
Payments
```

For Studio:

```text
Clients ─ Projects ─ Team
   │          │         │
Payments   Workflows  Approvals
```

This can be an extremely subtle background motif.

Do not turn it into a full workflow diagram.

The purpose is simply to reinforce that lancee connects operational work.

---

# 23. Important Design Constraint

The pricing experience should NOT communicate:

> Pay more to unlock random features.

It should communicate:

> Choose the amount of operational capability your way of working requires.

That distinction should influence the hierarchy, wording and visual presentation.

---

# 24. Preserve Existing Functionality

Before editing the application:

* locate existing subscription logic
* locate auth context
* locate routing
* locate theme system
* locate reusable card/button components

Do not break:

* authentication
* dashboard
* projects
* existing subscriptions
* billing integrations
* responsive navigation
* dark mode
* routes

Make the smallest necessary changes outside the pricing feature.

---

# 25. Expected Deliverables

After implementation, provide:

1. The completed pricing React components.
2. Pricing configuration/data file.
3. Any new helper utilities.
4. Description of files created or modified.
5. Explanation of how billing period state works.
6. Explanation of where real subscription/payment logic should connect.
7. Any assumptions made.
8. Confirmation that existing functionality was preserved.

---

# 26. Quality Standard

Before finishing, inspect the page as if you were reviewing a premium commercial application.

Ask:

* Does this look like lancee?
* Does it feel designed rather than templated?
* Are the plans understandable within five seconds?
* Is the difference between Solo, Pro and Studio obvious?
* Does Pro naturally feel like the best fit for most users?
* Does the modular add-on concept make sense?
* Are prices easy to update?
* Is mobile genuinely usable?
* Is the interface visually consistent with the existing app?
* Would this still look professional without animations?

If the answer to any of these is no, refine it before considering the task complete.

The final result should feel like a thoughtfully designed part of the lancee operating system rather than a pricing template added onto it.
