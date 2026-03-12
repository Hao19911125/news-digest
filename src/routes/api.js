'use strict';

const express = require('express');
const router  = express.Router();
const { getRecentDigests, getPreferences, addPreference, removePreference,
        getRecipients, addRecipient, updateRecipient, deleteRecipient,
        getFeeds, addFeed, deleteFeed } = require('../db');
const { getFeedList, testFeedUrl } = require('../fetcher');
const { runDigest, getStatus }     = require('../cron');

// ── Digest history ────────────────────────────────────────────────────────
router.get('/digests', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
  const rows = getRecentDigests(limit).map(d => ({
    ...d,
    news_data:   d.news_data   ? JSON.parse(d.news_data)   : null,
    token_usage: d.token_usage ? JSON.parse(d.token_usage) : null,
  }));
  res.json(rows);
});

router.get('/digests/latest', (req, res) => {
  const [d] = getRecentDigests(1);
  if (!d) return res.json(null);
  res.json({
    ...d,
    news_data:   d.news_data   ? JSON.parse(d.news_data)   : null,
    token_usage: d.token_usage ? JSON.parse(d.token_usage) : null,
  });
});

// ── Preferences ───────────────────────────────────────────────────────────
router.get('/preferences', (req, res) => res.json(getPreferences()));

router.post('/preferences', (req, res) => {
  const { type, topic, value } = req.body;
  if (!type || !topic) return res.status(400).json({ error: 'type and topic required' });
  if (!['boost','suppress','minimum'].includes(type))
    return res.status(400).json({ error: 'type must be boost|suppress|minimum' });
  addPreference(type, topic, value ?? 1);
  res.json({ ok: true });
});

router.delete('/preferences/:id', (req, res) => {
  removePreference(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

// ── Recipients ────────────────────────────────────────────────────────────
router.get('/recipients', (req, res) => res.json(getRecipients()));

router.post('/recipients', (req, res) => {
  const { label = '', email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  const result = addRecipient({ label, email });
  res.json({ ok: true, id: result.lastInsertRowid });
});

router.put('/recipients/:id', (req, res) => {
  const { label, email, enabled } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  updateRecipient(parseInt(req.params.id, 10), { label, email, enabled });
  res.json({ ok: true });
});

router.delete('/recipients/:id', (req, res) => {
  deleteRecipient(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

// ── Feeds ─────────────────────────────────────────────────────────────────
router.get('/feeds', (req, res) => res.json(getFeedList()));

router.post('/feeds', (req, res) => {
  const { label, url, country, lang } = req.body;
  if (!label || !url) return res.status(400).json({ error: 'label and url required' });
  try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
  const result = addFeed({ label, url, country: country || 'International', lang: lang || 'en' });
  res.json({ ok: true, id: result.lastInsertRowid });
});

router.delete('/feeds/:id', (req, res) => {
  deleteFeed(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

router.post('/feeds/test', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const result = await testFeedUrl(url);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ── Status + trigger ──────────────────────────────────────────────────────
router.get('/status', (req, res) => res.json(getStatus()));

router.post('/trigger', async (req, res) => {
  const period = req.body?.period === 'evening' ? 'evening' : 'morning';
  runDigest(period).catch(err => console.error('[trigger]', err.message));
  res.json({ ok: true, message: `Digest triggered: ${period}` });
});

module.exports = router;
