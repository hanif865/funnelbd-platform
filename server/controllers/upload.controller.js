import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { optimizeToWebpSet, ImageProcessingError } from '../services/image.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '../../public/uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

// Kept in memory: the original is never written to disk — only the optimized
// WebP is. Large originals are fine since they get shrunk before saving.
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB original → typically <200KB WebP
  fileFilter: (req, file, cb) => {
    // Loose pre-check; sharp decides for real (content, not extension/mime).
    const ok = file.mimetype.startsWith('image/') || /\.(heic|heif|avif)$/i.test(file.originalname);
    if (!ok) return cb(new Error('Only images can be uploaded.'));
    cb(null, true);
  },
}).single('image');

/**
 * POST /api/admin/upload (multipart, field "image") → { url, width, height, ... }.
 * Any image format in, optimized WebP out. The returned URL is stored in
 * product.images / content.reviewImages / offer.image.
 */
export function handleUpload(req, res, next) {
  uploadMiddleware(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image cannot be larger than 15MB.' : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'No file received.' });

    try {
      const { buffer, width, height, variants } = await optimizeToWebpSet(req.file.buffer);
      const id = `${Date.now()}-${nanoid(8)}`;
      const filename = `${id}.webp`;
      await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);
      // Responsive variants (NAME-<w>.webp) for srcset. Best-effort — a failed
      // variant just means the browser falls back to the main image.
      await Promise.all(
        variants.map((v) => fs.writeFile(path.join(UPLOAD_DIR, `${id}-${v.width}.webp`), v.buffer).catch(() => {}))
      );

      res.status(201).json({
        ok: true,
        url: `/public/uploads/${filename}`,
        width,
        height,
        originalBytes: req.file.size,
        bytes: buffer.length,
      });
    } catch (e) {
      if (e instanceof ImageProcessingError) return res.status(400).json({ error: e.message });
      next(e);
    }
  });
}

export default { handleUpload };
