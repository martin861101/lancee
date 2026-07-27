module.exports = {
  apps: [
    {
      name: 'lancee',
      script: 'server/index.mjs',
      node_args: '--env-file=.env',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        APP_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '.runtime/pm2-error.log',
      out_file: '.runtime/pm2-out.log',
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 5000,
      min_uptime: 10000,
      listen_timeout: 8000,
      kill_timeout: 5000,
      shutdown_with_message: true,
    },
  ],
}
