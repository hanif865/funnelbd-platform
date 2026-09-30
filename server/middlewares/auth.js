import { verifyToken } from '../utils/jwt.js';
import { Admin } from '../models/index.js';

/**
 * Protects admin API routes. Accepts the JWT from either an httpOnly cookie
 * (`fbd_admin`) or a Bearer Authorization header, verifies it, and loads the
 * admin. Rejects inactive accounts.
 */
export async function requireAdmin(req, res, next) {
  try {
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null;
    const token = req.cookies?.fbd_admin || bearer;
    if (!token) return res.status(401).json({ error: 'অননুমোদিত — লগইন করুন।' });

    const payload = verifyToken(token);
    const admin = await Admin.findById(payload.sub);
    if (!admin || !admin.active) {
      return res.status(401).json({ error: 'অ্যাকাউন্ট নিষ্ক্রিয় বা অবৈধ।' });
    }

    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'সেশন মেয়াদোত্তীর্ণ — আবার লগইন করুন।' });
  }
}

/** Restricts a route to specific roles (e.g. requireRole('admin')). */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      return res.status(403).json({ error: 'এই কাজের অনুমতি নেই।' });
    }
    next();
  };
}

export const ADMIN_COOKIE_NAME = 'fbd_admin';
export default requireAdmin;
