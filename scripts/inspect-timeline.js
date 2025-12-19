#!/usr/bin/env node
/**
 * Inspect Timeline.json stats: event count, date range, segment types breakdown
 * Usage: node scripts/inspect-timeline.js [path/to/Timeline.json]
 */

import fs from 'node:fs';
import path from 'node:path';

const filePath = process.argv[2] || './Timeline.json';

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

console.log(`\n📊 Inspecting Timeline.json: ${path.resolve(filePath)}\n`);

const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const segments = data.semanticSegments || [];

if (segments.length === 0) {
  console.log('⚠️  No segments found in Timeline.json');
  process.exit(0);
}

// Collect stats
let firstTime = null;
let lastTime = null;
const typeCounts = {};
const yearMonthCounts = {};
let totalDurationMinutes = 0;

for (const segment of segments) {
  const startTime = segment.startTime ? new Date(segment.startTime) : null;
  const endTime = segment.endTime ? new Date(segment.endTime) : null;

  if (startTime) {
    if (!firstTime || startTime < firstTime) firstTime = startTime;
    if (!lastTime || startTime > lastTime) lastTime = startTime;
    
    // Track year-month distribution
    const yearMonth = `${startTime.getFullYear()}-${String(startTime.getMonth() + 1).padStart(2, '0')}`;
    yearMonthCounts[yearMonth] = (yearMonthCounts[yearMonth] || 0) + 1;
  }

  if (startTime && endTime) {
    totalDurationMinutes += (endTime - startTime) / 60000;
  }

  // Count segment types
  if (segment.visit) {
    typeCounts.visit = (typeCounts.visit || 0) + 1;
  } else if (segment.activity) {
    typeCounts.activity = (typeCounts.activity || 0) + 1;
  } else if (segment.timelineMemory?.trip) {
    typeCounts.trip = (typeCounts.trip || 0) + 1;
  } else if (segment.timelinePath) {
    typeCounts.timelinePath = (typeCounts.timelinePath || 0) + 1;
  } else {
    typeCounts.unknown = (typeCounts.unknown || 0) + 1;
  }
}

// Display results
console.log('📅 Date Range:');
console.log(`   First event: ${firstTime ? firstTime.toISOString() : 'N/A'}`);
console.log(`   Last event:  ${lastTime ? lastTime.toISOString() : 'N/A'}`);
if (firstTime && lastTime) {
  const daySpan = Math.ceil((lastTime - firstTime) / (24 * 60 * 60 * 1000));
  console.log(`   Span:        ${daySpan} days\n`);
}

console.log('📈 Segment Stats:');
console.log(`   Total segments: ${segments.length.toLocaleString()}`);
console.log(`   Total duration: ${Math.round(totalDurationMinutes / 60).toLocaleString()} hours\n`);

console.log('🗂️  Segment Types:');
const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
for (const [type, count] of sortedTypes) {
  const pct = ((count / segments.length) * 100).toFixed(1);
  console.log(`   ${type.padEnd(15)} ${count.toLocaleString().padStart(8)}  (${pct}%)`);
}

console.log('\n📆 Year-Month Distribution:');
const sortedMonths = Object.entries(yearMonthCounts).sort();
for (const [month, count] of sortedMonths) {
  const bar = '█'.repeat(Math.ceil(count / 10));
  console.log(`   ${month}  ${count.toLocaleString().padStart(6)}  ${bar}`);
}

console.log('\n✅ Inspection complete\n');
