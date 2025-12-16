import 'dotenv/config';
import prisma from '../lib/prismaClient.js';
import { getDigestBuilder } from './registry.js';
import './sources/github.js';

const DEFAULT_RANGE_HOURS = 24;
const MAX_GENERIC_ITEMS = 20;

const formatDate = (date) => date.toISOString();

const genericDigest = (source, events) => {
  const lines = [`Total: ${events.length}`];
  const latest = [...events]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, Math.min(events.length, MAX_GENERIC_ITEMS));
  if (latest.length) {
    lines.push('Latest events:');
    for (const evt of latest) {
      lines.push(`  - ${formatDate(evt.occurredAt)} — ${evt.eventType ?? 'event'}`);
    }
  }
  return { title: source, lines };
};

const buildDigest = async () => {
  const sinceEnv = process.env.DIGEST_SINCE;
  const rangeHours = Number(process.env.DIGEST_RANGE_HOURS ?? DEFAULT_RANGE_HOURS);
  const now = new Date();
  const since = sinceEnv ? new Date(sinceEnv) : new Date(now.getTime() - rangeHours * 60 * 60 * 1000);

  const events = await prisma.event.findMany({
    where: { occurredAt: { gte: since, lte: now } },
    orderBy: { occurredAt: 'asc' },
    include: { enrichments: true },
  });

  const grouped = new Map();
  for (const evt of events) {
    if (!grouped.has(evt.source)) {
      grouped.set(evt.source, []);
    }
    grouped.get(evt.source).push(evt);
  }

  const sections = [];
  for (const [source, evts] of grouped.entries()) {
    const builder = getDigestBuilder(source);
    const section = builder ? builder(evts) : genericDigest(source, evts);
    sections.push(section);
  }

  return { since, until: now, sections };
};

const renderDigest = (digest) => {
  const lines = [];
  lines.push('Daily Digest');
  lines.push(`Window: ${formatDate(digest.since)} -> ${formatDate(digest.until)}`);

  if (digest.sections.length === 0) {
    lines.push('No events in this window.');
    return lines.join('\n');
  }

  for (const section of digest.sections) {
    lines.push('');
    if (!section.skipTitle) {
      lines.push(`== ${section.title} ==`);
    }
    for (const line of section.lines) {
      lines.push(line);
    }
  }

  return lines.join('\n');
};

const runDigest = async () => {
  try {
    await prisma.$connect();
    const digest = await buildDigest();
    console.log(renderDigest(digest));
  } catch (error) {
    console.error('Digest generation failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

if (process.argv[1] && process.argv[1].endsWith('run.js')) {
  runDigest();
}

export default runDigest;
