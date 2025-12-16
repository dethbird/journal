#!/usr/bin/env node
import 'dotenv/config';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set in environment. Aborting.');
  process.exit(2);
}

const dumpsDir = path.resolve(process.cwd(), 'dumps');
if (!fs.existsSync(dumpsDir)) fs.mkdirSync(dumpsDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outFile = path.join(dumpsDir, `db_dump_${timestamp}.sql`);

console.log(`Dumping database to ${outFile} ...`);

const which = spawnSync('which', ['pg_dump']);
if (which.status !== 0) {
  console.error('pg_dump not found in PATH. Install PostgreSQL client tools.');
  process.exit(3);
}

// pg_dump may reject some URI query params (e.g. schema) that prisma DATABASE_URL includes.
// Sanitize by removing search params from the URL before passing to pg_dump.
let conn = DATABASE_URL;
try {
  const u = new URL(DATABASE_URL);
  u.search = '';
  conn = u.toString();
} catch (e) {
  // leave conn as DATABASE_URL if parsing fails
}

const args = ['--no-owner', '--no-privileges', '-f', outFile, conn];
const res = spawnSync('pg_dump', args, { stdio: 'inherit' });
if (res.status !== 0) {
  console.error('pg_dump failed with exit code', res.status);
  process.exit(res.status || 1);
}

console.log('Dump complete:', outFile);
