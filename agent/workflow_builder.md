You are implementing Phase 1 of Lancee’s intelligent AI workflow builder as one complete vertical slice. Inspect the existing repository architecture before changing anything. Preserve workspace isolation, security, approvals, idempotency, Core/Edge separation, queues, execution logs and backward compatibility.

Required outcome

The implementation is complete only when this exact flow works end to end:

> User: “When an email arrives from projects@acme.co.za, create a project and generate an initial task with useful notes from the email.”



Then:

1. The assistant produces one complete workflow proposal.


2. The proposal includes an exact sender trigger and every required action.


3. The user sees a human-readable preview.


4. The user approves it once.


5. The workflow and trigger are saved atomically and activated.


6. A matching email is received.


7. Lancee determines whether it represents a genuine project request.


8. It extracts structured project and task information.


9. It finds or creates the sender as a client.


10. It creates an idempotent project.


11. It creates a task inside that exact project.


12. The task uses a useful generated title and notes derived from the email.


13. Reprocessing the same message creates no duplicate client, project or task.



Do not treat schema definitions, mocked planner output, isolated endpoint tests or manually constructed workflow JSON as sufficient proof.

1. Canonical capability registry

Create or extend one canonical registry for Core workflow capabilities. The assistant schema, validator, runtime and UI must derive their supported capability lists from this source where practical.

Fix the existing create_workflow contract drift: projects.create exists in the Core catalogue but is absent from the assistant-facing schema.

Phase 1 must support these typed capabilities:

ai.extract_project_request

clients.find_or_create

projects.create

tasks.create


Each capability must define:

ID and description

input schema

output schema

mutation/read classification

required permission

approval/risk metadata

runtime handler

execution logging behaviour


Do not maintain separate handwritten capability enums that can silently drift.

2. Unified versioned workflow definition

Introduce a versioned workflow definition containing its trigger, conditions and steps:

{
  "version": 1,
  "name": "Create projects from Acme emails",
  "trigger": {
    "type": "mail.received",
    "conditions": [
      {
        "field": "sender.email",
        "operator": "equals",
        "value": "projects@acme.co.za"
      }
    ]
  },
  "steps": [
    {
      "id": "understand_request",
      "tool": "ai.extract_project_request",
      "input": {
        "subject": "{{event.subject}}",
        "body": "{{event.body}}"
      }
    },
    {
      "id": "resolve_client",
      "tool": "clients.find_or_create",
      "input": {
        "email": "{{event.sender.email}}",
        "name": "{{event.sender.name}}"
      }
    },
    {
      "id": "create_project",
      "tool": "projects.create",
      "input": {
        "name": {
          "$ref": "steps.understand_request.output.projectName"
        },
        "clientId": {
          "$ref": "steps.resolve_client.output.id"
        },
        "scope": {
          "$ref": "steps.understand_request.output.summary"
        },
        "sourceKey": "mail:{{event.messageId}}"
      }
    },
    {
      "id": "create_task",
      "tool": "tasks.create",
      "input": {
        "projectId": {
          "$ref": "steps.create_project.output.id"
        },
        "title": {
          "$ref": "steps.understand_request.output.task.title"
        },
        "notes": {
          "$ref": "steps.understand_request.output.task.notes"
        },
        "sourceKey": "mail:{{event.messageId}}:initial-task"
      }
    }
  ]
}

You may adapt field names to existing conventions, but preserve the semantics.

Triggers and workflow actions must no longer be independently created when the assistant builds this flow. Save the definition and its trigger in one database transaction. Never leave an active workflow without its requested trigger.

Add backward-compatible migrations. Do not destructively replace existing automations or mail rules. Existing workflows must continue to execute.

3. Trigger model

Implement mail.received for Phase 1.

Support typed conditions for:

sender email

recipient email

subject

body/subject keywords

all/any matching where compatible with existing rules


The example must use normalized, case-insensitive exact email matching—not a fuzzy substring—for the supplied full sender address.

Reuse the existing mail polling, message-claiming and mail-rule idempotency mechanisms where possible.

Email fields available to workflows must include:

{
  "messageId": "",
  "subject": "",
  "body": "",
  "sender": {
    "name": "",
    "email": ""
  },
  "recipients": []
}

Apply existing safe size limits and sanitization.

4. Safe result references

