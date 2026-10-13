import mongoose from 'mongoose';

export const INCOMPLETE_STATUSES = ['new', 'called', 'converted', 'dead'];

/**
 * A visitor who started filling the checkout but did not submit. One entry
 * per session (upserted on draft POSTs). The phone number is the most
 * valuable field — it lets admins follow up and recover the sale.
 */
const incompleteOrderSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null, index: true }, // funnel
    data: { type: mongoose.Schema.Types.Mixed, default: {} }, // partial form data
    phone: { type: String, default: '' }, // normalized when valid
    phoneValid: { type: Boolean, default: false },
    offerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer', default: null },

    firstSeenAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now },
    visitCount: { type: Number, default: 1 },

    status: { type: String, enum: INCOMPLETE_STATUSES, default: 'new' },
    followUpSentAt: { type: Date, default: null },

    tracking: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'incomplete_orders' }
);

incompleteOrderSchema.index({ status: 1, lastActivityAt: -1 });
incompleteOrderSchema.index({ phone: 1 });

export const IncompleteOrder = mongoose.model('IncompleteOrder', incompleteOrderSchema);
export default IncompleteOrder;
