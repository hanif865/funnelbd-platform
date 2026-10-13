import { IncompleteOrder } from '../models/index.js';
import { getSmsConfig, sendFollowUpSms } from './sms.service.js';
import { getFunnelSetting } from './settings.service.js';
import { reportError } from './systemErrors.js';

/**
 * One sweep across all tenants: find abandoned checkouts (valid phone, still
 * 'new', no follow-up yet) and, per the owning account's SMS config, send a
 * follow-up SMS once they've been idle past that account's delay.
 *
 * Runs on an interval in the web process. Idempotent + safe to run often.
 * Gating (enabled / delay / store phone) is resolved per account, since each
 * tenant has its own SMS gateway and settings.
 */
export async function runFollowUpSweep() {
  const candidates = await IncompleteOrder.find({
    phoneValid: true,
    status: 'new',
    followUpSentAt: null,
  }).sort({ lastActivityAt: 1 }).limit(100);

  if (candidates.length === 0) return { sent: 0 };

  const cfgCache = new Map(); // accountId → SMS config (settings are cached anyway)
  const cfgFor = async (accountId) => {
    const key = accountId ? String(accountId) : 'null';
    if (!cfgCache.has(key)) cfgCache.set(key, await getSmsConfig(accountId));
    return cfgCache.get(key);
  };

  const now = Date.now();
  let sent = 0;
  let swept = 0;
  for (const inc of candidates) {
    const cfg = await cfgFor(inc.accountId);
    if (!cfg.enabled || !cfg.followUpEnabled) continue;
    const delayMs = (cfg.followUpDelayMinutes || 30) * 60 * 1000;
    if (new Date(inc.lastActivityAt).getTime() > now - delayMs) continue; // not idle long enough yet

    const storeInfo = (await getFunnelSetting('storeInfo', inc.productId, inc.accountId || null, {})) || {};
    const storePhone = storeInfo.phone || (storeInfo.phones && storeInfo.phones[0] && storeInfo.phones[0].number) || '';
    const result = await sendFollowUpSms(inc, storePhone);
    // Stamp regardless of success so we don't spam on repeated gateway errors.
    inc.followUpSentAt = new Date();
    await inc.save();
    swept++;
    if (result.ok) sent++;
  }
  if (swept) console.log(`[followup] swept ${swept}, sent ${sent}`);
  return { sent, swept };
}

let timer = null;
/** Start the periodic sweep (default every 5 minutes). Web process only. */
export function startFollowUpSweep(intervalMs = 5 * 60 * 1000) {
  if (timer) return;
  timer = setInterval(() => {
    runFollowUpSweep().catch((e) => reportError('followup', e));
  }, intervalMs);
  timer.unref?.(); // don't keep the process alive just for this
  console.log('[followup] auto follow-up sweep scheduled');
}

export default { runFollowUpSweep, startFollowUpSweep };
