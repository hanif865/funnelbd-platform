import { Router } from 'express';
import { requireAdmin, requireAdminToken, requireRole } from '../middlewares/auth.js';
import { getHealth } from '../controllers/system.controller.js';
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
import {
  listFunnels,
  createFunnel,
  cloneFunnel,
  updateFunnel,
  deleteFunnel,
} from '../controllers/funnel.controller.js';
import {
  listDomains,
  addDomain,
  verifyDomain,
  domainTlsStatus,
  setPrimaryDomain,
  deleteDomain,
} from '../controllers/domain.controller.js';
import {
  listAccounts,
  getAccount,
  setAccountStatus,
} from '../controllers/superadmin.controller.js';
import { handleUpload } from '../controllers/upload.controller.js';
import { signup, checkSubdomain } from '../controllers/signup.controller.js';
import { aiStatus, generateLanding } from '../controllers/ai.controller.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import { invalidateCatalogCache } from '../services/catalog.cache.js';
import { invalidateSettingsCache } from '../services/settings.service.js';
import { getCrmStatus, setCrmSync } from './crm.routes.js';

const router = Router();

// Any successful admin write may change catalog/settings → drop the in-memory
// caches so the landing page reflects edits immediately.
router.use((req, res, next) => {
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode < 400) {
        invalidateCatalogCache();
        invalidateSettingsCache();
      }
    });
  }
  next();
});

// ── Auth ─────────────────────────────────────────────
router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many failed attempts — try again in 15 minutes.' }), login);
router.post('/logout', logout);

// ── Public signup (create a new tenant account) ──────
router.post('/signup', rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: 'Too many signups — try again later.' }), signup);
router.get('/signup/check', checkSubdomain);
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

// ── Funnels (multi-funnel management, admin-only) ────
router.get('/funnels', requireAdmin, listFunnels);
router.post('/funnels', requireAdmin, requireRole('admin'), createFunnel);
router.post('/funnels/:id/clone', requireAdmin, requireRole('admin'), cloneFunnel);
router.put('/funnels/:id', requireAdmin, requireRole('admin'), updateFunnel);
router.delete('/funnels/:id', requireAdmin, requireRole('admin'), deleteFunnel);

// ── Platform super-admin (across all tenants) ───────
router.get('/superadmin/accounts', requireAdmin, requireRole('superadmin'), listAccounts);
router.get('/superadmin/accounts/:id', requireAdmin, requireRole('superadmin'), getAccount);
router.patch('/superadmin/accounts/:id/status', requireAdmin, requireRole('superadmin'), setAccountStatus);

// ── AI copy generation (admin-only) ──────────────────
router.get('/ai/status', requireAdmin, aiStatus);
router.post('/ai/landing', requireAdmin, requireRole('admin'), rateLimit({ windowMs: 60 * 1000, max: 10, message: 'Too many AI requests — wait a moment.' }), generateLanding);

// ── Custom domains (admin-only) ──────────────────────
router.get('/domains', requireAdmin, requireRole('admin'), listDomains);
router.post('/domains', requireAdmin, requireRole('admin'), addDomain);
router.post('/domains/:id/verify', requireAdmin, requireRole('admin'), verifyDomain);
router.get('/domains/:id/tls', requireAdmin, requireRole('admin'), domainTlsStatus);
router.post('/domains/:id/primary', requireAdmin, requireRole('admin'), setPrimaryDomain);
router.delete('/domains/:id', requireAdmin, requireRole('admin'), deleteDomain);

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

// ── CRM order sync start/stop (admin-only) ───────────
router.get('/crm', requireAdmin, requireRole('admin'), async (req, res, next) => {
  try { res.json(await getCrmStatus()); } catch (e) { next(e); }
});
router.post('/crm/sync', requireAdmin, requireRole('admin'), async (req, res, next) => {
  try { res.json(await setCrmSync(!!(req.body && req.body.started))); } catch (e) { next(e); }
});

// ── Panel users / staff roles (admin-only) ───────────
router.get('/users', requireAdmin, requireRole('admin'), listUsers);
router.post('/users', requireAdmin, requireRole('admin'), createUser);
router.put('/users/:id', requireAdmin, requireRole('admin'), updateUser);
router.post('/users/:id/password', requireAdmin, requireRole('admin'), resetPassword);
router.delete('/users/:id', requireAdmin, requireRole('admin'), deleteUser);

// ── Image upload ─────────────────────────────────────
router.post('/upload', requireAdmin, requireRole('admin'), handleUpload);

// ── System status (works even while the DB is down) ──
router.get('/system/health', requireAdminToken, getHealth);

// ── Tracking ─────────────────────────────────────────
router.get('/tracking', requireAdmin, getTracking);
router.put('/tracking', requireAdmin, requireRole('admin'), updateTracking);
router.get('/tracking/events', requireAdmin, listEventLogs);

export default router;
