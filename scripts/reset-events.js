import 'dotenv/config';
import prisma from '../src/lib/prismaClient.js';

async function main() {
  try {
    await prisma.$connect();
    await prisma.dayEvent.deleteMany();
    await prisma.event.deleteMany();
    console.log('Cleared `dayEvents` and `events` tables.');
  } catch (error) {
    console.error('Failed to reset event tables:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
