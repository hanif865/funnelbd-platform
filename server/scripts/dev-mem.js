/**
 * Local dev bootstrap using an in-memory MongoDB — no Atlas required.
 * Starts an ephemeral MongoDB, seeds defaults, then boots the web server all
 * in one process. Handy for trying the funnel before wiring up a real cluster.
 *
 * Run with: npm run dev:mem
 *
 * NOTE: data is wiped when the process exits. For persistent data use a real
 * MONGODB_URI with `npm run dev`.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

// MongoDB 8.x binaries need a newer VC++ runtime that many Windows machines
// lack (crash 0xC0000135). 6.0.x runs everywhere. Override with MONGOMS_VERSION.
if (!process.env.MONGOMS_VERSION) process.env.MONGOMS_VERSION = '6.0.14';

const mongod = await MongoMemoryServer.create();
// Set the URI BEFORE importing config (dotenv won't override an existing env).
process.env.MONGODB_URI = mongod.getUri('funnelbd');
console.log('[dev:mem] in-memory MongoDB at', process.env.MONGODB_URI);

const { connectDB } = await import('../config/db.js');
const { seedDefaults } = await import('./seedData.js');
const { createApp } = await import('../app.js');
const { config } = await import('../config/index.js');

await connectDB();
const { adminEmail, adminPassword } = await seedDefaults();
console.log(`[dev:mem] seeded. admin login → ${adminEmail} / ${adminPassword}`);

const app = createApp();
app.listen(config.port, () => {
  console.log(`[dev:mem] FunnelBD running → ${config.baseUrl}`);
});

async function shutdown() {
  await mongod.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
