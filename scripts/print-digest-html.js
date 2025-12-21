import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import buildDigestViewModel from '../src/digest/viewModel.js';
import { renderEmailHtml } from '../src/digest/renderers/email.js';

const OUT = path.resolve(process.cwd(), 'tmp', 'digest.html');
const ensureDir = (p) => fs.mkdirSync(path.dirname(p), { recursive: true });

const run = async () => {
  try {
    ensureDir(OUT);
    const rangeHours = Number(process.env.DIGEST_RANGE_HOURS ?? 168);
    const vm = await buildDigestViewModel({ rangeHours });
    const html = renderEmailHtml(vm);
    fs.writeFileSync(OUT, html, 'utf8');
    console.log('Wrote digest to', OUT);
  } catch (err) {
    console.error('Failed to render digest HTML:', err);
    process.exitCode = 1;
  }
};

if (process.argv[1] && process.argv[1].endsWith('print-digest-html.js')) run();

export default run;
