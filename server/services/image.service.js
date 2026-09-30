import sharp from 'sharp';

/**
 * Landing-page image pipeline: whatever the admin uploads (jpg/png/gif/avif/
 * tiff/webp…), store one small WebP.
 *
 *  - auto-rotate from EXIF, then strip all metadata (EXIF/GPS/ICC bloat)
 *  - downscale to fit MAX_DIMENSION (never upscale) — the landing page is
 *    mobile-first, 1200px covers 2–3x retina phones and the desktop column
 *  - WebP q≈78 is visually lossless for product photos at ~25–35% of JPEG size
 *  - animated GIFs stay animated (animated WebP)
 */
export const MAX_DIMENSION = 1200;
const WEBP_OPTIONS = { quality: 78, effort: 5, smartSubsample: true };
const FALLBACK_QUALITY = 65;

export class ImageProcessingError extends Error {}

/** @returns {Promise<{ buffer: Buffer, width: number, height: number }>} */
export async function optimizeToWebp(input) {
  let meta;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new ImageProcessingError('ছবিটি পড়া যায়নি — ফাইলটি সঠিক ছবি নয় বা ফরম্যাট সাপোর্টেড নয়।');
  }
  if (meta.format === 'heif' && meta.compression === 'hevc') {
    throw new ImageProcessingError('iPhone HEIC ফরম্যাট সাপোর্টেড নয় — ফোনের Safari/Chrome থেকে আপলোড করুন (নিজেই JPG হয়ে যায়) অথবা JPG/PNG দিন।');
  }
  if (meta.format === 'svg') {
    throw new ImageProcessingError('SVG আপলোড করা যাবে না — PNG/JPG দিন।');
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
    throw new ImageProcessingError('ছবিটি প্রসেস করা যায়নি — অন্য ফরম্যাটে (JPG/PNG) চেষ্টা করুন।');
  }
}

export default { optimizeToWebp, MAX_DIMENSION, ImageProcessingError };
