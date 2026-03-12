'use strict';

const path = require('path');
const fs   = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'newsdigest.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const Database = require('better-sqlite3');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const DEFAULT_TTS_PROMPT = `你是一位风格轻松自然的新闻播报员「小新」，正在为听众录制每日新闻语音简报。

请将以下新闻摘要改写为一段适合语音播报的口语化稿件。

## 风格要求
- 像在跟朋友聊天一样分享今天的新闻，不要播音腔
- 语气温和但不失专业，偶尔可以加一点轻松的点评
- 避免使用书面化的连接词（如「此外」「与此同时」），用口语替代（如「然后呢」「说到这个」「对了」）

## 结构要求
1. 开场：简短的问候加上今天日期，再用一句话总结今天新闻的调性（如「今天国际局势有点紧张」或「今天科技圈挺热闹的」）
2. 逐条播报：用自然的过渡语串连每条新闻，每条用两到四句话讲清楚
3. 收尾：一两句自然的结束语

## 注意事项
- 直接输出纯文本播报稿，不加任何格式标记或符号
- 不要用括号、星号、井号等标记符号
- 阿拉伯数字写成中文（如「6人」写成「六个人」）
- 总字数控制在 800 到 1200 字

今日新闻摘要：
{news_digest}`;

const DEFAULT_PROMPT = `你是一位资深国际新闻编辑。以下是来自全球多个国家媒体的最新新闻。

请执行以下任务：
1. 交叉比对：如果同一事件被多国/多家媒体报道，权重更高
2. 结合用户偏好（如有），适当调整排序
3. 选出最重要的 10 条新闻
4. 为每条新闻撰写：
   - 一个简洁有力的中文标题
   - 100字以内的中文摘要，说明事件核心内容
5. 以 JSON 格式输出，结构如下（只输出 JSON，不加任何说明）：
   {"items":[{"rank":1,"title":"...","summary":"...","source":"...","url":"..."},...]}

用户偏好：
{user_preferences}

