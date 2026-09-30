import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { runTrackingJob } from '../services/tracking/index.js';
import { TRACKING_QUEUE } from './tracking.queue.js';

/**
 * BullMQ worker that processes queued tracking jobs. Started by the dedicated
 * worker process (server/worker.js) when REDIS_URL is set.
 */
export function startTrackingWorker() {
  const connection = createRedisConnection();
  const worker = new Worker(
    TRACKING_QUEUE,
    async (job) => runTrackingJob(job.data),
    { connection, concurrency: 5 }
  );

  worker.on('completed', (job) => {
    console.log(`[worker] ${job.name} done`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[worker] ${job?.name} failed:`, err.message);
  });

  console.log('[worker] tracking worker started');
  return worker;
}

export default startTrackingWorker;
