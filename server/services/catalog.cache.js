import mongoose from 'mongoose';
import { Product, Offer, FormField, DeliveryZone } from '../models/index.js';

/**
 * In-memory cache of a funnel's storefront catalog (product + its offers, form
 * fields and delivery zones), keyed by `<accountId>|<slug>`. Every landing view
 * and checkout needs all of it but it only changes when an admin edits — so one
 * reload per CACHE_TTL_MS per funnel replaces several queries per request.
 *
 * Multi-tenant: a slug is unique only within an account, so the account is part
 * of the key. getCatalog(accountId, slug) → that funnel; slug null → the
 * account's default funnel (first active product).
 *
 * Returned objects are frozen and shared: callers must treat them as read-only.
 */
const CACHE_TTL_MS = 60 * 1000;
let caches = new Map(); // key(`<acct>|<slug>`) → { data, expiresAt }
let inflight = new Map();
let generation = 0;

const cacheKey = (accountId, slug) => `${accountId ? String(accountId) : 'null'}|${slug || '__default__'}`;

async function load(accountId, slug) {
  const where = { accountId: accountId || null };
  if (slug) where.slug = slug;
  else where.active = true;
  const product = await Product.findOne(where).sort({ createdAt: 1 }).lean();
  if (!product) return deepFreeze({ product: null, offers: [], fields: [], zones: [] });

  const pid = product._id;
  const aid = product.accountId || null;
  // Offers are scoped by productId + account. Fields/zones match this funnel, or
  // the account's legacy null (pre-migration) so the form never renders empty.
  const funnelOrLegacy = { accountId: aid, active: true, $or: [{ productId: pid }, { productId: null }] };
  const [offers, fields, zones] = await Promise.all([
    Offer.find({ accountId: aid, active: true, productId: pid }).sort({ order: 1 }).lean(),
    FormField.find(funnelOrLegacy).sort({ order: 1 }).lean(),
    DeliveryZone.find(funnelOrLegacy).sort({ order: 1 }).lean(),
  ]);
  return deepFreeze({ product, offers, fields, zones });
}

/** @returns {Promise<{ product, offers: any[], fields: any[], zones: any[] }>} */
export async function getCatalog(accountId = null, slug = null) {
  const key = cacheKey(accountId, slug);
  const c = caches.get(key);
  if (c && c.expiresAt > Date.now()) return c.data;

  if (inflight.has(key)) return inflight.get(key);
  const gen = generation;
  const p = load(accountId, slug)
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

/** The account's default funnel product id (first active product), or null.
 *  Pass an accountId (incl. null); omit it for the legacy account-agnostic lookup. */
export async function getDefaultProductId(accountId) {
  const where = { active: true };
  if (accountId !== undefined) where.accountId = accountId || null;
  const p = await Product.findOne(where).sort({ createdAt: 1 }).select('_id').lean();
  return p ? p._id : null;
}

/** Active form fields for a funnel within an account (or legacy null). */
export async function getFunnelFields(accountId, productId) {
  return FormField.find({ accountId: accountId || null, active: true, $or: [{ productId }, { productId: null }] })
    .sort({ order: 1 }).lean();
}

/** Active offer / zone by id, optionally scoped to an account (prevents a
 *  checkout on one funnel from referencing another tenant's offer). */
export async function findActiveOffer(id, accountId) {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  const where = { _id: id, active: true };
  if (accountId !== undefined) where.accountId = accountId || null;
  return Offer.findOne(where).lean().catch(() => null);
}
export async function findActiveZone(id, accountId) {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  const where = { _id: id, active: true };
  if (accountId !== undefined) where.accountId = accountId || null;
  return DeliveryZone.findOne(where).lean().catch(() => null);
}

// Freezing makes accidental mutation of shared cached data throw (strict-mode
// ESM). BSON types (ObjectId, Date) are left alone.
function deepFreeze(v) {
  if (Array.isArray(v) || (v && Object.getPrototypeOf(v) === Object.prototype)) {
    Object.values(v).forEach(deepFreeze);
    Object.freeze(v);
  }
  return v;
}

export default { getCatalog, invalidateCatalogCache, getFunnelFields, getDefaultProductId, findActiveOffer, findActiveZone };
