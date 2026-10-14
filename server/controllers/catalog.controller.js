import mongoose from 'mongoose';
import {
  Product,
  Offer,
  FormField,
  DeliveryZone,
  FIELD_TYPES,
} from '../models/index.js';
import { getDefaultProductId } from '../services/catalog.cache.js';
import { isTemplate } from '../config/templates.js';

// The tenant this request belongs to (set by auth middleware), as an ObjectId.
function acct(req) {
  const id = req.accountId;
  return id && mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
}

// Which funnel these catalog edits apply to. ?funnel=<id> targets a funnel that
// belongs to this account; otherwise the account's default (first active) funnel.
async function targetFunnel(req) {
  const accountId = acct(req);
  const q = req.query.funnel;
  if (q && mongoose.isValidObjectId(q) && (await Product.exists({ _id: q, accountId }))) return q;
  return getDefaultProductId(accountId);
}

// Form fields / delivery zones match the targeted funnel within this account.
// The account's default funnel also owns legacy null-productId docs (pre-funnel
// migration), so include those.
async function scopeFilter(req) {
  const accountId = acct(req);
  const [pid, defPid] = await Promise.all([targetFunnel(req), getDefaultProductId(accountId)]);
  const isDefault = defPid && String(defPid) === String(pid);
  const base = isDefault ? { $or: [{ productId: pid }, { productId: null }] } : { productId: pid };
  return { pid, accountId, match: { ...base, accountId }, isDefault };
}

