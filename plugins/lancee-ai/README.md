# lancee AI Codex plugin

This plugin connects Codex to the AI provider configured in a lancee workspace.
It uses a bundled stdio MCP bridge and an in-app device-code approval flow.

Tools:

- `connect`
- `ai_status`
- `complete`
- `run_workflow`
- `create_workflow`
- `get_workflow_status`
- `search_workflows`
- `execute_python`
- `execute_javascript`
- `schedule_job`
- `get_logs`
- `call_external_api`

The provider API key stays in the lancee backend. See
[`../../docs/LANCEE_MCP.md`](../../docs/LANCEE_MCP.md) for the workflow tool
contract, security boundaries, authentication, configuration, packaging, and
verification details.
