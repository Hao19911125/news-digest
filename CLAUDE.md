# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` — Start the server (`src/index.js`)
- `npm run dev` — Start with Node.js watch mode (auto-restart on file changes)
- `pm2 start ecosystem.config.js` — Start via PM2 (app name: `news-digest`)
- `pm2 logs news-digest` — View live logs
- `pm2 restart news-digest` — Restart the service

No build, lint, or test frameworks are configured.

## Architecture

Express + SQLite Node.js application that fetches RSS feeds, analyzes them with AI, deduplicates content, and sends styled HTML emails on a daily schedule.

**Entry point:** `src/index.js` — mounts Express routes, serves Vue.js SPA from `public/`, starts cron scheduler.

**Data flow:**
```
RSS Feeds (fetcher.js) → AI Analysis (analyzer.js) → Deduplication (cron.js)
  → Bible Verse (bibleVerse.js, optional) → HTML Email (mailer.js) → SMTP send
```

**Core modules:**
- `src/cron.js` — Daily cron at 07:00 HKT; in-memory status object exposed via `/api/status`; Jaccard similarity deduplication (70% threshold) against previous digest
- `src/db.js` — SQLite schema and CRUD; 8 tables: `ai_config`, `prompt_template`, `preferences`, `digest_history`, `chat_history`, `feeds`, `recipients`, plus default 17 RSS feeds
- `src/fetcher.js` — RSS parsing with 12-hour news window; image extraction tries enclosure → media:content → media:thumbnail → `<img>` tags
- `src/analyzer.js` — 3-attempt retry AI calls; `repairJson()` fixes unescaped quotes in AI JSON output
- `src/mailer.js` — Parchment-styled HTML email; inline-embeds images (512KB limit) as Base64 CID attachments
- `src/aiProvider.js` — Unified interface dispatching to provider implementations in `src/providers/` (Anthropic, OpenAI, Google, custom OpenAI-compatible)
- `src/chat.js` — NLP preference/prompt management via AI conversation
- `src/promptManager.js` — Injects user preferences and news items into the prompt template

**API routes:**
- `src/routes/api.js` — Digest history, preferences, feeds, recipients, status, manual trigger
- `src/routes/settings.js` — AI provider config, model enumeration, SMTP config, connectivity tests
- `src/routes/chat.js` — Chat endpoint for natural-language preference changes
- `src/routes/prompt.js` — GET/PUT the AI analysis prompt template

**Frontend:** Vue.js SPA (`public/app.js`, `public/index.html`) with sidebar navigation; communicates with all API routes above.

## Environment Variables

See `.env.example`. Key variables:
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY` — AI providers
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` — Email delivery
- `MAIL_TO` — Fallback recipient if `recipients` table is empty
- `PORT` — Server port (default 3100)
- `TZ=Asia/Hong_Kong` — Timezone for cron and date formatting

## Key Patterns

- **AI provider abstraction**: `chatCompletion({messages, purpose, provider, model, apiKey, baseUrl})` — `purpose` selects 'news' vs. 'chat' config from `ai_config` table
- **Retry logic**: `aiProvider.js` retries 3×/3s; `analyzer.js` retries 3×/4s
- **Deduplication**: Jaccard similarity on word tokens in `cron.js::deduplicateItems()`; survivors re-ranked from 1
- **Database**: `data/newsdigest.db` (auto-created by `db.js` on first run)
- **Logs**: `logs/error.log` and `logs/out.log` (PM2-managed, timestamped)
