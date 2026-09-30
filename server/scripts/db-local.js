/**
 * Starts the project-local (portable) MongoDB server with a persistent data
 * directory. No admin rights, no Windows service — data lives in .mongo-data/
 * and survives restarts.
 *
 * Binaries live in .local-mongo/bin (extracted from the official MongoDB zip).
 * Run with: npm run db:start   (keep this running in its own terminal)
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const isWin = process.platform === 'win32';
const mongodPath = path.join(ROOT, '.local-mongo', 'bin', isWin ? 'mongod.exe' : 'mongod');
const dataDir = path.join(ROOT, '.mongo-data');
const port = process.env.MONGO_PORT || '27017';

if (!fs.existsSync(mongodPath)) {
  console.error('[db:local] mongod not found at', mongodPath);
  console.error('  → পোর্টেবল MongoDB এখনো এক্সট্র্যাক্ট হয়নি। README দেখো।');
  process.exit(1);
}
fs.mkdirSync(dataDir, { recursive: true });

console.log('[db:local] starting MongoDB 6.0 →', `mongodb://127.0.0.1:${port}`);
console.log('[db:local] data dir:', dataDir);

const child = spawn(mongodPath, ['--dbpath', dataDir, '--port', port], { stdio: 'inherit' });

child.on('exit', (code) => {
  console.log('[db:local] mongod exited with code', code);
  process.exit(code || 0);
});

function shutdown() {
  child.kill();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
