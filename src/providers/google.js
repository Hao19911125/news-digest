'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

async function callGoogle(messages, model, apiKey) {
  const key = apiKey || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('Google API key not configured');

  const genAI = new GoogleGenerativeAI(key);
  const modelName = model || 'gemini-2.0-flash';

  // Extract system prompt
  let systemInstruction;
  const remaining = [];
  for (const m of messages) {
    if (m.role === 'system') { systemInstruction = m.content; }
    else { remaining.push(m); }
  }

  const gemini = genAI.getGenerativeModel({
    model: modelName,
    ...(systemInstruction ? { systemInstruction } : {}),
  });

  // Build Gemini history (all but last user message)
  const lastMsg = remaining.at(-1);
  const history = remaining.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const chat = gemini.startChat({ history });
  const result = await chat.sendMessage(lastMsg?.content || '');
  const resp = result.response;

  return {
    content: resp.text(),
    usage: {
      input_tokens:  resp.usageMetadata?.promptTokenCount     ?? 0,
      output_tokens: resp.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

module.exports = { callGoogle };
