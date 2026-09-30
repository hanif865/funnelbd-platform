import bcrypt from 'bcryptjs';
import { Admin, ADMIN_ROLES } from '../models/index.js';

/** GET /api/admin/users → all panel users (no hashes; toJSON strips them). */
export async function listUsers(req, res, next) {
  try {
    const users = await Admin.find().sort({ createdAt: 1 });
    res.json({ users: users.map((u) => u.toJSON()) });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/users → create a staff/admin user. */
export async function createUser(req, res, next) {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'Enter name, email and password.' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (!ADMIN_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role.' });
    const em = String(email).toLowerCase().trim();
    if (await Admin.findOne({ email: em })) return res.status(400).json({ error: 'A user with this email already exists.' });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await Admin.create({ name: String(name).trim(), email: em, passwordHash, role, active: true });
    res.status(201).json({ ok: true, user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/users/:id → update name/role/active (not self-demotion lock-out). */
export async function updateUser(req, res, next) {
  try {
    const { name, role, active } = req.body || {};
    const user = await Admin.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Guard: don't let the last active admin be demoted/deactivated.
    const isSelf = String(user._id) === String(req.admin._id);
    const demoting = (role && role !== 'admin') || active === false;
    if (user.role === 'admin' && demoting) {
      const activeAdmins = await Admin.countDocuments({ role: 'admin', active: true });
      if (activeAdmins <= 1) return res.status(400).json({ error: 'At least one active admin is required.' });
    }

    if (name !== undefined) user.name = String(name).trim();
    if (role !== undefined && ADMIN_ROLES.includes(role)) user.role = role;
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
    const user = await Admin.findById(req.params.id);
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
    const user = await Admin.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (String(user._id) === String(req.admin._id)) return res.status(400).json({ error: 'You cannot delete yourself.' });
    if (user.role === 'admin') {
      const admins = await Admin.countDocuments({ role: 'admin', active: true });
      if (admins <= 1) return res.status(400).json({ error: 'The last admin cannot be deleted.' });
    }
    await user.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export default { listUsers, createUser, updateUser, resetPassword, deleteUser };
