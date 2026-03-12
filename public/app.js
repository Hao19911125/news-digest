'use strict';

const { createApp, ref, reactive, computed, nextTick, onMounted } = Vue;

createApp({
  setup() {
    // ── Navigation ───────────────────────────────
    const page = ref('dashboard');
    function goto(p) { page.value = p; loadPage(p); }

    // ── Toast ────────────────────────────────────
    const toasts = ref([]);
    let toastId = 0;
    function toast(msg, type = 'success') {
      const id = ++toastId;
      toasts.value.push({ id, msg, type });
      setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 3000);
    }

    // ── API helpers ───────────────────────────────
    async function api(path, opts = {}) {
      const res = await fetch('/api' + path, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
      return res.json();
    }

    // ── Dashboard ─────────────────────────────────
    const latest     = ref(null);
    const triggering = ref(false);
    const runStatus  = ref(null);   // live status from /api/status
    const stats = reactive({ total: 0, nextRun: '—', prefs: 0 });
    let pollTimer = null;

    async function loadDashboard() {
      try {
        const [lat, hist, prfs] = await Promise.all([
          api('/digests/latest'),
          api('/digests?limit=50'),
          api('/preferences'),
        ]);
        latest.value = lat;
        stats.total  = hist.length;
        stats.prefs  = prfs.length;
        stats.nextRun = nextRunTime();
      } catch (e) { toast(e.message, 'error'); }
      await pollStatus();
      startPolling();
    }

    async function pollStatus() {
      try { runStatus.value = await api('/status'); } catch {}
    }

    function startPolling() {
      if (pollTimer) return;
      pollTimer = setInterval(async () => {
        if (page.value !== 'dashboard') return;
        await pollStatus();
        // If a run just finished successfully, refresh the latest digest
        if (runStatus.value && !runStatus.value.running && runStatus.value.lastRun?.ok) {
          const prev = latest.value?.sent_at;
          const cur  = runStatus.value.lastRun?.at;
          if (cur && cur !== prev) {
            latest.value = await api('/digests/latest').catch(() => latest.value);
            stats.total  = (await api('/digests?limit=50').catch(() => [])).length;
          }
        }
      }, 5000); // poll every 5s
    }

    function nextRunTime() {
      const now = new Date();
      const hkt = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' }));
      const h = hkt.getHours();
      let next = new Date(hkt);
      if (h < 7) { next.setHours(7, 0, 0, 0); }
      else { next.setDate(next.getDate() + 1); next.setHours(7, 0, 0, 0); }
      return next.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }

    async function triggerDigest() {
      triggering.value = true;
      try {
        const period = new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', hour: 'numeric', hour12: false }) < 13 ? 'morning' : 'evening';
        await api('/trigger', { method: 'POST', body: { period } });
        toast('已触发推送，正在处理...');
        await pollStatus();
      } catch (e) { toast(e.message, 'error'); }
      triggering.value = false;
    }

    // Status display helpers
    const stepLabel = { fetching: '正在抓取新闻...', analyzing: 'AI 分析中...', tts: '生成语音播报...', sending: '发送邮件...' };
    function statusDotClass(s) {
      if (!s) return 'dot-gray';
      if (s.running) return 'dot-warn';
      if (s.lastRun?.ok === true)  return 'dot-green';
      if (s.lastRun?.ok === false) return 'dot-red';
      return 'dot-gray';
    }
    function statusText(s) {
      if (!s) return '未知';
      if (s.running) return stepLabel[s.step] || '运行中...';
      if (!s.lastRun?.at) return '尚未运行';
      if (s.lastRun.ok) return `成功 · ${formatDate(s.lastRun.at)} · ${(s.lastRun.tokens?.input_tokens ?? 0) + (s.lastRun.tokens?.output_tokens ?? 0)} tokens`;
      return `失败 · ${s.lastRun.error}`;
    }

    // ── Chat ──────────────────────────────────────
    const chatMessages = ref([]);
    const chatInput    = ref('');
    const chatLoading  = ref(false);
    const chatEl       = ref(null);

    async function loadChat() {
      try {
        const hist = await api('/chat/history');
        chatMessages.value = hist.map(h => ({
          id: h.id, role: h.role, content: h.content,
          actions: h.actions ? JSON.parse(h.actions) : null,
        }));
        scrollChat();
      } catch (e) { toast(e.message, 'error'); }
    }

    async function sendChat() {
      const msg = chatInput.value.trim();
      if (!msg || chatLoading.value) return;
      chatMessages.value.push({ id: Date.now(), role: 'user', content: msg });
      chatInput.value = '';
      chatLoading.value = true;
      scrollChat();
      try {
        const res = await api('/chat', { method: 'POST', body: { message: msg } });
        chatMessages.value.push({ id: Date.now() + 1, role: 'assistant', content: res.reply, actions: res.actions });
        scrollChat();
      } catch (e) {
        chatMessages.value.push({ id: Date.now() + 1, role: 'assistant', content: '出错了：' + e.message });
        toast(e.message, 'error');
      }
      chatLoading.value = false;
      scrollChat();
    }

    async function clearChat() {
      await api('/chat/history', { method: 'DELETE' });
      chatMessages.value = [];
      toast('对话已清除');
    }

    function scrollChat() {
      nextTick(() => {
        if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight;
      });
    }

    function actionLabel(a) {
      if (a.type === 'update_prompt')    return '✏️ 已更新提示词';
      if (a.type === 'add_preference')   return `⭐ 已添加偏好：${a.topic}`;
      if (a.type === 'remove_preference') return `🗑 已删除偏好`;
      return a.type;
    }

    // ── Preferences ───────────────────────────────
    const prefs   = ref([]);
    const newPref = reactive({ type: 'boost', topic: '', value: 1 });

    async function loadPrefs() {
      prefs.value = await api('/preferences');
    }

    async function addPref() {
      if (!newPref.topic.trim()) return;
      try {
        await api('/preferences', { method: 'POST', body: { ...newPref } });
        newPref.topic = '';
        await loadPrefs();
        toast('偏好已添加');
      } catch (e) { toast(e.message, 'error'); }
    }

    async function removePref(id) {
      try {
        await api(`/preferences/${id}`, { method: 'DELETE' });
        await loadPrefs();
        toast('偏好已删除');
      } catch (e) { toast(e.message, 'error'); }
    }

    function prefTypeLabel(type) {
      return { boost: '偏好', suppress: '屏蔽', minimum: '最少' }[type] || type;
    }

    // ── Prompt ────────────────────────────────────
    const prompt        = ref(null);
    const promptContent = ref('');
    const promptSaving  = ref(false);
    const promptName    = ref('default');

    async function loadPrompt() {
      prompt.value   = await api(`/prompt?name=${promptName.value}`);
      promptContent.value = prompt.value?.content || '';
    }

    async function savePrompt() {
      promptSaving.value = true;
      try {
        await api('/prompt', { method: 'PUT', body: { content: promptContent.value, name: promptName.value } });
        await loadPrompt();
        toast('提示词已保存');
      } catch (e) { toast(e.message, 'error'); }
      promptSaving.value = false;
    }

    function switchPrompt(name) {
      promptName.value = name;
      loadPrompt();
    }

    // ── History ───────────────────────────────────
    const history = ref([]);
    async function loadHistory() {
      history.value = await api('/digests?limit=20');
    }

    // ── Settings ──────────────────────────────────
    const settingsTab = ref('ai');

    // ── Recipients ────────────────────────────────
    const recipients  = ref([]);
    const newRecipient = reactive({ label: '', email: '' });
    const editingRecipient = ref(null); // { id, label, email, enabled }

    async function loadRecipients() {
      recipients.value = await api('/recipients');
    }

    async function addNewRecipient() {
      if (!newRecipient.email.trim()) return;
      try {
        await api('/recipients', { method: 'POST', body: { ...newRecipient } });
        newRecipient.label = ''; newRecipient.email = '';
        await loadRecipients();
        toast('收件人已添加');
      } catch (e) { toast(e.message, 'error'); }
    }

    function startEditRecipient(r) {
      editingRecipient.value = { ...r };
    }

    async function saveRecipient() {
      const r = editingRecipient.value;
      if (!r || !r.email.trim()) return;
      try {
        await api(`/recipients/${r.id}`, { method: 'PUT', body: { label: r.label, email: r.email, enabled: r.enabled } });
        editingRecipient.value = null;
        await loadRecipients();
        toast('收件人已更新');
      } catch (e) { toast(e.message, 'error'); }
    }

    async function toggleRecipient(r) {
      try {
        await api(`/recipients/${r.id}`, { method: 'PUT', body: { label: r.label, email: r.email, enabled: r.enabled ? 0 : 1 } });
        await loadRecipients();
      } catch (e) { toast(e.message, 'error'); }
    }

    async function removeRecipient(id) {
      try {
        await api(`/recipients/${id}`, { method: 'DELETE' });
        await loadRecipients();
        toast('收件人已删除');
      } catch (e) { toast(e.message, 'error'); }
    }

    const feeds = ref([]);
    const smtp  = reactive({});
    const aiCfg = reactive({
      news: { provider: 'anthropic', model: 'claude-sonnet-4-6', api_key: '', base_url: '' },
      chat: { provider: 'anthropic', model: 'claude-sonnet-4-6', api_key: '', base_url: '' },
      tts:  { provider: 'anthropic', model: 'claude-sonnet-4-6', api_key: '', base_url: '' },
    });
    const testingAi   = reactive({ news: false, chat: false, tts: false });
    const fetchingModels = reactive({ news: false, chat: false, tts: false });
    const availModels = reactive({ news: [], chat: [], tts: [] });

    // ── TTS Config ─────────────────────────────────
    const ttsCfg = reactive({ enabled: false, voice: 'zh-CN-XiaoxiaoNeural', rate: '+0%', pitch: '+0Hz', audio_base_url: '' });
    const ttsVoices = ref([]);

    const newFeed = reactive({ label: '', url: '', country: 'International', lang: 'en' });
    const feedTestResult = reactive({});  // keyed by feed id or 'new'

    const providers = [
      { id: 'anthropic', label: 'Anthropic', defaultModel: 'claude-sonnet-4-6' },
      { id: 'openai',    label: 'OpenAI',    defaultModel: 'gpt-4o-mini' },
      { id: 'google',    label: 'Google AI', defaultModel: 'gemini-2.0-flash' },
      { id: 'custom',    label: '自定义端点', defaultModel: 'default' },
    ];

    async function loadSettings() {
      const [aiData, smtpData, feedData, rcptData, ttsData, voicesData] = await Promise.all([
        api('/settings/ai'),
        api('/settings/smtp'),
        api('/feeds'),
        api('/recipients'),
        api('/settings/tts'),
        api('/settings/tts/voices'),
      ]);
      recipients.value = rcptData;
      Object.assign(aiCfg.news, aiData.news, { api_key: '' });
      Object.assign(aiCfg.chat, aiData.chat, { api_key: '' });
      Object.assign(aiCfg.tts,  aiData.tts,  { api_key: '' });
      Object.assign(smtp, smtpData);
      feeds.value = feedData;
      Object.assign(ttsCfg, ttsData);
      ttsVoices.value = voicesData || [];
    }

    async function saveAi(purpose) {
      try {
        await api(`/settings/ai/${purpose}`, { method: 'PUT', body: aiCfg[purpose] });
        toast(`${{news:'新闻',chat:'聊天',tts:'语音播报'}[purpose]||purpose}模型配置已保存`);
      } catch (e) { toast(e.message, 'error'); }
    }

    async function testAi(purpose) {
      testingAi[purpose] = true;
      try {
        const res = await api('/settings/ai/test', { method: 'POST', body: { purpose, ...aiCfg[purpose], api_key: aiCfg[purpose].api_key || undefined } });
        toast(`连接成功：${res.response}`);
      } catch (e) { toast('连接失败：' + e.message, 'error'); }
      testingAi[purpose] = false;
    }

    async function fetchModels(purpose) {
      fetchingModels[purpose] = true;
      try {
        const res = await api('/settings/ai/models', { method: 'POST', body: { purpose, ...aiCfg[purpose], api_key: aiCfg[purpose].api_key || undefined } });
        availModels[purpose] = res.models || [];
        if (!res.models.length) toast('未找到可用模型', 'error');
        else toast(`获取到 ${res.models.length} 个模型`);
      } catch (e) { toast('获取失败：' + e.message, 'error'); }
      fetchingModels[purpose] = false;
    }

    // ── Feed management ───────────────────────────
    async function addNewFeed() {
      if (!newFeed.label.trim() || !newFeed.url.trim()) return;
      try {
        await api('/feeds', { method: 'POST', body: { ...newFeed } });
        newFeed.label = ''; newFeed.url = ''; newFeed.country = 'International'; newFeed.lang = 'en';
        feeds.value = await api('/feeds');
        toast('新闻源已添加');
      } catch (e) { toast(e.message, 'error'); }
    }

    async function removeFeed(id) {
      try {
        await api(`/feeds/${id}`, { method: 'DELETE' });
        feeds.value = await api('/feeds');
        toast('新闻源已删除');
      } catch (e) { toast(e.message, 'error'); }
    }

    async function testFeed(id, url) {
      feedTestResult[id] = { testing: true };
      try {
        const res = await api('/feeds/test', { method: 'POST', body: { url } });
        feedTestResult[id] = { ok: true, count: res.count };
      } catch (e) {
        feedTestResult[id] = { ok: false, error: e.message };
      }
    }

    // ── TTS config save ───────────────────────────
    async function saveTtsCfg() {
      try {
        await api('/settings/tts', { method: 'PUT', body: { ...ttsCfg } });
        toast('语音播报配置已保存');
      } catch (e) { toast(e.message, 'error'); }
    }

    // ── Helpers ───────────────────────────────────
    function formatDate(dt) {
      if (!dt) return '—';
      return new Date(dt.replace(' ', 'T') + (dt.includes('Z') ? '' : 'Z'))
        .toLocaleString('zh-CN', { timeZone: 'Asia/Hong_Kong', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    // ── Page loader ───────────────────────────────
    function loadPage(p) {
      if (p === 'dashboard')   loadDashboard();
      if (p === 'chat')        loadChat();
      if (p === 'preferences') loadPrefs();
      if (p === 'prompt')      loadPrompt();
      if (p === 'history')     loadHistory();
      if (p === 'settings')    loadSettings();
    }

    onMounted(() => loadPage('dashboard'));

    return {
      page, goto,
      toasts,
      // dashboard
      latest, stats, triggering, triggerDigest, runStatus, statusDotClass, statusText, stepLabel,
      // chat
      chatMessages, chatInput, chatLoading, chatEl, sendChat, clearChat, actionLabel,
      // preferences
      prefs, newPref, addPref, removePref, prefTypeLabel,
      // prompt
      prompt, promptContent, promptSaving, savePrompt, promptName, switchPrompt,
      // history
      history,
      // settings
      settingsTab, feeds, smtp, aiCfg, providers, testingAi, saveAi, testAi,
      fetchingModels, availModels, fetchModels,
      newFeed, feedTestResult, addNewFeed, removeFeed, testFeed,
      recipients, newRecipient, editingRecipient,
      addNewRecipient, startEditRecipient, saveRecipient, toggleRecipient, removeRecipient,
      // tts
      ttsCfg, ttsVoices, saveTtsCfg,
      // helpers
      formatDate,
    };
  },
}).mount('#app');
