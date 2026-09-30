import { Router } from 'express';
import { requireAdmin, requireRole } from '../middlewares/auth.js';
import {
  login,
  logout,
  me,
  listOrders,
  getOrder,
  updateStatus,
  addNote,
  sendCourier,
  fraudCheckOrder,
  bulkStatus,
  bulkCourier,
  exportOrders,
} from '../controllers/admin.controller.js';
import { getDashboard } from '../controllers/dashboard.controller.js';
import {
  listUsers,
  createUser,
  updateUser,
  resetPassword,
  deleteUser,
} from '../controllers/users.controller.js';
import {
  getTracking,
  updateTracking,
  listEventLogs,
} from '../controllers/tracking.controller.js';
import {
  listIncomplete,
  updateIncompleteStatus,
  sendIncompleteFollowUp,
  convertIncomplete,
  offersForConvert,
} from '../controllers/incomplete.controller.js';
import {
  getProduct,
  updateProduct,
  listOffers,
  createOffer,
  updateOffer,
  deleteOffer,
  listFields,
  createField,
  updateField,
  deleteField,
  reorderFields,
  listZones,
  createZone,
  updateZone,
  deleteZone,
} from '../controllers/catalog.controller.js';
import {
  getGeneralSettings,
  updateGeneralSettings,
  getCourierSettings,
  updateCourierSettings,
} from '../controllers/settings.controller.js';
import { handleUpload } from '../controllers/upload.controller.js';
import { rateLimit } from '../middlewares/rateLimit.js';

const router = Router();

// ── Auth ─────────────────────────────────────────────
router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'অনেকবার ভুল চেষ্টা — ১৫ মিনিট পর আবার চেষ্টা করুন।' }), login);
router.post('/logout', logout);
router.get('/me', requireAdmin, me);

// ── Dashboard ────────────────────────────────────────
router.get('/dashboard', requireAdmin, getDashboard);

// ── Orders (specific paths BEFORE :id to avoid capture) ──
router.get('/orders', requireAdmin, listOrders);
router.get('/orders/export', requireAdmin, exportOrders);
router.patch('/orders/bulk/status', requireAdmin, bulkStatus);
router.post('/orders/bulk/courier', requireAdmin, bulkCourier);
router.get('/orders/:id', requireAdmin, getOrder);
router.patch('/orders/:id/status', requireAdmin, updateStatus);
router.post('/orders/:id/notes', requireAdmin, addNote);
router.post('/orders/:id/courier', requireAdmin, sendCourier);
router.get('/orders/:id/fraud', requireAdmin, fraudCheckOrder);

// ── Incomplete orders (recovery) ─────────────────────
router.get('/incomplete', requireAdmin, listIncomplete);
router.get('/incomplete/offers', requireAdmin, offersForConvert);
router.patch('/incomplete/:id/status', requireAdmin, updateIncompleteStatus);
router.post('/incomplete/:id/followup', requireAdmin, sendIncompleteFollowUp);
router.post('/incomplete/:id/convert', requireAdmin, convertIncomplete);

// ── Product & Offers ─────────────────────────────────
router.get('/product', requireAdmin, getProduct);
router.put('/product', requireAdmin, requireRole('admin'), updateProduct);
router.get('/offers', requireAdmin, listOffers);
router.post('/offers', requireAdmin, requireRole('admin'), createOffer);
router.put('/offers/:id', requireAdmin, requireRole('admin'), updateOffer);
router.delete('/offers/:id', requireAdmin, requireRole('admin'), deleteOffer);

// ── Form fields ──────────────────────────────────────
router.get('/fields', requireAdmin, listFields);
router.post('/fields', requireAdmin, requireRole('admin'), createField);
router.put('/fields/reorder', requireAdmin, requireRole('admin'), reorderFields);
router.put('/fields/:id', requireAdmin, requireRole('admin'), updateField);
router.delete('/fields/:id', requireAdmin, requireRole('admin'), deleteField);

// ── Delivery zones ───────────────────────────────────
router.get('/zones', requireAdmin, listZones);
router.post('/zones', requireAdmin, requireRole('admin'), createZone);
router.put('/zones/:id', requireAdmin, requireRole('admin'), updateZone);
router.delete('/zones/:id', requireAdmin, requireRole('admin'), deleteZone);

// ── General settings (admin-only) ────────────────────
router.get('/settings', requireAdmin, getGeneralSettings);
router.put('/settings', requireAdmin, requireRole('admin'), updateGeneralSettings);

// ── Courier config (admin-only) ──────────────────────
router.get('/courier', requireAdmin, requireRole('admin'), getCourierSettings);
router.put('/courier', requireAdmin, requireRole('admin'), updateCourierSettings);

// ── Panel users / staff roles (admin-only) ───────────
router.get('/users', requireAdmin, requireRole('admin'), listUsers);
router.post('/users', requireAdmin, requireRole('admin'), createUser);
router.put('/users/:id', requireAdmin, requireRole('admin'), updateUser);
router.post('/users/:id/password', requireAdmin, requireRole('admin'), resetPassword);
router.delete('/users/:id', requireAdmin, requireRole('admin'), deleteUser);

// ── Image upload ─────────────────────────────────────
router.post('/upload', requireAdmin, requireRole('admin'), handleUpload);

// ── Tracking ─────────────────────────────────────────
router.get('/tracking', requireAdmin, getTracking);
router.put('/tracking', requireAdmin, requireRole('admin'), updateTracking);
router.get('/tracking/events', requireAdmin, listEventLogs);

export default router;
