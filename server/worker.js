import { connectDB } from './config/db.js';
import { isRedisEnabled } from './config/redis.js';
import { startTrackingWorker } from './queues/tracking.worker.js';
import { reportError, watchDbConnection } from './services/systemErrors.js';

/**
 * BullMQ worker process (separate from web). Processes the tracking queue.
 * Only meaningful when REDIS_URL is set — otherwise the web process dispatches
 * tracking inline and this process has nothing to do.
 */
async function start() {
  watchDbConnection();
  await connectDB();

  if (!isRedisEnabled()) {
    console.warn('[worker] REDIS_URL not set — tracking runs inline in web. Worker idling.');
    return;
  }

  startTrackingWorker();
}

start().catch((err) => {
  reportError('worker:start', err);
  process.exit(1);
});
