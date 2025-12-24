#!/usr/bin/env node

/**
 * Cleanup old Steam data with old externalId patterns
 * 
 * This script removes:
 * - Old steam_game_played_daily events (steam:play_daily:* pattern)
 * - Old steam:playtime_2weeks cursors (no longer needed)
 * 
 * Run: node scripts/cleanup-old-steam-data.js
 */

import prisma from '../src/lib/prismaClient.js';

const cleanup = async () => {
  console.log('Starting cleanup of old Steam data...\n');

  try {
    // 1. Delete old steam_game_played_daily events
    console.log('🗑️  Deleting old steam_game_played_daily events...');
    const deletedEvents = await prisma.event.deleteMany({
      where: {
        source: 'steam',
        eventType: 'steam_game_played_daily',
      },
    });
    console.log(`   Deleted ${deletedEvents.count} old playtime events\n`);

    // 2. Delete old steam:playtime_2weeks cursors (no longer needed)
    console.log('🗑️  Deleting old steam:playtime_2weeks cursors...');
    const deletedCursors = await prisma.cursor.deleteMany({
      where: {
        source: 'steam:playtime_2weeks',
      },
    });
    console.log(`   Deleted ${deletedCursors.count} old playtime cursors\n`);

    // 3. Show remaining Steam data
    console.log('📊 Remaining Steam data:');
    const snapshotCount = await prisma.event.count({
      where: { source: 'steam', eventType: 'steam_game_snapshot' },
    });
    console.log(`   - ${snapshotCount} snapshot events (steam_game_snapshot)`);

    const achievementCount = await prisma.event.count({
      where: { source: 'steam', eventType: 'steam_achievement_unlocked' },
    });
    console.log(`   - ${achievementCount} achievement events (steam_achievement_unlocked)`);

    const achievementCursorCount = await prisma.cursor.count({
      where: { source: 'steam:achievements' },
    });
    console.log(`   - ${achievementCursorCount} achievement cursors (steam:achievements)\n`);

    console.log('✅ Cleanup complete!');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

cleanup();
