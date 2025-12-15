import dotenv from 'dotenv';
import prisma from '../db/client.js';

dotenv.config();

async function runCollectors() {
  const now = new Date().toISOString();
  console.log(`[collector] starting run at ${now}`);

  const collectors = [
    // Add each source plugin here (GitHub, IMAP bookmarks, etc.).
    {
      name: 'placeholder',
      async collect() {
        // Collector implementation should return { events: [], cursor }.
        return { events: [], cursor: null };
      }
    }
  ];

  for (const worker of collectors) {
    const { events, cursor } = await worker.collect();
    console.log(`[collector] ${worker.name} produced ${events.length} events`);
    await prisma.event.createMany({ data: events, skipDuplicates: true });
    if (cursor) {
      await prisma.cursor.upsert({
        where: { source: worker.name },
        update: { cursor },
        create: { source: worker.name, cursor }
      });
    }
  }

  console.log('[collector] run complete');
}

export default runCollectors;

if (import.meta.url === `file://${process.argv[1]}`) {
  runCollectors()
    .catch((error) => {
      console.error('[collector] run failed', error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}