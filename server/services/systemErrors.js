import mongoose from 'mongoose';
import { SystemError } from '../models/index.js';

/**
 * Collects server/database errors so admins can see them in the panel
 * (System Status page + banner) instead of only in server logs.
 *
 *  - classify(): turns raw Mongo/Node errors into an English title + what-to-do
 *    hint + severity (e.g. storage quota full → critical).
 *  - reportError(): keeps a de-duplicated ring buffer in memory (works even
 *    while the DB is down) and persists to `system_errors` best-effort.
 *  - DB connection state is tracked from mongoose events.
 */
const MAX_MEMORY = 200;
const DEDUPE_WINDOW_MS = 10 * 60 * 1000; // same error within 10 min → count++
const PROCESS = process.argv[1]?.includes('worker') ? 'worker' : 'web';

const memory = []; // newest first
const dbState = { state: 'connecting', since: new Date(), lastError: null };

// ─── Classification ─────────────────────────────────────────
export function classify(err) {
  const msg = String(err?.message || err || '');
  const name = err?.name || '';
  const code = err?.code ?? err?.errorResponse?.code ?? null;

  if (name === 'StorageWarning') {
    return {
      kind: 'storage_high',
      severity: 'warning',
      title: 'Database storage is almost full (90%+)',
      hint: 'Once it fills up, new orders will not be saved. Upgrade the Atlas plan now or delete old data.',
    };
  }
  if (code === 18 || /authentication failed|bad auth/i.test(msg)) {
    return {
      kind: 'auth_failed',
      severity: 'critical',
      title: 'Database login failed (wrong username/password)',
      hint: 'Check that the username and password in MONGODB_URI in the server .env file match Atlas, then restart the app.',
    };
  }
  // Atlas uses code 8000 (AtlasError) for several failures (auth too), so
  // match the quota text rather than the code.
  if (/space quota|over your .*quota|quota exceeded/i.test(msg)) {
    return {
      kind: 'storage_full',
      severity: 'critical',
      title: 'Database storage is full — new orders are not being saved!',
      hint: 'Upgrade the plan on MongoDB Atlas or delete unnecessary old data. Pause your ads until this is fixed.',
    };
  }
  if (
    /MongoServerSelectionError|MongoNetworkError|MongoTopologyClosedError|MongoNotConnectedError/.test(name) ||
    /ECONNREFUSED|ENOTFOUND|getaddrinfo|connection .*closed|not connected|Server selection timed out|IP.*(whitelist|access list)/i.test(msg)
  ) {
    return {
      kind: 'db_unreachable',
      severity: 'critical',
      title: 'No connection to the database',
      hint: 'Check that the cluster is running on Atlas and that the server IP is allowed under Network Access. The app will reconnect on its own once the connection is back.',
    };
  }
  if (/MongoNetworkTimeoutError|MongoOperationTimeoutError/.test(name) || /buffering timed out|timed out|ETIMEDOUT/i.test(msg)) {
    return {
      kind: 'db_timeout',
      severity: 'error',
      title: 'The database is not responding in time',
      hint: 'Under heavy traffic you may hit the free-plan limit (100 operations per second). If it keeps happening, consider upgrading the Atlas plan.',
    };
  }
  if (code === 11000) {
    return {
      kind: 'duplicate_key',
      severity: 'warning',
      title: 'Tried to save the same data twice (duplicate)',
      hint: 'This usually happens when the same request arrives twice. If it keeps happening, tell the developer.',
    };
  }
  if (name === 'ValidationError' || name === 'CastError') {
    return {
      kind: 'invalid_data',
      severity: 'warning',
      title: 'The database rejected invalid data',
      hint: 'There may be a wrong value in a form or setting. If it keeps happening, tell the developer.',
    };
  }
  if (/Mongo/.test(name)) {
    return {
      kind: 'db_error',
      severity: 'error',
      title: 'Database error',
      hint: 'Send the technical message below to the developer.',
    };
  }
  return {
    kind: 'server_error',
    severity: 'error',
    title: 'Unexpected server error',
    hint: 'Send the technical message below to the developer.',
  };
}

/** Short English message safe to show to API clients (admin panel/login). */
export function publicMessageFor(err) {
  const c = classify(err);
  return ['storage_full', 'auth_failed', 'db_unreachable', 'db_timeout'].includes(c.kind) ? c.title : null;
}

// ─── Reporting ──────────────────────────────────────────────
function isDbUp() {
  return mongoose.connection.readyState === 1;
}

/**
 * Record an error for admins. Never throws. `source` names where it happened
 * (e.g. 'checkout', 'draft', 'followup'); `path` is the request path if any.
 */
