// Per-funnel Tracking Event Log filter.
import { callController as call, makeT, mongoose } from './_harness.mjs';
import { Product, EventLog } from '../server/models/index.js';
import * as funnel from '../server/controllers/funnel.controller.js';
import * as tracking from '../server/controllers/tracking.controller.js';

export default {
  name: 'Tracking Event Log: per-funnel filter',
  seed: true,
  async fn() {
    const t = makeT('tracking-log');
    const { ok } = t;

    const def = await Product.findOne().sort({ createdAt: 1 }).lean();
    const f2 = (await call(funnel.createFunnel, { body: { name: 'Belt Two' } })).body.funnel;

    await EventLog.create([
      { platform: 'facebook', eventName: 'Purchase', productId: def._id, status: 'success', attempts: 1 },
      { platform: 'tiktok', eventName: 'Purchase', productId: def._id, status: 'failed', attempts: 3 },
      { platform: 'facebook', eventName: 'Purchase', productId: f2._id, status: 'success', attempts: 1 },
      { platform: 'facebook', eventName: 'Purchase', productId: null, status: 'success', attempts: 1 }, // legacy/global
    ]);

    let r = await call(tracking.listEventLogs, { query: {} });
    ok(r.body.events.length === 4, 'no filter → all 4 logs');
    ok((r.body.statusCounts.success || 0) === 3 && (r.body.statusCounts.failed || 0) === 1, 'overall status counts');

    r = await call(tracking.listEventLogs, { query: { funnel: String(def._id) } });
    ok(r.body.events.length === 2 && r.body.events.every((e) => String(e.productId) === String(def._id)), 'default funnel → its 2 logs');
    ok((r.body.statusCounts.success || 0) === 1 && (r.body.statusCounts.failed || 0) === 1, 'default status counts scoped');

    r = await call(tracking.listEventLogs, { query: { funnel: String(f2._id) } });
    ok(r.body.events.length === 1, 'f2 funnel → its 1 log');

    r = await call(tracking.listEventLogs, { query: { funnel: String(def._id), status: 'failed' } });
    ok(r.body.events.length === 1 && r.body.events[0].platform === 'tiktok', 'funnel + status filters combine');

    // Invalid funnel id is ignored (treated as "all"), not an error.
    r = await call(tracking.listEventLogs, { query: { funnel: 'not-an-id' } });
    ok(r.body.events.length === 4, 'invalid funnel id → all logs (ignored)');

    return t.result();
  },
};
