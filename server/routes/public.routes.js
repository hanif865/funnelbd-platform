import { Router } from 'express';
import {
  renderLanding,
  submitCheckout,
  trackMoment,
  saveDraft,
  saveExitLead,
  recordSectionDwell,
} from '../controllers/public.controller.js';
import { rateLimit } from '../middlewares/rateLimit.js';

const router = Router();

const MIN = 60 * 1000;
const checkoutLimit = rateLimit({ windowMs: 10 * MIN, max: 20 });
const exitLeadLimit = rateLimit({ windowMs: 10 * MIN, max: 20 });
const draftLimit = rateLimit({ windowMs: MIN, max: 120, silent: true });
const beaconLimit = rateLimit({ windowMs: MIN, max: 300, silent: true });

// Landing page (server-rendered). Supports root, Facebook Ads path, and checkout.
const landingPaths = [
  '/',
  '/funnel-step/checkout',
  '/funnel-step/checkout/',
  '/checkout',
  '/checkout/',
];
landingPaths.forEach((path) => {
  router.get(path, renderLanding);
});

// Order submission (AJAX).
router.post('/api/checkout', checkoutLimit, submitCheckout);

// Draft capture (incomplete orders).
router.post('/api/checkout/draft', draftLimit, saveDraft);

// Exit intent lead capture (phone + reason + 20৳ discount offer).
router.post('/api/checkout/exit-lead', exitLeadLimit, saveExitLead);

// Section dwell time & exit tracking beacon.
router.post('/api/analytics/section-dwell', beaconLimit, recordSectionDwell);

// Server-side mirror for browser tracking moments (pageview, add_to_cart, initiate).
router.post('/api/track', beaconLimit, trackMoment);

export default router;
