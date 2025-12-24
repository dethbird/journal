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

  const playtimeEvents = events.filter(e => e.eventType === 'steam_game_played_daily');
  const achievementEvents = events.filter(e => e.eventType === 'steam_achievement_unlocked');

  // Aggregate playtime by game
  const gamePlaytime = new Map();
  let totalMinutes = 0;

  for (const evt of playtimeEvents) {
    const payload = evt.payload ?? {};
    const appid = payload.appid;
    const minutes = payload.minutes || 0;

    if (!appid) continue;

    totalMinutes += minutes;

    if (gamePlaytime.has(appid)) {
      const existing = gamePlaytime.get(appid);
      existing.minutes += minutes;
    } else {
      gamePlaytime.set(appid, {
        appid,
        name: payload.name || `App ${appid}`,
        minutes,
        iconUrl: payload.images?.iconUrl || null,
        logoUrl: payload.images?.logoUrl || null,
        storeUrl: payload.storeUrl || null,
      });
    }
  }

  // Sort games by playtime descending
  const topGames = [...gamePlaytime.values()]
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, MAX_GAMES)
    .map((game) => ({
      ...game,
      durationLabel: formatDurationMinutes(game.minutes),
    }));

  // Process achievements
  const achievements = achievementEvents
    .map((evt) => {
      const payload = evt.payload ?? {};
      return {
        appid: payload.appid,
        gameName: payload.gameName || `App ${payload.appid}`,
        achievementName: payload.achievementName || payload.achievementApiName || 'Unknown Achievement',
        achievementDescription: payload.achievementDescription || null,
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

  // Calculate time range
  let first = null;
  let last = null;

  for (const evt of events) {
    const occurredAt = evt.occurredAt ? new Date(evt.occurredAt) : null;
    if (occurredAt && !Number.isNaN(occurredAt.getTime())) {
      if (!first || occurredAt < first) first = occurredAt;
      if (!last || occurredAt > last) last = occurredAt;
    }
  }

  // Don't return section if no meaningful data
  if (topGames.length === 0 && achievements.length === 0) {
    return null;
  }

  return {
    kind: 'gaming',
    summary: {
      totalMinutes,
      totalDurationLabel: formatDurationMinutes(totalMinutes),
      gamesPlayed: gamePlaytime.size,
      achievementsUnlocked: achievementEvents.length,
      achievementSummary,
      firstActivity: first ? first.toISOString() : null,
      lastActivity: last ? last.toISOString() : null,
    },
    topGames,
    achievements,
  };
};

export default buildSteamSection;
