import {
  Product,
  Offer,
  FormField,
  DeliveryZone,
  FIELD_TYPES,
} from '../models/index.js';

// ─── Product ────────────────────────────────────────────────
/** GET /api/admin/product → the (single) active product. */
export async function getProduct(req, res, next) {
  try {
    const product = await Product.findOne().sort({ createdAt: 1 });
    res.json({ product });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/product → update product content. */
export async function updateProduct(req, res, next) {
  try {
    const b = req.body || {};
    const product = await Product.findOne().sort({ createdAt: 1 });
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    if (b.name !== undefined) product.name = String(b.name).trim();
    if (b.description !== undefined) product.description = b.description;
    if (Array.isArray(b.images)) product.images = b.images;
    if (b.active !== undefined) product.active = !!b.active;
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
    res.json({ offers: await Offer.find().sort({ order: 1 }).lean() });
  } catch (err) {
    next(err);
  }
}

export async function createOffer(req, res, next) {
  try {
    const b = req.body || {};
    const product = await Product.findOne().sort({ createdAt: 1 });
    const last = await Offer.findOne().sort({ order: -1 }).select('order').lean();
    const offer = await Offer.create({
      productId: product?._id,
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
    if (offer.isDefault) await Offer.updateMany({ _id: { $ne: offer._id } }, { isDefault: false });
    res.status(201).json({ ok: true, offer });
  } catch (err) {
    next(err);
  }
}

export async function updateOffer(req, res, next) {
  try {
    const b = req.body || {};
    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found.' });
    ['title', 'image', 'badge', 'sku'].forEach((k) => { if (b[k] !== undefined) offer[k] = b[k]; });
    if (b.price !== undefined) offer.price = Number(b.price) || 0;
    if (b.comparePrice !== undefined) offer.comparePrice = b.comparePrice != null && b.comparePrice !== '' ? Number(b.comparePrice) : null;
    if (b.quantity !== undefined) offer.quantity = Number(b.quantity) || 1;
    if (b.active !== undefined) offer.active = !!b.active;
    if (b.isDefault !== undefined) offer.isDefault = !!b.isDefault;
    await offer.save();
    if (offer.isDefault) await Offer.updateMany({ _id: { $ne: offer._id } }, { isDefault: false });
    res.json({ ok: true, offer });
  } catch (err) {
    next(err);
  }
}

export async function deleteOffer(req, res, next) {
  try {
    const count = await Offer.countDocuments();
    if (count <= 1) return res.status(400).json({ error: 'At least one offer is required.' });
    await Offer.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ─── Form fields ────────────────────────────────────────────
export async function listFields(req, res, next) {
  try {
    res.json({ fields: await FormField.find().sort({ order: 1 }).lean(), types: FIELD_TYPES });
  } catch (err) {
    next(err);
  }
}

export async function createField(req, res, next) {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!name) return res.status(400).json({ error: 'Enter a field name (English).' });
    if (['name', 'phone', 'address'].includes(name)) {
      return res.status(400).json({ error: 'This name is reserved for a core field.' });
    }
    if (await FormField.findOne({ name })) return res.status(400).json({ error: 'A field with this name already exists.' });
    if (!FIELD_TYPES.includes(b.type)) return res.status(400).json({ error: 'Invalid type.' });

    const last = await FormField.findOne().sort({ order: -1 }).select('order').lean();
    const field = await FormField.create({
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
    const field = await FormField.findById(req.params.id);
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
    const field = await FormField.findById(req.params.id);
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
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    await Promise.all(ids.map((id, i) => FormField.updateOne({ _id: id }, { order: i + 1 })));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ─── Delivery zones ─────────────────────────────────────────
export async function listZones(req, res, next) {
  try {
    res.json({ zones: await DeliveryZone.find().sort({ order: 1 }).lean() });
  } catch (err) {
    next(err);
  }
}

export async function createZone(req, res, next) {
  try {
    const b = req.body || {};
    const last = await DeliveryZone.findOne().sort({ order: -1 }).select('order').lean();
    const zone = await DeliveryZone.create({
      name: String(b.name || '').trim(),
      charge: Number(b.charge) || 0,
      isDefault: !!b.isDefault,
      active: b.active !== false,
      order: (last?.order || 0) + 1,
    });
    if (zone.isDefault) await DeliveryZone.updateMany({ _id: { $ne: zone._id } }, { isDefault: false });
    res.status(201).json({ ok: true, zone });
  } catch (err) {
    next(err);
  }
}

export async function updateZone(req, res, next) {
  try {
    const b = req.body || {};
    const zone = await DeliveryZone.findById(req.params.id);
    if (!zone) return res.status(404).json({ error: 'Zone not found.' });
    if (b.name !== undefined) zone.name = String(b.name).trim();
    if (b.charge !== undefined) zone.charge = Number(b.charge) || 0;
    if (b.active !== undefined) zone.active = !!b.active;
    if (b.isDefault !== undefined) zone.isDefault = !!b.isDefault;
    await zone.save();
    if (zone.isDefault) await DeliveryZone.updateMany({ _id: { $ne: zone._id } }, { isDefault: false });
    res.json({ ok: true, zone });
  } catch (err) {
    next(err);
  }
}

export async function deleteZone(req, res, next) {
  try {
    const count = await DeliveryZone.countDocuments();
    if (count <= 1) return res.status(400).json({ error: 'At least one zone is required.' });
    await DeliveryZone.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
