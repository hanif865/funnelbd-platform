import mongoose from 'mongoose';
import { IncompleteOrder, DailyStat } from '../models/index.js';
import { getSettings } from '../services/settings.service.js';
import { getCatalog, findActiveOffer } from '../services/catalog.cache.js';
import { storePhoneLinks } from '../services/storeInfo.js';
import { buildSrcset, thumbUrl } from '../services/image.service.js';
import {
  createOrder,
  OrderValidationError,
  DuplicateOrderError,
} from '../services/order.service.js';
import { checkoutSchema, draftSchema } from '../validation/checkout.js';
import { normalizePhone, isValidBDPhone } from '../utils/phone.js';
import { getTrackingConfig, toPublicConfig } from '../services/tracking/config.js';
import { buildPurchaseJobs, buildMomentJobs } from '../services/tracking/index.js';
import { extractCity } from '../services/tracking/hash.util.js';
import { enqueueTrackingJobs } from '../queues/tracking.queue.js';
import { sendConfirmationSms } from '../services/sms.service.js';
import { sendOrderNotification } from '../services/notify.service.js';
import { reportError } from '../services/systemErrors.js';

/** Fixed exit-intent discount (৳). The only discount a visitor can receive. */
const EXIT_DISCOUNT = 20;

/**
 * The page the visitor was actually on, for event_source_url (Meta/TikTok
 * attribution). The funnel is served on the main domain via a proxy, so we must
 * report that real URL — not the app's own baseUrl. Returns origin+path only
 * (no query, to avoid leaking params), or null to let the builder fall back.
 */
function sanitizePageUrl(raw) {
  try {
    const u = new URL(String(raw));
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.origin + u.pathname;
  } catch {
    /* not a usable URL */
  }
  return null;
}
function refererUrl(req) {
  return sanitizePageUrl(req.get('referer') || req.get('referrer') || '');
}

/**
 * Visitor attribution (click ids, campaign/ad ids, fbp/fbc, ip/ua) from the
 * request cookies — stored on the incomplete order so an admin "convert to
 * order" can fire a Purchase attributed to the original ad/campaign.
 */
function trackingFromRequest(req) {
  const c = req.cookies || {};
  const utm = {};
  for (const k of ['source', 'medium', 'campaign', 'content', 'term', 'id']) {
    if (c['fbd_utm_' + k]) utm[k] = c['fbd_utm_' + k];
  }
  return {
    fbp: c._fbp || '',
    fbc: c._fbc || (c.fbd_fbclid ? `fb.1.${Date.now()}.${c.fbd_fbclid}` : ''),
    fbclid: c.fbd_fbclid || '',
    gclid: c.fbd_gclid || '',
    wbraid: c.fbd_wbraid || '',
    gbraid: c.fbd_gbraid || '',
    ttclid: c.fbd_ttclid || '',
    ttp: c._ttp || c.fbd_ttp || '',
    campaignId: c.fbd_campaign_id || '',
    adId: c.fbd_ad_id || '',
    adsetId: c.fbd_adset_id || '',
    utm,
    ip: req.clientIp || '',
    userAgent: req.clientUserAgent || '',
    externalId: req.sessionId || '',
  };
}

/**
 * Tiny TTL set of recently mirrored tracking event ids (single web process).
 * Returns true if the key was already seen within the window.
 */
const SEEN_TTL_MS = 10 * 60 * 1000;
const SEEN_MAX = 50000;
const seenEvents = new Map(); // key → expiresAt (insertion-ordered)
function seenRecently(key) {
  const now = Date.now();
  const exp = seenEvents.get(key);
  if (exp && exp > now) return true;
  seenEvents.set(key, now + SEEN_TTL_MS);
  // Evict expired/oldest entries so memory stays bounded.
  for (const [k, e] of seenEvents) {
    if (e > now && seenEvents.size <= SEEN_MAX) break;
    seenEvents.delete(k);
  }
  return false;
}

