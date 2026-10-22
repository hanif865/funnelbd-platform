// Courier-status pixel events (delivered / cancelled / returned) + dedup.
import { callController as call, makeT, mongoose } from './_harness.mjs';
import { Order } from '../server/models/index.js';
import { buildCourierStatusJobs } from '../server/services/tracking/index.js';
import * as admin from '../server/controllers/admin.controller.js';

const { ObjectId } = mongoose.Types;

function makeOrder(extra = {}) {
  const accountId = extra.accountId || new ObjectId();
  return Order.create({
    orderNumber: extra.orderNumber || Math.floor(Math.random() * 1e9),
    accountId,
    productId: extra.productId || new ObjectId(),
    customer: { name: 'ক্রেতা', phone: '8801712345678', address: 'ঢাকা' },
    offerId: new ObjectId(),
    offerTitle: '1 pcs',
    unitPrice: 500,
    quantity: 2,
    deliveryCharge: 60,
    subtotal: 1000,
    total: 1060,
    status: 'shipped',
    ...extra,
  });
}

export default {
  name: 'Courier-status pixel events + dedup',
  seed: false,
  async fn() {
    const t = makeT('courier-tracking');
    const { ok } = t;

    // ── buildCourierStatusJobs ──────────────────────────────────────────────
    const o = await makeOrder();
    const jobs = buildCourierStatusJobs(o, 'delivered');
    ok(jobs.length === 2, 'delivered → FB + TikTok jobs');
    const fb = jobs.find((j) => j.platform === 'facebook');
    const tk = jobs.find((j) => j.platform === 'tiktok');
    ok(fb && fb.eventName === 'Delivered', 'FB event name = Delivered');
    ok(tk && tk.eventName === 'Delivered', 'TikTok event name = Delivered');
    ok(fb.eventId === `delivered_${o._id}`, 'deterministic event id per order+status');
    ok(fb.eventInput.customData.value === 1060, 'FB job carries order value');
    ok(fb.eventInput.actionSource === 'system_generated', 'offline action source');
    ok(String(fb.productId) === String(o.productId), 'job stamped with funnel productId');
    ok(String(fb.accountId) === String(o.accountId), 'job stamped with accountId');

    ok(buildCourierStatusJobs(o, 'confirmed').length === 0, 'non-terminal status → no jobs');
    ok(buildCourierStatusJobs(o, 'cancelled')[0].eventName === 'Cancelled', 'cancelled → Cancelled');
    ok(buildCourierStatusJobs(o, 'returned')[0].eventName === 'Returned', 'returned → Returned');

    // ── updateStatus marks the event fired (dedup fuel) ─────────────────────
    const acctId = new ObjectId();
    const u = await makeOrder({ accountId: acctId });
    const ctx = { params: { id: String(u._id) }, accountId: String(acctId), admin: { name: 'Admin' } };

    await call(admin.updateStatus, { ...ctx, body: { status: 'delivered' } });
    let fresh = await Order.findById(u._id).lean();
    ok((fresh.trackedCourierEvents || []).includes('delivered'), 'delivered recorded in trackedCourierEvents');

    // Flip away and back — 'delivered' must not be recorded twice.
    await call(admin.updateStatus, { ...ctx, body: { status: 'returned' } });
    await call(admin.updateStatus, { ...ctx, body: { status: 'delivered' } });
    fresh = await Order.findById(u._id).lean();
    const deliveredCount = (fresh.trackedCourierEvents || []).filter((s) => s === 'delivered').length;
    ok(deliveredCount === 1, 'flip-flop never double-records delivered');
    ok((fresh.trackedCourierEvents || []).includes('returned'), 'returned also recorded');

    // ── bulkStatus fires + dedups across many orders ────────────────────────
    const b1 = await makeOrder({ accountId: acctId });
    const b2 = await makeOrder({ accountId: acctId });
    const already = await makeOrder({ accountId: acctId, trackedCourierEvents: ['cancelled'] });

    await call(admin.bulkStatus, {
      accountId: String(acctId), admin: { name: 'Admin' },
      body: { ids: [String(b1._id), String(b2._id), String(already._id)], status: 'cancelled' },
    });

    const rb1 = await Order.findById(b1._id).lean();
    const rb2 = await Order.findById(b2._id).lean();
    const rAlready = await Order.findById(already._id).lean();
    ok(rb1.status === 'cancelled' && rb1.trackedCourierEvents.includes('cancelled'), 'bulk: b1 cancelled + recorded');
    ok(rb2.trackedCourierEvents.includes('cancelled'), 'bulk: b2 recorded');
    ok(rAlready.trackedCourierEvents.filter((s) => s === 'cancelled').length === 1, 'bulk: pre-fired order not double-recorded');

    return t.result();
  },
};
