// PM2 process definitions. Web and worker run as separate processes so the
// tracking queue is decoupled from request handling.
module.exports = {
  apps: [
    {
      name: 'funnelbd-web',
      script: 'server/web.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production', TZ: 'Asia/Dhaka' },
    },
    {
      name: 'funnelbd-worker',
      script: 'server/worker.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production', TZ: 'Asia/Dhaka' },
    },
  ],
};
