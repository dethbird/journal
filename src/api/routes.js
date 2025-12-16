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

  // Return the current user (dev fallback). If you add sessions later,
  // replace this with session-based lookup.
  server.get('/me', async () => {
    // Prefer a development email if provided, otherwise return first user.
    const devEmail = process.env.DEV_USER_EMAIL || 'rishi.satsangi@gmail.com';
    let user = await prisma.user.findUnique({ where: { email: devEmail } });
    if (!user) {
      user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
    }
    return { user };
  });
}

export default apiRoutes;