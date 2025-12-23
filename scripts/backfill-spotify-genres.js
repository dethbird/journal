import prisma from '../src/lib/prismaClient.js';
import { getCached, setCached, getMultipleCached, CACHE_KEYS, CACHE_TTL } from '../src/lib/redisClient.js';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

/**
 * Get a valid access token using client credentials
 */
const getClientAccessToken = async () => {
  if (!clientId || !clientSecret) {
    throw new Error('SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required');
  }

  const params = new URLSearchParams();
  params.set('grant_type', 'client_credentials');

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get access token (${res.status}): ${body}`);
  }

  const token = await res.json();
  return token.access_token;
};

/**
 * Fetch multiple artists with caching (batch)
 */
const getArtistsWithCache = async (artistIds, accessToken) => {
  const result = new Map();
  if (!artistIds?.length) return result;

  // Build cache keys
  const cacheKeys = artistIds.map((id) => CACHE_KEYS.ARTIST + id);
  const cached = await getMultipleCached(cacheKeys);

  // Track cache hits/misses
  let cacheHits = 0;
  let cacheMisses = 0;

  // Populate results from cache
  const uncachedIds = [];
  for (const artistId of artistIds) {
    const cacheKey = CACHE_KEYS.ARTIST + artistId;
    if (cached.has(cacheKey)) {
      result.set(artistId, cached.get(cacheKey));
      cacheHits++;
    } else {
      uncachedIds.push(artistId);
      cacheMisses++;
    }
  }

  console.log(`  Artists - Cache hits: ${cacheHits}, Cache misses: ${cacheMisses}`);

  // Fetch uncached artists in batches
  const batchSize = 50;
  for (let i = 0; i < uncachedIds.length; i += batchSize) {
    const batch = uncachedIds.slice(i, i + batchSize);

    try {
      const res = await fetch(`${API_BASE}/artists?ids=${batch.join(',')}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        console.warn(`  Failed to fetch artists batch: ${res.status}`);
        continue;
      }

      const data = await res.json();
      const artists = data.artists || [];

      for (const artist of artists) {
        if (artist && artist.id) {
          result.set(artist.id, artist);
          // Cache each artist
          await setCached(CACHE_KEYS.ARTIST + artist.id, artist, CACHE_TTL.ARTIST);
        }
      }

      console.log(`  Fetched and cached ${artists.length} artists (batch ${Math.floor(i / batchSize) + 1})`);
    } catch (err) {
      console.error('  Error fetching artists batch:', err.message);
    }

    // Small delay between batches
    if (i + batchSize < uncachedIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return result;
};

/**
 * Fetch multiple albums with caching (batch)
 */
