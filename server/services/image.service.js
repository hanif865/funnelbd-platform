import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Landing-page image pipeline: whatever the admin uploads (jpg/png/gif/avif/
 * tiff/webp…), store one small WebP plus a few smaller responsive variants.
 *
 *  - auto-rotate from EXIF, then strip all metadata (EXIF/GPS/ICC bloat)
 *  - downscale to fit MAX_DIMENSION (never upscale) — the landing page is
 *    mobile-first, 1200px covers 2–3x retina phones and the desktop column
 *  - WebP q≈78 is visually lossless for product photos at ~25–35% of JPEG size
 *  - animated GIFs stay animated (animated WebP; no variants for these)
 *  - variants: NAME-<w>.webp next to NAME.webp, used for srcset so phones
 *    download a right-sized image instead of the full 1200px one
 */
export const MAX_DIMENSION = 1200;
export const VARIANT_WIDTHS = [240, 480, 800]; // responsive srcset widths
const WEBP_OPTIONS = { quality: 78, effort: 5, smartSubsample: true };
const FALLBACK_QUALITY = 65;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(__dirname, '../../public/uploads');

export class ImageProcessingError extends Error {}

/** @returns {Promise<{ buffer: Buffer, width: number, height: number }>} */
export async function optimizeToWebp(input) {
  let meta;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new ImageProcessingError('Could not read the image — the file is not a valid image or the format is unsupported.');
  }
  if (meta.format === 'heif' && meta.compression === 'hevc') {
    throw new ImageProcessingError('iPhone HEIC format is not supported — upload from Safari/Chrome on the phone (it converts to JPG automatically) or use JPG/PNG.');
  }
  if (meta.format === 'svg') {
    throw new ImageProcessingError('SVG cannot be uploaded — use PNG/JPG.');
  }

  const animated = (meta.pages || 1) > 1 && ['gif', 'webp'].includes(meta.format);

  const encode = (quality) =>
    sharp(input, { animated })
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .webp({ ...WEBP_OPTIONS, quality })
      .toBuffer({ resolveWithObject: true });

  try {
    let { data, info } = await encode(WEBP_OPTIONS.quality);
    // Already-tiny / already-optimized source came out bigger → squeeze harder.
    if (data.length > input.length) ({ data, info } = await encode(FALLBACK_QUALITY));
    return { buffer: data, width: info.width, height: info.pageHeight || info.height };
  } catch {
    throw new ImageProcessingError('Could not process the image — try another format (JPG/PNG).');
  }
}

/**
 * Smaller WebP variants of an already-optimized main WebP, one per
 * VARIANT_WIDTHS narrower than the main. Skips animated images (a static
 * variant would drop the animation). Never upscales. Never throws.
 * @returns {Promise<Array<{ width: number, buffer: Buffer }>>}
 */
export async function makeVariants(mainWebp, mainWidth) {
  const variants = [];
  try {
    if (((await sharp(mainWebp).metadata()).pages || 1) > 1) return variants; // animated
  } catch {
    return variants;
  }
  for (const w of VARIANT_WIDTHS) {
    if (w >= (mainWidth || MAX_DIMENSION)) continue; // don't duplicate/upscale the main
    try {
      const buffer = await sharp(mainWebp).resize({ width: w, withoutEnlargement: true }).webp(WEBP_OPTIONS).toBuffer();
      variants.push({ width: w, buffer });
    } catch {
      /* skip a bad variant — the main image is still served */
    }
  }
  return variants;
}

/** Optimize an upload and build its responsive variants in one call. */
export async function optimizeToWebpSet(input) {
  const main = await optimizeToWebp(input);
  const variants = await makeVariants(main.buffer, main.width);
  return { ...main, variants };
}

/** "/public/uploads/foo.webp" → "/public/uploads/foo-480.webp" */
export function variantUrl(url, w) {
  return url.replace(/\.webp$/i, `-${w}.webp`);
}

// srcset strings are memoized: upload filenames are unique and immutable, so a
// URL's variant set never changes for the life of the process.
const srcsetCache = new Map();

/**
 * Build a srcset for an uploaded image from the variant files that exist on
 * disk. Returns '' when there are no variants (e.g. old images not yet
 * regenerated, or a tiny source) so the caller falls back to a plain src.
 */
export function buildSrcset(url) {
  if (!url || !/\.webp$/i.test(url) || !url.startsWith('/public/uploads/')) return '';
  if (srcsetCache.has(url)) return srcsetCache.get(url);

  const parts = [];
  for (const w of VARIANT_WIDTHS) {
    const vUrl = variantUrl(url, w);
    if (fs.existsSync(path.join(UPLOAD_DIR, path.basename(vUrl)))) parts.push(`${vUrl} ${w}w`);
  }
  let srcset = '';
  if (parts.length && fs.existsSync(path.join(UPLOAD_DIR, path.basename(url)))) {
    parts.push(`${url} ${MAX_DIMENSION}w`);
    srcset = parts.join(', ');
  }
  srcsetCache.set(url, srcset);
  return srcset;
}

/**
 * Small fixed-size thumbnail URL: the given variant width if that file exists,
 * otherwise the original. For images shown at one small size (e.g. the order
 * summary thumbnail) where a full srcset is overkill.
 */
export function thumbUrl(url, w = 240) {
  if (!url || !/\.webp$/i.test(url) || !url.startsWith('/public/uploads/')) return url;
  const v = variantUrl(url, w);
  return fs.existsSync(path.join(UPLOAD_DIR, path.basename(v))) ? v : url;
}

export default {
  optimizeToWebp,
  optimizeToWebpSet,
  makeVariants,
  buildSrcset,
  thumbUrl,
  variantUrl,
  MAX_DIMENSION,
  VARIANT_WIDTHS,
  UPLOAD_DIR,
  ImageProcessingError,
};
