import { IncompleteOrder, INCOMPLETE_STATUSES, Offer } from '../models/index.js';
import { createOrder } from '../services/order.service.js';
import { sendFollowUpSms } from '../services/sms.service.js';
import { getSetting } from '../services/settings.service.js';

/**
 * GET /api/admin/incomplete
 * Abandoned checkouts worth recovering. Defaults to the actionable ones
 * (not converted/dead) and to those with a phone first.
 */
export async function listIncomplete(req, res, next) {
  try {
    const { status, search } = req.query;
    const filter = {};
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
    const item = await IncompleteOrder.findByIdAndUpdate(
      req.params.id,
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
    const item = await IncompleteOrder.findById(req.params.id);
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
    const item = await IncompleteOrder.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found.' });

    const { offerId, quantity = 1, deliveryZoneId, fields = {} } = req.body || {};
    const mergedFields = { ...(item.data || {}), ...fields };

    const order = await createOrder(
      {
        offerId: offerId || String(item.offerId || ''),
        quantity,
        deliveryZoneId,
        fields: mergedFields,
        tracking: item.tracking || {},
      },
      { source: 'Admin', skipDuplicateCheck: true }
    );

    item.status = 'converted';
    await item.save();

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
    const offers = await Offer.find({ active: true }).sort({ order: 1 }).select('title price').lean();
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
