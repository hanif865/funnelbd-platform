import mongoose from 'mongoose';

export const ACCOUNT_STATUSES = ['active', 'suspended', 'pending'];

/**
 * A tenant on the SaaS platform. Every signup creates one Account; all funnels,
 * orders, settings, tracking and domains belong to exactly one Account via an
 * `accountId` field. The platform super-admin sits outside any Account.
 *
 * `slug` is the free subdomain label (→ <slug>.<APP_DOMAIN>). Custom domains
 * live in the Domain collection and point back here.
 */
const accountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // business / store name
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: { type: String, enum: ACCOUNT_STATUSES, default: 'active', index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    plan: { type: String, default: 'free' }, // billing comes later
  },
  { timestamps: true, collection: 'accounts' }
);

export const Account = mongoose.model('Account', accountSchema);
export default Account;
