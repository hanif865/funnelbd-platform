import { aiConfigured, generateLandingContent, AINotConfiguredError } from '../services/ai.service.js';

/** GET /api/admin/ai/status → whether AI features are available on this server. */
export function aiStatus(req, res) {
  res.json({ configured: aiConfigured() });
}

/** POST /api/admin/ai/landing → generate funnel copy from a product name + notes. */
export async function generateLanding(req, res, next) {
  try {
    const { productName, notes, language } = req.body || {};
    const result = await generateLandingContent({ productName, notes, language });
    res.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AINotConfiguredError) {
      return res.status(503).json({ error: err.message });
    }
    if (err?.name === 'AuthenticationError' || err?.status === 401) {
      return res.status(503).json({ error: 'AI credentials are invalid. Check ANTHROPIC_API_KEY.' });
    }
    if (err?.message && /Enter a product name|not JSON|Empty AI/.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
}

export default { aiStatus, generateLanding };
