'use strict';

require('dotenv').config();

const express = require('express');
const path    = require('path');
const { initDb }      = require('./db');
const { startCron }   = require('./cron');

const PORT = process.env.PORT || 3100;

initDb();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api',          require('./routes/api'));
app.use('/api/chat',     require('./routes/chat'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/prompt',   require('./routes/prompt'));

// Serve generated audio files
app.use('/audio', express.static(path.join(__dirname, '..', 'data', 'audio')));

// SPA fallback
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
);

app.listen(PORT, () => {
  console.log(`[server] NewsDigest listening on http://localhost:${PORT}`);
  startCron();
});
