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
if (!fs.existsSync(dumpsDir)) {
  console.error('No dumps directory found at', dumpsDir);
  process.exit(1);
}

const requested = process.argv.slice(2).find((a) => !a.startsWith('-')) ?? null;
const clean = process.argv.includes('--clean') || process.argv.includes('clean') || process.env.DB_RESTORE_CLEAN === '1';
let fileToRestore = null;
if (requested) {
  const p = path.resolve(requested);
  if (!fs.existsSync(p)) {
    console.error('Requested file does not exist:', p);
    process.exit(1);
  }
  fileToRestore = p;
} else {
  // pick latest dump in dumpsDir
  const files = fs.readdirSync(dumpsDir).filter((f) => f.endsWith('.sql')).map((f) => ({ f, t: fs.statSync(path.join(dumpsDir, f)).mtime.getTime() }));
  if (files.length === 0) {
    console.error('No .sql dump files found in', dumpsDir);
    process.exit(1);
  }
  files.sort((a, b) => b.t - a.t);
  fileToRestore = path.join(dumpsDir, files[0].f);
}

console.log('Restoring database from', fileToRestore);

const which = spawnSync('which', ['psql']);
if (which.status !== 0) {
  console.error('psql not found in PATH. Install PostgreSQL client tools.');
  process.exit(3);
}

// psql may reject some URI query params; sanitize similar to dump script.
let conn = DATABASE_URL;
try {
  const u = new URL(DATABASE_URL);
  u.search = '';
  conn = u.toString();
} catch (e) {}

if (clean) {
  console.log('Cleaning target database: dropping and recreating schema public (destructive)');
  const dropCmd = `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`;
  const dropRes = spawnSync('psql', [conn, '-c', dropCmd], { stdio: 'inherit' });
  if (dropRes.status !== 0) {
    console.error('Failed to drop/recreate schema. Aborting restore.');
    process.exit(dropRes.status || 4);
  }
}

const res = spawnSync('psql', [conn, '-f', fileToRestore], { stdio: 'inherit' });
if (res.status !== 0) {
  console.error('psql failed with exit code', res.status);
  process.exit(res.status || 1);
}

console.log('Restore complete');
