import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '../../public/uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${nanoid(8)}${ext}`);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB — keep the landing page light
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) return cb(new Error('শুধু ছবি আপলোড করা যাবে (jpg/png/webp/gif)।'));
    cb(null, true);
  },
}).single('image');

/**
 * POST /api/admin/upload (multipart, field "image") → { url }.
 * The returned URL is stored in product.images / content.reviewImages / offer.image.
 */
export function handleUpload(req, res) {
  uploadMiddleware(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'কোনো ফাইল পাওয়া যায়নি।' });
    res.status(201).json({ ok: true, url: `/public/uploads/${req.file.filename}` });
  });
}

export default { handleUpload };
