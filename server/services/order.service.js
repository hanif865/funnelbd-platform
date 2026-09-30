import { nanoid } from 'nanoid';
import { Order, Counter } from '../models/index.js';
import { getSettings } from './settings.service.js';
import { getCatalog, findActiveOffer, findActiveZone } from './catalog.cache.js';
import { normalizePhone, isValidBDPhone } from '../utils/phone.js';

/**
 * Thrown for expected, user-facing validation problems (bad phone, missing
 * field, etc.). The route handler turns these into a 422 with the message.
 */
export class OrderValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.name = 'OrderValidationError';
    this.fields = fields; // { fieldName: 'error msg' }
  }
}

/** Signals a duplicate within cooldown — handled as a polite 200, not an error. */
export class DuplicateOrderError extends Error {
  constructor(message, existingOrder) {
    super(message);
    this.name = 'DuplicateOrderError';
    this.existingOrder = existingOrder;
  }
}

/**
 * Compute delivery charge, applying free-delivery rules from settings.
 *   - allFree: everything ships free
 *   - enabled + subtotal >= threshold: this order ships free
 */
export function computeDeliveryCharge(zoneCharge, subtotal, freeDelivery) {
  if (freeDelivery?.allFree) return 0;
  if (freeDelivery?.enabled && subtotal >= (freeDelivery.threshold || 0)) return 0;
  return zoneCharge;
}

/**
 * The authoritative price calculation. Never trusts client-sent totals — it
 * refetches the offer and zone and recomputes from scratch.
 *
 * Pricing model: an offer is a card (e.g. "2 pcs — 1,099৳"); the quantity
 * stepper multiplies that card. subtotal = offer.price × quantity.
 */
export async function calculatePricing({ offerId, quantity, deliveryZoneId, discount = 0 }) {
  const offer = await findActiveOffer(offerId);
  if (!offer) throw new OrderValidationError('নির্বাচিত অফারটি এখন আর নেই।', { offerId: 'invalid' });

  const zone = await findActiveZone(deliveryZoneId);
  if (!zone) {
    throw new OrderValidationError('ডেলিভারি এলাকা সঠিক নয়।', { deliveryZoneId: 'invalid' });
  }

  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const subtotal = offer.price * qty;

  const { freeDelivery } = await getSettings(['freeDelivery']);
  const deliveryCharge = computeDeliveryCharge(zone.charge, subtotal, freeDelivery);
  const validDiscount = Math.max(0, Math.min(Number(discount) || 0, 100));
  const total = Math.max(0, subtotal + deliveryCharge - validDiscount);

  return { offer, zone, quantity: qty, subtotal, deliveryCharge, discount: validDiscount, total };
}

/**
 * Validate the dynamic form answers against the live form_fields config.
 * Splits answers into the three core customer fields and the rest
 * (customFields). Enforces required + phone format server-side.
 */
export async function validateFields(fields = {}) {
  const { fields: defs } = await getCatalog();
  const errors = {};
  const customer = {};
  const customFields = {};

  for (const def of defs) {
    const raw = fields[def.name];
    const value = typeof raw === 'string' ? raw.trim() : raw;
    const isEmpty = value === undefined || value === null || value === '';

    if (def.required && isEmpty) {
      errors[def.name] = `${def.label} প্রয়োজন`;
      continue;
    }
    if (isEmpty) continue;

    // Option-based fields must match one of the configured options.
    if ((def.type === 'radio' || def.type === 'select') && def.options?.length) {
      if (!def.options.includes(value)) {
        errors[def.name] = `${def.label} সঠিক নয়`;
        continue;
      }
    }

    if (def.name === 'phone') {
      if (!isValidBDPhone(value)) {
        errors.phone = 'সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)';
        continue;
      }
      customer.phone = normalizePhone(value);
    } else if (def.name === 'name' || def.name === 'address') {
      customer[def.name] = String(value);
    } else {
      customFields[def.name] = value;
    }
  }

  if (Object.keys(errors).length) {
    throw new OrderValidationError('ফর্মে কিছু ভুল আছে।', errors);
  }

  const customFieldLabels = {};
  const variantParts = [];
  for (const def of defs) {
    if (!def.isCore && customFields[def.name] !== undefined) {
      customFieldLabels[def.name] = def.label;
      variantParts.push(`${def.label}: ${customFields[def.name]}`);
    }
  }
  const variantSummary = variantParts.join(' · ');

  return { customer, customFields, customFieldLabels, variantSummary };
}

