'use strict';

const { chatCompletion } = require('./aiProvider');
const { buildAnalysisPrompt } = require('./promptManager');
const { getAiConfig } = require('./db');

const ANALYZE_RETRIES = 3;
const ANALYZE_DELAY   = 4000;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Run AI analysis on fetched news items.
 * Retries up to ANALYZE_RETRIES times on any failure (network or JSON parse).
 */
async function analyzeNews(newsItems) {
  if (!newsItems.length) throw new Error('No news items to analyze');

  const prompt = buildAnalysisPrompt(newsItems);
  const cfg    = getAiConfig('news') || {};

  let lastErr;
  for (let attempt = 1; attempt <= ANALYZE_RETRIES; attempt++) {
    try {
      console.log(`[analyzer] Attempt ${attempt}/${ANALYZE_RETRIES} — ${cfg.provider}/${cfg.model} with ${newsItems.length} items...`);

      const resp = await chatCompletion({
        purpose: 'news',
        messages: [{ role: 'user', content: prompt }],
      });

      const items = parseResponse(resp.content);

      console.log(`[analyzer] Got ${items.length} items. Tokens: in=${resp.usage.input_tokens} out=${resp.usage.output_tokens}`);
      return { items, token_usage: resp.usage, provider: cfg.provider, model: cfg.model };

    } catch (err) {
      lastErr = err;
      console.warn(`[analyzer] Attempt ${attempt} failed: ${err.message}`);
      if (attempt < ANALYZE_RETRIES) {
        console.log(`[analyzer] Retrying in ${ANALYZE_DELAY / 1000}s...`);
        await sleep(ANALYZE_DELAY);
      }
    }
  }
  throw lastErr;
}

function parseResponse(content) {
  const raw = content.trim();

  // Extract JSON — try fenced block first (greedy), then bare object
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*)\s*```/);
  const braceMatch = raw.match(/(\{[\s\S]*\})/);
  let jsonStr = fenceMatch ? fenceMatch[1].trim()
              : braceMatch ? braceMatch[1].trim()
              : raw;

  jsonStr = repairJson(jsonStr);

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.error('[analyzer] JSON parse failed. Preview:', raw.slice(0, 600));
    throw new Error(`AI returned invalid JSON: ${err.message}`);
  }

  const items = Array.isArray(parsed) ? parsed : parsed.items;
  if (!Array.isArray(items) || !items.length) throw new Error('AI response missing items array');
  return items;
}

/**
 * Best-effort JSON repair for common AI output issues:
 * - Unescaped ASCII double-quotes inside string values
 */
function repairJson(str) {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      result += ch;
      continue;
    }

    if (ch === '"') {
      if (!inString) {
        // Opening quote of a JSON string
        inString = true;
        result += ch;
      } else {
        // Could be closing quote or an unescaped interior quote.
        // Peek ahead: if followed by :, ,, }, ] or whitespace+those → it's closing.
        const rest = str.slice(i + 1).trimStart();
        if (/^[\s]*[,}\]:]/.test(rest) || rest.length === 0) {
          inString = false;
          result += ch;
        } else {
          // Treat as an interior unescaped quote → escape it
          result += '\\"';
        }
      }
    } else {
      result += ch;
    }
  }

  return result;
}

module.exports = { analyzeNews };
