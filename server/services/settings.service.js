import { Setting } from '../models/index.js';

/**
 * Settings are read on almost every request (landing, checkout, tracking) but
 * change only when an admin saves. The whole (tiny) collection is cached in
 * memory for CACHE_TTL_MS and reloaded in a single query — this keeps the
 * Atlas free tier (100 ops/sec) comfortable under ad traffic.
 *
 * Multi-tenant: every setting belongs to an account. The cache is keyed by
 * `<accountId>|<key>` so one tenant never reads another's SMS keys, pixels, etc.
 * `accountId` null is the legacy / platform bucket (no cross-account fallback).
 *
 * Writes through setSetting() clear the cache immediately in this process.
 * Other processes (the worker) pick up changes within CACHE_TTL_MS.
 */
const CACHE_TTL_MS = 60 * 1000;
let cache = null; // { map: { '<acct>|<key>': value }, expiresAt }
let inflight = null;
let generation = 0; // bumped on invalidate so an in-flight stale load isn't cached

const acctKey = (accountId, key) => `${accountId ? String(accountId) : 'null'}|${key}`;

async function loadAll() {
  if (cache && cache.expiresAt > Date.now()) return cache.map;
  const gen = generation;
  inflight ||= Setting.find({})
    .lean()
    .then((docs) => {
      const map = Object.fromEntries(docs.map((d) => [acctKey(d.accountId, d.key), d.value]));
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

/** Read a single setting value by key within an account, with a fallback. */
export async function getSetting(key, accountId = null, fallback = null) {
  const map = await loadAll();
  const k = acctKey(accountId, key);
  return k in map ? copy(map[k]) : fallback;
}

/** Read several settings at once within an account → { key: value }. */
export async function getSettings(keys, accountId = null) {
  const map = await loadAll();
  return Object.fromEntries(keys.map((key) => {
    const k = acctKey(accountId, key);
    return [key, k in map ? copy(map[k]) : null];
  }));
}

/** Upsert a setting value within an account. */
export async function setSetting(key, accountId, value) {
  await Setting.findOneAndUpdate({ key, accountId: accountId || null }, { key, accountId: accountId || null, value }, { upsert: true });
  invalidateSettingsCache();
  return value;
}

/**
 * Per-funnel setting within an account: reads `<key>:<productId>`, falling back
 * to the account's `<key>` (so a funnel inherits the account's shared value
 * until it sets its own), then the given default. No cross-account fallback.
 */
export async function getFunnelSetting(key, productId, accountId = null, fallback = null) {
  const map = await loadAll();
  const scoped = productId ? acctKey(accountId, `${key}:${productId}`) : null;
  if (scoped && scoped in map) return copy(map[scoped]);
  const base = acctKey(accountId, key);
  if (base in map) return copy(map[base]);
  return fallback;
}

/** Upsert a per-funnel setting value under `<key>:<productId>` within an account. */
export async function setFunnelSetting(key, productId, accountId, value) {
  return setSetting(productId ? `${key}:${productId}` : key, accountId, value);
}

export default { getSetting, getSettings, setSetting, getFunnelSetting, setFunnelSetting, invalidateSettingsCache };
