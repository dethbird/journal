# Database Backup & Restore Guide

## Overview

This directory contains scripts for backing up and restoring your PostgreSQL database. These scripts have been designed to handle the complete database schema including all tables, indexes, constraints, foreign keys, and data.

## Schema Coverage

The backup includes all tables from your Prisma schema:

### Core Tables
- **User** - User accounts and profiles
- **AuthIdentity** - OAuth/authentication identities
- **ConnectedAccount** - Third-party service connections
- **OAuthToken** - OAuth access/refresh tokens

### Data Collection
- **Event** - Timeline events from various sources
- **EventEnrichment** - Additional metadata for events
- **Cursor** - Pagination cursors for data sources
- **CollectorRun** - History of data collection runs

### Journal & Planning
- **JournalEntry** - Daily journal entries
- **JournalLog** - Additional logging/notes
- **Goal** - User goals and tasks
- **Day** - Day metadata (mood, highlights, etc.)
- **DayEvent** - Link between days and events

### Service-Specific Settings
- **EmailBookmarkSettings** - Email bookmark configuration
- **GoogleTimelineSettings** - Google Timeline sync settings
- **TrelloSettings** - Trello board tracking settings
- **UserEmailDelivery** - Email digest delivery configuration

### Database Objects
- ✅ All primary keys
- ✅ All foreign key constraints with CASCADE/RESTRICT rules
- ✅ All indexes (24+ indexes)
- ✅ All unique constraints
- ✅ All data

## Backup Script (`db_dump.js`)

### What it does
Creates a complete PostgreSQL dump file with:
- DROP statements for clean restoration
- IF EXISTS clauses to prevent errors
- All schema objects (tables, indexes, constraints)
- All data from all tables
- Proper ordering for foreign key dependencies

### Usage

```bash
# Create a new backup
node scripts/db_dump.js

# The dump will be saved to: dumps/db_dump_YYYY-MM-DDTHH-mm-ss-SSSZ.sql
```

### Requirements
- `pg_dump` must be installed (PostgreSQL client tools)
- `DATABASE_URL` environment variable must be set
- Database user must have read permissions

### Output
The script creates a timestamped SQL file in the `dumps/` directory with verbose output showing all operations.

## Restore Script (`db_restore.js`)

### What it does
Restores a database dump file, optionally cleaning the target database first.

### Usage

```bash
# Restore the most recent dump (safe - no cleaning)
node scripts/db_restore.js

# Restore a specific dump file (safe - no cleaning)
node scripts/db_restore.js dumps/db_dump_2025-12-21T12-34-56-789Z.sql

# ⚠️ DESTRUCTIVE: Clean database and restore (destroys all existing data)
node scripts/db_restore.js --clean

# ⚠️ DESTRUCTIVE: Clean database and restore specific file
node scripts/db_restore.js dumps/db_dump_2025-12-21T12-34-56-789Z.sql --clean
```

### Clean Flag Behavior

When using `--clean`:
1. **3-second warning** - Gives you time to abort (Ctrl+C)
2. **Drops the entire public schema** - All tables, indexes, data are destroyed
3. **Recreates the public schema** - Fresh, empty schema
4. **Restores from dump** - Recreates all objects and data

**⚠️ WARNING**: The `--clean` flag is DESTRUCTIVE and will permanently delete all data in the target database. Use with caution!

### Without Clean Flag

If you restore without `--clean`:
- The dump file contains DROP IF EXISTS statements, so it will attempt to drop existing objects
- If objects exist with data dependencies, you may get errors
- Best practice: use `--clean` for a guaranteed clean restore

### Requirements
- `psql` must be installed (PostgreSQL client tools)
- `DATABASE_URL` environment variable must be set
- Database user must have CREATE/DROP permissions for schema operations

## Important Notes

### Prisma Migrations

The `_prisma_migrations` table (if it exists) will be included in the dump. This ensures:
- Migration history is preserved
- You can track which migrations have been applied
- Consistent schema versioning across environments

After restoring, you may need to:
```bash
# Apply any new migrations not in the dump
npx prisma migrate deploy

# Or generate the Prisma Client if schema is up to date
npx prisma generate
```

### Connection String Sanitization

Both scripts automatically sanitize the `DATABASE_URL` by removing query parameters (like `?schema=public`) that `pg_dump` and `psql` don't understand. Your original DATABASE_URL is not modified.

### File Organization

All dumps are stored in the `dumps/` directory with ISO 8601 timestamps:
```
dumps/
├── db_dump_2025-12-21T10-30-45-123Z.sql
├── db_dump_2025-12-21T14-22-33-456Z.sql
└── db_dump_2025-12-21T18-15-20-789Z.sql
```

### Verification After Restore

After restoring, verify your data:

```bash
# Check table counts
psql $DATABASE_URL -c "
  SELECT 'Event' as table, COUNT(*) FROM \"Event\"
  UNION ALL
  SELECT 'User', COUNT(*) FROM \"User\"
  UNION ALL
  SELECT 'JournalEntry', COUNT(*) FROM \"JournalEntry\"
  UNION ALL
  SELECT 'Goal', COUNT(*) FROM \"Goal\";
"

# Check migration status (if _prisma_migrations exists)
psql $DATABASE_URL -c "
  SELECT migration_name, finished_at, rolled_back_at 
  FROM _prisma_migrations 
  ORDER BY finished_at DESC 
  LIMIT 10;
"

# Verify foreign key constraints
psql $DATABASE_URL -c "
  SELECT COUNT(*) as fk_count 
  FROM information_schema.table_constraints 
  WHERE constraint_type = 'FOREIGN KEY';
"
```

## Troubleshooting

### pg_dump not found
```bash
# Ubuntu/Debian
sudo apt-get install postgresql-client

# macOS
brew install postgresql
```

### Connection errors
- Verify `DATABASE_URL` is set: `echo $DATABASE_URL`
- Test connection: `psql $DATABASE_URL -c "SELECT 1"`
- Check if database exists and you have permissions

### Restore conflicts
If you get errors about existing objects:
1. Use the `--clean` flag for a fresh start
2. Or manually drop conflicting tables before restore

### Large database
For very large databases:
- Dumps may take several minutes
- Consider compressing: `gzip dumps/db_dump_*.sql`
- Decompress before restore: `gunzip dumps/db_dump_*.sql.gz`

## Best Practices

1. **Regular Backups**: Run dumps before major changes
2. **Test Restores**: Periodically test restoration in a development environment
3. **Keep Multiple Backups**: Don't rely on a single dump file
4. **Secure Storage**: Dumps contain sensitive data - store securely
5. **Document Changes**: Note why you're creating a backup in your commit messages

## Environment Setup

Ensure your `.env` file contains a valid PostgreSQL connection string:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
```

For remote databases:
```env
DATABASE_URL="postgresql://user:password@remote-host:5432/dbname?sslmode=require"
```
