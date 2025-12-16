import path from 'node:path';
import { fileURLToPath } from 'node:url';

import prisma from '../lib/prismaClient.js';
import { runCollectorCycle } from './runner.js';

const entryFile = fileURLToPath(import.meta.url);

const handleRun = async () => {
  try {
    const summary = await runCollectorCycle();
    if (summary.length === 0) {
      console.log('Collector job finished (no collectors registered).');
    } else {
      console.log('Collector job finished:', summary);
    }
  } catch (error) {
    console.error('Collector job failed', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

if (path.resolve(process.argv[1] ?? '') === entryFile) {
  handleRun();
}

export default handleRun;
