// SaaS Phase S3b: public signup creates a fully-provisioned tenant.
import { callController as call, makeT } from './_harness.mjs';
import { Account, Admin, Domain, Product, Offer, FormField, DeliveryZone } from '../server/models/index.js';
import * as signup from '../server/controllers/signup.controller.js';
import { resolveAccountId, invalidateDomainCache } from '../server/services/domain.service.js';
import { config } from '../server/config/index.js';

export default {
  name: 'SaaS S3b: signup provisions a tenant',
  seed: false,
  async fn() {
    const t = makeT('saas-signup');
    const { ok } = t;
    invalidateDomainCache();

    // Availability check.
    let r = await call(signup.checkSubdomain, { query: { subdomain: 'Acme Shop!!' } });
    ok(r.body.available === true && r.body.slug === 'acme-shop', 'check: acme-shop available');
    r = await call(signup.checkSubdomain, { query: { subdomain: 'admin' } });
    ok(r.body.available === false && r.body.reason === 'reserved', 'check: reserved subdomain blocked');

    // Signup.
    r = await call(signup.signup, { body: { businessName: 'Acme Shop', email: 'Owner@Acme.com', password: 'secret12', subdomain: 'acme-shop' } });
    ok(r.status === 201 && r.body.token, 'signup → 201 with token');
    ok(r.body.subdomain === `acme-shop.${config.appDomain}`, 'subdomain host returned');

    const acc = await Account.findOne({ slug: 'acme-shop' }).lean();
    ok(!!acc && acc.status === 'active', 'account created + active');
    const owner = await Admin.findOne({ email: 'owner@acme.com' }).lean();
    ok(owner && owner.role === 'admin' && String(owner.accountId) === String(acc._id), 'owner admin scoped to account');
    ok(String(acc.ownerId) === String(owner._id), 'account.ownerId set');

    const dom = await Domain.findOne({ host: `acme-shop.${config.appDomain}` }).lean();
    ok(dom && dom.type === 'subdomain' && dom.verified && String(dom.accountId) === String(acc._id), 'subdomain domain registered + verified');

    // Starter funnel provisioned, all stamped to the account.
    ok(await Product.countDocuments({ accountId: acc._id, slug: 'checkout' }) === 1, 'starter product at /checkout');
    ok(await FormField.countDocuments({ accountId: acc._id }) === 3, '3 core fields');
    ok(await DeliveryZone.countDocuments({ accountId: acc._id }) === 2, '2 delivery zones');
    ok(await Offer.countDocuments({ accountId: acc._id }) === 1, '1 starter offer');

    // Host now resolves to the new account.
    invalidateDomainCache();
    ok(String(await resolveAccountId(`acme-shop.${config.appDomain}`)) === String(acc._id), 'host resolves to the new account');

    // Duplicate email rejected.
    r = await call(signup.signup, { body: { businessName: 'Other', email: 'owner@acme.com', password: 'secret12' } });
    ok(r.status === 400, 'duplicate email rejected');

    // Same subdomain → suffixed.
    r = await call(signup.signup, { body: { businessName: 'Acme Two', email: 'two@acme.com', password: 'secret12', subdomain: 'acme-shop' } });
    ok(r.body.account.slug === 'acme-shop-2', 'duplicate subdomain → acme-shop-2');

    return t.result();
  },
};
