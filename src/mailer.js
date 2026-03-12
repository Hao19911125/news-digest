'use strict';

const nodemailer = require('nodemailer');
const http  = require('http');
const https = require('https');

async function downloadImage(url, depth = 0) {
  return new Promise((resolve) => {
    try {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, { timeout: 5000 }, (res) => {
        if ([301,302,307,308].includes(res.statusCode) && res.headers.location && depth < 1) {
          return resolve(downloadImage(res.headers.location, depth + 1));
        }
        if (res.statusCode >= 400) return resolve(null);
        const chunks = [];
        let size = 0;
        res.on('data', chunk => {
          size += chunk.length;
          if (size > 512_000) { req.destroy(); resolve(null); }
          else chunks.push(chunk);
        });
        res.on('end', () => resolve(size > 0 ? Buffer.concat(chunks) : null));
        res.on('error', () => resolve(null));
      });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    } catch { resolve(null); }
  });
}

async function buildAttachments(items) {
  const attachments = [];
  const cidMap = new Map(); // imageUrl -> cid string
  const candidates = items.filter(item => item.image);
  await Promise.all(candidates.map(async (item, idx) => {
    const buf = await downloadImage(item.image);
    if (!buf) return;
    const cid = `nd_img_${idx}`;
    cidMap.set(item.image, cid);
    attachments.push({ filename: `${cid}.jpg`, content: buf, cid });
  }));
  return { attachments, cidMap };
}

function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.qq.com',
    port:   parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE !== 'false',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function renderVerse(verse) {
  if (!verse) return '';
  return `
    <tr><td class="page-pad" style="padding:0 48px 40px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr><td style="padding:20px 24px;background:linear-gradient(135deg,#f9f3e3,#f0e6cc);border:1px solid #d4bc8b;border-radius:6px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="width:4px;background:#9c7a3c;border-radius:2px;"></td>
            <td style="padding-left:16px;">
              <div style="font-size:11px;color:#9c7a3c;text-transform:uppercase;letter-spacing:1.5px;font-family:Georgia,serif;margin-bottom:8px;">✦ 今日经文 ✦</div>
              <p style="margin:0 0 6px;font-size:15px;line-height:1.8;color:#3a2e1e;font-style:italic;font-family:Georgia,'Times New Roman',serif;">"${verse.text}"</p>
              <div style="font-size:13px;color:#8a6c3a;font-weight:600;font-family:Georgia,serif;margin-bottom:8px;">—— ${verse.reference}</div>
              <p style="margin:0;font-size:12px;color:#7a6b52;line-height:1.6;font-family:Georgia,serif;">${verse.reason}</p>
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>`;
}

/* ── Single news card ─────────────────────────────────────────────────── */
function renderNewsItem(item, i, cidMap) {
  const rank = item.rank ?? i + 1;
  const cidKey = cidMap && item.image ? cidMap.get(item.image) : undefined;
  const hasImage = cidKey !== undefined;   // only true when embedding succeeded

  const imageCell = hasImage
    ? `<td class="news-img" width="140" valign="top" style="padding-right:16px;">
        <a href="${item.url || '#'}" style="text-decoration:none;">
          <img src="cid:${cidKey}" width="140" height="95"
               style="display:block;border-radius:4px;object-fit:cover;border:1px solid #d4c5a0;width:140px;max-width:140px;"
               alt="" />
        </a>
      </td>`
    : '';

  const contentWidth = hasImage ? '' : 'width="100%"';

  return `
    <tr><td class="news-cell" style="padding:0 48px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:4px;">
        <tr class="news-row">
          ${imageCell}
          <td class="news-text" ${contentWidth} valign="top">
            <div style="font-size:11px;color:#9c7a3c;letter-spacing:0.5px;font-family:Georgia,serif;margin-bottom:4px;">
              <span style="font-weight:700;">§${rank}</span>${item.source ? ' · ' + item.source : ''}
            </div>
            <a href="${item.url || '#'}" style="text-decoration:none;">
              <div style="margin:0 0 6px;font-size:16px;line-height:1.45;color:#2c1810;font-weight:700;font-family:Georgia,'Times New Roman',serif;">
                ${item.title}
              </div>
            </a>
            <p style="margin:0 0 8px;color:#5a4a35;font-size:13px;line-height:1.7;font-family:Georgia,'Times New Roman',serif;">
              ${item.summary}
            </p>
            <a href="${item.url || '#'}" style="font-size:12px;color:#8b6914;text-decoration:none;font-family:Georgia,serif;letter-spacing:0.3px;">
              阅读原文 ›
            </a>
          </td>
        </tr>
      </table>
    </td></tr>
    <tr><td class="news-cell" style="padding:12px 48px 16px;">
      <div style="border-bottom:1px dashed #cdb88a;"></div>
    </td></tr>`;
}


