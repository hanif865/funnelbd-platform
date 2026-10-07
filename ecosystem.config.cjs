// PM2 process definitions. Web and worker run as separate processes so the
// tracking queue is decoupled from request handling.
//
// Process names come from APP_NAME in this folder's .env (default "funnelbd"),
// so several funnels can run side by side on one server from separate clones
// (e.g. /var/www/funnelbd and /var/www/shop2) without PM2 name clashes.
const fs = require('fs');
const path = require('path');

function envValue(key) {
  try {
    const text = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const m = text.match(new RegExp('^' + key + '=(.*)$', 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}

const name = envValue('APP_NAME') || 'funnelbd';
const env = { NODE_ENV: 'production', TZ: 'Asia/Dhaka' };

module.exports = {
  apps: [
    { name: `${name}-web`, script: 'server/web.js', cwd: __dirname, instances: 1, exec_mode: 'fork', env },
    { name: `${name}-worker`, script: 'server/worker.js', cwd: __dirname, instances: 1, exec_mode: 'fork', env },
  ],
};
