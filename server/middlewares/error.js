/** 404 handler for unmatched routes. */
export function notFound(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'পাওয়া যায়নি।' });
  }
  res.status(404).send('404 — Page not found');
}

/** Central error handler. Keeps stack traces out of client responses. */
export function errorHandler(err, req, res, _next) {
  // eslint-disable-next-line no-console
  console.error('[error]', err.stack || err.message);
  const status = err.status || 500;
  if (req.path.startsWith('/api/')) {
    return res.status(status).json({ error: err.publicMessage || 'সার্ভার ত্রুটি।' });
  }
  res.status(status).send('সার্ভার ত্রুটি।');
}

export default { notFound, errorHandler };
