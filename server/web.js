import { start } from './app.js';

/**
 * Web process entry point for PM2 (see ecosystem.config.cjs).
 *
 * PM2 loads scripts through its own wrapper, so process.argv[1] is not this
 * file and app.js's "run directly" check would skip starting the server —
 * the process would exit immediately and PM2 would restart it in a loop.
 */
start().catch((err) => {
  console.error('[web] failed to start:', err);
  process.exit(1);
});