Add typed references to outputs from earlier steps:

{"$ref":"steps.create_project.output.id"}

Rules:

References may only target earlier completed steps.

Forward references are invalid.

Unknown step IDs or output paths are invalid.

Resolve references immediately before executing the dependent step.

Validate the resolved input against the target capability’s input schema.

Validate every step output against its output schema before making it referenceable.

Never allow references to workspace IDs, user IDs, credentials or undeclared runtime internals.

Store sanitized resolved inputs in execution logs.

Give failures stable error codes and understandable messages.

Detect duplicate step IDs and dependency cycles during validation.


Support safe event templates such as {{event.subject}}, but keep event references distinct from step-result references.

5. Intelligent email extraction

Implement ai.extract_project_request using the existing provider-independent AI abstraction and strict structured output.

Required output:

{
  "isProjectRequest": true,
  "confidence": 0.9,
  "projectName": "Acme packaging refresh",
  "summary": "Refresh the product packaging for the September launch.",
  "task": {
    "title": "Review packaging requirements",
    "notes": "Review the supplied requirements, confirm missing dimensions and prepare the initial concept."
  },
  "requestedDeadline": null,
  "priority": "normal",
  "missingInformation": []
}

Validation requirements:

isProjectRequest: boolean

confidence: number between 0 and 1

bounded nonempty project and task titles when applicable

bounded summary and task notes

nullable normalized deadline

constrained priority enum

bounded string array for missing information


Treat the subject and body as untrusted data. Prompt injection inside an email must never change the workflow, select tools, authorize actions, expose credentials or bypass approval.

Do not silently copy the complete raw email body into task notes when extraction fails.

Confidence policy:

confidence >= 0.85 and isProjectRequest=true: continue.

0.60–0.84: do not create business records; persist a reviewable draft/result and notify the user.

< 0.60 or isProjectRequest=false: skip safely and record the reason.

provider failure or invalid structured output: fail safely or create a review item according to existing failure conventions; never continue with guessed values.


Make thresholds named configuration/constants with tests.

6. Client, project and task actions

Implement or expose:

clients.find_or_create

Normalize email.

Resolve existing clients by exact email.

Create a client only when none exists.

Handle concurrent requests safely.

Return a stable typed output.

Prevent cross-workspace resolution.


projects.create

Reuse the existing project creation service.

Accept the resolved client.

Use the email message ID as an idempotent source key.

Return the created or previously created project.

Preserve project/job-card/draft-invoice behaviour only if that is already the canonical project creation contract.


tasks.create

Reuse the existing project-task service.

Accept a project ID from the previous step.

Save generated title and notes.

Add durable idempotency using the workflow/message source key.

Validate that the project belongs to the authorized workspace.

Return the created or previously created task.


Add migrations needed for durable source keys or uniqueness constraints. Handle concurrency using database constraints/transactions rather than only in-memory checks.

7. Dedicated AI workflow planner

Do not rely on the general chat prompt to improvise workflow JSON.

Detect clear automation-building intent and route it to a dedicated structured planner supplied with:

supported triggers

canonical capability schemas

reference syntax

workspace-relevant connection state

security and approval constraints


The planner must return only a validated structure similar to:

{
  "status": "ready",
  "workflow": {},
  "assumptions": [],
  "warnings": [],
  "questions": []
}

Or:

{
  "status": "needs_clarification",
  "workflow": null,
  "assumptions": [],
  "warnings": [],
  "questions": [
    {
      "id": "sender_email",
      "question": "Which sender email address should trigger this workflow?"
    }
  ]
}

Requirements:

Ask a focused question only when required information is genuinely missing.

Persist or safely return the partial planning state so the user can answer without restarting.

Never invent sender addresses, client identities, record IDs or unavailable tools.

Use only registered capabilities.

Validate planner output deterministically before showing it.

Planner output alone must never perform mutations.


8. Preview and approval

Before saving or activating, show a human-readable preview containing:

workflow name

trigger

exact conditions

ordered actions

AI extraction behaviour

confidence policy

assumptions

warnings

records that may be created


For the target request, the preview should communicate:

> When a new email arrives from projects@acme.co.za, Lancee will check whether it contains a genuine project request, extract the project details, find or create the client, create the project and add an initial task with generated notes. Uncertain emails will be held for review.



