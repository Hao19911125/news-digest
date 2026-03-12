# NewsDigest 新闻简报

一套 AI 驱动的每日新闻摘要系统。自动抓取 RSS 订阅源，用 AI 分析和排序文章，可选生成语音播报，并在每天早晨发送排版精美的 HTML 邮件。

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green) ![License](https://img.shields.io/badge/license-MIT-blue) ![SQLite](https://img.shields.io/badge/database-SQLite-lightgrey)

---

## 功能特点

- **多源 RSS 聚合** — 预置 17 个精选订阅源，涵盖国际、美国、英国、科技、中国大陆及香港媒体，完全可自定义
- **AI 智能分析** — 从当天新闻中筛选最重要的 10 条，并由 AI 生成中文摘要
- **多 AI 服务商支持** — 支持 Anthropic Claude、OpenAI、Google Gemini，以及任何兼容 OpenAI 接口的自托管模型（Ollama、LM Studio 等）
- **智能去重** — 使用 Jaccard 相似度算法，自动过滤与上一期内容高度重复的新闻
- **文字转语音** — 通过 Microsoft Edge TTS 生成播报风格的 MP3，提供 12 种中文语音（普通话、粤语、台湾国语）
- **羊皮纸风格 HTML 邮件** — 分页排版，内嵌文章配图、HTML5 音频播放器及可选圣经金句
- **自然语言偏好管理** — 直接用中文告诉 AI「多关注 AI 新闻」或「屏蔽体育内容」，系统自动处理
- **Web 配置界面** — 基于 Vue.js 的单页应用，可管理订阅源、收件人、AI 设置、提示词和偏好
- **多收件人** — 支持向多个地址发送，每个地址可单独启用或禁用
- **定时发送** — 每天 07:00（香港时间）自动执行

---

## 运行环境要求

- **Node.js** 18 及以上版本
- **npm**
- **edge-tts** 命令行工具 — 仅在需要语音播报功能时安装

安装 edge-tts：
```bash
pip install edge-tts
# 或
npm install -g edge-tts
```

---

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/Hao19911125/news-digest.git
cd news-digest

# 2. 安装依赖
npm install

# 3. 创建环境配置文件
cp .env.example .env
# 用编辑器打开 .env，填入你的 API Key 和 SMTP 信息

# 4. 启动服务
npm start
# 或开发模式（文件变动自动重启）：
npm run dev
```

打开 **http://localhost:3100** 进入配置界面。

---

## 配置说明

### 环境变量（`.env`）

这些配置只需设置一次，通常不会改变：

| 变量名 | 默认值 | 是否必填 | 说明 |
|--------|--------|----------|------|
| `PORT` | `3100` | 否 | HTTP 服务端口 |
| `TZ` | `Asia/Hong_Kong` | 否 | 时区，影响定时任务和日期格式 |
| `ANTHROPIC_API_KEY` | — | 否* | Claude API 密钥 |
| `OPENAI_API_KEY` | — | 否* | OpenAI API 密钥 |
| `GOOGLE_API_KEY` | — | 否* | Google Gemini API 密钥 |
| `SMTP_HOST` | `smtp.qq.com` | 是 | SMTP 服务器地址 |
| `SMTP_PORT` | `465` | 是 | SMTP 端口 |
| `SMTP_SECURE` | `true` | 是 | 是否使用 TLS/SSL（465 端口填 `true`） |
| `SMTP_USER` | — | 是 | 邮箱登录账号 |
| `SMTP_PASS` | — | 是 | 邮箱密码或授权码 |
| `MAIL_TO` | — | 否 | 未在界面配置收件人时的备用收件地址 |

*至少需要填写一个 AI 服务商的密钥。

### AI 服务商配置

启动服务后，在 Web 界面的 **设置 → AI 服务商** 中配置。系统支持为三种用途分别设置独立的 AI 服务商和模型：

- **新闻分析** — 对当天文章进行排序和摘要
- **对话** — 理解自然语言偏好指令
- **TTS 脚本** — 将新闻改写为播报风格文案

三种用途可完全独立，比如用强力模型做新闻分析、用轻量模型处理对话。

### 邮件（SMTP）配置

默认配置适用于 **QQ 邮箱**（`smtp.qq.com:465`）。使用 QQ 邮箱时，`SMTP_PASS` 填写的是 **授权码**（16位字母），而非 QQ 密码。授权码可在 [mail.qq.com → 设置 → 账户 → POP3/SMTP 服务](https://mail.qq.com) 中开启并获取。

如使用 **Gmail**，配置为 `smtp.gmail.com`、端口 `587`、`SMTP_SECURE=false`，密码使用 [应用专用密码](https://support.google.com/accounts/answer/185833)。

其他邮件服务商请相应调整 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`。

### 语音播报（TTS）配置

TTS 功能**默认关闭**，启用步骤：

1. 安装 `edge-tts` 命令行工具（见上方环境要求）
2. 在 Web 界面的 **设置 → 语音播报** 中操作
3. 填写 **音频基础 URL** — 必须是服务器的**公网可访问地址**（例如 `https://your-domain.com`）。此 URL 用于生成邮件中的播放链接，若服务器仅在局域网内，局域网外的邮件客户端将无法播放音频
4. 选择语音、调整语速和音调，开启开关

可用语音预设包括：普通话（多种风格）、台湾国语、粤语，均来自 Microsoft 神经网络 TTS 引擎。

音频文件保存在 `data/audio/`，超过 3 天自动删除。

### RSS 订阅源管理

首次运行时会自动预置 17 个订阅源。可在 Web 界面的**订阅源**页面添加、删除或禁用。添加前可使用内置验证器测试 URL 是否有效。

### 偏好设置

在**对话**标签页用自然语言管理你想看的内容：

- *「多关注 AI 和科技新闻」*
- *「屏蔽体育内容」*
- *「每期至少包含 2 条香港新闻」*

也可以在**偏好**标签页直接添加或删除。

---

## 生产环境部署（PM2）

```bash
# 全局安装 PM2
npm install -g pm2

# 启动应用
pm2 start ecosystem.config.js

# 查看日志
pm2 logs news-digest

# 拉取更新后重启
git pull && pm2 restart news-digest

# 设置开机自启
pm2 startup
pm2 save
```

`ecosystem.config.js` 配置了应用名称、集群模式、内存上限（300MB）和日志路径。

---

## 更新升级

```bash
cd /path/to/news-digest
git pull
pm2 restart news-digest
```

`.env` 文件和 `data/` 目录（数据库 + 音频文件）均已排除在 git 之外，执行 `git pull` 不会覆盖你的任何配置或数据。

---

## 系统架构

```
RSS 订阅源抓取 (fetcher.js)
  → AI 分析排序 (analyzer.js)
  → 去重过滤 — Jaccard 相似度 (cron.js)
  → 语音音频生成 (tts.js)          [可选]
  → 圣经金句选取 (bibleVerse.js)   [可选]
  → HTML 邮件渲染与发送 (mailer.js)
```

**核心文件一览：**

| 文件 | 职责 |
|------|------|
| `src/index.js` | Express 服务入口，路由挂载，静态文件服务 |
| `src/cron.js` | 每日流水线调度，内存中维护运行状态 |
| `src/db.js` | SQLite 表结构定义与 CRUD 操作 |
| `src/fetcher.js` | RSS 解析，12 小时新闻窗口，图片提取 |
| `src/analyzer.js` | AI 新闻排序，自动重试，JSON 修复 |
| `src/mailer.js` | 羊皮纸 HTML 邮件渲染，图片内嵌，SMTP 发送 |
| `src/tts.js` | edge-tts 语音合成，音频管理，定期清理 |
| `src/aiProvider.js` | 统一 AI 接口，分发至各服务商实现 |
| `src/chat.js` | 自然语言偏好管理对话 |
| `src/providers/` | Anthropic、OpenAI、Google、自定义接口实现 |
| `src/routes/` | REST API 路由 |
| `public/` | Vue.js 单页应用（无需构建步骤） |

**数据库**（`data/newsdigest.db`）在首次运行时自动创建，存储所有配置、偏好、提示词模板、摘要历史和 TTS 设置。此文件已排除在 git 之外，`git pull` 更新代码不会影响它。

---

## API 速查

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/status` | 当前摘要任务运行状态 |
| `POST` | `/api/trigger` | 手动触发一次摘要任务 |
| `GET` | `/api/digests/latest` | 最新一期摘要结果 |
| `GET/POST/DELETE` | `/api/preferences` | 管理主题偏好 |
| `GET/POST/DELETE` | `/api/feeds` | 管理 RSS 订阅源 |
| `GET/POST/PUT/DELETE` | `/api/recipients` | 管理收件人 |
| `GET/PUT` | `/api/settings/ai/:purpose` | AI 服务商配置 |
| `GET/PUT` | `/api/settings/tts` | 语音播报配置 |
| `GET/PUT` | `/api/prompt?name=default\|tts` | 编辑提示词模板 |
| `POST` | `/api/chat` | 发送偏好管理对话消息 |

---

## 许可证

MIT
