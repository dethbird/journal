-- Grant Permissions After Database Restore
-- 
-- IMPORTANT: Replace 'dethbird_journal' with your actual application database username
-- 
-- This file can be uploaded to phpPgAdmin using the SQL tab's file upload feature
-- (pasting multi-line SQL directly often doesn't work in phpPgAdmin)

-- Grant usage on the schema
GRANT USAGE ON SCHEMA public TO dethbird_journal;

-- Grant all privileges on all existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO dethbird_journal;

-- Grant all privileges on all sequences (for any auto-increment columns)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO dethbird_journal;

-- Set default privileges for any future tables
-- (so you don't have to run this again if you recreate tables)
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL PRIVILEGES ON TABLES TO dethbird_journal;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL PRIVILEGES ON SEQUENCES TO dethbird_journal;

-- Optional: Verify permissions were granted
-- Run this separately to check results:
-- 
-- SELECT grantee, privilege_type, table_name
-- FROM information_schema.table_privileges
-- WHERE grantee = 'dethbird_journal' 
--   AND table_schema = 'public'
-- ORDER BY table_name, privilege_type;
