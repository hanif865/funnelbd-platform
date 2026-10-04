import { Order, IncompleteOrder, DailyStat } from '../models/index.js';
import { dhakaStartOf as startOf, dhakaYmd, DHAKA_TZ } from '../utils/time.js';

/** Orders + revenue in [from, to). Revenue excludes cancelled/returned. */
async function rangeStats(from, to) {
  const match = { createdAt: { $gte: from, ...(to ? { $lt: to } : {}) } };
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

/** GET /api/admin/dashboard → all the numbers the dashboard shows. */
export async function getDashboard(req, res, next) {
  try {
    const now = new Date();
    const todayStart = startOf(0);
    const yesterdayStart = startOf(1);
    const weekStart = startOf(6);
    const monthStart = startOf(29);

    const [today, yesterday, week, month] = await Promise.all([
      rangeStats(todayStart, null),
      rangeStats(yesterdayStart, todayStart),
      rangeStats(weekStart, null),
      rangeStats(monthStart, null),
    ]);

    const aov = month.orders ? Math.round(month.revenue / month.orders) : 0;

    // Conversion: month orders ÷ month unique visitors.
    const monthDate = dhakaYmd(monthStart);
    const visitAgg = await DailyStat.aggregate([
      { $match: { date: { $gte: monthDate } } },
      { $group: { _id: null, visitors: { $sum: '$visitors' }, visits: { $sum: '$visits' } } },
    ]);
    const visitors = visitAgg[0]?.visitors || 0;
    const conversionRate = visitors ? +((month.orders / visitors) * 100).toFixed(1) : null;

    // Today at a glance: unique visitors, visits and interaction clicks
    // (call / whatsapp / order-button) from today's DailyStat doc.
    const todayKey = dhakaYmd();
    const todayStat = await DailyStat.findOne({ date: todayKey }).lean();
    const mapGet = (m, k) => (m instanceof Map ? m.get(k) : m?.[k]) || 0;
    const todayDetail = {
      visitors: todayStat?.visitors || 0,
      visits: todayStat?.visits || 0,
      orders: today.orders,
      revenue: today.revenue,
      calls: mapGet(todayStat?.events, 'call'),
      whatsapp: mapGet(todayStat?.events, 'whatsapp'),
      orderClicks: mapGet(todayStat?.events, 'order_click'),
    };

    // Incomplete + recovery.
    const [incompleteActive, incompleteConverted, incompleteTotal] = await Promise.all([
      IncompleteOrder.countDocuments({ status: { $in: ['new', 'called'] } }),
      IncompleteOrder.countDocuments({ status: 'converted' }),
      IncompleteOrder.countDocuments({}),
    ]);
    const recoveryRate = incompleteTotal ? +((incompleteConverted / incompleteTotal) * 100).toFixed(1) : null;

    // Source breakdown (month).
    const sources = await Order.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
      { $group: { _id: '$source', count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      { $sort: { count: -1 } },
    ]);

    // Status pipeline counts (all-time).
    const statusAgg = await Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);

    // 30-day daily series (orders + revenue).
    const daily = await Order.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
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

    const recent = await Order.find().sort({ createdAt: -1 }).limit(10)
      .select('orderNumber customer.name customer.phone total status source createdAt').lean();

    // Section dwell time & exit drop-off analytics (30-day aggregate).
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

    const sectionStats = await DailyStat.find({ date: { $gte: monthDate } }).lean();
    const sectionDwellAgg = {};
    const sectionExitsAgg = {};
    const sectionViewsAgg = {};

    for (const stat of sectionStats) {
      if (stat.sectionDwell) {
        const obj = stat.sectionDwell instanceof Map ? Object.fromEntries(stat.sectionDwell) : stat.sectionDwell;
        for (const [k, v] of Object.entries(obj || {})) {
          sectionDwellAgg[k] = (sectionDwellAgg[k] || 0) + (Number(v) || 0);
        }
      }
      if (stat.sectionExits) {
        const obj = stat.sectionExits instanceof Map ? Object.fromEntries(stat.sectionExits) : stat.sectionExits;
        for (const [k, v] of Object.entries(obj || {})) {
          sectionExitsAgg[k] = (sectionExitsAgg[k] || 0) + (Number(v) || 0);
        }
      }
      if (stat.sectionViews) {
        const obj = stat.sectionViews instanceof Map ? Object.fromEntries(stat.sectionViews) : stat.sectionViews;
        for (const [k, v] of Object.entries(obj || {})) {
          sectionViewsAgg[k] = (sectionViewsAgg[k] || 0) + (Number(v) || 0);
        }
      }
    }

    const allKeys = new Set([...Object.keys(SECTION_LABELS), ...Object.keys(sectionDwellAgg), ...Object.keys(sectionExitsAgg)]);
    const sectionAnalytics = Array.from(allKeys).map((key) => {
      const dwellSeconds = sectionDwellAgg[key] || 0;
      const exits = sectionExitsAgg[key] || 0;
      const views = sectionViewsAgg[key] || 0;
      return {
        key,
        label: SECTION_LABELS[key] || key,
        dwellSeconds,
        exits,
        views,
      };
    }).sort((a, b) => b.dwellSeconds - a.dwellSeconds);

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
