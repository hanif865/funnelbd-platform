import { reportError, publicMessageFor } from '../services/systemErrors.js';

/** 404 handler for unmatched routes. */
export function notFound(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'পাওয়া যায়নি।' });
  }
  res.status(404).send('404 — Page not found');
}

/**
 * Central error handler. Keeps stack traces out of client responses.
 * Server/DB failures are recorded for the admin System Status page, and
 * database outages answer 503 with a clear Bangla reason (e.g. on login).
 */
export function errorHandler(err, req, res, _next) {
  const dbMessage = publicMessageFor(err);
  const status = err.status || (dbMessage ? 503 : 500);
  if (status >= 500) reportError(req.path.startsWith('/api/') ? 'api' : 'page', err, { path: `${req.method} ${req.path}` });
  else console.error('[error]', err.message);

  if (req.path.startsWith('/api/')) {
    // Admins get the technical reason; customers get a calm retry message.
    const outage = req.path.startsWith('/api/admin/')
      ? dbMessage
      : dbMessage && 'সাময়িক সমস্যা হচ্ছে — ১-২ মিনিট পর আবার চেষ্টা করুন।';
    return res.status(status).json({ error: err.publicMessage || outage || 'সার্ভার ত্রুটি।' });
  }
  res.status(status).send(dbMessage ? 'সাময়িক সমস্যা হচ্ছে — কিছুক্ষণ পর আবার চেষ্টা করুন।' : 'সার্ভার ত্রুটি।');
}

export default { notFound, errorHandler };
