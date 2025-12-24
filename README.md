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
   - GitHub OAuth app (for GitHub activity collection)
   - Spotify OAuth app (for recently played tracks)
   - Steam Web API key (for game playtime and achievements)
   - Trello API key and token (for board activity collection)

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

# GitHub OAuth (for GitHub activity collection)
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Spotify OAuth (for recently played tracks)
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...

# Steam Web API (for game playtime and achievements)
STEAM_API_KEY=...
STEAM_ID=...  # Your 64-bit Steam ID

# Trello API (for board activity collection)
TRELLO_API_KEY=...
TRELLO_TOKEN=...

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

7. Generate and view digest

```bash
# Generate text digest for last 24 hours
npm run digest:run

# Generate digest for custom time range (e.g., 7 days)
DIGEST_RANGE_HOURS=168 node src/digest/run.js

# Generate HTML digest file
DIGEST_RANGE_HOURS=168 node scripts/print-digest-html.js
# Output: tmp/digest.html
```

### Developing on a Remote VM (SSH Tunneling)

If you're running the app on a remote VM/VPS and want to access the UI from your local browser, use SSH port forwarding:

```bash
# Forward local port 5001 to remote port 4001 (or whatever PORT you set)
ssh -N -L 5001:localhost:4001 code@journal
```

Then open `http://localhost:5001` in your local browser. The `-N` flag prevents executing a remote command (tunnel only).

**Tips:**
- Use `-f` to run the tunnel in the background: `ssh -N -f -L 5001:localhost:4001 code@journal`
- For multiple tunnels (e.g., database access), add more `-L` flags: `ssh -N -L 5001:localhost:4001 -L 5432:localhost:5432 code@journal`
- Add an entry to `~/.ssh/config` for convenience:
  ```
  Host journal
    HostName your-server-ip
    User code
    LocalForward 5001 localhost:4001
  ```
  Then just run: `ssh -N journal`

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

### IMAP/SMTP Email Bookmarks
   - Provide IMAP host/port/user/pass in environment or account settings.
   - Configure the email ingest source to mark messages as processed (MOVE/DELETE/MARK_SEEN) according to your preference.
   - Connect via Settings UI to configure per-account email bookmark settings.

### Google Drive (Timeline JSON)
   - The timeline collector looks for the most recent file with a configured filename (default `Timeline.json`) inside a selected Drive folder.
   - Provide OAuth credentials (client id/secret) and a refresh token or service account credentials with Drive access.
   - Use the UI Picker (in the web app) to select the Drive folder — the app will store the folder id in account settings.
   - Timeline filename: Default filename is `Timeline.json`. The UI/account settings allow changing that filename per account.

### GitHub
   1. Create a GitHub OAuth App:
      - Go to https://github.com/settings/developers
      - Click "New OAuth App"
      - Application name: `Evidence Journal` (or your preferred name)
      - Homepage URL: `http://localhost:4001` (or your production URL)
      - Authorization callback URL: `http://localhost:4001/auth/github/callback` (adjust for production)
   2. Copy the Client ID and Client Secret to your `.env`:
      ```
      GITHUB_CLIENT_ID=your_client_id
      GITHUB_CLIENT_SECRET=your_client_secret
      ```
   3. Connect GitHub via the Settings UI in the web app.
   4. The collector will automatically fetch your commits, PRs, and other activity.

### Spotify
   1. Create a Spotify App:
      - Go to https://developer.spotify.com/dashboard
      - Click "Create app"
      - App name: `Evidence Journal` (or your preferred name)
      - Redirect URI: `http://localhost:4001/auth/spotify/callback` (adjust for production)
      - Check "Web API" and accept terms
   2. Copy the Client ID and Client Secret to your `.env`:
      ```
      SPOTIFY_CLIENT_ID=your_client_id
      SPOTIFY_CLIENT_SECRET=your_client_secret
      ```
   3. Connect Spotify via the Settings UI in the web app.
   4. The collector will automatically fetch your recently played tracks.

