# Core utility services

Three credential-free services reuse the hardened Python worker runtime. They
are intentionally deterministic, bounded, and side-effect free, making them
safe building blocks for applications and agents.

## Text Processing Worker

Service ID: `text-worker`

| Tool | Purpose |
| --- | --- |
| `transform_text` | Lowercase, uppercase, title-case, snake-case, kebab-case, or trim text |
| `text_stats` | Count characters, UTF-8 bytes, words, lines, and non-blank lines |
| `find_replace` | Apply up to 100 literal replacements in insertion order |

```bash
curl --fail \
  --header "Authorization: Bearer $MCP_API_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"text":"New Service Name","operation":"kebab"}' \
  "$MCP_GATEWAY_URL/api/v1/tools/transform_text/call"
```

## Structured Data Worker

Service ID: `data-worker`

| Tool | Purpose |
| --- | --- |
| `csv_to_json` | Parse a header-based CSV/delimited document, bounded to 1,000 rows |
| `json_to_csv` | Serialize up to 1,000 JSON records with optional field ordering |
| `select_fields` | Project records onto up to 100 ordered fields |

```python
result = await tools.invoke("csv_to_json", {
    "csv_text": "name,count\nalpha,2\nbeta,3\n"
})
print(result["data"])
```

Nested JSON values are encoded compactly when written into CSV cells. Input
that exceeds a declared row limit is rejected instead of being silently
truncated.

## Encoding & Identifier Worker

Service ID: `utility-worker`

| Tool | Purpose |
| --- | --- |
| `hash_text` | SHA-256, SHA-512, or BLAKE2b content digest |
| `base64_encode` | Standard or URL-safe UTF-8 Base64 encoding |
| `base64_decode` | Validated Base64-to-UTF-8 decoding |
| `generate_uuids` | Generate up to 100 UUIDv4 identifiers |

Base64 is transport encoding, not encryption. `hash_text` creates content
fingerprints and must not be used as password storage.

## Seeded skills

- `content_normalization` composes all text tools.
- `tabular_data_exchange` converts and projects CSV/JSON data.
- `safe_encoding_utilities` documents safe hashing, encoding, and identifier use.

## Operations

All three services use the same worker image but register independent leases,
routes, health checks, catalogs, and resource limits. Reconcile their catalog
entries with:

```bash
set -a
. ./.env
set +a
MCP_API_TOKEN="$PUBLIC_API_TOKEN" make seed
```
