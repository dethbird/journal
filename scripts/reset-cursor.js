import 'dotenv/config';
import prisma from '../src/lib/prismaClient.js';

// Usage:
// - Reset all cursors (default): `node scripts/reset-cursor.js`
// - Reset a single source: `SOURCE=github node scripts/reset-cursor.js`

async function main() {
  try {
    await prisma.$connect();
    const source = process.env.SOURCE ?? null;

    if (source) {
      const result = await prisma.cursor.updateMany({ where: { source }, data: { cursor: null } });
      console.log(`Reset ${result.count} cursor(s) for source '${source}'.`);
    } else {
      const result = await prisma.cursor.updateMany({ where: {}, data: { cursor: null } });
      console.log(`Reset ${result.count} cursor(s) for all sources.`);
    }
  } catch (error) {
    console.error('Failed to reset cursor(s):', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