/**
 * Duplicate guard: same phone within the cooldown window (default 24h).
 * Returns the offending order if a duplicate exists and the rule is enabled.
 */
export async function findDuplicate(phone) {
  const { duplicateCooldown } = await getSettings(['duplicateCooldown']);
  if (!duplicateCooldown?.enabled) return null;

  const hours = duplicateCooldown.hours || 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return Order.findOne({
    'customer.phone': phone,
    createdAt: { $gte: since },
    status: { $nin: ['cancelled'] },
  })
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * Full order creation pipeline. Orchestrates validation, pricing, duplicate
 * check, and persistence. `meta` carries request-derived data (ip, ua,
 * tracking cookies, session id, attribution source).
 *
 * Throws OrderValidationError (→ 422) or DuplicateOrderError (→ polite 200).
 */
export async function createOrder(payload, meta = {}) {
  const { customer, customFields, customFieldLabels, variantSummary } = await validateFields(payload.fields);

  // Duplicate check before we spend an order number. Admin "convert to order"
  // passes skipDuplicateCheck since the admin is deliberately creating it.
  const dup = meta.skipDuplicateCheck ? null : await findDuplicate(customer.phone);
  if (dup) {
    const { duplicateCooldown } = await getSettings(['duplicateCooldown']);
    throw new DuplicateOrderError(duplicateCooldown?.message || 'আপনার অর্ডারটি আমরা ইতিমধ্যে পেয়েছি!', dup);
  }

  const pricing = await calculatePricing({
    offerId: payload.offerId,
    quantity: payload.quantity,
    deliveryZoneId: payload.deliveryZoneId,
    discount: payload.discount || 0,
  });

  const orderNumber = await Counter.next('orderNumber', 1001);
  const t = payload.tracking || {};

  const order = await Order.create({
    orderNumber,
    customer,
    customFields,
    customFieldLabels,
    variantSummary,
    offerId: pricing.offer._id,
    offerTitle: pricing.offer.title,
    unitPrice: pricing.offer.price,
    quantity: pricing.quantity,
    deliveryZoneId: pricing.zone._id,
    deliveryZoneName: pricing.zone.name,
    deliveryCharge: pricing.deliveryCharge,
    discount: pricing.discount,
    subtotal: pricing.subtotal,
    total: pricing.total,
    status: 'new',
    statusHistory: [{ status: 'new', by: 'system', at: new Date() }],
    tracking: {
      fbp: t.fbp || '',
      fbc: t.fbc || '',
      fbclid: t.fbclid || '',
      gclid: t.gclid || '',
      ttclid: t.ttclid || '',
      ttp: t.ttp || '',
      wbraid: t.wbraid || '',
      gbraid: t.gbraid || '',
      campaignId: t.campaignId || '',
      adId: t.adId || '',
      adsetId: t.adsetId || '',
      utm: t.utm || {},
      ip: meta.ip || '',
      userAgent: meta.userAgent || '',
      // Server generates the Purchase dedup id; returned to the browser so its
      // Purchase pixel fires with the same id and the platforms dedupe.
      eventId: t.eventId || meta.eventId || ('pur_' + nanoid()),
      externalId: meta.externalId || '', // raw session id, hashed at send time
      gaClientId: t.gaClientId || '',
    },
    source: meta.source || deriveSource(t),
  });

  return order;
}

/**
 * Rough attribution bucket from click ids / utm for the dashboard.
 * Note: fbp is deliberately NOT used — it's set for every visitor, not only
 * those arriving from Facebook. Only the click id (fbc/fbclid) proves a FB click.
 */
export function deriveSource(tracking = {}) {
  if (tracking.fbc || tracking.fbclid || tracking.campaignId || /facebook|fb|ig|instagram/i.test(tracking?.utm?.source || '')) return 'Facebook';
  if (tracking.ttclid || /tiktok/i.test(tracking?.utm?.source || '')) return 'TikTok';
  if (tracking.gclid || tracking.wbraid || tracking.gbraid || /google/i.test(tracking?.utm?.source || '')) return 'Google';
  if (tracking?.utm?.source) return tracking.utm.source;
  return 'Direct';
}

export default {
  createOrder,
  calculatePricing,
  validateFields,
  findDuplicate,
  computeDeliveryCharge,
  deriveSource,
  OrderValidationError,
  DuplicateOrderError,
};
