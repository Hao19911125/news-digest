'use strict';

const OpenAI = require('openai');

async function callOpenAI(messages, model, apiKey) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OpenAI API key not configured');

  const client = new OpenAI({ apiKey: key });
  const resp = await client.chat.completions.create({
    model: model || 'gpt-4o-mini',
    messages,
    max_tokens: 8192,
  });

  return {
    content: resp.choices[0].message.content,
    usage: { input_tokens: resp.usage.prompt_tokens, output_tokens: resp.usage.completion_tokens },
  };
}

module.exports = { callOpenAI };
