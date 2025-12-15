import dotenv from 'dotenv';
import prisma from '../src/db/client.js';

dotenv.config();

async function main() {
  console.log('Testing Postgres connection with Prisma...');
  const sample = await prisma.event.findMany({ take: 1 });
  console.log('Successfully connected; sample events count:', sample.length);
}

main()
  .catch((error) => {
    console.error('DB test failed', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());