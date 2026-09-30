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

export default { optimizeToWebp, MAX_DIMENSION, ImageProcessingError };
