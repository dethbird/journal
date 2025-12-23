import { registerCollector } from '../registry.js';
import prisma from '../../lib/prismaClient.js';
import { getCached, setCached, getMultipleCached, CACHE_KEYS, CACHE_TTL } from '../../lib/redisClient.js';

const source = 'spotify';
const API_BASE = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const PAGE_LIMIT = 50;
const MAX_PAGES = 5;
const EXPIRY_SKEW_MS = 60 * 1000;

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

const warnMissingToken = (connectedAccountId) => {
  console.warn(`Spotify collector missing OAuth token for connectedAccount=${connectedAccountId}`);
};

const latestToken = (tokens = []) => {
  if (!Array.isArray(tokens) || tokens.length === 0) return null;
  return [...tokens].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
};

const needsRefresh = (token) => {
  if (!token?.expiresAt) return false;
  return new Date(token.expiresAt).getTime() - EXPIRY_SKEW_MS <= Date.now();
};

const storeToken = async (connectedAccountId, tokenResponse, fallbackRefreshToken) => {
  const expiresAt =
    tokenResponse.expires_in != null
      ? new Date(Date.now() + Number(tokenResponse.expires_in) * 1000)
      : null;

  return prisma.oAuthToken.create({
    data: {
      connectedAccountId,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? fallbackRefreshToken ?? null,
      tokenType: tokenResponse.token_type ?? null,
      scope: tokenResponse.scope ?? null,
      expiresAt,
      tokenJson: tokenResponse,
    },
  });
};

const refreshAccessToken = async (connectedAccount, refreshToken) => {
  if (!clientId || !clientSecret) {
    console.warn('Spotify refresh failed: client id/secret missing');
    return null;
  }
  if (!refreshToken) {
    console.warn(`Spotify refresh failed: missing refresh_token for connectedAccount=${connectedAccount.id}`);
    return null;
  }

  const params = new URLSearchParams();
  params.set('grant_type', 'refresh_token');
  params.set('refresh_token', refreshToken);

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
    console.warn(`Spotify refresh failed (${res.status}): ${body}`);
    return null;
  }

  const token = await res.json();
  return storeToken(connectedAccount.id, token, refreshToken);
};

const resolveAccessToken = async (connectedAccount) => {
  const tokenRecord = latestToken(connectedAccount.oauthTokens);
  if (!tokenRecord) {
    return { accessToken: null, tokenRecord: null };
  }

  if (needsRefresh(tokenRecord) && tokenRecord.refreshToken) {
    try {
      const refreshed = await refreshAccessToken(connectedAccount, tokenRecord.refreshToken);
      if (refreshed) {
        return { accessToken: refreshed.accessToken, tokenRecord: refreshed };
      }
    } catch (err) {
      console.warn('Spotify token refresh threw:', err?.message ?? err);
    }
  }

  return { accessToken: tokenRecord.accessToken, tokenRecord };
};

/**
 * Fetch artist info with caching
 * @param {string} artistId - Spotify artist ID
 * @param {string} accessToken - Access token
 * @returns {Promise<object|null>} - Artist info or null
 */
