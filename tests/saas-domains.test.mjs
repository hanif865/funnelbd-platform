// SaaS Phase S4: custom domain connect / verify / primary / delete, isolated
// per account. DNS is faked via the domain.service test hook.
import { callController as call, makeT } from './_harness.mjs';
import { Account, Domain } from '../server/models/index.js';
import * as domains from '../server/controllers/domain.controller.js';
import { resolveAccountId, invalidateDomainCache, __setTxtResolver } from '../server/services/domain.service.js';
import { config } from '../server/config/index.js';

export default {
  name: 'SaaS S4: custom domains',
  seed: false,
  async fn() {
    const t = makeT('saas-domains');
    const { ok } = t;
    invalidateDomainCache();

    const A = await Account.create({ name: 'Acme', slug: 'acme5' });
    const B = await Account.create({ name: 'Beta', slug: 'beta5' });
    const asA = (e = {}) => ({ accountId: A._id, ...e });
    const asB = (e = {}) => ({ accountId: B._id, ...e });

    // Add a custom domain.
    let r = await call(domains.addDomain, asA({ body: { host: 'https://Shop.Example.com/' } }));
    ok(r.status === 201 && r.body.domain.host === 'shop.example.com' && r.body.domain.verified === false, 'domain added (normalized, unverified)');
    ok(r.body.instructions.txt.value.startsWith('fbd-verify-') && r.body.instructions.cname.value === config.appDomain, 'DNS instructions returned');
    const dom = r.body.domain;
    const token = dom.verificationToken;

    // Rejections.
    r = await call(domains.addDomain, asA({ body: { host: `x.${config.appDomain}` } }));
    ok(r.status === 400, 'cannot add an app-domain subdomain as custom');
    r = await call(domains.addDomain, asA({ body: { host: 'not a domain' } }));
    ok(r.status === 400, 'invalid host rejected');
    r = await call(domains.addDomain, asB({ body: { host: 'shop.example.com' } }));
    ok(r.status === 400, 'B cannot connect a domain already taken by A');

    // Unverified domain does NOT route traffic yet.
    invalidateDomainCache();
    __setTxtResolver(async () => []); // no TXT yet
    ok((await resolveAccountId('shop.example.com')) === null, 'unverified custom domain does not resolve (2 accounts → null)');

    // Verify with the wrong/missing TXT.
    r = await call(domains.verifyDomain, asA({ params: { id: String(dom._id) } }));
    ok(r.body.ok === false && r.body.verified === false, 'verify fails without the TXT record');

    // Cross-account verify → 404.
    r = await call(domains.verifyDomain, asB({ params: { id: String(dom._id) } }));
    ok(r.status === 404, 'B cannot verify A\'s domain');

    // Now the TXT is present → verify succeeds (TLS skipped: CF not configured).
    __setTxtResolver(async (name) => (name === `_funnelbd-challenge.shop.example.com` ? [[token]] : []));
    r = await call(domains.verifyDomain, asA({ params: { id: String(dom._id) } }));
    ok(r.body.ok === true && r.body.verified === true && r.body.tls?.skipped, 'verify succeeds, TLS skipped (no CF)');
    ok((await Domain.findById(dom._id)).verified === true, 'domain persisted as verified');

    // Verified domain now routes to A.
    invalidateDomainCache();
    ok(String(await resolveAccountId('shop.example.com')) === String(A._id), 'verified custom domain resolves to A');

    // Set primary (requires verified).
    r = await call(domains.setPrimaryDomain, asA({ params: { id: String(dom._id) } }));
    ok(r.body.ok && (await Domain.findById(dom._id)).isPrimary === true, 'verified domain set primary');

    // List includes both the custom domain; subdomain-less account has just this one.
    r = await call(domains.listDomains, asA());
    ok(r.body.domains.length === 1 && r.body.appDomain === config.appDomain && r.body.tlsAuto === false, 'list returns domain + context');

    // Delete (custom allowed).
    r = await call(domains.deleteDomain, asA({ params: { id: String(dom._id) } }));
    ok(r.body.ok && !(await Domain.findById(dom._id)), 'custom domain deleted');

    // A signup-style subdomain cannot be deleted.
    const sub = await Domain.create({ host: `acme5.${config.appDomain}`, accountId: A._id, type: 'subdomain', verified: true, isPrimary: true });
    r = await call(domains.deleteDomain, asA({ params: { id: String(sub._id) } }));
    ok(r.status === 400, 'subdomain cannot be deleted');

    __setTxtResolver((name) => import('node:dns/promises').then((m) => m.resolveTxt(name))); // restore
    return t.result();
  },
};
