import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Admin, ADMIN_ROLES } from '../models/index.js';

// The tenant this request belongs to (set by auth middleware). Users are scoped
// to it so an account admin manages only their own account's staff.
function acct(req) {
  const id = req.accountId;
  return id && mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
}

// Roles an account admin may assign (never the platform superadmin).
const ASSIGNABLE_ROLES = ['admin', 'staff'];

/** GET /api/admin/users → this account's panel users (no hashes). */
export async function listUsers(req, res, next) {
  try {
    const users = await Admin.find({ accountId: acct(req) }).sort({ createdAt: 1 });
    res.json({ users: users.map((u) => u.toJSON()) });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/users → create a staff/admin user in this account. */
export async function createUser(req, res, next) {
  try {
    const accountId = acct(req);
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'Enter name, email and password.' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (!ASSIGNABLE_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role.' });
    const em = String(email).toLowerCase().trim();
    if (await Admin.findOne({ email: em })) return res.status(400).json({ error: 'A user with this email already exists.' });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await Admin.create({ accountId, name: String(name).trim(), email: em, passwordHash, role, active: true });
    res.status(201).json({ ok: true, user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/users/:id → update name/role/active within this account. */
export async function updateUser(req, res, next) {
  try {
    const accountId = acct(req);
    const { name, role, active } = req.body || {};
    const user = await Admin.findOne({ _id: req.params.id, accountId });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Guard: don't let the account's last active admin be demoted/deactivated.
    const isSelf = String(user._id) === String(req.admin._id);
    const demoting = (role && role !== 'admin') || active === false;
    if (user.role === 'admin' && demoting) {
      const activeAdmins = await Admin.countDocuments({ accountId, role: 'admin', active: true });
      if (activeAdmins <= 1) return res.status(400).json({ error: 'At least one active admin is required.' });
    }

    if (name !== undefined) user.name = String(name).trim();
    if (role !== undefined && ASSIGNABLE_ROLES.includes(role)) user.role = role;
    if (active !== undefined && !(isSelf && active === false)) user.active = !!active;
    await user.save();
    res.json({ ok: true, user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/users/:id/password → reset a user's password. */
export async function resetPassword(req, res, next) {
  try {
    const { password } = req.body || {};
    if (!password || String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const user = await Admin.findOne({ _id: req.params.id, accountId: acct(req) });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    user.passwordHash = await bcrypt.hash(String(password), 10);
    await user.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/admin/users/:id → remove a user (not self, not last admin). */
export async function deleteUser(req, res, next) {
  try {
    const accountId = acct(req);
    const user = await Admin.findOne({ _id: req.params.id, accountId });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (String(user._id) === String(req.admin._id)) return res.status(400).json({ error: 'You cannot delete yourself.' });
    if (user.role === 'admin') {
      const admins = await Admin.countDocuments({ accountId, role: 'admin', active: true });
      if (admins <= 1) return res.status(400).json({ error: 'The last admin cannot be deleted.' });
    }
    await user.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export default { listUsers, createUser, updateUser, resetPassword, deleteUser };
