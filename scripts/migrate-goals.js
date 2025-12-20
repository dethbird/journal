/**
 * One-off migration script to convert markdown bullet goals from JournalEntry.goals
 * to the new Goal table (many-to-one relationship with dates).
 *
 * Run with: node scripts/migrate-goals.js
 */
import prisma from '../src/lib/prismaClient.js';

/**
 * Parse markdown bullet list into individual goal strings.
 * Handles:
 * - `- [ ] uncompleted task`
 * - `- [x] completed task`
 * - `- simple bullet`
 * - `* bullet with asterisk`
 */
const parseMarkdownGoals = (markdown) => {
  if (!markdown || typeof markdown !== 'string') return [];

  const lines = markdown.split('\n');
  const goals = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match markdown checkbox: - [ ] or - [x] or - [X]
    const checkboxMatch = trimmed.match(/^[-*]\s*\[([xX ])\]\s*(.+)$/);
    if (checkboxMatch) {
      const completed = checkboxMatch[1].toLowerCase() === 'x';
      const text = checkboxMatch[2].trim();
      if (text) {
        goals.push({ text, completed });
      }
      continue;
    }

    // Match simple bullet: - text or * text
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      const text = bulletMatch[1].trim();
      if (text) {
        goals.push({ text, completed: false });
      }
      continue;
    }

    // If line doesn't start with bullet but has content, treat as a goal
    // (handles plain text goals)
    if (trimmed.length > 0 && !trimmed.startsWith('#')) {
      goals.push({ text: trimmed, completed: false });
    }
  }

  return goals;
};

const migrate = async () => {
  console.log('Starting goals migration...\n');

  // Find all journal entries with goals field populated
  const entries = await prisma.journalEntry.findMany({
    where: {
      goals: {
        not: null,
      },
    },
    select: {
      id: true,
      userId: true,
      date: true,
      goals: true,
    },
  });

  console.log(`Found ${entries.length} journal entries with goals.\n`);

  let totalGoalsCreated = 0;
  let entriesProcessed = 0;
  let entriesSkipped = 0;

  for (const entry of entries) {
    const parsedGoals = parseMarkdownGoals(entry.goals);

    if (parsedGoals.length === 0) {
      console.log(`  Skipping entry ${entry.id} (${entry.date.toISOString().split('T')[0]}) - no valid goals parsed`);
      entriesSkipped++;
      continue;
    }

    // Check if goals already exist for this user+date
    const existingGoals = await prisma.goal.findMany({
      where: {
        userId: entry.userId,
        date: entry.date,
      },
    });

    if (existingGoals.length > 0) {
      console.log(`  Skipping entry ${entry.id} (${entry.date.toISOString().split('T')[0]}) - ${existingGoals.length} goals already exist`);
      entriesSkipped++;
      continue;
    }

    console.log(`  Processing entry ${entry.id} (${entry.date.toISOString().split('T')[0]}) - ${parsedGoals.length} goals`);

    // Create goals
    for (let i = 0; i < parsedGoals.length; i++) {
      const goal = parsedGoals[i];
      await prisma.goal.create({
        data: {
          userId: entry.userId,
          date: entry.date,
          text: goal.text,
          completed: goal.completed,
          sortOrder: i,
        },
      });
      totalGoalsCreated++;
    }

    entriesProcessed++;
  }

  console.log('\n--- Migration Summary ---');
  console.log(`Entries processed: ${entriesProcessed}`);
  console.log(`Entries skipped: ${entriesSkipped}`);
  console.log(`Total goals created: ${totalGoalsCreated}`);
  console.log('Migration complete!');
};

migrate()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
