<!-- Project README rewritten to include requirements, dev setup, user setup, and philosophy -->

# Evidence Journal

![Node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Postgres](https://img.shields.io/badge/postgres-%3E%3D12-blue)
![Prisma](https://img.shields.io/badge/prisma-enabled-4f46e5)
![Vite](https://img.shields.io/badge/vite-built-yellowgreen)
![PM2](https://img.shields.io/badge/pm2-managed-2ea44f)

Lightweight personal journal, timeline ingestors, and daily digest renderer. Stores a journal entry per day (content + frontmatter metadata) and supports collectors (Google Drive timeline JSON, IMAP email ingest, Spotify/github sources).

## Requirements

- Node.js >= 18
- npm or yarn
- PostgreSQL (local or remote)
 - PM2 (optional, recommended for production process management)
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

# IMAP (email ingest - can also be configured per-user in Settings UI)
IMAP_HOST=imap.example.com
IMAP_PORT=993
IMAP_USER=you@example.com
IMAP_PASS=...

# Other
PORT=4001
DIGEST_RANGE_HOURS=24
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

PM2 is optional but recommended for keeping the server running in production. This project includes an `ecosystem.config.cjs` config file and npm helper scripts.

1. Install pm2 globally on your VPS:

```bash
sudo npm install -g pm2
```

2. From the project root, build the UI and start the process with pm2 (or use the npm helper):

```bash
npm run ui:build
pm2 start ecosystem.config.cjs --env production
# or using the included npm script
npm run pm2:start
pm2 save
```

3. Configure startup on reboot (systemd):

```bash
pm2 startup systemd
# run the command pm2 prints (sudo) to enable startup
```

4. Useful pm2 commands (npm scripts provided):

```bash
npm run pm2:status    # pm2 status
npm run pm2:logs      # pm2 logs evidence-journal
npm run pm2:restart   # pm2 reload ecosystem.config.cjs --env production
npm run pm2:stop      # pm2 stop ecosystem.config.cjs --env production
npm run pm2:delete    # pm2 delete evidence-journal
```

Note: `ecosystem.config.cjs` is included in the repo; edit it to set `cwd` or adjust logging paths for your environment.
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

3. Configure email delivery for each user in the web app:
   - Open the web UI (http://localhost:4001)
   - Go to Settings > Email delivery
   - Enable email delivery and enter SMTP credentials (host, port, username, password)
   - Set the "From" email and optional reply-to address

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

## Reverse proxy with Apache (subdomain → Node)

If you host multiple sites behind Apache and point subdomains to vhost locations, use Apache as a reverse proxy to forward traffic to the running Node server on `localhost:PORT`.

Example Apache vhost (replace `sub.example.com` and port):

```apache
<VirtualHost *:80>
   ServerName sub.example.com
   ProxyPreserveHost On
   ProxyRequests Off
   ProxyPass / http://127.0.0.1:5001/
   ProxyPassReverse / http://127.0.0.1:5001/
   RequestHeader set X-Forwarded-Proto expr=%{REQUEST_SCHEME}
   ErrorLog ${APACHE_LOG_DIR}/sub.example.com-error.log
   CustomLog ${APACHE_LOG_DIR}/sub.example.com-access.log combined
</VirtualHost>
```

Enable required Apache modules and reload:

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel headers rewrite
sudo systemctl reload apache2
```

For HTTPS, obtain a certificate using Certbot (or use your control panel):

```bash
sudo apt install certbot python3-certbot-apache
sudo certbot --apache -d sub.example.com
```

If you use sPanel or another control panel, it often exposes vhost and SSL configuration in the UI — paste the `ProxyPass` lines into the custom vhost section if available.

## PostgreSQL & Prisma (sPanel and SSH guidance)

You can create the database using sPanel's database UI or via the server's `psql` if you have SSH access. Example (SSH):

```bash
# install/postgres if needed (on Debian/Ubuntu)
sudo apt update
sudo apt install -y postgresql postgresql-contrib

# create DB and user
sudo -u postgres psql -c "CREATE ROLE journal WITH LOGIN PASSWORD 'YOUR_STRONG_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE journal_prod OWNER journal;"
```

If using sPanel, create a database and user there and copy the provided connection string.

Set `DATABASE_URL` in your `.env` (example):

```
DATABASE_URL=postgresql://journal:YOUR_STRONG_PASSWORD@localhost:5432/journal_prod
```

Prisma commands (deploy or quick sync):

```bash
# generate client
npx prisma generate

# production: run migrations
npx prisma migrate deploy

# OR quick sync (development):
npx prisma db push
```

If your VPS blocks direct DB access, create the database via sPanel and set the host to the sPanel-provided host. Confirm connectivity from the server with:

```bash
psql "$DATABASE_URL" -c '\l'
```

## Choosing PM2 vs systemd (short guidance)

- PM2: easier for Node process management, logs, clustering, and `pm2 startup` auto-start support. Use when you want a simple Node-centric manager.
- systemd: more standard for system processes and integrates with the OS boot and monitoring. Use when you prefer system-level units and fewer Node-specific dependencies.

PM2 quick commands (included npm scripts):

```bash
npm run pm2:build    # build ui
npm run pm2:start    # start via ecosystem.config.cjs
npm run pm2:status
npm run pm2:logs
npm run pm2:stop
```

systemd quick example (create `/etc/systemd/system/evidence-journal.service`):

```ini
[Unit]
Description=Evidence Journal Node app
After=network.target

[Service]
User=youruser
WorkingDirectory=/path/to/journal
ExecStart=/usr/bin/node /path/to/journal/src/web/server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Reload and enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now evidence-journal.service
sudo journalctl -u evidence-journal.service -f
```

## Testing & verification commands

Verify the server responds through Apache proxy:

```bash
curl -I http://sub.example.com/
```

Check PM2 or systemd logs:

```bash
npm run pm2:logs
# or
sudo journalctl -u evidence-journal.service -f
```

If you'd like, I can also add a short `DEPLOY.md` with copy-paste commands tailored to your VPS (including exact `ServerName` substitutions) or generate the Apache vhost file for your subdomain now. Tell me the subdomain(s) and whether you want PM2 or systemd and I'll produce exact files and commands.

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
