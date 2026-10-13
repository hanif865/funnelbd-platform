// SaaS Phase S2c: per-account settings — SMS, courier, tracking, store info and
// the duplicate cooldown are isolated per tenant (no cross-account leak).
import { callController as call, makeT } from './_harness.mjs';
import { Account, Setting } from '../server/models/index.js';
import {
  getSetting, setSetting, getFunnelSetting, setFunnelSetting, invalidateSettingsCache,
} from '../server/services/settings.service.js';
import * as settings from '../server/controllers/settings.controller.js';

export default {
  name: 'SaaS S2c: per-account settings isolation',
  seed: false,
  async fn() {
    const t = makeT('saas-settings');
    const { ok } = t;
    invalidateSettingsCache();

    const A = await Account.create({ name: 'Acme', slug: 'acme3' });
    const B = await Account.create({ name: 'Beta', slug: 'beta3' });

    // Service-level isolation.
    await setSetting('sms', A._id, { apiKey: 'A-KEY', enabled: true });
    await setSetting('sms', B._id, { apiKey: 'B-KEY', enabled: false });
    ok((await getSetting('sms', A._id)).apiKey === 'A-KEY', 'A reads its own sms key');
    ok((await getSetting('sms', B._id)).apiKey === 'B-KEY', 'B reads its own sms key');
    ok((await getSetting('sms', null)) === null, 'no global sms leak to the null bucket');

    // Same key in two accounts coexists (compound unique (accountId,key)).
    ok(await Setting.countDocuments({ key: 'sms' }) === 2, 'two sms rows, one per account');

    // Per-funnel setting falls back to the account level, not across accounts.
    await setSetting('storeInfo', A._id, { phone: '01A' });
    const pid = new (await import('mongoose')).default.Types.ObjectId();
    ok((await getFunnelSetting('storeInfo', pid, A._id, {})).phone === '01A', 'A funnel inherits A account storeInfo');
    ok(Object.keys(await getFunnelSetting('storeInfo', pid, B._id, {})).length === 0, 'B funnel does NOT inherit A storeInfo');

    // Funnel-specific overrides the account level, within the account.
    await setFunnelSetting('storeInfo', pid, A._id, { phone: '01A-FUNNEL' });
    ok((await getFunnelSetting('storeInfo', pid, A._id, {})).phone === '01A-FUNNEL', 'funnel override wins for A');

    // Controller-level isolation (general settings via the admin endpoint).
    const asA = (e = {}) => ({ accountId: A._id, ...e });
    const asB = (e = {}) => ({ accountId: B._id, ...e });
    await call(settings.updateGeneralSettings, asA({ body: { duplicateCooldown: { enabled: true, hours: 12, message: 'A msg' } } }));
    await call(settings.updateGeneralSettings, asB({ body: { duplicateCooldown: { enabled: false, hours: 48, message: 'B msg' } } }));
    let r = await call(settings.getGeneralSettings, asA());
    ok(r.body.duplicateCooldown.hours === 12 && r.body.duplicateCooldown.message === 'A msg', 'A cooldown isolated');
    r = await call(settings.getGeneralSettings, asB());
    ok(r.body.duplicateCooldown.hours === 48 && r.body.duplicateCooldown.message === 'B msg', 'B cooldown isolated');

    // SMS key is masked but reflects the right account.
    r = await call(settings.getGeneralSettings, asA());
    ok(r.body.sms.apiKeySet === true, 'A sms key present (masked)');

    // Courier isolation.
    await call(settings.updateCourierSettings, asA({ body: { provider: 'steadfast', steadfast: { enabled: true, apiKey: 'A-COURIER' } } }));
    await call(settings.updateCourierSettings, asB({ body: { provider: 'pathao' } }));
    r = await call(settings.getCourierSettings, asA());
    ok(r.body.courier.provider === 'steadfast' && r.body.courier.steadfast.apiKeySet, 'A courier isolated');
    r = await call(settings.getCourierSettings, asB());
    ok(r.body.courier.provider === 'pathao' && !r.body.courier.steadfast.apiKeySet, 'B courier isolated (no A key)');

    return t.result();
  },
};
