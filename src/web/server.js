import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({ logger: true });

const distPath = path.join(__dirname, '..', 'ui', 'dist');
const indexHtmlPath = path.join(distPath, 'index.html');

app.register(fastifyStatic, {
  root: distPath,
  prefix: '/',
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
