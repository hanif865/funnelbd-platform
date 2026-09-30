/**
 * Minimal in-memory fixed-window rate limiter, keyed by client IP.
 *
 * The web app runs as a single PM2 process, so process memory is a correct
 * store. If it is ever scaled to multiple instances, move this to Redis.
 *
 * Limits are deliberately generous: Bangladeshi mobile carriers put many
 * users behind shared (CGNAT) IPs.
 */
function clientIp(req) {
  return (
    req.headers['cf-connecting-ip'] ||
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.ip ||
    'unknown'
  );
}

export function rateLimit({ windowMs, max, message = 'অনেক বেশি অনুরোধ — কিছুক্ষণ পর আবার চেষ্টা করুন।', silent = false }) {
  const hits = new Map(); // ip → { count, resetAt }

  // Periodically drop expired windows so the map doesn't grow unbounded.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
  }, windowMs);
  sweep.unref?.();

  return function rateLimitMiddleware(req, res, next) {
    const ip = clientIp(req);
    const now = Date.now();
    let entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }
    entry.count++;

    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      // Beacon-style endpoints (draft/track) just get an empty 429.
      if (silent) return res.status(429).end();
      return res.status(429).json({ ok: false, error: message, message });
    }
    next();
  };
}

export default rateLimit;
