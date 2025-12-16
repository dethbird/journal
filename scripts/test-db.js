import 'dotenv/config';
import prisma from '../src/lib/prismaClient.js';

async function main() {
  try {
    await prisma.$connect();
    const res = await prisma.$queryRaw`SELECT 1 as result`;
    console.log('DB connected — test query result:', res);
  } catch (err) {
    console.error('DB connection failed:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
