import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CACHE_ENABLED = process.env.REDIS_CACHE_ENABLED !== 'false';

let redis = null;

if (CACHE_ENABLED) {
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          console.warn('Redis connection failed after 3 retries, disabling cache');
          return null;
        }
        return Math.min(times * 100, 2000);
      },
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      console.warn('Redis client error:', err.message);
    });

    redis.on('connect', () => {
      console.log('Redis client connected');
    });
  } catch (err) {
    console.warn('Failed to initialize Redis client:', err.message);
    redis = null;
  }
}

export const CACHE_KEYS = {
  ARTIST: 'spotify:artist:',
  ALBUM: 'spotify:album:',
};

export const CACHE_TTL = {
  ARTIST: 86400 * 7, // 7 days
  ALBUM: 86400 * 7, // 7 days
};

/**
 * Get a cached value
 * @param {string} key - Cache key
 * @returns {Promise<any|null>} - Cached value or null
 */
export const getCached = async (key) => {
  if (!redis || !CACHE_ENABLED) return null;
  
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.warn('Redis get error:', err.message);
    return null;
  }
};

/**
 * Set a cached value
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<boolean>} - Success status
 */
export const setCached = async (key, value, ttl) => {
  if (!redis || !CACHE_ENABLED) return false;
  
  try {
    if (ttl) {
      await redis.setex(key, ttl, JSON.stringify(value));
    } else {
      await redis.set(key, JSON.stringify(value));
    }
    return true;
  } catch (err) {
    console.warn('Redis set error:', err.message);
    return false;
  }
};

/**
 * Get multiple cached values
 * @param {string[]} keys - Array of cache keys
 * @returns {Promise<Map<string, any>>} - Map of key to cached value
 */
export const getMultipleCached = async (keys) => {
  const result = new Map();
  
  if (!redis || !CACHE_ENABLED || !keys?.length) return result;
  
  try {
    const values = await redis.mget(...keys);
    keys.forEach((key, index) => {
      if (values[index]) {
        try {
          result.set(key, JSON.parse(values[index]));
        } catch (err) {
          console.warn('Redis parse error for key:', key, err.message);
        }
      }
    });
  } catch (err) {
    console.warn('Redis mget error:', err.message);
  }
  
  return result;
};

/**
 * Connect to Redis (if not already connected)
 * @returns {Promise<boolean>} - Success status
 */
export const connectRedis = async () => {
  if (!redis || !CACHE_ENABLED) return false;
  
  try {
    await redis.connect();
    return true;
  } catch (err) {
    console.warn('Redis connect error:', err.message);
    return false;
  }
};

/**
 * Disconnect from Redis
 * @returns {Promise<void>}
 */
export const disconnectRedis = async () => {
  if (redis) {
    await redis.disconnect();
  }
};

export default redis;
