module.exports = {
  apps: [{
    name:        'news-digest',
    script:      'src/index.js',
    instances:   1,
    autorestart: true,
    watch:       false,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
      TZ:       'Asia/Hong_Kong',
    },
    error_file:      'logs/error.log',
    out_file:        'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
