# Automation runtime

The dashboard workflow and automation surfaces now share one durable runtime.
They are not separate mock systems.

## Live request path

1. `/api/ai/chat` loads a workspace-scoped snapshot and the live MCP catalog.
2. The configured OpenAI-compatible/Hermes, Anthropic, or Gemini provider may
   return one native function call.
3. The dashboard renders that call as **Approve & run**; no tool runs before the
   authenticated user approves it.
4. `/api/mcp/invoke` routes the built-in `lancee` service to
   `createLanceeMcpRuntime`. Optional external services still route through the
   MCP gateway.
5. Workflow creation and schedules write to the database. Runs write to
   `automation_runs` and `automation_run_events`.
6. Core runs use Redis when connected and fall back to the web process when it
   is unavailable. Edge runs require a configured n8n connection and signed
   callback.
7. The **Results** dashboard page loads persisted events, opens the newest run
   automatically, and renders `step.completed`, `run.completed`, or
   `run.failed` output in a non-technical outcome view. The detailed event log
   and full JSON remain available behind disclosures.

The browser dispatches `lancee:automations-changed` after an approved assistant
action so Automations and Runs refresh from the API. Workflow recipe cards also
create and activate real Core automations.

Signed `lancee.automation.result` callbacks may return `output`, `result`, or
`summary`. The runtime sanitizes and persists the selected payload in
`automation_run_events`; callbacks without one still receive a visible status
and step-count outcome. The workspace assistant reads the same persisted events
and includes a concise result in its completion message.

## Function audit

| Function | Runtime behavior |
| --- | --- |
| `run_workflow` | Validates workspace ownership and active status, persists a run, queues Core or dispatches Edge, and records events. |
| `create_workflow` | Validates the Core catalog, persists the workflow, and activates it unless `activate: false`. |
| `get_workflow_status` | Returns workspace-scoped workflow, run, schedule, and recent-run state. |
| `search_workflows` | Searches persisted workspace workflows with bounded filters and limits. |
| `execute_python` | Runs bounded Python in an isolated temporary directory when the feature flag is enabled. |
| `execute_javascript` | Runs bounded Node.js in an isolated temporary directory when the feature flag is enabled. |
| `schedule_job` | Persists one-shot or recurring rows in `automation_schedules`; the scheduler claims due rows. |
| `get_logs` | Returns bounded persisted run events; `warn` is accepted as an alias for database level `warning`. |
| `call_external_api` | Calls bounded public endpoints while blocking credentials, redirects, authorization headers, and private/internal targets. |

## Boundaries

Core currently has six real tools: workspace summary, project/client/invoice
lists, project status update, and draft project invoice creation. The runner
rejects any plan step not granted to the saved workflow. Unsupported email,
CRM, or arbitrary provider actions are not presented as working templates.

Code execution is a bounded subprocess, not a complete kernel/container
sandbox. Keep it behind explicit user approval and move it to a dedicated
isolated worker before exposing it to untrusted production tenants.

## Verification

Run the focused suites:

```bash
npm run verify:ai
npm run verify:core-edge
npm run verify:codex-connector
npm run verify:workspace-flows
```

Or run the build, lint, and these critical suites together:

```bash
npm run verify:platform
```
