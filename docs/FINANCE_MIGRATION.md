# Finance Tracking Migration Guide

This guide covers deploying the finance tracking feature to your VPS.

## Overview

The finance tracking feature allows you to collect transaction data from:
- **CSV exports**: American Express, Chase (credit cards, checking, savings)
- **PDF statements**: Chime (checking, savings)

All files are pulled from Google Drive folders you specify.

---

## 0. Backup First! ⚠️

**CRITICAL:** Create a database backup BEFORE making schema changes:

```bash
cd /home/code/journal
node scripts/db_dump.js
```

This creates a timestamped backup in `dumps/` directory. If anything goes wrong, restore with:

```bash
node scripts/db_restore.js --clean
```

**Important timing notes:**
- ✅ Backup BEFORE migration = includes `GoogleTimelineSettings` (can roll back)
- ✅ Backup AFTER migration = includes `GoogleDriveSource` with finance fields (production state)
- ⚠️ Don't restore a pre-migration backup to a post-migration database (will revert your changes)

---

## 1. Database Schema Changes

Since you can't use `prisma db push`, run these SQL commands manually on your VPS database:

```sql
-- Step 1: Create GoogleDriveSource table if it doesn't exist
-- (If you already have GoogleTimelineSettings, this table might not exist yet)
CREATE TABLE IF NOT EXISTS "GoogleDriveSource" (
  "id" TEXT PRIMARY KEY,
  "connectedAccountId" TEXT NOT NULL,
  "driveFolderId" TEXT,
  "driveFileName" TEXT NOT NULL DEFAULT 'Timeline.json',
  "sourceType" TEXT NOT NULL DEFAULT 'timeline',
  "institutionId" TEXT,
  "institutionName" TEXT,
  "nickname" TEXT,
  "parserFormat" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleDriveSource_connectedAccountId_fkey" 
    FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Step 2: Migrate data from GoogleTimelineSettings to GoogleDriveSource
-- (Skip if you don't have the old table, or if already migrated)
INSERT INTO "GoogleDriveSource" ("id", "connectedAccountId", "driveFolderId", "driveFileName", "enabled", "lastSyncedAt", "createdAt", "updatedAt", "sourceType")
SELECT 
  "id",
  "connectedAccountId",
  "driveFolderId",
  "driveFileName",
  "enabled",
  "lastSyncedAt",
  "createdAt",
  "updatedAt",
  'timeline' as "sourceType"
FROM "GoogleTimelineSettings"
ON CONFLICT DO NOTHING;

-- Step 3: Verify the migration
SELECT COUNT(*) as "GoogleTimelineSettings_count" FROM "GoogleTimelineSettings";
SELECT COUNT(*) as "GoogleDriveSource_count" FROM "GoogleDriveSource";
-- These counts should match if migration was successful

-- Step 4: Drop the old GoogleTimelineSettings table
-- ONLY do this after verifying the migration above!
DROP TABLE IF EXISTS "GoogleTimelineSettings" CASCADE;

-- Step 5: Add finance-related fields if not already present
ALTER TABLE "GoogleDriveSource" 
ADD COLUMN IF NOT EXISTS "sourceType" TEXT NOT NULL DEFAULT 'timeline',
ADD COLUMN IF NOT EXISTS "institutionId" TEXT,
ADD COLUMN IF NOT EXISTS "institutionName" TEXT,
ADD COLUMN IF NOT EXISTS "nickname" TEXT,
ADD COLUMN IF NOT EXISTS "parserFormat" TEXT;

-- Step 6: Create indexes
CREATE INDEX IF NOT EXISTS "GoogleDriveSource_connectedAccountId_idx" 
ON "GoogleDriveSource"("connectedAccountId");

CREATE INDEX IF NOT EXISTS "GoogleDriveSource_sourceType_idx" 
ON "GoogleDriveSource"("sourceType");

-- Step 7: Verify the final schema
\d "GoogleDriveSource"

-- Step 8: Create a post-migration backup
-- Exit psql and run: node scripts/db_dump.js
-- This backup will include the new GoogleDriveSource table with finance fields
```

**Schema Migration Verification:**

After running the SQL above, verify the schema is correct:

```bash
# Verify GoogleDriveSource exists and has all columns
PGPASSWORD=your_password psql "postgresql://your_host:5432/journal?user=journal" \
  -c "\d \"GoogleDriveSource\""

# Should show columns: id, connectedAccountId, driveFolderId, driveFileName, 
# sourceType, institutionId, institutionName, nickname, parserFormat, 
# enabled, lastSyncedAt, createdAt, updatedAt
```

