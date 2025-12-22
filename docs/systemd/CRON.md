# Cron Examples for Evidence Journal

If you prefer cron over systemd, here are example crontab entries:

## Collector (every 30 minutes)

```cron
# Run collector every 30 minutes
*/30 * * * * cd /path/to/journal && /usr/bin/node src/collector/run.js >> /var/log/journal-collector.log 2>&1
```

## Daily Digest Email (5:00 AM)

```cron
# Send daily digest email at 5:00 AM
0 5 * * * cd /path/to/journal && /usr/bin/node scripts/send-digest-email.js >> /var/log/journal-digest.log 2>&1
```

## Setup

1. Edit your crontab:
   ```bash
   crontab -e
   ```

2. Add the entries above (adjust paths to match your installation)

3. Ensure logs directory exists and is writable:
   ```bash
   sudo touch /var/log/journal-collector.log /var/log/journal-digest.log
   sudo chown $USER:$USER /var/log/journal-*.log
   ```

## Environment Variables

Cron runs with a minimal environment. Ensure your `.env` file is loaded, or specify environment variables directly in the crontab:

```cron
# Example with env vars inline
*/30 * * * * cd /path/to/journal && NODE_ENV=production DATABASE_URL="..." /usr/bin/node src/collector/run.js
```

Or source a script that loads `.env`:

```cron
*/30 * * * * cd /path/to/journal && . ./.env && /usr/bin/node src/collector/run.js
```
