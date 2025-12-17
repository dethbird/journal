import { registerDigest } from '../registry.js';

const DIVIDER = '────────────────────';
const MAX_ARTISTS = Number(process.env.DIGEST_SPOTIFY_MAX_ARTISTS ?? 4);
const MAX_TRACKS = Number(process.env.DIGEST_SPOTIFY_MAX_TRACKS ?? 3);

const formatDuration = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) return `${hours}h ${remainingMinutes}m`;
  if (minutes > 0) return `${minutes}m`;
  const seconds = Math.round(ms / 1000);
  return `${seconds}s`;
};

const collectStats = (events) => {
  const artistCounts = new Map();
  const trackCounts = new Map();
  let durationMs = 0;
  let first = null;
  let last = null;

  for (const evt of events) {
    const payload = evt.payload ?? {};
    const track = payload.track ?? {};

    if (track.durationMs) {
      durationMs += Number(track.durationMs) || 0;
    }

    if (Array.isArray(payload.artists)) {
      for (const artist of payload.artists) {
        if (!artist?.name) continue;
        const current = artistCounts.get(artist.name) ?? 0;
        artistCounts.set(artist.name, current + 1);
      }
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
  }

  const topArtists = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_ARTISTS)
    .map(([name, count]) => ({ name, count }));

  const topTracks = [...trackCounts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, MAX_TRACKS);

  return { durationMs, topArtists, topTracks, first, last };
};

const build = (events) => {
  if (!events.length) {
    return { title: 'Spotify', lines: ['No Spotify plays in this window.'] };
  }

  const lines = [DIVIDER, 'Spotify', DIVIDER, ''];
  const { durationMs, topArtists, topTracks, first, last } = collectStats(events);
  const playCount = events.length;
  const uniqueTracks = new Set(events.map((evt) => evt.payload?.track?.id || evt.payload?.track?.name)).size;

  const durationLabel = formatDuration(durationMs);
  const summaryParts = [`${playCount} play${playCount === 1 ? '' : 's'}`, `${uniqueTracks} track${uniqueTracks === 1 ? '' : 's'}`];
  if (durationLabel) summaryParts.push(durationLabel);
  lines.push(`• ${summaryParts.join(' · ')}`);

  if (topArtists.length) {
    const artistLine = topArtists
      .map((artist) => `${artist.name} (${artist.count})`)
      .join(', ');
    lines.push(`• Top artists: ${artistLine}`);
  }

  if (topTracks.length) {
    const trackLine = topTracks.map((track) => `${track.name} (${track.count})`).join(', ');
    lines.push(`• Most played: ${trackLine}`);
  }

  if (first && last) {
    lines.push(`• First play: ${first.toISOString()}`);
    lines.push(`• Last play: ${last.toISOString()}`);
  }

  return { title: 'Spotify', lines, skipTitle: true };
};

registerDigest({ source: 'spotify', build });

export default build;
