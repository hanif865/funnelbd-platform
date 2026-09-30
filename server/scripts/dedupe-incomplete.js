import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { Order, IncompleteOrder } from '../models/index.js';

/**
 * One-time cleanup for entries that show up in BOTH the Incomplete list and
 * Orders. That happens when a checkout was abandoned in one session and later
 * completed in another (a different cookie, same phone): the earlier incomplete
 * entry stayed "new"/"called" while a real order also exists for that number.
 *
 * (New orders no longer create this state — order.service.js now converts every
 * still-recoverable incomplete entry for the phone. This fixes the old rows.)
 *
 * Marks every recoverable incomplete entry (status new/called) whose phone
 * already has a real order as `converted`, so it drops out of the recovery list.
 *
 * Safe by default: prints what it WOULD change. Pass --apply to write.
 *   node server/scripts/dedupe-incomplete.js            # dry run
 *   node server/scripts/dedupe-incomplete.js --apply    # perform the update
 */
async function run() {
  const apply = process.argv.includes('--apply');
  await connectDB();
  console.log('[dedupe-incomplete] connected' + (apply ? ' — APPLY mode' : ' — dry run (use --apply to write)'));

  // Phones that already have a real order.
  const orderedPhones = (await Order.distinct('customer.phone')).filter(Boolean);
  console.log(`[dedupe-incomplete] ${orderedPhones.length} distinct phone(s) have a real order.`);

  const filter = { phone: { $in: orderedPhones }, status: { $in: ['new', 'called'] } };
  const affected = await IncompleteOrder.countDocuments(filter);
  console.log(`[dedupe-incomplete] ${affected} incomplete entr${affected === 1 ? 'y' : 'ies'} are stuck in both lists.`);

  if (affected > 0) {
    const sample = await IncompleteOrder.find(filter).select('phone data.name status lastActivityAt').limit(10).lean();
    for (const s of sample) {
      console.log(`   · ${s.phone || '(no phone)'} — ${s.data?.name || '(no name)'} [${s.status}]`);
    }
    if (sample.length < affected) console.log(`   … and ${affected - sample.length} more.`);
  }

  if (apply && affected > 0) {
    const res = await IncompleteOrder.updateMany(filter, { $set: { status: 'converted' } });
    console.log(`[dedupe-incomplete] updated ${res.modifiedCount} entr${res.modifiedCount === 1 ? 'y' : 'ies'} → converted.`);
  } else if (!apply && affected > 0) {
    console.log('[dedupe-incomplete] dry run only — re-run with --apply to convert them.');
  } else {
    console.log('[dedupe-incomplete] nothing to do.');
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('[dedupe-incomplete] failed:', err);
  process.exit(1);
});
