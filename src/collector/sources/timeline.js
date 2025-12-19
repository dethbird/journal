import crypto from 'node:crypto';
import { registerCollector } from '../registry.js';
import prisma from '../../lib/prismaClient.js';
import buildWeatherEnrichment from '../enrichers/weather.js';

const source = 'google_timeline';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const EXPIRY_SKEW_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 120 * 1000; // 2 minutes
const MAX_SEGMENTS_PER_RUN = Number(process.env.TIMELINE_MAX_SEGMENTS) || Infinity; // Process all segments by default
const PROGRESS_LOG_INTERVAL = 100; // Log progress every N segments
const BATCH_INSERT_SIZE = 500; // Insert events in batches of 500
const WEATHER_BATCH_SIZE = 50; // Process weather enrichment in smaller batches

const latestToken = (tokens = []) => {
  if (!Array.isArray(tokens) || tokens.length === 0) return null;
  return [...tokens].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
};

const needsRefresh = (token) => {
  if (!token?.expiresAt) return false;
  return new Date(token.expiresAt).getTime() - EXPIRY_SKEW_MS <= Date.now();
};

const storeToken = async (connectedAccountId, tokenResponse, fallbackRefreshToken) => {
  const expiresAt =
    tokenResponse.expires_in != null
      ? new Date(Date.now() + Number(tokenResponse.expires_in) * 1000)
      : null;

  return prisma.oAuthToken.create({
    data: {
      connectedAccountId,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? fallbackRefreshToken ?? null,
      tokenType: tokenResponse.token_type ?? null,
      scope: tokenResponse.scope ?? null,
      expiresAt,
      tokenJson: tokenResponse,
    },
  });
};

const refreshAccessToken = async (connectedAccount, refreshToken) => {
  if (!clientId || !clientSecret) {
    console.warn('[timeline] Google refresh failed: client id/secret missing');
    return null;
  }
  if (!refreshToken) {
    console.warn(`[timeline] Google refresh failed: missing refresh_token for connectedAccount=${connectedAccount.id}`);
    return null;
  }

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

  if (!res.ok) {
    const body = await res.text();
    console.warn(`[timeline] Google refresh failed (${res.status}): ${body}`);
    return null;
  }

  const token = await res.json();
  return storeToken(connectedAccount.id, token, refreshToken);
};

const resolveAccessToken = async (connectedAccount) => {
  const tokenRecord = latestToken(connectedAccount.oauthTokens);
  if (!tokenRecord) return { accessToken: null, tokenRecord: null };

  if (needsRefresh(tokenRecord) && tokenRecord.refreshToken) {
    try {
      const refreshed = await refreshAccessToken(connectedAccount, tokenRecord.refreshToken);
      if (refreshed) return { accessToken: refreshed.accessToken, tokenRecord: refreshed };
    } catch (err) {
      console.warn('[timeline] Google token refresh threw:', err?.message ?? err);
    }
  }

  return { accessToken: tokenRecord.accessToken, tokenRecord };
};

/**
 * Parse lat/lng from Google Timeline format: "39.1085173°, -84.515728°"
 */
const parseLatLng = (str) => {
  if (!str) return null;
  const match = str.match(/([-\d.]+)°?,\s*([-\d.]+)°?/);
  if (!match) return null;
  return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
};

/**
 * Round lat/lng to 5 decimal places for canonical ID
 */
const roundCoord = (val, decimals = 5) => {
  if (val == null || isNaN(val)) return '';
  return val.toFixed(decimals);
};

/**
 * Generate SHA256 hash of a canonical string
 */
const hashCanonical = (canonical) => {
  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
};

/**
 * Build canonical externalId for a visit event
 */
const buildVisitExternalId = (segment) => {
  const startTime = segment.startTime || '';
  const endTime = segment.endTime || '';
  const visit = segment.visit || {};
  const placeId = visit.topCandidate?.placeId || 'unknown';
  const hierarchyLevel = visit.hierarchyLevel ?? '';
  const canonical = `visit|${startTime}|${endTime}|${placeId}|${hierarchyLevel}`;
  return { externalId: hashCanonical(canonical), canonical };
};

/**
 * Build canonical externalId for an activity event
 */
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

/**
 * Build canonical externalId for a trip event (timelineMemory)
 */
const buildTripExternalId = (segment) => {
  const memory = segment.timelineMemory || {};
  const trip = memory.trip || {};
  const startTime = trip.startTime || segment.startTime || '';
  const endTime = trip.endTime || segment.endTime || '';
  const distanceKm = Math.round(trip.distanceFromOriginKms || 0);
  
  // Get sorted place IDs from destinations
  const placeIds = (trip.destinations || [])
    .map(d => d.identifier?.placeId)
    .filter(Boolean)
    .sort()
    .join(',');
  
  const canonical = `trip|${startTime}|${endTime}|${distanceKm}|${placeIds}`;
  return { externalId: hashCanonical(canonical), canonical };
};

