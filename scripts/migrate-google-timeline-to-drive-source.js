#!/usr/bin/env node

/**
 * Migrate GoogleTimelineSettings to GoogleDriveSource
 * 
 * This script copies all GoogleTimelineSettings records to the new
 * GoogleDriveSource table, maintaining the relationship to ConnectedAccount.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
  try {
    console.log('Starting migration from GoogleTimelineSettings to GoogleDriveSource...\n');

    // Fetch all existing GoogleTimelineSettings
    const timelineSettings = await prisma.googleTimelineSettings.findMany({
      include: {
        connectedAccount: true
      }
    });

    console.log(`Found ${timelineSettings.length} GoogleTimelineSettings record(s) to migrate.\n`);

    if (timelineSettings.length === 0) {
      console.log('No records to migrate. Exiting.');
      return;
    }

    // Migrate each record
    for (const setting of timelineSettings) {
      console.log(`Migrating GoogleTimelineSettings ${setting.id}...`);
      console.log(`  - ConnectedAccount: ${setting.connectedAccountId}`);
      console.log(`  - Folder ID: ${setting.driveFolderId || '(none)'}`);
      console.log(`  - File Name: ${setting.driveFileName}`);
      console.log(`  - Enabled: ${setting.enabled}`);
      console.log(`  - Last Synced: ${setting.lastSyncedAt || '(never)'}`);

      // Create corresponding GoogleDriveSource
      const driveSource = await prisma.googleDriveSource.create({
        data: {
          connectedAccountId: setting.connectedAccountId,
          driveFolderId: setting.driveFolderId,
          driveFileName: setting.driveFileName,
          enabled: setting.enabled,
          lastSyncedAt: setting.lastSyncedAt,
          createdAt: setting.createdAt,
          updatedAt: setting.updatedAt
        }
      });

      console.log(`  ✓ Created GoogleDriveSource ${driveSource.id}\n`);
    }

    // Verify migration
    const driveSourceCount = await prisma.googleDriveSource.count();
    console.log(`\n✓ Migration complete!`);
    console.log(`  - GoogleTimelineSettings records: ${timelineSettings.length}`);
    console.log(`  - GoogleDriveSource records: ${driveSourceCount}`);

    if (driveSourceCount === timelineSettings.length) {
      console.log(`\n✓ All records migrated successfully.`);
      console.log(`\nNext steps:`);
      console.log(`  1. Verify the migrated data in the database`);
      console.log(`  2. Update collector code to use GoogleDriveSource`);
      console.log(`  3. Once verified, you can drop the GoogleTimelineSettings table`);
    } else {
      console.log(`\n⚠ Warning: Record count mismatch. Please verify manually.`);
    }

  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrate();
