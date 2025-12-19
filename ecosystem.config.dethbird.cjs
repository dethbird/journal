module.exports = {
  apps: [
    {
      name: 'evidence-journal',
      script: 'src/web/server.js',
      // Update cwd to the install path used on the server
      cwd: '/home/dethbird/journal.dethbird.com',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 5001,
      },
      error_file: '/home/dethbird/journal.dethbird.com/logs/pm2-error.log',
      out_file: '/home/dethbird/journal.dethbird.com/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm Z'
    }
  ]
};
