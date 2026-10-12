import { Router } from 'express';
import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { Order, IncompleteOrder, Offer } from '../models/index.js';
import { getSetting, setSetting } from '../services/settings.service.js';

/**
 * SafeCommerce CRM ingest feed, matching the dizara-order-sync-api WooCommerce
 * plugin's contract so the CRM works unchanged. Mounted at /api/dizara/v1.
 *
 *   GET  /orders            paged orders (newest first; or modified_since feed)
 *   GET  /incomplete-orders paged abandoned checkouts
 *   GET  /products          catalog (our offers)
 *   POST /order-update      simple field update (older CRM builds)
 *   POST /order-sync        full declarative push (status/total/address/… + rev)
 *
 * Auth: secret via ?secret= (GET) or JSON body `secret` (POST). Read endpoints
 * are gated by a "Start Order Sync" switch (crmSync setting): until it's on, and
 * for anything created before it, nothing is sent — so only new orders flow in.
 */
const router = Router();
const SECRET = config.crm.secret;
const PLUGIN_VERSION = '1.9.5';
const EPOCH = '2020-01-01 00:00:00';

/** "YYYY-MM-DD HH:MM:SS" in GMT/UTC. */
function toGmt(d) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 19).replace('T', ' ');
}

/** Parse "YYYY-MM-DD HH:MM:SS" (GMT) or ISO to a Date, or null. */
function parseSince(s) {
  if (!s) return null;
  const str = String(s).trim();
  const hasTz = /[zZ]|[+-]\d\d:?\d\d$/.test(str);
  const d = new Date(str.replace(' ', 'T') + (hasTz ? '' : 'Z'));
  return isNaN(d.getTime()) ? null : d;
}

// Our status → the WooCommerce-style status the plugin emits (the CRM maps these).
const STATUS_TO_WOO = {
  new: 'processing',
  confirmed: 'confirmed',
  shipped: 'processing',
  delivered: 'completed',
  cancelled: 'cancelled',
  returned: 'refunded',
  hold: 'on-hold',
};
// Woo status the CRM sends back → ours (must be a valid ORDER_STATUSES value).
const STATUS_FROM_WOO = {
  pending: 'new',
  confirmed: 'confirmed',
  processing: 'confirmed',
  'on-hold': 'hold',
  completed: 'delivered',
  cancelled: 'cancelled',
  refunded: 'returned',
  failed: 'cancelled',
};

function secretOk(provided) {
  if (!SECRET) return false;
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function requireSecret(req, res, next) {
  const provided = req.query.secret || req.get('X-Dizara-Secret') || '';
  if (!secretOk(provided)) return res.status(401).json({ success: false, message: 'Unauthorized' });
  next();
}

const num = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : NaN;
};
const clampLimit = (v) => Math.min(num(v) || 100, 200);
const clampOffset = (v) => Math.max(num(v) || 0, 0);

async function getSyncState() {
  const s = (await getSetting('crmSync', null)) || {};
  return { started: !!s.started, startedAt: parseSince(s.startedAt) };
}

/** Effective created-date floor: never before the sync-start moment. */
function effectiveSince(reqSince, startedAt) {
  const since = parseSince(reqSince) || parseSince(EPOCH);
  if (startedAt && startedAt > since) return startedAt;
  return since;
}

