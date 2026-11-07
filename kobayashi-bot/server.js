// 小林bot サーバー
// 社員が成果物（企画書・提案資料・商談準備・HP案など）を投げると、
// 代表・小林さんが言いそうな指摘を先回りで返す。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { buildSystemPrompt, MODES } = require('./lib/prompt');

const PORT = Number(process.env.PORT) || 3100;
const MODEL = process.env.KOBAYASHI_BOT_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.KOBAYASHI_BOT_EFFORT || 'high';
const PASSWORD = process.env.BOT_PASSWORD || '';
const MAX_UPLOAD_MB = 20;

const client = new Anthropic();
const systemText = buildSystemPrompt();

const app = express();
app.use(express.json({ limit: `${MAX_UPLOAD_MB * 1.4}mb` }));
app.use(express.static(path.join(__dirname, 'public')));

function checkPassword(req, res, next) {
  if (!PASSWORD) return next();
  const given = String(req.get('x-bot-password') || '');
  const a = Buffer.from(given);
  const b = Buffer.from(PASSWORD);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  return res.status(401).json({ error: 'パスワードが違います' });
}

app.get('/api/config', (_req, res) => {
  res.json({
    passwordRequired: Boolean(PASSWORD),
    modes: Object.entries(MODES).map(([id, m]) => ({ id, label: m.label, hint: m.hint })),
  });
});

const ALLOWED_MEDIA = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']);

// クライアントから来た会話を API 用の messages に変換（不正な形はここで落とす）
function toApiMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('messages が空です');
  if (raw.length > 60) throw new Error('会話が長すぎます。新しい会話を始めてください');
  return raw.map((m, i) => {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    if (i === 0 && role !== 'user') throw new Error('最初のメッセージは user である必要があります');
    const content = [];
    for (const f of role === 'user' && Array.isArray(m.files) ? m.files : []) {
      if (typeof f?.data !== 'string') continue;
      if (f.kind === 'text') {
        content.push({ type: 'text', text: `【添付: ${f.name || 'file'}】\n${f.data}` });
      } else if (ALLOWED_MEDIA.has(f.mediaType)) {
        const source = { type: 'base64', media_type: f.mediaType, data: f.data };
        content.push(f.mediaType === 'application/pdf'
          ? { type: 'document', source, title: f.name || 'document.pdf' }
          : { type: 'image', source });
      }
    }
    const text = typeof m.text === 'string' ? m.text : '';
    if (text.trim()) content.push({ type: 'text', text });
    if (content.length === 0) content.push({ type: 'text', text: '（添付のみ）' });
    return { role, content };
  });
}

app.post('/api/chat', checkPassword, async (req, res) => {
  let messages;
  try {
    messages = toApiMessages(req.body?.messages);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const mode = MODES[req.body?.mode] ? req.body.mode : 'review';

  // モード指示は会話の最後に system メッセージとして差し込む（キャッシュ済みの system を壊さない）
  messages.push({ role: 'system', content: MODES[mode].instruction });

  res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const controller = new AbortController();
  res.on('close', () => controller.abort());

  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: EFFORT },
      system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral', ttl: '1h' } }],
      messages,
    }, { signal: controller.signal });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        send('delta', { text: event.delta.text });
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      send('error', { error: 'この内容には回答できませんでした。表現を変えて再度お試しください。' });
    } else {
      if (final.stop_reason === 'max_tokens') send('delta', { text: '\n\n（長すぎて途中で切れました。続きは「続けて」と送ってください）' });
      send('done', { usage: final.usage });
    }
  } catch (e) {
    if (!controller.signal.aborted) {
      console.error(e);
      let msg = 'エラーが発生しました';
      if (e instanceof Anthropic.AuthenticationError) msg = 'APIキーが無効です（ANTHROPIC_API_KEY を確認）';
      else if (e instanceof Anthropic.RateLimitError) msg = '混み合っています。少し待って再送してください';
      else if (e instanceof Anthropic.BadRequestError) msg = `リクエストエラー: ${e.message}`;
      else if (e instanceof Anthropic.APIError) msg = `APIエラー(${e.status})`;
      send('error', { error: msg });
    }
  } finally {
    res.end();
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`小林bot: http://localhost:${PORT}  (model=${MODEL}, system prompt ${systemText.length.toLocaleString()} 文字)`);
  });
}

module.exports = { app, toApiMessages };
