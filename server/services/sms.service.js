import { getSetting } from './settings.service.js';
import { toLocal } from '../utils/phone.js';

/**
 * Configurable SMS gateway. BD gateways (sms.net.bd, bulksmsbd, etc.) mostly
 * accept a simple GET/POST with api key + sender + to + message params, so the
 * config lets the admin map those param names without code changes.
 */
export const SMS_SETTING_KEY = 'sms';

export const SMS_DEFAULTS = {
  enabled: false,
  apiUrl: '',
  method: 'GET', // GET | POST
  apiKey: '',
  senderId: '',
  paramNames: { to: 'to', message: 'msg', apiKey: 'api_key', sender: 'sender_id' },
  extraParams: {}, // any additional fixed params the gateway needs
  followUpEnabled: false,
  followUpDelayMinutes: 30,
  templates: {
    confirmation:
      'ধন্যবাদ {{name}}! আপনার অর্ডার #{{orderNumber}} ({{total}}৳) আমরা পেয়েছি। শীঘ্রই কল করে কনফার্ম করব।',
    followUp:
      'আপনার অর্ডারটি সম্পন্ন হয়নি। অর্ডার করতে কল করুন: {{storePhone}}',
  },
};

export async function getSmsConfig() {
  const stored = (await getSetting(SMS_SETTING_KEY, {})) || {};
  return {
    ...SMS_DEFAULTS,
    ...stored,
    paramNames: { ...SMS_DEFAULTS.paramNames, ...(stored.paramNames || {}) },
    templates: { ...SMS_DEFAULTS.templates, ...(stored.templates || {}) },
  };
}

/** Replace {{key}} placeholders in a template string. */
export function renderTemplate(tpl, vars = {}) {
  return String(tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) =>
    vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''
  );
}

/**
 * Low-level send. Returns { ok, skipped?, status, response, error }.
 * Never throws — SMS is best-effort and must not break the order flow.
 */
export async function sendSms(phone, message, cfg) {
  cfg = cfg || (await getSmsConfig());
  if (!cfg.enabled || !cfg.apiUrl) return { ok: false, skipped: true, error: 'sms disabled or no apiUrl' };

  const to = toLocal(phone);
  if (!to) return { ok: false, skipped: true, error: 'invalid phone' };

  const p = cfg.paramNames;
  const params = { ...(cfg.extraParams || {}) };
  params[p.to] = to;
  params[p.message] = message;
  if (cfg.apiKey) params[p.apiKey] = cfg.apiKey;
  if (cfg.senderId) params[p.sender] = cfg.senderId;

  try {
    let res;
    if ((cfg.method || 'GET').toUpperCase() === 'POST') {
      res = await fetch(cfg.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
      });
    } else {
      const url = cfg.apiUrl + (cfg.apiUrl.includes('?') ? '&' : '?') + new URLSearchParams(params).toString();
      res = await fetch(url, { method: 'GET' });
    }
    const text = await res.text().catch(() => '');
    const ok = res.ok;
    if (!ok) console.warn('[sms] send failed:', res.status, text.slice(0, 120));
    else console.log(`[sms] sent to ${to}: "${message.slice(0, 40)}..."`);
    return { ok, status: res.status, response: text.slice(0, 500), error: ok ? '' : `HTTP ${res.status}` };
  } catch (err) {
    console.error('[sms] error:', err.message);
    return { ok: false, status: 0, response: null, error: err.message };
  }
}

/** Order confirmation SMS. */
export async function sendConfirmationSms(order) {
  const cfg = await getSmsConfig();
  if (!cfg.enabled || !cfg.templates.confirmation) return { ok: false, skipped: true };
  const message = renderTemplate(cfg.templates.confirmation, {
    name: order.customer?.name || '',
    orderNumber: order.orderNumber,
    total: order.total,
    phone: order.customer?.phone || '',
  });
  return sendSms(order.customer?.phone, message, cfg);
}

/** Follow-up SMS for an abandoned checkout. */
export async function sendFollowUpSms(incomplete, storePhone) {
  const cfg = await getSmsConfig();
  if (!cfg.enabled || !cfg.templates.followUp) return { ok: false, skipped: true };
  const message = renderTemplate(cfg.templates.followUp, {
    name: incomplete.data?.name || '',
    storePhone: storePhone || '',
  });
  return sendSms(incomplete.phone, message, cfg);
}

export default { getSmsConfig, sendSms, sendConfirmationSms, sendFollowUpSms, renderTemplate };
