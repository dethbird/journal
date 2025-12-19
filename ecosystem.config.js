module.exports = {
  apps: [
    {
      name: 'evidence-journal',
      script: 'src/web/server.js',
      // Update cwd to your installation path, or run pm2 from the project root
      // e.g. cwd: '/home/youruser/journal'
      cwd: '/home/code/journal',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm Z'
    }
  ]
};
