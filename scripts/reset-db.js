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
  process.exit(code ?? 0);
});