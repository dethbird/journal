import prisma from '../lib/prismaClient.js';
import { listCollectors } from './registry.js';

const normalizeOccurrence = (value) => {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
};

const insertEvent = async (source, item) => {
  const occurredAt = normalizeOccurrence(item.occurredAt);

  const record = {
    source,
    eventType: item.eventType ?? 'event',
    occurredAt,
    externalId: item.externalId,
    payload: item.payload ?? {},
  };

  try {
    const created = await prisma.event.create({ data: record });
    return created;
  } catch (error) {
    if (error.code === 'P2002') {
      return null;
    }
    throw error;
  }
};

export const runCollectorCycle = async () => {
  const collectors = listCollectors();

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

    let stored = 0;
    if (Array.isArray(items)) {
      for (const item of items) {
        const createdEvent = await insertEvent(source, item);
        if (createdEvent) {
          stored += 1;

          if (item.enrichment) {
            await prisma.eventEnrichment.upsert({
              where: { eventId_enrichmentType: { eventId: createdEvent.id, enrichmentType: item.enrichment.enrichmentType } },
              update: { data: item.enrichment.data, source },
              create: { eventId: createdEvent.id, source, enrichmentType: item.enrichment.enrichmentType, data: item.enrichment.data },
            });
          }
        }
      }
    }

    if (nextCursor && nextCursor !== cursorRecord.cursor) {
      await prisma.cursor.update({
        where: { source },
        data: { cursor: nextCursor },
      });
    }

    results.push({
      source,
      collected: stored,
      nextCursor,
    });
  }

  return results;
};
