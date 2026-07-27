# Registry API

Internal base URL: `http://orchestrator:8000`  
Public discovery base URL: `http://localhost:8089/registry`

## Authentication

Registration, heartbeat, and deregistration require the service-scoped registration bearer token. Public discovery is protected at Traefik by the public client token.

## Endpoints

### `POST /v1/services/register`

```json
{
  "service_id": "example-worker",
  "display_name": "Example Worker",
  "internal_mcp_url": "http://example-worker:8000/mcp",
  "health_url": "http://example-worker:8000/healthz",
  "revision": "image-digest-or-git-sha",
  "instance_id": "84ba990f-4594-46ee-8388-1fa89229ef49"
}
```

Internal URLs must use HTTP, their host must exactly equal `service_id`, and their paths must be `/mcp` and `/healthz`. A repeated request from the same instance renews and returns its existing lease. A new authenticated instance replaces the old lease.

Response `201`:

```json
{
  "service_id": "example-worker",
  "lease_id": "725231e0-f39b-463a-a48d-358ea5275f09",
  "public_mcp_url": "http://localhost:8089/services/example-worker/mcp",
  "lease_ttl_seconds": 60,
  "heartbeat_interval_seconds": 20
}
```

### `PUT /v1/services/{service_id}/heartbeat`

Send `{"lease_id":"..."}`. A valid lease returns `204`; a missing, expired, or superseded lease returns `404`.

### `DELETE /v1/services/{service_id}?lease_id={lease_id}`

Gracefully releases the current lease and returns `204`.

### `GET /v1/services`

Returns only unexpired public descriptors:

```json
{
  "services": [
    {
      "service_id": "example-worker",
      "display_name": "Example Worker",
      "public_mcp_url": "http://localhost:8089/services/example-worker/mcp",
      "revision": "development",
      "last_seen": "2026-07-15T12:00:00Z"
    }
  ]
}
```

### `GET /v1/services/{service_id}`

Returns one public descriptor or `404`.

### `GET /healthz` and `GET /readyz`

Liveness checks the process. Readiness verifies Redis connectivity.

Application-facing capability discovery and tool invocation are documented
separately in [`toos-api.md`](toos-api.md). Those `/api/v1` endpoints are public
gateway routes, not worker registration endpoints.
