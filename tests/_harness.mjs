// Tiny zero-dependency test harness for FunnelBD.
// Boots ONE in-memory MongoDB, then runs each test module against a fresh DB.
// No framework — just Node + mongodb-memory-server (already a dependency).
import mongoose from 'mongoose';

// MongoDB 8.x binaries need a newer VC++ runtime many Windows boxes lack; 6.0.x
// runs everywhere. Matches server/scripts/dev-mem.js.
if (!process.env.MONGOMS_VERSION) process.env.MONGOMS_VERSION = '6.0.14';
process.env.NODE_ENV = 'test';

/** A fake Express req/res so controllers can be called directly in-process.
 *  `accountId`/`admin`/`isSuperadmin` mimic what the auth middleware sets. */
export function callController(fn, { query = {}, body = {}, params = {}, accountId, admin, isSuperadmin, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = { query, body, params, headers };
    if (accountId !== undefined) req.accountId = accountId ? String(accountId) : null;
    if (admin !== undefined) req.admin = admin;
    if (isSuperadmin !== undefined) req.isSuperadmin = isSuperadmin;
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); return this; },
      send(payload) { resolve({ status: this.statusCode, body: payload }); return this; },
      cookie() { return this; },       // express res.cookie (no-op in tests)
      clearCookie() { return this; },
      setHeader() { return this; },
    };
    Promise.resolve(fn(req, res, (err) => reject(err || new Error('next() called')))).catch(reject);
  });
}

/** Per-test assertion collector. */
export function makeT(label) {
  let pass = 0, fail = 0;
  const fails = [];
  return {
    ok(cond, msg) {
      if (cond) { pass++; } else { fail++; fails.push(msg); }
    },
    section(name) { this._section = name; },
    result() { return { label, pass, fail, fails }; },
  };
}

export { mongoose };
