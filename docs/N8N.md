# Durable n8n webhook bridge

lancee implements a bidirectional, signed webhook bridge:

```text
lancee -- signed GET/POST --> n8n
lancee <-- signed GET/POST -- n8n
```

Configuration, nonce use, and every accepted or attempted delivery are durable
per workspace.

## Server configuration

```dotenv
N8N_BASE_URL=https://n8n.hygridtech.co.za
N8N_SIGNING_SECRET=
N8N_TIMEOUT_MS=10000
N8N_ALLOW_PRIVATE=false
N8N_PRIVATE_NETWORK=false
```

`N8N_BASE_URL` is the only allowed outbound origin. In the default public mode:

- the configured webhook must use HTTPS;
- embedded credentials and URL fragments are rejected;
- its origin must exactly match `N8N_BASE_URL`;
- DNS must resolve only to public addresses;
- redirects are rejected.

For the private queue-mode deployment, use the repository's
`docker-compose.edge.yml` overlay. It sets `N8N_BASE_URL=http://n8n:5678` and
enables private addresses only when both `N8N_ALLOW_PRIVATE=true` and
`N8N_PRIVATE_NETWORK=true` are explicitly set. The n8n and worker services have
no published ports; Redis is on an internal-only network.

`N8N_SIGNING_SECRET` is an optional bootstrap secret. The Connections UI can
set or rotate a workspace secret over the authenticated HTTPS session. lancee
encrypts it at rest with AES-256-GCM using a key derived from the persistent
server session secret. Configuration responses never return it.

`N8N_TIMEOUT_MS` is clamped between 250 and 30,000 milliseconds.

`N8N_ALLOW_PRIVATE=true` is accepted in production only together with
`N8N_PRIVATE_NETWORK=true`.

## Configure in lancee

1. Create and activate an n8n workflow with a production Webhook node.
2. Open **Connections → n8n**.
3. Enter a webhook on the configured n8n origin, for example:

   ```text
   https://n8n.hygridtech.co.za/webhook/lancee
   ```

4. Enter a shared secret of 32–256 characters.
5. Save configuration.
6. Send real outbound GET and POST deliveries.
7. Copy the generated inbound callback for the n8n HTTP Request node.
8. Use the inbound controls to verify lancee's stored signing and nonce
   contract. They do not impersonate an external n8n request.

The delivery-history panel shows successes, failures, inbound accepts, response
status, duration, attempt number, correlation ID, and retry actions.

## Signature contract

Every request carries:

```http
X-Lancee-Timestamp: <Unix milliseconds>
X-Lancee-Nonce: <base64url random value>
X-Lancee-Signature: <HMAC-SHA256 hex>
X-Lancee-Correlation-Id: <stable correlation id>
```

Outbound requests also carry:

```http
X-Lancee-Delivery-Id: <delivery id>
```

The canonical signing value is five newline-separated fields:

```text
timestamp
nonce
UPPERCASE_METHOD
path_and_query
sha256_hex_of_exact_body_bytes
```

The signature is:

```text
hex(HMAC-SHA256(shared_secret, canonical_value))
```

For GET, the body is empty. The query string and ordering are part of the
signed path. For POST, n8n must transmit the exact JSON bytes it hashed.

Inbound timestamps must be within five minutes of server time. Nonces are
stored per workspace and accepted once. Used nonces are retained beyond the
signature window and cleaned after ten minutes.

## Inbound callback

The generated route is:

```text
https://lancee.hookitupservices.com/api/hooks/n8n/<workspace-id>
```

Signed GET and POST calls return `202` with a durable accepted delivery record.
An event with type `lancee.automation.result` and a valid running `runId`
completes or fails that workspace-scoped automation run.

Responses:

- `202` — signature accepted and event recorded;
- `401` — missing, invalid, or expired signature metadata;
- `409` — nonce replay;
- `415` — POST was not sent as JSON;
- `404` — workspace connection is absent or disconnected.

## Outbound delivery and retry

Outbound delivery creates a `pending` record before network I/O. lancee sends
the signed request with redirects disabled, a bounded timeout, and up to three
exponentially delayed attempts for timeouts, connection failures, 429s, and
5xx responses, then records:

- `succeeded` with HTTP status and duration; or
- `failed` with a normalized error code, response status where available, and
  duration.

An idempotency replay never resends a completed attempt. A manual retry creates
a new attempt, retains the original correlation ID, links `retry_of`, and is
limited to five attempts. Delivery history stores a secret-free event envelope;
provider auth is decrypted and attached only immediately before the HTTP call.

## Saved automation execution

`POST /api/automations/runs` requires an active saved automation and a connected
n8n configuration. The API creates a durable `running` record, then sends a
signed `lancee.automation.run` POST event containing the run, automation,
instruction, workspace, requesting user identifiers, and the Core callback URL.
The run remains `running` after webhook acceptance and transitions to `completed`
or `failed` only after a signed `lancee.automation.result` callback.
`GET /api/automations/runs/:runId` exposes the current status for UI polling.

## Persistence

| Table | Responsibility |
| --- | --- |
| `n8n_connections` | URL, callback, methods, encrypted secret, and last delivery |
| `n8n_deliveries` | Secret-free event envelope, direction, method, correlation, status, response, duration, and retry lineage |
| `n8n_nonces` | Workspace-scoped inbound replay protection |

Disconnecting clears the outbound URL and encrypted credential while retaining
delivery history.

## Server routes

| Method | Route | Authentication |
| --- | --- | --- |
| GET | `/api/n8n/config` | Workspace session |
| POST | `/api/n8n/config` | Session + `Idempotency-Key` |
| POST | `/api/n8n/disconnect` | Session + `Idempotency-Key` |
| GET | `/api/n8n/deliveries` | Workspace session |
| POST | `/api/n8n/deliveries` | Session + `Idempotency-Key` |
| POST | `/api/n8n/deliveries/:deliveryId/retry` | Session + `Idempotency-Key` |
| POST | `/api/n8n/inbound-self-test` | Session + `Idempotency-Key` |
| GET/POST | `/api/hooks/n8n/:workspaceId` | Timestamped HMAC + unused nonce |

## Verification

```bash
pnpm build
pnpm lint
pnpm verify:n8n
```

The verifier runs lancee beside a local signed-webhook stub. It checks HTTPS
policy, exact-origin enforcement, encryption at rest, outbound GET/POST
signatures, idempotent replay, real inbound GET/POST, stale timestamps, nonce
replay, saved automation execution, failure recording, retry lineage,
disconnect behavior, and restart persistence. It makes no external request.
