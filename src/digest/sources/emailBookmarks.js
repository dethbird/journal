import { registerDigest } from '../registry.js';

const formatDateTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace('T', ' ').replace('.000Z', 'Z');
};

const shortUrlDisplay = (href) => {
  if (!href) return 'no link';
  return href;
};

const statusTag = (enrichment) => {
  if (!enrichment) {
    return '⚠️ og-only';
  }

  if (enrichment.status === 'ok') {
    const parserLabel = enrichment.parser ?? 'readability';
    const imageFlag = enrichment.image ? ' [img]' : '';
    return `✅ ${parserLabel}${imageFlag}`;
  }

  const httpStatus = enrichment.httpStatus ? ` ${enrichment.httpStatus}` : '';
  return `❌ failed${httpStatus}`;
};

const excerptLine = (enrichment, payload) => {
  const excerpt = enrichment?.excerpt ?? payload.raw?.snippet ?? payload.snippet ?? '';
  if (!excerpt) return null;
  const clean = excerpt.replace(/\s+/g, ' ').trim();
  const clipped = clean.length > 280 ? `${clean.slice(0, 280)}…` : clean;
  return `  “${clipped}”`;
};

const metaLine = (enrichment, payload, status) => {
  const parts = [];
  if (enrichment?.byline) {
    parts.push(`by ${enrichment.byline}`);
  }

  const wordCount = enrichment?.wordCount;
  if (wordCount) {
    parts.push(`${wordCount}w`);
  } else if (enrichment?.textContent) {
    const words = enrichment.textContent.split(/\s+/).filter(Boolean).length;
    if (words) {
      const minutes = Math.max(1, Math.ceil(words / 200));
      parts.push(`~${minutes}m read`);
    }
  }

  const published = enrichment?.publishedAt ?? payload.receivedAt;
  if (published) {
    const formatted = formatDateTime(published);
    if (formatted) {
      parts.push(formatted);
    }
  }

  parts.push(status);
  return `  ${parts.filter(Boolean).join(' · ')}`;
};

const build = (events) => {
  if (!events.length) {
    return { title: 'Bookmarks', lines: [] };
  }

  // Deduplicate events by `externalId`, preferring the newest occurrence
  const byExternal = new Map();
  for (const evt of events) {
    const key = evt.externalId ?? `${evt.source}:${evt.id}`;
    const existing = byExternal.get(key);
    if (!existing || new Date(evt.occurredAt).getTime() > new Date(existing.occurredAt).getTime()) {
      byExternal.set(key, evt);
    }
  }

  const ordered = [...byExternal.values()].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const lines = ['Bookmarks (' + ordered.length + ')'];

  ordered.forEach((event, index) => {
    const payload = event.payload ?? {};
    const links = Array.isArray(payload.links) ? payload.links : [];
    const firstLink = links[0]?.url || links[0] || null;

    const enrichment = event.enrichments?.find((en) => en.enrichmentType === 'readability_v1')?.data ?? null;

    const site = enrichment?.site || (firstLink ? (() => {
      try {
        return new URL(firstLink).hostname;
      } catch (error) {
        return 'Bookmark';
      }
    })() : 'Bookmark');

    const title = enrichment?.title ?? payload.subject ?? 'Bookmark';
    lines.push('');
    lines.push(`${index + 1}) ${site} — ${title}`);

    const status = statusTag(enrichment);
    lines.push(metaLine(enrichment, payload, status));

    const excerpt = excerptLine(enrichment, payload);
    if (excerpt) {
      lines.push(excerpt);
    }

    lines.push(`  ${shortUrlDisplay(firstLink ?? payload.raw?.url ?? 'no link')}`);
  });

  return { title: 'Bookmarks', lines };
};

registerDigest({ source: 'email_bookmarks', build });

export default build;
