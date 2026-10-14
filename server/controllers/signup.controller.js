import bcrypt from 'bcryptjs';
import { Account, Admin, Domain } from '../models/index.js';
import { signAdminToken } from '../utils/jwt.js';
import { config } from '../config/index.js';
import { provisionStarterFunnel } from '../services/provision.service.js';
import { invalidateDomainCache } from '../services/domain.service.js';

// Subdomains we never hand to tenants.
const RESERVED = new Set(['www', 'admin', 'api', 'app', 'mail', 'ftp', 'cdn', 'static', 'assets', 'dashboard', 'support', 'help', 'status', 'blog', 'dev', 'staging', 'test', 'funnel', 'funnels', 'checkout', 'shop', 'store', 'account', 'auth', 'login', 'signup']);

function slugify(s) {
  return String(s || '')
    .trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** An account slug / subdomain label not taken by another account or reserved. */
async function uniqueSlug(base) {
  let root = base || 'shop';
  if (RESERVED.has(root)) root = `${root}-shop`;
  let slug = root;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const host = `${slug}.${config.appDomain}`;
    const [accClash, domClash] = await Promise.all([
      Account.findOne({ slug }).select('_id').lean(),
      Domain.findOne({ host }).select('_id').lean(),
    ]);
    if (!accClash && !domClash && !RESERVED.has(slug)) return slug;
    n += 1;
    slug = `${root}-${n}`;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST /api/signup → create an account + owner + subdomain + starter funnel. */
export async function signup(req, res, next) {
  try {
    const b = req.body || {};
    const businessName = String(b.businessName || '').trim();
    const email = String(b.email || '').toLowerCase().trim();
    const password = String(b.password || '');

    if (!businessName) return res.status(400).json({ error: 'Enter your business name.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (await Admin.findOne({ email })) return res.status(400).json({ error: 'An account with this email already exists.' });

    const slug = await uniqueSlug(slugify(b.subdomain || businessName));

    const account = await Account.create({ name: businessName, slug, status: 'active' });
    const passwordHash = await bcrypt.hash(password, 10);
    const owner = await Admin.create({ accountId: account._id, name: businessName, email, passwordHash, role: 'admin', active: true });
    account.ownerId = owner._id;
    await account.save();

    const host = `${slug}.${config.appDomain}`;
    await Domain.create({ host, accountId: account._id, type: 'subdomain', verified: true, isPrimary: true });
    invalidateDomainCache();

    await provisionStarterFunnel(account._id, { name: businessName });

    const token = signAdminToken(owner);
    res.status(201).json({
      ok: true,
      token,
      account: { id: account._id, name: account.name, slug: account.slug },
      subdomain: host,
      funnelUrl: `https://${host}/funnel-step/checkout/`,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/signup/check?subdomain= → is this subdomain available? */
export async function checkSubdomain(req, res, next) {
  try {
    const raw = slugify(req.query.subdomain || '');
    if (!raw) return res.json({ available: false, reason: 'empty' });
    if (RESERVED.has(raw)) return res.json({ available: false, reason: 'reserved', slug: raw });
    const host = `${raw}.${config.appDomain}`;
    const [accClash, domClash] = await Promise.all([
      Account.findOne({ slug: raw }).select('_id').lean(),
      Domain.findOne({ host }).select('_id').lean(),
    ]);
    res.json({ available: !accClash && !domClash, slug: raw, host });
  } catch (err) {
    next(err);
  }
}

export default { signup, checkSubdomain };