const getArtistWithCache = async (artistId, accessToken) => {
  if (!artistId) return null;
  
  const cacheKey = CACHE_KEYS.ARTIST + artistId;
  
  // Try cache first
  const cached = await getCached(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Fetch from Spotify API
  try {
    const res = await fetch(`${API_BASE}/artists/${artistId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    if (!res.ok) {
      console.warn(`Failed to fetch artist ${artistId}: ${res.status}`);
      return null;
    }
    
    const artist = await res.json();
    
    // Cache the result
    await setCached(cacheKey, artist, CACHE_TTL.ARTIST);
    
    return artist;
  } catch (err) {
    console.error('Error fetching artist:', err.message);
    return null;
  }
};

/**
 * Fetch multiple artists with caching (batch)
 * @param {string[]} artistIds - Array of Spotify artist IDs
 * @param {string} accessToken - Access token
 * @returns {Promise<Map<string, object>>} - Map of artistId to artist info
 */
const getArtistsWithCache = async (artistIds, accessToken) => {
  const result = new Map();
  if (!artistIds?.length) return result;
  
  // Build cache keys
  const cacheKeys = artistIds.map((id) => CACHE_KEYS.ARTIST + id);
  const cached = await getMultipleCached(cacheKeys);
  
  // Populate results from cache
  const uncachedIds = [];
  for (const artistId of artistIds) {
    const cacheKey = CACHE_KEYS.ARTIST + artistId;
    if (cached.has(cacheKey)) {
      result.set(artistId, cached.get(cacheKey));
    } else {
      uncachedIds.push(artistId);
    }
  }
  
  // Fetch uncached artists in batches
  const batchSize = 50; // Spotify allows up to 50 artists per request
  for (let i = 0; i < uncachedIds.length; i += batchSize) {
    const batch = uncachedIds.slice(i, i + batchSize);
    
    try {
      const res = await fetch(`${API_BASE}/artists?ids=${batch.join(',')}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      
      if (!res.ok) {
        console.warn(`Failed to fetch artists batch: ${res.status}`);
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
    } catch (err) {
      console.error('Error fetching artists batch:', err.message);
    }
    
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < uncachedIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  
  return result;
};

/**
 * Fetch album info with caching
 * @param {string} albumId - Spotify album ID
 * @param {string} accessToken - Access token
 * @returns {Promise<object|null>} - Album info or null
 */
const getAlbumWithCache = async (albumId, accessToken) => {
  if (!albumId) return null;
  
  const cacheKey = CACHE_KEYS.ALBUM + albumId;
  
  // Try cache first
  const cached = await getCached(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Fetch from Spotify API
  try {
    const res = await fetch(`${API_BASE}/albums/${albumId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    if (!res.ok) {
      console.warn(`Failed to fetch album ${albumId}: ${res.status}`);
      return null;
    }
    
    const album = await res.json();
    
    // Cache the result
    await setCached(cacheKey, album, CACHE_TTL.ALBUM);
    
    return album;
  } catch (err) {
    console.error('Error fetching album:', err.message);
    return null;
  }
};

/**
 * Fetch multiple albums with caching (batch)
 * @param {string[]} albumIds - Array of Spotify album IDs
 * @param {string} accessToken - Access token
 * @returns {Promise<Map<string, object>>} - Map of albumId to album info
 */
const getAlbumsWithCache = async (albumIds, accessToken) => {
  const result = new Map();
  if (!albumIds?.length) return result;
  
  // Build cache keys
  const cacheKeys = albumIds.map((id) => CACHE_KEYS.ALBUM + id);
  const cached = await getMultipleCached(cacheKeys);
  
  // Populate results from cache
  const uncachedIds = [];
  for (const albumId of albumIds) {
    const cacheKey = CACHE_KEYS.ALBUM + albumId;
    if (cached.has(cacheKey)) {
      result.set(albumId, cached.get(cacheKey));
    } else {
      uncachedIds.push(albumId);
    }
  }
  
  // Fetch uncached albums in batches
  const batchSize = 20; // Spotify allows up to 20 albums per request
  for (let i = 0; i < uncachedIds.length; i += batchSize) {
    const batch = uncachedIds.slice(i, i + batchSize);
    
    try {
      const res = await fetch(`${API_BASE}/albums?ids=${batch.join(',')}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      
      if (!res.ok) {
        console.warn(`Failed to fetch albums batch: ${res.status}`);
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
    } catch (err) {
      console.error('Error fetching albums batch:', err.message);
    }
    
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < uncachedIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  
  return result;
};

const mapPlayToEvent = (item, userId) => {
  const track = item.track;
  if (!track || !item.played_at) return null;

  const playedMs = Date.parse(item.played_at);
  if (!Number.isFinite(playedMs)) return null;

  const trackPayload = {
    id: track.id ?? null,
    name: track.name ?? null,
    durationMs: track.duration_ms ?? null,
    uri: track.uri ?? null,
    externalUrl: track.external_urls?.spotify ?? null,
    explicit: track.explicit ?? false,
    popularity: track.popularity ?? null,
  };

  const artists = Array.isArray(track.artists)
    ? track.artists.map((artist) => ({
        id: artist.id ?? null,
        name: artist.name ?? null,
        uri: artist.uri ?? null,
        externalUrl: artist.external_urls?.spotify ?? null,
      }))
    : [];

  const album = track.album
    ? {
        id: track.album.id ?? null,
        name: track.album.name ?? null,
        uri: track.album.uri ?? null,
        externalUrl: track.album.external_urls?.spotify ?? null,
        releaseDate: track.album.release_date ?? null,
        imageUrl: Array.isArray(track.album.images) && track.album.images[0] ? track.album.images[0].url ?? null : null,
      }
    : null;

  const context = item.context
    ? {
        type: item.context.type ?? null,
        uri: item.context.uri ?? null,
        href: item.context.href ?? null,
        externalUrl: item.context.external_urls?.spotify ?? null,
      }
    : null;

  const payload = {
    playedAt: item.played_at,
    track: trackPayload,
    artists,
    album,
    context,
  };

  const externalId = `spotify:played:${playedMs}:${track.id ?? 'unknown'}`;

  return {
    event: {
      eventType: 'TrackPlayed',
      occurredAt: new Date(playedMs),
      externalId,
      payload,
      userId,
    },
    playedMs,
  };
};

const fetchRecentPlays = async (accessToken, before) => {
  const params = new URLSearchParams();
  params.set('limit', String(PAGE_LIMIT));
  if (before) {
    params.set('before', String(before));
  }

  const res = await fetch(`${API_BASE}/me/player/recently-played?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return res;
};

/**
 * Enrich events with genre information
 * @param {object[]} events - Array of events
 * @param {string} accessToken - Access token
 * @returns {Promise<object[]>} - Events with enriched genre data
 */
const enrichEventsWithGenres = async (events, accessToken) => {
  if (!events?.length) return events;
  
  // Collect unique artist and album IDs
  const artistIds = new Set();
  const albumIds = new Set();
  
  for (const event of events) {
    const payload = event.event?.payload || event.payload;
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
  
  // Fetch all artists and albums with caching
  const artistsMap = await getArtistsWithCache([...artistIds], accessToken);
  const albumsMap = await getAlbumsWithCache([...albumIds], accessToken);
  
  // Enrich each event with genres
  for (const event of events) {
    const eventObj = event.event || event;
    const payload = eventObj.payload;
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
    
    // Collect genres from album (albums typically have fewer/no genres, but include them if present)
    if (payload.album?.id) {
      const albumData = albumsMap.get(payload.album.id);
      if (albumData?.genres) {
        for (const genre of albumData.genres) {
          genres.add(genre);
        }
      }
    }
    
    // Add genres to payload
    payload.genres = [...genres];
  }
  
  return events;
};

const collectForAccount = async (connectedAccount) => {
  const { accessToken, tokenRecord } = await resolveAccessToken(connectedAccount);
  if (!accessToken) {
    warnMissingToken(connectedAccount.id);
    return { items: [], nextCursor: null };
  }

  const cursorRecord = await prisma.cursor.upsert({
    where: { source_connectedAccountId: { source, connectedAccountId: connectedAccount.id } },
    create: { source, connectedAccountId: connectedAccount.id },
    update: {},
  });

  const sinceMs = cursorRecord.cursor ? Number(cursorRecord.cursor) : null;
  const items = [];
  let before = null;
  let maxPlayedAt = sinceMs;
  let accessTokenInUse = accessToken;
  let refreshAttempted = false;
  let pages = 0;

  while (pages < MAX_PAGES) {
    pages += 1;
    const res = await fetchRecentPlays(accessTokenInUse, before);

    if (res.status === 401 && tokenRecord?.refreshToken && !refreshAttempted) {
      refreshAttempted = true;
      const refreshed = await refreshAccessToken(connectedAccount, tokenRecord.refreshToken);
      if (refreshed?.accessToken) {
        accessTokenInUse = refreshed.accessToken;
        pages -= 1; // retry this page with the refreshed token
        continue;
      }
    }

    if (!res.ok) {
      const body = await res.text();
      console.warn(`Spotify API failed (${res.status}): ${body}`);
      break;
    }

    const body = await res.json();
    const pageItems = Array.isArray(body.items) ? body.items : [];
    if (pageItems.length === 0) {
      break;
    }

    let pageMinPlayed = null;

    for (const play of pageItems) {
      const mapped = mapPlayToEvent(play, connectedAccount.userId);
      if (!mapped) continue;
      const { event, playedMs } = mapped;

      if (sinceMs != null && playedMs <= sinceMs) {
        pageMinPlayed = pageMinPlayed == null ? playedMs : Math.min(pageMinPlayed, playedMs);
        continue;
      }

      items.push(event);
      if (maxPlayedAt == null || playedMs > maxPlayedAt) {
        maxPlayedAt = playedMs;
      }

      pageMinPlayed = pageMinPlayed == null ? playedMs : Math.min(pageMinPlayed, playedMs);
    }

    if (pageItems.length < PAGE_LIMIT || pageMinPlayed == null || (sinceMs != null && pageMinPlayed <= sinceMs)) {
      break;
    }

    before = pageMinPlayed - 1;
  }

  if (maxPlayedAt != null && maxPlayedAt !== sinceMs) {
    await prisma.cursor.update({
      where: { id: cursorRecord.id },
      data: { cursor: String(maxPlayedAt) },
    });
  }

  // Enrich items with genre information
  if (items.length > 0) {
    await enrichEventsWithGenres(items, accessTokenInUse);
  }

  return { items, nextCursor: maxPlayedAt != null ? String(maxPlayedAt) : sinceMs };
};

const collect = async () => {
  const accounts = await prisma.connectedAccount.findMany({
    where: { provider: source, status: 'active' },
    include: { oauthTokens: { orderBy: { updatedAt: 'desc' }, take: 3 } },
  });

  if (accounts.length === 0) {
    console.warn('No Spotify connected accounts found; skipping collection.');
    return { items: [], nextCursor: null };
  }

  const allItems = [];
  for (const account of accounts) {
    const { items = [] } = await collectForAccount(account);
    allItems.push(...items);
  }

  return { items: allItems, nextCursor: null };
};

registerCollector({ source, collect, collectForAccount });

export default collect;