Require one explicit human approval for the complete workflow proposal. Bind the approval to a hash/version of the validated definition so altered definitions cannot reuse old approval.

After approval, save and activate the workflow and trigger atomically. If any write fails, roll back everything.

Reuse the existing assistant proposed-action/approval continuation patterns where appropriate.

9. Dry-run simulation

Add an authenticated, workspace-scoped dry-run capability or endpoint.

It must accept a safely bounded sample/recent email and:

evaluate trigger conditions

run or safely simulate structured extraction

show confidence classification

resolve the client outcome without creating it

resolve planned project/task inputs

validate every step

perform zero business-record writes


Return a structured result such as:

{
  "trigger": "matched",
  "decision": "would_create",
  "confidence": 0.94,
  "project": {
    "name": "Acme packaging refresh"
  },
  "task": {
    "title": "Review packaging requirements",
    "notes": "..."
  },
  "warnings": [],
  "missingInformation": []
}

Prove through tests that dry-run does not create clients, projects, tasks, invoices or active rules.

A minimal preview UI is sufficient. Do not redesign the entire Automations or Messages interface.

10. Runtime and observability

Preserve durable workflow runs and step events.

Logs must clearly identify:

trigger matched/skipped

extraction started/completed/failed

confidence decision

step input resolution

action started/completed/failed

idempotent reuse versus new creation

review-required outcome

stable error codes


Do not log raw credentials, full unsafe provider responses or unnecessarily large email bodies.

Keep existing Redis/Core execution behaviour working. Do not redesign Edge/n8n unless compatibility requires a narrowly scoped change.

11. Verification requirements

Add focused unit, integration and end-to-end tests.

The primary end-to-end test must begin with the actual natural-language assistant request:

> “When an email arrives from projects@acme.co.za, create a project and generate an initial task with useful notes from the email.”



It must prove:

1. The assistant creates a valid complete proposal.


2. The preview contains the correct exact sender and actions.


3. Approval is required.


4. Approval saves and activates the workflow and trigger atomically.


5. A matching email triggers the workflow.


6. Extraction produces structured project/task information.


7. The client is resolved or created.


8. The project is created.


9. The task is linked to that exact project.


10. The task contains generated notes.


11. Reprocessing the message creates no duplicates.



Also cover:

full-address exact sender matching

case normalization

nonmatching sender

ordinary non-project email

medium-confidence review handling

low-confidence skip handling

provider failure

invalid structured AI output

task and project idempotency

result-reference resolution

invalid/forward references

duplicate step IDs

transaction rollback

approval denial

approval-definition hash mismatch

cross-workspace access rejection

malicious prompt-injection text inside email

dry-run performing zero writes

legacy automation/mail-rule compatibility


Do not count manually constructed workflow JSON alone as proof of assistant capability.

Implementation order

1. Trace and document the current assistant, MCP, automation, mail-rule, Core runtime, project and task paths.


2. Define the canonical schemas and versioned workflow format.


3. Add backward-compatible persistence migrations.


4. Implement capability handlers and result references.


5. Implement transactional workflow/trigger creation.


6. Implement the dedicated workflow planner.


7. Connect preview and approval continuation.


8. Implement runtime AI extraction and confidence handling.


9. Implement dry-run.


10. Add the full vertical-slice verification.


11. Run existing relevant regression checks.



Scope controls

Do not redesign unrelated UI.

Do not add unrelated trigger types.

Do not broadly rewrite the agent runtime.

Do not replace working security, queue, approval or idempotency systems.

Do not weaken CSRF, authentication or workspace authorization.

Do not remove legacy workflow support.

Do not introduce provider-specific planner logic.

Do not execute raw SQL supplied by AI.

Do not allow arbitrary tool names or arbitrary template paths.

Do not activate partially created workflows.

Do not perform writes during dry-run.

Do not commit, push or deploy.


If a foundational limitation makes the vertical slice unsafe or impossible, stop and report the precise blocker and the smallest required prerequisite. Do not simulate completion.

Completion procedure

Run at minimum:

relevant workflow, MCP, mail and Core verification scripts

new Phase 1 end-to-end verification

build

lint


Fix regressions caused by the implementation.

Finish with:

concise architectural summary

changed files

migrations added

tests and commands run with results

manual verification steps

remaining limitations

confirmation that nothing was committed, pushed or deployed
