import mongoose from 'mongoose';
import { Product, Offer, FormField, DeliveryZone, Order } from '../models/index.js';
import { getDefaultProductId } from '../services/catalog.cache.js';

// The tenant this request belongs to (set by auth middleware), as an ObjectId so
// it matches in find(), create() and aggregate() alike (aggregate $match does
// not auto-cast). All funnel reads/writes are scoped to it.
function acct(req) {
  const id = req.accountId;
  return id && mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
}

// ─── slug helpers ───────────────────────────────────────────
function slugify(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** A slug unused by another funnel in the same account (append -2, -3, …). */
async function uniqueSlug(base, accountId, excludeId = null) {
  const root = base || 'funnel';
  let slug = root;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const where = { slug, accountId };
    if (excludeId) where._id = { $ne: excludeId };
    const clash = await Product.findOne(where).select('_id').lean();
    if (!clash) return slug;
    n += 1;
    slug = `${root}-${n}`;
  }
}

function stripMeta(doc) {
  const { _id, createdAt, updatedAt, __v, ...rest } = doc;
  return rest;
}

/**
 * Seed a new funnel's checkout from an existing one so it works immediately:
 * copy its form fields and delivery zones (and optionally its offers), stamped
 * with the new funnel's id + account. `fromPid` null reads the account's
 * legacy/shared defaults.
 */
async function copyCatalog(fromPid, toPid, accountId, { includeOffers = false } = {}) {
  const or = fromPid ? { $or: [{ productId: fromPid }, { productId: null }] } : { productId: null };
  const scoped = { ...or, accountId };
  const [fields, zones, offers] = await Promise.all([
    FormField.find(scoped).sort({ order: 1 }).lean(),
    DeliveryZone.find(scoped).sort({ order: 1 }).lean(),
    includeOffers && fromPid ? Offer.find({ productId: fromPid, accountId }).sort({ order: 1 }).lean() : Promise.resolve([]),
  ]);
  const stamp = (d) => ({ ...stripMeta(d), productId: toPid, accountId });
  if (fields.length) await FormField.insertMany(fields.map(stamp));
  if (zones.length) await DeliveryZone.insertMany(zones.map(stamp));
  if (offers.length) await Offer.insertMany(offers.map(stamp));
}

/** Guarantee a funnel has at least one offer (the catalog needs one to price). */
async function ensureOffer(pid, accountId, title) {
  const n = await Offer.countDocuments({ productId: pid });
  if (!n) {
    await Offer.create({ productId: pid, accountId, title: title || 'অফার', price: 0, quantity: 1, isDefault: true, active: true, order: 1 });
  }
}

// ─── Handlers ───────────────────────────────────────────────

/** GET /api/admin/funnels → this account's funnels with offer/order counts. */
export async function listFunnels(req, res, next) {
  try {
    const accountId = acct(req);
    const match = { accountId };
    const [products, offerCounts, orderCounts, defPid] = await Promise.all([
      Product.find(match).sort({ createdAt: 1 }).lean(),
      Offer.aggregate([{ $match: match }, { $group: { _id: '$productId', n: { $sum: 1 } } }]),
      Order.aggregate([{ $match: match }, { $group: { _id: '$productId', n: { $sum: 1 } } }]),
      getDefaultProductId(accountId),
    ]);
    const oMap = Object.fromEntries(offerCounts.map((x) => [String(x._id), x.n]));
    const ordMap = Object.fromEntries(orderCounts.map((x) => [String(x._id), x.n]));
    const def = defPid ? String(defPid) : null;
    res.json({
      funnels: products.map((p) => ({
        _id: p._id,
        name: p.name,
        slug: p.slug,
        active: p.active,
        images: p.images || [],
        createdAt: p.createdAt,
        offerCount: oMap[String(p._id)] || 0,
        orderCount: ordMap[String(p._id)] || 0,
        isDefault: def === String(p._id),
      })),
      defaultId: def,
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/funnels → create a funnel, seeding checkout from the default. */
export async function createFunnel(req, res, next) {
  try {
    const b = req.body || {};
    const accountId = acct(req);
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Enter a funnel name.' });
    const slug = await uniqueSlug(slugify(b.slug || name), accountId);

    const product = await Product.create({ accountId, name, slug, active: b.active !== false });

    // Seed fields + zones from this account's default funnel so checkout works.
    const defPid = await getDefaultProductId(accountId);
    if (defPid && String(defPid) !== String(product._id)) {
      await copyCatalog(defPid, product._id, accountId, { includeOffers: false });
    }
    await ensureOffer(product._id, accountId, name);

    res.status(201).json({ ok: true, funnel: product });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/funnels/:id/clone → deep-copy a funnel (content + catalog). */
export async function cloneFunnel(req, res, next) {
  try {
    const accountId = acct(req);
    const src = await Product.findOne({ _id: req.params.id, accountId }).lean();
    if (!src) return res.status(404).json({ error: 'Funnel not found.' });

    const b = req.body || {};
    const name = String(b.name || `${src.name} (কপি)`).trim();
    const slug = await uniqueSlug(slugify(b.slug || name), accountId);

    const base = stripMeta(src);
    delete base.slug;
    delete base.name;
    const product = await Product.create({ ...base, accountId, name, slug, active: b.active !== false });

    await copyCatalog(src._id, product._id, accountId, { includeOffers: true });
    await ensureOffer(product._id, accountId, name);

    res.status(201).json({ ok: true, funnel: product });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/funnels/:id → rename / re-slug / activate a funnel. */
export async function updateFunnel(req, res, next) {
  try {
    const accountId = acct(req);
    const p = await Product.findOne({ _id: req.params.id, accountId });
    if (!p) return res.status(404).json({ error: 'Funnel not found.' });
    const b = req.body || {};
    if (b.name !== undefined) p.name = String(b.name).trim();
    if (b.slug !== undefined && String(b.slug).trim()) {
      p.slug = await uniqueSlug(slugify(b.slug), accountId, p._id);
    }
    if (b.active !== undefined) p.active = !!b.active;
    await p.save();
    res.json({ ok: true, funnel: p });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/admin/funnels/:id → remove a funnel and its catalog (no orders). */
export async function deleteFunnel(req, res, next) {
  try {
    const accountId = acct(req);
    const id = req.params.id;
    const target = await Product.findOne({ _id: id, accountId }).select('_id').lean();
    if (!target) return res.status(404).json({ error: 'Funnel not found.' });

    const total = await Product.countDocuments({ accountId });
    if (total <= 1) return res.status(400).json({ error: 'At least one funnel is required.' });

    // The default funnel (first active) backs legacy/null fallbacks — keep it.
    const defPid = await getDefaultProductId(accountId);
    if (defPid && String(defPid) === String(id)) {
      return res.status(400).json({ error: 'The default funnel cannot be deleted. Make another funnel the default first.' });
    }

    const orderCount = await Order.countDocuments({ productId: id });
    if (orderCount > 0) {
      return res.status(400).json({ error: `This funnel has ${orderCount} order(s) — deactivate it instead of deleting.` });
    }

    await Promise.all([
      Offer.deleteMany({ productId: id }),
      FormField.deleteMany({ productId: id }),
      DeliveryZone.deleteMany({ productId: id }),
    ]);
    await Product.deleteOne({ _id: id, accountId });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export default { listFunnels, createFunnel, cloneFunnel, updateFunnel, deleteFunnel };
