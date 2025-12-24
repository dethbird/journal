import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import prisma from '../lib/prismaClient.js';
import { disconnectRedis } from '../lib/redisClient.js';
import './sources/github.js';
import './sources/emailBookmarks.js';
import './sources/spotify.js';
import './sources/steam.js';
import './sources/timeline.js';
import './sources/trello.js';
import { runCollectorCycle } from './runner.js';

const entryFile = fileURLToPath(import.meta.url);

/**
 * Create CollectorRun records for all users with active connected accounts,
 * run the collector cycle, then update each run with event counts and status.
 * This makes scheduled runs visible in the UI's "Last collection" display.
 */
const handleRun = async () => {
  const startedAt = new Date();
  const runsByUser = new Map();

  try {
    // Find all users with at least one active connected account
    const usersWithAccounts = await prisma.user.findMany({
      where: {
        connectedAccounts: {
          some: { status: 'active' }
        }
      },
      select: { id: true, email: true }
    });

    if (usersWithAccounts.length === 0) {
      console.log('No users with active connected accounts. Skipping collector run.');
      return;
    }

    // Create a CollectorRun record for each user
    for (const user of usersWithAccounts) {
      const run = await prisma.collectorRun.create({
        data: {
          userId: user.id,
          status: 'running',
          triggerType: 'scheduled',
          pid: process.pid,
        }
      });
      runsByUser.set(user.id, run);
      console.log(`[collector] Created scheduled run ${run.id} for user ${user.email}`);
    }

    // Execute the collector cycle (collects for all accounts across all users)
    const summary = await runCollectorCycle();
    
    if (summary.length === 0) {
      console.log('Collector job finished (no collectors registered).');
    } else {
      console.log('Collector job finished:', summary);
    }

    // Update each user's run with event counts and completion status
    for (const [userId, run] of runsByUser.entries()) {
      // Count events created during this run for this user
      const eventCount = await prisma.event.count({
        where: {
          userId,
          createdAt: { gte: startedAt }
        }
      });

      await prisma.collectorRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          finishedAt: new Date(),
          eventCount,
          pid: null,
        }
      });

      console.log(`[collector] Run ${run.id} completed: ${eventCount} events collected`);
    }
  } catch (error) {
    console.error('Collector job failed', error);
    process.exitCode = 1;

    // Mark all runs as failed
    for (const [userId, run] of runsByUser.entries()) {
      try {
        await prisma.collectorRun.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            finishedAt: new Date(),
            error: error.message || String(error),
            pid: null,
          }
        });
      } catch (updateErr) {
        console.error(`Failed to update run ${run.id} status:`, updateErr);
      }
    }
  } finally {
    await prisma.$disconnect();
    await disconnectRedis();
  }
};

if (path.resolve(process.argv[1] ?? '') === entryFile) {
  handleRun()
    .then(() => {
      process.exit(process.exitCode || 0);
    })
    .catch((err) => {
      console.error('Fatal error in collector:', err);
      process.exit(1);
    });
}

export default handleRun;
