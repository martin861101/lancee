# ADR 0003: Use Redis TTL leases

Status: accepted

The registry stores one TTL-backed record per service. Registration is idempotent per worker instance; heartbeat and deregistration compare the opaque lease ID atomically. Expiry removes failed workers without an active polling bottleneck.
