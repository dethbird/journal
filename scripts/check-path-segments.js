#!/usr/bin/env node
// Check raw timelinePath segments to see what data is available
import prisma from '../src/lib/prismaClient.js';
import crypto from 'node:crypto';

const userId = process.argv[2] || 'cmjalmee6000011whi37kg7ud';
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const FETCH_TIMEOUT_MS = 120 * 1000;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
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
    if (err.name === 'AbortError') throw new Error(`Drive fetch timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
    throw err;
  }
};

const main = async () => {
  try {
    const account = await prisma.connectedAccount.findFirst({
      where: { provider: 'google', userId, googleTimelineSettings: { driveFileId: { not: null } } },
      include: { oauthTokens: true, googleTimelineSettings: true },
    });
    
    if (!account) throw new Error('No account found');
    
    const settings = account.googleTimelineSettings;
    const tokenRecord = latestToken(account.oauthTokens);
    if (!tokenRecord) throw new Error('No token');
    
    let accessToken = tokenRecord.accessToken;
    if (needsRefresh(tokenRecord) && tokenRecord.refreshToken) {
      const refreshed = await refreshAccessToken(account, tokenRecord.refreshToken);
      accessToken = refreshed.access_token;
    }

    const data = await fetchDriveFile(settings.driveFileId, accessToken);
    const segments = data.semanticSegments || [];
    
    // Find a Dec 18 timelinePath segment
    const dec18Segment = segments.find(s => s.startTime && s.startTime.includes('2025-12-18') && s.timelinePath);
    
    if (dec18Segment) {
      console.log('Dec 18 timelinePath segment sample:');
      console.log(JSON.stringify(dec18Segment, null, 2));
    } else {
      console.log('No Dec 18 timelinePath segment found');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
};

main();
