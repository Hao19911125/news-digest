'use strict';

const cron = require('node-cron');
const { fetchAllFeeds } = require('./fetcher');
const { analyzeNews }   = require('./analyzer');
const { getBibleVerse } = require('./bibleVerse');
const { sendDigest }    = require('./mailer');
const { saveDigest, cleanupOldDigests, getRecentDigests } = require('./db');

// ── Deduplication helpers ────────────────────────────────────────────────────

/**
 * Jaccard similarity on word tokens (case-insensitive).
 */
function textSimilarity(a, b) {
  const tokenize = str => new Set((str.toLowerCase().match(/\p{L}+/gu) || []));
  const setA = tokenize(a);
  const setB = tokenize(b);
  let intersection = 0;
  for (const t of setA) { if (setB.has(t)) intersection++; }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Remove items whose title+summary overlaps >threshold with any item
 * from the previous digest. Re-ranks the survivors from 1.
 */
function deduplicateItems(newItems, previousItems, threshold = 0.7) {
  if (!previousItems || !previousItems.length) return newItems;

  const kept = [];
  const skipped = [];

  for (const item of newItems) {
    const text = `${item.title} ${item.summary}`;
    const isDup = previousItems.some(prev => {
      const prevText = `${prev.title} ${prev.summary}`;
      return textSimilarity(text, prevText) > threshold;
    });

    if (isDup) {
      skipped.push(item.title);
    } else {
      kept.push(item);
    }
  }

  if (skipped.length) {
    console.log(`[cron] Deduplicated ${skipped.length} item(s) with >${threshold * 100}% overlap with previous digest:`);
    skipped.forEach(t => console.log(`  - ${t}`));
  }

  // Re-rank survivors
  return kept.map((item, i) => ({ ...item, rank: i + 1 }));
}

// ── Run status (in-memory, exposed via /api/status) ─────────────────────────
const status = {
  running:   false,
  step:      null,   // 'fetching' | 'analyzing' | 'sending' | null
  period:    null,
  startedAt: null,
  lastRun: {
    at:      null,
    period:  null,
    ok:      null,   // true | false
    error:   null,
    tokens:  null,
    provider: null,
    model:   null,
  },
};

function getStatus() { return { ...status, lastRun: { ...status.lastRun } }; }

async function runDigest(period) {
  if (status.running) {
    console.warn('[cron] Already running, skipping trigger.');
    return;
  }

  status.running   = true;
  status.period    = period;
  status.startedAt = new Date().toISOString();
  status.step      = 'fetching';
  console.log(`\n[cron] ===== ${period} digest started =====`);

  try {
    const news = await fetchAllFeeds(12);
    if (!news.length) {
      console.warn('[cron] No news fetched — skipping.');
      status.lastRun = { at: new Date().toISOString(), period, ok: false, error: 'No news fetched', tokens: null, provider: null, model: null };
      return;
    }

    status.step = 'analyzing';
    const { items, token_usage, provider, model } = await analyzeNews(news);

    // Match images back from original RSS items by URL
    const imageMap = new Map();
    for (const n of news) {
      if (n.image && n.url) imageMap.set(n.url, n.image);
    }
    for (const item of items) {
      if (!item.image && item.url) {
        item.image = imageMap.get(item.url) || null;
      }
    }

    // Deduplicate against the previous digest
    const recentDigests = getRecentDigests(1);
    const prevItems = recentDigests.length
      ? (() => { try { return JSON.parse(recentDigests[0].news_data); } catch { return []; } })()
      : [];
    const dedupedItems = deduplicateItems(items, prevItems);
    console.log(`[cron] After dedup: ${dedupedItems.length}/${items.length} items kept.`);

    await saveDigest({ period, news_data: dedupedItems, token_usage, provider, model });
    cleanupOldDigests(2); // keep only last 2 days

    // TTS generation (non-fatal: email still sends if TTS fails)
    let audioUrl = null;
    try {
      status.step = 'tts';
      const { generateTtsAudio, getAudioUrl, cleanupOldAudio } = require('./tts');
      const audioFile = await generateTtsAudio(dedupedItems, period);
      if (audioFile) audioUrl = getAudioUrl(audioFile);
      cleanupOldAudio(3);
    } catch (err) {
      console.warn('[cron] TTS generation failed (non-fatal):', err.message);
    }

    status.step = 'sending';
    // Brief pause between TTS AI call and Bible verse AI call to avoid rate limits
    await new Promise(r => setTimeout(r, 5000));
    const verse = await getBibleVerse(dedupedItems);
    await sendDigest(dedupedItems, period, verse, audioUrl);

    status.lastRun = { at: new Date().toISOString(), period, ok: true, error: null, tokens: token_usage, provider, model };
    console.log(`[cron] ===== ${period} digest done =====\n`);
  } catch (err) {
    status.lastRun = { at: new Date().toISOString(), period, ok: false, error: err.message, tokens: null, provider: null, model: null };
    console.error(`[cron] ${period} digest failed:`, err.message);
  } finally {
    status.running = false;
    status.step    = null;
  }
}

function startCron() {
  // HKT 07:00 daily
  cron.schedule('0 7 * * *', () => runDigest('morning'), { timezone: 'Asia/Hong_Kong' });
  console.log('[cron] Scheduled at 07:00 HKT');
}

module.exports = { startCron, runDigest, getStatus };
