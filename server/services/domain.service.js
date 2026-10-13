import dns from 'node:dns/promises';
import { Domain, Account } from '../models/index.js';

// Ownership check resolver (swappable in tests via __setTxtResolver).
let txtResolver = (name) => dns.resolveTxt(name);
export function __setTxtResolver(fn) { txtResolver = fn; }

export const CHALLENGE_PREFIX = '_funnelbd-challenge';

/** True when the domain's challenge TXT record contains the expected token. */
export async function verifyTxtOwnership(host, token) {
  if (!host || !token) return false;
  try {
    const records = await txtResolver(`${CHALLENGE_PREFIX}.${host}`);
    return (records || []).flat().some((r) => String(r).includes(token));
  } catch {
    return false;
  }
}

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

/** Resolve the host to { accountId, suspended } (suspended drives public gating). */
async function lookup(host) {
  const h = cleanHost(host);
  const cached = cache.get(h);
  if (cached && cached.expiresAt > Date.now()) return cached;

  let accountId = null;
  if (h) {
    // Only a verified domain routes traffic (a subdomain is verified on signup).
    const dom = await Domain.findOne({ host: h, verified: true }).select('accountId').lean();
    accountId = dom ? dom.accountId : await soleAccountId();
  } else {
    accountId = await soleAccountId();
  }

  let suspended = false;
  if (accountId) {
    const acc = await Account.findById(accountId).select('status').lean();
    if (!acc) accountId = null;
    else suspended = acc.status === 'suspended';
  }

  const entry = { accountId, suspended, expiresAt: Date.now() + TTL_MS };
  cache.set(h, entry);
  return entry;
}

export async function resolveAccountId(host) {
  return (await lookup(host)).accountId;
}

/** Express middleware: sets req.publicAccountId + req.publicAccountSuspended. */
export async function resolvePublicAccount(req, _res, next) {
  try {
    const { accountId, suspended } = await lookup(req.headers.host);
    req.publicAccountId = accountId;
    req.publicAccountSuspended = suspended;
  } catch {
    req.publicAccountId = null;
    req.publicAccountSuspended = false;
  }
  next();
}

// Account status cache (admin-side suspension gating), cleared with the domain cache.
let acctStatusCache = new Map(); // accountId → { status, expiresAt }
export async function getAccountStatus(accountId) {
  if (!accountId) return null;
  const k = String(accountId);
  const c = acctStatusCache.get(k);
  if (c && c.expiresAt > Date.now()) return c.status;
  const acc = await Account.findById(accountId).select('status').lean();
  const status = acc ? acc.status : 'missing';
  acctStatusCache.set(k, { status, expiresAt: Date.now() + 30 * 1000 });
  return status;
}

export function invalidateDomainCache() {
  cache = new Map();
  acctStatusCache = new Map();
}

export default { resolveAccountId, resolvePublicAccount, invalidateDomainCache, getAccountStatus, verifyTxtOwnership, CHALLENGE_PREFIX };
