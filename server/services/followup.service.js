import { IncompleteOrder } from '../models/index.js';
import { getSmsConfig, sendFollowUpSms } from './sms.service.js';
import { getSetting } from './settings.service.js';
import { reportError } from './systemErrors.js';

/**
 * One sweep: find abandoned checkouts that have a valid phone, are still 'new',
 * haven't had a follow-up yet, and have been idle longer than the configured
 * delay — then send the follow-up SMS and stamp followUpSentAt.
 *
 * Runs on an interval in the web process. Idempotent + safe to run often.
 */
export async function runFollowUpSweep() {
  const cfg = await getSmsConfig();
  if (!cfg.enabled || !cfg.followUpEnabled) return { sent: 0, skipped: true };

  const delayMs = (cfg.followUpDelayMinutes || 30) * 60 * 1000;
  const cutoff = new Date(Date.now() - delayMs);

  const candidates = await IncompleteOrder.find({
    phoneValid: true,
    status: 'new',
    followUpSentAt: null,
    lastActivityAt: { $lte: cutoff },
  }).limit(50);

  if (candidates.length === 0) return { sent: 0 };

  const storeInfo = (await getSetting('storeInfo', {})) || {};
  let sent = 0;
  for (const inc of candidates) {
    const result = await sendFollowUpSms(inc, storeInfo.phone);
    // Stamp regardless of success so we don't spam on repeated gateway errors.
    inc.followUpSentAt = new Date();
    await inc.save();
    if (result.ok) sent++;
  }
  console.log(`[followup] swept ${candidates.length}, sent ${sent}`);
  return { sent, swept: candidates.length };
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
