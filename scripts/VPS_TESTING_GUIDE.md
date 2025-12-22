# Quick VPS Testing Guide

## What Was Fixed

The restore script now handles the "must be owner of schema public" error by:
1. First attempting to drop the entire schema (fastest)
2. If that fails due to permissions, falling back to dropping tables individually
3. Providing helpful messages about trying without `--clean`

## Testing on Your VPS

### Test 1: Restore WITHOUT --clean (Recommended First Try)

Since the dump already has `DROP IF EXISTS` statements, this often works without needing special permissions:

```bash
cd /home/dethbird/journal.dethbird.com
node scripts/db_restore.js dumps/db_dump_2025-12-22T00-12-54-854Z.sql
```

**Expected**: Should work if you have CREATE TABLE permissions

### Test 2: Restore WITH --clean (If Test 1 Fails)

```bash
node scripts/db_restore.js dumps/db_dump_2025-12-22T00-12-54-854Z.sql --clean
```

**Expected**: 
- 3-second warning appears
- Tries to drop schema
- Falls back to dropping tables individually if you don't own the schema
- Should complete successfully

### Test 3: Verify After Restore

```bash
# Check table counts
psql $DATABASE_URL -c "SELECT COUNT(*) as event_count FROM \"Event\""
psql $DATABASE_URL -c "SELECT COUNT(*) as user_count FROM \"User\""

# List all tables
psql $DATABASE_URL -c "\dt"

# Check constraints are in place
psql $DATABASE_URL -c "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY';"
```

Should see:
- Event count matches your data
- User count matches your data
- 17 tables listed
- 16 foreign key constraints

## If You Still Get Permission Errors

### Option 1: Grant Necessary Permissions (Ask your DB admin)

```sql
-- Run as database superuser
GRANT ALL ON ALL TABLES IN SCHEMA public TO your_username;
GRANT CREATE ON SCHEMA public TO your_username;
```

### Option 2: Use Database Superuser for Restore

If you have access to the superuser credentials temporarily:

```bash
# Temporarily use superuser
DATABASE_URL="postgresql://superuser:password@host:5432/dbname" \
  node scripts/db_restore.js dumps/db_dump_2025-12-22T00-12-54-854Z.sql --clean
```

### Option 3: Manual Schema Recreation

```bash
# Drop all tables manually first
psql $DATABASE_URL << 'EOF'
DROP TABLE IF EXISTS "UserEmailDelivery" CASCADE;
DROP TABLE IF EXISTS "TrelloSettings" CASCADE;
DROP TABLE IF EXISTS "OAuthToken" CASCADE;
DROP TABLE IF EXISTS "JournalLog" CASCADE;
DROP TABLE IF EXISTS "JournalEntry" CASCADE;
DROP TABLE IF EXISTS "GoogleTimelineSettings" CASCADE;
DROP TABLE IF EXISTS "Goal" CASCADE;
DROP TABLE IF EXISTS "EventEnrichment" CASCADE;
DROP TABLE IF EXISTS "Event" CASCADE;
DROP TABLE IF EXISTS "EmailBookmarkSettings" CASCADE;
DROP TABLE IF EXISTS "DayEvent" CASCADE;
DROP TABLE IF EXISTS "Day" CASCADE;
DROP TABLE IF EXISTS "Cursor" CASCADE;
DROP TABLE IF EXISTS "ConnectedAccount" CASCADE;
DROP TABLE IF EXISTS "CollectorRun" CASCADE;
DROP TABLE IF EXISTS "AuthIdentity" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;
EOF

# Then restore without --clean
node scripts/db_restore.js dumps/db_dump_2025-12-22T00-12-54-854Z.sql
```

## Common Issues and Solutions

### "No dumps directory found"
```bash
mkdir -p dumps
mv *.sql dumps/
```

### "Connection refused"
```bash
# Check DATABASE_URL is set
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT version();"
```

### "Tables already exist"
```bash
# Use --clean flag to drop them first
node scripts/db_restore.js dumps/your_dump.sql --clean
```

## Success Indicators

You'll know it worked when you see:
- ✓ messages during restore
- "Restore complete!" at the end
- Verification commands show data
- No error messages

## Next Steps After Successful Restore

1. Verify data integrity
2. Check application can connect
3. Run any pending migrations: `npx prisma migrate deploy`
4. Regenerate Prisma client: `npx prisma generate`
5. Restart your application services
