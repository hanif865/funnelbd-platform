import mongoose from 'mongoose';
import {
  getMetaConfig, saveMetaConfig, metaConnected,
  listCampaigns as svcListCampaigns, setCampaignStatus as svcSetStatus, MetaError,
} from '../services/meta.service.js';

function acct(req) {
  const id = req.accountId;
  return id && mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
}

const mask = (tok) => (tok ? '••••' + String(tok).slice(-4) : '');

/** GET /api/admin/meta → connection state (token masked). */
export async function getMetaSettings(req, res, next) {
  try {
    const cfg = await getMetaConfig(acct(req));
    res.json({
      connected: metaConnected(cfg),
      adAccountId: cfg.adAccountId,
      accessToken: mask(cfg.accessToken),
      accessTokenSet: !!cfg.accessToken,
    });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/meta → save token + ad account id (token kept if left masked). */
export async function updateMetaSettings(req, res, next) {
  try {
    const b = req.body || {};
    const cfg = await saveMetaConfig(acct(req), { accessToken: b.accessToken, adAccountId: b.adAccountId });
    res.json({ ok: true, connected: metaConnected(cfg), adAccountId: cfg.adAccountId, accessToken: mask(cfg.accessToken), accessTokenSet: !!cfg.accessToken });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/meta/campaigns → campaigns with 7-day stats. */
export async function listCampaigns(req, res, next) {
  try {
    const campaigns = await svcListCampaigns(acct(req));
    res.json({ campaigns });
  } catch (err) {
    if (err instanceof MetaError) return res.status(err.message.includes('not connected') ? 400 : 502).json({ error: err.message });
    next(err);
  }
}

/** PATCH /api/admin/meta/campaigns/:id/status → { status: 'ACTIVE'|'PAUSED' }. */
export async function setCampaignStatus(req, res, next) {
  try {
    const r = await svcSetStatus(acct(req), req.params.id, req.body?.status);
    res.json(r);
  } catch (err) {
    if (err instanceof MetaError) return res.status(err.message.includes('not connected') || err.message.includes('Invalid') ? 400 : 502).json({ error: err.message });
    next(err);
  }
}

export default { getMetaSettings, updateMetaSettings, listCampaigns, setCampaignStatus };
