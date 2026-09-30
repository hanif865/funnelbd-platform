import mongoose from 'mongoose';

export const ADMIN_ROLES = ['admin', 'staff'];

/**
 * Panel user. role=admin can do everything; role=staff can manage orders only
 * (settings are off-limits — enforced in route middleware).
 */
const adminSchema = new mongoose.Schema(
  {
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
