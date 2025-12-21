import prisma from '../lib/prismaClient.js';
import buildGithubSection from './sections/github.js';
import buildBookmarksSection from './sections/bookmarks.js';
import buildSpotifySection from './sections/spotify.js';
import buildTimelineSection from './sections/timeline.js';
import buildTrelloSection from './sections/trello.js';

const DEFAULT_RANGE_HOURS = Number(process.env.DIGEST_RANGE_HOURS ?? 24);

const normalizeRange = ({ since, until, rangeHours }) => {
  const end = until ?? new Date();
  const hours = Number.isFinite(rangeHours) && rangeHours > 0 ? rangeHours : DEFAULT_RANGE_HOURS;
  const start = since ?? new Date(end.getTime() - hours * 60 * 60 * 1000);
  return { start, end };
};

export const buildDigestViewModel = async ({ since = null, until = null, userId = null, rangeHours = null } = {}) => {
  const { start, end } = normalizeRange({ since, until, rangeHours });

  const events = await prisma.event.findMany({
    where: {
      ...(userId ? { userId } : {}),
      occurredAt: { gte: start, lte: end },
    },
    orderBy: { occurredAt: 'asc' },
    include: { enrichments: true },
  });

  const grouped = new Map();
  for (const evt of events) {
    if (!grouped.has(evt.source)) grouped.set(evt.source, []);
    grouped.get(evt.source).push(evt);
  }

  const sections = [];
  if (grouped.has('github')) {
    const section = buildGithubSection(grouped.get('github'));
    if (section) sections.push(section);
  }
  if (grouped.has('email_bookmarks')) {
    const section = buildBookmarksSection(grouped.get('email_bookmarks'));
    if (section) sections.push(section);
  }
  if (grouped.has('spotify')) {
    const section = buildSpotifySection(grouped.get('spotify'));
    if (section) sections.push(section);
  }
  if (grouped.has('google_timeline')) {
    const section = buildTimelineSection(grouped.get('google_timeline'));
    if (section) sections.push(section);
  }
  if (grouped.has('trello')) {
    const section = buildTrelloSection(grouped.get('trello'));
    if (section) sections.push(section);
  }

  // Extract weather summary from timeline events for the window
  let weather = null;
  if (grouped.has('google_timeline')) {
    const timelineEvents = grouped.get('google_timeline');
    // Find most recent weather enrichment in this window
    for (const evt of timelineEvents.slice().reverse()) {
      const weatherEnrichment = evt.enrichments?.find(e => e.enrichmentType === 'weather_v1');
      if (weatherEnrichment?.data?.weather) {
        weather = weatherEnrichment.data.weather;
        break;
      }
    }
  }

  return {
    window: { start: start.toISOString(), end: end.toISOString() },
    weather,
    sections,
  };
};

export default buildDigestViewModel;
