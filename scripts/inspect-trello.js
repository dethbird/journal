import 'dotenv/config';
import prisma from '../src/lib/prismaClient.js';

const run = async () => {
  await prisma.$connect();
  const count = await prisma.event.count({ where: { source: 'trello' } });
  console.log('trello events count:', count);
  const first = await prisma.event.findFirst({ where: { source: 'trello' }, orderBy: { occurredAt: 'asc' } });
  const last = await prisma.event.findFirst({ where: { source: 'trello' }, orderBy: { occurredAt: 'desc' } });
  console.log('earliest:', first?.occurredAt?.toISOString());
  console.log('latest:', last?.occurredAt?.toISOString());

  const sample = await prisma.event.findMany({ where: { source: 'trello' }, orderBy: { occurredAt: 'desc' }, take: 5 });
  console.log('latest 5 events:');
  for (const s of sample) {
    console.log('-', s.eventType, s.occurredAt.toISOString(), s.externalId, s.payload?.board?.name || s.payload?.board?.id);
  }

  await prisma.$disconnect();
};

run().catch(err => {
  console.error(err);
  process.exit(1);
});
