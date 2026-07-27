# MCP Service Interface

Workers expose MCP Streamable HTTP at `/mcp`. Public worker URLs follow:

```text
https://mcp.hygridtech.co.za/services/{service_id}/mcp
```

All public requests require:

```http
Authorization: Bearer <PUBLIC_API_TOKEN>
```

MCP-native clients should initialize a session, call `tools/list`, and invoke
`tools/call`. Ordinary server applications can instead use the supported TooS
REST façade under `/api/v1`; see [`docs/toos-api.md`](docs/toos-api.md).

The example worker provides:

| Tool | Arguments | Result |
| --- | --- | --- |
| `echo` | `message: string` | The unchanged message. |
| `add` | `left: number`, `right: number` | The numeric sum. |

Additional core workers provide:

| Service | Tools |
| --- | --- |
| `text-worker` | `transform_text`, `text_stats`, `find_replace` |
| `data-worker` | `csv_to_json`, `json_to_csv`, `select_fields` |
| `utility-worker` | `hash_text`, `base64_encode`, `base64_decode`, `generate_uuids` |

The equivalent SDK-free call is:

```bash
curl --fail \
  --header "Authorization: Bearer $PUBLIC_API_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"left":20,"right":22}' \
  https://mcp.hygridtech.co.za/api/v1/services/example-worker/tools/add/call
```

## lancee platform access

MCP is included with every lancee workspace. Users do not enter this DNS name
or the bearer token. They request bearer access in the platform, then activate
approved services from the catalog.

lancee keeps `MCP_API_TOKEN` in its server-only environment and adds the
`Authorization` header when calling the grid. The token must never be returned
by an API route or included in browser JavaScript.

Use the bundled Python client:

```bash
MCP_API_TOKEN="$PUBLIC_API_TOKEN" .venv/bin/mcp-grid --service example-worker
```

For a generated integration, open **Integrate** in the dashboard, choose tools
or skills, and run its `mcp-grid integrate` command inside the target project.
The installer prompts to inject into an existing file or create a new one and
shows a diff before writing. Generated code calls stable catalog tool IDs rather
than `/services/{service_id}/mcp`; see
[`docs/dynamic-integrations.md`](docs/dynamic-integrations.md).

The worker uses stateless JSON responses for horizontal scalability. Browser-origin requests are accepted only from the configured `WORKER_ALLOWED_ORIGINS`; non-browser SDK requests normally omit `Origin` and are authenticated by Traefik.
