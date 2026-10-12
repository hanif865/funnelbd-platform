import mongoose from 'mongoose';

export const ORDER_STATUSES = [
  'new', // নতুন
  'confirmed', // কনফার্মড
  'shipped', // কুরিয়ারে পাঠানো
  'delivered', // ডেলিভারড
  'cancelled', // ক্যানসেল
  'returned', // রিটার্ন
  'hold', // হোল্ড
];

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    by: { type: String, default: 'system' }, // admin name or 'system'
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const noteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    by: { type: String, default: 'system' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: Number, required: true, unique: true },

    // The funnel (product) this order came from. Stamped from the offer at
    // creation; backfilled for old orders by the default-funnel migration.
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null, index: true },

    customer: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true }, // normalized 8801XXXXXXXXX
      address: { type: String, required: true, trim: true },
    },

    // Answers to dynamic (non-core) form fields, keyed by field.name.
    customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    customFieldLabels: { type: mongoose.Schema.Types.Mixed, default: {} },
    variantSummary: { type: String, default: '' },

    offerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer', required: true },
    offerTitle: { type: String, default: '' }, // snapshot for history
    unitPrice: { type: Number, required: true }, // snapshot of offer price
    quantity: { type: Number, required: true, min: 1 },

    deliveryZoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryZone', default: null },
    deliveryZoneName: { type: String, default: '' }, // snapshot
    deliveryCharge: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },

    subtotal: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },

    status: { type: String, enum: ORDER_STATUSES, default: 'new' },
    statusHistory: { type: [statusHistorySchema], default: [] },
    notes: { type: [noteSchema], default: [] },

    // Attribution + identifiers captured at order time — the fuel for
    // server-side Purchase events (Phase 2).
    tracking: {
      fbp: { type: String, default: '' },
      fbc: { type: String, default: '' },
      fbclid: { type: String, default: '' },
      gclid: { type: String, default: '' },
      ttclid: { type: String, default: '' },
      ttp: { type: String, default: '' },
      wbraid: { type: String, default: '' },
      gbraid: { type: String, default: '' },
      campaignId: { type: String, default: '' },
      adId: { type: String, default: '' },
      adsetId: { type: String, default: '' },
      utm: {
        source: { type: String, default: '' },
        medium: { type: String, default: '' },
        campaign: { type: String, default: '' },
        content: { type: String, default: '' },
        term: { type: String, default: '' },
        id: { type: String, default: '' },
      },
      ip: { type: String, default: '' },
      userAgent: { type: String, default: '' },
      eventId: { type: String, default: '' }, // shared browser+server Purchase dedup id
      externalId: { type: String, default: '' }, // raw session id (hashed at send time)
      gaClientId: { type: String, default: '' }, // GA4 _ga client id for MP stitching
    },

    // Attribution source bucket derived from utm/click ids for dashboard.
    source: { type: String, default: 'Direct' }, // Facebook|Google|TikTok|Direct

    courier: {
      provider: { type: String, default: '' },
      consignmentId: { type: String, default: '' },
      trackingCode: { type: String, default: '' },
    },

    // Last revision applied from the CRM reverse-sync (stale updates ignored).
    crmRev: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'orders' }
);

orderSchema.index({ 'customer.phone': 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

export const Order = mongoose.model('Order', orderSchema);
export default Order;
