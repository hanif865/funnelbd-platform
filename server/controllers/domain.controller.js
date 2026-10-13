import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Domain } from '../models/index.js';
import { config } from '../config/index.js';
import { invalidateDomainCache, verifyTxtOwnership, CHALLENGE_PREFIX } from '../services/domain.service.js';
import { createCustomHostname, deleteCustomHostname, getCustomHostnameStatus, cfConfigured } from '../services/cloudflare.service.js';

function acct(req) {
  const id = req.accountId;
  return id && mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
}

function cleanHost(h) {
  return String(h || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
}

// Hostname like shop.example.com (at least one dot, valid labels).
const HOST_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/** DNS records a tenant must add to connect + prove ownership of a custom domain. */
function dnsInstructions(host, token) {
  return {
    // Point traffic at the platform (CNAME to the app domain / CF for SaaS target).
    cname: { type: 'CNAME', name: host, value: config.appDomain },
    // Prove ownership.
    txt: { type: 'TXT', name: `${CHALLENGE_PREFIX}.${host}`, value: token },
  };
}

/** GET /api/admin/domains → this account's domains + the add-domain context. */
export async function listDomains(req, res, next) {
  try {
    const domains = await Domain.find({ accountId: acct(req) }).sort({ createdAt: 1 }).lean();
    res.json({
      domains: domains.map((d) => ({
        ...d,
        instructions: d.type === 'custom' && !d.verified ? dnsInstructions(d.host, d.verificationToken) : null,
      })),
      appDomain: config.appDomain,
      tlsAuto: cfConfigured(),
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/domains → connect a custom domain (unverified until DNS is set). */
export async function addDomain(req, res, next) {
  try {
    const accountId = acct(req);
    if (!accountId) return res.status(400).json({ error: 'No account is associated with your login yet.' });
    const host = cleanHost(req.body?.host);
    if (!HOST_RE.test(host)) return res.status(400).json({ error: 'Enter a valid domain, e.g. shop.example.com' });
    if (host === config.appDomain || host.endsWith('.' + config.appDomain)) {
      return res.status(400).json({ error: `${config.appDomain} subdomains are managed automatically — add your own domain here.` });
    }
    if (await Domain.findOne({ host })) return res.status(400).json({ error: 'This domain is already connected.' });

    const verificationToken = 'fbd-verify-' + crypto.randomBytes(12).toString('hex');
    const domain = await Domain.create({ host, accountId, type: 'custom', verified: false, verificationToken });
    invalidateDomainCache();
    res.status(201).json({ ok: true, domain, instructions: dnsInstructions(host, verificationToken) });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/domains/:id/verify → check the TXT record, then provision TLS. */
export async function verifyDomain(req, res, next) {
  try {
    const domain = await Domain.findOne({ _id: req.params.id, accountId: acct(req) });
    if (!domain) return res.status(404).json({ error: 'Domain not found.' });
    if (domain.type !== 'custom') return res.status(400).json({ error: 'Only custom domains need verification.' });

    const owned = await verifyTxtOwnership(domain.host, domain.verificationToken);
    if (!owned) {
      return res.json({ ok: false, verified: false, error: 'The TXT record was not found yet. DNS changes can take a few minutes to propagate.' });
    }

    domain.verified = true;
    // Provision TLS via Cloudflare for SaaS when configured (no-op otherwise).
    const tls = await createCustomHostname(domain.host).catch((e) => ({ error: e.message }));
    if (tls?.id) domain.cfHostnameId = tls.id;
    await domain.save();
    invalidateDomainCache();
    res.json({ ok: true, verified: true, tls });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/domains/:id/tls → current TLS provisioning status (CF for SaaS). */
export async function domainTlsStatus(req, res, next) {
  try {
    const domain = await Domain.findOne({ _id: req.params.id, accountId: acct(req) }).lean();
    if (!domain) return res.status(404).json({ error: 'Domain not found.' });
    if (!domain.cfHostnameId) return res.json({ configured: cfConfigured(), status: null });
    res.json({ configured: cfConfigured(), ...(await getCustomHostnameStatus(domain.cfHostnameId)) });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/domains/:id/primary → make a verified domain the primary one. */
export async function setPrimaryDomain(req, res, next) {
  try {
    const accountId = acct(req);
    const domain = await Domain.findOne({ _id: req.params.id, accountId });
    if (!domain) return res.status(404).json({ error: 'Domain not found.' });
    if (!domain.verified) return res.status(400).json({ error: 'Verify the domain before making it primary.' });
    await Domain.updateMany({ accountId }, { isPrimary: false });
    domain.isPrimary = true;
    await domain.save();
    invalidateDomainCache();
    res.json({ ok: true, domain });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/admin/domains/:id → disconnect a custom domain. */
export async function deleteDomain(req, res, next) {
  try {
    const domain = await Domain.findOne({ _id: req.params.id, accountId: acct(req) });
    if (!domain) return res.status(404).json({ error: 'Domain not found.' });
    if (domain.type === 'subdomain') return res.status(400).json({ error: 'The free subdomain cannot be removed.' });
    if (domain.cfHostnameId) await deleteCustomHostname(domain.cfHostnameId).catch(() => {});
    await domain.deleteOne();
    invalidateDomainCache();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export default { listDomains, addDomain, verifyDomain, domainTlsStatus, setPrimaryDomain, deleteDomain };