/* ── One "parchment page" with up to 5 news items ────────────────────── */
function renderPage(items, pageNum, totalPages, label, dateStr, cidMap, audioUrl) {
  const newsRows = items.map((item, i) => renderNewsItem(item, i, cidMap)).join('');

  // Decorative page header ornament
  const ornament = '═══════════════ ✦ ═══════════════';

  return `
  <!-- Page ${pageNum} -->
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:660px;margin:0 auto 32px;background:#faf4e8;border:1px solid #c8b07a;border-radius:3px;box-shadow:2px 3px 12px rgba(80,60,20,0.12),inset 0 0 60px rgba(200,180,130,0.15);">
    <!-- Top edge decoration -->
    <tr><td class="page-pad" style="padding:28px 48px 0;text-align:center;">
      <div style="font-size:11px;color:#b8a070;letter-spacing:4px;font-family:Georgia,serif;">${ornament}</div>
    </td></tr>

    <!-- Page title -->
    <tr><td class="page-pad" style="padding:12px 48px 6px;text-align:center;">
      <div style="font-size:22px;font-weight:700;color:#3a2510;font-family:Georgia,'Times New Roman',serif;letter-spacing:1px;">
        𝕹𝖊𝖜𝖘𝕯𝖎𝖌𝖊𝖘𝖙 ${label}简报
      </div>
    </td></tr>

    <tr><td class="page-pad" style="padding:0 48px 16px;text-align:center;">
      <div style="font-size:12px;color:#9c8a65;font-family:Georgia,serif;letter-spacing:0.5px;">${dateStr}</div>
    </td></tr>

    <!-- Separator line -->
    <tr><td style="padding:0 36px 20px;">
      <div style="border-top:2px solid #c8b07a;"></div>
    </td></tr>

    ${audioUrl ? `
    <!-- Audio player -->
    <tr><td class="page-pad" style="padding:0 48px 24px;text-align:center;">
      <table cellpadding="0" cellspacing="0" width="340" style="width:340px;max-width:100%;margin:0 auto;background:linear-gradient(135deg,#f5edd8,#ede0c0);border:1px solid #c8b07a;border-radius:12px;box-shadow:0 2px 8px rgba(139,105,20,0.18);">
        <tr><td style="padding:12px 16px 6px;text-align:center;">
          <span style="font-size:12px;color:#7a5c1e;font-family:Georgia,serif;letter-spacing:1.5px;">&#127911;&nbsp; 收听语音播报</span>
        </td></tr>
        <tr><td style="padding:4px 16px 6px;text-align:center;">
          <audio controls preload="none" style="width:308px;max-width:100%;display:block;box-sizing:border-box;">
            <source src="${audioUrl}" type="audio/mpeg">
          </audio>
        </td></tr>
        <tr><td style="padding:2px 16px 12px;text-align:center;">
          <a href="${audioUrl}" target="_blank" style="font-size:11px;color:#8b6914;font-family:Georgia,serif;text-decoration:underline;letter-spacing:0.5px;">在浏览器中打开 ↗</a>
        </td></tr>
      </table>
    </td></tr>
    ` : ''}

    <!-- News items -->
    ${newsRows}

    <!-- Page footer -->
    <tr><td class="page-pad" style="padding:8px 48px 24px;text-align:center;">
      <div style="font-size:11px;color:#b8a070;font-family:Georgia,serif;letter-spacing:2px;">
        — 第 ${pageNum} / ${totalPages} 页 —
      </div>
    </td></tr>

    <!-- Bottom edge decoration -->
    <tr><td class="page-pad" style="padding:0 48px 20px;text-align:center;">
      <div style="font-size:11px;color:#b8a070;letter-spacing:4px;font-family:Georgia,serif;">${ornament}</div>
    </td></tr>
  </table>`;
}


