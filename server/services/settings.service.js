import { Setting } from '../models/index.js';

/**
 * Settings are read on almost every request (landing, checkout, tracking) but
 * change only when an admin saves. The whole (tiny) collection is cached in
 * memory for CACHE_TTL_MS and reloaded in a single query — this keeps the
 * Atlas free tier (100 ops/sec) comfortable under ad traffic.
 *
 * Writes through setSetting() clear the cache immediately in this process.
 * Other processes (the worker) pick up changes within CACHE_TTL_MS.
 */
const CACHE_TTL_MS = 60 * 1000;
let cache = null; // { map: { key: value }, expiresAt }
let inflight = null;
let generation = 0; // bumped on invalidate so an in-flight stale load isn't cached

async function loadAll() {
  if (cache && cache.expiresAt > Date.now()) return cache.map;
  // Collapse concurrent misses into one query.
  const gen = generation;
  inflight ||= Setting.find({})
    .lean()
    .then((docs) => {
      const map = Object.fromEntries(docs.map((d) => [d.key, d.value]));
      if (gen === generation) cache = { map, expiresAt: Date.now() + CACHE_TTL_MS };
      return map;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Drop the cache (after writes, or from tests/scripts). */
export function invalidateSettingsCache() {
  cache = null;
  inflight = null;
  generation++;
}

// Callers get their own copy so they can't corrupt the shared cache.
const copy = (v) => (v === undefined || v === null ? v : structuredClone(v));

/** Read a single setting value by key, with a fallback default. */
export async function getSetting(key, fallback = null) {
  const map = await loadAll();
  return key in map ? copy(map[key]) : fallback;
}

/** Read several settings at once → { key: value }. */
export async function getSettings(keys) {
  const map = await loadAll();
  return Object.fromEntries(keys.map((k) => [k, k in map ? copy(map[k]) : null]));
}

/** Upsert a setting value. */
export async function setSetting(key, value) {
  await Setting.findOneAndUpdate({ key }, { key, value }, { upsert: true });
  invalidateSettingsCache();
  return value;
}

export default { getSetting, getSettings, setSetting, invalidateSettingsCache };
