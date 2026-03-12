'use strict';

const express = require('express');
const router  = express.Router();
const { getAiConfig, upsertAiConfig, getTtsConfig, upsertTtsConfig } = require('../db');
const { chatCompletion }              = require('../aiProvider');

const maskKey = k => (k ? k.slice(0, 6) + '••••••' : null);

router.get('/ai', (req, res) => {
  const news = getAiConfig('news') || {};
  const chat = getAiConfig('chat') || {};
  const tts  = getAiConfig('tts')  || {};
  res.json({
    news: { ...news, api_key: maskKey(news.api_key) },
    chat: { ...chat, api_key: maskKey(chat.api_key) },
    tts:  { ...tts,  api_key: maskKey(tts.api_key)  },
  });
});

router.put('/ai/:purpose', (req, res) => {
  const { purpose } = req.params;
  if (!['news','chat','tts'].includes(purpose))
    return res.status(400).json({ error: 'purpose must be news, chat, or tts' });
  const { provider, model, api_key, base_url } = req.body;
  if (!provider || !model)
    return res.status(400).json({ error: 'provider and model required' });
  upsertAiConfig(purpose, { provider, model, api_key, base_url });
  res.json({ ok: true });
});

// Quick connectivity test
router.post('/ai/test', async (req, res) => {
  const { purpose = 'news', provider, model, api_key, base_url } = req.body;
  try {
    const r = await chatCompletion({
      messages: [{ role: 'user', content: 'Reply with only the word: OK' }],
      purpose, provider, model, apiKey: api_key, baseUrl: base_url,
    });
    res.json({ ok: true, response: r.content.slice(0, 80) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Fetch available models from the provider's API
router.post('/ai/models', async (req, res) => {
  const { purpose = 'news', provider, api_key, base_url } = req.body;
  const cfg = getAiConfig(purpose) || {};
  const p = provider || cfg.provider || 'anthropic';
  const k = (api_key && !api_key.includes('•')) ? api_key : (cfg.api_key || '');
  const u = base_url || cfg.base_url || '';

  try {
    let models = [];
    if (p === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
        headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01' },
      });
      if (!r.ok) throw new Error(`Anthropic API error ${r.status}`);
      const d = await r.json();
      models = (d.data || []).map(m => m.id).sort();

    } else if (p === 'openai') {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${k}` },
      });
      if (!r.ok) throw new Error(`OpenAI API error ${r.status}`);
      const d = await r.json();
      models = (d.data || [])
        .map(m => m.id)
        .filter(id => /gpt|o1|o3/.test(id))
        .sort();

    } else if (p === 'google') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${k}`);
      if (!r.ok) throw new Error(`Google API error ${r.status}`);
      const d = await r.json();
      models = (d.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name.replace('models/', ''))
        .sort();

    } else if (p === 'custom') {
      if (!u) throw new Error('Custom provider requires a Base URL');
      const r = await fetch(`${u.replace(/\/$/, '')}/models`, {
        headers: { 'Authorization': `Bearer ${k}` },
      });
      if (!r.ok) throw new Error(`Custom API error ${r.status}`);
      const d = await r.json();
      models = (d.data || d.models || []).map(m => m.id || m.name || m).sort();
    }

    res.json({ ok: true, models });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ── TTS config ─────────────────────────────────────────────────────────────
router.get('/tts', (req, res) => {
  const cfg = getTtsConfig();
  const data = cfg || { enabled: 0, voice: 'zh-CN-XiaoxiaoNeural', rate: '+0%', pitch: '+0Hz', audio_base_url: '' };
  data.enabled = !!data.enabled;  // SQLite 0/1 → boolean for checkbox v-model
  res.json(data);
});

router.put('/tts', (req, res) => {
  const { enabled, voice, rate, pitch, audio_base_url } = req.body;
  upsertTtsConfig({ enabled, voice, rate, pitch, audio_base_url });
  res.json({ ok: true });
});

router.get('/tts/voices', (req, res) => {
  const { getVoiceList } = require('../tts');
  res.json(getVoiceList());
});

// ── SMTP ───────────────────────────────────────────────────────────────────
router.get('/smtp', (req, res) => {
  res.json({
    host:    process.env.SMTP_HOST || '',
    port:    process.env.SMTP_PORT || '465',
    secure:  process.env.SMTP_SECURE !== 'false',
    user:    process.env.SMTP_USER  || '',
    pass:    process.env.SMTP_PASS  ? '••••••' : '',
    mail_to: process.env.MAIL_TO   || '',
  });
});

module.exports = router;
