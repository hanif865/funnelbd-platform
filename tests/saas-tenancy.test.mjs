// SaaS Phase S1: tenant groundwork — Account/Domain models + accountId stamping.
import { makeT } from './_harness.mjs';
import { Account, Domain, Admin, Product, Offer, Order, Setting } from '../server/models/index.js';
import { migrate } from '../server/scripts/saas-migrate.js';

export default {
  name: 'SaaS S1: tenant model + accountId migration',
  seed: true,
  async fn() {
    const t = makeT('saas-s1');
    const { ok } = t;

    // A superadmin to be lifted out of the account.
    await Admin.create({ name: 'Platform Owner', email: 'owner@platform.test', passwordHash: 'x', role: 'admin' });

    // Before: existing data has no accountId.
    ok(await Product.countDocuments({ accountId: null }) > 0, 'products start with null accountId');
    ok(await Account.countDocuments() === 0, 'no accounts yet');

    // Dry run writes nothing.
    let s = await migrate({ apply: false, host: 'funnel.example.com' });
    ok(s.counts.products > 0 && await Account.countDocuments() === 0, 'dry run stamps nothing');

    // Apply.
    s = await migrate({ apply: true, host: 'funnel.example.com', superadminEmail: 'owner@platform.test' });
    const acc = await Account.findOne().lean();
    ok(!!acc && s.accountId && String(s.accountId) === String(acc._id), 'Account #1 created');

    ok(await Product.countDocuments({ accountId: null }) === 0, 'all products stamped');
    ok(await Offer.countDocuments({ accountId: null }) === 0, 'all offers stamped');
    ok(await Order.countDocuments({ accountId: null }) === 0, 'all orders stamped (none or stamped)');
    ok(await Setting.countDocuments({ accountId: null }) === 0, 'all settings stamped');
    ok((await Product.find().lean()).every((p) => String(p.accountId) === String(acc._id)), 'products point to Account #1');

    // superadmin lifted out of the account.
    const su = await Admin.findOne({ email: 'owner@platform.test' }).lean();
    ok(su.role === 'superadmin' && su.accountId == null, 'superadmin promoted + account-less');
    // a normal account admin keeps accountId.
    const acctAdmins = await Admin.find({ role: 'admin' }).lean();
    ok(acctAdmins.length > 0 && acctAdmins.every((a) => String(a.accountId) === String(acc._id)), 'account admins scoped to Account #1');

    // Domain registered + account owner set.
    const dom = await Domain.findOne({ host: 'funnel.example.com' }).lean();
    ok(dom && String(dom.accountId) === String(acc._id) && dom.verified && dom.isPrimary, 'primary domain registered');
    const acc2 = await Account.findById(acc._id).lean();
    ok(!!acc2.ownerId, 'account owner assigned');

    // Idempotent re-run: no new account, nothing breaks.
    await migrate({ apply: true, host: 'funnel.example.com' });
    ok(await Account.countDocuments() === 1, 're-run is idempotent (still one account)');

    return t.result();
  },
};