---

## 2. Create Post-Migration Backup

After schema changes, create a new backup:

```bash
cd /home/code/journal
node scripts/db_dump.js
```

This backup includes the new schema and can be used to restore your VPS to this state.

---

## 3. Install Dependencies

The finance feature requires `pdf-parse` for Chime PDF statements:

```bash
cd /home/code/journal
npm install pdf-parse@1.1.1
```

---

## 4. Deploy Code Changes

### Option A: Git Pull (if using git)

```bash
cd /home/code/journal
git pull origin finance-import  # or your branch name
npm install
npm run ui:build
```

### Option B: Manual File Copy

Copy these modified files to your VPS:

**Backend:**
- `src/collector/sources/finance.js` (new file)
- `src/digest/sections/finance.js` (new file)
- `src/web/server.js` (modified - finance API endpoints)
- `prisma/schema.prisma` (modified - GoogleDriveSource model)
- `package.json` (modified - added pdf-parse)

**Frontend:**
- `src/ui/src/financeConfigs.js` (new file)
- `src/ui/src/components/Settings.jsx` (modified - Finance tab)
- `src/ui/src/components/Digest.jsx` (modified - FinanceSection component)

After copying files:
```bash
cd /home/code/journal
npm install
npm run ui:build
```

---

## 5. Restart Services

```bash
# If using PM2
pm2 restart evidence-journal

# Or restart manually however you run the app
```

---

## 6. Configure Finance Sources

### A. Connect Google Account (First Time Only)

If you haven't already connected your Google account:

1. Navigate to **Settings → Connected Accounts**
2. Click **Connect Google**
3. Complete OAuth flow to authorize Google Drive access
4. This creates a `ConnectedAccount` record that finance sources will use

**Note:** This step is only needed once. All finance sources (and timeline sources) share the same Google account connection.

### B. In the UI

1. Navigate to **Settings → Finance** tab
2. Click **Add Finance Source**
3. Select institution type:
   - **American Express** → `amex_csv`
   - **Chase Bank (Credit Card)** → `chase_csv`
   - **Chase Bank (Checking)** → `chase_checking_csv` (also works for savings)
   - **Chime (PDF Statement)** → `chime_pdf` (works for checking and savings)
4. Enter:
   - **Google Drive Folder ID** (from folder URL)
   - **Filename** (e.g., `activity.csv`, `statement.pdf`)
   - **Nickname** (optional, to distinguish multiple accounts)
5. Click **Save**

**Note:** If you see an error about missing ConnectedAccount, ensure you've completed Step 6A above (Connect Google Account).

### C. Google Drive Setup

For each institution, create a Google Drive folder and upload your statements:

**CSV Files:**
- Amex: Export from amextravel.com → Download as CSV
- Chase: Export from chase.com → Download activity

**PDF Files:**
- Chime: Download monthly statements from Chime app

**Important:** 
- File must be named exactly as specified in the source config
- Collector looks for exact filename match in the folder
- You can update files monthly; collector will skip duplicates

---

## 7. Run the Collector

### Manual Run

```bash
cd /home/code/journal
npm run collector:run finance
```

### Expected Output

```
[finance] Collecting for account <accountId> (google)
[finance] Found 5 enabled finance source(s)

[finance] Processing source: American Express (cmj...)
[finance]   Folder: 1gDuEUIC5wU_5DQ2juFh-s6ZGK3FAJ7Tk
[finance]   File: activity.csv
[finance]   Parser: amex_csv
[finance] Found file: activity.csv (modified: 2025-12-26T23:31:56.542Z)
[finance] Parsed 29 transactions
[finance] Created 29 events, skipped 0 duplicates
```

---

## 8. View in Digest

The digest will automatically include finance sections when transactions exist:

```bash
DIGEST_RANGE_HOURS=720 npm run digest:run
```

**Digest Output:**
- **Debits**: Charges, purchases (black text in UI)
- **Credits**: Payments, refunds, interest (green text in UI)

---

## 9. Supported File Formats

### American Express CSV
```csv
Date,Description,Amount
12/22/2025,BESTBUYCOM8071266702,42.89
12/19/2025,MOBILE PAYMENT - THANK YOU,-1348.89
```

