const MAX_BOOKMARKS = Number(process.env.DIGEST_BOOKMARK_MAX_ITEMS ?? 12);

const getEnrichment = (event, type) => event.enrichments?.find((en) => en.enrichmentType === type)?.data ?? null;

const firstLink = (payload) => {
  if (!payload?.links) return null;
  const first = payload.links[0];
  if (!first) return null;
  if (typeof first === 'string') return first;
  return first.url ?? null;
};

export const buildBookmarksSection = (events) => {
  if (!events?.length) return null;

  const items = [];

  for (const evt of events) {
    const payload = evt.payload ?? {};
    const url = firstLink(payload) ?? payload.url ?? null;
    if (!url) continue;

    const readability = getEnrichment(evt, 'readability_v1');
    const title = readability?.title ?? payload.subject ?? url;
    const excerpt = readability?.excerpt ?? payload.raw?.snippet ?? payload.snippet ?? null;
    const imageUrl = readability?.lead_image_url ?? readability?.image ?? null;

    items.push({
      id: evt.id, // Include event ID for deletion
      title,
      url,
      excerpt,
      imageUrl,
      from: payload.from ?? null,
      occurredAt: evt.occurredAt instanceof Date ? evt.occurredAt.toISOString() : evt.occurredAt,
    });
  }

  const limited = items
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, MAX_BOOKMARKS);

  return {
    kind: 'bookmarks',
    count: items.length,
    items: limited,
  };
};

export default buildBookmarksSection;
