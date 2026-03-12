'use strict';

const express = require('express');
const router  = express.Router();
const { processChat }               = require('../chat');
const { getChatHistory, clearChatHistory } = require('../db');

router.get('/history', (req, res) => res.json(getChatHistory(50)));

router.post('/', async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string')
    return res.status(400).json({ error: 'message is required' });
  try {
    res.json(await processChat(message.trim()));
  } catch (err) {
    console.error('[chat route]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/history', (req, res) => {
  clearChatHistory();
  res.json({ ok: true });
});

module.exports = router;
