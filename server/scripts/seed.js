import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { config } from '../config/index.js';
import { Product } from '../models/index.js';
import { seedDefaults } from './seedData.js';

/**
 * CLI seed against the configured MONGODB_URI. Run with: npm run seed
 */
async function seed() {
  // Production guard: never create an admin with the default/weak password.
  const pw = config.seedAdmin.password;
  if (config.isProd && (pw === 'admin1234' || pw.length < 10)) {
    console.error('[seed] aborted: set a strong SEED_ADMIN_PASSWORD (10+ chars, not the default) in .env.');
    process.exit(1);
  }

  await connectDB();

  // Seeding wipes products/offers/fields/zones — refuse on a live database
  // unless explicitly forced with `npm run seed -- --force`.
  if (!process.argv.includes('--force') && (await Product.countDocuments()) > 0) {
    console.error('[seed] aborted: database already has a product. Re-seeding would DELETE');
    console.error('       products, offers, form fields and delivery zones.');
    console.error('       If you really mean it: npm run seed -- --force');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('[seed] connected, seeding defaults...');
  const { adminEmail, adminPassword } = await seedDefaults();
  console.log('[seed] done.');
  console.log(`[seed] admin login → ${adminEmail} / ${config.isProd ? '(SEED_ADMIN_PASSWORD from .env)' : adminPassword}`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
