// SaaS Phase S6: platform super-admin sees all tenants, can suspend/activate,
// and suspension gates the tenant's public store + its own admins.
import { callController as call, makeT } from './_harness.mjs';
import { Account, Admin, Domain, Product, Order } from '../server/models/index.js';
import * as sa from '../server/controllers/superadmin.controller.js';
import { resolvePublicAccount, getAccountStatus, invalidateDomainCache } from '../server/services/domain.service.js';

function runMw(mw, req) {
  return new Promise((resolve) => { mw(req, {}, () => resolve(req)); });
}

export default {
  name: 'SaaS S6: super-admin accounts + suspension gating',
  seed: false,
  async fn() {
    const t = makeT('saas-superadmin');
    const { ok } = t;
    invalidateDomainCache();

    const A = await Account.create({ name: 'Acme', slug: 'acme6', status: 'active' });
    const B = await Account.create({ name: 'Beta', slug: 'beta6', status: 'active' });
    const ownerA = await Admin.create({ accountId: A._id, name: 'A Owner', email: 'a6@x.com', passwordHash: 'x', role: 'admin' });
    await Account.updateOne({ _id: A._id }, { ownerId: ownerA._id });
    await Domain.create({ host: 'acme6.test', accountId: A._id, type: 'subdomain', verified: true, isPrimary: true });
    const p = await Product.create({ accountId: A._id, name: 'P', slug: 'checkout', active: true });
    await Order.create({ orderNumber: 9001, accountId: A._id, productId: p._id, customer: { name: 'c', phone: '0171', address: 'd' }, offerId: p._id, unitPrice: 500, quantity: 1, deliveryCharge: 0, subtotal: 500, total: 500 });

    // List across tenants.
    let r = await call(sa.listAccounts);
    ok(r.body.accounts.length === 2, 'lists both accounts');
    const accA = r.body.accounts.find((a) => String(a._id) === String(A._id));
    ok(accA && accA.ownerEmail === 'a6@x.com' && accA.funnels === 1 && accA.orders === 1 && accA.revenue === 500, 'account A stats aggregated');

    // Detail.
    r = await call(sa.getAccount, { params: { id: String(A._id) } });
    ok(r.body.account && r.body.owner?.email === 'a6@x.com' && r.body.domains.length === 1 && r.body.counts.orders === 1, 'account detail');
    r = await call(sa.getAccount, { params: { id: String(B._id) } });
    ok(r.status !== 404 && r.body.counts.orders === 0, 'B detail, no orders');

    // Suspend A.
    r = await call(sa.setAccountStatus, { params: { id: String(A._id) }, body: { status: 'suspended' } });
    ok(r.body.ok && r.body.account.status === 'suspended', 'A suspended');
    ok((await getAccountStatus(A._id)) === 'suspended', 'account-status cache reflects suspension');

    // Public gating: A's host now flagged suspended.
    const req = await runMw(resolvePublicAccount, { headers: { host: 'acme6.test' } });
    ok(String(req.publicAccountId) === String(A._id) && req.publicAccountSuspended === true, 'public request to A flagged suspended');

    // Reactivate.
    r = await call(sa.setAccountStatus, { params: { id: String(A._id) }, body: { status: 'active' } });
    ok(r.body.account.status === 'active' && (await getAccountStatus(A._id)) === 'active', 'A reactivated');
    const req2 = await runMw(resolvePublicAccount, { headers: { host: 'acme6.test' } });
    ok(req2.publicAccountSuspended === false, 'public request no longer suspended');

    // Validation.
    r = await call(sa.setAccountStatus, { params: { id: String(A._id) }, body: { status: 'bogus' } });
    ok(r.status === 400, 'invalid status rejected');
    r = await call(sa.getAccount, { params: { id: String(new (await import('mongoose')).default.Types.ObjectId()) } });
    ok(r.status === 404, 'missing account → 404');

    return t.result();
  },
};
