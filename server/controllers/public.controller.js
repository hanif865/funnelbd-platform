import mongoose from 'mongoose';
import { IncompleteOrder, DailyStat } from '../models/index.js';
import { getSettings } from '../services/settings.service.js';
import { getCatalog } from '../services/catalog.cache.js';
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
import { reportError } from '../services/systemErrors.js';

/** Fixed exit-intent discount (৳). The only discount a visitor can receive. */
const EXIT_DISCOUNT = 20;

/**
 * Loads everything the landing page needs and renders the EJS template.
 * Product/offers/fields/zones are the admin-editable content; settings supply
 * store info and free-delivery config.
 */
export async function renderLanding(req, res, next) {
  try {
    const [{ product, offers, fields, zones }, settings, trackingCfg] = await Promise.all([
      getCatalog(),
      getSettings(['storeInfo', 'freeDelivery']),
      getTrackingConfig(),
    ]);
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
    // never lets a tracking hiccup break the order confirmation.
    try {
      await enqueueTrackingJobs(buildPurchaseJobs(order));
    } catch (e) {
      reportError('checkout:tracking-enqueue', e);
    }

    // Confirmation SMS (fire-and-forget).
    sendConfirmationSms(order).catch((e) => console.error('[checkout] confirmation sms failed:', e.message));

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
    };
    if (phone) {
      set.phone = phone;
      set.phoneValid = true;
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
    const { moment, eventId, fields = {}, custom = {} } = req.body || {};
    if (!['pageview', 'add_to_cart', 'initiate'].includes(moment) || !eventId) {
      return res.status(204).end();
    }

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
};
