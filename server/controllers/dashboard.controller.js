import mongoose from 'mongoose';
import { Order, IncompleteOrder, DailyStat } from '../models/index.js';
import { dhakaStartOf as startOf, dhakaYmd, DHAKA_TZ } from '../utils/time.js';

/** Orders + revenue in [from, to). Revenue excludes cancelled/returned. */
async function rangeStats(from, to, base = {}) {
  const match = { ...base, createdAt: { $gte: from, ...(to ? { $lt: to } : {}) } };
  const [agg] = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        orders: { $sum: 1 },
        revenue: { $sum: { $cond: [{ $in: ['$status', ['cancelled', 'returned']] }, 0, '$total'] } },
      },
    },
  ]);
  return { orders: agg?.orders || 0, revenue: agg?.revenue || 0 };
}

/** Sum a Map-or-object field across DailyStat docs into a plain object. */
function sumMaps(docs, field) {
  const out = {};
  for (const d of docs) {
    const m = d[field];
    const obj = m instanceof Map ? Object.fromEntries(m) : (m || {});
    for (const [k, v] of Object.entries(obj)) out[k] = (out[k] || 0) + (Number(v) || 0);
  }
  return out;
}

/** GET /api/admin/dashboard → all the numbers the dashboard shows.
 *  ?funnel=<id> scopes everything to one funnel; omitted = all funnels. */
export async function getDashboard(req, res, next) {
  try {
    const now = new Date();
    const todayStart = startOf(0);
    const yesterdayStart = startOf(1);
    const weekStart = startOf(6);
    const monthStart = startOf(29);

    // Tenant scope + optional funnel scope. Empty funnel = all this account's.
    // Cast to ObjectId: aggregate $match does NOT auto-cast like find() does.
    const accountId = req.accountId && mongoose.isValidObjectId(req.accountId)
      ? new mongoose.Types.ObjectId(req.accountId)
      : null;
    const funnel = req.query.funnel;
    const pid = funnel && mongoose.isValidObjectId(funnel) ? new mongoose.Types.ObjectId(funnel) : null;
    const orderMatch = pid ? { accountId, productId: pid } : { accountId };
    const statMatch = pid ? { accountId, productId: pid } : { accountId };

    const [today, yesterday, week, month] = await Promise.all([
      rangeStats(todayStart, null, orderMatch),
      rangeStats(yesterdayStart, todayStart, orderMatch),
      rangeStats(weekStart, null, orderMatch),
      rangeStats(monthStart, null, orderMatch),
    ]);

    const aov = month.orders ? Math.round(month.revenue / month.orders) : 0;

    // Conversion: month orders ÷ month unique visitors (summed across the scope).
    const monthDate = dhakaYmd(monthStart);
    const visitAgg = await DailyStat.aggregate([
      { $match: { ...statMatch, date: { $gte: monthDate } } },
      { $group: { _id: null, visitors: { $sum: '$visitors' }, visits: { $sum: '$visits' } } },
    ]);
    const visitors = visitAgg[0]?.visitors || 0;
    const conversionRate = visitors ? +((month.orders / visitors) * 100).toFixed(1) : null;

    // Today at a glance: unique visitors, visits and interaction clicks
    // (call / whatsapp / order-button), summed across the scope's docs for today.
    const todayKey = dhakaYmd();
    const todayStats = await DailyStat.find({ ...statMatch, date: todayKey }).lean();
    const todayVisits = todayStats.reduce((s, d) => s + (d.visits || 0), 0);
    const todayVisitors = todayStats.reduce((s, d) => s + (d.visitors || 0), 0);
    const todayEvents = sumMaps(todayStats, 'events');
    const todayDetail = {
      visitors: todayVisitors,
      visits: todayVisits,
      orders: today.orders,
      revenue: today.revenue,
      calls: todayEvents.call || 0,
      whatsapp: todayEvents.whatsapp || 0,
      orderClicks: todayEvents.order_click || 0,
    };

    // Incomplete + recovery (scoped).
    const [incompleteActive, incompleteConverted, incompleteTotal] = await Promise.all([
      IncompleteOrder.countDocuments({ ...orderMatch, status: { $in: ['new', 'called'] } }),
      IncompleteOrder.countDocuments({ ...orderMatch, status: 'converted' }),
      IncompleteOrder.countDocuments({ ...orderMatch }),
    ]);
    const recoveryRate = incompleteTotal ? +((incompleteConverted / incompleteTotal) * 100).toFixed(1) : null;

    // Source breakdown (month).
    const sources = await Order.aggregate([
      { $match: { ...orderMatch, createdAt: { $gte: monthStart } } },
      { $group: { _id: '$source', count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      { $sort: { count: -1 } },
    ]);

    // Status pipeline counts (all-time, scoped).
    const statusAgg = await Order.aggregate([
      { $match: orderMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    // 30-day daily series (orders + revenue).
    const daily = await Order.aggregate([
      { $match: { ...orderMatch, createdAt: { $gte: monthStart } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: DHAKA_TZ } },
          orders: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $in: ['$status', ['cancelled', 'returned']] }, 0, '$total'] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    // Fill missing days with zeros.
    const series = [];
    for (let i = 29; i >= 0; i--) {
      const key = dhakaYmd(startOf(i));
      const found = daily.find((d) => d._id === key);
      series.push({ date: key, orders: found?.orders || 0, revenue: found?.revenue || 0 });
    }

    const recent = await Order.find(orderMatch).sort({ createdAt: -1 }).limit(10)
      .select('orderNumber customer.name customer.phone total status source createdAt').lean();

    // Section dwell time & exit drop-off analytics (30-day aggregate, scoped).
    const SECTION_LABELS = {
      checkout: 'Checkout form & packages',
      hero_showcase: 'Product gallery & showcase',
      benefits: 'Benefits & features',
      reviews: 'Customer reviews',
      size_chart: 'Size chart guide',
      usage: 'Usage instructions',
      product_video: 'Video demo',
      top_banner: 'Top banner',
      info_bar: 'Info bar',
      footer: 'Footer & helpline',
    };

    const sectionStats = await DailyStat.find({ ...statMatch, date: { $gte: monthDate } }).lean();
    const sectionDwellAgg = sumMaps(sectionStats, 'sectionDwell');
    const sectionExitsAgg = sumMaps(sectionStats, 'sectionExits');
    const sectionViewsAgg = sumMaps(sectionStats, 'sectionViews');

    const allKeys = new Set([...Object.keys(SECTION_LABELS), ...Object.keys(sectionDwellAgg), ...Object.keys(sectionExitsAgg)]);
    const sectionAnalytics = Array.from(allKeys).map((key) => ({
      key,
      label: SECTION_LABELS[key] || key,
      dwellSeconds: sectionDwellAgg[key] || 0,
      exits: sectionExitsAgg[key] || 0,
      views: sectionViewsAgg[key] || 0,
    })).sort((a, b) => b.dwellSeconds - a.dwellSeconds);

    res.json({
      cards: { today, yesterday, week, month, aov, conversionRate, visitors },
      todayDetail,
      incomplete: { active: incompleteActive, converted: incompleteConverted, recoveryRate },
      sources,
      statusCounts: Object.fromEntries(statusAgg.map((s) => [s._id, s.count])),
      series,
      recent,
      sectionAnalytics,
      generatedAt: now,
    });
  } catch (err) {
    next(err);
  }
}

export default { getDashboard };
