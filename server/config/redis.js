import IORedis from 'ioredis';
import { config } from './index.js';

/**
 * Creates a Redis connection suitable for BullMQ.
 *
 * BullMQ requires `maxRetriesPerRequest: null`. Upstash uses TLS (rediss://),
 * which ioredis picks up automatically from the URL scheme.
 *
 * Returns null when REDIS_URL is not set — Phase 1 runs without a queue, so
 * callers must handle the null case (tracking/queue features degrade off).
 */
export function createRedisConnection() {
  if (!config.redisUrl) return null;

  const connection = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  connection.on('error', (err) => {
    console.error('[redis] connection error:', err.message);
  });

  return connection;
}

export const isRedisEnabled = () => Boolean(config.redisUrl);

export default createRedisConnection;
