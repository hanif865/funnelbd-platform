// Per-funnel Dashboard / Orders / Incomplete + per-funnel DailyStat (Phase 4c).
import { callController as call, makeT } from './_harness.mjs';
import { Product, Offer, DeliveryZone, DailyStat, IncompleteOrder } from '../server/models/index.js';
import * as funnel from '../server/controllers/funnel.controller.js';
import * as dash from '../server/controllers/dashboard.controller.js';
import * as admin from '../server/controllers/admin.controller.js';
import * as incomplete from '../server/controllers/incomplete.controller.js';
import { createOrder } from '../server/services/order.service.js';

async function offerZone(pid) {
  const or = { active: true, $or: [{ productId: pid }, { productId: null }] };
  const o = await Offer.findOne(or).lean();
  const z = await DeliveryZone.findOne(or).lean();
  return { offerId: String(o._id), zoneId: String(z._id) };
}

export default {
  name: 'Dashboard/Orders/Incomplete: per-funnel scoping',
  seed: true,
  async fn() {
    const t = makeT('dashboard');
    const { ok } = t;

    const def = await Product.findOne().sort({ createdAt: 1 }).lean();
    const f2 = (await call(funnel.createFunnel, { body: { name: 'Belt Two' } })).body.funnel;
    const d1 = await offerZone(def._id);
    const d2 = await offerZone(f2._id);
    await Offer.updateOne({ _id: d2.offerId }, { $set: { price: 500 } });

    const base = { name: 'Test', address: 'Dhaka', size: 'M', color: 'Black' };
    const mk = (pid, phone) => {
      const d = pid === String(def._id) ? d1 : d2;
      return createOrder({ offerId: d.offerId, quantity: 1, deliveryZoneId: d.zoneId, fields: { ...base, phone } }, { skipDuplicateCheck: true });
    };
    await mk(String(def._id), '01710000001');
    await mk(String(def._id), '01710000002');
    await mk(String(f2._id), '01720000003');

    // DailyStat per-funnel
    await DailyStat.track(true, def._id);
    await DailyStat.track(false, def._id);
    await DailyStat.track(true, f2._id);
    await DailyStat.recordEvent('call', def._id);
    await DailyStat.recordEvent('whatsapp', f2._id);
    ok(await DailyStat.countDocuments() === 2, 'one DailyStat row per funnel');

    // overall
    let r = await call(dash.getDashboard, { query: {} });
    ok(r.body.cards.today.orders === 3, 'overall today orders = 3');
    ok(r.body.todayDetail.visitors === 2 && r.body.todayDetail.visits === 3, 'overall visitors/visits summed');
    ok(r.body.todayDetail.calls === 1 && r.body.todayDetail.whatsapp === 1, 'overall clicks summed');

    // default funnel
    r = await call(dash.getDashboard, { query: { funnel: String(def._id) } });
    ok(r.body.cards.today.orders === 2, 'default today orders = 2');
    ok(r.body.todayDetail.visitors === 1 && r.body.todayDetail.whatsapp === 0, 'default scoped stats');

    // f2 funnel
    r = await call(dash.getDashboard, { query: { funnel: String(f2._id) } });
    const zCharge = (await DeliveryZone.findById(d2.zoneId)).charge;
    ok(r.body.cards.today.orders === 1 && r.body.cards.today.revenue === 500 + zCharge, 'f2 orders + revenue');
    ok(r.body.todayDetail.visitors === 1 && r.body.todayDetail.whatsapp === 1, 'f2 scoped stats');

    // Orders list filter
    r = await call(admin.listOrders, { query: { funnel: String(def._id) } });
    ok(r.body.orders.length === 2 && r.body.orders.every((o) => String(o.productId) === String(def._id)), 'orders filter = default');
    r = await call(admin.listOrders, { query: {} });
    ok(r.body.orders.length === 3, 'orders no filter = all');

    // Incomplete list filter
    await IncompleteOrder.create({ sessionId: 's1', productId: f2._id, phone: '01720000099', phoneValid: true, status: 'new', offerId: d2.offerId, data: { name: 'L' }, lastActivityAt: new Date() });
    await IncompleteOrder.create({ sessionId: 's2', productId: def._id, phone: '01710000088', phoneValid: true, status: 'new', offerId: d1.offerId, data: { name: 'L2' }, lastActivityAt: new Date() });
    r = await call(incomplete.listIncomplete, { query: { funnel: String(f2._id) } });
    ok(r.body.items.length === 1 && String(r.body.items[0].productId) === String(f2._id), 'incomplete filter = f2');
    r = await call(incomplete.listIncomplete, { query: {} });
    ok(r.body.items.length === 2, 'incomplete no filter = all');

    // convert offers scoped
    r = await call(incomplete.offersForConvert, { query: { funnel: String(f2._id) } });
    ok(r.body.offers.length === await Offer.countDocuments({ productId: f2._id, active: true }), 'convert offers scoped');

    return t.result();
  },
};
