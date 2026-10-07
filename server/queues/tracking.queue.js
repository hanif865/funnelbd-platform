import { Queue } from 'bullmq';
import { config } from '../config/index.js';
import { createRedisConnection, isRedisEnabled } from '../config/redis.js';
import { runTrackingJob } from '../services/tracking/index.js';

/**
 * Tracking dispatch layer with graceful degradation:
 *   - REDIS_URL set  → jobs go through a BullMQ queue (survives web restarts,
 *     processed by the worker, decoupled from the request).
 *   - no REDIS_URL   → jobs run inline, fire-and-forget (dev / small setups).
 *
 * Either way the request is never blocked waiting on Facebook/Google/TikTok,
 * and every attempt is logged to event_logs.
 */
// Per-instance queue name so two funnels sharing one Redis never pick up each
// other's jobs. The original instance keeps the historical name.
export const TRACKING_QUEUE = config.appName === 'funnelbd' ? 'tracking' : `${config.appName}-tracking`;

let queue = null;
if (isRedisEnabled()) {
  const connection = createRedisConnection();
  queue = new Queue(TRACKING_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 1, // internal retry (3x) lives in runTrackingJob
      removeOnComplete: 500,
      removeOnFail: 1000,
    },
  });
  console.log('[tracking] queue mode → BullMQ (Redis)');
} else {
  console.log('[tracking] inline mode → no Redis; events dispatched fire-and-forget');
}

/**
 * Enqueue (or inline-run) a batch of tracking jobs. Non-blocking: returns
 * immediately. Safe to call from a request handler.
 */
export async function enqueueTrackingJobs(jobs = []) {
  if (!jobs.length) return;

  if (queue) {
    await queue.addBulk(
      jobs.map((data) => ({ name: `${data.platform}:${data.eventName}`, data }))
    );
    return;
  }

  // Inline: fire-and-forget. runTrackingJob never throws.
  for (const job of jobs) {
    runTrackingJob(job).catch((e) => console.error('[tracking] inline job error:', e.message));
  }
}

export function getTrackingQueue() {
  return queue;
}

export default { enqueueTrackingJobs, getTrackingQueue, TRACKING_QUEUE };
