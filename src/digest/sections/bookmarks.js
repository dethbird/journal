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
    
    // Extract comment text from the first link
    const commentText = payload.links?.[0]?.text ?? null;
    
    // Extract domain from enrichment site or parse from URL
    let sourceDomain = readability?.site ?? null;
    if (!sourceDomain && url) {
      try {
        sourceDomain = new URL(url).hostname.replace(/^www\./, '');
      } catch (err) {
        // ignore
      }
    }

    items.push({
      id: evt.id, // Include event ID for deletion
      title,
      url,
      excerpt,
      imageUrl,
      commentText,
      from: payload.from ?? null,
      sourceDomain,
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
