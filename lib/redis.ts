import Redis from 'ioredis'

const globalForRedis = globalThis as unknown as { _redis: Redis | undefined }

function createRedisClient(): Redis {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379'
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableOfflineQueue: false,
  })

  client.on('error', (err) => {
    // Don't crash the server if Redis is temporarily unavailable
    console.error('[Redis] Connection error:', err.message)
  })

  return client
}

export function getRedis(): Redis {
  if (!globalForRedis._redis) {
    globalForRedis._redis = createRedisClient()
  }
  return globalForRedis._redis
}

// Separate publisher client (Redis pub/sub requires dedicated connections)
const globalForPub = globalThis as unknown as { _redisPub: Redis | undefined }

export function getRedisPub(): Redis {
  if (!globalForPub._redisPub) {
    globalForPub._redisPub = createRedisClient()
  }
  return globalForPub._redisPub
}
