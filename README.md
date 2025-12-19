<!-- Project README rewritten to include requirements, dev setup, user setup, and philosophy -->

# Evidence Journal

![Node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Postgres](https://img.shields.io/badge/postgres-%3E%3D12-blue)
![Prisma](https://img.shields.io/badge/prisma-enabled-4f46e5)
![Vite](https://img.shields.io/badge/vite-built-yellowgreen)

Lightweight personal journal, timeline ingestors, and daily digest renderer. Stores a journal entry per day (content + frontmatter metadata) and supports collectors (Google Drive timeline JSON, IMAP email ingest, Spotify/github sources).

## Requirements

- Node.js >= 18
- npm or yarn
- PostgreSQL (local or remote)
- Account credentials for integrations you plan to use:
   - IMAP/SMTP (email ingest)
   - Google OAuth credentials (Drive access) or service account with Drive API access

## Quick Start — Development

1. Clone and install

```bash
git clone <repo-url>
cd journal
npm install
```

2. Create and configure the database

- Ensure PostgreSQL is running and create a database for the app (example: `journal_dev`).
- Set `DATABASE_URL` in your environment or an `.env` file (see sample below).

3. Prisma schema -> push & generate client

We use `prisma db push` during development to sync schema without running migrations by default. Run:

```bash
npx prisma db push
npx prisma generate
```

If you prefer migrations instead:

```bash
npx prisma migrate dev --name init
```

4. Environment configuration

Create a `.env` at the project root with the values needed by the app. Example variables the code expects:

```
DATABASE_URL=postgresql://user:pass@localhost:5432/journal_dev
SESSION_SECRET=replace-with-random-string

# Google OAuth (for Drive timeline ingest)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...  # optional if using a long-lived token

# IMAP (email ingest)
IMAP_HOST=imap.example.com
IMAP_PORT=993
IMAP_USER=you@example.com
IMAP_PASS=...

# SMTP (optional, for sending email)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASS=...

# Other
PORT=4001

# Digest email (for scheduled daily email)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false  # true for port 465
SMTP_USER=you@example.com
SMTP_PASS=...
SMTP_FROM=you@example.com
DIGEST_EMAIL_TO=you@example.com
```

Note: Some integration settings (e.g. Drive folder id, timeline filename, collector toggles) are stored in the application's settings UI or in account-specific settings; see the web app for per-account configuration.

5. Build and run the UI and server

```bash
# build the frontend
npm run ui:build

# start the web server (API + collectors as configured)
npm run web:start
# OR run directly for development
node src/web/server.js
```

6. Running collectors


```bash
# run a collector runner (depends on local scripts)
node src/collector/run.js
```

## Scheduled Jobs (Systemd / Cron)


### PM2 setup (VM or VPS)

If you'll use `pm2` to keep the server running, follow these steps on your VM/VPS:

1. Install pm2 globally:

```bash
sudo npm install -g pm2
```

2. From the project root, build the UI and start the process with pm2:

```bash
npm run ui:build
pm2 start ecosystem.config.js --env production
pm2 save
```

3. Configure startup on reboot (systemd):

```bash
pm2 startup systemd
# run the command pm2 prints (sudo) to enable startup
```

4. Useful pm2 commands:

```bash
pm2 status
pm2 logs evidence-journal
pm2 restart evidence-journal
pm2 stop evidence-journal
pm2 delete evidence-journal
```

Note: `ecosystem.config.js` is included in the repo; edit it to set `cwd` or adjust logging paths for your environment.
For production use, set up automated scheduling:

### Collector (every 30 minutes)

The collector can run frequently (every 30-60 minutes) since it's fast and Google tokens are valid for longer. You can always trigger a manual refresh from the UI if needed.

**Systemd (recommended):**

1. Copy service and timer files:

```bash
sudo cp systemd/journal-collector.service /etc/systemd/system/
sudo cp systemd/journal-collector.timer /etc/systemd/system/
```

2. Edit the service file to set your user and paths:

```bash
sudo nano /etc/systemd/system/journal-collector.service
# Update User=YOUR_USER and WorkingDirectory=/path/to/journal
```

3. Enable and start the timer:

```bash
sudo systemctl daemon-reload
sudo systemctl enable journal-collector.timer
sudo systemctl start journal-collector.timer
```

4. Check status:

```bash
sudo systemctl status journal-collector.timer
sudo journalctl -u journal-collector.service -f
```

**Cron alternative:**

See [systemd/CRON.md](systemd/CRON.md) for crontab examples.

### Daily Digest Email (5:00 AM)

Send a daily digest email at 5:00 AM with yesterday's journal entry and collected items.

**Systemd:**

1. Copy service and timer files:

```bash
sudo cp systemd/journal-digest.service /etc/systemd/system/
sudo cp systemd/journal-digest.timer /etc/systemd/system/
```

2. Edit the service file to set your user and paths:

```bash
sudo nano /etc/systemd/system/journal-digest.service
# Update User=YOUR_USER and WorkingDirectory=/path/to/journal
```

3. Add SMTP credentials to your `.env`:

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASS=your-password
DIGEST_EMAIL_TO=you@example.com
```

4. Enable and start the timer:

```bash
sudo systemctl daemon-reload
sudo systemctl enable journal-digest.timer
sudo systemctl start journal-digest.timer
```

5. Check status:

```bash
sudo systemctl status journal-digest.timer
sudo journalctl -u journal-digest.service -f
```

**Manual test:**

```bash
node scripts/send-digest-email.js
```

## User Setup (Integration details)

- IMAP/SMTP
   - Provide IMAP host/port/user/pass in environment or account settings.
   - Configure the email ingest source to mark messages as processed (MOVE/DELETE/MARK_SEEN) according to your preference.

- Google Drive (Timeline JSON)
   - The timeline collector looks for the most recent file with a configured filename (default `Timeline.json`) inside a selected Drive folder.
   - Provide OAuth credentials (client id/secret) and a refresh token or service account credentials with Drive access.
   - Use the UI Picker (in the web app) to select the Drive folder — the app will store the folder id in account settings.

- Timeline filename
   - Default filename is `Timeline.json`. The UI/account settings allow changing that filename per account.

## Database Notes

- Schema: Prisma schema is located in `prisma/schema.prisma`. Daily journal entries are stored in `JournalEntry` (content, optional `goals`, timestamps).
- Frontmatter: `mood`, `energy`, and `tags` are stored in the markdown frontmatter of the `content` column; `goals` is a separate column (markdown string).

## Development Tips

- Auto-save: The journal editor auto-saves content (debounced) and saves `goals` as well — useful when testing editor behavior.
- When changing Prisma schema, run `npx prisma db push` then `npx prisma generate` to refresh the client.
- If the UI build fails during development, fix the component errors and re-run `npm run ui:build`. The app uses Vite for fast builds.

## Philosophy

This project favors minimal, composable components and simple data models. The journal content is the source of truth: structured metadata (mood/energy/tags) is kept in a small frontmatter block inside the markdown so entries remain portable, while day-specific fields that are more UI-oriented (like `goals`) are stored as dedicated columns for fast access in digests and lists.

Collectors are designed to be simple, resilient sync processes: prefer idempotence, process safety (marking messages or files after ingest), and small retries rather than complex state machines.

The UI is intentionally lightweight — a focused experience for quickly writing and reviewing entries, with progressive enhancement for collectors and integrations.

## Contributing

1. Fork, create a branch, and open a pull request with a clear description of your changes.
2. Run the test/build sequence locally before opening the PR.

## License

See the `LICENSE` file in the repository.

---

If you'd like, I can also add a small `.env.example` file showing the variables above, or update the `package.json` scripts section with helpful developer aliases. Review this README and tell me any detail you'd like adjusted or expanded.

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
