import mongoose from 'mongoose';
import { EventLog, EVENT_PLATFORMS, EVENT_STATUSES } from '../models/index.js';
import {
  getTrackingConfig,
  saveTrackingConfig,
  toAdminConfig,
} from '../services/tracking/config.js';
import { getDefaultProductId } from '../services/catalog.cache.js';

// Which funnel's tracking to edit. Until the admin gets a funnel selector
// (multi-funnel Phase 4), this is the default funnel; a ?funnel=<id> can target
// another one.
async function targetFunnel(req) {
  return req.query.funnel || (await getDefaultProductId());
}

/** GET /api/admin/tracking → config with tokens masked. */
export async function getTracking(req, res, next) {
  try {
    const cfg = await getTrackingConfig(await targetFunnel(req));
    res.json({ tracking: toAdminConfig(cfg) });
  } catch (err) {
    next(err);
  }
}

/**
 * Keep the stored secret when the incoming value is blank or still the masked
 * placeholder (UI only sends a real value when the admin types a new one).
 */
function resolveSecret(incoming, stored) {
  if (incoming === undefined || incoming === null) return stored;
  const s = String(incoming);
  if (s === '' || s.startsWith('••••')) return stored;
  return s;
}

/**
 * PUT /api/admin/tracking → merge submitted settings over stored config,
 * preserving secrets that weren't re-entered. Admin-only.
 */
export async function updateTracking(req, res, next) {
  try {
    const pid = await targetFunnel(req);
    const cur = await getTrackingConfig(pid);
    const b = req.body || {};

    const next = {
      facebook: {
        enabled: !!b.facebook?.enabled,
        pixelId: (b.facebook?.pixelId ?? cur.facebook.pixelId).trim(),
        accessToken: resolveSecret(b.facebook?.accessToken, cur.facebook.accessToken),
        testEventCode: ((b.facebook?.testEventCode ?? cur.facebook.testEventCode) || '').trim(),
      },
      google: {
        enabled: !!b.google?.enabled,
        measurementId: (b.google?.measurementId ?? cur.google.measurementId).trim(),
        apiSecret: resolveSecret(b.google?.apiSecret, cur.google.apiSecret),
        adsConversionId: ((b.google?.adsConversionId ?? cur.google.adsConversionId) || '').trim(),
        adsConversionLabel: ((b.google?.adsConversionLabel ?? cur.google.adsConversionLabel) || '').trim(),
      },
      tiktok: {
        enabled: !!b.tiktok?.enabled,
        pixelId: (b.tiktok?.pixelId ?? cur.tiktok.pixelId).trim(),
        accessToken: resolveSecret(b.tiktok?.accessToken, cur.tiktok.accessToken),
        testEventCode: ((b.tiktok?.testEventCode ?? cur.tiktok.testEventCode) || '').trim(),
      },
    };

    await saveTrackingConfig(next, pid);
    res.json({ ok: true, tracking: toAdminConfig(next) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/tracking/events → last N server-side event dispatches.
 * Query: platform, status, limit (default 100). Powers the Event Log viewer.
 */
export async function listEventLogs(req, res, next) {
  try {
    const { platform, status, funnel } = req.query;
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '100', 10)));

    const funnelMatch = funnel && mongoose.isValidObjectId(funnel)
      ? { productId: new mongoose.Types.ObjectId(funnel) }
      : {};
    const filter = { ...funnelMatch };
    if (platform && EVENT_PLATFORMS.includes(platform)) filter.platform = platform;
    if (status && EVENT_STATUSES.includes(status)) filter.status = status;

    const [events, counts] = await Promise.all([
      EventLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      EventLog.aggregate([{ $match: funnelMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    res.json({
      events,
      statusCounts: Object.fromEntries(counts.map((c) => [c._id, c.count])),
    });
  } catch (err) {
    next(err);
  }
}

export default { getTracking, updateTracking, listEventLogs };
