import { registerDigest } from '../registry.js';

const MAX_ITEMS = 20;

const summarizeByType = (events) => {
  const counts = new Map();
  for (const evt of events) {
    const key = evt.eventType ?? 'event';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
};

const summarizeByRepo = (events) => {
  const counts = new Map();
  for (const evt of events) {
    const repoName = evt.payload?.repo?.name ?? 'unknown-repo';
    counts.set(repoName, (counts.get(repoName) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
};

const formatDate = (date) => date.toISOString();

const build = (events) => {
  const total = events.length;
  const byType = summarizeByType(events);
  const byRepo = summarizeByRepo(events);
  const latest = [...events]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, Math.min(events.length, MAX_ITEMS));

  const lines = [];
  lines.push(`Total: ${total}`);
  if (byType.length) {
    lines.push(
      'By type: ' +
        byType
          .map(([type, count]) => `${type} (${count})`)
          .join(', ')
    );
  }
  if (byRepo.length) {
    lines.push(
      'By repo: ' +
        byRepo
          .map(([repo, count]) => `${repo} (${count})`)
          .slice(0, 5)
          .join(', ')
    );
  }
  if (latest.length) {
    lines.push('Latest events:');
    for (const evt of latest) {
      const repoName = evt.payload?.repo?.name ?? 'unknown-repo';
      lines.push(`  - ${formatDate(evt.occurredAt)} — ${evt.eventType} — ${repoName}`);
    }
  }

  return { title: 'GitHub', lines };
};

registerDigest({ source: 'github', build });

export default build;
