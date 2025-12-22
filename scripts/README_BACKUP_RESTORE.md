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
2. **Attempts to drop schema** - Tries `DROP SCHEMA IF EXISTS public CASCADE` (requires schema ownership)
3. **Fallback to table-by-table** - If schema drop fails due to permissions, drops each table individually
4. **Restores from dump** - Recreates all objects and data

**⚠️ WARNING**: The `--clean` flag is DESTRUCTIVE and will permanently delete all data in the target database. Use with caution!

**Permission Requirements**:
- Ideally: Schema ownership for `DROP SCHEMA` (fastest)
- Minimum: `DROP TABLE` permission on individual tables (fallback method)

If you get permission errors, see the Troubleshooting section below.

### Without Clean Flag

If you restore without `--clean`:
- The dump file already contains `DROP IF EXISTS` statements
- Tables will be dropped and recreated automatically
- **This is often sufficient** and avoids permission issues
- Only use `--clean` if you have orphaned objects or need guaranteed cleanup

### Requirements
- `psql` must be installed (PostgreSQL client tools)
- `DATABASE_URL` environment variable must be set
- For `--clean`: DROP TABLE permissions (or schema ownership for faster operation)
- For regular restore: CREATE TABLE permissions

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

### Grant Permissions After Restore

**IMPORTANT**: After restoring, you must grant permissions to your application database user. This is a common issue on shared hosting or managed databases where the restore user differs from the application user.

#### Symptoms of Missing Permissions
- Application errors: `permission denied for table User`
- Prisma errors: `ConnectorError ... permission denied for table ...`

#### Solution: Grant Permissions

If you have command-line access:
```bash
psql $DATABASE_URL << 'EOF'
-- Grant usage on the schema
GRANT USAGE ON SCHEMA public TO your_app_user;

-- Grant all privileges on all existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;

-- Grant all privileges on all sequences
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_app_user;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL PRIVILEGES ON TABLES TO your_app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL PRIVILEGES ON SEQUENCES TO your_app_user;
EOF
```

Replace `your_app_user` with your actual application database username (e.g., `dethbird_journal`).

#### Using phpPgAdmin (Web Interface)

If you only have web-based database access like phpPgAdmin:

1. **Save the SQL to a file** (e.g., `grant_permissions.sql`):
   ```sql
   GRANT USAGE ON SCHEMA public TO dethbird_journal;
   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO dethbird_journal;
   GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO dethbird_journal;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO dethbird_journal;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO dethbird_journal;
   ```

2. **In phpPgAdmin**:
   - Navigate to your database (e.g., `dethbird_journal`)
   - Click the **SQL** tab
   - Look for **"Choose File"** or **"Browse"** button
   - Upload your `grant_permissions.sql` file
   - Click **Execute** or **Submit**

   **Note**: Pasting multi-line SQL directly into the phpPgAdmin text box often doesn't work - use the file upload method instead.

3. **Verify permissions were granted**:
   ```sql
   SELECT grantee, privilege_type, table_name
   FROM information_schema.table_privileges
   WHERE grantee = 'dethbird_journal' 
     AND table_schema = 'public'
   ORDER BY table_name, privilege_type;
   ```
   
   You should see multiple rows showing SELECT, INSERT, UPDATE, DELETE, etc. on all tables.

### Verification After Restore

After restoring and granting permissions, verify your data:

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

### Permission errors ("must be owner of schema public")
**This is common on managed databases or when you don't own the schema.**

The script will automatically fall back to dropping tables individually. If this also fails:

```sql
-- Option 1: Grant ownership (requires superuser)
ALTER SCHEMA public OWNER TO your_db_user;

-- Option 2: Grant table permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO your_db_user;
GRANT CREATE ON SCHEMA public TO your_db_user;
```

**Best Practice**: Try restoring WITHOUT `--clean` first - the dump file already has `DROP IF EXISTS` statements:
```bash
# Just restore, let dump handle cleanup
node scripts/db_restore.js path/to/dump.sql
```

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
