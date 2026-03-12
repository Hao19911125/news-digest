'use strict';

const { chatCompletion } = require('./aiProvider');

const SYSTEM = `你是一位熟读圣经的基督徒顾问。请根据当天的新闻摘要，选取一段贴切的圣经经文，并简要说明选择原因。

你的回复必须是合法 JSON，格式如下（不加任何 markdown 包裹）：
{
  "reference": "书卷 章:节（如：约翰福音 3:16）",
  "text": "经文原文（和合本）",
  "reason": "简要说明为什么选这段经文（1-3句，结合当天新闻主题）"
}`;

async function getBibleVerse(newsItems) {
  const headlines = newsItems.slice(0, 10).map((item, i) =>
    `${i + 1}. ${item.title}`
  ).join('\n');

  const userMsg = `今日新闻标题：\n${headlines}\n\n请选取一段与这些新闻主题相关的圣经经文。`;

  try {
    const resp = await chatCompletion({
      purpose: 'news',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userMsg },
      ],
    });

    const raw = resp.content.trim();
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
    return JSON.parse(match ? match[1].trim() : raw);
  } catch (err) {
    console.warn('[bibleVerse] Failed to get verse:', err.message);
    return null;
  }
}

module.exports = { getBibleVerse };
