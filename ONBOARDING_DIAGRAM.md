sequenceDiagram
    autonumber
    actor U as User
    participant SA as Setup Agent<br/>(Workspace AI - onboarding mode)
    participant TC as Tool Connectors<br/>(OAuth: Gmail/Stripe/GitHub/Slack/Drive)
    participant IE as Inference Engine
    participant IM as Import/Migration Engine
    participant CRM as CRM
    participant AE as Automation Engine (n8n)
    participant KB as Knowledge Base
    participant EE as Event Engine
    participant WAI as Workspace AI<br/>(steady-state / Ops Manager)

    rect rgb(235, 245, 255)
    Note over U,SA: PHASE 1 — Conversational onboarding
    U->>SA: "Tell me about your business"
    SA->>U: Minimal clarifying question (only if not inferable)
    U->>SA: Free-text answers (business type, team size, billing model)
    SA->>TC: Request connections (Gmail, Stripe, GitHub, Slack, Drive)
    U->>TC: Grants OAuth consent (incl. explicit historical-data scope)
    TC-->>SA: Connections confirmed
    end

    rect rgb(235, 255, 240)
    Note over SA,IM: PHASE 2 — Inference + import (async, queued)
    SA->>IE: Infer missing slots from connected data
    IE-->>SA: billing model, team size, client list inferred
    SA->>IM: Trigger incremental import jobs
    IM->>CRM: Create Clients / Contacts (from Gmail + Stripe)
    IM->>AE: Generate default Kanban boards, invoice templates,<br/>approval workflows, automation recipes
    IM->>KB: Ingest historical emails/docs (consented scope only)
    IM-->>SA: Live progress ("Imported 40 of 210 contacts...")
    SA-->>U: Progress updates in chat (non-blocking)
    end

    rect rgb(255, 245, 230)
    Note over SA,U: PHASE 3 — Handoff
    SA->>U: "Your workspace is ready" + summary of what was created
    Note over SA,WAI: Setup Agent and Ops Manager are the SAME agent —<br/>cadence shifts from conversational to scheduled/event-driven
    end

    rect rgb(250, 235, 245)
    Note over EE,WAI: PHASE 4 — Steady-state operations (ongoing)
    EE->>WAI: Scheduled trigger (Monday digest) or event trigger
    WAI->>CRM: Query billing cadence, stale clients
    WAI->>AE: Query blocked tasks / project status
    WAI->>WAI: Draft follow-up emails, invoice reminders
    WAI->>U: "2 projects ready for billing, 1 client unresponsive,<br/>3 blocked tasks. Drafted 2 follow-ups — send?"
    U-->>WAI: Approve / edit / decline (human-in-the-loop gate)
    WAI->>AE: On approval, trigger send via Gmail/Outlook connector
    end
