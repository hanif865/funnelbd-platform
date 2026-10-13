// SaaS Phase S2: two accounts must not see or touch each other's funnels,
// offers, fields or zones.
import { callController as call, makeT } from './_harness.mjs';
import { Account } from '../server/models/index.js';
import * as funnel from '../server/controllers/funnel.controller.js';
import * as catalog from '../server/controllers/catalog.controller.js';

export default {
  name: 'SaaS S2: account isolation (funnels + catalog)',
  seed: false,
  async fn() {
    const t = makeT('saas-isolation');
    const { ok } = t;

    const A = await Account.create({ name: 'Acme', slug: 'acme' });
    const B = await Account.create({ name: 'Beta', slug: 'beta' });
    const asA = (extra = {}) => ({ accountId: A._id, ...extra });
    const asB = (extra = {}) => ({ accountId: B._id, ...extra });

    // Each account creates a funnel.
    const fA = (await call(funnel.createFunnel, asA({ body: { name: 'A Funnel' } }))).body.funnel;
    const fB = (await call(funnel.createFunnel, asB({ body: { name: 'B Funnel' } }))).body.funnel;
    ok(fA && fB && String(fA._id) !== String(fB._id), 'both funnels created');

    // Listing is scoped.
    let r = await call(funnel.listFunnels, asA());
    ok(r.body.funnels.length === 1 && String(r.body.funnels[0]._id) === String(fA._id), 'A sees only its funnel');
    r = await call(funnel.listFunnels, asB());
    ok(r.body.funnels.length === 1 && String(r.body.funnels[0]._id) === String(fB._id), 'B sees only its funnel');

    // Same slug can exist in both accounts.
    ok(fA.slug === 'a-funnel' && fB.slug === 'b-funnel', 'slugs generated per account');
    const dup = (await call(funnel.createFunnel, asB({ body: { name: 'A Funnel' } }))).body.funnel;
    ok(dup.slug === 'a-funnel', 'B can reuse a slug A already uses (per-account uniqueness)');

    // Cross-account mutation is blocked (404, treated as not found).
    r = await call(funnel.updateFunnel, asB({ params: { id: String(fA._id) }, body: { name: 'hijack' } }));
    ok(r.status === 404, 'B cannot update A\'s funnel');
    r = await call(funnel.deleteFunnel, asB({ params: { id: String(fA._id) } }));
    ok(r.status === 404, 'B cannot delete A\'s funnel');
    r = await call(funnel.cloneFunnel, asB({ params: { id: String(fA._id) } }));
    ok(r.status === 404, 'B cannot clone A\'s funnel');

    // Offers scoped: create under A, invisible to B.
    r = await call(catalog.createOffer, asA({ query: { funnel: String(fA._id) }, body: { title: 'A Offer', price: 100 } }));
    ok(r.status === 201 && String(r.body.offer.accountId) === String(A._id), 'offer stamped with A');
    const offerA = r.body.offer;
    r = await call(catalog.listOffers, asA({ query: { funnel: String(fA._id) } }));
    ok(r.body.offers.length >= 1 && r.body.offers.some((o) => String(o._id) === String(offerA._id)), 'A sees its own offer');
    // B targeting A's funnel falls back to B's own default funnel — never A's data.
    r = await call(catalog.listOffers, asB({ query: { funnel: String(fA._id) } }));
    ok(r.body.offers.every((o) => String(o.accountId) === String(B._id)), 'B never sees A\'s offers (falls back to its own)');

    // Cross-account offer edit/delete blocked.
    r = await call(catalog.updateOffer, asB({ params: { id: String(offerA._id) }, body: { price: 1 } }));
    ok(r.status === 404, 'B cannot edit A\'s offer');

    // Fields scoped.
    r = await call(catalog.createField, asA({ query: { funnel: String(fA._id) }, body: { label: 'Gift', name: 'gift', type: 'checkbox' } }));
    ok(r.status === 201, 'A adds a field');
    r = await call(catalog.listFields, asB({ query: { funnel: String(fA._id) } }));
    ok(!r.body.fields.some((f) => f.name === 'gift'), 'B does not see A\'s field');

    // getProduct cross-account → null.
    r = await call(catalog.getProduct, asB({ query: { funnel: String(fA._id) } }));
    ok(!r.body.product || String(r.body.product.accountId) !== String(A._id), 'B cannot read A\'s product via ?funnel');

    return t.result();
  },
};
