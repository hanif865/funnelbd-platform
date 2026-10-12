import { getFunnelSetting, setFunnelSetting } from '../settings.service.js';

/**
 * Tracking configuration lives in the `settings` collection under key
 * 'tracking'. Public IDs (pixel/measurement ids) are safe to embed in the
 * landing page; tokens/secrets are server-only and must never reach the browser
 * or an unmasked admin response.
 */
export const SETTING_KEY = 'tracking';

export const TRACKING_DEFAULTS = {
  facebook: { enabled: false, pixelId: '', accessToken: '', testEventCode: '' },
  google: {
    enabled: false,
    measurementId: '',
    apiSecret: '',
    adsConversionId: '',
    adsConversionLabel: '',
  },
  tiktok: { enabled: false, pixelId: '', accessToken: '', testEventCode: '' },
};

/**
 * Per-funnel tracking config (pixels/tokens), merged over defaults. Falls back
 * to the shared global config when a funnel hasn't set its own.
 */
export async function getTrackingConfig(productId = null) {
  const stored = (await getFunnelSetting(SETTING_KEY, productId, {})) || {};
  return {
    facebook: { ...TRACKING_DEFAULTS.facebook, ...(stored.facebook || {}) },
    google: { ...TRACKING_DEFAULTS.google, ...(stored.google || {}) },
    tiktok: { ...TRACKING_DEFAULTS.tiktok, ...(stored.tiktok || {}) },
  };
}

export async function saveTrackingConfig(next, productId = null) {
  return setFunnelSetting(SETTING_KEY, productId, next);
}

/**
 * Only the fields safe to expose to the browser (enabled + public ids).
 * Tokens/secrets are stripped.
 */
export function toPublicConfig(cfg) {
  return {
    facebook: { enabled: !!cfg.facebook.enabled, pixelId: cfg.facebook.pixelId || '' },
    google: {
      enabled: !!cfg.google.enabled,
      measurementId: cfg.google.measurementId || '',
      adsConversionId: cfg.google.adsConversionId || '',
      adsConversionLabel: cfg.google.adsConversionLabel || '',
    },
    tiktok: { enabled: !!cfg.tiktok.enabled, pixelId: cfg.tiktok.pixelId || '' },
  };
}

/** Mask a secret for admin display: keep last 4 chars. */
export function mask(secret) {
  if (!secret) return '';
  const s = String(secret);
  return s.length <= 4 ? '••••' : '••••' + s.slice(-4);
}

/**
 * Admin-facing view of the config: tokens masked, but a boolean flag tells the
 * UI whether a secret is set (so it can show "configured" vs "empty").
 */
export function toAdminConfig(cfg) {
  return {
    facebook: {
      enabled: cfg.facebook.enabled,
      pixelId: cfg.facebook.pixelId,
      accessToken: mask(cfg.facebook.accessToken),
      accessTokenSet: !!cfg.facebook.accessToken,
      testEventCode: cfg.facebook.testEventCode,
    },
    google: {
      enabled: cfg.google.enabled,
      measurementId: cfg.google.measurementId,
      apiSecret: mask(cfg.google.apiSecret),
      apiSecretSet: !!cfg.google.apiSecret,
      adsConversionId: cfg.google.adsConversionId,
      adsConversionLabel: cfg.google.adsConversionLabel,
    },
    tiktok: {
      enabled: cfg.tiktok.enabled,
      pixelId: cfg.tiktok.pixelId,
      accessToken: mask(cfg.tiktok.accessToken),
      accessTokenSet: !!cfg.tiktok.accessToken,
      testEventCode: cfg.tiktok.testEventCode,
    },
  };
}

export default { getTrackingConfig, saveTrackingConfig, toPublicConfig, toAdminConfig, mask, SETTING_KEY };
