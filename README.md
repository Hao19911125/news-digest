# NewsDigest

An AI-powered daily news digest system that automatically fetches RSS feeds, analyzes and ranks articles with AI, generates optional voice narration, and delivers beautifully styled HTML emails every morning.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green) ![License](https://img.shields.io/badge/license-MIT-blue) ![SQLite](https://img.shields.io/badge/database-SQLite-lightgrey)

---

## Features

- **Multi-source RSS aggregation** — 17 curated default feeds across international, US, UK, tech, China, and Hong Kong sources; fully customizable
- **AI-powered analysis** — ranks the day's top 10 most important stories with AI-written Chinese summaries
- **Multi-provider AI support** — Anthropic Claude, OpenAI, Google Gemini, or any OpenAI-compatible endpoint (Ollama, LM Studio, etc.)
- **Smart deduplication** — Jaccard similarity algorithm prevents repeated stories across consecutive digests
- **Text-to-Speech narration** — generates a broadcast-style MP3 using Microsoft Edge TTS with 12 Chinese voice presets (Mandarin, Cantonese, Taiwanese)
- **Parchment-styled HTML email** — paginated layout with embedded images, inline audio player, and optional Bible verse
- **Conversational preference management** — tell the AI in plain language to "focus more on AI news" or "suppress sports coverage"; it handles the rest
- **Web configuration UI** — Vue.js SPA for managing feeds, recipients, AI settings, prompts, and preferences
- **Multiple recipients** — send to a list of addresses with per-recipient enable/disable
- **Scheduled delivery** — runs daily at 07:00 HKT via node-cron

---

## Screenshots

> The email is styled as a parchment document with decorative borders, serif typography, embedded article images, an HTML5 audio player (if TTS is enabled), and a Bible verse on the final page.

---

## Requirements

- **Node.js** 18+
- **npm**
- **edge-tts** CLI — only required if you want Text-to-Speech narration

Install edge-tts globally:
```bash
pip install edge-tts
# or
npm install -g edge-tts
```

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/Hao19911125/news-digest.git
cd news-digest

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env
# Edit .env with your API keys and SMTP credentials

# 4. Start the server
npm start
# or with auto-restart on file changes:
npm run dev
```

Open **http://localhost:3100** to access the configuration UI.

---

## Configuration

### Environment Variables (`.env`)

These are set once and never change unless you need to update credentials:

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | `3100` | No | HTTP server port |
| `TZ` | `Asia/Hong_Kong` | No | Timezone for cron schedule and date formatting |
| `ANTHROPIC_API_KEY` | — | No* | Claude API key |
| `OPENAI_API_KEY` | — | No* | OpenAI API key |
| `GOOGLE_API_KEY` | — | No* | Google Gemini API key |
| `SMTP_HOST` | `smtp.qq.com` | Yes | SMTP server hostname |
| `SMTP_PORT` | `465` | Yes | SMTP server port |
| `SMTP_SECURE` | `true` | Yes | Use TLS/SSL (`true` for port 465) |
| `SMTP_USER` | — | Yes | SMTP login username (your email address) |
| `SMTP_PASS` | — | Yes | SMTP password or app-specific auth code |
| `MAIL_TO` | — | No | Fallback recipient if none are configured in the UI |

*At least one AI provider key is required.

### AI Provider Setup

After starting the server, go to **Settings → AI Provider** in the web UI. You can configure separate AI providers for:

- **News analysis** — ranks and summarizes the day's articles
- **Chat** — understands natural-language preference changes
- **TTS script** — rewrites news into a conversational broadcast style

Each purpose can use a different provider and model independently.

### SMTP Setup

The default configuration targets **QQ Mail** (`smtp.qq.com:465`). For QQ Mail, `SMTP_PASS` should be the 16-character **authorization code** (授权码), not your account password. You can generate one at [mail.qq.com → Settings → Account → POP3/SMTP](https://mail.qq.com).

For Gmail, use `smtp.gmail.com`, port `587`, `SMTP_SECURE=false`, and an [App Password](https://support.google.com/accounts/answer/185833).

For other providers, adjust `SMTP_HOST`, `SMTP_PORT`, and `SMTP_SECURE` accordingly.

### Text-to-Speech (TTS)

TTS is **disabled by default**. To enable it:

1. Install the `edge-tts` CLI (see Requirements above)
2. Go to **Settings → TTS** in the web UI
3. Set your **Audio Base URL** — this must be the publicly accessible URL of your server (e.g., `https://your-domain.com`). This is used to generate playable links in the email. If your server is only on a local network, email clients outside that network won't be able to play the audio.
4. Choose a voice, adjust speed and pitch, and toggle it on

Available voice presets include Mandarin (mainland), Traditional Chinese (Taiwan), and Cantonese (Hong Kong) voices from Microsoft's neural TTS engine.

Audio files are saved to `data/audio/` and automatically deleted after 3 days.

### RSS Feeds

17 feeds are pre-loaded on first run. You can add, remove, or disable feeds from the **Feeds** section of the web UI. To test a feed URL before adding it, use the built-in URL validator.

### User Preferences

Manage what topics appear in your digest from the **Chat** tab by typing naturally:

- *"Focus more on AI and technology"*
- *"Suppress sports news"*
- *"Always include at least 2 articles about Hong Kong"*

Or use the **Preferences** tab to add/remove them directly.

---

## Production Deployment (PM2)

```bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start ecosystem.config.js

# View logs
pm2 logs news-digest

# Restart after a git pull
git pull && pm2 restart news-digest

# Auto-start on system boot
pm2 startup
pm2 save
```

The `ecosystem.config.js` configures the app name, cluster mode, memory limit (300MB), and log paths.

---

## Architecture

```
RSS Feeds (fetcher.js)
  → AI Analysis & Ranking (analyzer.js)
  → Deduplication — Jaccard similarity (cron.js)
  → TTS Audio Generation (tts.js)          [optional]
  → Bible Verse Selection (bibleVerse.js)   [optional]
  → HTML Email Rendering & Delivery (mailer.js)
```

**Key files:**

| File | Role |
|------|------|
| `src/index.js` | Express server, route mounting, static file serving |
| `src/cron.js` | Daily pipeline orchestrator, in-memory status |
| `src/db.js` | SQLite schema, CRUD functions, default seed data |
| `src/fetcher.js` | RSS parsing, 12-hour news window, image extraction |
| `src/analyzer.js` | AI news ranking with retry and JSON repair |
| `src/mailer.js` | Parchment HTML email, image embedding, SMTP send |
| `src/tts.js` | edge-tts synthesis, audio storage, cleanup |
| `src/aiProvider.js` | Unified AI interface dispatching to providers |
| `src/chat.js` | Natural-language preference management |
| `src/providers/` | Anthropic, OpenAI, Google, and custom implementations |
| `src/routes/` | REST API endpoints |
| `public/` | Vue.js SPA (no build step required) |

**Database** (`data/newsdigest.db`) is created automatically on first run. It stores all configuration, preferences, prompt templates, digest history, and TTS settings. This file is excluded from git — it persists independently across `git pull` updates.

---

## Updating

```bash
cd /path/to/news-digest
git pull
pm2 restart news-digest
```

Your `.env` file and `data/` directory (database + audio) are excluded from git and will never be overwritten by updates.

---

## API Reference (Brief)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | Current digest run status |
| `POST` | `/api/trigger` | Manually trigger a digest |
| `GET` | `/api/digests/latest` | Most recent digest result |
| `GET/POST/DELETE` | `/api/preferences` | Manage topic preferences |
| `GET/POST/DELETE` | `/api/feeds` | Manage RSS feeds |
| `GET/POST/PUT/DELETE` | `/api/recipients` | Manage email recipients |
| `GET/PUT` | `/api/settings/ai/:purpose` | AI provider configuration |
| `GET/PUT` | `/api/settings/tts` | TTS configuration |
| `GET/PUT` | `/api/prompt?name=default\|tts` | Edit prompt templates |
| `POST` | `/api/chat` | Send a preference management message |

---

## License

MIT
