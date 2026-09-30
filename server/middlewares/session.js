import { nanoid } from 'nanoid';
import { config } from '../config/index.js';

const COOKIE_NAME = 'fbd_sid';

/**
 * Ensures every visitor has a stable session id cookie (httpOnly, 30 days).
 * Also stashes request-derived metadata (ip, user-agent) on req for order
 * creation and future server-side tracking.
 *
 * IP resolution honours Cloudflare's CF-Connecting-IP since the app runs
 * behind Cloudflare in production.
 */
export function sessionMiddleware(req, res, next) {
  let sid = req.cookies?.[COOKIE_NAME];
  req.isNewSession = false;
  if (!sid) {
    sid = nanoid(24);
    req.isNewSession = true; // ≈ a new unique visitor
    res.cookie(COOKIE_NAME, sid, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      maxAge: config.sessionCookieDays * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  req.sessionId = sid;
  req.clientIp =
    req.headers['cf-connecting-ip'] ||
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.ip ||
    '';
  req.clientUserAgent = req.headers['user-agent'] || '';
  next();
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export default sessionMiddleware;
