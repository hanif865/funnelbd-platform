import { Domain, Account } from '../models/index.js';

/**
 * Resolve the tenant that owns an incoming public request from its Host header.
 * A registered Domain (subdomain or custom) maps straight to its account. An
 * unregistered host (e.g. localhost in dev) maps to the sole account when there
 * is exactly one — a single-tenant / pre-signup convenience — and otherwise to
 * null (served as "no funnel"). Results are cached briefly since domains change
 * rarely.
 */
const TTL_MS = 60 * 1000;
let cache = new Map(); // host → { accountId, expiresAt }

function cleanHost(host) {
  return String(host || '').toLowerCase().split(':')[0].trim();
}

/** The only account's id when exactly one exists; else null (0 or ambiguous 2+). */
async function soleAccountId() {
  const accounts = await Account.find().sort({ createdAt: 1 }).limit(2).select('_id').lean();
  return accounts.length === 1 ? accounts[0]._id : null;
}

export async function resolveAccountId(host) {
  const h = cleanHost(host);
  const cached = cache.get(h);
  if (cached && cached.expiresAt > Date.now()) return cached.accountId;

  let accountId = null;
  if (h) {
    const dom = await Domain.findOne({ host: h }).select('accountId').lean();
    accountId = dom ? dom.accountId : await soleAccountId();
  } else {
    accountId = await soleAccountId();
  }
  cache.set(h, { accountId, expiresAt: Date.now() + TTL_MS });
  return accountId;
}

/** Express middleware: sets req.publicAccountId from the Host header. */
export async function resolvePublicAccount(req, _res, next) {
  try {
    req.publicAccountId = await resolveAccountId(req.headers.host);
  } catch {
    req.publicAccountId = null;
  }
  next();
}

export function invalidateDomainCache() {
  cache = new Map();
}

export default { resolveAccountId, resolvePublicAccount, invalidateDomainCache };
