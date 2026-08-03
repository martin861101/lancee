# Automation actions and mail rules

Native Core automations are permissioned, bounded workflows. A workflow can
only execute tools selected when the automation is created.

## Create a project from a matching email

1. Create a Core automation and enable **Create projects**.
2. Activate the automation.
3. In Messages → Automation rules, create a rule with the sender, subject,
   recipient, or keyword conditions you need.
4. Choose **Create a project from this email** as the action.

The built-in action:

- uses the subject as the project name;
- uses the plain-text email body as the project scope;
- resolves the first sender email against the workspace's clients;
- creates a client when that email is not present;
- creates the job card and draft invoice associated with the project; and
- uses the rule id and message id as an idempotency key, so a message cannot
  create duplicate projects when a run is retried.

Client email matching is case-insensitive and workspace-scoped. Existing
client names are not overwritten when an email match is found.

## Structured actions

API clients can create a mail rule with a JSON plan and the following template
fields:

```json
{
  "steps": [
    {
      "tool": "projects.create",
      "input": {
        "name": "{{subject}}",
        "clientName": "{{senderName}}",
        "clientEmail": "{{senderEmail}}",
        "scope": "{{body}}",
        "status": "In progress",
        "sourceKey": "mail:{{ruleId}}:{{messageId}}"
      }
    }
  ]
}
```

Template values are expanded as JSON values rather than by string-splicing, so
quotes and newlines in an email cannot corrupt the plan. Rules are validated
against the selected automation's permissions before they are saved.

## Reliability behavior

Mail events are claimed once per workspace, rule, and message. The event stays
processing while the Core run is queued and is marked completed only after the
run finishes. Failed runs retain the failure message in the mail event and the
automation run log.

Use `npm run verify:mail-automation` for matcher and template checks, and
`npm run verify:core-edge` for the end-to-end permission, client-linking, and
idempotent project checks.
