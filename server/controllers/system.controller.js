import { getDbState, getRecentErrors, getStorageUsage } from '../services/systemErrors.js';

/**
 * GET /api/admin/system/health → DB connection state, storage usage and the
 * latest errors. Token-only auth (no DB lookup) so it works during outages;
 * the admin panel polls it to drive the warning banner.
 */
export async function getHealth(req, res) {
  const [storage, errors] = await Promise.all([getStorageUsage(), getRecentErrors({ limit: 100 })]);
  res.json({
    db: getDbState(),
    storage,
    errors,
    serverTime: new Date(),
  });
}

export default { getHealth };