// ─── Product ────────────────────────────────────────────────
/** GET /api/admin/product → the targeted funnel's product (default funnel). */
export async function getProduct(req, res, next) {
  try {
    const accountId = acct(req);
    const pid = await targetFunnel(req);
    const product = pid
      ? await Product.findOne({ _id: pid, accountId })
      : await Product.findOne({ accountId }).sort({ createdAt: 1 });
    res.json({ product });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/product → update the targeted funnel's product content. */
export async function updateProduct(req, res, next) {
  try {
    const b = req.body || {};
    const accountId = acct(req);
    const pid = await targetFunnel(req);
    const product = pid
      ? await Product.findOne({ _id: pid, accountId })
      : await Product.findOne({ accountId }).sort({ createdAt: 1 });
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    if (b.name !== undefined) product.name = String(b.name).trim();
    if (b.description !== undefined) product.description = b.description;
    if (Array.isArray(b.images)) product.images = b.images;
    if (b.active !== undefined) product.active = !!b.active;
    if (b.template !== undefined && isTemplate(b.template)) product.template = b.template;
    if (b.content && typeof b.content === 'object') {
      product.content = { ...product.content?.toObject?.() ?? product.content, ...b.content };
    }
    await product.save();
    res.json({ ok: true, product });
  } catch (err) {
    next(err);
  }
}

// ─── Offers ─────────────────────────────────────────────────
export async function listOffers(req, res, next) {
  try {
    const accountId = acct(req);
    const pid = await targetFunnel(req);
    const where = pid ? { productId: pid, accountId } : { accountId };
    res.json({ offers: await Offer.find(where).sort({ order: 1 }).lean() });
  } catch (err) {
    next(err);
  }
}

export async function createOffer(req, res, next) {
  try {
    const b = req.body || {};
    const accountId = acct(req);
    const pid = await targetFunnel(req);
    const last = await Offer.findOne({ productId: pid, accountId }).sort({ order: -1 }).select('order').lean();
    const offer = await Offer.create({
      accountId,
      productId: pid,
      title: String(b.title || '').trim(),
      sku: String(b.sku || '').trim(),
      price: Number(b.price) || 0,
      comparePrice: b.comparePrice != null ? Number(b.comparePrice) : null,
      quantity: Number(b.quantity) || 1,
      image: b.image || '',
      badge: b.badge || '',
      isDefault: !!b.isDefault,
      active: b.active !== false,
      order: (last?.order || 0) + 1,
    });
    // "Default offer" is per funnel — only clear the flag on siblings.
    if (offer.isDefault) {
      await Offer.updateMany({ _id: { $ne: offer._id }, productId: offer.productId, accountId }, { isDefault: false });
    }
    res.status(201).json({ ok: true, offer });
  } catch (err) {
    next(err);
  }
}

export async function updateOffer(req, res, next) {
  try {
    const b = req.body || {};
    const accountId = acct(req);
    const offer = await Offer.findOne({ _id: req.params.id, accountId });
    if (!offer) return res.status(404).json({ error: 'Offer not found.' });
    ['title', 'image', 'badge', 'sku'].forEach((k) => { if (b[k] !== undefined) offer[k] = b[k]; });
    if (b.price !== undefined) offer.price = Number(b.price) || 0;
    if (b.comparePrice !== undefined) offer.comparePrice = b.comparePrice != null && b.comparePrice !== '' ? Number(b.comparePrice) : null;
    if (b.quantity !== undefined) offer.quantity = Number(b.quantity) || 1;
    if (b.active !== undefined) offer.active = !!b.active;
    if (b.isDefault !== undefined) offer.isDefault = !!b.isDefault;
    await offer.save();
    if (offer.isDefault) {
      await Offer.updateMany({ _id: { $ne: offer._id }, productId: offer.productId, accountId }, { isDefault: false });
    }
    res.json({ ok: true, offer });
  } catch (err) {
    next(err);
  }
}

export async function deleteOffer(req, res, next) {
  try {
    const accountId = acct(req);
    const offer = await Offer.findOne({ _id: req.params.id, accountId });
    if (!offer) return res.status(404).json({ error: 'Offer not found.' });
    const count = await Offer.countDocuments({ productId: offer.productId, accountId });
    if (count <= 1) return res.status(400).json({ error: 'At least one offer is required.' });
    await offer.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ─── Form fields ────────────────────────────────────────────
export async function listFields(req, res, next) {
  try {
    const { match } = await scopeFilter(req);
    res.json({ fields: await FormField.find(match).sort({ order: 1 }).lean(), types: FIELD_TYPES });
  } catch (err) {
    next(err);
  }
}

export async function createField(req, res, next) {
  try {
    const b = req.body || {};
    const { pid, accountId, match } = await scopeFilter(req);
    const name = String(b.name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!name) return res.status(400).json({ error: 'Enter a field name (English).' });
    if (['name', 'phone', 'address'].includes(name)) {
      return res.status(400).json({ error: 'This name is reserved for a core field.' });
    }
    // Name must be unique within this funnel.
    if (await FormField.findOne({ ...match, name })) return res.status(400).json({ error: 'A field with this name already exists.' });
    if (!FIELD_TYPES.includes(b.type)) return res.status(400).json({ error: 'Invalid type.' });

    const last = await FormField.findOne({ productId: pid, accountId }).sort({ order: -1 }).select('order').lean();
    const field = await FormField.create({
      accountId,
      productId: pid,
      label: String(b.label || '').trim(),
      name,
      type: b.type,
      options: Array.isArray(b.options) ? b.options.filter(Boolean) : [],
      placeholder: b.placeholder || '',
      required: !!b.required,
      active: b.active !== false,
      order: (last?.order || 0) + 1,
      isCore: false,
    });
    res.status(201).json({ ok: true, field });
  } catch (err) {
    next(err);
  }
}

export async function updateField(req, res, next) {
  try {
    const b = req.body || {};
    const field = await FormField.findOne({ _id: req.params.id, accountId: acct(req) });
    if (!field) return res.status(404).json({ error: 'Field not found.' });

    // Core fields: only label + placeholder are editable (name/type/required
    // stay fixed because order + tracking depend on them).
    if (b.label !== undefined) field.label = String(b.label).trim();
    if (b.placeholder !== undefined) field.placeholder = b.placeholder;
    if (!field.isCore) {
      if (b.type !== undefined && FIELD_TYPES.includes(b.type)) field.type = b.type;
      if (Array.isArray(b.options)) field.options = b.options.filter(Boolean);
      if (b.required !== undefined) field.required = !!b.required;
      if (b.active !== undefined) field.active = !!b.active;
    }
    await field.save();
    res.json({ ok: true, field });
  } catch (err) {
    next(err);
  }
}

export async function deleteField(req, res, next) {
  try {
    const field = await FormField.findOne({ _id: req.params.id, accountId: acct(req) });
    if (!field) return res.status(404).json({ error: 'Field not found.' });
    if (field.isCore) return res.status(400).json({ error: 'Core fields cannot be deleted.' });
    await field.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/fields/reorder → body { ids: [...] } sets order. */
export async function reorderFields(req, res, next) {
  try {
    const accountId = acct(req);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    await Promise.all(ids.map((id, i) => FormField.updateOne({ _id: id, accountId }, { order: i + 1 })));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ─── Delivery zones ─────────────────────────────────────────
export async function listZones(req, res, next) {
  try {
    const { match } = await scopeFilter(req);
    res.json({ zones: await DeliveryZone.find(match).sort({ order: 1 }).lean() });
  } catch (err) {
    next(err);
  }
}

export async function createZone(req, res, next) {
  try {
    const b = req.body || {};
    const accountId = acct(req);
    const pid = await targetFunnel(req);
    const last = await DeliveryZone.findOne({ productId: pid, accountId }).sort({ order: -1 }).select('order').lean();
    const zone = await DeliveryZone.create({
      accountId,
      productId: pid,
      name: String(b.name || '').trim(),
      charge: Number(b.charge) || 0,
      isDefault: !!b.isDefault,
      active: b.active !== false,
      order: (last?.order || 0) + 1,
    });
    if (zone.isDefault) {
      await DeliveryZone.updateMany({ _id: { $ne: zone._id }, productId: zone.productId, accountId }, { isDefault: false });
    }
    res.status(201).json({ ok: true, zone });
  } catch (err) {
    next(err);
  }
}

export async function updateZone(req, res, next) {
  try {
    const b = req.body || {};
    const accountId = acct(req);
    const zone = await DeliveryZone.findOne({ _id: req.params.id, accountId });
    if (!zone) return res.status(404).json({ error: 'Zone not found.' });
    if (b.name !== undefined) zone.name = String(b.name).trim();
    if (b.charge !== undefined) zone.charge = Number(b.charge) || 0;
    if (b.active !== undefined) zone.active = !!b.active;
    if (b.isDefault !== undefined) zone.isDefault = !!b.isDefault;
    await zone.save();
    if (zone.isDefault) {
      await DeliveryZone.updateMany({ _id: { $ne: zone._id }, productId: zone.productId, accountId }, { isDefault: false });
    }
    res.json({ ok: true, zone });
  } catch (err) {
    next(err);
  }
}

export async function deleteZone(req, res, next) {
  try {
    const accountId = acct(req);
    const zone = await DeliveryZone.findOne({ _id: req.params.id, accountId });
    if (!zone) return res.status(404).json({ error: 'Zone not found.' });
    const count = await DeliveryZone.countDocuments({ productId: zone.productId, accountId });
    if (count <= 1) return res.status(400).json({ error: 'At least one zone is required.' });
    await zone.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
