import mongoose from 'mongoose';

export const EVENT_PLATFORMS = ['facebook', 'google', 'tiktok'];
export const EVENT_STATUSES = ['pending', 'success', 'failed'];

/**
 * Record of a server-side tracking event dispatch. The admin Tracking page
 * shows the last ~100 of these so tracking can be debugged without guesswork.
 */
const eventLogSchema = new mongoose.Schema(
  {
    platform: { type: String, enum: EVENT_PLATFORMS, required: true },
    eventName: { type: String, required: true }, // Purchase, InitiateCheckout...
    eventId: { type: String, default: '' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null }, // which funnel fired it
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: EVENT_STATUSES, default: 'pending' },
    response: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: '' },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'event_logs' }
);

// TTL: MongoDB auto-deletes logs older than 30 days. Events were already sent
// to the ad platforms; these rows are only for debugging, and without expiry
// they would eventually fill the Atlas free tier (512MB hard limit) and block
// new orders. Also serves the newest-first sort.
export const EVENT_LOG_TTL_DAYS = 30;
eventLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: EVENT_LOG_TTL_DAYS * 24 * 60 * 60 });
eventLogSchema.index({ platform: 1, status: 1 });
eventLogSchema.index({ productId: 1, createdAt: -1 });

export const EventLog = mongoose.model('EventLog', eventLogSchema);
export default EventLog;
