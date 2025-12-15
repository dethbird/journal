import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiRoutes from '../api/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const staticRoot = path.join(__dirname, 'public');

const server = Fastify({ logger: true });

await server.register(cors, { origin: true });
await server.register(apiRoutes, { prefix: '/api' });

await server.register(fastifyStatic, {
  root: staticRoot,
  prefix: '/',
  decorateReply: true,
  list: false
});

server.setNotFoundHandler((request, reply) => {
  if (request.raw.method === 'GET') {
    return reply.type('text/html').sendFile('index.html');
  }
  reply.code(404).send({ error: 'Not Found' });
});

const startServer = async () => {
  const port = Number(process.env.WEB_PORT || process.env.API_PORT) || 4200;
  await server.listen({ port });
  server.log.info(`Server listening on ${port}`);
};

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((error) => {
    server.log.error(error);
    process.exit(1);
  });
}

export default server;