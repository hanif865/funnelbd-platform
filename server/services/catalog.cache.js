import mongoose from 'mongoose';
import { Product, Offer, FormField, DeliveryZone } from '../models/index.js';

/**
 * In-memory cache of a funnel's storefront catalog (product + its offers, form
 * fields and delivery zones), keyed by product slug. Every landing view and
 * checkout needs all of it but it only changes when an admin edits — so one
 * reload per CACHE_TTL_MS per funnel replaces several queries per request.
 *
 * getCatalog(slug) → that funnel; getCatalog() / getCatalog(null) → the default
 * funnel (first active product). Admin writes call invalidateCatalogCache().
 *
 * Returned objects are frozen and shared: callers must treat them as read-only.
 */
const CACHE_TTL_MS = 60 * 1000;
const DEFAULT_KEY = '__default__';
let caches = new Map(); // key(slug) → { data, expiresAt }
let inflight = new Map(); // key → Promise (collapse concurrent misses)
let generation = 0;

async function load(slug) {
  const where = slug ? { slug, active: true } : { active: true };
  const product = await Product.findOne(where).sort({ createdAt: 1 }).lean();
  if (!product) return deepFreeze({ product: null, offers: [], fields: [], zones: [] });

  const pid = product._id;
  // Offers are already scoped by productId. Fields/zones match this funnel, or
  // legacy null (pre-migration) so the live site never renders an empty form.
  const funnelOrLegacy = { active: true, $or: [{ productId: pid }, { productId: null }] };
  const [offers, fields, zones] = await Promise.all([
    Offer.find({ active: true, productId: pid }).sort({ order: 1 }).lean(),
    FormField.find(funnelOrLegacy).sort({ order: 1 }).lean(),
    DeliveryZone.find(funnelOrLegacy).sort({ order: 1 }).lean(),
  ]);
  return deepFreeze({ product, offers, fields, zones });
}

/** @returns {Promise<{ product, offers: any[], fields: any[], zones: any[] }>} */
export async function getCatalog(slug = null) {
  const key = slug || DEFAULT_KEY;
  const c = caches.get(key);
  if (c && c.expiresAt > Date.now()) return c.data;

  if (inflight.has(key)) return inflight.get(key);
  const gen = generation;
  const p = load(slug)
    .then((data) => {
      if (gen === generation) caches.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

export function invalidateCatalogCache() {
  caches = new Map();
  inflight = new Map();
  generation++;
}

/** The default funnel's product id (first active product), or null.
 *  Pass an accountId (including null) to scope to one tenant; omit it to keep
 *  the legacy account-agnostic behaviour (used by not-yet-scoped callers). */
export async function getDefaultProductId(accountId) {
  const where = { active: true };
  if (accountId !== undefined) where.accountId = accountId || null;
  const p = await Product.findOne(where).sort({ createdAt: 1 }).select('_id').lean();
  return p ? p._id : null;
}

/** Active form fields for a funnel (or legacy/shared). Used at order validation. */
export async function getFunnelFields(productId) {
  return FormField.find({ active: true, $or: [{ productId }, { productId: null }] }).sort({ order: 1 }).lean();
}

/** Active offer / zone by id (funnel-agnostic lookup; ids are globally unique). */
export async function findActiveOffer(id) {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  return Offer.findOne({ _id: id, active: true }).lean().catch(() => null);
}
export async function findActiveZone(id) {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  return DeliveryZone.findOne({ _id: id, active: true }).lean().catch(() => null);
}

// Freezing makes accidental mutation of shared cached data throw (in strict
// mode ESM). BSON types (ObjectId, Date) are left alone.
function deepFreeze(v) {
  if (Array.isArray(v) || (v && Object.getPrototypeOf(v) === Object.prototype)) {
    Object.values(v).forEach(deepFreeze);
    Object.freeze(v);
  }
  return v;
}

export default { getCatalog, invalidateCatalogCache, getFunnelFields, getDefaultProductId, findActiveOffer, findActiveZone };
