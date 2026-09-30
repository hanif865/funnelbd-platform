import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { config } from './config/index.js';
import { connectDB } from './config/db.js';
import { sessionMiddleware } from './middlewares/session.js';
import { notFound, errorHandler } from './middlewares/error.js';
import publicRoutes from './routes/public.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { startFollowUpSweep } from './services/followup.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export function createApp() {
  const app = express();

  app.set('trust proxy', true); // behind Cloudflare/Nginx
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.locals.baseUrl = config.baseUrl;

  // Security headers. CSP is left off in Phase 1 (landing uses some inline
  // styles); it will be tightened during Phase 4 hardening.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(compression()); // gzip responses (HTML/JS/CSS/JSON) for faster mobile loads
  app.use(morgan(config.isProd ? 'combined' : 'dev'));
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Uploaded images: filenames are unique and never overwritten → cache for a
  // year, so repeat visitors load them from browser/CDN cache instantly.
  app.use(
    '/public/uploads',
    express.static(path.join(ROOT, 'public', 'uploads'), { maxAge: config.isProd ? '365d' : 0, immutable: config.isProd })
  );
  // Static assets (landing css/js).
  app.use('/public',express.static(path.join(ROOT, 'public'), { maxAge: config.isProd ? '7d' : 0 }));

  // Health check.
  app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

  // Admin API.
  app.use('/api/admin', adminRoutes);

  // React admin panel (built). Served at /admin with SPA fallback.
  const adminDist = path.join(ROOT, 'admin-panel', 'dist');
  if (fs.existsSync(adminDist)) {
    app.use('/admin', express.static(adminDist));
    app.get(/^\/admin(\/.*)?$/, (req, res) => res.sendFile(path.join(adminDist, 'index.html')));
  } else {
    app.get(/^\/admin(\/.*)?$/, (req, res) =>
      res
        .status(200)
        .send(
          '<h2>Admin panel not built yet</h2><p>Run <code>npm run admin:install &amp;&amp; npm run admin:build</code>, then reload.</p>'
        )
    );
  }

  // Public site (session cookie applies to visitor-facing routes).
  app.use(sessionMiddleware, publicRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

async function start() {
  await connectDB();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`[web] FunnelBD running → ${config.baseUrl} (env: ${config.env})`);
  });
  // Periodic abandoned-checkout follow-up (no-op unless SMS + follow-up enabled).
  startFollowUpSweep();
}

// Only auto-start when run directly (not when imported by tests/worker).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start().catch((err) => {
    console.error('[web] failed to start:', err);
    process.exit(1);
  });
}

export default createApp;
