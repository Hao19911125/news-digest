'use strict';

const Parser = require('rss-parser');
const { getFeeds } = require('./db');

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'NewsDigest/1.0' },
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['media:group', 'mediaGroup'],
    ],
  },
});

/**
 * Best-effort image extraction from RSS item.
 * Tries: enclosure → media:content → media:thumbnail → media:group → <img> in content
 */
function extractImage(item) {
  // 1. enclosure (common in many feeds)
  if (item.enclosure && item.enclosure.url) return item.enclosure.url;

  // 2. media:content (single or array)
  const mc = item.mediaContent;
  if (mc) {
    const url = mc.$ && mc.$.url ? mc.$.url : (Array.isArray(mc) ? mc[0]?.$.url : null);
    if (url) return url;
  }

  // 3. media:thumbnail
  const mt = item.mediaThumbnail;
  if (mt) {
    const url = mt.$ && mt.$.url ? mt.$.url : (Array.isArray(mt) ? mt[0]?.$.url : null);
    if (url) return url;
  }

  // 4. media:group → first media:content inside
  const mg = item.mediaGroup;
  if (mg && mg['media:content']) {
    const inner = mg['media:content'];
    const url = Array.isArray(inner) ? inner[0]?.$.url : inner?.$.url;
    if (url) return url;
  }

  // 5. Fallback: first <img src="..."> in content HTML
  const html = item.content || item['content:encoded'] || '';
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/);
  if (imgMatch) return imgMatch[1];

  return null;
}

// Runtime fetch status per feed id
const feedStatus = {};

function getFeedList() {
  return getFeeds().map(f => ({ ...f, status: feedStatus[f.id] ?? null }));
}

async function fetchOneFeed(feed) {
  try {
    const result = await parser.parseURL(feed.url);
    const items = (result.items || []).map(item => ({
      title:       item.title || '',
      url:         item.link || item.guid || '',
      source:      feed.label,
      sourceId:    feed.id,
      country:     feed.country,
      lang:        feed.lang,
      pubDate:     item.pubDate ? new Date(item.pubDate) : new Date(),
      description: item.contentSnippet || item.content || item.summary || '',
      image:       extractImage(item),
    }));
    feedStatus[feed.id] = { ok: true, at: new Date().toISOString(), count: items.length };
    return items;
  } catch (err) {
    feedStatus[feed.id] = { ok: false, at: new Date().toISOString(), error: err.message };
    console.warn(`[fetcher] ${feed.label}: ${err.message}`);
    return [];
  }
}

/**
 * Fetch all enabled feeds and return articles published within the last N hours.
 */
async function fetchAllFeeds(hoursBack = 12) {
  const feeds = getFeeds(true); // enabled only
  console.log(`[fetcher] Fetching ${feeds.length} feeds...`);
  const results = await Promise.allSettled(feeds.map(f => fetchOneFeed(f)));
  const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

  const cutoff = new Date(Date.now() - hoursBack * 3600_000);
  const recent = all.filter(i => i.pubDate >= cutoff);

  console.log(`[fetcher] Total: ${all.length}, within ${hoursBack}h: ${recent.length}`);
  return recent;
}

/**
 * Test a single feed URL without persisting status.
 */
async function testFeedUrl(url) {
  const result = await parser.parseURL(url);
  return { count: result.items.length, title: result.title || '' };
}

module.exports = { fetchAllFeeds, getFeedList, testFeedUrl };
