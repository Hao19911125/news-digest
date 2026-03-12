'use strict';

const { callAnthropic } = require('./providers/anthropic');
const { callOpenAI }    = require('./providers/openai');
const { callGoogle }    = require('./providers/google');
const { callCustom }    = require('./providers/custom');
const { getAiConfig }   = require('./db');

const RETRY_COUNT = 3;
const RETRY_DELAY = 3000; // ms

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Unified AI chat completion with auto-retry (3 attempts, 3s apart).
 *
 * @param {object} opts
 * @param {Array}  opts.messages   - [{role:'system'|'user'|'assistant', content}]
 * @param {string} [opts.purpose]  - 'news' | 'chat'  (which ai_config row)
 * @param {string} [opts.provider] - override provider
 * @param {string} [opts.model]    - override model name
 * @param {string} [opts.apiKey]   - override API key
 * @param {string} [opts.baseUrl]  - override base URL (custom provider)
 * @returns {Promise<{content:string, usage:{input_tokens,output_tokens}}>}
 */
async function chatCompletion({ messages, purpose = 'news', provider, model, apiKey, baseUrl }) {
  const cfg = getAiConfig(purpose) || {};
  const p   = provider || cfg.provider || 'anthropic';
  const m   = model    || cfg.model    || 'claude-sonnet-4-6';
  const k   = apiKey   || cfg.api_key  || undefined;
  const u   = baseUrl  || cfg.base_url || undefined;

  let lastErr;
  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    try {
      switch (p) {
        case 'anthropic': return await callAnthropic(messages, m, k);
        case 'openai':    return await callOpenAI(messages, m, k);
        case 'google':    return await callGoogle(messages, m, k);
        case 'custom':    return await callCustom(messages, m, k, u);
        default:          throw new Error(`Unknown AI provider: ${p}`);
      }
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_COUNT) {
        console.warn(`[aiProvider] Attempt ${attempt} failed: ${err.message}. Retrying in ${RETRY_DELAY / 1000}s...`);
        await sleep(RETRY_DELAY);
      }
    }
  }
  throw lastErr;
}

module.exports = { chatCompletion };
