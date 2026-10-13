import mongoose from 'mongoose';
import { IncompleteOrder, INCOMPLETE_STATUSES, Offer } from '../models/index.js';

// Tenant scope (set by auth middleware), as an ObjectId so it matches in
// find() and aggregate() alike (aggregate $match does not auto-cast).
function acct(req) {
  const id = req.accountId;
  return id && mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
}
import { createOrder } from '../services/order.service.js';
import { sendFollowUpSms } from '../services/sms.service.js';
import { getSetting } from '../services/settings.service.js';
import { buildPurchaseJobs } from '../services/tracking/index.js';
import { enqueueTrackingJobs } from '../queues/tracking.queue.js';
import { reportError } from '../services/systemErrors.js';

/**
 * GET /api/admin/incomplete
 * Abandoned checkouts worth recovering. Defaults to the actionable ones
 * (not converted/dead) and to those with a phone first.
 */
export async function listIncomplete(req, res, next) {
  try {
    const { status, search, funnel } = req.query;
    const accountId = acct(req);
    const filter = { accountId };
    const funnelMatch = funnel && mongoose.isValidObjectId(funnel)
      ? { accountId, productId: new mongoose.Types.ObjectId(funnel) }
      : { accountId };
    Object.assign(filter, funnelMatch);
    if (status && INCOMPLETE_STATUSES.includes(status)) filter.status = status;
    else filter.status = { $in: ['new', 'called'] }; // default: still recoverable
    if (search) {
      const term = String(search).trim();
      filter.$or = [
        { phone: { $regex: term.replace(/\D/g, ''), $options: 'i' } },
        { 'data.name': { $regex: term, $options: 'i' } },
      ];
    }

    const items = await IncompleteOrder.find(filter)
      .sort({ phoneValid: -1, lastActivityAt: -1 })
      .limit(200)
      .populate('offerId', 'title price')
      .lean();

    const statusCounts = await IncompleteOrder.aggregate([
      { $match: funnelMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    res.json({
      items,
      statusCounts: Object.fromEntries(statusCounts.map((s) => [s._id, s.count])),
    });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/incomplete/:id/status → new|called|converted|dead */
export async function updateIncompleteStatus(req, res, next) {
  try {
    const { status } = req.body || {};
    if (!INCOMPLETE_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    const item = await IncompleteOrder.findOneAndUpdate(
      { _id: req.params.id, accountId: acct(req) },
      { status },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Not found.' });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/incomplete/:id/followup → send follow-up SMS manually. */
export async function sendIncompleteFollowUp(req, res, next) {
  try {
    const item = await IncompleteOrder.findOne({ _id: req.params.id, accountId: acct(req) });
    if (!item) return res.status(404).json({ error: 'Not found.' });
    if (!item.phoneValid) return res.status(400).json({ error: 'No valid phone number.' });

    const storeInfo = (await getSetting('storeInfo', {})) || {};
    const result = await sendFollowUpSms(item, storeInfo.phone);
    if (result.skipped) return res.status(400).json({ error: 'SMS is not enabled (check Settings).' });

    item.followUpSentAt = new Date();
    await item.save();
    res.json({ ok: result.ok, error: result.error || '' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/incomplete/:id/convert
 * Admin took the order over the phone: create a real order from the entry.
 * Body: { offerId, quantity, deliveryZoneId, fields } — fields override the
 * captured draft data. Skips the duplicate cooldown (deliberate creation).
 */
export async function convertIncomplete(req, res, next) {
  try {
    const item = await IncompleteOrder.findOne({ _id: req.params.id, accountId: acct(req) });
    if (!item) return res.status(404).json({ error: 'Not found.' });

    const { offerId, quantity = 1, deliveryZoneId, fields = {} } = req.body || {};
    const mergedFields = { ...(item.data || {}), ...fields };
    const t = item.tracking || {};

    const order = await createOrder(
      {
        offerId: offerId || String(item.offerId || ''),
        quantity,
        deliveryZoneId,
        fields: mergedFields,
        tracking: t,
      },
      // Carry the captured ip/ua/session so the Purchase match quality stays high.
      { source: 'Admin', skipDuplicateCheck: true, ip: t.ip, userAgent: t.userAgent, externalId: t.externalId }
    );

    item.status = 'converted';
    await item.save();

    // Fire a server-side Purchase so this recovered sale is attributed to the
    // original ad/campaign (the lead's captured fbc/fbclid/campaign). No browser
    // event here, so no deduplication is needed. Non-blocking.
    try {
      await enqueueTrackingJobs(buildPurchaseJobs(order));
    } catch (e) {
      reportError('incomplete-convert:tracking', e);
    }

    res.status(201).json({ ok: true, orderNumber: order.orderNumber, orderId: order._id });
  } catch (err) {
    if (err.name === 'OrderValidationError') {
      return res.status(422).json({ error: err.message, fields: err.fields });
    }
    next(err);
  }
}

/** GET /api/admin/incomplete/offers → offers for the convert form dropdown. */
export async function offersForConvert(req, res, next) {
  try {
    const { funnel } = req.query;
    const where = { active: true, accountId: acct(req) };
    if (funnel && mongoose.isValidObjectId(funnel)) where.productId = new mongoose.Types.ObjectId(funnel);
    const offers = await Offer.find(where).sort({ order: 1 }).select('title price').lean();
    res.json({ offers });
  } catch (err) {
    next(err);
  }
}

export default {
  listIncomplete,
  updateIncompleteStatus,
  sendIncompleteFollowUp,
  convertIncomplete,
  offersForConvert,
};
