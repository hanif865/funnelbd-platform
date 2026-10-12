import { getSettings, setSetting, getFunnelSetting, setFunnelSetting } from '../services/settings.service.js';
import { getSmsConfig, SMS_DEFAULTS } from '../services/sms.service.js';
import { getCourierConfig, saveCourierConfig, COURIER_DEFAULTS } from '../services/courier.service.js';
import { normalizeStoreInfo } from '../services/storeInfo.js';
import { getDefaultProductId } from '../services/catalog.cache.js';

// storeInfo + freeDelivery are per funnel; until the funnel selector lands
// (Phase 4) the admin edits the default funnel (or ?funnel=<id>).
async function targetFunnel(req) {
  return req.query.funnel || (await getDefaultProductId());
}

const COOLDOWN_DEFAULT = {
  enabled: true,
  hours: 24,
  message: 'আপনার অর্ডারটি আমরা ইতিমধ্যে পেয়েছি! আমাদের টিম শীঘ্রই যোগাযোগ করবে।',
};
const FREE_DELIVERY_DEFAULT = { enabled: false, threshold: 0, allFree: false };

function maskKey(k) {
  if (!k) return '';
  return String(k).length <= 4 ? '••••' : '••••' + String(k).slice(-4);
}

/** GET /api/admin/settings → general settings (SMS api key masked). */
export async function getGeneralSettings(req, res, next) {
  try {
    const pid = await targetFunnel(req);
    const s = await getSettings(['duplicateCooldown']);
    const [freeDelivery, storeInfo, sms] = await Promise.all([
      getFunnelSetting('freeDelivery', pid, null),
      getFunnelSetting('storeInfo', pid, null),
      getSmsConfig(),
    ]);
    res.json({
      duplicateCooldown: s.duplicateCooldown || COOLDOWN_DEFAULT,
      freeDelivery: freeDelivery || FREE_DELIVERY_DEFAULT,
      storeInfo: normalizeStoreInfo(storeInfo),
      sms: { ...sms, apiKey: maskKey(sms.apiKey), apiKeySet: !!sms.apiKey },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/admin/settings → update any subset of general settings. Admin-only.
 * SMS api key is preserved if left blank/masked.
 */
export async function updateGeneralSettings(req, res, next) {
  try {
    const b = req.body || {};
    const pid = await targetFunnel(req);

    if (b.duplicateCooldown) {
      await setSetting('duplicateCooldown', {
        enabled: !!b.duplicateCooldown.enabled,
        hours: Number(b.duplicateCooldown.hours) || 24,
        message: String(b.duplicateCooldown.message || '').trim(),
      });
    }
    if (b.freeDelivery) {
      await setFunnelSetting('freeDelivery', pid, {
        enabled: !!b.freeDelivery.enabled,
        threshold: Number(b.freeDelivery.threshold) || 0,
        allFree: !!b.freeDelivery.allFree,
      });
    }
    if (b.storeInfo) {
      await setFunnelSetting('storeInfo', pid, normalizeStoreInfo(b.storeInfo));
    }
    if (b.sms) {
      const cur = await getSmsConfig();
      const incomingKey = b.sms.apiKey;
      const apiKey = !incomingKey || String(incomingKey).startsWith('••••') ? cur.apiKey : String(incomingKey);
      await setSetting('sms', {
        ...SMS_DEFAULTS,
        ...cur,
        ...b.sms,
        apiKey,
        paramNames: { ...SMS_DEFAULTS.paramNames, ...(b.sms.paramNames || cur.paramNames) },
        templates: { ...SMS_DEFAULTS.templates, ...(cur.templates || {}), ...(b.sms.templates || {}) },
      });
    }

    // Return the fresh, masked view.
    return getGeneralSettings(req, res, next);
  } catch (err) {
    next(err);
  }
}

// ─── Courier config (admin-only, secrets masked) ────────────
function keepSecret(incoming, stored) {
  if (incoming === undefined || incoming === null) return stored;
  const s = String(incoming);
  return s === '' || s.startsWith('••••') ? stored : s;
}

/** GET /api/admin/courier → provider config with secrets masked. */
export async function getCourierSettings(req, res, next) {
  try {
    const c = await getCourierConfig();
    res.json({
      courier: {
        provider: c.provider,
        steadfast: { enabled: c.steadfast.enabled, apiKey: maskKey(c.steadfast.apiKey), apiKeySet: !!c.steadfast.apiKey, secretKey: maskKey(c.steadfast.secretKey), secretKeySet: !!c.steadfast.secretKey, baseUrl: c.steadfast.baseUrl },
        pathao: { enabled: c.pathao.enabled, clientId: c.pathao.clientId, clientSecret: maskKey(c.pathao.clientSecret), clientSecretSet: !!c.pathao.clientSecret, username: c.pathao.username, password: maskKey(c.pathao.password), passwordSet: !!c.pathao.password, storeId: c.pathao.storeId, baseUrl: c.pathao.baseUrl },
        fraudCheck: { externalEnabled: c.fraudCheck.externalEnabled, apiUrl: c.fraudCheck.apiUrl, apiKey: maskKey(c.fraudCheck.apiKey), apiKeySet: !!c.fraudCheck.apiKey },
      },
    });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/courier → merge, preserving unentered secrets. Admin-only. */
export async function updateCourierSettings(req, res, next) {
  try {
    const cur = await getCourierConfig();
    const b = req.body || {};
    const next_ = {
      provider: b.provider ?? cur.provider,
      steadfast: {
        enabled: !!b.steadfast?.enabled,
        apiKey: keepSecret(b.steadfast?.apiKey, cur.steadfast.apiKey),
        secretKey: keepSecret(b.steadfast?.secretKey, cur.steadfast.secretKey),
        baseUrl: (b.steadfast?.baseUrl ?? cur.steadfast.baseUrl) || COURIER_DEFAULTS.steadfast.baseUrl,
      },
      pathao: {
        enabled: !!b.pathao?.enabled,
        clientId: (b.pathao?.clientId ?? cur.pathao.clientId) || '',
        clientSecret: keepSecret(b.pathao?.clientSecret, cur.pathao.clientSecret),
        username: (b.pathao?.username ?? cur.pathao.username) || '',
        password: keepSecret(b.pathao?.password, cur.pathao.password),
        storeId: (b.pathao?.storeId ?? cur.pathao.storeId) || '',
        baseUrl: (b.pathao?.baseUrl ?? cur.pathao.baseUrl) || COURIER_DEFAULTS.pathao.baseUrl,
      },
      fraudCheck: {
        externalEnabled: !!b.fraudCheck?.externalEnabled,
        apiUrl: (b.fraudCheck?.apiUrl ?? cur.fraudCheck.apiUrl) || '',
        apiKey: keepSecret(b.fraudCheck?.apiKey, cur.fraudCheck.apiKey),
      },
    };
    await saveCourierConfig(next_);
    return getCourierSettings(req, res, next);
  } catch (err) {
    next(err);
  }
}

export default { getGeneralSettings, updateGeneralSettings, getCourierSettings, updateCourierSettings };
