const standbyEnv = {
  NODE_ENV: 'production',
  FETCH_SCHEDULER_ENABLED: 'false',
  WA_OUTBOX_ENABLED: 'false',
  WA_LOG_CLIENT_ENABLED: 'false',
  CRON_STATUS_LOOKUP_STRATEGY: 'fail_closed'
};

module.exports = {
  apps: [
    {
      name: 'cicero_v2',
      cwd: __dirname,
      script: './app.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      min_uptime: '30s',
      max_restarts: 10,
      exp_backoff_restart_delay: 3000,
      max_memory_restart: '512M',
      kill_timeout: 15000,
      merge_logs: true,
      time: true,
      env: standbyEnv,
      env_production: standbyEnv
    }
  ]
};