/**
 * Loads everything the landing page needs and renders the EJS template.
 * Product/offers/fields/zones are the admin-editable content; settings supply
 * store info and free-delivery config.
 */
export async function renderLanding(req, res, next) {
  try {
    const slug = req.params.slug || null;
    const [catalog, settings, trackingCfg] = await Promise.all([
      getCatalog(slug),
      getSettings(['storeInfo', 'freeDelivery']),
      getTrackingConfig(),
    ]);
    // An unknown slug falls back to the default funnel rather than 404ing.
    let { product, offers, fields, zones } = catalog;
    if (!product && slug) ({ product, offers, fields, zones } = await getCatalog(null));
    if (!product) {
      return res.status(503).send('কোনো প্রোডাক্ট কনফিগার করা হয়নি। অ্যাডমিন প্যানেল থেকে যোগ করুন।');
    }

    // Traffic counter for the dashboard conversion rate (fire-and-forget).
    DailyStat.track(req.isNewSession).catch((e) => reportError('traffic-stat', e));

    const defaultOffer = offers.find((o) => o.isDefault) || offers[0] || null;
    const defaultZone = zones.find((z) => z.isDefault) || zones[0] || null;

    res.render('landing', {
      product,
      offers,
      fields,
      zones,
      settings,
      storePhones: storePhoneLinks(settings.storeInfo),
      imgSrcset: buildSrcset, // (url) → responsive srcset string, or '' if none
      imgThumb: thumbUrl, // (url) → small variant URL for fixed thumbnails

      // Only public pixel ids reach the browser — never tokens/secrets.
      tracking: toPublicConfig(trackingCfg),
      defaultOfferId: defaultOffer ? String(defaultOffer._id) : '',
      defaultZoneId: defaultZone ? String(defaultZone._id) : '',
      productId: String(product._id),
      baseUrl: req.app.locals.baseUrl,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles order submission (AJAX). Always responds with JSON:
 *   201 { ok:true, orderNumber, ... }        → success, show thank-you
 *   200 { ok:false, duplicate:true, ... }     → polite "already received"
 *   422 { ok:false, errors:{} }               → validation problems
 */
export async function submitCheckout(req, res, next) {
  try {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = {};
      for (const issue of parsed.error.issues) {
        errors[issue.path.join('.')] = issue.message;
      }
      return res.status(422).json({ ok: false, errors });
    }

    const meta = {
      ip: req.clientIp,
      userAgent: req.clientUserAgent,
      sessionId: req.sessionId,
      externalId: req.sessionId, // raw session id; hashed at send time
    };

    // Discount is never taken from the client: only a session that went through
    // the exit-intent offer (recorded server-side by saveExitLead) gets it.
    const lead = await IncompleteOrder.findOne({ sessionId: req.sessionId })
      .select('data.discountOffered')
      .lean();
    const discount = Math.min(Number(lead?.data?.discountOffered) || 0, EXIT_DISCOUNT);

    const order = await createOrder({ ...parsed.data, discount }, meta);

    // This session completed — mark its incomplete-order entry as converted so
    // it drops out of the recovery workflow.
    IncompleteOrder.updateOne(
      { sessionId: req.sessionId, status: { $ne: 'converted' } },
      { $set: { status: 'converted' } }
    ).catch((e) => reportError('checkout:incomplete-convert', e));

    // Fire server-side Purchase (richest identifiers → best EMQ). Non-blocking;
    // never lets a tracking hiccup break the order confirmation. Pass the real
    // landing URL (Referer) so the event attributes to the domain the buyer saw.
    try {
      await enqueueTrackingJobs(buildPurchaseJobs(order, refererUrl(req)));
    } catch (e) {
      reportError('checkout:tracking-enqueue', e);
    }

    // Confirmation SMS (fire-and-forget).
    sendConfirmationSms(order).catch((e) => console.error('[checkout] confirmation sms failed:', e.message));

    // Instant merchant push (Telegram, fire-and-forget).
    sendOrderNotification(order).catch(() => {});

    return res.status(201).json({
      ok: true,
      orderNumber: order.orderNumber,
      total: order.total,
      offerTitle: order.offerTitle,
      variantSummary: order.variantSummary,
      summary: `${order.offerTitle}${order.variantSummary ? ' (' + order.variantSummary + ')' : ''}`,
      // Browser fires its Purchase pixel with this same id → platform dedup.
      eventId: order.tracking.eventId,
    });
  } catch (err) {
    if (err instanceof DuplicateOrderError) {
      return res.status(200).json({
        ok: false,
        duplicate: true,
        message: err.message,
        previousOrderNumber: err.existingOrder?.orderNumber,
      });
    }
    if (err instanceof OrderValidationError) {
      return res.status(422).json({ ok: false, message: err.message, errors: err.fields });
    }
    next(err);
  }
}

/**
 * POST /api/checkout/draft — capture an in-progress checkout ("incomplete
 * order"). Debounced upsert keyed by session so there is exactly one entry per
 * visitor, updated as they type. The phone is the prize: once it's valid the
 * entry becomes callable and eligible for follow-up.
 *
 * Responds 204 fast; never blocks the visitor.
 */
export async function saveDraft(req, res) {
  try {
    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success) return res.status(204).end();
    const { fields = {}, offerId } = parsed.data;

    // Ignore empty drafts (nothing worth storing yet).
    const hasContent = Object.values(fields).some((v) => v !== undefined && v !== null && String(v).trim() !== '');
    if (!hasContent) return res.status(204).end();

    const phone = normalizePhone(fields.phone);
    const set = {
      data: fields,
      offerId: offerId || null,
      lastActivityAt: new Date(),
      // Keep the visitor's attribution so a converted order can fire a Purchase
      // to the right campaign (cookies persist, so this stays the original click).
      tracking: trackingFromRequest(req),
    };
    if (phone) {
      set.phone = phone;
      set.phoneValid = true;
    }
    // Stamp the funnel (from the chosen offer) so the incomplete order is scoped.
    if (offerId) {
      const off = await findActiveOffer(offerId);
      if (off?.productId) set.productId = off.productId;
    }

    await IncompleteOrder.updateOne(
      { sessionId: req.sessionId },
      {
        $set: set,
        $setOnInsert: { sessionId: req.sessionId, firstSeenAt: new Date(), status: 'new' },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  } catch (e) {
    reportError('draft', e);
  }
  return res.status(204).end();
}

/**
 * POST /api/track — server-side mirror for browser-originated moments
 * (pageview, add_to_cart, initiate). The browser fires its pixels AND beacons here with the
 * same eventId so FB/TikTok deduplicate. Identifiers are pulled from cookies +
 * request (fbp/fbc/ip/ua/session/ttp) plus any phone/name/address the user has typed.
 *
 * Always responds 204 quickly; dispatch is fire-and-forget.
 */
export async function trackMoment(req, res) {
  try {
    const { moment, eventId, fields = {}, custom = {}, sourceUrl } = req.body || {};
    if (!['pageview', 'add_to_cart', 'initiate'].includes(moment) || !eventId) {
      return res.status(204).end();
    }
    // Same event id twice (retries, old cached tracker.js) would reach the ad
    // platforms as two separate server events — send each id only once.
    if (seenRecently(`${moment}:${eventId}`)) return res.status(204).end();

    const c = req.cookies || {};
    const city = fields.address ? extractCity(fields.address, fields.zoneName) : (fields.city || '');
    const identifiers = {
      phone: fields.phone || '',
      name: fields.name || '',
      address: fields.address || '',
      zoneName: fields.zoneName || '',
      city,
      country: 'bd',
      externalId: req.sessionId || '',
      fbp: c._fbp || '',
      fbc: c._fbc || (c.fbd_fbclid ? `fb.1.${Date.now()}.${c.fbd_fbclid}` : ''),
      fbclid: c.fbd_fbclid || '',
      ttclid: c.fbd_ttclid || '',
      ttp: c._ttp || c.fbd_ttp || '',
      ip: req.clientIp,
      userAgent: req.clientUserAgent,
    };

    const jobs = buildMomentJobs({
      moment,
      eventId,
      identifiers,
      custom: {
        value: typeof custom.value === 'number' ? custom.value : undefined,
        contentIds: Array.isArray(custom.contentIds) ? custom.contentIds.slice(0, 10) : undefined,
        numItems: typeof custom.numItems === 'number' ? custom.numItems : undefined,
        vcEventId: typeof custom.vcEventId === 'string' ? custom.vcEventId : undefined,
        path: '/',
        // Real page the visitor was on (browser-sent, else Referer) so the
        // event attributes to the actual domain, not the app's baseUrl.
        sourceUrl: sanitizePageUrl(sourceUrl) || refererUrl(req),
      },
    });

    enqueueTrackingJobs(jobs).catch((e) => reportError('track:enqueue', e));
  } catch (e) {
    reportError('track', e);
  }
  return res.status(204).end();
}

/**
 * POST /api/checkout/exit-lead
 * Captures exit intent survey response, customer phone, and selected reason.
 * Upserts into IncompleteOrder so admins can immediately follow up.
 */
export async function saveExitLead(req, res) {
  try {
    const { phone, reason, offerId } = req.body || {};
    const normPhone = normalizePhone(phone);

    const update = {
      $set: {
        'data.exitReason': String(reason || 'অজানা কারণ').slice(0, 200),
        'data.discountOffered': EXIT_DISCOUNT,
        lastActivityAt: new Date(),
        tracking: trackingFromRequest(req),
      },
      $setOnInsert: {
        sessionId: req.sessionId,
        firstSeenAt: new Date(),
        status: 'new',
      },
    };

    if (normPhone) {
      update.$set.phone = normPhone;
      update.$set.phoneValid = true;
    }
    if (offerId && mongoose.isValidObjectId(offerId)) {
      update.$set.offerId = offerId;
    }

    await IncompleteOrder.updateOne(
      { sessionId: req.sessionId },
      update,
      { upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({ ok: true, message: 'আপনার তথ্য সংরক্ষণ করা হয়েছে।' });
  } catch (err) {
    reportError('exit-lead', err);
    return res.status(200).json({ ok: false, error: 'তথ্য সংরক্ষণ করা যায়নি।' });
  }
}

/** Interaction events we count for the dashboard (whitelist — ignore the rest). */
const TRACKED_EVENTS = ['call', 'whatsapp', 'order_click'];

/**
 * POST /api/analytics/event — count a funnel interaction (call / whatsapp /
 * order-button click) for today's stats. Always 204; fire-and-forget.
 */
export async function recordEvent(req, res) {
  try {
    const { event } = req.body || {};
    if (TRACKED_EVENTS.includes(event)) await DailyStat.recordEvent(event);
  } catch (err) {
    reportError('analytics-event', err);
  }
  return res.status(204).end();
}

/**
 * POST /api/analytics/section-dwell
 * Receives time spent per section (seconds) and the exit section where the user bounced.
 * Aggregates into DailyStat.
 */
export async function recordSectionDwell(req, res) {
  try {
    const { dwell = {}, exitSection = '', views = [] } = req.body || {};
    await DailyStat.recordSectionDwell({ dwell, exitSection, views });
    return res.status(204).end();
  } catch (err) {
    reportError('section-dwell', err);
    return res.status(204).end();
  }
}

export default {
  renderLanding,
  submitCheckout,
  trackMoment,
  saveDraft,
  saveExitLead,
  recordSectionDwell,
  recordEvent,
};