### Trello
   1. Get your Trello API Key:
      - Go to https://trello.com/power-ups/admin
      - Copy your API Key
   2. Generate a Token:
      - Click the "Token" link or visit: `https://trello.com/1/authorize?expiration=never&name=Evidence+Journal&scope=read&response_type=token&key=YOUR_API_KEY`
      - Replace `YOUR_API_KEY` with your actual API key
      - Authorize the app and copy the token
   3. Add to your `.env`:
      ```
      TRELLO_API_KEY=your_api_key
      TRELLO_TOKEN=your_token
      ```
   4. Configure Trello in the Settings UI:
      - Enter your Trello member ID (username or member ID from Trello)
      - Click "Fetch boards from Trello" to load your boards
      - Select which boards to track
      - Specify list names to track (e.g., "Done", "Doing", "Applied")
      - Enable tracking and save
   5. The collector will fetch card movements and creations into tracked lists across your selected boards.
   
   **Note:** Trello settings are per-user, but the API key/token are global. Each user can track different boards.

## Database Notes

- Schema: Prisma schema is located in `prisma/schema.prisma`.
- Journal data:
  - `JournalLog`: Multiple log entries per day with markdown content
  - `Goal`: Daily goals/todos with checkbox completion tracking
  - `JournalEntry`: Legacy single-entry-per-day model (deprecated)
- Events: All collected activity (GitHub, Spotify, Trello, email bookmarks, timeline) stored in `Event` table with `source`, `eventType`, `payload`, and `occurredAt`
- Cursors: Each collector maintains cursor state in the `Cursor` table (per-source or per-connected-account)
- Settings: User-specific integration settings stored in:
  - `TrelloSettings`: per-user Trello board tracking configuration
  - `EmailBookmarkSettings`: per-account IMAP configuration
  - `GoogleTimelineSettings`: per-account Drive folder and file settings

## Development Tips

- Auto-save: The journal editor auto-saves content (debounced).
- When changing Prisma schema, run `npx prisma db push` then `npx prisma generate` to refresh the client.
- If the UI build fails during development, fix the component errors and re-run `npm run ui:build`. The app uses Vite for fast builds.
- **Collectors**: Each source registers via `src/collector/registry.js`. Add new collectors in `src/collector/sources/`.
- **Digest sections**: Each event source can have a digest builder in `src/digest/sections/` that transforms events into UI-friendly summaries.
- **Email rendering**: Digest email templates are in `src/digest/renderers/email.js` with inline CSS styling.

## Available Collectors

- **GitHub**: Commits, PRs, issues (requires OAuth connection)
- **Spotify**: Recently played tracks (requires OAuth connection)
- **Trello**: Card movements and creations in tracked boards/lists (requires API key/token + per-user settings)
- **Email Bookmarks**: Links extracted from IMAP mailbox (requires per-account IMAP settings)
- **Google Timeline**: Location timeline from Drive JSON export (requires OAuth connection + Drive folder selection)

## Philosophy

This project favors minimal, composable components and simple data models. Journal entries are structured as:
- **JournalLog**: Multiple timestamped log entries per day (markdown content)
- **Goal**: Simple daily goals with checkbox completion

Collectors are designed to be simple, resilient sync processes: prefer idempotence, process safety (marking messages or files after ingest), and small retries rather than complex state machines. Each collector stores a cursor to track where it left off, enabling incremental syncs.

The digest system transforms raw events into daily summaries with section builders (GitHub, Spotify, Trello, etc.) that can be rendered as text or HTML email.

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


## Troubleshooting

- **Collectors return zero items**: Confirm cursor values in the `Cursor` table and that connected accounts have valid tokens/settings.
- **IMAP connection issues**: Check collector logs for socket timeouts or auth failures. Verify IMAP credentials and mailbox name.
- **OAuth token errors**: Re-connect the account via Settings UI to refresh tokens.
- **Database connection issues**: Verify `DATABASE_URL` is correct and PostgreSQL is running. Test with `psql "$DATABASE_URL" -c '\l'`
- **Missing Trello events**: Ensure boards are selected in Settings and list names match exactly (case-insensitive).
