/**
 * PM2 Configuration File
 * 用于生产环境部署
 */

module.exports = {
  apps: [
    {
      name: 'inksoul-server',
      script: './server/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'warn',
        LOG_RETENTION_DAYS: '7',
        ENABLE_CONSOLE: 'false',
        ENABLE_FILE: 'true',
        PORT: 3001
      },
      env_development: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug',
        LOG_RETENTION_DAYS: '30',
        ENABLE_CONSOLE: 'true',
        ENABLE_FILE: 'true',
        PORT: 3001
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true
    }
  ]
};
