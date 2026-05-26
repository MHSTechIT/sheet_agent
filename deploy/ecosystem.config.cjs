// PM2 process manager config. Run with:
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 save
//   pm2 startup        ← print a sudo command, run it once
// This keeps the API running 24/7 and restarts it automatically on crash or
// machine reboot.

module.exports = {
  apps: [
    {
      name: 'sheet-agent-api',
      cwd: './backend',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '400M', // restart if the process exceeds 400MB
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      // PM2 writes logs to ~/.pm2/logs/ by default; tail with `pm2 logs`.
      out_file: '~/.pm2/logs/sheet-agent-out.log',
      error_file: '~/.pm2/logs/sheet-agent-err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
