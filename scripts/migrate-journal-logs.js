#!/usr/bin/env node
/**
 * Migration script: Convert existing JournalEntry content to JournalLog entries.
 * 
 * This script:
 * 1. Reads all JournalEntry records with content
 * 2. Strips frontmatter (if any) from the content
 * 3. Creates a JournalLog entry for each non-empty body
 * 4. Uses the JournalEntry.updatedAt as the log's createdAt
 * 
 * Run with: node scripts/migrate-journal-logs.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Parse frontmatter from markdown content (same logic used in UI).
 */
function parseFrontmatter(content) {
  if (!content || !content.startsWith('---')) {
    return { frontmatter: {}, body: content || '' };
  }
  const endIdx = content.indexOf('\n---', 3);
  if (endIdx === -1) {
    return { frontmatter: {}, body: content };
  }
  const body = content.slice(endIdx + 4).replace(/^\n/, '');
  return { body };
}

async function migrate() {
  console.log('Starting journal entry to logs migration...');

  // Get all journal entries
  const entries = await prisma.journalEntry.findMany({
    orderBy: { date: 'asc' },
  });

  console.log(`Found ${entries.length} journal entries`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const entry of entries) {
    if (!entry.content) {
      console.log(`  Skipping ${entry.date} - no content`);
      skippedCount++;
      continue;
    }

    const { body } = parseFrontmatter(entry.content);
    const trimmedBody = body.trim();

    if (!trimmedBody) {
      console.log(`  Skipping ${entry.date} - no content after stripping frontmatter`);
      skippedCount++;
      continue;
    }

    // Check if log already exists for this date/content (avoid duplicates on re-run)
    const existing = await prisma.journalLog.findFirst({
      where: {
        userId: entry.userId,
        date: entry.date,
        content: trimmedBody,
      },
    });

    if (existing) {
      console.log(`  Skipping ${entry.date} - log already exists`);
      skippedCount++;
      continue;
    }

    // Create the log entry
    await prisma.journalLog.create({
      data: {
        userId: entry.userId,
        date: entry.date,
        content: trimmedBody,
        createdAt: entry.updatedAt || entry.createdAt || new Date(),
        updatedAt: entry.updatedAt || entry.createdAt || new Date(),
      },
    });

    console.log(`  Migrated ${entry.date}: ${trimmedBody.substring(0, 50)}...`);
    migratedCount++;
  }

  console.log(`\nMigration complete!`);
  console.log(`  Migrated: ${migratedCount}`);
  console.log(`  Skipped: ${skippedCount}`);
}

migrate()
  .catch((e) => {
    console.error('Migration error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
