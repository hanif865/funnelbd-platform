// FunnelBD test runner — boots one in-memory MongoDB, then runs each test
// module (tests/*.test.mjs) against a fresh database. Exit code is non-zero if
// any assertion fails. Run with: npm test
import { MongoMemoryServer } from 'mongodb-memory-server';

if (!process.env.MONGOMS_VERSION) process.env.MONGOMS_VERSION = '6.0.14';
process.env.NODE_ENV = 'test';

const mongod = await MongoMemoryServer.create();
// Must be set BEFORE anything reads config / connects.
process.env.MONGODB_URI = mongod.getUri('funnelbd_test');

const { connectDB } = await import('../server/config/db.js');
const { seedDefaults } = await import('../server/scripts/seedData.js');
const mongoose = (await import('mongoose')).default;

await connectDB();

// Tests run in order; the index-migration one manipulates indexes, so last.
const modules = ['./funnels.test.mjs', './dashboard.test.mjs', './tracking-log.test.mjs', './saas-tenancy.test.mjs', './saas-isolation.test.mjs', './saas-order-isolation.test.mjs', './dailystat-index.test.mjs'];

const results = [];
for (const m of modules) {
  const test = (await import(m)).default;
  await mongoose.connection.dropDatabase();
  if (test.seed) await seedDefaults();
  try {
    results.push(await test.fn());
  } catch (err) {
    results.push({ label: test.name, pass: 0, fail: 1, fails: ['threw: ' + (err?.stack || err)] });
  }
  const last = results[results.length - 1];
  const icon = last.fail === 0 ? '✓' : '✗';
  console.log(`${icon} ${test.name} — ${last.pass} passed, ${last.fail} failed`);
  last.fails.forEach((f) => console.log('    ✗ ' + f));
}

const totPass = results.reduce((s, r) => s + r.pass, 0);
const totFail = results.reduce((s, r) => s + r.fail, 0);
console.log(`\n${totFail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${totPass} passed, ${totFail} failed across ${results.length} suites`);

await mongoose.disconnect();
await mongod.stop();
process.exit(totFail === 0 ? 0 : 1);
