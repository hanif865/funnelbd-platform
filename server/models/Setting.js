import mongoose from 'mongoose';

/**
 * Generic key-value store for admin-configurable settings: duplicate cooldown,
 * pixel IDs, SMS templates, courier credentials, etc. Value is Mixed so it can
 * hold strings, numbers, booleans, or nested objects per key.
 */
const settingSchema = new mongoose.Schema(
  {
    // accountId scopes settings per tenant; (accountId, key) is unique. Legacy
    // rows have accountId null until saas-migrate stamps them.
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
    key: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true, collection: 'settings' }
);

settingSchema.index({ accountId: 1, key: 1 }, { unique: true });

export const Setting = mongoose.model('Setting', settingSchema);
export default Setting;