新闻列表：
{news_items}`;

const DEFAULT_FEEDS = [
  { label: 'DW World',           url: 'https://rss.dw.com/xml/rss-en-world',                               country: 'International', lang: 'en' },
  { label: 'NPR World News',     url: 'https://feeds.npr.org/1004/rss.xml',                                country: 'International', lang: 'en' },
  { label: 'CNN Top Stories',    url: 'http://rss.cnn.com/rss/edition.rss',                                country: 'USA',           lang: 'en' },
  { label: 'BBC World',          url: 'http://feeds.bbci.co.uk/news/world/rss.xml',                        country: 'UK',            lang: 'en' },
  { label: 'The Guardian World', url: 'https://www.theguardian.com/world/rss',                             country: 'UK',            lang: 'en' },
  { label: 'Japan Times',        url: 'https://www.japantimes.co.jp/feed/topstories/',                     country: 'Japan',         lang: 'en' },
  { label: 'Al Jazeera',         url: 'https://www.aljazeera.com/xml/rss/all.xml',                         country: 'Middle East',   lang: 'en' },
  { label: 'France24',           url: 'https://www.france24.com/en/rss',                                   country: 'France',        lang: 'en' },
  { label: 'TechCrunch AI',      url: 'https://techcrunch.com/category/artificial-intelligence/feed/',     country: 'Tech',          lang: 'en' },
  { label: 'The Verge AI',       url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', country: 'Tech',          lang: 'en' },
  { label: 'VentureBeat AI',     url: 'https://venturebeat.com/category/ai/feed/',                         country: 'Tech',          lang: 'en' },
  { label: 'MIT Tech Review',    url: 'https://www.technologyreview.com/feed/',                             country: 'Tech',          lang: 'en' },
  { label: 'Ars Technica',       url: 'https://feeds.arstechnica.com/arstechnica/technology-lab',           country: 'Tech',          lang: 'en' },
  { label: '爱范儿',               url: 'https://www.ifanr.com/feed',                                       country: 'China',         lang: 'zh' },
  { label: 'SCMP 南华早报',        url: 'https://www.scmp.com/rss/91/feed',                                  country: 'HK',            lang: 'zh' },
  { label: 'RFA 自由亚洲',         url: 'https://www.rfa.org/mandarin/RSS',                                  country: 'International', lang: 'zh' },
  { label: 'BBC 中文',             url: 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml',                   country: 'International', lang: 'zh' },
];

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_config (
      id         INTEGER PRIMARY KEY,
      purpose    TEXT NOT NULL UNIQUE,
      provider   TEXT NOT NULL DEFAULT 'anthropic',
      model      TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
      api_key    TEXT,
      base_url   TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS prompt_template (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE DEFAULT 'default',
      content    TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS preferences (
      id         INTEGER PRIMARY KEY,
      type       TEXT NOT NULL,
      topic      TEXT NOT NULL,
      value      INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      active     BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS digest_history (
      id          INTEGER PRIMARY KEY,
      sent_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      period      TEXT,
      news_data   JSON,
      token_usage JSON,
      provider    TEXT,
      model       TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      id         INTEGER PRIMARY KEY,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      actions    JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tts_config (
      id             INTEGER PRIMARY KEY,
      enabled        BOOLEAN DEFAULT 0,
      voice          TEXT NOT NULL DEFAULT 'zh-CN-XiaoxiaoNeural',
      rate           TEXT NOT NULL DEFAULT '+0%',
      pitch          TEXT NOT NULL DEFAULT '+0Hz',
      audio_base_url TEXT DEFAULT '',
      updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS feeds (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      label      TEXT NOT NULL,
      url        TEXT NOT NULL,
      country    TEXT NOT NULL DEFAULT 'International',
      lang       TEXT NOT NULL DEFAULT 'en',
      enabled    BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recipients (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      label      TEXT NOT NULL DEFAULT '',
      email      TEXT NOT NULL,
      enabled    BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed ai_config
  const cfgCount = db.prepare('SELECT COUNT(*) AS c FROM ai_config').get().c;
  if (cfgCount === 0) {
    const ins = db.prepare('INSERT INTO ai_config (purpose, provider, model) VALUES (?, ?, ?)');
    ins.run('news', 'anthropic', 'claude-sonnet-4-6');
    ins.run('chat', 'anthropic', 'claude-sonnet-4-6');
  }

  // Seed prompt_template
  const ptCount = db.prepare('SELECT COUNT(*) AS c FROM prompt_template').get().c;
  if (ptCount === 0) {
    db.prepare('INSERT INTO prompt_template (name, content, updated_by) VALUES (?, ?, ?)')
      .run('default', DEFAULT_PROMPT, 'system');
  }

  // Ensure 'tts' purpose exists in ai_config (migration-safe)
  const ttsAiExists = db.prepare("SELECT COUNT(*) AS c FROM ai_config WHERE purpose='tts'").get().c;
  if (ttsAiExists === 0) {
    db.prepare('INSERT INTO ai_config (purpose, provider, model) VALUES (?, ?, ?)')
      .run('tts', 'anthropic', 'claude-sonnet-4-6');
  }

  // Ensure 'tts' prompt exists (migration-safe)
  const ttsPtExists = db.prepare("SELECT COUNT(*) AS c FROM prompt_template WHERE name='tts'").get().c;
  if (ttsPtExists === 0) {
    db.prepare('INSERT INTO prompt_template (name, content, updated_by) VALUES (?, ?, ?)')
      .run('tts', DEFAULT_TTS_PROMPT, 'system');
  }

  // Seed tts_config
  const ttsCfgCount = db.prepare('SELECT COUNT(*) AS c FROM tts_config').get().c;
  if (ttsCfgCount === 0) {
    db.prepare('INSERT INTO tts_config (enabled, voice) VALUES (?, ?)').run(0, 'zh-CN-XiaoxiaoNeural');
  }

  // Seed feeds
  const feedCount = db.prepare('SELECT COUNT(*) AS c FROM feeds').get().c;
  if (feedCount === 0) {
    const insFeed = db.prepare('INSERT INTO feeds (label, url, country, lang) VALUES (?, ?, ?, ?)');
    DEFAULT_FEEDS.forEach(f => insFeed.run(f.label, f.url, f.country, f.lang));
  }

  console.log(`[db] Ready: ${DB_PATH}`);
}

// ---------------------------------------------------------------------------
// AI Config
// ---------------------------------------------------------------------------
function getAiConfig(purpose) {
  return db.prepare('SELECT * FROM ai_config WHERE purpose = ?').get(purpose);
}

function upsertAiConfig(purpose, { provider, model, api_key, base_url }) {
  db.prepare(`
    UPDATE ai_config
    SET provider=?, model=?, api_key=?, base_url=?, updated_at=CURRENT_TIMESTAMP
    WHERE purpose=?
  `).run(provider, model, api_key ?? null, base_url ?? null, purpose);
}

// ---------------------------------------------------------------------------
// Prompt Template
// ---------------------------------------------------------------------------
function getPrompt() {
  return db.prepare("SELECT * FROM prompt_template WHERE name='default'").get();
}

function updatePrompt(content, updatedBy = 'user') {
  db.prepare(`
    UPDATE prompt_template SET content=?, updated_at=CURRENT_TIMESTAMP, updated_by=?
    WHERE name='default'
  `).run(content, updatedBy);
}

function getPromptByName(name) {
  return db.prepare('SELECT * FROM prompt_template WHERE name=?').get(name);
}

function updatePromptByName(name, content, updatedBy = 'user') {
  db.prepare(`
    UPDATE prompt_template SET content=?, updated_at=CURRENT_TIMESTAMP, updated_by=?
    WHERE name=?
  `).run(content, updatedBy, name);
}

// ---------------------------------------------------------------------------
// TTS Config
// ---------------------------------------------------------------------------
function getTtsConfig() {
  return db.prepare('SELECT * FROM tts_config LIMIT 1').get();
}

function upsertTtsConfig({ enabled, voice, rate, pitch, audio_base_url }) {
  db.prepare(`
    UPDATE tts_config
    SET enabled=?, voice=?, rate=?, pitch=?, audio_base_url=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=1
  `).run(
    enabled ? 1 : 0,
    voice  || 'zh-CN-XiaoxiaoNeural',
    rate   || '+0%',
    pitch  || '+0Hz',
    audio_base_url ?? '',
  );
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------
function getPreferences() {
  return db.prepare('SELECT * FROM preferences WHERE active=1 ORDER BY id').all();
}

function addPreference(type, topic, value = 1) {
  db.prepare('INSERT INTO preferences (type, topic, value) VALUES (?, ?, ?)').run(type, topic, value);
}

function removePreference(id) {
  db.prepare('UPDATE preferences SET active=0 WHERE id=?').run(id);
}

// ---------------------------------------------------------------------------
// Feeds
// ---------------------------------------------------------------------------
function getFeeds(enabledOnly = false) {
  return enabledOnly
    ? db.prepare('SELECT * FROM feeds WHERE enabled=1 ORDER BY id').all()
    : db.prepare('SELECT * FROM feeds ORDER BY id').all();
}

function addFeed({ label, url, country = 'International', lang = 'en' }) {
  return db.prepare('INSERT INTO feeds (label, url, country, lang) VALUES (?, ?, ?, ?)')
    .run(label, url, country, lang);
}

function deleteFeed(id) {
  db.prepare('DELETE FROM feeds WHERE id=?').run(id);
}

// ---------------------------------------------------------------------------
// Recipients
// ---------------------------------------------------------------------------
function getRecipients() {
  return db.prepare('SELECT * FROM recipients ORDER BY id').all();
}

function addRecipient({ label = '', email }) {
  return db.prepare('INSERT INTO recipients (label, email) VALUES (?, ?)').run(label, email);
}

function updateRecipient(id, { label, email, enabled }) {
  db.prepare('UPDATE recipients SET label=?, email=?, enabled=? WHERE id=?')
    .run(label ?? '', email, enabled ?? 1, id);
}

function deleteRecipient(id) {
  db.prepare('DELETE FROM recipients WHERE id=?').run(id);
}

// ---------------------------------------------------------------------------
// Digest History
// ---------------------------------------------------------------------------
function saveDigest({ period, news_data, token_usage, provider, model }) {
  db.prepare(`
    INSERT INTO digest_history (period, news_data, token_usage, provider, model)
    VALUES (?, ?, ?, ?, ?)
  `).run(period, JSON.stringify(news_data), JSON.stringify(token_usage), provider, model);
}

function getRecentDigests(limit = 10) {
  return db.prepare('SELECT * FROM digest_history ORDER BY sent_at DESC LIMIT ?').all(limit);
}

function cleanupOldDigests(days = 2) {
  const r = db.prepare(`DELETE FROM digest_history WHERE sent_at < datetime('now', '-' || ? || ' days')`).run(days);
  if (r.changes > 0) console.log(`[db] Cleaned up ${r.changes} old digest(s) (>${days} days)`);
}

// ---------------------------------------------------------------------------
// Chat History
// ---------------------------------------------------------------------------
function saveChatMessage(role, content, actions = null) {
  db.prepare('INSERT INTO chat_history (role, content, actions) VALUES (?, ?, ?)')
    .run(role, content, actions ? JSON.stringify(actions) : null);
}

function getChatHistory(limit = 50) {
  return db.prepare('SELECT * FROM chat_history ORDER BY created_at ASC LIMIT ?').all(limit);
}

function clearChatHistory() {
  db.prepare('DELETE FROM chat_history').run();
}

module.exports = {
  db, initDb,
  getAiConfig, upsertAiConfig,
  getPrompt, updatePrompt,
  getPromptByName, updatePromptByName,
  getTtsConfig, upsertTtsConfig,
  getPreferences, addPreference, removePreference,
  getRecipients, addRecipient, updateRecipient, deleteRecipient,
  getFeeds, addFeed, deleteFeed,
  saveDigest, getRecentDigests, cleanupOldDigests,
  saveChatMessage, getChatHistory, clearChatHistory,
};
