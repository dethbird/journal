import prisma from '../src/lib/prismaClient.js';

const main = async () => {
  const u = await prisma.user.findFirst();
  console.log(JSON.stringify(u));
  await prisma.$disconnect();
};

main().catch((e) => { console.error(e); process.exit(1); });
