# Journal Monolith

A Fastify API + React UI monolith that collects personal activity events, stores them in Postgres via Prisma, and can produce digest-friendly data while also serving a SPA frontend.

## Current capabilities

- Fastify server in `src/web/server.js` powers:
  - SPA hosting of the Vite-built React app (`src/ui`).
  - API endpoints for days (`/api/days`, `/api/days/:date`) and events (`/api/events`).
  - Health and OAuth callback scaffolding.
- Prisma schema (`prisma/schema.prisma`) models `Event`, `Cursor`, `Day`, `DayEvent`, and a minimal identity stack (users, connected accounts, OAuth tokens).
- Collector runner (`src/collector/runner.js`) persists JSON events and cursor state into Postgres.
- GitHub collector (`src/collector/sources/github.js`) fetches authenticated-user events, dedupes by event ID, and stores them as journal events, while the helper (`src/collector/githubAuth.js`) resolves OAuth tokens from the `OAuthToken` table (fallback to `GITHUB_TOKEN`).
- Email bookmarks collector (`src/collector/sources/emailBookmarks.js`) pulls IMAP mail, extracts links, emits one `BookmarkEvent` per message, and moves processed messages into a configured folder while advancing a UID cursor.
- Vite + React UI scaffolding in `src/ui` renders a Bulma-styled hero (future UI will hook into the API).

## Setup

1. Copy `.env.example` to `.env` and fill in secrets (Postgres URL, SMTP, GitHub OAuth credentials, optional fallback token):
   ```bash
   cp .env.example .env
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Reset the database after editing Prisma schema:
   ```bash
   npx prisma migrate reset --force
   ```
4. Build the UI for production use:
   ```bash
   npm run ui:build
   ```
5. Start the server:
   ```bash
   npm start
   ```
6. Run the collectors (a systemd timer or cron can call this):
   ```bash
   npm run collector:run
   ```

## Database and Prisma

- Prisma client helper: `src/lib/prismaClient.js`.
- Schema and migrations live under `prisma/`.
- Events are stored raw with JSON payloads (deduped by `externalId`).
- OAuth tokens are expected to be stored in `OAuthToken`; collector looks up the latest GitHub token before making API calls.

## Collectors

- Collector registry is in `src/collector/registry.js`; add new collectors via `registerCollector({ source, collect })`.
- GitHub collector stores authenticated events by paging the Events API (`src/collector/sources/github.js`).
- Email bookmarks collector uses IMAP to pull messages, extract URLs, store them as `BookmarkEvent` payloads with a `links` array, and moves processed mail to a destination folder (`src/collector/sources/emailBookmarks.js`).
- Collector CLI entrypoint `src/collector/run.js` wires into the runner and disconnects Prisma on exit.

### Email bookmarks collector config

Set these env vars (see `.env.example`):
- `EMAIL_BOOKMARK_IMAP_HOST`, `EMAIL_BOOKMARK_IMAP_PORT`, `EMAIL_BOOKMARK_IMAP_SECURE`
- `EMAIL_BOOKMARK_USERNAME`, `EMAIL_BOOKMARK_PASSWORD`
- `EMAIL_BOOKMARK_MAILBOX` (default `INBOX`)
- `EMAIL_BOOKMARK_PROCESSED_MAILBOX` (default `INBOX/Processed`)

The collector uses the last seen UID as its cursor; when no cursor exists, it fetches unseen mail. Each email becomes one `BookmarkEvent` with `payload.links` as an array of `{ url, text }`, and messages are moved to the processed mailbox after processing.

## Next steps

1. Implement OAuth flow to populate `ConnectedAccount` + `OAuthToken`, request `offline_access` (or GitHub equivalent) so refresh tokens can be stored.
2. Add digest generator/email sender that queries yesterday’s events and emails you (via nodemailer or similar).
3. Expand the React UI to read `/api/days` and `/api/events`, display evidence-first day views, and let you write mood/notes/highlights.
4. Add more collectors (`imap`, `drive`, `photos`, etc.) once the event schema and digest workflow stabilize.

## Tips

- Use `GITHUB_TOKEN` env var as a temporary PAT; the collector prefers OAuth tokens stored via `src/collector/githubAuth.js`.
- The `collector:run` script can be invoked from a systemd timer/cron for regular updates.
- Prisma migrations can be inspected under `prisma/migrations/`; regenerating the client is done via `npx prisma generate` if the schema changes.
