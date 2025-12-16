import prisma from '../src/lib/prismaClient.js';

async function main() {
  await prisma.$connect();
  const event = await prisma.event.findFirst({
    where: { source: 'github' },
    orderBy: { occurredAt: 'desc' },
    include: { enrichments: true },
  });
  console.log(JSON.stringify(event, null, 2));
  await prisma.$disconnect();
}

main();
