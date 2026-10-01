import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { DailyStat } from '../models/index.js';

/**
 * Reset the dashboard's traffic analytics for a clean slate (e.g. after launch,
 * to drop pre-launch test data). Orders and revenue are NOT touched — they live
 * in a different collection.
 *
 *   node server/scripts/reset-section-analytics.js            # dry run
 *   node server/scripts/reset-section-analytics.js --apply    # clear the
 *       "Landing page sections" data (time spent / views / exits) only
 *   node server/scripts/reset-section-analytics.js --apply --all  # also reset
 *       visitor & visit counters (a full traffic-analytics clean slate)
 *
 * Either way, numbers start accumulating fresh from the next visit.
 */
async function run() {
  const apply = process.argv.includes('--apply');
  const all = process.argv.includes('--all');
  await connectDB();

  const docs = await DailyStat.countDocuments();
  console.log(`[reset-analytics] ${docs} day(s) of stats in daily_stats.`);
  console.log(
    '[reset-analytics] ' +
      (apply ? 'APPLY mode' : 'dry run (use --apply to write)') +
      (all ? ' — also resetting visit/visitor counts (--all)' : ' — section data only')
  );

  if (!apply) {
    console.log(
      `[reset-analytics] would clear: sectionDwell / sectionExits / sectionViews` +
        (all ? ' + visits + visitors' : '') +
        ` across ${docs} day(s).`
    );
    console.log('[reset-analytics] dry run only — re-run with --apply to write.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const set = { sectionDwell: {}, sectionExits: {}, sectionViews: {} };
  if (all) {
    set.visits = 0;
    set.visitors = 0;
  }
  const res = await DailyStat.updateMany({}, { $set: set });
  console.log(`[reset-analytics] cleared stats on ${res.modifiedCount} day(s). Dashboard starts fresh from the next visit.`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('[reset-analytics] failed:', err);
  process.exit(1);
});
