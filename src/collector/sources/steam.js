import { registerCollector } from '../registry.js';
import prisma from '../../lib/prismaClient.js';
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '../../lib/redisClient.js';
import { resolveSteamId, getAllSteamAccounts } from '../../auth/steam.js';

const source = 'steam';
const API_BASE = 'https://api.steampowered.com';

const apiKey = process.env.STEAM_API_KEY;

/**
 * Get today's date key in YYYY-MM-DD format
 * @returns {string}
 */
const getTodayKey = () => {
  const now = new Date();
  return now.toISOString().slice(0, 10);
};

/**
 * Get midnight UTC for a date key
 * @param {string} dateKey - YYYY-MM-DD format
 * @returns {Date}
 */
const getDateMidnight = (dateKey) => {
  return new Date(`${dateKey}T00:00:00.000Z`);
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
 * Get or initialize the playtime baseline from Cursor
 * @param {string} cursorSource - Cursor source identifier
 * @param {string|null} connectedAccountId - Connected account ID (null for global)
 * @returns {Promise<{id: string, baselines: object}>}
 */
const getPlaytimeBaselines = async (cursorSource, connectedAccountId = null) => {
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
      cursor: JSON.stringify({})
    },
    update: {},
  });
  
  let baselines = {};
  if (cursorRecord.cursor) {
    try {
      baselines = JSON.parse(cursorRecord.cursor);
    } catch (err) {
      console.warn('Failed to parse Steam baselines cursor:', err.message);
    }
  }
  
  return { id: cursorRecord.id, baselines };
};

/**
 * Update the playtime baselines in Cursor
 * @param {string} cursorId - Cursor record ID
 * @param {object} baselines - Updated baselines object
 */
