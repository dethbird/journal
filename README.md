# Evidence Journal

A Fastify API + React UI monolith that collects personal activity events, stores them in Postgres via Prisma, and can produce digest-friendly data while also serving a SPA frontend.

## Current capabilities
```markdown
# Evidence Journal

A Fastify monolith that collects personal activity events, serves a React SPA, and stores data in Postgres via Prisma. The project supports per-user connected accounts, per-account collector cursors, and per-account Email Bookmark settings.

## What’s changed (recent)

- Email bookmark IMAP settings were moved from global env vars into per-account `EmailBookmarkSettings` stored in the DB and managed via the Settings UI.
- Collectors may expose a per-account function (`collectForAccount(account)`); the runner will call those per connected account. Legacy global collectors still work.
- Cursors are scoped by `connectedAccountId` in the `Cursor` table so different users do not share cursor state.

## Current capabilities

- Fastify server in `src/web/server.js`:
  - Hosts the Vite-built React app (`src/ui`).
   - API endpoints for days and events, plus OAuth callbacks for GitHub and Spotify.
- Prisma models include `User`, `ConnectedAccount`, `OAuthToken`, `Event` (with `userId`), `Cursor` (scoped to `connectedAccountId`), and `EmailBookmarkSettings`.
- Collector runner persists events and cursor state to Postgres and supports per-account collectors.
- GitHub collector (`src/collector/sources/github.js`) uses stored OAuth tokens per connected account and stamps events with `userId`.
- Email bookmarks collector (`src/collector/sources/emailBookmarks.js`) reads IMAP settings per connected account, extracts links into `BookmarkEvent`s, moves processed messages, and stores per-account UID cursors.

## Setup

1. Copy `.env.example` to `.env` and fill in essential secrets (Postgres URL, OAuth client IDs/secrets):
   ```bash
   cp .env.example .env
   npm install
   ```
2. Build the UI (optional for production build):
   ```bash
   npm run ui:build
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Run collectors manually for testing:
   ```bash
   npm run collector:run
   ```

Useful dev scripts:
```bash
npm run reset-events    # clear event-related tables
npm run reset-cursor    # reset cursors
npm run collector:run   # run collectors once
```

## Email Bookmark Settings (per-user)

- The global `EMAIL_BOOKMARK_*` env vars are deprecated for per-user collection. Configure IMAP host/port/username/password/mailbox per `ConnectedAccount` using the Settings UI at `/settings` or the API endpoints `/api/email-bookmark/settings`.
- The collector uses a per-account numeric UID cursor (stored in `Cursor` with `connectedAccountId`) and will fetch unseen mail when no cursor exists.

## Collectors and how to add new ones

- Register a collector with `registerCollector({ source, collect, collectForAccount })` in `src/collector/registry.js`.
  - `collect(cursor)` is the legacy global collector signature.
  - `collectForAccount(account)` is the newer per-account signature; the runner will call it for each active connected account for that source.
- Existing collectors: `github`, `spotify` (recently played), and `email_bookmarks` all expose `collectForAccount`.

## Spotify recently played collector

- Requires the `user-read-recently-played` scope in `SPOTIFY_SCOPES` (already present in `.env.example`).
- Stores `TrackPlayed` events with track/artist/album/context details and uses a per-account cursor based on the latest `played_at` timestamp.
- Refreshes access tokens automatically when a refresh token is available. Connect Spotify via the OAuth UI to provision tokens.

## OAuth and tokens

- OAuth flows create `ConnectedAccount` and `OAuthToken` rows. Collectors look up the latest `OAuthToken` for a `ConnectedAccount` and use it when available.

## Troubleshooting

- If collectors return zero new items, confirm per-account cursor values in the `cursor` table and that ConnectedAccounts have valid tokens/settings.
- For IMAP problems, inspect collector logs — the IMAP client retries transient connection errors but will log socket timeouts and connection faults.

## Next steps

- Expand the React UI to show connected accounts, per-account settings, and digests.
- Add more per-account collectors (Drive, Photos, other IMAP accounts) and enrichers.

```
- Email bookmark IMAP settings are moved out of global env vars and into per-account `EmailBookmarkSettings` stored in the DB; these are managed in the Settings UI (per ConnectedAccount).
