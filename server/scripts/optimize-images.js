import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { optimizeToWebp } from '../services/image.service.js';

/**
 * One-off migration: converts images uploaded before the WebP pipeline existed
 * (jpg/png/gif/…) into optimized WebP, then rewrites every reference to them
 * in products, offers and settings. Safe to re-run (already-converted files
 * are skipped). Originals are left on disk; delete them once the site looks
 * right.
 *
 * Run with: npm run images:optimize
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '../../public/uploads');
const COLLECTIONS = ['products', 'offers', 'settings'];

/**
 * Deep-replace old URLs inside strings, walking only plain arrays/objects so
 * ObjectIds, Dates etc. keep their BSON types. Returns the same reference when
 * nothing changed.
 */
function replaceUrls(value, renames) {
  if (typeof value === 'string') {
    let s = value;
    for (const [from, to] of Object.entries(renames)) if (s.includes(from)) s = s.split(from).join(to);
    return s;
  }
  if (Array.isArray(value)) {
    const out = value.map((v) => replaceUrls(v, renames));
    return out.some((v, i) => v !== value[i]) ? out : value;
  }
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    let changed = false;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = replaceUrls(v, renames);
      if (out[k] !== v) changed = true;
    }
    return changed ? out : value;
  }
  return value;
}

async function run() {
  const files = (await fs.readdir(UPLOAD_DIR)).filter((f) => !f.startsWith('.') && !f.endsWith('.webp'));
  const renames = {}; // '/public/uploads/a.jpg' → '/public/uploads/a.webp'
  let before = 0;
  let after = 0;

  for (const file of files) {
    const src = path.join(UPLOAD_DIR, file);
    const webpName = file.replace(/\.[^.]+$/, '') + '.webp';
    try {
      const input = await fs.readFile(src);
      const { buffer } = await optimizeToWebp(input);
      await fs.writeFile(path.join(UPLOAD_DIR, webpName), buffer);
      renames[`/public/uploads/${file}`] = `/public/uploads/${webpName}`;
      before += input.length;
      after += buffer.length;
      console.log(`[images] ${file} ${Math.round(input.length / 1024)}KB → ${webpName} ${Math.round(buffer.length / 1024)}KB`);
    } catch (e) {
      console.warn(`[images] skipped ${file}: ${e.message}`);
    }
  }

  if (!Object.keys(renames).length) {
    console.log('[images] nothing to convert.');
    return;
  }

  await connectDB();
  const db = mongoose.connection.db;
  let updated = 0;
  for (const name of COLLECTIONS) {
    const col = db.collection(name);
    for await (const doc of col.find({})) {
      const $set = {};
      for (const [k, v] of Object.entries(doc)) {
        if (k === '_id') continue;
        const next = replaceUrls(v, renames);
        if (next !== v) $set[k] = next;
      }
      if (!Object.keys($set).length) continue;
      await col.updateOne({ _id: doc._id }, { $set });
      updated++;
    }
  }
  console.log(`[images] done: ${Object.keys(renames).length} files, ${Math.round(before / 1024)}KB → ${Math.round(after / 1024)}KB, ${updated} DB documents updated.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[images] failed:', err);
  process.exit(1);
});
