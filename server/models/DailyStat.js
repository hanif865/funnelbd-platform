import mongoose from 'mongoose';
import { dhakaYmd } from '../utils/time.js';

/**
 * Per-day, per-funnel traffic counters for the dashboard. `date` is a
 * 'YYYY-MM-DD' string (Dhaka). `productId` is the funnel (null = legacy /
 * pre-multi-funnel traffic). visits = total landing loads; visitors = loads
 * where the session cookie was freshly minted (≈ unique visitors).
 *
 * One doc per (date, productId). The dashboard sums across funnels for the
 * overall view, or filters by productId for a single funnel.
 */
const dailyStatSchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    visits: { type: Number, default: 0 },
    visitors: { type: Number, default: 0 },
    sectionDwell: { type: Map, of: Number, default: {} },
    sectionExits: { type: Map, of: Number, default: {} },
    sectionViews: { type: Map, of: Number, default: {} },
    // Interaction counters, e.g. { call: 12, whatsapp: 7, order_click: 30 }.
    events: { type: Map, of: Number, default: {} },
  },
  { collection: 'daily_stats' }
);

// One row per funnel per day (null productId = legacy/global bucket).
dailyStatSchema.index({ date: 1, productId: 1 }, { unique: true });

function toPid(productId) {
  if (!productId) return null;
  try { return new mongoose.Types.ObjectId(productId); } catch { return null; }
}

dailyStatSchema.statics.track = function (isNewVisitor, productId = null) {
  const date = dhakaYmd();
  return this.updateOne(
    { date, productId: toPid(productId) },
    { $inc: { visits: 1, visitors: isNewVisitor ? 1 : 0 } },
    { upsert: true }
  );
};

/** Count one interaction (call/whatsapp/order_click) for today. */
dailyStatSchema.statics.recordEvent = function (name, productId = null, count = 1) {
  if (!name || typeof name !== 'string') return;
  const date = dhakaYmd();
  return this.updateOne(
    { date, productId: toPid(productId) },
    { $inc: { [`events.${name}`]: count } },
    { upsert: true }
  );
};

dailyStatSchema.statics.recordSectionDwell = async function ({ date, productId = null, dwell = {}, exitSection = '', views = [] } = {}) {
  const targetDate = date || dhakaYmd();
  const inc = {};

  if (exitSection && typeof exitSection === 'string') {
    inc[`sectionExits.${exitSection}`] = 1;
  }

  if (dwell && typeof dwell === 'object') {
    for (const [sec, secs] of Object.entries(dwell)) {
      const s = Number(secs) || 0;
      if (s > 0 && s < 1800) { // cap single interval at 30 mins
        inc[`sectionDwell.${sec}`] = Math.round(s);
      }
    }
  }

  if (Array.isArray(views)) {
    for (const sec of views) {
      if (typeof sec === 'string' && sec) {
        inc[`sectionViews.${sec}`] = 1;
      }
    }
  }

  if (Object.keys(inc).length === 0) return;

  return this.updateOne(
    { date: targetDate, productId: toPid(productId) },
    { $inc: inc },
    { upsert: true }
  );
};

export const DailyStat = mongoose.model('DailyStat', dailyStatSchema);
export default DailyStat;
