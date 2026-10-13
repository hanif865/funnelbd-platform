import mongoose from 'mongoose';

/**
 * An offer is a purchasable "card" on the checkout (e.g. "2 pcs — 1,099৳").
 * price is the actual charge; comparePrice (optional) is the struck-through
 * higher price used to show savings. `quantity` is how many product units this
 * card represents (used for stock + summary display).
 */
const offerSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    title: { type: String, required: true, trim: true },
    sku: { type: String, default: '', trim: true }, // product code sent to the CRM (falls back to _id)
    price: { type: Number, required: true, min: 0 },
    comparePrice: { type: Number, default: null, min: 0 },
    quantity: { type: Number, default: 1, min: 1 },
    image: { type: String, default: '' },
    badge: { type: String, default: '' },
    isDefault: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'offers' }
);

offerSchema.index({ order: 1 });

export const Offer = mongoose.model('Offer', offerSchema);
export default Offer;
