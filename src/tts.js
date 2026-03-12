'use strict';

const { execFile } = require('child_process');
const path = require('path');
const fs   = require('fs');
const { chatCompletion } = require('./aiProvider');
const { getTtsConfig, getPromptByName } = require('./db');

const AUDIO_DIR = path.join(__dirname, '..', 'data', 'audio');
fs.mkdirSync(AUDIO_DIR, { recursive: true });

// ── Edge-TTS Chinese voice presets ───────────────────────────────────────────
const VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural',             label: '晓晓 (女·温柔知性)',  lang: 'zh-CN' },
  { id: 'zh-CN-XiaoyiNeural',               label: '晓伊 (女·活泼甜美)',  lang: 'zh-CN' },
  { id: 'zh-CN-YunjianNeural',              label: '云健 (男·沉稳大气)',  lang: 'zh-CN' },
  { id: 'zh-CN-YunxiNeural',                label: '云希 (男·阳光少年)',  lang: 'zh-CN' },
  { id: 'zh-CN-YunyangNeural',              label: '云扬 (男·新闻播报)',  lang: 'zh-CN' },
  { id: 'zh-CN-liaoning-XiaobeiNeural',     label: '晓北 (女·东北口音)',  lang: 'zh-CN' },
  { id: 'zh-CN-shaanxi-XiaoniNeural',       label: '晓妮 (女·陕西口音)',  lang: 'zh-CN' },
  { id: 'zh-TW-HsiaoChenNeural',            label: '曉臻 (女·台灣)',     lang: 'zh-TW' },
  { id: 'zh-TW-HsiaoYuNeural',              label: '曉雨 (女·台灣)',     lang: 'zh-TW' },
  { id: 'zh-TW-YunJheNeural',               label: '雲哲 (男·台灣)',     lang: 'zh-TW' },
  { id: 'zh-HK-HiuGaaiNeural',              label: '曉佳 (女·粵語)',     lang: 'zh-HK' },
  { id: 'zh-HK-WanLungNeural',              label: '雲龍 (男·粵語)',     lang: 'zh-HK' },
];

function getVoiceList() { return VOICES; }

/**
 * Rewrite news digest items into a conversational broadcast script via AI.
 */
async function generateBroadcastScript(newsItems) {
  const tmpl = getPromptByName('tts');
  if (!tmpl) throw new Error('TTS prompt template not found in database');

  const digest = newsItems.map((item, i) =>
    `${i + 1}. 【${item.source || ''}】${item.title}\n   ${item.summary}`
  ).join('\n\n');

  const prompt = tmpl.content.replace('{news_digest}', digest);

  console.log('[tts] Calling AI to rewrite broadcast script...');
  const resp = await chatCompletion({
    purpose: 'tts',
    messages: [{ role: 'user', content: prompt }],
  });

  return resp.content.trim();
}

/**
 * Call edge-tts CLI to synthesize mp3 from text.
 * Writes text to a temp file to avoid shell argument-length limits.
 */
function edgeTtsGenerate(text, outputPath, { voice, rate, pitch }) {
  return new Promise((resolve, reject) => {
    const tmpFile = outputPath + '.txt';
    fs.writeFileSync(tmpFile, text, 'utf-8');

    const args = [
      '--voice', voice || 'zh-CN-XiaoxiaoNeural',
      '--file',  tmpFile,
      '--write-media', outputPath,
    ];
    if (rate  && rate  !== '+0%')  args.push('--rate',  rate);
    if (pitch && pitch !== '+0Hz') args.push('--pitch', pitch);

    execFile('edge-tts', args, { timeout: 120_000 }, (err, _stdout, stderr) => {
      try { fs.unlinkSync(tmpFile); } catch {}

      if (err) {
        console.error('[tts] edge-tts stderr:', stderr);
        reject(new Error(`edge-tts failed: ${err.message}`));
      } else {
        resolve(outputPath);
      }
    });
  });
}

/**
 * Full TTS pipeline: AI rewrite → edge-tts audio → return filename.
 * Returns null if TTS is disabled.
 */
async function generateTtsAudio(newsItems, period) {
  const cfg = getTtsConfig();
  if (!cfg || !cfg.enabled) {
    console.log('[tts] TTS is disabled, skipping.');
    return null;
  }

  const script = await generateBroadcastScript(newsItems);
  console.log(`[tts] Broadcast script ready (${script.length} chars). Synthesizing with voice=${cfg.voice} ...`);

  const dateStr  = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Hong_Kong' });
  const filename = `${dateStr}-${period}.mp3`;
  const outPath  = path.join(AUDIO_DIR, filename);

  await edgeTtsGenerate(script, outPath, {
    voice: cfg.voice || 'zh-CN-XiaoxiaoNeural',
    rate:  cfg.rate  || '+0%',
    pitch: cfg.pitch || '+0Hz',
  });

  const stat = fs.statSync(outPath);
  console.log(`[tts] Audio saved: ${filename} (${(stat.size / 1024).toFixed(0)} KB)`);
  return filename;
}

/**
 * Build the public URL for a generated audio file.
 */
function getAudioUrl(filename) {
  if (!filename) return null;
  const cfg  = getTtsConfig();
  const base = (cfg?.audio_base_url || '').replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/audio/${filename}`;
}

/**
 * Delete audio files older than N days.
 */
function cleanupOldAudio(days = 3) {
  const cutoff = Date.now() - days * 86400_000;
  try {
    for (const f of fs.readdirSync(AUDIO_DIR)) {
      const fp = path.join(AUDIO_DIR, f);
      if (fs.statSync(fp).mtimeMs < cutoff) {
        fs.unlinkSync(fp);
        console.log(`[tts] Removed old audio: ${f}`);
      }
    }
  } catch {}
}

module.exports = { generateTtsAudio, getAudioUrl, cleanupOldAudio, getVoiceList };
