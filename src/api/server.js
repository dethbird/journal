import Fastify from 'fastify';
import cors from '@fastify/cors';
import prisma from '../db/client.js';

const server = Fastify({ logger: true });

await server.register(cors, { origin: true });

server.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString()
}));

server.get('/events/recent', async () =>
  prisma.event.findMany({
    orderBy: { occurredAt: 'desc' },
    take: 25
  })
);

server.get('/days/:date', async (request) => {
  const { date } = request.params;
  return prisma.day.findUnique({
    where: { date: new Date(date) },
    include: { dayEvents: { include: { event: true } } }
  });
});

const startServer = async () => {
  const port = Number(process.env.API_PORT) || 4000;
  await server.listen({ port });
  server.log.info(`API server listening on ${port}`);
};

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((error) => {
    server.log.error(error);
    process.exit(1);
  });
}

export default server;