#!/usr/bin/env node
// Dump timeline segments for a date range for debugging
import prisma from '../src/lib/prismaClient.js';
import crypto from 'node:crypto';

const userIdArg = process.argv[2];
if (!userIdArg) {
  console.error('Usage: node scripts/dump-timeline-segments-range.js <userId>');
  process.exit(1);
}

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

const findMostRecentFile = async (folderId, fileName, accessToken) => {
  const escapedName = fileName.replace(/'/g, "\\'");
  const query = `name='${escapedName}' and '${folderId}' in parents and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=modifiedTime desc&pageSize=1&fields=files(id,name,modifiedTime)`;
  
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive API search error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const files = data.files || [];
  
  if (files.length === 0) {
    throw new Error(`No file named '${fileName}' found in folder ${folderId}`);
  }

  return files[0];
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

const parseLatLng = (str) => {
  if (!str) return null;
  const match = str.match(/([\-\d.]+)°?,\s*([\-\d.]+)°?/);
  if (!match) return null;
  return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
};
const roundCoord = (val, decimals = 5) => {
  if (val == null || isNaN(val)) return '';
  return val.toFixed(decimals);
};
const hashCanonical = (canonical) => 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');

const buildVisitExternalId = (segment) => {
  const startTime = segment.startTime || '';
  const endTime = segment.endTime || '';
  const visit = segment.visit || {};
  const placeId = visit.topCandidate?.placeId || 'unknown';
  const hierarchyLevel = visit.hierarchyLevel ?? '';
  const canonical = `visit|${startTime}|${endTime}|${placeId}|${hierarchyLevel}`;
  return { externalId: hashCanonical(canonical), canonical };
};
const buildActivityExternalId = (segment) => {
  const startTime = segment.startTime || '';
  const endTime = segment.endTime || '';
  const activity = segment.activity || {};
  const topType = activity.topCandidate?.type || 'UNKNOWN';
  const startCoord = parseLatLng(activity.start?.latLng);
  const endCoord = parseLatLng(activity.end?.latLng);
  const startStr = startCoord ? `${roundCoord(startCoord.lat)},${roundCoord(startCoord.lng)}` : '';
  const endStr = endCoord ? `${roundCoord(endCoord.lat)},${roundCoord(endCoord.lng)}` : '';
  const distance = Math.round(activity.distanceMeters || 0);
  const canonical = `activity|${startTime}|${endTime}|${topType}|${startStr}|${endStr}|${distance}`;
  return { externalId: hashCanonical(canonical), canonical };
};
const buildTripExternalId = (segment) => {
  const memory = segment.timelineMemory || {};
  const trip = memory.trip || {};
  const startTime = trip.startTime || segment.startTime || '';
  const endTime = trip.endTime || segment.endTime || '';
  const distanceKm = Math.round(trip.distanceFromOriginKms || 0);
  const placeIds = (trip.destinations || []).map(d => d.identifier?.placeId).filter(Boolean).sort().join(',');
  const canonical = `trip|${startTime}|${endTime}|${distanceKm}|${placeIds}`;
  return { externalId: hashCanonical(canonical), canonical };
};

const main = async () => {
  try {
    const userId = userIdArg;
    const account = await prisma.connectedAccount.findFirst({ 
      where: { provider: 'google', userId, googleDriveSources: { some: { enabled: true, driveFolderId: { not: null } } } }, 
      include: { oauthTokens: true, googleDriveSources: true } 
    });
    if (!account) throw new Error('No account found');
    
    const driveSource = account.googleDriveSources.find(s => s.enabled && s.driveFolderId) || account.googleDriveSources[0];
    if (!driveSource) throw new Error('No valid Google Drive source found');
    
    const tokenRecord = latestToken(account.oauthTokens);
    if (!tokenRecord) throw new Error('No token');
    let accessToken = tokenRecord.accessToken;
    if (needsRefresh(tokenRecord) && tokenRecord.refreshToken) {
      const refreshed = await refreshAccessToken(account, tokenRecord.refreshToken);
      accessToken = refreshed.access_token;
    }

    console.log(`Fetching from folder ${driveSource.driveFolderId}, file ${driveSource.driveFileName}`);
    const fileInfo = await findMostRecentFile(driveSource.driveFolderId, driveSource.driveFileName, accessToken);
    console.log(`Found: ${fileInfo.name} (${fileInfo.id}), modified: ${fileInfo.modifiedTime}`);
    const data = await fetchDriveFile(fileInfo.id, accessToken);
    const segments = data.semanticSegments || [];
    const startRange = new Date('2025-12-18T00:00:00.000Z');
    const endRange = new Date('2025-12-20T00:00:00.000Z');

    console.log('Total segments in file:', segments.length);
    let count = 0;
    for (const segment of segments) {
      if (!segment.startTime) continue;
      const t = new Date(segment.startTime);
      if (t >= startRange && t < endRange) {
        count++;
        const type = segment.visit ? 'visit' : segment.activity ? 'activity' : segment.timelineMemory?.trip ? 'trip' : 'path';
        let ext;
        if (segment.visit) ext = buildVisitExternalId(segment);
        else if (segment.activity) ext = buildActivityExternalId(segment);
        else if (segment.timelineMemory?.trip) ext = buildTripExternalId(segment);
        console.log(`\n${segment.startTime} - ${type} - canonical: ${ext?.canonical}\nexternalId: ${ext?.externalId}\npayload sample: ${JSON.stringify(segment.visit?.topCandidate || segment.activity?.topCandidate || segment.timelineMemory || {}, null, 2).slice(0,400)}\n`);
      }
    }
    console.log('\nTotal matching segments in range:', count);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
};

main();