// ── GET /orders ──────────────────────────────────────────────
router.get('/orders', requireSecret, async (req, res, next) => {
  try {
    const limit = clampLimit(req.query.limit);
    const offset = clampOffset(req.query.offset);
    const { started, startedAt } = await getSyncState();

    if (!started) {
      return res.json({ success: true, count: 0, offset: 0, limit, has_more: false, orders: [], sync_started: false, plugin_version: PLUGIN_VERSION });
    }

    const modifiedSince = parseSince(req.query.modified_since);
    let q;
    let sort;
    if (modifiedSince) {
      // Reverse-sync feed: website status changes, paged by update time ascending.
      q = { updatedAt: { $gt: modifiedSince } };
      if (startedAt) q.createdAt = { $gt: startedAt };
      sort = { updatedAt: 1 };
    } else {
      q = { createdAt: { $gt: effectiveSince(req.query.since, startedAt) } };
      sort = { orderNumber: -1 }; // newest first
    }

    const rows = await Order.find(q).sort(sort).skip(offset).limit(limit).lean();

    const offerMap = Object.fromEntries(
      (await Offer.find().select('sku quantity').lean()).map((o) => [String(o._id), { sku: o.sku || '', quantity: o.quantity || 1 }])
    );

    const orders = rows.map((o) => {
      const om = offerMap[String(o.offerId)] || {};
      const code = om.sku || String(o.offerId);
      const pieces = (om.quantity || 1) * (o.quantity || 1); // total pieces
      const cf = o.customFields || {};
      const lastNote = (o.notes || []).slice(-1)[0]?.text || '';
      return {
        order_id: o.orderNumber,
        status: STATUS_TO_WOO[o.status] || o.status,
        total: o.total,
        billing_email: '',
        customer_name: o.customer?.name || '',
        phone: o.customer?.phone || '',
        address: o.customer?.address || '',
        items: `${o.offerTitle || ''} x${o.quantity || 1}`,
        line_items: [
          { name: o.offerTitle || '', product_code: code, product_qty: pieces, sku: om.sku || '', qty: o.quantity || 1, variation_id: 0 },
        ],
        payment_method: 'Cash on delivery',
        customer_note: '',
        tracking_number: o.courier?.trackingCode || '',
        admin_note: lastNote,
        utm_source: o.tracking?.utm?.source || o.source || '',
        campaign: o.tracking?.utm?.campaign || o.tracking?.campaignId || '',
        product_code: code,
        product_qty: pieces,
        size: cf.size != null ? String(cf.size) : '',
        color: cf.color != null ? String(cf.color) : '',
        color_note: '',
        date_created: toGmt(o.createdAt),
        date_updated: toGmt(o.updatedAt),
      };
    });

    res.json({
      success: true,
      count: orders.length,
      offset,
      limit,
      has_more: orders.length === limit,
      orders,
      sync_started: true,
      plugin_version: PLUGIN_VERSION,
    });
  } catch (e) {
    next(e);
  }
});

// ── GET /incomplete-orders ───────────────────────────────────
router.get('/incomplete-orders', requireSecret, async (req, res, next) => {
  try {
    const limit = clampLimit(req.query.limit);
    const offset = clampOffset(req.query.offset);
    const { started, startedAt } = await getSyncState();

    if (!started) {
      return res.json({ success: true, count: 0, offset: 0, limit, has_more: false, orders: [], sync_started: false, plugin_version: PLUGIN_VERSION });
    }

    const since = effectiveSince(req.query.since, startedAt);
    const rows = await IncompleteOrder.find({
      status: { $in: ['new', 'called'] },
      phoneValid: true,
      firstSeenAt: { $gt: since },
      'data.name': { $nin: [null, ''] },
      'data.address': { $nin: [null, ''] },
    })
      .sort({ _id: -1 })
      .skip(offset)
      .limit(limit)
      .populate('offerId', 'title')
      .lean();

    const orders = rows.map((c) => ({
      incomplete_id: String(c._id),
      name: c.data?.name || '',
      phone: c.phone || c.data?.phone || '',
      address: c.data?.address || '',
      items: c.offerId ? `${c.offerId.title || ''} x${Number(c.data?.quantity) || 1}` : '',
      status: c.status,
      created_at: toGmt(c.firstSeenAt || c.createdAt),
    }));

    res.json({
      success: true,
      count: orders.length,
      offset,
      limit,
      has_more: orders.length === limit,
      orders,
      sync_started: true,
      plugin_version: PLUGIN_VERSION,
    });
  } catch (e) {
    next(e);
  }
});

// ── GET /products ────────────────────────────────────────────
router.get('/products', requireSecret, async (req, res, next) => {
  try {
    const limit = clampLimit(req.query.limit);
    const offset = clampOffset(req.query.offset);
    const since = parseSince(req.query.since);

    const q = { active: true };
    if (since) q.updatedAt = { $gt: since };

    const rows = await Offer.find(q).sort({ _id: -1 }).skip(offset).limit(limit).lean();

    const products = rows.map((p) => ({
      product_id: String(p._id),
      parent_id: p.productId ? String(p.productId) : 0,
      type: 'simple',
      sku: p.sku || String(p._id),
      name: p.title,
      price: p.price,
      stock_quantity: null, // this funnel doesn't track stock
      stock_status: 'instock',
      manage_stock: false,
      variation: '',
      status: 'publish',
      date_modified: toGmt(p.updatedAt),
    }));

    res.json({
      success: true,
      count: products.length,
      offset,
      limit,
      has_more: products.length === limit,
      products,
    });
  } catch (e) {
    next(e);
  }
});

