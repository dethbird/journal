import { registerCollector } from '../registry.js';
import prisma from '../../lib/prismaClient.js';
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '../../lib/redisClient.js';
import { resolveSteamId, getAllSteamAccounts } from '../../auth/steam.js';

const source = 'steam';
const API_BASE = 'https://api.steampowered.com';

const apiKey = process.env.STEAM_API_KEY;

/**
 * Get today's date key in YYYY-MM-DD format (local timezone)
 * @returns {string}
 */
/**
 * Get today's date key in YYYY-MM-DD format for a given timezone
 * @param {string} timezone - IANA timezone identifier (e.g., "America/New_York")
 * @returns {string}
 */
const getTodayKey = (timezone = 'UTC') => {
  const now = new Date();
  // Format date in the user's timezone
  const formatter = new Intl.DateTimeFormat('en-CA', { 
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now); // Returns YYYY-MM-DD
};

/**
 * Get midnight in a specific timezone for a date key, returned as UTC Date
 * @param {string} dateKey - YYYY-MM-DD format
 * @param {string} timezone - IANA timezone identifier
 * @returns {Date}
 */
const getDateMidnight = (dateKey, timezone = 'UTC') => {
  // Create an ISO string for midnight in the target timezone
  // then parse it as if it's local time and convert to UTC
  const isoString = `${dateKey}T00:00:00`;
  
  // For UTC, simple case
  if (timezone === 'UTC') {
    return new Date(isoString + 'Z');
  }
  
  // For other timezones, we need to find what UTC time equals midnight in that timezone
  // Strategy: Start from a guess (UTC midnight) and search nearby hours
  const [year, month, day] = dateKey.split('-').map(Number);
  
  // Check UTC hours from -12 to +14 (to cover all possible timezones)
  for (let hourOffset = -12; hourOffset <= 14; hourOffset++) {
    const candidate = new Date(Date.UTC(year, month - 1, day, -hourOffset, 0, 0, 0));
    
    // Format this UTC time in the target timezone
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(candidate);
    
    // Check if this corresponds to midnight on our target date
    const expectedPrefix = `${dateKey}, 00:00`;
    if (formatted.startsWith(expectedPrefix)) {
      return candidate;
    }
  }
  
  // Fallback to UTC if we can't determine
  console.warn(`Could not determine midnight for ${dateKey} in timezone ${timezone}, using UTC`);
  return new Date(isoString + 'Z');
};

/**
 * Build Steam image URL from app ID and hash
 * @param {number} appid - Steam app ID
 * @param {string} hash - Image hash
 * @returns {string|null}
 */
const buildImageUrl = (appid, hash) => {
  if (!appid || !hash) return null;
  return `https://media.steampowered.com/steamcommunity/public/images/apps/${appid}/${hash}.jpg`;
};

/**
 * Build Steam store URL from app ID
 * @param {number} appid - Steam app ID
 * @returns {string}
 */
const buildStoreUrl = (appid) => {
  return `https://store.steampowered.com/app/${appid}`;
};

/**
 * Get game metadata from cache or API response
 * @param {object} game - Game object from API
 * @returns {Promise<object>} - Game metadata
 */
const getGameMetadata = async (game) => {
  const cacheKey = CACHE_KEYS.STEAM_APP + game.appid;
  
  // Try cache first
  const cached = await getCached(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Build metadata from API response
  const metadata = {
    appid: game.appid,
    name: game.name || `App ${game.appid}`,
    iconUrl: buildImageUrl(game.appid, game.img_icon_url),
    logoUrl: buildImageUrl(game.appid, game.img_logo_url),
    storeUrl: buildStoreUrl(game.appid),
    lastFetchedAt: new Date().toISOString(),
  };
  
  // Cache the metadata
  await setCached(cacheKey, metadata, CACHE_TTL.STEAM_APP);
  
  return metadata;
};

/**
 * Fetch recently played games from Steam API
 * @param {string} steamId - 64-bit Steam ID
 * @returns {Promise<object[]>} - Array of game objects
 */
const fetchRecentlyPlayedGames = async (steamId) => {
  const url = `${API_BASE}/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${apiKey}&steamid=${steamId}&format=json`;
  
  const res = await fetch(url);
  
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Steam API failed (${res.status}): ${body}`);
  }
  
  const data = await res.json();
  return data.response?.games || [];
};

/**
 * Fetch player achievements for a game
 * @param {string} steamId - 64-bit Steam ID
 * @param {number} appid - Steam app ID
 * @returns {Promise<object[]>} - Array of achievement objects
 */
const fetchPlayerAchievements = async (steamId, appid) => {
  const url = `${API_BASE}/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appid}&key=${apiKey}&steamid=${steamId}`;
  
  try {
    const res = await fetch(url);
    
    if (!res.ok) {
      // Some games don't have achievements, or profile might be private
      return [];
    }
    
    const data = await res.json();
    
    if (!data.playerstats?.success) {
      return [];
    }
    
    return data.playerstats?.achievements || [];
  } catch (err) {
    console.warn(`Failed to fetch achievements for appid=${appid}:`, err.message);
    return [];
  }
};



/**
 * Get or initialize the achievement cursor from Cursor
 * @param {string} cursorSource - Cursor source identifier
 * @param {string|null} connectedAccountId - Connected account ID (null for global)
 * @returns {Promise<{id: string, lastChecked: object}>}
 */
const getAchievementCursor = async (cursorSource, connectedAccountId = null) => {
  const cursorRecord = await prisma.cursor.upsert({
    where: { 
      source_connectedAccountId: { 
        source: cursorSource, 
        connectedAccountId: connectedAccountId 
      } 
    },
    create: { 
      source: cursorSource, 
      connectedAccountId: connectedAccountId,
      cursor: JSON.stringify({ lastCheckedAppIds: {}, lastRun: null })
    },
    update: {},
  });
  
  let lastChecked = { lastCheckedAppIds: {}, lastRun: null };
  if (cursorRecord.cursor) {
    try {
      lastChecked = JSON.parse(cursorRecord.cursor);
    } catch (err) {
      console.warn('Failed to parse Steam achievement cursor:', err.message);
    }
  }
  
  return { id: cursorRecord.id, lastChecked };
};

/**
 * Update the achievement cursor
 * @param {string} cursorId - Cursor record ID
 * @param {object} lastChecked - Updated cursor data
 */
const updateAchievementCursor = async (cursorId, lastChecked) => {
  await prisma.cursor.update({
    where: { id: cursorId },
    data: { cursor: JSON.stringify(lastChecked) },
  });
};

/**
 * Create a daily snapshot playtime event (once per day per game)
 * @param {number} appid - Steam app ID
 * @param {object} metadata - Game metadata
 * @param {number} playtime2Weeks - Raw playtime_2weeks value from Steam API
 * @param {string} dateKey - YYYY-MM-DD date key
 * @param {string} timezone - User's timezone
 * @param {string|null} userId - User ID
 * @returns {Promise<object|null>} - Event object or null if already exists
 */
const createDailySnapshotEvent = async (appid, metadata, playtime2Weeks, dateKey, timezone, userId) => {
  const externalId = `steam:snapshot:${appid}:${dateKey}`;
  
  // Check if we already collected this game's snapshot today
  const existingEvent = await prisma.event.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  
  if (existingEvent) {
    // Already collected today, skip
    return null;
  }
  
  // Create new snapshot event with raw Steam API data
  const payload = {
    appid,
    name: metadata.name,
    playtime_2weeks: playtime2Weeks, // Raw value from Steam API
    snapshotDate: dateKey,
    collectedAt: new Date().toISOString(),
    images: {
      iconUrl: metadata.iconUrl,
      logoUrl: metadata.logoUrl,
    },
    storeUrl: metadata.storeUrl,
  };
  
  return {
    eventType: 'steam_game_snapshot',
    occurredAt: getDateMidnight(dateKey, timezone),
    externalId,
    payload,
    userId,
  };
};

/**
 * Create an achievement unlocked event
 * @param {number} appid - Steam app ID
 * @param {object} metadata - Game metadata
 * @param {object} achievement - Achievement object from API
 * @param {string|null} userId - User ID
 * @returns {object} - Event object
 */
const createAchievementEvent = (appid, metadata, achievement, userId) => {
  const unlockTime = new Date(achievement.unlocktime * 1000);
  const externalId = `steam:achievement:${appid}:${achievement.apiname}:${achievement.unlocktime}`;
  
  const payload = {
    appid,
    gameName: metadata.name,
    achievementApiName: achievement.apiname,
    achievementName: achievement.name || achievement.apiname,
    achievementDescription: achievement.description || null,
    unlockedAt: unlockTime.toISOString(),
    images: {
      iconUrl: metadata.iconUrl,
      logoUrl: metadata.logoUrl,
    },
    storeUrl: metadata.storeUrl,
  };
  
  return {
    eventType: 'steam_achievement_unlocked',
    occurredAt: unlockTime,
    externalId,
    payload,
    userId,
  };
};

/**
 * Collect Steam playtime data as a daily snapshot (once per day per game)
 * @param {string} userId - User ID
 * @param {string} steamId - Steam ID (64-bit)
 * @param {string} connectedAccountId - Connected account ID
 * @param {string} userTimezone - User's timezone (IANA identifier)
 * @returns {Promise<{items: object[], nextCursor: null}>}
 */
const collectPlaytime = async (userId, steamId, connectedAccountId, userTimezone = 'UTC') => {
  if (!apiKey || !steamId) {
    console.warn('Steam collector missing STEAM_API_KEY or Steam ID');
    return { items: [], nextCursor: null };
  }
  
  const todayKey = getTodayKey(userTimezone);
  
  const games = await fetchRecentlyPlayedGames(steamId);
  
  if (games.length === 0) {
    console.log('No recently played Steam games found');
    return { items: [], nextCursor: null };
  }
  
  const items = [];
  
  for (const game of games) {
    const appid = game.appid;
    const playtime2Weeks = game.playtime_2weeks || 0;
    
    // Only create snapshot for games with actual playtime
    if (playtime2Weeks > 0) {
      const metadata = await getGameMetadata(game);
      const event = await createDailySnapshotEvent(
        appid,
        metadata,
        playtime2Weeks,
        todayKey,
        userTimezone,
        userId
      );
      
      if (event) {
        items.push(event);
        console.log(`Steam snapshot: ${metadata.name} - ${playtime2Weeks}m (2-week total)`);
      }
    }
  }
  
  return { items, nextCursor: null };
};

/**
 * Collect Steam achievements for recently played games (no limits, no enrichment)
 * @param {string} userId - User ID
 * @param {string} steamId - Steam ID (64-bit)
 * @param {string} connectedAccountId - Connected account ID
 * @returns {Promise<{items: object[], nextCursor: null}>}
 */
const collectAchievements = async (userId, steamId, connectedAccountId) => {
  if (!apiKey || !steamId) {
    return { items: [], nextCursor: null };
  }
  
  const games = await fetchRecentlyPlayedGames(steamId);
  
  if (games.length === 0) {
    return { items: [], nextCursor: null };
  }
  
  const cursorSource = 'steam:achievements';
  const { id: cursorId, lastChecked } = await getAchievementCursor(cursorSource, connectedAccountId);
  
  const items = [];
  const updatedLastChecked = { 
    ...lastChecked, 
    lastRun: new Date().toISOString() 
  };
  
  // Check all achievements, no time window limit
  const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
  
  for (const game of games) {
    const appid = game.appid;
    const metadata = await getGameMetadata(game);
    
    const achievements = await fetchPlayerAchievements(steamId, appid);
    
    // Find newly unlocked achievements since last check
    const lastCheckedTime = lastChecked.lastCheckedAppIds?.[appid] || oneDayAgo;
    
    for (const achievement of achievements) {
      if (!achievement.achieved || !achievement.unlocktime) continue;
      
      // Only include achievements unlocked since last check (prevents duplicates)
      if (achievement.unlocktime > lastCheckedTime) {
        const event = createAchievementEvent(appid, metadata, achievement, userId);
        items.push(event);
        console.log(`Steam achievement: ${achievement.name || achievement.apiname} in ${metadata.name}`);
      }
    }
    
    // Update last checked time for this app
    updatedLastChecked.lastCheckedAppIds = updatedLastChecked.lastCheckedAppIds || {};
    updatedLastChecked.lastCheckedAppIds[appid] = Math.floor(Date.now() / 1000);
    
    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  
  // Save updated cursor
  await updateAchievementCursor(cursorId, updatedLastChecked);
  
  return { items, nextCursor: null };
};

/**
 * Main collect function - collects both playtime and achievements
 * @returns {Promise<{items: object[], nextCursor: null}>}
 */
const collect = async () => {
  if (!apiKey) {
    console.warn('Steam collector disabled: missing STEAM_API_KEY environment variable');
    return { items: [], nextCursor: null };
  }
  
  // Get all active Steam accounts
  const steamAccounts = await getAllSteamAccounts();
  
  if (steamAccounts.length === 0) {
    console.warn('Steam collector: No connected Steam accounts found; skipping collection.');
    return { items: [], nextCursor: null };
  }
  
  const allItems = [];
  
  // Collect for each Steam account
  for (const { userId, steamId } of steamAccounts) {
    console.log(`Steam collector: fetching data for user ${userId} (Steam ID: ${steamId})...`);
    
    // Get the user and connected account
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    
    const connectedAccount = await prisma.connectedAccount.findFirst({
      where: {
        userId,
        provider: 'steam',
        providerAccountId: steamId,
        status: 'active',
      },
    });
    
    if (!connectedAccount) {
      console.warn(`  - Could not find connected account for user ${userId}, skipping`);
      continue;
    }
    
    const userTimezone = user?.timezone || 'UTC';
    console.log(`  - Using timezone: ${userTimezone}`);
    
    console.log('  - Fetching playtime data...');
    const playtimeResult = await collectPlaytime(userId, steamId, connectedAccount.id, userTimezone);
    
    console.log('  - Checking for new achievements...');
    const achievementResult = await collectAchievements(userId, steamId, connectedAccount.id);
    
    const items = [...playtimeResult.items, ...achievementResult.items];
    allItems.push(...items);
    
    console.log(`  - ${items.length} new events for this user`);
  }
  
  console.log(`Steam collector: ${allItems.length} total new events`);
  
  return { items: allItems, nextCursor: null };
};

registerCollector({ source, collect });

export default collect;
