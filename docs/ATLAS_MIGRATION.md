# Atlas Feature Migration

This document contains the SQL commands needed to manually create the Atlas tables on the VPS.

## Prerequisites

- PostgreSQL database access with CREATE TABLE privileges
- Connected to the `journal` database

## SQL Commands

Run the following SQL commands in order:

```sql
-- Create the enum type for atlas sources
CREATE TYPE "AtlasSource" AS ENUM ('miro');

-- Create the AtlasItem table
CREATE TABLE "AtlasItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "url" TEXT NOT NULL,
    "source" "AtlasSource" NOT NULL,
    "lastReviewed" TIMESTAMP(3),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtlasItem_pkey" PRIMARY KEY ("id")
);

-- Create the index for efficient queries
CREATE INDEX "AtlasItem_userId_sortOrder_idx" ON "AtlasItem"("userId", "sortOrder");

-- Add foreign key constraint to User table
ALTER TABLE "AtlasItem" ADD CONSTRAINT "AtlasItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

## Verification

After running the commands, verify the table was created:

```sql
-- Check that the table exists
\dt AtlasItem

-- Check the table structure
\d "AtlasItem"

-- Verify the enum type
\dT+ "AtlasSource"
```

## Rollback (if needed)

If you need to remove these changes:

```sql
-- Drop the table (this will also drop the foreign key and index)
DROP TABLE IF EXISTS "AtlasItem";

-- Drop the enum type
DROP TYPE IF EXISTS "AtlasSource";
```
