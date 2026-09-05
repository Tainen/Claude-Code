#!/usr/bin/env node
// VOCO お役立ち記事 カバー画像生成（AI画像生成が使えない環境でも動く、ブランド準拠のタイトルカード）
// 使い方: node tools/article/make-cover.mjs --title "記事タイトル" --category "採用イベント" --out cover.png [--variant dark|light]
// 出力: 1200x630 PNG（OGP / 記事サムネイル共用）
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
// playwright はプロジェクト内 or グローバル(/opt/node22)のどちらからでも読めるようにする
const req = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = req('playwright')); }
catch { ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright')); }

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, [])
);
const title = args.title || 'タイトル未設定';
const category = args.category || 'お役立ち記事';
const out = args.out || 'cover.png';
const variant = args.variant || 'dark';
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ブランド: ダークグレー基調 + 差し色オレンジ（HP/ルールブック準拠）
const palette = variant === 'light'
  ? { bg: '#f5f4ef', fg: '#1a1a1a', sub: '#666660', accent: '#f26f21', grid: 'rgba(0,0,0,0.05)' }
  : { bg: '#1c1c1c', fg: '#ffffff', sub: '#b5b5ad', accent: '#f26f21', grid: 'rgba(255,255,255,0.06)' };

const fontSize = title.length <= 22 ? 64 : title.length <= 34 ? 54 : title.length <= 48 ? 46 : 40;

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden}
  body{background:${palette.bg};font-family:"IPAPGothic","IPAGothic","Noto Sans CJK JP","Hiragino Sans","Yu Gothic",sans-serif;color:${palette.fg};position:relative}
  .grid{position:absolute;inset:0;background-image:linear-gradient(${palette.grid} 1px,transparent 1px),linear-gradient(90deg,${palette.grid} 1px,transparent 1px);background-size:60px 60px}
  .oct{position:absolute;right:-140px;top:-140px;width:560px;height:560px;background:${palette.accent};opacity:.12;clip-path:polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)}
  .bar{position:absolute;left:0;top:0;bottom:0;width:14px;background:${palette.accent}}
  .wrap{position:absolute;left:84px;right:84px;top:76px;bottom:76px;display:flex;flex-direction:column;justify-content:space-between}
  .cat{display:inline-block;align-self:flex-start;border:2px solid ${palette.accent};color:${palette.accent};font-size:24px;font-weight:700;letter-spacing:.12em;padding:8px 18px}
  h1{margin:0;font-size:${fontSize}px;line-height:1.35;font-weight:700;letter-spacing:.02em;word-break:auto-phrase;overflow-wrap:anywhere}
  .foot{display:flex;justify-content:space-between;align-items:flex-end}
  .brand{font-size:30px;font-weight:700;letter-spacing:.25em}
  .brand span{color:${palette.accent}}
  .tag{font-size:22px;color:${palette.sub};letter-spacing:.08em}
</style></head><body>
  <div class="grid"></div><div class="oct"></div><div class="bar"></div>
  <div class="wrap">
    <div class="cat">${esc(category)}</div>
    <h1>${esc(title)}</h1>
    <div class="foot"><div class="brand">VO<span>C</span>O</div><div class="tag">採用のプロが、現場に入ります。｜ voco.co.jp</div></div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
const png = await page.screenshot({ type: 'png' });
await browser.close();
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
