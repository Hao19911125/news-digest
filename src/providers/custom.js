'use strict';

const OpenAI = require('openai');

// Custom endpoint — any OpenAI-compatible API (Ollama, LM Studio, relay, etc.)
async function callCustom(messages, model, apiKey, baseUrl) {
  if (!baseUrl) throw new Error('Custom provider requires a Base URL');

  const client = new OpenAI({
    apiKey: apiKey || 'placeholder',
    baseURL: baseUrl,
  });

  const resp = await client.chat.completions.create({
    model: model || 'default',
    messages,
    max_tokens: 65335,
  });

  return {
    content: resp.choices[0].message.content,
    usage: {
      input_tokens:  resp.usage?.prompt_tokens     ?? 0,
      output_tokens: resp.usage?.completion_tokens ?? 0,
    },
  };
}

module.exports = { callCustom };
