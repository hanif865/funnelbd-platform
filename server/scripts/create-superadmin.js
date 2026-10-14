import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB } from '../config/db.js';
import { Admin } from '../models/index.js';

/**
 * Create (or promote) the platform super-admin — the operator account that
 * manages all tenants and belongs to no account. Use this to bootstrap a fresh
 * platform database (instead of `seed`, which creates a demo funnel).
 *
 *   SA_EMAIL=you@x.com SA_PASSWORD=secret123 SA_NAME="Owner" npm run superadmin:create
 *   node server/scripts/create-superadmin.js --email you@x.com --password secret123 --name "Owner"
 *
 * If the email already exists, it is promoted to superadmin (accountId cleared).
 */
function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : null;
}

async function run() {
  const email = String(arg('email') || process.env.SA_EMAIL || '').toLowerCase().trim();
  const password = String(arg('password') || process.env.SA_PASSWORD || '');
  const name = String(arg('name') || process.env.SA_NAME || 'Platform Owner').trim();

  if (!email || !email.includes('@')) { console.error('[superadmin] a valid --email is required.'); process.exit(1); }
  if (password.length < 8) { console.error('[superadmin] --password must be at least 8 characters.'); process.exit(1); }

  await connectDB();
  const existing = await Admin.findOne({ email });
  if (existing) {
    existing.role = 'superadmin';
    existing.accountId = null;
    existing.active = true;
    if (password) existing.passwordHash = await bcrypt.hash(password, 10);
    await existing.save();
    console.log(`[superadmin] promoted existing user ${email} to platform superadmin.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    await Admin.create({ name, email, passwordHash, role: 'superadmin', accountId: null, active: true });
    console.log(`[superadmin] created platform superadmin ${email}.`);
  }
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => { console.error('[superadmin] failed:', err); process.exit(1); });