/**
 * Build canonical externalId for a path (timelinePath) event
 */
const buildPathExternalId = (segment) => {
  const startTime = segment.startTime || '';
  const endTime = segment.endTime || '';
  const path = segment.timelinePath || [];
  
  // Use first point for approximate location
  const firstPoint = path[0];
  const coord = firstPoint?.point ? parseLatLng(firstPoint.point) : null;
  const coordStr = coord ? `${roundCoord(coord.lat)},${roundCoord(coord.lng)}` : '';
  
  const canonical = `path|${startTime}|${endTime}|${coordStr}`;
  return { externalId: hashCanonical(canonical), canonical };
};

/**
 * Normalize a visit segment into Event payload
 */
const normalizeVisit = (segment) => {
  const visit = segment.visit || {};
  const candidate = visit.topCandidate || {};
  const location = parseLatLng(candidate.placeLocation?.latLng);
  
  return {
    eventType: 'visit',
    startTime: segment.startTime,
    endTime: segment.endTime,
    durationMinutes: getDurationMinutes(segment.startTime, segment.endTime),
    placeId: candidate.placeId || null,
    semanticType: candidate.semanticType || null,
    placeProbability: candidate.probability || null,
    hierarchyLevel: visit.hierarchyLevel ?? null,
    location,
    raw: {
      visit,
      timezoneOffsetMinutes: segment.startTimeTimezoneUtcOffsetMinutes,
    },
  };
};

/**
 * Normalize an activity segment into Event payload
 */
const normalizeActivity = (segment) => {
  const activity = segment.activity || {};
  const candidate = activity.topCandidate || {};
  const startLocation = parseLatLng(activity.start?.latLng);
  const endLocation = parseLatLng(activity.end?.latLng);
  
  return {
    eventType: 'activity',
    startTime: segment.startTime,
    endTime: segment.endTime,
    durationMinutes: getDurationMinutes(segment.startTime, segment.endTime),
    activityType: candidate.type || 'UNKNOWN',
    activityProbability: candidate.probability || null,
    distanceMeters: activity.distanceMeters || null,
    startLocation,
    endLocation,
    raw: {
      activity,
      timezoneOffsetMinutes: segment.startTimeTimezoneUtcOffsetMinutes,
    },
  };
};

/**
 * Normalize a trip (timelineMemory) segment into Event payload
 */
const normalizeTrip = (segment) => {
  const memory = segment.timelineMemory || {};
  const trip = memory.trip || {};
  
  const destinations = (trip.destinations || []).map(d => ({
    placeId: d.identifier?.placeId || null,
    name: d.name || null,
  }));
  
  return {
    eventType: 'trip',
    startTime: trip.startTime || segment.startTime,
    endTime: trip.endTime || segment.endTime,
    durationMinutes: getDurationMinutes(trip.startTime || segment.startTime, trip.endTime || segment.endTime),
    distanceFromOriginKms: trip.distanceFromOriginKms || null,
    destinations,
    raw: {
      timelineMemory: memory,
    },
  };
};

/**
 * Normalize a path (timelinePath) segment into Event payload
 * These are GPS tracking segments - we keep them minimal for weather enrichment
 */
const normalizePath = (segment) => {
  const path = segment.timelinePath || [];
  // timelinePath is an array of {point: "lat°, lng°", time: "..."}
  const firstPoint = path[0];
  const location = firstPoint?.point ? parseLatLng(firstPoint.point) : null;
  
  return {
    eventType: 'path',
    startTime: segment.startTime,
    endTime: segment.endTime,
    durationMinutes: getDurationMinutes(segment.startTime, segment.endTime),
    location,
    pointCount: path.length || 0,
    raw: {
      timelinePath: { pointCount: path.length || 0 },
      timezoneOffsetMinutes: segment.startTimeTimezoneUtcOffsetMinutes,
    },
  };
};

/**
 * Calculate duration in minutes between two ISO timestamps
 */
const getDurationMinutes = (start, end) => {
  if (!start || !end) return null;
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    return Math.round(ms / 60000);
  } catch {
    return null;
  }
};

/**
 * Determine segment type and process accordingly
 */
const processSegment = async (segment, userId) => {
  let payload, externalIdData;
  
  if (segment.visit) {
    payload = normalizeVisit(segment);
    externalIdData = buildVisitExternalId(segment);
  } else if (segment.activity) {
    payload = normalizeActivity(segment);
    externalIdData = buildActivityExternalId(segment);
  } else if (segment.timelineMemory?.trip) {
    payload = normalizeTrip(segment);
    externalIdData = buildTripExternalId(segment);
  } else if (segment.timelinePath) {
    payload = normalizePath(segment);
    externalIdData = buildPathExternalId(segment);
  } else {
    // Skip unknown segment types
    return null;
  }
  
  // Store canonical string in payload for debugging
  payload.canonical = externalIdData.canonical;
  
  // Note: Weather enrichment is now done via backfill script (scripts/backfill-weather.js)
  // to avoid blocking the collector on external API calls for every segment
  
  return {
    source,
    eventType: payload.eventType,
    occurredAt: new Date(segment.startTime),
    externalId: externalIdData.externalId,
    payload,
    userId,
  };
};

