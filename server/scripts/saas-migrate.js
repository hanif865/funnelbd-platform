import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { config } from '../config/index.js';
import {
  Account, Domain, Admin,
  Product, Offer, FormField, DeliveryZone,
  Order, IncompleteOrder, DailyStat, EventLog, Setting,
} from '../models/index.js';

/**
 * SaaS Phase S1 migration: fold all existing single-tenant data into one
 * Account ("Account #1") by stamping `accountId` everywhere, and register the
 * current primary host as that account's domain.
 *
 *   node server/scripts/saas-migrate.js                         # dry run
 *   node server/scripts/saas-migrate.js --apply                 # write
 *   node server/scripts/saas-migrate.js --apply --superadmin-email=you@x.com
 *
 * `--superadmin-email` promotes that existing admin to the platform superadmin
 * (accountId null, role superadmin). Everyone else becomes an Account #1 admin.
 * Idempotent: re-running only touches documents still missing an accountId.
 */
const TENANT_MODELS = [
  ['products', Product], ['offers', Offer], ['form_fields', FormField],
  ['delivery_zones', DeliveryZone], ['orders', Order], ['incomplete_orders', IncompleteOrder],
  ['daily_stats', DailyStat], ['event_logs', EventLog], ['settings', Setting], ['admins', Admin],
];

function primaryHost() {
  try { return new URL(config.baseUrl).host.toLowerCase(); } catch { return ''; }
}

/**
 * Core migration. Assumes an open mongoose connection. Returns a summary.
 * @param {{apply?: boolean, superadminEmail?: string, host?: string, log?: Function}} opts
 */
export async function migrate({ apply = false, superadminEmail = '', host, log = () => {} } = {}) {
  const summary = { apply, counts: {}, accountId: null, stamped: {}, superadmin: null, domain: null };
  const theHost = (host ?? primaryHost()).toLowerCase();

  for (const [name, Model] of TENANT_MODELS) {
    summary.counts[name] = await Model.countDocuments({ accountId: null });
  }
  log('[saas-migrate] to stamp:', summary.counts);

  if (!apply) return summary;

  // 1. The tenant account (reuse if this ran before).
  let account = await Account.findOne().sort({ createdAt: 1 });
  if (!account) {
    const firstProduct = await Product.findOne().sort({ createdAt: 1 }).lean();
    account = await Account.create({ name: firstProduct?.name || 'Account 1', slug: 'account-1', status: 'active' });
    log(`[saas-migrate] created account "${account.name}"`);
  }
  summary.accountId = account._id;

  // 2. Stamp accountId everywhere it's still null.
  for (const [name, Model] of TENANT_MODELS) {
    const r = await Model.updateMany({ accountId: null }, { $set: { accountId: account._id } });
    summary.stamped[name] = r.modifiedCount;
  }

  // 2b. Some uniques moved to be per-account. Drop the old single-field unique
  // indexes so other tenants can reuse the same keys / slugs, then rebuild.
  async function repointUnique(Model, field, label) {
    try {
      const coll = Model.collection;
      const idx = await coll.indexes();
      const old = idx.find((i) => i.unique && i.key && i.key[field] === 1 && Object.keys(i.key).length === 1);
      if (old) { await coll.dropIndex(old.name); summary[`dropped_${label}`] = old.name; }
      await Model.syncIndexes();
    } catch (e) {
      summary[`${label}IndexError`] = e.message;
    }
  }
  await repointUnique(Setting, 'key', 'settingIndex');
  await repointUnique(Product, 'slug', 'productSlugIndex');

  // 3. Platform superadmin (optional) — lift them out of the account.
  const su = superadminEmail ? await Admin.findOne({ email: superadminEmail.toLowerCase().trim() }) : null;
  if (su) {
    su.role = 'superadmin';
    su.accountId = null;
    await su.save();
    summary.superadmin = su.email;
  }

  // 4. Register the current primary host as the account's (verified) domain.
  if (theHost && !(await Domain.findOne({ host: theHost }))) {
    await Domain.create({ host: theHost, accountId: account._id, type: 'custom', verified: true, isPrimary: true });
    summary.domain = theHost;
  }

  // 5. Point the account's owner at the first remaining account admin.
  if (!account.ownerId) {
    const owner = await Admin.findOne({ accountId: account._id, role: 'admin' }).sort({ createdAt: 1 });
    if (owner) { account.ownerId = owner._id; await account.save(); }
  }

  return summary;
}

// ── CLI wrapper ─────────────────────────────────────────────
function cliArg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDB();
  console.log('[saas-migrate] ' + (apply ? 'APPLY mode' : 'dry run (use --apply to write)'));
  const summary = await migrate({ apply, superadminEmail: cliArg('superadmin-email') || '', log: console.log });
  console.log('[saas-migrate] summary:', JSON.stringify(summary, null, 2));
  console.log('[saas-migrate] done.');
  await mongoose.disconnect();
  process.exit(0);
}

// Only run as a script, not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith('saas-migrate.js')) {
  main().catch((err) => { console.error('[saas-migrate] failed:', err); process.exit(1); });
}
