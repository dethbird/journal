/**
 * Timeline digest section builder
 * 
 * Transforms google_timeline Events into a structured view model section
 * for display in the digest.
 */

const ACTIVITY_LABELS = {
  WALKING: '🚶 Walking',
  RUNNING: '🏃 Running',
  CYCLING: '🚴 Cycling',
  IN_VEHICLE: '🚗 Driving',
  IN_BUS: '🚌 Bus',
  IN_TRAIN: '🚆 Train',
  IN_SUBWAY: '🚇 Subway',
  IN_TRAM: '🚃 Tram',
  IN_FERRY: '⛴️ Ferry',
  FLYING: '✈️ Flying',
  MOTORCYCLING: '🏍️ Motorcycle',
  SKIING: '⛷️ Skiing',
  SNOWBOARDING: '🏂 Snowboarding',
  SAILING: '⛵ Sailing',
  UNKNOWN: '📍 Moving',
};

const SEMANTIC_TYPE_LABELS = {
  HOME: '🏠 Home',
  INFERRED_HOME: '🏠 Home',
  WORK: '💼 Work',
  INFERRED_WORK: '💼 Work',
  SCHOOL: '🏫 School',
  SHOPPING: '🛒 Shopping',
  RESTAURANT: '🍽️ Restaurant',
  GYM: '💪 Gym',
  TRANSIT_STATION: '🚉 Transit',
  AIRPORT: '✈️ Airport',
  UNKNOWN: '📍',
};

/**
 * Format duration in a human-readable way
 */
const formatDuration = (minutes) => {
  if (!minutes || minutes < 1) return null;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

/**
 * Format distance in a human-readable way
 */
const formatDistance = (meters) => {
  if (!meters && meters !== 0) return null;
  const km = Number(meters) / 1000;
  const mi = km * 0.621371;
  const kmLabel = km >= 10 ? Math.round(km) : km.toFixed(1);
  const miLabel = mi >= 10 ? Math.round(mi) : mi.toFixed(1);
  return `${kmLabel}km (${miLabel}mi)`;
};

/**
 * Get activity label with emoji
 */
const getActivityLabel = (type) => {
  return ACTIVITY_LABELS[type] || ACTIVITY_LABELS.UNKNOWN;
};

/**
 * Get semantic type label with emoji
 */
const getSemanticLabel = (type) => {
  return SEMANTIC_TYPE_LABELS[type] || SEMANTIC_TYPE_LABELS.UNKNOWN;
};

/**
 * Build a visit item for the view model
 */
const buildVisitItem = (event) => {
  const payload = event.payload || {};
  const duration = formatDuration(payload.durationMinutes);
  const semanticLabel = getSemanticLabel(payload.semanticType);
  
  return {
    type: 'visit',
    occurredAt: event.occurredAt?.toISOString?.() || event.occurredAt,
    startTime: payload.startTime,
    endTime: payload.endTime,
    duration,
    placeId: payload.placeId,
    semanticType: payload.semanticType,
    label: semanticLabel,
    location: payload.location,
  };
};

/**
 * Build an activity item for the view model
 */
const buildActivityItem = (event) => {
  const payload = event.payload || {};
  const duration = formatDuration(payload.durationMinutes);
  const distance = formatDistance(payload.distanceMeters);
  const activityLabel = getActivityLabel(payload.activityType);
  
  return {
    type: 'activity',
    occurredAt: event.occurredAt?.toISOString?.() || event.occurredAt,
    startTime: payload.startTime,
    endTime: payload.endTime,
    duration,
    distance,
    activityType: payload.activityType,
    label: activityLabel,
    startLocation: payload.startLocation,
    endLocation: payload.endLocation,
  };
};

/**
 * Build a trip item for the view model
 */
const buildTripItem = (event) => {
  const payload = event.payload || {};
  const duration = formatDuration(payload.durationMinutes);
  const distance = payload.distanceFromOriginKms 
    ? `${payload.distanceFromOriginKms.toFixed(0)}km from home` 
    : null;
  
  const destinationNames = (payload.destinations || [])
    .map(d => d.name)
    .filter(Boolean);
  
  return {
    type: 'trip',
    occurredAt: event.occurredAt?.toISOString?.() || event.occurredAt,
    startTime: payload.startTime,
    endTime: payload.endTime,
    duration,
    distance,
    destinations: destinationNames,
    label: '🗺️ Trip',
  };
};

/**
 * Aggregate statistics from timeline events
 */
const buildTimelineStats = (events) => {
  const stats = {
    totalVisits: 0,
    totalActivities: 0,
    totalTrips: 0,
    totalDistanceMeters: 0,
    totalActivityMinutes: 0,
    activityBreakdown: {},
    visitBreakdown: {},
  };
  
  for (const event of events) {
    const payload = event.payload || {};
    const eventType = payload.eventType || event.eventType;
    
    if (eventType === 'visit') {
      stats.totalVisits++;
      const semanticType = payload.semanticType || 'UNKNOWN';
      stats.visitBreakdown[semanticType] = (stats.visitBreakdown[semanticType] || 0) + 1;
    } else if (eventType === 'activity') {
      stats.totalActivities++;
      stats.totalDistanceMeters += payload.distanceMeters || 0;
      stats.totalActivityMinutes += payload.durationMinutes || 0;
      const activityType = payload.activityType || 'UNKNOWN';
      stats.activityBreakdown[activityType] = (stats.activityBreakdown[activityType] || 0) + 1;
    } else if (eventType === 'trip') {
      stats.totalTrips++;
    }
  }
  
  return stats;
};

/**
 * Main section builder
 */
export const buildTimelineSection = (events) => {
  if (!events?.length) return null;
  
  const stats = buildTimelineStats(events);
  
  // Build items list (visits and activities, sorted by time)
  const items = events
    .map(event => {
      const payload = event.payload || {};
      const eventType = payload.eventType || event.eventType;
      
      if (eventType === 'visit') return buildVisitItem(event);
      if (eventType === 'activity') return buildActivityItem(event);
      if (eventType === 'trip') return buildTripItem(event);
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  
  // Build activity summary (top activities by count)
  const activitySummary = Object.entries(stats.activityBreakdown)
    .map(([type, count]) => ({ type, count, label: getActivityLabel(type) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  // Build visit summary (non-HOME visits)
  const visitSummary = Object.entries(stats.visitBreakdown)
    .filter(([type]) => type !== 'HOME')
    .map(([type, count]) => ({ type, count, label: getSemanticLabel(type) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  return {
    kind: 'timeline',
    items,
    summary: {
      totalVisits: stats.totalVisits,
      totalActivities: stats.totalActivities,
      totalTrips: stats.totalTrips,
      totalDistance: formatDistance(stats.totalDistanceMeters),
      totalActivityTime: formatDuration(stats.totalActivityMinutes),
      activityBreakdown: activitySummary,
      visitBreakdown: visitSummary,
    },
  };
};

export default buildTimelineSection;
