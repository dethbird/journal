# Journal Tracker (Node + Prisma + Postgres)

This repo now holds the scaffolding for three services you sketched: \`api\`, \`collector\`, and \`web\`, all backed by Postgres via Prisma.

## Architecture

- `src/api/server.js`: Fastify-based API surface exposing health checks plus event/day read routes.
- `src/collector/run.js`: Collector runner that loads pluggable connectors (GitHub, IMAP, etc.), saves normalized events in `events`, and maintains per-source cursors.
- `src/web/server.js`: Unified Fastify server that serves the API and the built React UI from `src/web/public`.
- `src/db/client.js`: Singleton Prisma client shared across layers.

### Postgres schema

The schema is defined in `prisma/schema.prisma` and mirrors the suggested tables:

- `Event`: raw event payloads (JSONB) with `source`, `event_type`, `occurred_at`, and deduplication via `external_id`.
- `Cursor`: stores the latest cursor string per collector.
- `Day`: human-facing journal entries with mood/note/highlights metadata.
- `DayEvent`: join table pinning events as evidence for a given date.
- `User`: app user record (display/email metadata).
- `AuthIdentity`: login identity (provider + provider_subject) linked to a user.
- `ConnectedAccount`: per-user linked data sources (GitHub, Google, etc.).
- `OAuthToken`: tokens for connected accounts (access/refresh/expiry/scope).

Prisma is the query layer because it balances structured querying with JSON flexibility, plus you get migrations, TypeScript typings, and easy resets. You can still point your DB client (psql, TablePlus, DBeaver) at the same `DATABASE_URL` to inspect or mutate the tables directly.

## Getting started

1. Install dependencies:

```bash
npm install
```

2. Install Postgres (e.g., `sudo apt install postgresql`) and create a database/user; then copy `.env.example` → `.env` with your connection string.

Ensure the `DATABASE_URL` line looks like `postgresql://journal:<password>@localhost:5432/journal`. Set `PGUSER`, `PGPASSWORD`, etc. if you rely on peer authentication.

3. Generate the Prisma client:

```bash
npm run prisma:generate
```

4. Apply the schema via Prisma migrations:

```bash
npm run prisma:migrate
```

5. Confirm connectivity with:

```bash
npm run test-db
```

> **Dependency note:** we currently pin `node-fetch@^3.3.2`. If you bump this dependency, verify the published version exists before running `npm install`.

## Resetting / destroying the database

- Run `npm run reset-db` to invoke `prisma migrate reset --force` — it will drop all tables and reapply the schema.
- Or use the raw SQL migration in `migrations/init.sql` directly with your favorite Postgres client for a more controlled reset:

```bash
psql "$DATABASE_URL" -f migrations/init.sql
```

### Notes for collectors

- Use `src/collector/run.js` as the entry point for single-shot collector runs (systemd timer or cron can call `node src/collector/run.js`).
- Captured events should be inserted through `prisma.event.create`/`createMany`, and the cursor should be upserted via `prisma.cursor.upsert`.

## Run the services

- API: `npm run api`
- Web UI shell: `npm run web`
- Collector run (one-off): `npm run collector:run`

Each service reads `DATABASE_URL`, so you can use your PostgreSQL client of choice to watch the tables, run ad-hoc queries, or even seed data while Prisma handles migrations.