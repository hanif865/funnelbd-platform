import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { Product, Offer, FormField, DeliveryZone, Order, IncompleteOrder, DailyStat } from '../models/index.js';

/**
 * DailyStat went from one row per day to one row per (day, funnel). Drop the old
 * `date` unique index so per-funnel rows can coexist, and build the compound
 * unique index. Existing day-only rows keep productId null (the "all funnels"
 * bucket). Safe to run repeatedly.
 */
async function migrateDailyStatIndexes(apply) {
  const coll = DailyStat.collection;
  let indexes = [];
  try { indexes = await coll.indexes(); } catch { return; }
  const oldDateIdx = indexes.find((i) => i.unique && i.key && i.key.date === 1 && Object.keys(i.key).length === 1);
  console.log(`[funnel-migrate] daily_stats old unique date index: ${oldDateIdx ? oldDateIdx.name : 'none'}`);
  if (!apply) return;
  if (oldDateIdx) {
    await coll.dropIndex(oldDateIdx.name);
    console.log(`[funnel-migrate] dropped daily_stats index ${oldDateIdx.name}`);
  }
  await DailyStat.syncIndexes();
  console.log('[funnel-migrate] daily_stats indexes synced (compound date+productId unique).');
}

/**
 * Multi-funnel groundwork: stamp every existing form field, delivery zone, order
 * and incomplete order with a `productId` (the funnel it belongs to). Until this
 * runs those fields are null and the app behaves exactly as before — this fills
 * them so per-funnel scoping can be turned on safely.
 *
 * Fields/zones → the single current product. Orders/incompletes → their offer's
 * product, falling back to the current product.
 *
 *   node server/scripts/assign-default-funnel.js            # dry run
 *   node server/scripts/assign-default-funnel.js --apply    # write
 *
 * Idempotent: only documents still missing a productId are touched.
 */
async function run() {
  const apply = process.argv.includes('--apply');
  await connectDB();
  console.log('[funnel-migrate] ' + (apply ? 'APPLY mode' : 'dry run (use --apply to write)'));

  const product = await Product.findOne({ active: true }).sort({ createdAt: 1 }).lean();
  if (!product) {
    console.error('[funnel-migrate] no active product found — nothing to do.');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`[funnel-migrate] default funnel: "${product.name}" (slug: ${product.slug}, id: ${product._id})`);

  const offerToProduct = Object.fromEntries(
    (await Offer.find().select('productId').lean()).map((o) => [String(o._id), o.productId || product._id])
  );

  // Counts for the dry-run summary.
  const need = {
    fields: await FormField.countDocuments({ productId: null }),
    zones: await DeliveryZone.countDocuments({ productId: null }),
    orders: await Order.countDocuments({ productId: null }),
    incomplete: await IncompleteOrder.countDocuments({ productId: null }),
  };
  console.log(`[funnel-migrate] to stamp → fields: ${need.fields}, zones: ${need.zones}, orders: ${need.orders}, incomplete: ${need.incomplete}`);

  await migrateDailyStatIndexes(apply);

  if (!apply) {
    console.log('[funnel-migrate] dry run only — re-run with --apply to write.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Fields + zones: all belong to the single current funnel.
  const f = await FormField.updateMany({ productId: null }, { $set: { productId: product._id } });
  const z = await DeliveryZone.updateMany({ productId: null }, { $set: { productId: product._id } });

  // Orders + incompletes: by their offer's product, else the default.
  async function stampByOffer(Model) {
    let byOffer = 0;
    for (const [offerId, pid] of Object.entries(offerToProduct)) {
      const r = await Model.updateMany({ productId: null, offerId }, { $set: { productId: pid } });
      byOffer += r.modifiedCount;
    }
    const rest = await Model.updateMany({ productId: null }, { $set: { productId: product._id } });
    return byOffer + rest.modifiedCount;
  }
  const orders = await stampByOffer(Order);
  const incomplete = await stampByOffer(IncompleteOrder);

  console.log(`[funnel-migrate] stamped → fields: ${f.modifiedCount}, zones: ${z.modifiedCount}, orders: ${orders}, incomplete: ${incomplete}`);
  console.log('[funnel-migrate] done.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('[funnel-migrate] failed:', err);
  process.exit(1);
});
