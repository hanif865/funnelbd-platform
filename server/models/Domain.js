import mongoose from 'mongoose';

export const DOMAIN_TYPES = ['subdomain', 'custom'];

/**
 * A hostname that routes public traffic to an Account's funnels. Each Account
 * gets one `subdomain` (<slug>.<APP_DOMAIN>) on signup and may add `custom`
 * domains (their own theirshop.com), which need DNS + TLS (Cloudflare for SaaS)
 * before `verified` flips true. The request Host header is matched against
 * `host` to resolve which Account — and thus which funnels — to serve.
 */
const domainSchema = new mongoose.Schema(
  {
    host: { type: String, required: true, unique: true, lowercase: true, trim: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
    type: { type: String, enum: DOMAIN_TYPES, required: true },
    verified: { type: Boolean, default: false },
    isPrimary: { type: Boolean, default: false },
    // Custom-domain provisioning state.
    verificationToken: { type: String, default: '' }, // DNS TXT challenge
    cfHostnameId: { type: String, default: '' },       // Cloudflare for SaaS custom hostname id
  },
  { timestamps: true, collection: 'domains' }
);

export const Domain = mongoose.model('Domain', domainSchema);
export default Domain;
