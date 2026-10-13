import mongoose from 'mongoose';

// superadmin = platform owner (no account); admin/staff belong to one Account.
export const ADMIN_ROLES = ['superadmin', 'admin', 'staff'];

/**
 * Panel user. role=admin can do everything within their Account; role=staff can
 * manage orders only (settings off-limits — enforced in route middleware);
 * role=superadmin is the platform owner and belongs to no Account (accountId
 * null). Every non-superadmin user is scoped to a single Account via accountId.
 */
const adminSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ADMIN_ROLES, default: 'admin' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'admins' }
);

// Never leak the hash in JSON responses.
adminSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    return ret;
  },
});

export const Admin = mongoose.model('Admin', adminSchema);
export default Admin;
