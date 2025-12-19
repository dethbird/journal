#!/usr/bin/env node
/**
 * Fetch Timeline.json from Google Drive and show date range stats
 * Usage: node scripts/fetch-timeline-stats.js [userId]
 */

import prisma from '../src/lib/prismaClient.js';
import crypto from 'node:crypto';

const FETCH_TIMEOUT_MS = 120 * 1000;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const EXPIRY_SKEW_MS = 60 * 1000;

const latestToken = (tokens = []) => {
  if (!Array.isArray(tokens) || tokens.length === 0) return null;
  return [...tokens].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
};

const needsRefresh = (token) => {
  if (!token?.expiresAt) return false;
  return new Date(token.expiresAt).getTime() - EXPIRY_SKEW_MS <= Date.now();
};

const refreshAccessToken = async (connectedAccount, refreshToken) => {
  if (!clientId || !clientSecret) throw new Error('Google client id/secret missing');
  if (!refreshToken) throw new Error('Missing refresh_token');

  const params = new URLSearchParams();
  params.set('grant_type', 'refresh_token');
  params.set('refresh_token', refreshToken);
  params.set('client_id', clientId);
  params.set('client_secret', clientSecret);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) throw new Error(`Token refresh failed (${res.status})`);
  return res.json();
};

const fetchDriveFile = async (fileId, accessToken) => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Drive API error (${res.status}): ${text}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Drive fetch timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  }
};

const main = async () => {
  try {
    const userIdArg = process.argv[2];
    
    const where = userIdArg 
      ? { provider: 'google', userId: userIdArg, googleTimelineSettings: { driveFileId: { not: null } } }
      : { provider: 'google', googleTimelineSettings: { driveFileId: { not: null } } };
    
    const account = await prisma.connectedAccount.findFirst({
      where,
      include: {
        user: true,
        oauthTokens: true,
        googleTimelineSettings: true,
      },
    });

    if (!account) {
      console.error('No Google account with timeline settings found');
      process.exit(1);
    }

    const settings = account.googleTimelineSettings;
    const user = account.user;
    
    console.log(`\n📊 Fetching Timeline.json for ${user.displayName || user.email}`);
    console.log(`   File ID: ${settings.driveFileId}\n`);

    // Get access token
    const tokenRecord = latestToken(account.oauthTokens);
    if (!tokenRecord) throw new Error('No access token found');

    let accessToken = tokenRecord.accessToken;
    
    if (needsRefresh(tokenRecord) && tokenRecord.refreshToken) {
      console.log('🔄 Refreshing access token...');
      const refreshed = await refreshAccessToken(account, tokenRecord.refreshToken);
      accessToken = refreshed.access_token;
    }

    // Fetch Timeline.json
    console.log('⬇️  Downloading Timeline.json from Google Drive...');
    const data = await fetchDriveFile(settings.driveFileId, accessToken);

    const segments = data.semanticSegments || [];
    
    if (segments.length === 0) {
      console.log('⚠️  No segments found in Timeline.json');
      return;
    }

    // Analyze segments
    let firstTime = null;
    let lastTime = null;
    const typeCounts = {};

    for (const segment of segments) {
      const startTime = segment.startTime ? new Date(segment.startTime) : null;

      if (startTime) {
        if (!firstTime || startTime < firstTime) firstTime = startTime;
        if (!lastTime || startTime > lastTime) lastTime = startTime;
      }

      if (segment.visit) {
        typeCounts.visit = (typeCounts.visit || 0) + 1;
      } else if (segment.activity) {
        typeCounts.activity = (typeCounts.activity || 0) + 1;
      } else if (segment.timelineMemory?.trip) {
        typeCounts.trip = (typeCounts.trip || 0) + 1;
      } else if (segment.timelinePath) {
        typeCounts.timelinePath = (typeCounts.timelinePath || 0) + 1;
      }
    }

    console.log('\n📅 Timeline.json Date Range:');
    console.log(`   First event: ${firstTime ? firstTime.toISOString() : 'N/A'}`);
    console.log(`   Last event:  ${lastTime ? lastTime.toISOString() : 'N/A'}`);
    if (firstTime && lastTime) {
      const daySpan = Math.ceil((lastTime - firstTime) / (24 * 60 * 60 * 1000));
      console.log(`   Span:        ${daySpan} days\n`);
    }

    console.log('📈 Segments:');
    console.log(`   Total: ${segments.length.toLocaleString()}`);
    for (const [type, count] of Object.entries(typeCounts)) {
      console.log(`   ${type}: ${count.toLocaleString()}`);
    }

    // Check cursor
    const cursor = await prisma.cursor.findFirst({
      where: { source: 'google_timeline', connectedAccountId: account.id },
    });

    console.log('\n🔖 Current Cursor:');
    if (cursor?.cursor) {
      const cursorDate = new Date(cursor.cursor);
      console.log(`   ${cursor.cursor}`);
      if (lastTime && cursorDate >= lastTime) {
        console.log(`   ⚠️  Cursor is at or beyond last event in Timeline.json!`);
        console.log(`      No new events will be collected.`);
      } else if (lastTime) {
        const diff = Math.ceil((lastTime - cursorDate) / (60 * 60 * 1000));
        console.log(`   ✅ ${diff} hours of new data available since cursor`);
      }
    } else {
      console.log(`   None (will process all segments)`);
    }

    console.log('\n✅ Done\n');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();
