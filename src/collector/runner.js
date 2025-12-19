import prisma from '../lib/prismaClient.js';
import { listCollectors } from './registry.js';
import { Octokit } from '@octokit/rest';
import { buildGithubEnrichment } from './enrichers/github.js';

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

// Re-enrich window: events within this many days can have enrichments refreshed
const RE_ENRICH_WINDOW_DAYS = 7;
const RE_ENRICH_MAX_PER_ACCOUNT = 50;

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
    return { event: created, isNew: true };
  } catch (error) {
    if (error.code === 'P2002') {
      // Event already exists - fetch it and check if it's recent enough to re-enrich
      const existing = await prisma.event.findFirst({
        where: { source, externalId: item.externalId, userId: item.userId },
      });
      
      if (!existing) return { event: null, isNew: false };
      
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - RE_ENRICH_WINDOW_DAYS);
      const isRecent = existing.occurredAt >= cutoff;
      
      return { event: existing, isNew: false, isRecent };
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
          const result = await insertEvent(source, item);
          if (result.event) {
            if (result.isNew) totalStored += 1;

            // Enrich new events, or re-enrich recent GitHub push events
            const shouldEnrich = result.isNew || (result.isRecent && source === 'github' && item.eventType === 'PushEvent');
            
            if (shouldEnrich && item.enrichment) {
              await prisma.eventEnrichment.upsert({
                where: { eventId_enrichmentType: { eventId: result.event.id, enrichmentType: item.enrichment.enrichmentType } },
                update: { data: item.enrichment.data, source },
                create: { eventId: result.event.id, source, enrichmentType: item.enrichment.enrichmentType, data: item.enrichment.data },
              });
            }
          }
        }

        // Update cursor for this account
        if (nextCursor && nextCursor !== cursorRecord.cursor) {
          await prisma.cursor.update({ where: { id: cursorRecord.id }, data: { cursor: nextCursor } });
        }

        // Post-collection: re-enrich recent GitHub PushEvents for this account
        try {
          if (source === 'github') {
            const token = account.oauthTokens?.[0]?.accessToken;
            if (token) {
              console.log('[collector] starting re-enrich for github account', account.id);
              const octokit = new Octokit({ auth: token });
              const cutoff = new Date();
              cutoff.setDate(cutoff.getDate() - RE_ENRICH_WINDOW_DAYS);
              const recentEvents = await prisma.event.findMany({
                where: { source: 'github', eventType: 'PushEvent', userId: account.userId, occurredAt: { gte: cutoff } },
                orderBy: { occurredAt: 'desc' },
                take: RE_ENRICH_MAX_PER_ACCOUNT,
              });

              let reEnriched = 0;
              for (const dbEvent of recentEvents) {
                // construct a minimal event shape expected by the enricher
                const evt = {
                  id: dbEvent.externalId,
                  type: dbEvent.eventType,
                  repo: dbEvent.payload?.repo ?? null,
                  payload: dbEvent.payload ?? {},
                  created_at: dbEvent.occurredAt,
                };

                const enrichment = await buildGithubEnrichment(evt, octokit);
                if (enrichment && enrichment.enrichmentType && enrichment.data) {
                  await prisma.eventEnrichment.upsert({
                    where: { eventId_enrichmentType: { eventId: dbEvent.id, enrichmentType: enrichment.enrichmentType } },
                    update: { data: enrichment.data, source },
                    create: { eventId: dbEvent.id, source, enrichmentType: enrichment.enrichmentType, data: enrichment.data },
                  });
                  reEnriched += 1;
                }
              }
              console.log('[collector] re-enriched', reEnriched, 'events for account', account.id);
            } else {
              console.log('[collector] github account has no oauth token, skipping re-enrich', account.id);
            }
          }
        } catch (err) {
          console.warn('[collector] re-enrich github failed for account', account.id, err?.message || err);
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
        const result = await insertEvent(source, item);
        if (result.event) {
          if (result.isNew) stored += 1;

          // Enrich new events, or re-enrich recent GitHub push events
          const shouldEnrich = result.isNew || (result.isRecent && source === 'github' && item.eventType === 'PushEvent');
          
          if (shouldEnrich && item.enrichment) {
            await prisma.eventEnrichment.upsert({
              where: { eventId_enrichmentType: { eventId: result.event.id, enrichmentType: item.enrichment.enrichmentType } },
              update: { data: item.enrichment.data, source },
              create: { eventId: result.event.id, source, enrichmentType: item.enrichment.enrichmentType, data: item.enrichment.data },
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