// ── POST /order-update (simple field update) ─────────────────
router.post('/order-update', async (req, res, next) => {
  try {
    const p = req.body || {};
    if (!secretOk(p.secret)) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const num_ = Number(p.order_id);
    if (!num_) return res.status(400).json({ success: false, message: 'order_id is required' });

    const order = await Order.findOne({ orderNumber: num_ });
    if (!order) return res.status(404).json({ success: false, message: 'order not found' });

    const updated = [];
    if (p.status) {
      const our = STATUS_FROM_WOO[String(p.status).toLowerCase()];
      if (our && order.status !== our) {
        order.status = our;
        order.statusHistory.push({ status: our, by: 'crm', at: new Date() });
        updated.push('status');
      }
    }
    if (p.tracking_number != null && p.tracking_number !== '') {
      order.courier.trackingCode = String(p.tracking_number);
      updated.push('tracking_number');
    }
    if (p.admin_note) {
      order.notes.push({ text: String(p.admin_note), by: 'crm', at: new Date() });
      updated.push('admin_note');
    }
    if (p.address != null && p.address !== '') {
      order.customer.address = String(p.address);
      updated.push('address');
    }
    if (p.amount != null && !isNaN(Number(p.amount))) {
      order.total = Number(p.amount);
      updated.push('amount');
    }

    if (!updated.length) return res.status(400).json({ success: false, message: 'No valid fields to update' });
    await order.save();
    res.json({ success: true, order_id: num_, updated, timestamp: toGmt(new Date()) });
  } catch (e) {
    next(e);
  }
});

// ── POST /order-sync (full declarative push, rev-guarded) ────
router.post('/order-sync', async (req, res, next) => {
  try {
    const p = req.body || {};
    if (!secretOk(p.secret)) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const num_ = Number(p.order_id);
    const order = num_ ? await Order.findOne({ orderNumber: num_ }) : null;
    if (!order) return res.status(404).json({ success: false, message: 'order not found' });

    // rev is the CRM's send time in ms; drop anything older than what we've applied.
    const rev = Number(p.rev) || 0;
    if (rev > 0 && (order.crmRev || 0) > rev) {
      return res.json({ success: true, order_id: num_, skipped: 'stale_rev' });
    }

    const applied = [];
    // Single-offer order: adopt the CRM's item summary where given.
    if (p.main && typeof p.main === 'object') {
      if (p.main.name) { order.offerTitle = String(p.main.name); applied.push('main_item'); }
      if (p.main.qty != null) order.quantity = Math.max(1, Number(p.main.qty) || order.quantity);
    }
    if (p.size_color != null) {
      order.variantSummary = String(p.size_color);
      applied.push('size_color');
    }
    if (p.address != null && p.address !== '') { order.customer.address = String(p.address); applied.push('address'); }
    if (p.admin_note != null && p.admin_note !== '') { order.notes.push({ text: String(p.admin_note), by: 'crm', at: new Date() }); applied.push('admin_note'); }
    if (p.tracking_number != null && p.tracking_number !== '') { order.courier.trackingCode = String(p.tracking_number); applied.push('tracking_number'); }
    // The CRM's total wins — it's what the courier collects.
    if (p.total != null && !isNaN(Number(p.total))) { order.total = Number(p.total); applied.push('total'); }
    if (p.status) {
      const our = STATUS_FROM_WOO[String(p.status).toLowerCase()];
      if (our && order.status !== our) {
        order.status = our;
        order.statusHistory.push({ status: our, by: 'crm', at: new Date() });
        applied.push('status');
      }
    }

    if (rev) order.crmRev = rev;
    await order.save();
    res.json({ success: true, order_id: num_, applied: [...new Set(applied)], total: order.total, timestamp: toGmt(new Date()) });
  } catch (e) {
    next(e);
  }
});

export default router;

// ── Admin helpers (used by admin routes) ─────────────────────
/** Current CRM-sync status for the admin panel. */
export async function getCrmStatus() {
  const s = (await getSetting('crmSync', null)) || {};
  return { started: !!s.started, startedAt: s.startedAt || null, secretSet: !!SECRET, basePath: '/api/dizara/v1' };
}
/** Start/stop the CRM order sync (records the start moment). */
export async function setCrmSync(started) {
  const cur = (await getSetting('crmSync', null)) || {};
  const value = started
    ? { started: true, startedAt: cur.startedAt || new Date().toISOString() }
    : { started: false, startedAt: cur.startedAt || null };
  await setSetting('crmSync', value);
  return value;
}
