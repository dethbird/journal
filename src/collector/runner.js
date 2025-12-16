import prisma from '../lib/prismaClient.js';

const collectors = [];

export const registerCollector = (collector) => {
  if (!collector || typeof collector.collect !== 'function' || !collector.source) {
    throw new Error('Collector must expose source and a collect() implementation');
  }

  if (collectors.some((entry) => entry.source === collector.source)) {
    throw new Error(`Collector for source "${collector.source}" already registered`);
  }

  collectors.push(collector);
};

export const runCollectorCycle = async () => {
  if (collectors.length === 0) {
    console.log('No collectors registered yet. Nothing to collect.');
    return [];
  }

  const results = [];

  for (const collector of collectors) {
    const { source } = collector;

    const cursorRecord = await prisma.cursor.upsert({
      where: { source },
      create: { source },
      update: {},
    });

    const sinceCursor = cursorRecord.cursor ?? null;
    const { items = [], nextCursor = null } = await collector.collect(sinceCursor);

    if (nextCursor && nextCursor !== cursorRecord.cursor) {
      await prisma.cursor.update({
        where: { source },
        data: { cursor: nextCursor },
      });
    }

    results.push({
      source,
      collected: Array.isArray(items) ? items.length : 0,
      nextCursor,
    });
  }

  return results;
};
