import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Admin, Order, ORDER_STATUSES } from '../models/index.js';
import { signAdminToken } from '../utils/jwt.js';
import { ADMIN_COOKIE_NAME } from '../middlewares/auth.js';
import { config } from '../config/index.js';
import { normalizePhone } from '../utils/phone.js';
import { sendToCourier, fraudCheck } from '../services/courier.service.js';

// The tenant this request belongs to (set by auth middleware), as an ObjectId
// (aggregate $match does not auto-cast). Every order query is scoped to it so
// accounts never read or mutate each other's orders.
function acct(req) {
  const id = req.accountId;
  return id && mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
}

/** POST /api/admin/login → sets httpOnly cookie + returns token & admin. */
export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Enter email and password.' });
    }
    const admin = await Admin.findOne({ email: String(email).toLowerCase().trim() });
    if (!admin || !admin.active) {
      return res.status(401).json({ error: 'Wrong email or password.' });
    }
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Wrong email or password.' });

    const token = signAdminToken(admin);
    res.cookie(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    res.json({ ok: true, token, admin: admin.toJSON() });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/logout → clears cookie. */
export function logout(req, res) {
  res.clearCookie(ADMIN_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
}

/** GET /api/admin/me → current admin (for session restore on refresh). */
export function me(req, res) {
  res.json({ admin: req.admin.toJSON() });
}

/**
 * GET /api/admin/orders
 * Query: status, source, search (phone/name), dateFrom, dateTo, page, limit.
 * Returns paginated orders plus per-status counts for the pipeline tabs.
 */
export async function listOrders(req, res, next) {
  try {
    const { status, source, search, dateFrom, dateTo } = req.query;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));

    const { funnel } = req.query;
    const accountId = acct(req);
    const filter = { accountId };
    if (funnel && mongoose.isValidObjectId(funnel)) filter.productId = new mongoose.Types.ObjectId(funnel);
    if (status && ORDER_STATUSES.includes(status)) filter.status = status;
    if (source) filter.source = source;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }
    if (search) {
      const term = String(search).trim();
      const phone = normalizePhone(term);
      const or = [{ 'customer.name': { $regex: term, $options: 'i' } }];
      if (phone) or.push({ 'customer.phone': phone });
      else or.push({ 'customer.phone': { $regex: term.replace(/\D/g, ''), $options: 'i' } });
      const asNum = parseInt(term, 10);
      if (!Number.isNaN(asNum)) or.push({ orderNumber: asNum });
      filter.$or = or;
    }

    // Status chips count within this account (and the selected funnel, if any).
    const countMatch = filter.productId ? { accountId, productId: filter.productId } : { accountId };

    const [orders, total, statusCounts] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
      Order.aggregate([{ $match: countMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    const counts = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));

    res.json({
      orders,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      statusCounts: counts,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/orders/:id → full detail + same-phone history. */
export async function getOrder(req, res, next) {
  try {
    const accountId = acct(req);
    const order = await Order.findOne({ _id: req.params.id, accountId }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const history = await Order.find({
      accountId,
      'customer.phone': order.customer.phone,
      _id: { $ne: order._id },
    })
      .sort({ createdAt: -1 })
      .select('orderNumber status total createdAt')
      .lean();

    res.json({ order, phoneHistory: history });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/orders/:id/status → update status + append history. */
export async function updateStatus(req, res, next) {
  try {
    const { status } = req.body || {};
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    const order = await Order.findOne({ _id: req.params.id, accountId: acct(req) });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    order.status = status;
    order.statusHistory.push({ status, by: req.admin.name, at: new Date() });
    await order.save();
    res.json({ ok: true, order: order.toJSON() });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/orders/:id/notes → append an admin note with author+time. */
export async function addNote(req, res, next) {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'A note cannot be empty.' });

    const order = await Order.findOne({ _id: req.params.id, accountId: acct(req) });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    order.notes.push({ text, by: req.admin.name, at: new Date() });
    await order.save();
    res.json({ ok: true, notes: order.notes });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/orders/:id/courier → create consignment, save tracking. */
export async function sendCourier(req, res, next) {
  try {
    const order = await Order.findOne({ _id: req.params.id, accountId: acct(req) });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.courier?.consignmentId) {
      return res.status(400).json({ error: 'This order has already been sent to the courier.' });
    }

    const result = await sendToCourier(order);
    if (!result.ok) return res.status(502).json({ error: result.error || 'Could not send to the courier.', response: result.response });

    order.courier = { provider: result.provider, consignmentId: result.consignmentId, trackingCode: result.trackingCode };
    if (order.status === 'new' || order.status === 'confirmed') {
      order.status = 'shipped';
      order.statusHistory.push({ status: 'shipped', by: req.admin.name, at: new Date() });
    }
    await order.save();
    res.json({ ok: true, order: order.toJSON() });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/orders/:id/fraud → phone delivery-success history. */
export async function fraudCheckOrder(req, res, next) {
  try {
    const order = await Order.findOne({ _id: req.params.id, accountId: acct(req) }).select('customer.phone').lean();
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json(await fraudCheck(order.customer.phone));
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/orders/bulk/status → { ids:[], status } */
export async function bulkStatus(req, res, next) {
  try {
    const { ids = [], status } = req.body || {};
    if (!ORDER_STATUSES.includes(status) || !Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'Invalid request.' });
    }
    const r = await Order.updateMany(
      { _id: { $in: ids }, accountId: acct(req) },
      { $set: { status }, $push: { statusHistory: { status, by: req.admin.name, at: new Date() } } }
    );
    res.json({ ok: true, updated: r.modifiedCount });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/orders/bulk/courier → send many to courier. */
export async function bulkCourier(req, res, next) {
  try {
    const { ids = [] } = req.body || {};
    const orders = await Order.find({ _id: { $in: ids }, accountId: acct(req), 'courier.consignmentId': { $in: ['', null] } });
    let sent = 0;
    const failures = [];
    for (const order of orders) {
      const result = await sendToCourier(order);
      if (result.ok) {
        order.courier = { provider: result.provider, consignmentId: result.consignmentId, trackingCode: result.trackingCode };
        if (order.status === 'new' || order.status === 'confirmed') {
          order.status = 'shipped';
          order.statusHistory.push({ status: 'shipped', by: req.admin.name, at: new Date() });
        }
        await order.save();
        sent++;
      } else {
        failures.push({ orderNumber: order.orderNumber, error: result.error });
      }
    }
    res.json({ ok: true, sent, failures });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/orders/export → CSV of filtered orders. */
export async function exportOrders(req, res, next) {
  try {
    const { status, source, search, dateFrom, dateTo, funnel } = req.query;
    const filter = { accountId: acct(req) };
    if (funnel && mongoose.isValidObjectId(funnel)) filter.productId = new mongoose.Types.ObjectId(funnel);
    if (status && ORDER_STATUSES.includes(status)) filter.status = status;
    if (source) filter.source = source;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }
    if (search) {
      const phone = normalizePhone(search);
      filter.$or = [{ 'customer.name': { $regex: String(search).trim(), $options: 'i' } }];
      if (phone) filter.$or.push({ 'customer.phone': phone });
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(5000).lean();
    const cols = ['Order', 'Date', 'Name', 'Phone', 'Address', 'Offer', 'Variants', 'Qty', 'Subtotal', 'Delivery', 'Total', 'Status', 'Source', 'Courier', 'Tracking'];
    const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = orders.map((o) => {
      const variantStr = o.variantSummary || Object.entries(o.customFields || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
      return [
        o.orderNumber, new Date(o.createdAt).toISOString(), o.customer.name, o.customer.phone, o.customer.address,
        o.offerTitle, variantStr, o.quantity, o.subtotal, o.deliveryCharge, o.total, o.status, o.source,
        o.courier?.provider || '', o.courier?.trackingCode || '',
      ].map(esc).join(',');
    });
    const csv = '﻿' + cols.join(',') + '\n' + rows.join('\n'); // BOM for Excel/Bengali

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

export default {
  login, logout, me, listOrders, getOrder, updateStatus, addNote, sendCourier, fraudCheckOrder,
  bulkStatus, bulkCourier, exportOrders,
};
