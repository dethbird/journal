const MAX_GAMES = Number(process.env.DIGEST_STEAM_MAX_GAMES ?? 10);
const MAX_ACHIEVEMENTS = Number(process.env.DIGEST_STEAM_MAX_ACHIEVEMENTS ?? 10);

/**
 * Format minutes to human-readable duration
 * @param {number} minutes - Total minutes
 * @returns {string|null}
 */
const formatDurationMinutes = (minutes) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) return `${hours}h ${remainingMinutes}m`;
  return `${minutes}m`;
};

/**
 * Build the Steam section for the digest
 * @param {object[]} events - Array of Steam events
 * @returns {object|null} - Steam digest section or null if no events
 */
export const buildSteamSection = (events) => {
  if (!events?.length) return null;

  const snapshotEvents = events.filter(e => e.eventType === 'steam_game_snapshot');
  const achievementEvents = events.filter(e => e.eventType === 'steam_achievement_unlocked');

  // Group snapshots by date to avoid showing multiple days
  const snapshotsByDate = new Map();
  for (const evt of snapshotEvents) {
    const payload = evt.payload ?? {};
    const snapshotDate = payload.snapshotDate;
    if (!snapshotDate) continue;
    
    if (!snapshotsByDate.has(snapshotDate)) {
      snapshotsByDate.set(snapshotDate, []);
    }
    snapshotsByDate.get(snapshotDate).push(evt);
  }

  // Get the most recent snapshot date (prefer latest)
  const sortedDates = [...snapshotsByDate.keys()].sort().reverse();
  const latestSnapshotDate = sortedDates[0];
  const snapshotsToUse = latestSnapshotDate ? snapshotsByDate.get(latestSnapshotDate) : [];

  // Parse games from the selected snapshot date only
  const games = [];
  
  for (const evt of snapshotsToUse) {
    const payload = evt.payload ?? {};
    const playtime2Weeks = payload.playtime_2weeks || 0;
    
    if (playtime2Weeks > 0) {
      games.push({
        appid: payload.appid,
        name: payload.name || `App ${payload.appid}`,
        playtime_2weeks: playtime2Weeks,
        durationLabel: formatDurationMinutes(playtime2Weeks),
        iconUrl: payload.images?.iconUrl || null,
        logoUrl: payload.images?.logoUrl || null,
        storeUrl: payload.storeUrl || null,
      });
    }
  }

  // Sort games by playtime descending and limit
  const topGames = games
    .sort((a, b) => b.playtime_2weeks - a.playtime_2weeks)
    .slice(0, MAX_GAMES);

  // Process achievements (keep existing logic, no aggregation needed)
  const achievements = achievementEvents
    .map((evt) => {
      const payload = evt.payload ?? {};
      return {
        appid: payload.appid,
        gameName: payload.gameName || `App ${payload.appid}`,
        achievementName: payload.achievementName || payload.achievementApiName || 'Unknown Achievement',
        achievementDescription: payload.achievementDescription || null,
        achievementIconUrl: payload.achievementIconUrl || null, // Add icon URL
        unlockedAt: payload.unlockedAt || evt.occurredAt?.toISOString?.() || null,
        iconUrl: payload.images?.iconUrl || null,
        storeUrl: payload.storeUrl || null,
      };
    })
    .sort((a, b) => {
      // Sort by unlock time descending
      const timeA = a.unlockedAt ? new Date(a.unlockedAt).getTime() : 0;
      const timeB = b.unlockedAt ? new Date(b.unlockedAt).getTime() : 0;
      return timeB - timeA;
    })
    .slice(0, MAX_ACHIEVEMENTS);

  // Group achievements by game for summary
  const achievementsByGame = new Map();
  for (const achievement of achievementEvents) {
    const payload = achievement.payload ?? {};
    const appid = payload.appid;
    if (!appid) continue;
    
    if (!achievementsByGame.has(appid)) {
      achievementsByGame.set(appid, {
        gameName: payload.gameName || `App ${appid}`,
        count: 0,
      });
    }
    achievementsByGame.get(appid).count += 1;
  }

  const achievementSummary = [...achievementsByGame.values()]
    .sort((a, b) => b.count - a.count);

  // Calculate total minutes from the snapshot (raw Steam API value)
  const totalMinutes = topGames.reduce((sum, game) => sum + game.playtime_2weeks, 0);

  // Don't return section if no meaningful data
  if (topGames.length === 0 && achievements.length === 0) {
    return null;
  }

  return {
    kind: 'gaming',
    summary: {
      totalMinutes,
      totalDurationLabel: formatDurationMinutes(totalMinutes),
      gamesPlayed: games.length,
      achievementsUnlocked: achievementEvents.length,
      achievementSummary,
      snapshotDate: latestSnapshotDate, // Date of the snapshot being displayed
    },
    topGames,
    achievements,
  };
};

export default buildSteamSection;
