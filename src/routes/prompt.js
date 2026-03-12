'use strict';

const express = require('express');
const router  = express.Router();
const { getPromptByName, updatePromptByName } = require('../promptManager');

router.get('/', (req, res) => {
  const name = req.query.name || 'default';
  res.json(getPromptByName(name) || null);
});

router.put('/', (req, res) => {
  const { content, name = 'default' } = req.body;
  if (!content || typeof content !== 'string')
    return res.status(400).json({ error: 'content required' });

  // Validate required placeholders based on prompt type
  if (name === 'default') {
    if (!content.includes('{user_preferences}') || !content.includes('{news_items}'))
      return res.status(400).json({ error: 'Prompt must contain {user_preferences} and {news_items}' });
  } else if (name === 'tts') {
    if (!content.includes('{news_digest}'))
      return res.status(400).json({ error: 'TTS prompt must contain {news_digest}' });
  }

  updatePromptByName(name, content.trim(), 'user');
  res.json({ ok: true });
});

module.exports = router;
