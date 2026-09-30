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
    if (!name || !email || !password) return res.status(400).json({ error: 'নাম, ইমেইল, পাসওয়ার্ড দিন।' });
    if (String(password).length < 6) return res.status(400).json({ error: 'পাসওয়ার্ড অন্তত ৬ অক্ষর।' });
    if (!ADMIN_ROLES.includes(role)) return res.status(400).json({ error: 'অবৈধ রোল।' });
    const em = String(email).toLowerCase().trim();
    if (await Admin.findOne({ email: em })) return res.status(400).json({ error: 'এই ইমেইলে ইউজার আছে।' });

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
    if (!user) return res.status(404).json({ error: 'ইউজার নেই।' });

    // Guard: don't let the last active admin be demoted/deactivated.
    const isSelf = String(user._id) === String(req.admin._id);
    const demoting = (role && role !== 'admin') || active === false;
    if (user.role === 'admin' && demoting) {
      const activeAdmins = await Admin.countDocuments({ role: 'admin', active: true });
      if (activeAdmins <= 1) return res.status(400).json({ error: 'অন্তত একজন সক্রিয় অ্যাডমিন থাকতে হবে।' });
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
    if (!password || String(password).length < 6) return res.status(400).json({ error: 'পাসওয়ার্ড অন্তত ৬ অক্ষর।' });
    const user = await Admin.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'ইউজার নেই।' });
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
    if (!user) return res.status(404).json({ error: 'ইউজার নেই।' });
    if (String(user._id) === String(req.admin._id)) return res.status(400).json({ error: 'নিজেকে ডিলিট করা যাবে না।' });
    if (user.role === 'admin') {
      const admins = await Admin.countDocuments({ role: 'admin', active: true });
      if (admins <= 1) return res.status(400).json({ error: 'শেষ অ্যাডমিন ডিলিট করা যাবে না।' });
    }
    await user.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export default { listUsers, createUser, updateUser, resetPassword, deleteUser };
