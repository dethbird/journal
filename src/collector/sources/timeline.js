import crypto from 'node:crypto';
import { registerCollector } from '../registry.js';
import prisma from '../../lib/prismaClient.js';

const source = 'google_timeline';

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
const processSegment = (segment, userId) => {
  // Skip timelinePath segments (noisy GPS data)
  if (segment.timelinePath && !segment.visit && !segment.activity && !segment.timelineMemory) {
    return null;
  }
  
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
  } else {
    // Skip unknown segment types
    return null;
  }
  
  // Store canonical string in payload for debugging
  payload.canonical = externalIdData.canonical;
  
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
 * Fetch file content from Google Drive using access token
 */
const fetchDriveFile = async (fileId, accessToken) => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive API error (${res.status}): ${text}`);
  }
  return res.json();
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
  const token = account.oauthTokens?.[0];

  if (!token?.accessToken) {
    console.warn(`[timeline] No access token for user ${userId}, skipping`);
    return { items: [], nextCursor: cursor };
  }

  if (!settings?.driveFileId) {
    console.warn(`[timeline] No driveFileId configured for user ${userId}, skipping`);
    return { items: [], nextCursor: cursor };
  }

  console.info(`[timeline] Fetching Timeline.json (${settings.driveFileName || settings.driveFileId}) for user ${userId}`);

  const items = [];
  let maxTime = cursor ? new Date(cursor) : null;

  try {
    const data = await fetchDriveFile(settings.driveFileId, token.accessToken);

    let processed = 0;
    let skipped = 0;
    const lastProcessedTime = cursor ? new Date(cursor) : null;

    for (const segment of parseTimelineSegments(data)) {
      const segmentTime = new Date(segment.startTime);

      // Skip if we've already processed this
      if (lastProcessedTime && segmentTime <= lastProcessedTime) {
        skipped++;
        continue;
      }

      const item = processSegment(segment, userId);
      if (item) {
        items.push(item);
        processed++;

        if (!maxTime || segmentTime > maxTime) {
          maxTime = segmentTime;
        }
      } else {
        skipped++;
      }
    }

    console.info(`[timeline] User ${userId}: processed ${processed} events, skipped ${skipped} segments`);

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
