# Dynamic Integrations

Dynamic integrations remove the need to hand-code a route for every worker.
An operator selects tools and skills in the dashboard, the control plane expands
skill dependencies into concrete catalog tool IDs, and the local `mcp-grid`
installer creates or updates a small client module in the target application.

Generated modules call only the stable universal route:

```text
POST /api/v1/tools/{catalog_tool_id}/call
```

The registry resolves the catalog tool to its current service and live worker at
call time. Moving a tool to another worker therefore does not require an
application code change.

## Install the CLI

```bash
python -m venv .venv
.venv/bin/pip install /home/apps/mcp/clients/python
export MCP_GATEWAY_URL=https://mcp.hygridtech.co.za
export MCP_API_TOKEN='<PUBLIC_API_TOKEN>'
```

The token is used to fetch a plan and later invoke tools. Keep it in a
server-side environment or secret manager; generated code never contains it.

## Dashboard workflow

1. Open the dashboard and choose **Integrate**.
2. Choose TypeScript or Python and select one or more tools or skills.
3. Create the installation plan. Skills automatically add their required tools.
4. Copy the displayed command and run it from the application repository.
5. Choose an existing file or a new file, inspect the diff, and confirm it.
6. Install the client dependency printed by the command.

Plans expire after 15 minutes by default. Configure the Compose stack with
`INTEGRATION_PLAN_TTL_SECONDS` or a direct registry process with
`REGISTRY_INTEGRATION_PLAN_TTL_SECONDS` (60–86400 seconds). A downloaded plan
has the same expiry and can be installed with:

```bash
mcp-grid integrate --plan ./mcp-grid-plan.json
```

## CLI modes

Interactive installation:

```bash
mcp-grid integrate \
  --gateway "$MCP_GATEWAY_URL" \
  --plan-id 00000000-0000-0000-0000-000000000000
```

Automation or CI requires an explicit mode and target:

```bash
mcp-grid integrate \
  --plan ./mcp-grid-plan.json \
  --project /path/to/application \
  --mode new \
  --target src/integrations/mcp-grid.ts \
  --yes
```

Use `--mode existing` on later runs. Use `--dry-run` to print the proposed diff
without writing. `--yes` is rejected unless both `--mode` and `--target` are
provided.

The installer:

- confines the resolved target path to `--project`;
- accepts `.ts`, `.tsx`, or `.mts` for TypeScript and `.py` for Python;
- refuses to overwrite a file in `new` mode;
- requires the file to exist in `existing` mode;
- prints a unified diff before any write;
- writes atomically and preserves an existing file's mode;
- owns exactly one `<mcp-grid:generated>` block and replaces it idempotently.

Code outside the managed markers is not modified. Do not edit inside the block;
change the selection and apply a new plan instead.

## Generated interface

TypeScript exports:

```ts
selectedMcpTools
selectedMcpSkills
getMcpGridClient()
invokeMcpTool(toolId, arguments)
```

Python exports:

```python
SELECTED_MCP_TOOLS
SELECTED_MCP_SKILLS
get_mcp_grid_client()
invoke_mcp_tool(tool_id, arguments)
```

Both variants lazily read `MCP_API_TOKEN`, honor an optional
`MCP_GATEWAY_URL` override, and reject calls to tool IDs not included in the
plan. Skill instructions are embedded as application-readable metadata.

## Plan API

Authenticated control-plane routes:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/control/v1/integrations/plans` | Validate and expand a selection |
| `GET` | `/api/control/v1/integrations/plans/{plan_id}` | Retrieve a non-expired plan |

Create request:

```json
{
  "name": "Astryx research",
  "language": "typescript",
  "tool_ids": ["astryx_search"],
  "skill_ids": []
}
```

The server supplies the configured public gateway URL; callers cannot inject a
different gateway into a plan. Disabled, unknown, unassigned, or instructions-
only selections are rejected. Redis stores plans under an expiring namespace,
and plans are not added to the permanent catalog or activity history.

## Responsibility boundary

This workflow integrates existing executable tools. It does not install a new
worker implementation, mutate worker source, or deploy containers. Add a new
runtime capability using the worker development and deployment flow first,
seed its catalog definition, then expose it through the selector.

The browser deliberately cannot write into a local repository. The local CLI is
the only component that changes application files, so the operator can review a
real filesystem path and diff before confirming.
