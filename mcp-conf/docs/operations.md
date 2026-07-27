# Operations

## Local deployment

Create `.env` from `.env.example`, set two independent random tokens, then run:

```bash
docker compose config --quiet
docker compose up --build --detach --wait
docker compose ps
```

Check discovery:

```bash
curl --fail --header "Authorization: Bearer $PUBLIC_API_TOKEN" \
  http://localhost:8089/registry/v1/services
```

Check the application-facing façade:

```bash
curl --fail --header "Authorization: Bearer $PUBLIC_API_TOKEN" \
  http://localhost:8089/api/v1/capabilities
```

Run service tests with `make test`. With the stack running and `.env` exported, run the authenticated protocol smoke test with `make e2e`. Follow runtime logs with `docker compose logs --follow`.

## Health and failure behavior

- Redis failure makes registry readiness fail and prevents lease renewal.
- Registry failure eventually expires workers from discovery, but workers keep retrying registration.
- Worker failure removes its lease after at most 60 seconds.
- Auth failure closes the public boundary; internal registration remains available.
- Traefik starts only after the local stack's health dependencies pass.

## Data and recovery

Redis append-only persistence is stored in the `registry_data` volume. Registry data is reconstructible because workers re-register, but persistence prevents a discovery gap during registry restarts. Test recovery periodically by restarting Redis and the registry and confirming the worker remains or becomes discoverable again.

Avoid `docker compose down --volumes` unless lease data deletion is intended.

## Secret rotation

1. Generate a new random value.
2. Update the relevant secret in `.env` or the production secret store.
3. For worker credentials, update the registry mapping and worker together, then recreate both services.
4. For public tokens, allow overlap in the external identity provider during migration; the local adapter supports multiple token-to-subject entries when configured directly.
5. Confirm old credentials are rejected.

## Production migration

Before external exposure:

- Replace `auth/` with an OIDC-capable ForwardAuth service and scoped identities.
- Configure a TLS entrypoint and trusted certificates.
- Use Docker secrets or an external secret store instead of environment variables.
- Put a restricted socket proxy between Traefik and the Docker socket.
- Ship structured logs to a log backend and export latency, error, auth-failure, lease-expiry, and active-session metrics.
- Add alerts and tested backup/restore and rollback runbooks.
- Run more than one registry replica only after verifying Redis and gateway behavior under concurrency.

## Rollback

Pin image versions or digests in the deployment environment. To roll back, restore the previous image references and recreate services. Registry schemas are backward-compatible in version `v1`; introduce a new API version for breaking changes.
