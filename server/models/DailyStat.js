import mongoose from 'mongoose';

/**
 * Per-day traffic counters for the dashboard conversion rate. `date` is a
 * 'YYYY-MM-DD' string (server local). visits = total landing loads; visitors =
 * loads where the session cookie was freshly minted (≈ unique visitors).
 */
const dailyStatSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, unique: true },
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

dailyStatSchema.statics.track = function (isNewVisitor) {
  const date = new Date().toISOString().slice(0, 10);
  return this.updateOne(
    { date },
    { $inc: { visits: 1, visitors: isNewVisitor ? 1 : 0 } },
    { upsert: true }
  );
};

/** Count one interaction (call/whatsapp/order_click) for today. */
dailyStatSchema.statics.recordEvent = function (name, count = 1) {
  if (!name || typeof name !== 'string') return;
  const date = new Date().toISOString().slice(0, 10);
  return this.updateOne(
    { date },
    { $inc: { [`events.${name}`]: count } },
    { upsert: true }
  );
};

dailyStatSchema.statics.recordSectionDwell = async function ({ date, dwell = {}, exitSection = '', views = [] } = {}) {
  const targetDate = date || new Date().toISOString().slice(0, 10);
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
    { date: targetDate },
    { $inc: inc },
    { upsert: true }
  );
};

export const DailyStat = mongoose.model('DailyStat', dailyStatSchema);
export default DailyStat;
