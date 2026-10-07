import { Router } from 'express';
import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { Order, IncompleteOrder, Offer } from '../models/index.js';

/**
 * Read-only ingest feed for the SafeCommerce CRM. The CRM polls these endpoints
 * with a shared secret (query ?secret= or header X-Dizara-Secret) and reads the
 * JSON. One optional write endpoint (/order-sync) lets the CRM push a status
 * change back. Mounted at /api/dizara/v1 (see app.js).
 */
const router = Router();
const SECRET = config.crm.secret;
const PLUGIN_VERSION = '1.9.9'; // tells the CRM that modified_since status sync is supported

/** "YYYY-MM-DD HH:MM:SS" in GMT/UTC, as the CRM expects. */
function toGmt(d) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 19).replace('T', ' ');
}

// Our status → CRM (WooCommerce-style) and back.
const STATUS_TO_CRM = {
  new: 'pending',
  confirmed: 'processing',
  shipped: 'processing',
  delivered: 'completed',
  cancelled: 'cancelled',
  returned: 'refunded',
  hold: 'on-hold',
};
const STATUS_FROM_CRM = {
  pending: 'new',
  processing: 'confirmed',
  'on-hold': 'hold',
  completed: 'delivered',
  shipped: 'shipped',
  cancelled: 'cancelled',
  refunded: 'returned',
  returned: 'returned',
  failed: 'cancelled',
};

function secretOk(provided) {
  if (!SECRET) return false; // feed stays closed until a secret is configured
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Auth for the GET feeds: secret via query string or header. */
function requireSecret(req, res, next) {
  const provided = req.query.secret || req.get('X-Dizara-Secret') || '';
  if (!secretOk(provided)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

function lineItems(name, code, qty) {
  return [{ name: name || '', product_code: code ? String(code) : '', qty: Number(qty) || 1 }];
}

/** Parse a "YYYY-MM-DD HH:MM:SS" (GMT) or ISO string to a Date, or null. */
function parseSince(s) {
  if (!s) return null;
  const str = String(s).trim();
  const hasTz = /[zZ]|[+-]\d\d:?\d\d$/.test(str);
  const d = new Date(str.replace(' ', 'T') + (hasTz ? '' : 'Z'));
  return isNaN(d.getTime()) ? null : d;
}

// ── GET /orders ──────────────────────────────────────────────
router.get('/orders', requireSecret, async (req, res, next) => {
  try {
    const q = {};
    const since = parseSince(req.query.modified_since);
    if (since) q.updatedAt = { $gte: since };

    const perPage = Math.min(Math.max(parseInt(req.query.per_page, 10) || 100, 1), 500);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const rows = await Order.find(q)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .lean();

    res.json({
      plugin_version: PLUGIN_VERSION,
      orders: rows.map((o) => ({
        order_id: o.orderNumber,
        status: STATUS_TO_CRM[o.status] || o.status,
        customer_name: o.customer?.name || '',
        phone: o.customer?.phone || '',
        address: o.customer?.address || '',
        line_items: lineItems(o.offerTitle, o.offerId, o.quantity),
        size_color: o.variantSummary || '',
        total: o.total,
        date_created: toGmt(o.createdAt),
        date_updated: toGmt(o.updatedAt),
      })),
    });
  } catch (e) {
    next(e);
  }
});

// ── GET /incomplete-orders ───────────────────────────────────
router.get('/incomplete-orders', requireSecret, async (req, res, next) => {
  try {
    const rows = await IncompleteOrder.find({ status: { $in: ['new', 'called'] }, phoneValid: true })
      .sort({ lastActivityAt: -1 })
      .limit(500)
      .populate('offerId', 'title')
      .lean();

    res.json(
      rows.map((c) => ({
        incomplete_id: String(c._id),
        name: c.data?.name || '',
        phone: c.phone || c.data?.phone || '',
        address: c.data?.address || '',
        line_items: c.offerId ? lineItems(c.offerId.title, c.offerId._id, c.data?.quantity || 1) : [],
        created_at: toGmt(c.firstSeenAt || c.createdAt),
      }))
    );
  } catch (e) {
    next(e);
  }
});

// ── GET /products ────────────────────────────────────────────
router.get('/products', requireSecret, async (req, res, next) => {
  try {
    const rows = await Offer.find({ active: true }).sort({ order: 1 }).lean();
    res.json(
      rows.map((p) => ({
        product_id: String(p._id),
        sku: String(p._id),
        name: p.title,
        price: p.price,
        stock_quantity: null, // this funnel doesn't track stock
        variation: null,
      }))
    );
  } catch (e) {
    next(e);
  }
});

// ── Optional: pretend to be the old plugin (always empty) ────
router.get('/orders-missing-code', requireSecret, (_req, res) => res.json([]));

// ── Optional: CRM → site reverse status sync ─────────────────
router.post('/order-sync', async (req, res, next) => {
  try {
    const { secret, order_id, rev, status } = req.body || {};
    if (!secretOk(secret)) return res.status(401).json({ error: 'unauthorized' });

    const ourStatus = STATUS_FROM_CRM[String(status || '').toLowerCase()];
    const num = Number(order_id);
    if (!ourStatus || !num) return res.json({ ok: true }); // nothing actionable

    const order = await Order.findOne({ orderNumber: num });
    if (!order) return res.json({ ok: true });

    const r = Number(rev) || 0;
    if (r && r <= (order.crmRev || 0)) return res.json({ ok: true }); // stale revision

    if (order.status !== ourStatus) {
      order.status = ourStatus;
      order.statusHistory.push({ status: ourStatus, by: 'crm', at: new Date() });
    }
    if (r) order.crmRev = r;
    await order.save();

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
