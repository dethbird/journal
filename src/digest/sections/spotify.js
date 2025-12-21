const MAX_PLAYS = Number(process.env.DIGEST_SPOTIFY_MAX_PLAYS ?? 20);
const MAX_ARTISTS = Number(process.env.DIGEST_SPOTIFY_MAX_ARTISTS ?? 4);
const MAX_TRACKS = Number(process.env.DIGEST_SPOTIFY_MAX_TRACKS ?? 4);

const formatDurationMs = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) return `${hours}h ${remainingMinutes}m`;
  if (minutes > 0) return `${minutes}m`;
  const seconds = Math.round(ms / 1000);
  return `${seconds}s`;
};

export const buildSpotifySection = (events) => {
  if (!events?.length) return null;

  const artistCounts = new Map();
  const trackCounts = new Map();
  let durationMs = 0;
  let first = null;
  let last = null;

  const plays = [];

  for (const evt of events) {
    const payload = evt.payload ?? {};
    const track = payload.track ?? {};
    const artists = Array.isArray(payload.artists) ? payload.artists : [];

    if (track.durationMs) {
      durationMs += Number(track.durationMs) || 0;
    }

    for (const artist of artists) {
      if (!artist?.name) continue;
      const current = artistCounts.get(artist.name) ?? 0;
      artistCounts.set(artist.name, current + 1);
    }

    const trackKey = track.id || track.name;
    if (trackKey) {
      const existing = trackCounts.get(trackKey) ?? { count: 0, name: track.name || trackKey };
      existing.count += 1;
      trackCounts.set(trackKey, existing);
    }

    const occurredAt = evt.occurredAt ? new Date(evt.occurredAt) : null;
    if (occurredAt && !Number.isNaN(occurredAt.getTime())) {
      if (!first || occurredAt < first) first = occurredAt;
      if (!last || occurredAt > last) last = occurredAt;
    }

    plays.push({
      trackName: track.name ?? 'Unknown track',
      artists: artists.map((a) => a.name).filter(Boolean),
      album: payload.album?.name ?? null,
      albumImage: payload.album?.imageUrl ?? null,
      playedAt: occurredAt ? occurredAt.toISOString() : null,
      url: track.externalUrl ?? track.external_urls?.spotify ?? null,
      uri: track.uri ?? (track.id ? `spotify:track:${track.id}` : null),
    });
  }

  const topArtists = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_ARTISTS)
    .map(([name, count]) => ({ name, count }));

  const topTracks = [...trackCounts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, MAX_TRACKS);

  const orderedPlays = plays
    .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime())
    .slice(0, MAX_PLAYS);

  return {
    kind: 'music',
    summary: {
      playCount: plays.length,
      uniqueTracks: trackCounts.size,
      durationMs,
      durationLabel: formatDurationMs(durationMs),
      firstPlay: first ? first.toISOString() : null,
      lastPlay: last ? last.toISOString() : null,
      topArtists,
      topTracks,
    },
    plays: orderedPlays,
  };
};

export default buildSpotifySection;
