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
  console.log('\n⚠️  WARNING: --clean flag will DROP ALL DATA in the target database!');
  console.log('   This will destroy:');
  console.log('   - All tables and their data');
  console.log('   - All indexes, constraints, and foreign keys');
  console.log('   - All functions, views, and other database objects');
  console.log('\n   Proceeding in 3 seconds... (Ctrl+C to abort)');
  
  // Give user a chance to abort
  spawnSync('sleep', ['3']);
  
  console.log('\nCleaning target database: dropping and recreating schema public (destructive)');
  const dropCmd = `DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`;
  const dropRes = spawnSync('psql', [conn, '-c', dropCmd], { stdio: 'inherit' });
  if (dropRes.status !== 0) {
    console.error('Failed to drop/recreate schema. Aborting restore.');
    process.exit(dropRes.status || 4);
  }
  console.log('✓ Schema cleaned successfully\n');
}

console.log('Restoring from SQL dump file...');
const res = spawnSync('psql', [conn, '-f', fileToRestore], { stdio: 'inherit' });
if (res.status !== 0) {
  console.error('\n✗ psql failed with exit code', res.status);
  console.error('  Common issues:');
  console.error('  - Database already has conflicting objects (try with --clean flag)');
  console.error('  - Incorrect DATABASE_URL');
  console.error('  - Permission issues');
  process.exit(res.status || 1);
}

console.log('\n✓ Restore complete!');
console.log('  Next steps:');
console.log('  1. Verify data: psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"Event\""');
console.log('  2. Check migrations: psql $DATABASE_URL -c "SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5"');
console.log('  3. Run Prisma migration if needed: npx prisma migrate deploy');
