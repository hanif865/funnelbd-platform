// SaaS Phase S2b: orders, incomplete orders and the dashboard are isolated per
// account. Orders are created directly (the public checkout path is S2d).
import { callController as call, makeT, mongoose } from './_harness.mjs';
import { Account, Order, IncompleteOrder } from '../server/models/index.js';
import * as admin from '../server/controllers/admin.controller.js';
import * as incomplete from '../server/controllers/incomplete.controller.js';
import * as dash from '../server/controllers/dashboard.controller.js';

let seq = 5000;
function mkOrder(accountId, phone, total = 500, status = 'new') {
  return Order.create({
    orderNumber: ++seq,
    accountId,
    customer: { name: 'C', phone, address: 'Dhaka' },
    offerId: new mongoose.Types.ObjectId(),
    unitPrice: total, quantity: 1,
    deliveryCharge: 0, subtotal: total, total,
    status,
  });
}

export default {
  name: 'SaaS S2b: order / incomplete / dashboard isolation',
  seed: false,
  async fn() {
    const t = makeT('saas-order-isolation');
    const { ok } = t;

    const A = await Account.create({ name: 'Acme', slug: 'acme2' });
    const B = await Account.create({ name: 'Beta', slug: 'beta2' });
    const asA = (e = {}) => ({ accountId: A._id, admin: { name: 'a' }, ...e });
    const asB = (e = {}) => ({ accountId: B._id, admin: { name: 'b' }, ...e });

    const oA1 = await mkOrder(A._id, '01710000001', 500);
    await mkOrder(A._id, '01710000002', 300);
    const oB1 = await mkOrder(B._id, '01720000001', 900);

    // listOrders is scoped.
    let r = await call(admin.listOrders, asA());
    ok(r.body.orders.length === 2 && r.body.orders.every((o) => String(o.accountId) === String(A._id)), 'A lists only its 2 orders');
    r = await call(admin.listOrders, asB());
    ok(r.body.orders.length === 1 && String(r.body.orders[0].accountId) === String(B._id), 'B lists only its 1 order');

    // getOrder cross-account → 404.
    r = await call(admin.getOrder, asB({ params: { id: String(oA1._id) } }));
    ok(r.status === 404, 'B cannot read A\'s order');
    r = await call(admin.getOrder, asA({ params: { id: String(oA1._id) } }));
    ok(r.status === 200 && String(r.body.order._id) === String(oA1._id), 'A reads its own order');

    // status/notes cross-account → 404.
    r = await call(admin.updateStatus, asB({ params: { id: String(oA1._id) }, body: { status: 'confirmed' } }));
    ok(r.status === 404, 'B cannot change status of A\'s order');
    r = await call(admin.addNote, asB({ params: { id: String(oA1._id) }, body: { text: 'x' } }));
    ok(r.status === 404, 'B cannot note A\'s order');

    // bulk status only touches own account.
    r = await call(admin.bulkStatus, asB({ body: { ids: [String(oA1._id), String(oB1._id)], status: 'confirmed' } }));
    ok(r.body.updated === 1, 'bulk status skips the other account\'s order');
    ok((await Order.findById(oA1._id)).status === 'new', 'A\'s order untouched by B\'s bulk action');

    // dashboard scoped.
    r = await call(dash.getDashboard, asA());
    ok(r.body.cards.today.orders === 2 && r.body.cards.today.revenue === 800, 'A dashboard = its 2 orders / 800');
    r = await call(dash.getDashboard, asB());
    ok(r.body.cards.today.orders === 1 && r.body.cards.today.revenue === 900, 'B dashboard = its 1 order / 900');

    // incomplete scoped.
    await IncompleteOrder.create({ sessionId: 'a1', accountId: A._id, phone: '01710000003', phoneValid: true, status: 'new', lastActivityAt: new Date() });
    await IncompleteOrder.create({ sessionId: 'b1', accountId: B._id, phone: '01720000003', phoneValid: true, status: 'new', lastActivityAt: new Date() });
    r = await call(incomplete.listIncomplete, asA());
    ok(r.body.items.length === 1 && String(r.body.items[0].accountId) === String(A._id), 'A lists only its incomplete lead');
    r = await call(incomplete.updateIncompleteStatus, asB({ params: { id: String((await IncompleteOrder.findOne({ accountId: A._id }))._id) }, body: { status: 'dead' } }));
    ok(r.status === 404, 'B cannot change A\'s incomplete lead');

    return t.result();
  },
};
