import { reportError, publicMessageFor } from '../services/systemErrors.js';

/** 404 handler for unmatched routes. */
export function notFound(req, res) {
  // Admin panel (English) vs. customer-facing API (Bangla).
  if (req.path.startsWith('/api/admin/')) {
    return res.status(404).json({ error: 'Not found.' });
  }
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'পাওয়া যায়নি।' });
  }
  res.status(404).send('404 — Page not found');
}

/**
 * Central error handler. Keeps stack traces out of client responses.
 * Server/DB failures are recorded for the admin System Status page; the admin
 * panel gets an English reason and customers get a calm Bangla retry message.
 */
export function errorHandler(err, req, res, _next) {
  const dbMessage = publicMessageFor(err);
  const status = err.status || (dbMessage ? 503 : 500);
  if (status >= 500) reportError(req.path.startsWith('/api/') ? 'api' : 'page', err, { path: `${req.method} ${req.path}` });
  else console.error('[error]', err.message);

  if (req.path.startsWith('/api/')) {
    const isAdmin = req.path.startsWith('/api/admin/');
    // Admins get the technical reason (English); customers get a calm retry message (Bangla).
    const outage = isAdmin
      ? dbMessage
      : dbMessage && 'সাময়িক সমস্যা হচ্ছে — ১-২ মিনিট পর আবার চেষ্টা করুন।';
    const fallback = isAdmin ? 'Server error.' : 'সার্ভার ত্রুটি।';
    return res.status(status).json({ error: err.publicMessage || outage || fallback });
  }
  res.status(status).send(dbMessage ? 'সাময়িক সমস্যা হচ্ছে — কিছুক্ষণ পর আবার চেষ্টা করুন।' : 'সার্ভার ত্রুটি।');
}

export default { notFound, errorHandler };