const getAlbumsWithCache = async (albumIds, accessToken) => {
  const result = new Map();
  if (!albumIds?.length) return result;

  // Build cache keys
  const cacheKeys = albumIds.map((id) => CACHE_KEYS.ALBUM + id);
  const cached = await getMultipleCached(cacheKeys);

  // Track cache hits/misses
  let cacheHits = 0;
  let cacheMisses = 0;

  // Populate results from cache
  const uncachedIds = [];
  for (const albumId of albumIds) {
    const cacheKey = CACHE_KEYS.ALBUM + albumId;
    if (cached.has(cacheKey)) {
      result.set(albumId, cached.get(cacheKey));
      cacheHits++;
    } else {
      uncachedIds.push(albumId);
      cacheMisses++;
    }
  }

  console.log(`  Albums - Cache hits: ${cacheHits}, Cache misses: ${cacheMisses}`);

  // Fetch uncached albums in batches
  const batchSize = 20;
  for (let i = 0; i < uncachedIds.length; i += batchSize) {
    const batch = uncachedIds.slice(i, i + batchSize);

    try {
      const res = await fetch(`${API_BASE}/albums?ids=${batch.join(',')}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        console.warn(`  Failed to fetch albums batch: ${res.status}`);
        continue;
      }

      const data = await res.json();
      const albums = data.albums || [];

      for (const album of albums) {
        if (album && album.id) {
          result.set(album.id, album);
          // Cache each album
          await setCached(CACHE_KEYS.ALBUM + album.id, album, CACHE_TTL.ALBUM);
        }
      }

      console.log(`  Fetched and cached ${albums.length} albums (batch ${Math.floor(i / batchSize) + 1})`);
    } catch (err) {
      console.error('  Error fetching albums batch:', err.message);
    }

    // Small delay between batches
    if (i + batchSize < uncachedIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return result;
};

/**
 * Enrich events with genre information
 */
const enrichEventsWithGenres = async (events, accessToken) => {
  if (!events?.length) return [];

  console.log(`\nEnriching ${events.length} events with genre data...`);

  // Collect unique artist and album IDs
  const artistIds = new Set();
  const albumIds = new Set();

  for (const event of events) {
    const payload = event.payload;
    if (!payload) continue;

    // Collect artist IDs
    if (Array.isArray(payload.artists)) {
      for (const artist of payload.artists) {
        if (artist?.id) artistIds.add(artist.id);
      }
    }

    // Collect album ID
    if (payload.album?.id) {
      albumIds.add(payload.album.id);
    }
  }

  console.log(`Found ${artistIds.size} unique artists and ${albumIds.size} unique albums`);

  // Fetch all artists and albums with caching
  const artistsMap = await getArtistsWithCache([...artistIds], accessToken);
  const albumsMap = await getAlbumsWithCache([...albumIds], accessToken);

  // Enrich each event with genres
  const enrichedEvents = [];
  for (const event of events) {
    const payload = event.payload;
    if (!payload) continue;

    const genres = new Set();

    // Collect genres from artists
    if (Array.isArray(payload.artists)) {
      for (const artist of payload.artists) {
        if (artist?.id) {
          const artistData = artistsMap.get(artist.id);
          if (artistData?.genres) {
            for (const genre of artistData.genres) {
              genres.add(genre);
            }
          }
        }
      }
    }

    // Collect genres from album
    if (payload.album?.id) {
      const albumData = albumsMap.get(payload.album.id);
      if (albumData?.genres) {
        for (const genre of albumData.genres) {
          genres.add(genre);
        }
      }
    }

    // Add genres to payload
    const enrichedPayload = {
      ...payload,
      genres: [...genres],
    };

    enrichedEvents.push({
      id: event.id,
      payload: enrichedPayload,
      genreCount: genres.size,
    });
  }

  return enrichedEvents;
};

/**
 * Test Redis caching
 */
const testRedisCache = async () => {
  console.log('\n=== Testing Redis Cache ===\n');

  const testKey = 'spotify:test:' + Date.now();
  const testValue = { test: 'data', timestamp: Date.now() };

  // Test set
  console.log('Testing Redis SET...');
  const setResult = await setCached(testKey, testValue, 60);
  if (!setResult) {
    throw new Error('Failed to set test value in Redis');
  }
  console.log('✓ Successfully set test value');

  // Test get
  console.log('Testing Redis GET...');
  const getValue = await getCached(testKey);
  if (!getValue || getValue.test !== 'data') {
    throw new Error('Failed to retrieve test value from Redis');
  }
  console.log('✓ Successfully retrieved test value');

  // Test multiple get
  console.log('Testing Redis MGET...');
  const testKeys = [testKey, 'spotify:test:nonexistent'];
  const multiValues = await getMultipleCached(testKeys);
  if (multiValues.size !== 1 || !multiValues.has(testKey)) {
    throw new Error('Failed to retrieve multiple values from Redis');
  }
  console.log('✓ Successfully retrieved multiple values');

  console.log('\n✓ Redis cache is working correctly!\n');
};

/**
 * Main backfill function
 */
const backfillSpotifyGenres = async () => {
  console.log('=== Spotify Genre Backfill Script ===\n');

  try {
    // Test Redis first
    await testRedisCache();

    // Get access token
    console.log('Getting Spotify access token...');
    const accessToken = await getClientAccessToken();
    console.log('✓ Access token obtained\n');

    // Fetch all Spotify events without genres
    console.log('Fetching Spotify events from database...');
    const events = await prisma.event.findMany({
      where: {
        source: 'spotify',
        eventType: 'TrackPlayed',
      },
      orderBy: {
        occurredAt: 'desc',
      },
    });

    console.log(`Found ${events.length} Spotify events\n`);

    if (events.length === 0) {
      console.log('No events to enrich. Run the collector first to gather some Spotify data.');
      return;
    }

    // Filter events that don't have genres yet
    const eventsNeedingEnrichment = events.filter((e) => !e.payload?.genres || e.payload.genres.length === 0);
    console.log(`${eventsNeedingEnrichment.length} events need genre enrichment`);

    if (eventsNeedingEnrichment.length === 0) {
      console.log('\n✓ All events already have genre data!');
      return;
    }

    // Enrich events
    const enrichedEvents = await enrichEventsWithGenres(eventsNeedingEnrichment, accessToken);

    console.log(`\nEnriched ${enrichedEvents.length} events`);

    // Update events in database
    console.log('\nUpdating events in database...');
    let updated = 0;
    let skipped = 0;

    for (const enriched of enrichedEvents) {
      if (enriched.genreCount === 0) {
        skipped++;
        continue;
      }

      await prisma.event.update({
        where: { id: enriched.id },
        data: { payload: enriched.payload },
      });
      updated++;

      if (updated % 50 === 0) {
        console.log(`  Updated ${updated} events...`);
      }
    }

    console.log(`\n✓ Backfill complete!`);
    console.log(`  Updated: ${updated} events`);
    console.log(`  Skipped (no genres): ${skipped} events`);

    // Summary statistics
    const genreCounts = enrichedEvents.map((e) => e.genreCount).filter((c) => c > 0);
    if (genreCounts.length > 0) {
      const avgGenres = (genreCounts.reduce((a, b) => a + b, 0) / genreCounts.length).toFixed(1);
      const maxGenres = Math.max(...genreCounts);
      console.log(`  Average genres per track: ${avgGenres}`);
      console.log(`  Max genres on a track: ${maxGenres}`);
    }
  } catch (err) {
    console.error('\n❌ Error during backfill:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

// Run the backfill
backfillSpotifyGenres();
