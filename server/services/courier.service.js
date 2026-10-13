import { getSetting, setSetting } from './settings.service.js';
import { Order } from '../models/index.js';
import { toLocal } from '../utils/phone.js';

/**
 * Courier integration (Steadfast + Pathao) and fraud checking.
 *
 * Config lives in settings key 'courier'. Steadfast is a simple API-key POST;
 * Pathao is OAuth (token then create). Fraud check works from our OWN order
 * history out of the box (this phone's delivered vs returned/cancelled rate),
 * with an optional external courier fraud API on top.
 */
export const COURIER_SETTING_KEY = 'courier';

export const COURIER_DEFAULTS = {
  provider: '', // 'steadfast' | 'pathao'
  steadfast: { enabled: false, apiKey: '', secretKey: '', baseUrl: 'https://portal.packzy.com/api/v1' },
  pathao: {
    enabled: false, clientId: '', clientSecret: '', username: '', password: '',
    storeId: '', baseUrl: 'https://api-hermes.pathao.com',
  },
  fraudCheck: { externalEnabled: false, apiUrl: '', apiKey: '' },
};

export async function getCourierConfig(accountId = null) {
  const stored = (await getSetting(COURIER_SETTING_KEY, accountId, {})) || {};
  return {
    ...COURIER_DEFAULTS,
    ...stored,
    steadfast: { ...COURIER_DEFAULTS.steadfast, ...(stored.steadfast || {}) },
    pathao: { ...COURIER_DEFAULTS.pathao, ...(stored.pathao || {}) },
    fraudCheck: { ...COURIER_DEFAULTS.fraudCheck, ...(stored.fraudCheck || {}) },
  };
}
export async function saveCourierConfig(cfg, accountId = null) { return setSetting(COURIER_SETTING_KEY, accountId, cfg); }

// ── Steadfast ───────────────────────────────────────────────
async function steadfastCreate(cfg, order) {
  const res = await fetch(cfg.baseUrl.replace(/\/$/, '') + '/create_order', {
    method: 'POST',
    headers: { 'Api-Key': cfg.apiKey, 'Secret-Key': cfg.secretKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invoice: String(order.orderNumber),
      recipient_name: order.customer.name,
      recipient_phone: toLocal(order.customer.phone),
      recipient_address: order.customer.address,
      cod_amount: order.total,
      note: [order.offerTitle, order.variantSummary, order.notes?.[0]?.text].filter(Boolean).join(' | '),
    }),
  });
  const data = await res.json().catch(() => ({}));
  const c = data.consignment || {};
  const ok = res.ok && (c.consignment_id || c.tracking_code);
  return {
    ok: !!ok,
    consignmentId: c.consignment_id ? String(c.consignment_id) : '',
    trackingCode: c.tracking_code || '',
    response: data,
    error: ok ? '' : data.message || `HTTP ${res.status}`,
  };
}

// ── Pathao (OAuth then create) ──────────────────────────────
async function pathaoToken(cfg) {
  const res = await fetch(cfg.baseUrl.replace(/\/$/, '') + '/aladdin/api/v1/issue-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: cfg.clientId, client_secret: cfg.clientSecret,
      grant_type: 'password', username: cfg.username, password: cfg.password,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return data.access_token || '';
}

async function pathaoCreate(cfg, order) {
  const token = await pathaoToken(cfg);
  if (!token) return { ok: false, error: 'Pathao token not found', response: null };
  const res = await fetch(cfg.baseUrl.replace(/\/$/, '') + '/aladdin/api/v1/orders', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      store_id: cfg.storeId,
      recipient_name: order.customer.name,
      recipient_phone: toLocal(order.customer.phone),
      recipient_address: order.customer.address,
      delivery_type: 48,
      item_type: 2,
      item_quantity: order.quantity,
      amount_to_collect: order.total,
      merchant_order_id: String(order.orderNumber),
    }),
  });
  const data = await res.json().catch(() => ({}));
  const cid = data.data?.consignment_id;
  const ok = res.ok && cid;
  return { ok: !!ok, consignmentId: cid ? String(cid) : '', trackingCode: cid ? String(cid) : '', response: data, error: ok ? '' : data.message || `HTTP ${res.status}` };
}

/**
 * Create a consignment for an order with the active provider. Never throws;
 * returns a structured result the caller persists / reports.
 */
export async function sendToCourier(order) {
  const cfg = await getCourierConfig(order.accountId);
  const provider = cfg.provider;
  try {
    if (provider === 'steadfast') {
      if (!cfg.steadfast.enabled || !cfg.steadfast.apiKey) return { ok: false, error: 'Steadfast is not configured.' };
      return { provider, ...(await steadfastCreate(cfg.steadfast, order)) };
    }
    if (provider === 'pathao') {
      if (!cfg.pathao.enabled || !cfg.pathao.clientId) return { ok: false, error: 'Pathao is not configured.' };
      return { provider, ...(await pathaoCreate(cfg.pathao, order)) };
    }
    return { ok: false, error: 'No courier provider is selected (Settings).' };
  } catch (err) {
    return { ok: false, provider, error: err.message, response: null };
  }
}

/**
 * Fraud signal for a phone. Internal: our own delivered vs returned/cancelled
 * history. Optional: an external courier fraud API if configured.
 */
export async function fraudCheck(phone, accountId = null) {
  const norm = toLocal(phone);
  const orders = await Order.find({ accountId, 'customer.phone': norm })
    .select('status total createdAt orderNumber')
    .lean();

  const total = orders.length;
  const delivered = orders.filter((o) => o.status === 'delivered').length;
  const failed = orders.filter((o) => ['returned', 'cancelled'].includes(o.status)).length;
  const settled = delivered + failed;
  const successRate = settled ? Math.round((delivered / settled) * 100) : null;

  const internal = { totalOrders: total, delivered, failed, successRate };

  // Optional external fraud API.
  let external = null;
  const cfg = await getCourierConfig(accountId);
  if (cfg.fraudCheck.externalEnabled && cfg.fraudCheck.apiUrl) {
    try {
      const url = cfg.fraudCheck.apiUrl + (cfg.fraudCheck.apiUrl.includes('?') ? '&' : '?') + 'phone=' + encodeURIComponent(norm);
      const res = await fetch(url, { headers: cfg.fraudCheck.apiKey ? { Authorization: 'Bearer ' + cfg.fraudCheck.apiKey } : {} });
      external = await res.json().catch(() => ({ error: 'invalid response' }));
    } catch (e) {
      external = { error: e.message };
    }
  }

  // Simple risk verdict from internal signal.
  let verdict = 'unknown';
  if (successRate !== null) verdict = successRate >= 80 ? 'good' : successRate >= 50 ? 'caution' : 'risky';

  return { phone: norm, verdict, internal, external, history: orders };
}

export default { getCourierConfig, saveCourierConfig, sendToCourier, fraudCheck };
