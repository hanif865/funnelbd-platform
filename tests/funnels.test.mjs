// Multi-funnel CRUD + per-funnel catalog scoping (Phase 4 / 4a).
import { callController as call, makeT } from './_harness.mjs';
import { Product, Offer, FormField, DeliveryZone } from '../server/models/index.js';
import * as funnel from '../server/controllers/funnel.controller.js';
import * as catalog from '../server/controllers/catalog.controller.js';
import { getCatalog, invalidateCatalogCache } from '../server/services/catalog.cache.js';

export default {
  name: 'Funnels: CRUD + catalog scoping',
  seed: true,
  async fn() {
    const t = makeT('funnels');
    const { ok } = t;

    const def = await Product.findOne().sort({ createdAt: 1 }).lean();
    ok(!!def, 'default funnel exists');
    const baseFields = await FormField.countDocuments();

    // listFunnels
    let r = await call(funnel.listFunnels);
    ok(r.body.funnels.length === 1 && r.body.funnels[0].isDefault, 'one funnel, marked default');

    // create (seeds checkout from default)
    r = await call(funnel.createFunnel, { body: { name: 'Magnetic Belt', slug: 'Magnetic Belt!!' } });
    ok(r.status === 201 && r.body.funnel.slug === 'magnetic-belt', 'create slugifies');
    const f2 = r.body.funnel;
    ok(await FormField.countDocuments({ productId: f2._id }) === baseFields, 'new funnel seeded fields from default');
    ok(await DeliveryZone.countDocuments({ productId: f2._id }) > 0, 'new funnel seeded zones');
    ok(await Offer.countDocuments({ productId: f2._id }) === 1, 'new funnel has one starter offer');

    // slug collision
    r = await call(funnel.createFunnel, { body: { name: 'Magnetic Belt' } });
    ok(r.body.funnel.slug === 'magnetic-belt-2', 'slug collision suffixes');
    const f3 = r.body.funnel;

    // offers scoped
    r = await call(catalog.createOffer, { query: { funnel: String(f2._id) }, body: { title: '2 pcs', price: 1099, quantity: 2, isDefault: true } });
    ok(r.status === 201, 'offer created on f2');
    r = await call(catalog.listOffers, { query: { funnel: String(f2._id) } });
    ok(r.body.offers.length === 2, 'f2 lists 2 offers');
    r = await call(catalog.listOffers, { query: { funnel: String(f3._id) } });
    ok(r.body.offers.length === 1, 'f3 isolated (1 offer)');
    const defDefault = await Offer.findOne({ productId: def._id, isDefault: true });
    ok(!!defDefault, 'default-offer flag is per-funnel (not cleared cross-funnel)');

    // fields scoped + unique-within-funnel
    r = await call(catalog.createField, { query: { funnel: String(f2._id) }, body: { label: 'Gift', name: 'giftwrap', type: 'checkbox' } });
    ok(r.status === 201, 'unique field added to f2');
    r = await call(catalog.listFields, { query: { funnel: String(f3._id) } });
    ok(!r.body.fields.some((f) => f.name === 'giftwrap'), 'f3 does not see f2 field');
    r = await call(catalog.createField, { query: { funnel: String(f3._id) }, body: { label: 'Gift', name: 'giftwrap', type: 'checkbox' } });
    ok(r.status === 201, 'same field name allowed in another funnel');

    // clone (deep copy incl offers)
    r = await call(funnel.cloneFunnel, { params: { id: String(f2._id) }, body: {} });
    ok(r.status === 201 && await Offer.countDocuments({ productId: r.body.funnel._id }) === 2, 'clone copies offers');

    // landing still renders per slug
    invalidateCatalogCache();
    const cat = await getCatalog(null, 'magnetic-belt');
    ok(cat.product?.slug === 'magnetic-belt' && cat.offers.length === 2, 'landing renders f2');
    const cat0 = await getCatalog(null, null);
    ok(String(cat0.product._id) === String(def._id), 'default landing unchanged');

    // landing template (visual theme) persists; unknown keys are ignored.
    r = await call(catalog.updateProduct, { query: { funnel: String(f2._id) }, body: { template: 'ocean' } });
    ok(r.body.product.template === 'ocean', 'valid template saved');
    r = await call(catalog.updateProduct, { query: { funnel: String(f2._id) }, body: { template: 'bogus-theme' } });
    ok(r.body.product.template === 'ocean', 'unknown template ignored (kept ocean)');
    r = await call(catalog.updateProduct, { query: { funnel: String(f2._id) }, body: { layout: 'spotlight' } });
    ok(r.body.product.layout === 'spotlight', 'valid layout saved');
    r = await call(catalog.updateProduct, { query: { funnel: String(f2._id) }, body: { layout: 'nope' } });
    ok(r.body.product.layout === 'spotlight', 'unknown layout ignored (kept spotlight)');

    // delete guards
    r = await call(funnel.deleteFunnel, { params: { id: String(f3._id) } });
    ok(r.status === 200 && !(await Product.findById(f3._id)), 'f3 deleted');
    ok(await Offer.countDocuments({ productId: f3._id }) === 0, 'f3 offers cascade-deleted');
    r = await call(funnel.deleteFunnel, { params: { id: String(def._id) } });
    ok(r.status === 400, 'cannot delete the default funnel');

    return t.result();
  },
};
