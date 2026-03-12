'use strict';

const { getPrompt, updatePrompt, getPromptByName, updatePromptByName, getPreferences } = require('./db');

/**
 * Build the final prompt string by injecting preferences and news items
 * into the template stored in the database.
 */
function buildAnalysisPrompt(newsItems) {
  const tmpl = getPrompt();
  if (!tmpl) throw new Error('No prompt template found in database');

  const prefs = getPreferences();
  const prefLines = prefs.length
    ? prefs.map(p => {
        if (p.type === 'boost')    return `- 偏好（加权）：${p.topic}`;
        if (p.type === 'suppress') return `- 屏蔽：${p.topic}`;
        if (p.type === 'minimum')  return `- 至少 ${p.value} 条关于：${p.topic}`;
        return `- ${p.topic}`;
      }).join('\n')
    : '（无特殊偏好）';

  const newsLines = newsItems.map((item, i) =>
    `${i + 1}. [${item.source} / ${item.country}] ${item.title}\n   ${item.description.slice(0, 300)}\n   URL: ${item.url}`
  ).join('\n\n');

  return tmpl.content
    .replace('{user_preferences}', prefLines)
    .replace('{news_items}', newsLines);
}

module.exports = { buildAnalysisPrompt, getPrompt, updatePrompt, getPromptByName, updatePromptByName };
