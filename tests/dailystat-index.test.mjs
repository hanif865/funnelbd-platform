// DailyStat migration: drop the old `date` unique index and build the compound
// (date, productId) unique index, so per-funnel rows can coexist.
import { mongoose, makeT } from './_harness.mjs';
import { DailyStat } from '../server/models/index.js';
import { dhakaYmd } from '../server/utils/time.js';

export default {
  name: 'DailyStat: date→(date,productId) index migration',
  seed: false,
  async fn() {
    const t = makeT('dailystat-index');
    const { ok } = t;
    const raw = DailyStat.collection;

    // Simulate the pre-migration world: a unique index on `date` alone.
    await raw.dropIndexes().catch(() => {});
    await raw.createIndex({ date: 1 }, { unique: true, name: 'date_1' });
    await raw.insertOne({ date: '2026-01-01', visits: 5, visitors: 3 });

    let blocked = false;
    try { await raw.insertOne({ date: '2026-01-01', productId: new mongoose.Types.ObjectId() }); }
    catch { blocked = true; }
    ok(blocked, 'old index blocks a 2nd row for the same date');

    // Run the migration steps (mirrors assign-default-funnel.js).
    const before = await raw.indexes();
    const old = before.find((i) => i.unique && i.key && i.key.date === 1 && Object.keys(i.key).length === 1);
    ok(!!old, 'migration locates the old date index');
    await raw.dropIndex(old.name);
    await DailyStat.syncIndexes();

    const after = await raw.indexes();
    ok(!after.some((i) => i.name === 'date_1'), 'old date_1 index dropped');
    ok(after.some((i) => i.unique && i.key.date === 1 && i.key.productId === 1), 'compound unique index present');

    // Per-funnel rows now coexist; same (date,funnel) upserts into one row.
    const pidA = new mongoose.Types.ObjectId();
    const pidB = new mongoose.Types.ObjectId();
    await DailyStat.track(true, pidA);
    await DailyStat.track(true, pidB);
    const today = dhakaYmd();
    ok((await raw.find({ date: today }).toArray()).length === 2, 'two funnel rows coexist today');
    await DailyStat.track(false, pidA);
    const aRows = await raw.find({ productId: pidA }).toArray();
    ok(aRows.length === 1 && aRows[0].visits === 2, 'same date+funnel upserts one row');

    return t.result();
  },
};