/* ── Main HTML renderer ───────────────────────────────────────────────── */
function renderHtml(items, period, verse, cidMap, audioUrl) {
  const label = period === 'morning' ? '早间' : '晚间';
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Hong_Kong' });

  const ITEMS_PER_PAGE = 5;
  const pages = [];
  for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
    pages.push(items.slice(i, i + ITEMS_PER_PAGE));
  }
  const totalPages = pages.length + (verse ? 1 : 0);

  const pagesHtml = pages.map((pageItems, idx) =>
    renderPage(pageItems, idx + 1, totalPages, label, now, cidMap, idx === 0 ? audioUrl : null)
  ).join('');

  // Verse gets its own page
  const versePage = verse ? `
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:660px;margin:0 auto 32px;background:#faf4e8;border:1px solid #c8b07a;border-radius:3px;box-shadow:2px 3px 12px rgba(80,60,20,0.12),inset 0 0 60px rgba(200,180,130,0.15);">
    <tr><td class="page-pad" style="padding:28px 48px 0;text-align:center;">
      <div style="font-size:11px;color:#b8a070;letter-spacing:4px;font-family:Georgia,serif;">═══════════════ ✦ ═══════════════</div>
    </td></tr>
    ${renderVerse(verse)}
    <tr><td class="page-pad" style="padding:8px 48px 24px;text-align:center;">
      <div style="font-size:11px;color:#b8a070;font-family:Georgia,serif;letter-spacing:2px;">— 第 ${totalPages} / ${totalPages} 页 —</div>
    </td></tr>
    <tr><td class="page-pad" style="padding:0 48px 20px;text-align:center;">
      <div style="font-size:11px;color:#b8a070;letter-spacing:4px;font-family:Georgia,serif;">═══════════════ ✦ ═══════════════</div>
    </td></tr>
  </table>` : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @media only screen and (max-width: 520px) {
    body { padding: 8px 4px !important; }
    .page-pad { padding-left: 16px !important; padding-right: 16px !important; }
    .news-cell { padding-left: 16px !important; padding-right: 16px !important; }
    .news-row { display: block !important; }
    .news-img {
      display: block !important;
      width: 100% !important;
      padding: 0 0 12px 0 !important;
    }
    .news-img a { display: block !important; }
    .news-img img {
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      max-height: 200px !important;
    }
    .news-text {
      display: block !important;
      width: 100% !important;
    }
  }
</style>
</head>
<body style="margin:0;padding:24px 16px;background:#e8dcc8;font-family:Georgia,'Times New Roman',serif;">
  <!--[if mso]><style>body{font-family:Georgia,serif!important;}</style><![endif]-->
  ${pagesHtml}
  ${versePage}
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:660px;margin:0 auto;">
    <tr><td style="text-align:center;padding:8px 0 24px;">
      <div style="font-size:11px;color:#a09070;font-family:Georgia,serif;">由 AI 自动生成 · NewsDigest</div>
    </td></tr>
  </table>
</body></html>`;
}


/* ── Send email ───────────────────────────────────────────────────────── */
async function sendDigest(items, period = 'morning', verse = null, audioUrl = null) {
  if (!process.env.SMTP_USER) throw new Error('SMTP_USER not set');
  if (!process.env.SMTP_PASS) throw new Error('SMTP_PASS not set');

  const { getRecipients } = require('./db');
  const dbRecipients = getRecipients().filter(r => r.enabled);
  const toList = dbRecipients.length
    ? dbRecipients.map(r => r.label ? `"${r.label}" <${r.email}>` : r.email)
    : (() => {
        const t = process.env.MAIL_TO;
        if (!t) throw new Error('MAIL_TO not set and no recipients configured');
        return [t];
      })();

  const label     = period === 'morning' ? '早间' : '晚间';
  const dateStr   = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Hong_Kong' });
  const subject   = `NewsDigest ${label}简报 · ${dateStr}`;
  const { attachments, cidMap } = await buildAttachments(items);
  console.log(`[mailer] Embedded ${attachments.length}/${items.filter(i=>i.image).length} images inline`);
  const html      = renderHtml(items, period, verse, cidMap, audioUrl);
  const transport = createTransport();

  let lastInfo;
  for (const to of toList) {
    lastInfo = await transport.sendMail({
      from: `"NewsDigest" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      attachments,
    });
    console.log(`[mailer] Sent to ${to}: ${lastInfo.messageId}`);
  }
  return lastInfo;
}

module.exports = { sendDigest };
