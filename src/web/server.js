import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import prisma from '../lib/prismaClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({ logger: true });

const distPath = path.join(__dirname, '..', 'ui', 'dist');
const indexHtmlPath = path.join(distPath, 'index.html');

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 200;

const parseLimit = (value) => {
  const parsed = Number(value ?? DEFAULT_LIMIT);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
};

const parseDateParam = (value) => {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date parameter');
  }
  return date;
};

const formatDay = (day) => ({
  date: day.date.toISOString().split('T')[0],
  mood: day.mood,
  note: day.note,
  highlights: day.highlights,
  privacyLevel: day.privacyLevel,
  createdAt: day.createdAt.toISOString(),
  updatedAt: day.updatedAt.toISOString(),
  events: day.dayEvents
    .map((entry) => ({
      id: entry.event.id,
      source: entry.event.source,
      eventType: entry.event.eventType,
      occurredAt: entry.event.occurredAt.toISOString(),
      externalId: entry.event.externalId,
      payload: entry.event.payload,
    }))
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)),
});

app.register(fastifyStatic, {
  root: distPath,
  prefix: '/',
});

app.addHook('onClose', async () => {
  await prisma.$disconnect();
});

app.get('/api/days', async (request, reply) => {
  let startDate;
  let endDate;
  try {
    startDate = parseDateParam(request.query.startDate);
    endDate = parseDateParam(request.query.endDate);
  } catch (error) {
    request.log.warn(error, 'Invalid date in query');
    return reply.status(400).send({ error: error.message });
  }

  const where = {};
  if (startDate || endDate) {
    where.date = {};
    if (startDate) {
      where.date.gte = startDate;
    }
    if (endDate) {
      where.date.lte = endDate;
    }
  }

  const days = await prisma.day.findMany({
    where,
    orderBy: { date: 'desc' },
    take: parseLimit(request.query.limit),
    include: { dayEvents: { include: { event: true } } },
  });

  return days.map(formatDay);
});

app.get('/api/days/:date', async (request, reply) => {
  let dateParam;
  try {
    dateParam = parseDateParam(request.params.date);
  } catch (error) {
    request.log.warn(error, 'Invalid day identifier');
    return reply.status(400).send({ error: error.message });
  }

  const day = await prisma.day.findUnique({
    where: { date: dateParam },
    include: { dayEvents: { include: { event: true } } },
  });

  if (!day) {
    return reply.status(404).send({ error: 'Day not found' });
  }

  return formatDay(day);
});

app.get('/api/events', async (request, reply) => {
  const filters = {};
  const { source, eventType } = request.query;

  if (source) {
    filters.source = source;
  }
  if (eventType) {
    filters.eventType = eventType;
  }

  try {
    const after = parseDateParam(request.query.after);
    const before = parseDateParam(request.query.before);
    if (after || before) {
      filters.occurredAt = {};
      if (after) {
        filters.occurredAt.gt = after;
      }
      if (before) {
        filters.occurredAt.lt = before;
      }
    }
  } catch (error) {
    request.log.warn(error, 'Invalid event date filter');
    return reply.status(400).send({ error: error.message });
  }

  const events = await prisma.event.findMany({
    where: filters,
    orderBy: { occurredAt: 'desc' },
    take: parseLimit(request.query.limit),
  });

  return events.map((event) => ({
    id: event.id,
    source: event.source,
    eventType: event.eventType,
    occurredAt: event.occurredAt.toISOString(),
    externalId: event.externalId,
    payload: event.payload,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  }));
});

app.get('/health', async () => ({ status: 'ok' }));

app.get('/oauth/callback', async (request, reply) => {
  const { code, state, error } = request.query;

  if (error) {
    return reply.status(400).send({ error, state });
  }

  return reply.send({
    received: {
      code,
      state,
    },
    message: 'Replace this handler with provider-specific logic.',
  });
});

app.setNotFoundHandler(async (request, reply) => {
  // Serve the SPA entrypoint for unknown GET requests (client-side routing),
  // but keep default behavior for non-GET methods.
  if (request.raw.method !== 'GET') {
    return reply.callNotFound();
  }

  if (!fs.existsSync(indexHtmlPath)) {
    request.log.error({ distPath }, 'UI build not found. Run "npm run ui:build" first.');
    return reply.status(500).send({ error: 'UI build missing. Run npm run ui:build.' });
  }

  return reply.sendFile('index.html');
});

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);

const start = async () => {
  try {
    await app.listen({ host, port });
    app.log.info({ host, port }, 'Server listening');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