export function reportError(source, err, { path = '' } = {}) {
  try {
    const c = classify(err);
    const message = String(err?.message || err || '').slice(0, 1000);
    const code = err?.code ?? null;
    const key = `${source}|${c.kind}|${message.slice(0, 200)}`;
    const now = new Date();

    console.error(`[error:${source}]`, err?.stack || message);

    const existing = memory.find((e) => e.key === key && now - e.lastAt < DEDUPE_WINDOW_MS);
    if (existing) {
      existing.count++;
      existing.lastAt = now;
      if (isDbUp()) {
        SystemError.updateOne({ _id: existing._id }, { $inc: { count: 1 }, $set: { lastAt: now } }, { upsert: false }).catch(() => {});
      }
      return existing;
    }

    const entry = {
      _id: new mongoose.Types.ObjectId(),
      key,
      source,
      ...c,
      message,
      code: typeof code === 'number' || typeof code === 'string' ? code : null,
      path,
      process: PROCESS,
      count: 1,
      createdAt: now,
      lastAt: now,
    };
    memory.unshift(entry);
    if (memory.length > MAX_MEMORY) memory.length = MAX_MEMORY;

    // Persist only when the DB is up — otherwise the write would itself hang
    // in mongoose's buffer and fail. (Storage-full can't be written either.)
    if (isDbUp() && c.kind !== 'storage_full') {
      SystemError.create(entry).catch(() => {});
    }
    return entry;
  } catch {
    return null;
  }
}

/**
 * Recent errors: memory (this process, includes anything that happened while
 * the DB was down) merged with the DB (both processes, survives restarts).
 */
export async function getRecentErrors({ limit = 100 } = {}) {
  const byId = new Map();
  if (isDbUp()) {
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const rows = await SystemError.find({ lastAt: { $gte: since } }).sort({ lastAt: -1 }).limit(limit).lean().maxTimeMS(3000);
      for (const r of rows) byId.set(String(r._id), r);
    } catch {
      /* DB trouble — memory still has it */
    }
  }
  for (const e of memory) {
    const id = String(e._id);
    const prev = byId.get(id);
    // Memory is authoritative for counts/lastAt in this process.
    byId.set(id, prev ? { ...prev, count: Math.max(prev.count, e.count), lastAt: e.lastAt > prev.lastAt ? e.lastAt : prev.lastAt } : e);
  }
  return [...byId.values()]
    .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt))
    .slice(0, limit)
    .map(({ key, __v, ...rest }) => rest);
}

// ─── DB connection state ────────────────────────────────────
function setState(state, error = null) {
  if (dbState.state !== state) {
    dbState.state = state;
    dbState.since = new Date();
  }
  if (error) dbState.lastError = { message: String(error.message || error), at: new Date() };
}

export function getDbState() {
  return { ...dbState, readyState: mongoose.connection.readyState };
}

/** Attach mongoose connection listeners once at boot. */
export function watchDbConnection() {
  const conn = mongoose.connection;
  if (conn.readyState === 1) setState('connected');
  conn.on('connected', () => setState('connected'));
  conn.on('reconnected', () => {
    setState('connected');
    console.log('[db] reconnected');
  });
  conn.on('disconnected', () => {
    setState('disconnected');
    reportError('db', Object.assign(new Error('MongoDB connection lost (disconnected)'), { name: 'MongoNetworkError' }));
  });
  conn.on('error', (err) => {
    setState(conn.readyState === 1 ? 'connected' : 'disconnected', err);
    reportError('db', err);
  });
}

// ─── Storage usage (approximate, vs. plan quota) ────────────
const STORAGE_LIMIT_MB = parseInt(process.env.DB_STORAGE_LIMIT_MB || '512', 10);
let storageCache = null; // { at, value }

/**
 * Approximate DB size vs. the plan quota (Atlas free = 512MB). Cached 10 min.
 * Uses storage + index size, which is conservative (warns a bit early).
 */
export async function getStorageUsage() {
  if (!isDbUp()) return storageCache?.value || null;
  if (storageCache && Date.now() - storageCache.at < 10 * 60 * 1000) return storageCache.value;
  try {
    const s = await mongoose.connection.db.stats();
    const usedMb = ((s.storageSize || 0) + (s.indexSize || 0)) / (1024 * 1024);
    const value = {
      usedMb: Math.round(usedMb * 10) / 10,
      limitMb: STORAGE_LIMIT_MB,
      percent: Math.round((usedMb / STORAGE_LIMIT_MB) * 1000) / 10,
    };
    storageCache = { at: Date.now(), value };
    if (value.percent >= 90) {
      reportError('storage', Object.assign(new Error(`Database storage at ${value.percent}% (${value.usedMb}MB of ${STORAGE_LIMIT_MB}MB)`), { name: 'StorageWarning' }));
    }
    return value;
  } catch {
    return storageCache?.value || null;
  }
}

export default { classify, publicMessageFor, reportError, getRecentErrors, getDbState, watchDbConnection, getStorageUsage };
