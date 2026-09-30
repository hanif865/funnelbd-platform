import mongoose from 'mongoose';

/**
 * Generic key-value store for admin-configurable settings: duplicate cooldown,
 * pixel IDs, SMS templates, courier credentials, etc. Value is Mixed so it can
 * hold strings, numbers, booleans, or nested objects per key.
 */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true, collection: 'settings' }
);

export const Setting = mongoose.model('Setting', settingSchema);
export default Setting;
