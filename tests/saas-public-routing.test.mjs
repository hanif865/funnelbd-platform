// SaaS Phase S3a: the public path resolves the tenant from the Host header and
// never serves or accepts another account's catalog.
import { callController as call, makeT } from './_harness.mjs';
import { Account, Domain, Product, FormField, DeliveryZone, Offer, Order } from '../server/models/index.js';
import * as funnel from '../server/controllers/funnel.controller.js';
import { getCatalog, invalidateCatalogCache } from '../server/services/catalog.cache.js';
import { resolveAccountId, invalidateDomainCache } from '../server/services/domain.service.js';
import { createOrder, OrderValidationError } from '../server/services/order.service.js';

export default {
  name: 'SaaS S3a: host→account public routing + isolation',
  seed: false,
  async fn() {
    const t = makeT('saas-public-routing');
    const { ok } = t;
    invalidateCatalogCache();
    invalidateDomainCache();

    const A = await Account.create({ name: 'Acme', slug: 'acme4' });
    const B = await Account.create({ name: 'Beta', slug: 'beta4' });
    const fA = (await call(funnel.createFunnel, { accountId: A._id, body: { name: 'Belt A' } })).body.funnel;
    const fB = (await call(funnel.createFunnel, { accountId: B._id, body: { name: 'Belt B' } })).body.funnel;

    // Give A a usable checkout: priced offer, core fields, a zone.
    await Offer.updateOne({ productId: fA._id }, { $set: { price: 500 } });
    const offerA = await Offer.findOne({ productId: fA._id }).lean();
    const offerB = await Offer.findOne({ productId: fB._id }).lean();
    await FormField.insertMany([
      { accountId: A._id, productId: fA._id, name: 'name', label: 'Name', type: 'text', required: true, isCore: true, order: 1 },
      { accountId: A._id, productId: fA._id, name: 'phone', label: 'Phone', type: 'text', required: true, isCore: true, order: 2 },
      { accountId: A._id, productId: fA._id, name: 'address', label: 'Address', type: 'textarea', required: true, isCore: true, order: 3 },
    ]);
    const zoneA = await DeliveryZone.create({ accountId: A._id, productId: fA._id, name: 'Dhaka', charge: 60, active: true, isDefault: true });

    // Register domains.
    await Domain.create({ host: 'acme.test', accountId: A._id, type: 'subdomain', verified: true });
    await Domain.create({ host: 'beta.test', accountId: B._id, type: 'custom', verified: true });

    // Host resolution.
    ok(String(await resolveAccountId('acme.test')) === String(A._id), 'acme.test → A');
    ok(String(await resolveAccountId('beta.test:443')) === String(B._id), 'beta.test (with port) → B');
    ok((await resolveAccountId('unknown.test')) === null, 'unknown host → null (ambiguous, 2 accounts)');

    // Catalog is account-scoped.
    let cat = await getCatalog(A._id, fA.slug);
    ok(cat.product && String(cat.product._id) === String(fA._id), 'getCatalog(A, slugA) → A funnel');
    cat = await getCatalog(B._id, fA.slug);
    ok(!cat.product, 'getCatalog(B, slugA) → nothing (B has no such slug)');
    cat = await getCatalog(A._id, null);
    ok(cat.product && String(cat.product.accountId) === String(A._id), 'getCatalog(A) default → A product');

    // A deactivated funnel must NOT be served (by slug or as default).
    await Product.updateOne({ _id: fA._id }, { $set: { active: false } });
    invalidateCatalogCache();
    cat = await getCatalog(A._id, fA.slug);
    ok(!cat.product, 'deactivated funnel is not served by slug');
    await Product.updateOne({ _id: fA._id }, { $set: { active: true } });
    invalidateCatalogCache();

    // Valid checkout on A.
    const order = await createOrder(
      { offerId: String(offerA._id), quantity: 1, deliveryZoneId: String(zoneA._id), fields: { name: 'X', phone: '01712345678', address: 'Dhaka' } },
      { accountId: A._id, skipDuplicateCheck: true }
    );
    ok(order && String(order.accountId) === String(A._id) && order.total === 560, 'A checkout succeeds, stamped to A, total 560');

    // Cross-account offer injection: A's host, B's offer → rejected.
    let threw = false;
    try {
      await createOrder(
        { offerId: String(offerB._id), quantity: 1, deliveryZoneId: String(zoneA._id), fields: { name: 'X', phone: '01712345679', address: 'Dhaka' } },
        { accountId: A._id, skipDuplicateCheck: true }
      );
    } catch (e) { threw = e instanceof OrderValidationError; }
    ok(threw, 'checkout on A cannot use B\'s offer (rejected)');
    ok(await Order.countDocuments({ accountId: B._id }) === 0, 'no order leaked to B');

    // Sole-account fallback: with one account, an unknown host resolves to it.
    await Account.deleteOne({ _id: B._id });
    invalidateDomainCache();
    ok(String(await resolveAccountId('whatever.test')) === String(A._id), 'single account → unknown host falls back to it');

    return t.result();
  },
};
