import { spawn } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config();

const child = spawn('npx', ['prisma', 'migrate', 'reset', '--force'], {
  stdio: 'inherit',
  env: { ...process.env }
});

child.on('close', (code) => {
  if (code !== 0) {
    console.error(`reset-db exited with ${code}`);
  }
  if (code === 0) {
    // run seed after successful reset
    const seed = spawn('node', ['scripts/seed.js'], { stdio: 'inherit', env: { ...process.env } });
    seed.on('close', (s) => {
      if (s !== 0) console.error(`seed exited with ${s}`);
      process.exit(s ?? 0);
    });
  } else {
    process.exit(code ?? 0);
  }
});