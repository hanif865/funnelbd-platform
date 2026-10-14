// Meta Ads: per-account connection config + guards (no live Graph API calls).
import { makeT } from './_harness.mjs';
import { Account } from '../server/models/index.js';
import {
  normalizeAdAccount, getMetaConfig, saveMetaConfig, metaConnected,
  listCampaigns, setCampaignStatus, MetaError,
} from '../server/services/meta.service.js';
import { invalidateSettingsCache } from '../server/services/settings.service.js';

export default {
  name: 'Meta Ads: per-account config + guards',
  seed: false,
  async fn() {
    const t = makeT('saas-meta');
    const { ok } = t;
    invalidateSettingsCache();

    ok(normalizeAdAccount('1234567890') === 'act_1234567890', 'bare digits → act_');
    ok(normalizeAdAccount('act_42') === 'act_42', 'act_ kept');
    ok(normalizeAdAccount('') === '', 'empty → empty');

    const A = await Account.create({ name: 'Acme', slug: 'acme-meta' });
    const B = await Account.create({ name: 'Beta', slug: 'beta-meta' });

    // Not connected until both token + account are set.
    ok(!metaConnected(await getMetaConfig(A._id)), 'A starts disconnected');
    let threw = false;
    try { await listCampaigns(A._id); } catch (e) { threw = e instanceof MetaError && /not connected/.test(e.message); }
    ok(threw, 'listCampaigns throws when disconnected');

    // Save config for A; B stays independent.
    await saveMetaConfig(A._id, { accessToken: 'EAAtoken-A-123456', adAccountId: '999' });
    let cfgA = await getMetaConfig(A._id);
    ok(metaConnected(cfgA) && cfgA.adAccountId === 'act_999', 'A connected, account normalized');
    ok(!metaConnected(await getMetaConfig(B._id)), 'B still disconnected (isolated)');

    // Masked/blank token is preserved (kept) on re-save; account can still change.
    await saveMetaConfig(A._id, { accessToken: '••••3456', adAccountId: '1000' });
    cfgA = await getMetaConfig(A._id);
    ok(cfgA.accessToken === 'EAAtoken-A-123456' && cfgA.adAccountId === 'act_1000', 'masked token kept, account updated');

    // Status validation.
    threw = false;
    try { await setCampaignStatus(A._id, '123', 'DELETE'); } catch (e) { threw = e instanceof MetaError && /Invalid/.test(e.message); }
    ok(threw, 'setCampaignStatus rejects an invalid status');

    threw = false;
    try { await setCampaignStatus(B._id, '123', 'PAUSED'); } catch (e) { threw = e instanceof MetaError && /not connected/.test(e.message); }
    ok(threw, 'setCampaignStatus on a disconnected account is blocked');

    return t.result();
  },
};
