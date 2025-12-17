import 'dotenv/config';
import prisma from '../lib/prismaClient.js';
import buildDigestViewModel from './viewModel.js';
import { renderTextDigest } from './renderers/text.js';

const DEFAULT_RANGE_HOURS = 24;

const runDigest = async () => {
  try {
    await prisma.$connect();
    const vm = await buildDigestViewModel({ rangeHours: Number(process.env.DIGEST_RANGE_HOURS ?? DEFAULT_RANGE_HOURS) });
    console.log(renderTextDigest(vm));
  } catch (error) {
    console.error('Digest generation failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

if (process.argv[1] && process.argv[1].endsWith('run.js')) {
  runDigest();
}

export default runDigest;
