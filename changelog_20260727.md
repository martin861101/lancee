# Dashboard Integration Enhancement

Date: 2026-07-27

- Replaced the Connections page's demo-only request action with a durable
  application API at `POST /api/integration-requests`.
- Added workspace-scoped persistence, input validation, and idempotent mutation
  handling for business connection requests.
- Corrected the database idempotency replay contract so repeat mutations return
  the saved response instead of failing.
- Aligned API-key permission middleware with its database lookup result so
  scoped API requests authenticate correctly.
- Added a Connections modal that captures the requested system, category, and
  optional workflow details.
- Documented the integration boundary: business systems are handled by the
  application backend, while MCP stays available for narrow, approved tools and
  skills.
