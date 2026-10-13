import mongoose from 'mongoose';
import { verifyToken } from '../utils/jwt.js';
import { Admin } from '../models/index.js';

/**
 * Protects admin API routes. Accepts the JWT from either an httpOnly cookie
 * (`fbd_admin`) or a Bearer Authorization header, verifies it, and loads the
 * admin. Rejects inactive accounts.
 */
function readToken(req) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  return req.cookies?.fbd_admin || bearer;
}

export async function requireAdmin(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized — please log in.' });

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Session expired — please log in again.' });
  }

  let admin;
  try {
    admin = await Admin.findById(payload.sub);
  } catch (err) {
    // Database problem, not an auth problem: don't log the admin out —
    // let the error handler answer 503 with the reason.
    return next(err);
  }
  if (!admin || !admin.active) {
    return res.status(401).json({ error: 'Account is inactive or invalid.' });
  }

  req.admin = admin;
  req.isSuperadmin = admin.role === 'superadmin';

  // Which Account this request operates on. A normal admin/staff user is locked
  // to their own account; the platform superadmin picks one per request via
  // ?account=<id> or the X-Account-Id header (null = none selected yet).
  if (req.isSuperadmin) {
    const sel = req.query.account || req.headers['x-account-id'];
    req.accountId = sel && mongoose.isValidObjectId(sel) ? String(sel) : null;
  } else {
    req.accountId = admin.accountId ? String(admin.accountId) : null;
  }
  next();
}

/**
 * Token-only check (no database lookup) for the System Status endpoints, so
 * admins can still see what's wrong while the database is down.
 */
export function requireAdminToken(req, res, next) {
  const token = readToken(req);
  try {
    const payload = verifyToken(token || '');
    req.adminClaims = { id: payload.sub, role: payload.role, name: payload.name };
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired — please log in again.' });
  }
}

/**
 * Restricts a route to specific roles (e.g. requireRole('admin')). The platform
 * superadmin satisfies every role check.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin || (req.admin.role !== 'superadmin' && !roles.includes(req.admin.role))) {
      return res.status(403).json({ error: 'You do not have permission for this action.' });
    }
    next();
  };
}

export const ADMIN_COOKIE_NAME = 'fbd_admin';
export default requireAdmin;
