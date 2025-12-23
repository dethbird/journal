# Spotify Genre Breakdown

This feature adds genre analysis to your Spotify digest, showing you what genres you've been listening to most.

## How It Works

When the collector fetches your recently played tracks from Spotify, it now:

1. **Fetches Genre Data**: For each track, it fetches the artist and album information from Spotify's API to get their associated genres
2. **Caches Results**: Uses Redis to cache artist and album data to avoid redundant API calls (many tracks often share the same artists/albums)
3. **Stores Genres**: Enriches each event with genre data in the payload
4. **Calculates Metrics**: The digest view model calculates genre frequency and percentages
5. **Displays Results**: Shows top genres in both the React UI and email digest

## Setup

### Redis Configuration

Genre caching requires Redis to be running. Add these environment variables to your `.env` file:

```bash
# Redis URL (default: redis://localhost:6379)
REDIS_URL=redis://localhost:6379

# Enable/disable Redis caching (default: true)
REDIS_CACHE_ENABLED=true
```

### Running Redis

#### Using Docker
```bash
docker run -d -p 6379:6379 redis:alpine
```

#### Using Docker Compose
Add to your `docker-compose.yml`:
```yaml
redis:
  image: redis:alpine
  ports:
    - "6379:6379"
  volumes:
    - redis-data:/data

volumes:
  redis-data:
```

#### Local Installation
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis

# Verify Redis is running
redis-cli ping  # Should return "PONG"
```

### Graceful Degradation

If Redis is not available or disabled:
- The collector will still work but won't cache API results
- Genre data will still be fetched but may result in more API calls
- Set `REDIS_CACHE_ENABLED=false` to disable caching entirely

## Data Structure

### Event Enrichment

Each Spotify track event now includes a `genres` array in the payload:

```json
{
  "payload": {
    "track": { ... },
    "artists": [ ... ],
    "album": { ... },
    "genres": ["indie rock", "alternative rock", "modern rock"]
  }
}
```

### Digest Output

The digest summary includes `topGenres` with count and percentage:

```json
{
  "summary": {
    "topGenres": [
      { "name": "indie rock", "count": 15, "percent": 23.5 },
      { "name": "electronic", "count": 12, "percent": 18.8 },
      { "name": "hip hop", "count": 10, "percent": 15.6 }
    ]
  }
}
```

## Cache Settings

- **Artist Cache TTL**: 7 days (genres don't change frequently)
- **Album Cache TTL**: 7 days
- **Batch Size**: Fetches up to 50 artists or 20 albums per API call

## Performance

- **First Run**: Will make API calls for all unique artists and albums
- **Subsequent Runs**: Most data will be cached, significantly reducing API calls
- **Rate Limiting**: Includes 100ms delays between batches to respect Spotify's rate limits

## Troubleshooting

### No Genres Showing Up

1. **Check Redis Connection**:
   ```bash
   redis-cli ping
   ```

2. **Verify Environment Variables**:
   ```bash
   echo $REDIS_URL
   echo $REDIS_CACHE_ENABLED
   ```

3. **Check Collector Logs**: Look for Redis connection errors or API failures

4. **Verify Spotify Data**: Some tracks/artists may not have genre information in Spotify's database

### Redis Connection Issues

Check the collector logs for:
- `Redis client connected` (successful connection)
- `Redis connection failed` (connection issues)
- `Redis get/set error` (operational issues)

## Related Files

- **Collector**: [`src/collector/sources/spotify.js`](../src/collector/sources/spotify.js) - Fetches tracks and enriches with genres
- **Redis Client**: [`src/lib/redisClient.js`](../src/lib/redisClient.js) - Handles caching
- **Digest Section**: [`src/digest/sections/spotify.js`](../src/digest/sections/spotify.js) - Calculates genre metrics
- **Email Renderer**: [`src/digest/renderers/email.js`](../src/digest/renderers/email.js) - Displays in emails
- **React UI**: [`src/ui/src/components/Digest.jsx`](../src/ui/src/components/Digest.jsx) - Displays in web interface
