# Scalability and PostgreSQL

## Runtime database selection

lancee now uses PostgreSQL whenever `DATABASE_URL` or `PGHOST` is configured.
`DATABASE_PATH` remains a durable SQLite fallback for local, single-process
development. Production and multi-instance deployments should use PostgreSQL.

The PostgreSQL adapter includes:

- A bounded connection pool (`PGPOOL_MAX`, default `20`).
- Configurable connect and idle timeouts.
- Optional TLS with certificate verification enabled by default.
- Checked-out-client transactions with commit/rollback.
- Transaction-scoped advisory locks for concurrent idempotent mutations.
- Workspace/status/time indexes for common run, project, invoice, delivery, and
  idempotency queries.
- Foreign keys and an immutable payment-reference relationship.
- Live query count and average-latency metrics.

## Docker Compose

Set a strong password in the server-only `.env` file:

```dotenv
POSTGRES_USER=lancee
POSTGRES_PASSWORD=replace-with-a-long-random-secret
POSTGRES_DB=lancee_app
```

Then start the application and PostgreSQL:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

The database port is not published to the host. The app reaches it on the
private Compose network as `db:5432`. The `pgdata` volume survives container
replacement.

## Managed PostgreSQL

Either set one connection string:

```dotenv
DATABASE_URL=postgresql://user:password@database.example.com:5432/lancee
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
```

Or set the individual `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and
`PGDATABASE` values. Do not set `DATABASE_PATH` in the production process.

Size `PGPOOL_MAX` per application instance. The sum across all instances must
remain below the database server's connection limit, with capacity reserved for
administration and migrations.

## Migrating existing SQLite data

Stop writes before migrating and back up both databases. Configure the
PostgreSQL destination and use the same administrator/workspace identifiers as
the source installation:

```bash
SQLITE_SOURCE_PATH=.runtime/lancee.sqlite \
DATABASE_URL='postgresql://user:password@host:5432/lancee' \
pnpm migrate:postgres
```

The migration creates the current destination schema, copies tables in foreign
key order inside one PostgreSQL transaction, and preserves destination rows
that already conflict. It never deletes or overwrites the SQLite source. Run it
against an empty destination when a complete one-to-one migration is required.

After migration:

```bash
DATABASE_URL='postgresql://user:password@host:5432/lancee' \
pnpm verify:postgres
```

Sign in, compare project/invoice/run counts, then switch application traffic.
Keep the SQLite backup until the PostgreSQL deployment has been observed and
backed up successfully.

## Horizontal scaling

PostgreSQL removes process-local data ownership and advisory locks prevent two
instances from executing the same idempotent mutation concurrently. Static
assets are route-split and can be cached by the reverse proxy.

The login limiter remains process-local. For a larger public deployment, move
rate-limit counters to a shared store such as Redis and run scheduled cleanup
for expired idempotency, invitation, and nonce records. n8n executes automation
runs asynchronously after the API accepts them; a dedicated durable job queue
is the next step when sustained run volume requires retries across process
crashes.

## Operations

- Back up PostgreSQL with provider snapshots or `pg_dump`.
- Test restores, not only backups.
- Keep `DATABASE_SSL_REJECT_UNAUTHORIZED=true` unless a controlled internal CA
  requires a different trust setup.
- Monitor pool saturation, query latency, webhook failures, and automation runs
  left in `running`.
- Run `pnpm verify:postgres` after database engine or schema changes.
