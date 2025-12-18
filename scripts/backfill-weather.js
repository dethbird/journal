import 'dotenv/config';
import prisma from '../src/lib/prismaClient.js';
import buildWeatherEnrichment from '../src/collector/enrichers/weather.js';

/**
 * Backfill weather enrichment for existing timeline events
 * 
 * This script:
 * 1. Finds all google_timeline events
 * 2. For each event with location data (lat/lng), builds weather enrichment
 * 3. Inserts or updates the EventEnrichment record
 * 
 * Usage:
 *   node scripts/backfill-weather.js
 * 
 * Options (via env vars):
 *   DRY_RUN=true - Don't actually write to DB, just log what would happen
 *   LIMIT=100 - Process only the first N events
 */

const DRY_RUN = process.env.DRY_RUN === 'true';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : null;
const BATCH_SIZE = 50;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const backfillWeather = async () => {
  console.log('=== Backfill Weather Enrichment ===');
  console.log(`DRY_RUN: ${DRY_RUN}`);
  console.log(`LIMIT: ${LIMIT ?? 'none'}`);
  console.log();

  try {
    await prisma.$connect();

    // Find all timeline events that have location data and don't already have weather enrichment
    const whereClause = {
      source: 'google_timeline',
      OR: [
        { payload: { path: ['location', 'lat'], not: null } },
        { payload: { path: ['startLocation', 'lat'], not: null } },
      ],
    };

    const totalEvents = await prisma.event.count({ where: whereClause });
    console.log(`Found ${totalEvents} timeline events with location data`);

    if (totalEvents === 0) {
      console.log('No events to process. Exiting.');
      return;
    }

    let processed = 0;
    let enriched = 0;
    let skipped = 0;
    let failed = 0;
    let cursor = null;

    while (true) {
      // Fetch batch
      const events = await prisma.event.findMany({
        where: whereClause,
        take: BATCH_SIZE,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { id: 'asc' },
        include: {
          enrichments: {
            where: {
              enrichmentType: 'weather_v1',
            },
          },
        },
      });

      if (events.length === 0) {
        break;
      }

      for (const event of events) {
        processed++;
        cursor = event.id;

        // Check if already has weather enrichment
        if (event.enrichments.length > 0) {
          skipped++;
          console.log(`[${processed}/${totalEvents}] Event ${event.id} already has weather enrichment, skipping`);
          continue;
        }

        // Extract lat/lng from payload
        const payload = event.payload ?? {};
        const lat = payload.location?.lat ?? payload.startLocation?.lat;
        const lng = payload.location?.lng ?? payload.startLocation?.lng;

        if (!lat || !lng) {
          skipped++;
          continue;
        }

        // Build enrichment
        const eventForEnrichment = {
          id: event.id,
          externalId: event.externalId,
          payload: {
            latitude: lat,
            longitude: lng,
            timezone: payload.raw?.timezoneOffsetMinutes != null 
              ? `UTC${payload.raw.timezoneOffsetMinutes >= 0 ? '+' : ''}${Math.floor(payload.raw.timezoneOffsetMinutes / 60)}`
              : 'UTC',
          },
          occurredAt: event.occurredAt,
        };

        const enrichment = await buildWeatherEnrichment(eventForEnrichment);

        if (!enrichment) {
          failed++;
          console.log(`[${processed}/${totalEvents}] Event ${event.id} weather enrichment failed`);
          continue;
        }

        // Insert enrichment
        if (!DRY_RUN) {
          await prisma.eventEnrichment.create({
            data: {
              eventId: event.id,
              enrichmentType: enrichment.enrichmentType,
              data: enrichment.data,
              source: event.source ?? 'google_timeline',
            },
          });
        }

        enriched++;
        const weather = enrichment.data?.weather;
        console.log(
          `[${processed}/${totalEvents}] Event ${event.id} enriched: ${weather?.weather_description} ${weather?.temperature_c}°C`
        );

        // Rate limit to avoid hitting Open-Meteo too hard
        await sleep(100);

        if (LIMIT && processed >= LIMIT) {
          console.log(`\nReached LIMIT of ${LIMIT} events. Stopping.`);
          break;
        }
      }

      if (LIMIT && processed >= LIMIT) {
        break;
      }
    }

    console.log();
    console.log('=== Summary ===');
    console.log(`Total processed: ${processed}`);
    console.log(`Enriched: ${enriched}`);
    console.log(`Skipped (already enriched): ${skipped}`);
    console.log(`Failed: ${failed}`);
    
    if (DRY_RUN) {
      console.log('\n⚠️  DRY_RUN mode - no changes were written to the database');
    }
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

if (process.argv[1] && process.argv[1].endsWith('backfill-weather.js')) {
  backfillWeather();
}

export default backfillWeather;
