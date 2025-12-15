import prisma from '../db/client.js';

async function apiRoutes(server) {
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
}

export default apiRoutes;