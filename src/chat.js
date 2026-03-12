'use strict';

const { chatCompletion } = require('./aiProvider');
const { getPrompt, updatePrompt } = require('./promptManager');
const { getPreferences, addPreference, removePreference, saveChatMessage, getChatHistory } = require('./db');

const CHAT_SYSTEM = `你是 NewsDigest 的偏好管理助手，帮助用户用自然语言调整新闻推送的偏好和分析提示词。

你的回复必须是合法 JSON（不加任何 markdown 包裹），格式如下：
{"reply":"给用户看的中文回复","actions":[...]}

actions 支持：
- {"type":"update_prompt","new_prompt":"完整新 prompt 文本，必须保留 {user_preferences} 和 {news_items} 占位符"}
- {"type":"add_preference","pref_type":"boost|suppress|minimum","topic":"话题","value":1}
- {"type":"remove_preference","id":123}

修改 prompt 时只改用户要求的部分，保留其余内容和占位符。
若无需操作，actions 为空数组。`;

async function processChat(userMessage) {
  const prompt = getPrompt();
  const prefs  = getPreferences();

  const prefsSummary = prefs.length
    ? prefs.map(p => `[id:${p.id}] ${p.type}: ${p.topic}${p.type === 'minimum' ? ` (≥${p.value}条)` : ''}`).join('\n')
    : '（暂无偏好）';

  const history = getChatHistory(20);
  const messages = [
    { role: 'system', content: CHAT_SYSTEM },
    // Inject context as a system-level assistant turn so it doesn't pollute history
    {
      role: 'user',
      content: `[系统上下文]\n当前提示词：\n${prompt?.content || '未找到'}\n\n当前偏好列表：\n${prefsSummary}`,
    },
    { role: 'assistant', content: '{"reply":"已载入当前配置，请说明要做什么调整。","actions":[]}' },
    ...history.map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
    { role: 'user', content: userMessage },
  ];

  const resp = await chatCompletion({ messages, purpose: 'chat' });

  let parsed;
  try {
    const raw   = resp.content.trim();
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
    parsed = JSON.parse(match ? match[1].trim() : raw);
  } catch {
    parsed = { reply: resp.content, actions: [] };
  }

  const { reply = '', actions = [] } = parsed;
  const executed = [];

  for (const a of actions) {
    try {
      switch (a.type) {
        case 'update_prompt':
          if (a.new_prompt) { updatePrompt(a.new_prompt, 'chat_ai'); executed.push({ ...a, ok: true }); }
          break;
        case 'add_preference':
          addPreference(a.pref_type, a.topic, a.value ?? 1);
          executed.push({ ...a, ok: true });
          break;
        case 'remove_preference':
          removePreference(a.id);
          executed.push({ ...a, ok: true });
          break;
        default:
          executed.push({ ...a, ok: true });
      }
    } catch (err) {
      executed.push({ ...a, ok: false, error: err.message });
    }
  }

  saveChatMessage('user', userMessage);
  saveChatMessage('assistant', reply, executed.length ? executed : null);

  return { reply, actions: executed };
}

module.exports = { processChat };
