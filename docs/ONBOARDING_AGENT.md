**Where it sits in the pipeline**
It becomes a new entry node *before* CRM population — call it the **Setup Agent**. It's not a separate product; it's Workspace AI running before a Business Workspace exists, with elevated permissions to write into CRM, Automation Engine, and Knowledge Base directly.

**Core components needed**

- **Conversational state layer** — an LLM agent doing slot-filling (business_type, team_size, billing_model, tool_stack) from free text, not a fixed step index. It only asks for a slot it can't infer.
- **Tool Connector Layer** — OAuth handlers per integration (Gmail, Stripe, GitHub, Slack, Drive). Each connector exposes a standard `import()` job to the Automation Engine.
- **Inference Engine** — the "don't ask if you can infer" logic. Examples:
  - Stripe invoice history → infers billing model (project/hourly/retainer) instead of asking
  - GitHub org + Slack member count → infers team size
  - Gmail thread patterns → infers who counts as a "client" vs internal contact
- **Import/Migration Engine** — turns each connected tool into CRM/Workspace objects: Gmail contacts → Contacts, Stripe customers → Clients, GitHub repos → Projects, past invoices → Invoice templates.
- **Automation Recipe Builder** — generates the actual n8n workflows (approval chains, invoice cadence, notification routing) based on the inferred profile, rather than a human configuring them.
- **Knowledge Base ingestion** — embeds historical emails/docs so Workspace AI has context on day one instead of starting cold.

**The key architectural shift: onboarding never "completes"**
The Setup Agent and the ongoing Ops Manager should be the *same process*, just changing cadence — onboarding is high-frequency conversation, steady-state is scheduled (Monday-morning digest, event-triggered nudges). That digest you described is just Workspace AI's existing modules (Risk Detection, Client Follow-ups, Task Automation) running on a cron via the Event Engine, then routing drafted outputs through the same **human-approval gate** the model already uses at the "Approved?" step — nothing gets sent without a tap.

**Two things worth being deliberate about**

1. **Consent scope on historical data** — reading past emails/docs to "learn" the business is powerful but needs explicit, granular opt-in (and matters for POPIA if you're marketing this in SA).
2. **Incremental import, not one big sync** — importing everything synchronously in "5 minutes" is a good UX promise but a bad engineering plan; queue it and show live progress instead ("Imported 40 of 210 contacts...") so the conversation can end before the import does.
