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
    userId: item.userId,
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
    const { source, collect, collectForAccount } = collector;

    // If the collector exposes a per-account collector, call that for each connected account.
    if (typeof collectForAccount === 'function') {
      // Special case: google_timeline uses google provider accounts with timeline settings
      const accountQuery = source === 'google_timeline'
        ? { provider: 'google', status: 'active', googleTimelineSettings: { driveFileId: { not: null } } }
        : { provider: source, status: 'active' };
      const accounts = await prisma.connectedAccount.findMany({ where: accountQuery, include: { oauthTokens: true, emailBookmarkSettings: true, googleTimelineSettings: true } });

      let totalStored = 0;

      for (const account of accounts) {
        // Get or create cursor for this account
        const cursorRecord = await prisma.cursor.findFirst({ where: { source, connectedAccountId: account.id } })
          || await prisma.cursor.create({ data: { source, connectedAccountId: account.id } });
        const sinceCursor = cursorRecord.cursor ?? null;

        const { items = [], nextCursor = null } = await collectForAccount(account, sinceCursor);

        for (const item of items) {
          const createdEvent = await insertEvent(source, item);
          if (createdEvent) {
            totalStored += 1;

            if (item.enrichment) {
              await prisma.eventEnrichment.upsert({
                where: { eventId_enrichmentType: { eventId: createdEvent.id, enrichmentType: item.enrichment.enrichmentType } },
                update: { data: item.enrichment.data, source },
                create: { eventId: createdEvent.id, source, enrichmentType: item.enrichment.enrichmentType, data: item.enrichment.data },
              });
            }
          }
        }

        // Update cursor for this account
        if (nextCursor && nextCursor !== cursorRecord.cursor) {
          await prisma.cursor.update({ where: { id: cursorRecord.id }, data: { cursor: nextCursor } });
        }
      }

      results.push({ source, collected: totalStored, nextCursor: null });
      continue;
    }

    // Fallback: call the legacy global collector
    const cursorRecord = await prisma.cursor.findFirst({ where: { source, connectedAccountId: null } }) || await prisma.cursor.create({ data: { source, connectedAccountId: null } });
    const sinceCursor = cursorRecord.cursor ?? null;
    const { items = [], nextCursor = null } = await collect(sinceCursor);

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
      await prisma.cursor.update({ where: { id: cursorRecord.id }, data: { cursor: nextCursor } });
    }

    results.push({ source, collected: stored, nextCursor });
  }

  return results;
};
