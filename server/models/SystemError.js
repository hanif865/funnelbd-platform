import mongoose from 'mongoose';

/**
 * Server/database errors surfaced to admins (System Status page). Written
 * best-effort by services/systemErrors.js — when the database itself is the
 * problem, errors live only in process memory until it recovers.
 */
const systemErrorSchema = new mongoose.Schema(
  {
    key: { type: String, index: true }, // dedupe key (source + kind + message)
    source: { type: String, default: '' }, // where it happened, e.g. 'checkout', 'db'
    kind: { type: String, default: 'unknown' },
    severity: { type: String, enum: ['critical', 'error', 'warning'], default: 'error' },
    title: { type: String, default: '' }, // Bangla, admin-friendly
    hint: { type: String, default: '' }, // Bangla, what to do
    message: { type: String, default: '' }, // raw technical message
    code: { type: mongoose.Schema.Types.Mixed, default: null },
    path: { type: String, default: '' }, // request path, if any
    process: { type: String, default: 'web' },
    count: { type: Number, default: 1 },
    lastAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'system_errors' }
);

// Keep 30 days, like event_logs, so this can never fill the storage quota.
systemErrorSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
systemErrorSchema.index({ lastAt: -1 });

export const SystemError = mongoose.model('SystemError', systemErrorSchema);
export default SystemError;
