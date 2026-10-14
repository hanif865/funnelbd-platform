import { getSetting, setSetting } from './settings.service.js';

/**
 * Meta (Facebook) Marketing API — per tenant. Each account pastes its own
 * long-lived access token (ads_read / ads_management) and ad-account id; we use
 * them to list campaigns and pause/resume them from the panel. No OAuth app
 * required. Token is a secret (stored, never returned in full).
 *
 * Graph API docs: https://developers.facebook.com/docs/marketing-apis/
 */
const GRAPH = 'https://graph.facebook.com/v21.0';
const SETTING_KEY = 'meta';

/** Normalize an ad-account id to the `act_<digits>` form Graph expects. */
export function normalizeAdAccount(id) {
  const s = String(id || '').trim();
  if (!s) return '';
  const digits = s.replace(/^act_/i, '').replace(/\D/g, '');
  return digits ? `act_${digits}` : '';
}

export async function getMetaConfig(accountId) {
  const s = (await getSetting(SETTING_KEY, accountId, {})) || {};
  return {
    accessToken: s.accessToken || '',
    adAccountId: normalizeAdAccount(s.adAccountId),
  };
}

export async function saveMetaConfig(accountId, { accessToken, adAccountId }) {
  const cur = await getMetaConfig(accountId);
  // Keep the stored token when the incoming value is blank or the mask.
  const token = !accessToken || String(accessToken).startsWith('••••') ? cur.accessToken : String(accessToken).trim();
  await setSetting(SETTING_KEY, accountId, {
    accessToken: token,
    adAccountId: normalizeAdAccount(adAccountId ?? cur.adAccountId),
  });
  return getMetaConfig(accountId);
}

export function metaConnected(cfg) {
  return !!(cfg.accessToken && cfg.adAccountId);
}

class MetaError extends Error {
  constructor(message) { super(message); this.name = 'MetaError'; }
}

async function graph(path, { token, method = 'GET', params = {}, body } = {}) {
  const qs = new URLSearchParams({ ...params, access_token: token }).toString();
  const url = `${GRAPH}/${path}?${qs}`;
  let res;
  try {
    res = await fetch(url, body ? { method, body: new URLSearchParams(body).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } } : { method });
  } catch (e) {
    throw new MetaError('Could not reach Meta: ' + e.message);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new MetaError(data.error?.message || `Meta API error (HTTP ${res.status}).`);
  }
  return data;
}

const money = (minor) => (Number(minor) || 0) / 100; // Meta budgets are in minor units

/** List the ad account's campaigns with 7-day spend/impressions/clicks. */
export async function listCampaigns(accountId) {
  const cfg = await getMetaConfig(accountId);
  if (!metaConnected(cfg)) throw new MetaError('Meta is not connected.');

  const data = await graph(`${cfg.adAccountId}/campaigns`, {
    token: cfg.accessToken,
    params: {
      limit: '50',
      fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,insights.date_preset(last_7d){spend,impressions,clicks,cpc,ctr}',
    },
  });

  const campaigns = (data.data || []).map((c) => {
    const ins = c.insights?.data?.[0] || {};
    return {
      id: c.id,
      name: c.name,
      status: c.status, // ACTIVE | PAUSED | ...
      effectiveStatus: c.effective_status,
      objective: c.objective,
      dailyBudget: c.daily_budget ? money(c.daily_budget) : null,
      lifetimeBudget: c.lifetime_budget ? money(c.lifetime_budget) : null,
      spend: Number(ins.spend) || 0,
      impressions: Number(ins.impressions) || 0,
      clicks: Number(ins.clicks) || 0,
      ctr: ins.ctr != null ? Number(ins.ctr) : null,
    };
  });
  return campaigns;
}

/** Pause or resume one campaign. status must be ACTIVE or PAUSED. */
export async function setCampaignStatus(accountId, campaignId, status) {
  const cfg = await getMetaConfig(accountId);
  if (!metaConnected(cfg)) throw new MetaError('Meta is not connected.');
  const next = String(status).toUpperCase();
  if (!['ACTIVE', 'PAUSED'].includes(next)) throw new MetaError('Invalid status.');
  await graph(String(campaignId), { token: cfg.accessToken, method: 'POST', body: { status: next } });
  return { ok: true, status: next };
}

export { MetaError };
export default { getMetaConfig, saveMetaConfig, metaConnected, listCampaigns, setCampaignStatus, normalizeAdAccount, MetaError };
