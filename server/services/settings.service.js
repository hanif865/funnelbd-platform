import { Setting } from '../models/index.js';

/** Read a single setting value by key, with a fallback default. */
export async function getSetting(key, fallback = null) {
  const doc = await Setting.findOne({ key }).lean();
  return doc ? doc.value : fallback;
}

/** Read several settings at once → { key: value }. */
export async function getSettings(keys) {
  const docs = await Setting.find({ key: { $in: keys } }).lean();
  const map = Object.fromEntries(docs.map((d) => [d.key, d.value]));
  for (const k of keys) if (!(k in map)) map[k] = null;
  return map;
}

/** Upsert a setting value. */
export async function setSetting(key, value) {
  await Setting.findOneAndUpdate({ key }, { key, value }, { upsert: true });
  return value;
}

export default { getSetting, getSettings, setSetting };