const updatePlaytimeBaselines = async (cursorId, baselines) => {
  await prisma.cursor.update({
    where: { id: cursorId },
    data: { cursor: JSON.stringify(baselines) },
  });
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
 * Create or upsert a daily playtime event
 * @param {number} appid - Steam app ID
 * @param {object} metadata - Game metadata
 * @param {number} deltaMinutes - Minutes played since last check
 * @param {number} currentPlaytime2Weeks - Current playtime_2weeks value
 * @param {string} dateKey - YYYY-MM-DD date key
 * @param {string|null} userId - User ID
 * @returns {Promise<object>} - Event object
 */
const upsertDailyPlaytimeEvent = async (appid, metadata, deltaMinutes, currentPlaytime2Weeks, dateKey, userId) => {
  const externalId = `steam:play_daily:${appid}:${dateKey}`;
  
  // Check if event already exists
  const existingEvent = await prisma.event.findUnique({
    where: { source_externalId: { source, externalId } },
  });
  
  const now = new Date().toISOString();
  
  if (existingEvent) {
    // Update existing event
    const existingPayload = existingEvent.payload || {};
    const newMinutes = (existingPayload.minutes || 0) + deltaMinutes;
    
    const updatedPayload = {
      ...existingPayload,
      minutes: newMinutes,
      lastDeltaMinutes: deltaMinutes,
      lastObservedPlaytime2Weeks: currentPlaytime2Weeks,
      updatedAt: now,
    };
    
    const updated = await prisma.event.update({
      where: { id: existingEvent.id },
      data: { payload: updatedPayload },
    });
    
    return {
      eventType: updated.eventType,
      occurredAt: updated.occurredAt,
      externalId: updated.externalId,
      payload: updatedPayload,
      userId: updated.userId,
      _updated: true,
    };
  }
  
  // Create new event
  const payload = {
    appid,
    name: metadata.name,
    minutes: deltaMinutes,
    lastDeltaMinutes: deltaMinutes,
    lastObservedPlaytime2Weeks: currentPlaytime2Weeks,
    updatedAt: now,
    images: {
      iconUrl: metadata.iconUrl,
      logoUrl: metadata.logoUrl,
    },
    storeUrl: metadata.storeUrl,
  };
  
  return {
    eventType: 'steam_game_played_daily',
    occurredAt: getDateMidnight(dateKey),
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
 * Collect Steam playtime data using daily accumulator model
 * @param {string} userId - User ID
 * @param {string} steamId - Steam ID (64-bit)
 * @returns {Promise<{items: object[], nextCursor: null}>}
 */
const collectPlaytime = async (userId, steamId) => {
  if (!apiKey || !steamId) {
    console.warn('Steam collector missing STEAM_API_KEY or Steam ID');
    return { items: [], nextCursor: null };
  }
  
  const games = await fetchRecentlyPlayedGames(steamId);
  
  if (games.length === 0) {
    console.log('No recently played Steam games found');
    return { items: [], nextCursor: null };
  }
  
  const cursorSource = 'steam:playtime_2weeks';
  const { id: cursorId, baselines } = await getPlaytimeBaselines(cursorSource, null);
  
  const todayKey = getTodayKey();
  const items = [];
  const updatedBaselines = { ...baselines };
  
  for (const game of games) {
    const appid = game.appid;
    const currentPlaytime2Weeks = game.playtime_2weeks || 0;
    const previousPlaytime = baselines[appid] || 0;
    
    // Calculate delta (protect against negative values)
    const deltaMinutes = Math.max(0, currentPlaytime2Weeks - previousPlaytime);
    
    // Update baseline
    updatedBaselines[appid] = currentPlaytime2Weeks;
    
    // Only create/update event if there's actual playtime
    if (deltaMinutes > 0) {
      const metadata = await getGameMetadata(game);
      const event = await upsertDailyPlaytimeEvent(
        appid,
        metadata,
        deltaMinutes,
        currentPlaytime2Weeks,
        todayKey,
        userId
      );
      
      // Only add to items if it's a new event (not an update)
      if (!event._updated) {
        items.push(event);
      }
      
      console.log(`Steam: ${metadata.name} +${deltaMinutes}m (total today: ${event.payload?.minutes || deltaMinutes}m)`);
    }
  }
  
  // Clean up old baselines for games not in recent list
  // Steam's playtime_2weeks resets after 2 weeks of no play
  const currentAppIds = new Set(games.map(g => g.appid));
  for (const appid of Object.keys(updatedBaselines)) {
    if (!currentAppIds.has(Number(appid))) {
      // Game dropped off the recent list, reset baseline
      delete updatedBaselines[appid];
    }
  }
  
  // Save updated baselines
  await updatePlaytimeBaselines(cursorId, updatedBaselines);
  
  return { items, nextCursor: null };
};

/**
 * Collect Steam achievements for recently played games
 * @param {string} userId - User ID
 * @param {string} steamId - Steam ID (64-bit)
 * @returns {Promise<{items: object[], nextCursor: null}>}
 */
const collectAchievements = async (userId, steamId) => {
  if (!apiKey || !steamId) {
    return { items: [], nextCursor: null };
  }
  
  const games = await fetchRecentlyPlayedGames(steamId);
  
  if (games.length === 0) {
    return { items: [], nextCursor: null };
  }
  
  const cursorSource = 'steam:achievements';
  const { id: cursorId, lastChecked } = await getAchievementCursor(cursorSource, null);
  
  const items = [];
  const updatedLastChecked = { 
    ...lastChecked, 
    lastRun: new Date().toISOString() 
  };
  
  // Only check achievements for games played recently
  // Use a 24-hour lookback for achievement detection
  const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
  
  for (const game of games) {
    const appid = game.appid;
    const metadata = await getGameMetadata(game);
    
    const achievements = await fetchPlayerAchievements(steamId, appid);
    
    // Find newly unlocked achievements (within the last 24 hours or since last check)
    const lastCheckedTime = lastChecked.lastCheckedAppIds?.[appid] || oneDayAgo;
    
    for (const achievement of achievements) {
      if (!achievement.achieved || !achievement.unlocktime) continue;
      
      // Only include achievements unlocked since last check
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
    
    console.log('  - Fetching playtime data...');
    const playtimeResult = await collectPlaytime(userId, steamId);
    
    console.log('  - Checking for new achievements...');
    const achievementResult = await collectAchievements(userId, steamId);
    
    const items = [...playtimeResult.items, ...achievementResult.items];
    allItems.push(...items);
    
    console.log(`  - ${items.length} new events for this user`);
  }
  
  console.log(`Steam collector: ${allItems.length} total new events`);
  
  return { items: allItems, nextCursor: null };
};

registerCollector({ source, collect });

export default collect;
