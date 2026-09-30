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
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: EVENT_STATUSES, default: 'pending' },
    response: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: '' },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'event_logs' }
);

eventLogSchema.index({ createdAt: -1 });
eventLogSchema.index({ platform: 1, status: 1 });

export const EventLog = mongoose.model('EventLog', eventLogSchema);
export default EventLog;
