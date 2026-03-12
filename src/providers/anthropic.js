'use strict';

const Anthropic = require('@anthropic-ai/sdk');

async function callAnthropic(messages, model, apiKey) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Anthropic API key not configured');

  const client = new Anthropic({ apiKey: key });

  // Split system message from chat messages
  let system;
  const chatMessages = [];
  for (const m of messages) {
    if (m.role === 'system') { system = m.content; }
    else { chatMessages.push({ role: m.role, content: m.content }); }
  }

  const resp = await client.messages.create({
    model: model || 'claude-sonnet-4-6',
    max_tokens: 8192,
    ...(system ? { system } : {}),
    messages: chatMessages,
  });

  return {
    content: resp.content[0].text,
    usage: { input_tokens: resp.usage.input_tokens, output_tokens: resp.usage.output_tokens },
  };
}

module.exports = { callAnthropic };
