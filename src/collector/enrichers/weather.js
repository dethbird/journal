import fetch from 'node-fetch';

/**
 * Weather code mapping from Open-Meteo
 * https://open-meteo.com/en/docs
 */
const WEATHER_CODE_MAP = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

const API_BASE = 'https://archive-api.open-meteo.com/v1/archive';

/**
 * Find the closest hour index to the target time
 */
const findClosestHourIndex = (hourlyTimes, targetIso) => {
  const target = new Date(targetIso).getTime();
  let closestIdx = 0;
  let closestDiff = Infinity;

  for (let i = 0; i < hourlyTimes.length; i++) {
    const hourTime = new Date(hourlyTimes[i]).getTime();
    const diff = Math.abs(hourTime - target);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestIdx = i;
    }
  }

  return closestIdx;
};

/**
 * Build weather enrichment for a location event with lat/lng and occurredAt
 * @param {Object} event - Event with payload.latitude, payload.longitude, occurredAt
 * @returns {Promise<Object|null>} - Enrichment object or null if fetch fails
 */
export const buildWeatherEnrichment = async (event) => {
  const payload = event.payload ?? {};
  const lat = payload.latitude ?? payload.lat ?? null;
  const lng = payload.longitude ?? payload.lng ?? payload.lon ?? null;
  const occurredAt = event.occurredAt;

  if (!lat || !lng || !occurredAt) {
    return null;
  }

  try {
    const date = new Date(occurredAt);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

    // Determine timezone (use UTC if not available)
    const timezone = payload.timezone ?? 'UTC';

    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      start_date: dateStr,
      end_date: dateStr,
      hourly: 'temperature_2m,apparent_temperature,precipitation,weathercode,wind_speed_10m',
      timezone: timezone,
    });

    const url = `${API_BASE}?${params.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.warn(`Weather API failed (${res.status}) for event ${event.id ?? event.externalId}`);
      return null;
    }

    const data = await res.json();
    const hourly = data.hourly ?? {};

    if (!hourly.time || hourly.time.length === 0) {
      return null;
    }

    // Find closest hour to occurredAt
    const idx = findClosestHourIndex(hourly.time, occurredAt);

    const weatherCode = hourly.weathercode?.[idx] ?? null;
    const temperature = hourly.temperature_2m?.[idx] ?? null;
    const apparentTemp = hourly.apparent_temperature?.[idx] ?? null;
    const precipitation = hourly.precipitation?.[idx] ?? null;
    const windSpeed = hourly.wind_speed_10m?.[idx] ?? null;

    const weatherDescription = weatherCode != null ? WEATHER_CODE_MAP[weatherCode] ?? 'Unknown' : null;

    return {
      enrichmentType: 'weather_v1',
      data: {
        weather: {
          temperature_c: temperature,
          apparent_temperature_c: apparentTemp,
          precipitation_mm: precipitation,
          wind_speed_kmh: windSpeed,
          weather_code: weatherCode,
          weather_description: weatherDescription,
          time: hourly.time[idx],
        },
        status: 'ok',
      },
    };
  } catch (err) {
    console.warn(`Weather enrichment failed for event ${event.id ?? event.externalId}:`, err.message);
    return null;
  }
};

export default buildWeatherEnrichment;