### Chase Credit Card CSV
```csv
Transaction Date,Post Date,Description,Category,Type,Amount,Memo
11/30/2025,11/30/2025,Payment Thank You-Mobile,Payment,,171.63,
11/28/2025,11/28/2025,AMAZON MKTPL*BB4245L92,Shopping,Sale,-1.11,
```

### Chase Checking/Savings CSV
```csv
Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
CREDIT,12/22/2025,INTEREST PAYMENT,0.05,MISC_CREDIT,7408.82,,
DEBIT,06/11/2025,PAY BY BANK PURCHASE,-103.90,ACH_DEBIT,7305.82,,
```

### Chime PDF Statement
- Parser extracts text between "Transactions" and "Program Details"/"Yearly Summary"
- Parses rows with: DATE DESCRIPTION TYPE AMOUNT SETTLEMENT_DATE
- Works for both checking and savings statements

---

## 10. Troubleshooting

### Issue: "Could not find transaction section in PDF"
- Chime PDF format changed
- Check if PDF has "Transactions" header
- Verify end marker ("Program Details" or "Yearly Summary")

### Issue: "File not found in folder"
- Verify Google Drive folder ID is correct
- Check filename matches exactly (case-sensitive)
- Ensure file is in the root of the specified folder

### Issue: Wrong debit/credit colors
- Ensure collector has latest code with `parserFormat` field
- Delete old events and re-collect:
  ```sql
  DELETE FROM "Event" WHERE source = 'finance';
  UPDATE "GoogleDriveSource" SET "lastSyncedAt" = NULL WHERE "sourceType" = 'finance';
  ```
- Re-run collector

### Issue: Missing nickname in digest
- Events were created before nickname support
- Delete and re-collect that source (see above)

---

## 11. Automation

### Add to Cron

Run collector daily:

```bash
# Edit crontab
crontab -e

# Add line (runs at 6 AM daily)
0 6 * * * cd /home/code/journal && npm run collector:run finance >> /var/log/journal-finance-collector.log 2>&1
```

### Using Systemd Timer

See `docs/systemd/CRON.md` for systemd timer setup.

---

## 12. Data Model

### Event Structure

Finance transactions are stored as `Event` records:

```javascript
{
  source: 'finance',
  externalId: 'finance:sourceId:date:amount:reference',
  userId: 'cmj...',
  occurredAt: '2025-11-12T00:00:00.000Z',
  payload: {
    sourceId: 'cmjngaxba0001g7nbvehgz23h',
    institutionId: 'amex',
    institutionName: 'American Express',
    nickname: '1005',
    parserFormat: 'amex_csv',
    date: '12/22/2025',
    description: 'BESTBUYCOM8071266702',
    amount: 42.89,
    category: '',
    type: '',
    reference: '...'
  }
}
```

### Sign Conventions

**American Express:**
- Positive amount = Debit (charge)
- Negative amount = Credit (payment)

**Chase/Chime:**
- Negative amount = Debit (charge)
- Positive amount = Credit (payment/interest)

The digest normalizes all amounts so:
- Positive = Debit (money out) → Black text
- Negative = Credit (money in) → Green text

---

## 13. Adding New Institution Parsers

To add support for a new institution:

1. **Add parser function** in `src/collector/sources/finance.js`:
   ```javascript
   const parseNewBankCSV = (csvContent) => {
     const records = parse(csvContent, { columns: true, trim: true });
     return records.map(row => ({
       date: row.Date,
       description: row.Description,
       amount: parseFloat(row.Amount) || 0,
       reference: `${row.Date}-${row.Description}`.substring(0, 50)
     }));
   };
   ```

2. **Add case** to `parseFile()` function:
   ```javascript
   case 'newbank_csv':
     return parseNewBankCSV(content);
   ```

3. **Add institution** to `src/ui/src/financeConfigs.js`:
   ```javascript
   {
     id: 'newbank',
     name: 'New Bank',
     parserFormat: 'newbank_csv',
     description: 'New Bank CSV export',
     defaultFilename: 'transactions.csv',
   }
   ```

4. **Rebuild UI**:
   ```bash
   npm run ui:build
   ```

---

## Questions?

See existing documentation:
- `docs/BOOKMARK_IMPROVEMENTS.md`
- `docs/scripts/README_BACKUP_RESTORE.md`
- `docs/systemd/CRON.md`
