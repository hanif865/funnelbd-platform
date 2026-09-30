import { Product, Offer, FormField, DeliveryZone } from '../models/index.js';

/**
 * In-memory cache of the active storefront catalog (product, offers, form
 * fields, delivery zones). Every landing view and checkout needs all of it,
 * but it only changes when an admin edits — so one 4-query reload per
 * CACHE_TTL_MS replaces 4+ queries per request.
 *
 * Admin writes call invalidateCatalogCache() (see admin.routes), so edits show
 * on the landing page immediately.
 *
 * Returned objects are shared: callers must treat them as read-only.
 */
const CACHE_TTL_MS = 60 * 1000;
let cache = null; // { data, expiresAt }
let inflight = null;
let generation = 0;

async function load() {
  const [product, offers, fields, zones] = await Promise.all([
    Product.findOne({ active: true }).sort({ createdAt: 1 }).lean(),
    Offer.find({ active: true }).sort({ order: 1 }).lean(),
    FormField.find({ active: true }).sort({ order: 1 }).lean(),
    DeliveryZone.find({ active: true }).sort({ order: 1 }).lean(),
  ]);
  return deepFreeze({ product, offers, fields, zones });
}

/** @returns {Promise<{ product, offers: any[], fields: any[], zones: any[] }>} */
export async function getCatalog() {
  if (cache && cache.expiresAt > Date.now()) return cache.data;
  const gen = generation;
  inflight ||= load()
    .then((data) => {
      if (gen === generation) cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function invalidateCatalogCache() {
  cache = null;
  inflight = null;
  generation++;
}

/** Active offer / zone by id from the cache (null if missing or inactive). */
export async function findActiveOffer(id) {
  const { offers } = await getCatalog();
  return offers.find((o) => String(o._id) === String(id)) || null;
}
export async function findActiveZone(id) {
  const { zones } = await getCatalog();
  return zones.find((z) => String(z._id) === String(id)) || null;
}

// Freezing makes accidental mutation of shared cached data throw (in strict
// mode ESM) instead of silently leaking into other requests. BSON types
// (ObjectId, Date) are left alone.
function deepFreeze(v) {
  if (Array.isArray(v) || (v && Object.getPrototypeOf(v) === Object.prototype)) {
    Object.values(v).forEach(deepFreeze);
    Object.freeze(v);
  }
  return v;
}

export default { getCatalog, invalidateCatalogCache, findActiveOffer, findActiveZone };
