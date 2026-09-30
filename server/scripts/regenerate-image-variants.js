import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { UPLOAD_DIR, VARIANT_WIDTHS, makeVariants } from '../services/image.service.js';

/**
 * Backfill responsive image variants (NAME-<w>.webp) for images that were
 * uploaded before the variant pipeline existed. Downscales each main WebP into
 * the missing smaller widths so the landing page's srcset has real files to
 * pick from. Idempotent — existing variants are left alone.
 *
 * Safe by default: prints what it WOULD create. Pass --apply to write.
 *   node server/scripts/regenerate-image-variants.js           # dry run
 *   node server/scripts/regenerate-image-variants.js --apply   # create files
 */
const VARIANT_RE = /-\d+\.webp$/i; // NAME-480.webp → a variant, skip as a source

async function run() {
  const apply = process.argv.includes('--apply');
  console.log('[img-variants] uploads dir:', UPLOAD_DIR);
  console.log('[img-variants] ' + (apply ? 'APPLY mode' : 'dry run (use --apply to write)'));

  let names;
  try {
    names = await fs.readdir(UPLOAD_DIR);
  } catch (e) {
    console.error('[img-variants] cannot read uploads dir:', e.message);
    process.exit(1);
  }

  const mains = names.filter((n) => /\.webp$/i.test(n) && !VARIANT_RE.test(n));
  console.log(`[img-variants] ${mains.length} main image(s) found.`);

  let created = 0;
  let skipped = 0;
  for (const name of mains) {
    const full = path.join(UPLOAD_DIR, name);
    const id = name.replace(/\.webp$/i, '');
    let buf;
    let width;
    try {
      buf = await fs.readFile(full);
      width = (await sharp(buf).metadata()).width || 0;
    } catch (e) {
      console.log(`   ! skip ${name} (unreadable: ${e.message})`);
      continue;
    }

    // Which variant widths are missing for this image?
    const wanted = VARIANT_WIDTHS.filter((w) => w < width);
    const missing = [];
    for (const w of wanted) {
      try {
        await fs.access(path.join(UPLOAD_DIR, `${id}-${w}.webp`));
        skipped++;
      } catch {
        missing.push(w);
      }
    }
    if (!missing.length) continue;

    if (!apply) {
      console.log(`   · ${name} (${width}px) → would create: ${missing.map((w) => w + 'w').join(', ')}`);
      created += missing.length;
      continue;
    }

    const variants = await makeVariants(buf, width);
    for (const v of variants) {
      if (!missing.includes(v.width)) continue;
      await fs.writeFile(path.join(UPLOAD_DIR, `${id}-${v.width}.webp`), v.buffer);
      created++;
    }
    console.log(`   ✓ ${name} (${width}px) → ${missing.map((w) => w + 'w').join(', ')}`);
  }

  console.log(`[img-variants] ${apply ? 'created' : 'would create'} ${created} variant file(s); ${skipped} already existed.`);
  if (!apply && created > 0) console.log('[img-variants] re-run with --apply to write them.');
  process.exit(0);
}

run().catch((err) => {
  console.error('[img-variants] failed:', err);
  process.exit(1);
});
