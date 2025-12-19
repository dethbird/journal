#!/usr/bin/env node
/**
 * Check timeline collection cursors for all users
 * Usage: node scripts/check-timeline-cursor.js
 */

import prisma from '../src/lib/prismaClient.js';

const main = async () => {
  try {
    const cursors = await prisma.cursor.findMany({
      where: { source: 'google_timeline' },
      include: {
        connectedAccount: {
          include: {
            user: true,
            googleTimelineSettings: true,
          },
        },
      },
    });

    if (cursors.length === 0) {
      console.log('No timeline cursors found');
      return;
    }

    console.log('\n📍 Timeline Collection Cursors:\n');

    for (const cursor of cursors) {
      const user = cursor.connectedAccount?.user;
      const settings = cursor.connectedAccount?.googleTimelineSettings;
      
      console.log(`User: ${user?.displayName || user?.email || 'Unknown'} (${user?.id})`);
      console.log(`  Folder ID: ${settings?.driveFolderId || 'Not set'}`);
      console.log(`  File Name: ${settings?.driveFileName || 'Timeline.json'}`);
      console.log(`  Last Synced: ${settings?.lastSyncedAt ? new Date(settings.lastSyncedAt).toLocaleString() : 'Never'}`);
      console.log(`  Cursor: ${cursor.cursor || 'None (will process all segments)'}`);
      if (cursor.cursor) {
        const cursorDate = new Date(cursor.cursor);
        const now = new Date();
        const daysAgo = Math.floor((now - cursorDate) / (24 * 60 * 60 * 1000));
        console.log(`  Cursor Age: ${daysAgo} days ago`);
      }
      console.log(`  Updated: ${cursor.updatedAt ? new Date(cursor.updatedAt).toLocaleString() : 'N/A'}`);
      console.log('');
    }

    console.log('💡 To reset a cursor (re-process all events), run:');
    console.log('   node scripts/reset-cursor.js google_timeline\n');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();
