import { Account, Admin, Domain, Product, Order, IncompleteOrder, ACCOUNT_STATUSES } from '../models/index.js';
import { invalidateDomainCache } from '../services/domain.service.js';

/** GET /api/admin/superadmin/accounts → every tenant with headline stats. */
export async function listAccounts(req, res, next) {
  try {
    const accounts = await Account.find().sort({ createdAt: -1 }).lean();
    const ownerIds = accounts.map((a) => a.ownerId).filter(Boolean);
    const [funnelCounts, orderAgg, owners, primaryDomains] = await Promise.all([
      Product.aggregate([{ $group: { _id: '$accountId', n: { $sum: 1 } } }]),
      Order.aggregate([{ $group: { _id: '$accountId', orders: { $sum: 1 }, revenue: { $sum: { $cond: [{ $in: ['$status', ['cancelled', 'returned']] }, 0, '$total'] } } } }]),
      Admin.find({ _id: { $in: ownerIds } }).select('email name').lean(),
      Domain.find({ isPrimary: true }).select('accountId host').lean(),
    ]);
    const fMap = Object.fromEntries(funnelCounts.map((x) => [String(x._id), x.n]));
    const oMap = Object.fromEntries(orderAgg.map((x) => [String(x._id), x]));
    const ownerMap = Object.fromEntries(owners.map((o) => [String(o._id), o]));
    const domMap = Object.fromEntries(primaryDomains.map((d) => [String(d.accountId), d.host]));

    res.json({
      accounts: accounts.map((a) => ({
        _id: a._id,
        name: a.name,
        slug: a.slug,
        status: a.status,
        plan: a.plan,
        createdAt: a.createdAt,
        ownerEmail: ownerMap[String(a.ownerId)]?.email || '',
        primaryHost: domMap[String(a._id)] || `${a.slug}`,
        funnels: fMap[String(a._id)] || 0,
        orders: oMap[String(a._id)]?.orders || 0,
        revenue: oMap[String(a._id)]?.revenue || 0,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/superadmin/accounts/:id → one tenant in detail. */
export async function getAccount(req, res, next) {
  try {
    const account = await Account.findById(req.params.id).lean();
    if (!account) return res.status(404).json({ error: 'Account not found.' });
    const id = account._id;
    const [owner, domains, funnels, orders, incomplete, users] = await Promise.all([
      account.ownerId ? Admin.findById(account.ownerId).select('name email').lean() : null,
      Domain.find({ accountId: id }).sort({ createdAt: 1 }).lean(),
      Product.find({ accountId: id }).select('name slug active').sort({ createdAt: 1 }).lean(),
      Order.countDocuments({ accountId: id }),
      IncompleteOrder.countDocuments({ accountId: id }),
      Admin.countDocuments({ accountId: id }),
    ]);
    res.json({ account, owner, domains, funnels, counts: { orders, incomplete, users } });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/superadmin/accounts/:id/status → active | suspended. */
export async function setAccountStatus(req, res, next) {
  try {
    const status = String(req.body?.status || '');
    if (!ACCOUNT_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const account = await Account.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!account) return res.status(404).json({ error: 'Account not found.' });
    invalidateDomainCache(); // drop cached account status so gating takes effect now
    res.json({ ok: true, account });
  } catch (err) {
    next(err);
  }
}

export default { listAccounts, getAccount, setAccountStatus };