/**
 * Search for files in a Google Drive folder by name, returns most recent file
 */
const findMostRecentFile = async (folderId, fileName, accessToken) => {
  // Escape single quotes in fileName for Drive API query
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

  return files[0]; // Most recent file due to orderBy
};

/**
 * Fetch file content from Google Drive using access token with timeout
 */
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

/**
 * Parse Timeline.json content and yield segments
 */
const parseTimelineSegments = function* (data) {
  const segments = data.semanticSegments || [];
  for (const segment of segments) {
    yield segment;
  }
};

/**
 * Per-account collector function - fetches Timeline.json from Google Drive for a specific user
 */
const collectForAccount = async (account, cursor) => {
  const userId = account.userId;
  const settings = account.googleTimelineSettings;

  if (!settings?.driveFolderId) {
    console.warn(`[timeline] No driveFolderId configured for user ${userId}, skipping`);
    return { items: [], nextCursor: cursor };
  }

  // Resolve and potentially refresh the access token
  const { accessToken, tokenRecord } = await resolveAccessToken(account);
  if (!accessToken) {
    console.warn(`[timeline] No access token for user ${userId}, skipping`);
    return { items: [], nextCursor: cursor };
  }

  const fileName = settings.driveFileName || 'Timeline.json';
  console.info(`[timeline] Searching for '${fileName}' in folder ${settings.driveFolderId} for user ${userId}`);
  console.info(`[timeline] Current cursor: ${cursor || 'none (will process all segments)'}`);

  const items = [];
  let maxTime = cursor ? new Date(cursor) : null;
  let accessTokenInUse = accessToken;
  let refreshAttempted = false;

  try {
    let data;
    let fileInfo;
    
    try {
      // Search for the most recent file with the specified name in the folder
      fileInfo = await findMostRecentFile(settings.driveFolderId, fileName, accessTokenInUse);
      console.info(`[timeline] Found file: ${fileInfo.name} (${fileInfo.id}), modified: ${fileInfo.modifiedTime}`);
      
      // Fetch the file content
      data = await fetchDriveFile(fileInfo.id, accessTokenInUse);
    } catch (err) {
      // Retry once with token refresh if we get a 401
      if (err.message.includes('401') && tokenRecord?.refreshToken && !refreshAttempted) {
        console.warn(`[timeline] Drive 401 for user ${userId}, attempting token refresh...`);
        refreshAttempted = true;
        const refreshed = await refreshAccessToken(account, tokenRecord.refreshToken);
        if (refreshed?.accessToken) {
          accessTokenInUse = refreshed.accessToken;
          fileInfo = await findMostRecentFile(settings.driveFolderId, fileName, accessTokenInUse);
          console.info(`[timeline] Found file: ${fileInfo.name} (${fileInfo.id}), modified: ${fileInfo.modifiedTime}`);
          data = await fetchDriveFile(fileInfo.id, accessTokenInUse);
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    const totalSegments = data.semanticSegments?.length ?? 0;
    console.info(`[timeline] User ${userId}: Timeline.json fetched successfully, found ${totalSegments} segments`);
    
    // Find and log date range in the file
    if (totalSegments > 0) {
      const firstSegmentTime = data.semanticSegments[0]?.startTime;
      const lastSegmentTime = data.semanticSegments[totalSegments - 1]?.startTime;
      console.info(`[timeline] User ${userId}: Timeline date range: ${firstSegmentTime} to ${lastSegmentTime}`);
    }

    let processed = 0;
    let skipped = 0;
    let examined = 0;
    const lastProcessedTime = cursor ? new Date(cursor) : null;
    const itemsToInsert = [];
    const itemsWithLocation = []; // Track items with location for weather enrichment

    // Process segments - they may not be in chronological order!
    for (const segment of parseTimelineSegments(data)) {
      examined++;

      // Log progress periodically
      if (examined % PROGRESS_LOG_INTERVAL === 0) {
        console.info(`[timeline] User ${userId}: examined ${examined}/${totalSegments} segments (${processed} processed, ${skipped} skipped)`);
      }

      // Stop if we've hit the per-run limit
      if (processed >= MAX_SEGMENTS_PER_RUN) {
        console.info(`[timeline] User ${userId}: reached limit of ${MAX_SEGMENTS_PER_RUN} processed segments, stopping`);
        break;
      }

      const segmentTime = new Date(segment.startTime);

      // Skip if we've already processed this (cursor check)
      // Note: segments are NOT guaranteed to be in chronological order
      if (lastProcessedTime && segmentTime <= lastProcessedTime) {
        skipped++;
        continue;
      }

      const item = await processSegment(segment, userId);
      if (item) {
        itemsToInsert.push(item);
        
        // Track items with location for weather enrichment
        if (item.payload?.location || item.payload?.startLocation) {
          itemsWithLocation.push({ item, segment });
        }
        
        processed++;

        if (!maxTime || segmentTime > maxTime) {
          maxTime = segmentTime;
        }
      } else {
        skipped++;
      }
    }

    console.info(`[timeline] User ${userId}: finished parsing ${processed} events, skipped ${skipped} segments (examined ${examined}/${totalSegments})`);

    // Bulk insert events in batches
    let insertedCount = 0;
    for (let i = 0; i < itemsToInsert.length; i += BATCH_INSERT_SIZE) {
      const batch = itemsToInsert.slice(i, i + BATCH_INSERT_SIZE);
      const batchNum = Math.floor(i / BATCH_INSERT_SIZE) + 1;
      const totalBatches = Math.ceil(itemsToInsert.length / BATCH_INSERT_SIZE);
      
      console.info(`[timeline] User ${userId}: inserting batch ${batchNum}/${totalBatches} (${batch.length} events)`);
      
      try {
        const result = await prisma.event.createMany({
          data: batch,
          skipDuplicates: true,
        });
        insertedCount += result.count;
        // Don't add to items array - we're handling insert here, runner shouldn't re-insert
      } catch (err) {
        console.error(`[timeline] User ${userId}: batch insert failed:`, err.message);
        console.error(`[timeline] Sample item structure:`, JSON.stringify(batch[0], null, 2));
      }
    }

    console.info(`[timeline] User ${userId}: inserted ${insertedCount} new events (${itemsToInsert.length - insertedCount} duplicates skipped)`);

    // Post-process weather enrichment for items with location
    if (itemsWithLocation.length > 0) {
      console.info(`[timeline] User ${userId}: post-processing weather enrichment for ${itemsWithLocation.length} location events`);
      let enrichedCount = 0;
      
      for (let i = 0; i < itemsWithLocation.length; i += WEATHER_BATCH_SIZE) {
        const batch = itemsWithLocation.slice(i, i + WEATHER_BATCH_SIZE);
        
        if ((i / WEATHER_BATCH_SIZE) % 5 === 0) {
          console.info(`[timeline] User ${userId}: enriching weather batch ${Math.floor(i / WEATHER_BATCH_SIZE) + 1}/${Math.ceil(itemsWithLocation.length / WEATHER_BATCH_SIZE)}`);
        }
        
        for (const { item, segment } of batch) {
          try {
            // Find the event in DB by externalId
            const event = await prisma.event.findUnique({
              where: { source_externalId: { source, externalId: item.externalId } },
            });
            
            if (!event) continue;
            
            // Check if weather enrichment already exists
            const existingEnrichment = await prisma.eventEnrichment.findUnique({
              where: { eventId_enrichmentType: { eventId: event.id, enrichmentType: 'weather_v1' } },
            });
            
            if (existingEnrichment) continue;
            
            // Build weather enrichment
            const lat = item.payload.location?.lat ?? item.payload.startLocation?.lat;
            const lng = item.payload.location?.lng ?? item.payload.startLocation?.lng;
            
            if (lat && lng) {
              const eventForEnrichment = {
                payload: {
                  latitude: lat,
                  longitude: lng,
                  timezone: segment.timeZone ?? 'UTC',
                },
                occurredAt: new Date(segment.startTime),
              };
              
              const enrichment = await buildWeatherEnrichment(eventForEnrichment);
              
              if (enrichment) {
                await prisma.eventEnrichment.create({
                  data: {
                    eventId: event.id,
                    source,
                    enrichmentType: enrichment.enrichmentType,
                    data: enrichment.data,
                  },
                });
                enrichedCount++;
              }
            }
          } catch (err) {
            console.warn(`[timeline] Weather enrichment failed for event ${item.externalId}:`, err.message);
          }
        }
      }
      
      console.info(`[timeline] User ${userId}: created ${enrichedCount} weather enrichments`);
    }

    // Update lastSyncedAt
    await prisma.googleTimelineSettings.update({
      where: { connectedAccountId: account.id },
      data: { lastSyncedAt: new Date() },
    });
  } catch (err) {
    console.error(`[timeline] Error fetching Timeline for user ${userId}:`, err.message);
  }

  return {
    items,
    nextCursor: maxTime ? maxTime.toISOString() : cursor,
  };
};

registerCollector({ source, collectForAccount });

export default collectForAccount;
