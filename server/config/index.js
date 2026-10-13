import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Load .env from project root (one level up from server/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Central config. Validates required env at boot so the app fails fast
 * with a clear message instead of a cryptic runtime error later.
 */
function required(name) {
  const val = process.env[name];
  if (!val || val.trim() === '') {
    console.error(`\n[config] Missing required env var: ${name}`);
    console.error('  → .env ফাইলে এটা বসাও (দেখো .env.example)।\n');
    process.exit(1);
  }
  return val.trim();
}

const NODE_ENV = process.env.NODE_ENV || 'development';

function appName() {
  const name = (process.env.APP_NAME || 'funnelbd').trim();
  if (!/^[a-z0-9-]+$/.test(name)) {
    console.error(`\n[config] APP_NAME "${name}" is invalid — use lowercase letters, digits and dashes.\n`);
    process.exit(1);
  }
  return name;
}

export const config = {
  env: NODE_ENV,
  isProd: NODE_ENV === 'production',
  // Instance name — keeps several funnels on one server apart (PM2 process
  // names, Redis queue). Lowercase letters, digits and dashes.
  appName: appName(),
  port: parseInt(process.env.PORT || '3000', 10),
  // Loopback by default: only nginx (same machine) can reach the app, so it
  // can't be hit directly from the internet bypassing Cloudflare/nginx.
  host: (process.env.HOST || '127.0.0.1').trim(),
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  // Root domain for free tenant subdomains (<account-slug>.<appDomain>).
  appDomain: (process.env.APP_DOMAIN || 'funnelbd.com').replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase().trim(),
  // Cloudflare for SaaS (optional) — provisions TLS for tenant custom domains.
  // When unset, custom domains still work at DNS level; TLS is handled elsewhere.
  cloudflare: {
    apiToken: (process.env.CF_API_TOKEN || '').trim(),
    zoneId: (process.env.CF_ZONE_ID || '').trim(),
  },

  mongoUri: required('MONGODB_URI'),

  // Redis is optional in Phase 1 (queue not wired yet). Empty string => disabled.
  redisUrl: (process.env.REDIS_URL || '').trim(),

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  sessionCookieDays: parseInt(process.env.SESSION_COOKIE_DAYS || '30', 10),

  seedAdmin: {
    name: process.env.SEED_ADMIN_NAME || 'Admin',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@funnelbd.local',
    password: process.env.SEED_ADMIN_PASSWORD || 'admin1234',
  },

  // Instant order push via Telegram (free). Leave both empty to disable.
  telegram: {
    botToken: (process.env.TELEGRAM_BOT_TOKEN || '').trim(),
    chatId: (process.env.TELEGRAM_CHAT_ID || '').trim(),
  },

  // CRM ingest feed (SafeCommerce). The CRM polls /api/dizara/v1/* with this
  // shared secret. Empty => the feed is disabled (returns 401).
  crm: {
    secret: (process.env.CRM_INGEST_SECRET || '').trim(),
  },
};

export default config;
