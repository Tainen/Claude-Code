#!/usr/bin/env node
// 記事中のグラフ画像を作る（調査データの記事で、写真の代わりに入れる）。
// 見た目は片岡さんの記事の図（白地・太字の見出し・グレーとオレンジの棒・下に要点と出典）に合わせる。
// 使い方: node tools/article/make-chart.mjs --spec content/articles/out/No.046_charts.json [--only 1,3]
// spec: { "no": "No.046", "charts": [ { type, title, subtitle, takeaway, note, source, unit, max, ... } ] }
//   type "hbar"    : 横棒。items [{label, sub?, value, hl?}]。hl=true の棒をオレンジにする
//   type "line"    : 折れ線。categories [...]、series [{name, values [...], hl?}]（値が null の点は飛ばし、前後を点線でつなぐ）
//   type "groupbar": 横棒の2本組。categories [...]、series [{name, values [...], hl?}]
//   図（数値のない模式図）: type "gap"（会話の時間軸と沈黙）／"cards"（横に並ぶ箱）／"levels"（場面ごとの相対的な大きさ）。各関数の注記を参照
// 出力: content/articles/out/{no}_img{n}.png（2400×1350）
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
const req = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = req('playwright')); } catch { ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright')); }

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']); return a; }, []));
if (!args.spec) { console.error('使い方: node tools/article/make-chart.mjs --spec <json> [--only 1,3]'); process.exit(2); }
const specPath = resolve(args.spec);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const only = args.only ? new Set(String(args.only).split(',').map(Number)) : null;
const outDir = dirname(specPath);

const W = 1200, H = 675;
const C = { ink: '#1a1a1a', sub: '#6b6b6b', grid: '#dddad3', gray: '#b5b1aa', accent: '#e35a1f', axis: '#8a8a82' };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (v, unit) => `${v.toFixed(1)}${unit ?? '%'}`;

function hbar(c) {
  const x0 = 290, x1 = 1020, top = 150, bottom = 490;
  const max = c.max ?? 100;
  const rowH = (bottom - top) / c.items.length;
  const sx = (v) => x0 + (x1 - x0) * (v / max);
  let s = '';
  for (let t = 0; t <= max; t += c.step ?? 10) s += `<line x1="${sx(t)}" y1="${top}" x2="${sx(t)}" y2="${bottom}" stroke="${C.grid}"/><text x="${sx(t)}" y="${bottom + 26}" font-size="14" fill="${C.axis}" text-anchor="middle">${t}${c.unit ?? '%'}</text>`;
  c.items.forEach((it, i) => {
    const cy = top + rowH * (i + 0.5);
    const bh = Math.min(26, rowH * 0.5);
    s += `<text x="${x0 - 16}" y="${cy + (it.sub ? -2 : 6)}" font-size="17" font-weight="bold" fill="${C.ink}" text-anchor="end">${esc(it.label)}</text>`;
    if (it.sub) s += `<text x="${x0 - 16}" y="${cy + 18}" font-size="12" fill="${C.sub}" text-anchor="end">${esc(it.sub)}</text>`;
    s += `<rect x="${x0}" y="${cy - bh / 2}" width="${Math.max(2, sx(it.value) - x0)}" height="${bh}" rx="4" fill="${it.hl ? C.accent : C.gray}"/>`;
    s += `<text x="${sx(it.value) + 12}" y="${cy + 8}" font-size="${it.hl ? 24 : 20}" font-weight="bold" fill="${C.ink}">${fmt(it.value, c.unit)}</text>`;
  });
  s += `<line x1="${x0}" y1="${top}" x2="${x0}" y2="${bottom}" stroke="${C.axis}"/>`;
  return s;
}

function groupbar(c) {
  const x0 = 220, x1 = 1000, top = 160, bottom = 480;
  const max = c.max ?? 100;
  const rowH = (bottom - top) / c.categories.length;
  const sx = (v) => x0 + (x1 - x0) * (v / max);
  let s = '';
  for (let t = 0; t <= max; t += c.step ?? 10) s += `<line x1="${sx(t)}" y1="${top}" x2="${sx(t)}" y2="${bottom}" stroke="${C.grid}"/><text x="${sx(t)}" y="${bottom + 26}" font-size="14" fill="${C.axis}" text-anchor="middle">${t}${c.unit ?? '%'}</text>`;
  const n = c.series.length, bh = Math.min(22, (rowH * 0.7) / n);
  c.categories.forEach((cat, i) => {
    const cy = top + rowH * (i + 0.5);
    s += `<text x="${x0 - 16}" y="${cy + 6}" font-size="18" font-weight="bold" fill="${C.ink}" text-anchor="end">${esc(cat)}</text>`;
    c.series.forEach((se, j) => {
      const y = cy - (n * bh + (n - 1) * 4) / 2 + j * (bh + 4);
      const v = se.values[i];
      s += `<rect x="${x0}" y="${y}" width="${Math.max(2, sx(v) - x0)}" height="${bh}" rx="3" fill="${se.hl ? C.accent : C.gray}"/>`;
      s += `<text x="${sx(v) + 10}" y="${y + bh - 5}" font-size="16" font-weight="bold" fill="${C.ink}">${fmt(v, c.unit)}</text>`;
    });
  });
  s += `<line x1="${x0}" y1="${top}" x2="${x0}" y2="${bottom}" stroke="${C.axis}"/>`;
  s += legend(c.series, 640, 128);
  return s;
}

// 凡例は右寄せ。文字数から幅を見積もり、はみ出さないように並べる
function legend(series, _x, y) {
  const widths = series.map((se) => 24 + 15 * [...se.name].length);
  const total = widths.reduce((a, b) => a + b, 0) + 36 * (series.length - 1);
  let lx = W - 60 - total;
  let s = '';
  series.forEach((se, j) => {
    s += `<rect x="${lx}" y="${y - 12}" width="16" height="16" rx="3" fill="${se.hl ? C.accent : C.gray}"/><text x="${lx + 24}" y="${y + 2}" font-size="15" fill="${C.ink}">${esc(se.name)}</text>`;
    lx += widths[j] + 36;
  });
  return s;
}

function line(c) {
  const x0 = 120, x1 = 1080, top = 160, bottom = 470;
  const min = c.min ?? 0, max = c.max ?? 100;
  const sy = (v) => bottom - (bottom - top) * ((v - min) / (max - min));
  const k = c.categories.length;
  const sx = (i) => x0 + 40 + (x1 - x0 - 80) * (k === 1 ? 0.5 : i / (k - 1));
  let s = '';
  for (let t = min; t <= max; t += c.step ?? 10) s += `<line x1="${x0}" y1="${sy(t)}" x2="${x1}" y2="${sy(t)}" stroke="${C.grid}"/><text x="${x0 - 12}" y="${sy(t) + 5}" font-size="14" fill="${C.axis}" text-anchor="end">${t}${c.unit ?? '%'}</text>`;
  c.categories.forEach((cat, i) => { s += `<text x="${sx(i)}" y="${bottom + 30}" font-size="16" fill="${C.ink}" text-anchor="middle">${esc(cat)}</text>`; });
  c.series.forEach((se) => {
    const col = se.hl ? C.accent : C.gray;
    const pts = se.values.map((v, i) => (v == null ? null : [sx(i), sy(v), v]));
    let prev = null;
    pts.forEach((p, i) => {
      if (!p) return;
      if (prev) {
        const gap = i - prev.i > 1;
        s += `<line x1="${prev.p[0]}" y1="${prev.p[1]}" x2="${p[0]}" y2="${p[1]}" stroke="${col}" stroke-width="${se.hl ? 5 : 4}" ${gap ? 'stroke-dasharray="6 7"' : ''}/>`;
      }
      prev = { p, i };
    });
    pts.forEach((p) => {
      if (!p) return;
      s += `<circle cx="${p[0]}" cy="${p[1]}" r="${se.hl ? 8 : 7}" fill="#fff" stroke="${col}" stroke-width="4"/>`;
      const dy = se.labelBelow ? 30 : -16;
      s += `<text x="${p[0]}" y="${p[1] + dy}" font-size="${se.hl ? 18 : 16}" font-weight="bold" fill="${se.hl ? C.accent : C.ink}" text-anchor="middle">${fmt(p[2], c.unit)}</text>`;
    });
  });
  s += legend(c.series, 640, 128);
  return s;
}

// ---- 図（数値のない模式図）。研究や運用を説明する記事で、写真の代わりに入れる ----

// gap: 会話の時間軸。rows [{name, segs:[[start,end],...]}]、gap [start,end]、gapLabel、music {name, label}
function gap(c) {
  const x0 = 200, x1 = 1110, top = 160;
  const sx = (t) => x0 + (x1 - x0) * (t / c.seconds);
  const rowH = 76;
  let s = '';
  const gy0 = top - 8, gy1 = top + rowH * c.rows.length + 4;
  s += `<rect x="${sx(c.gap[0])}" y="${gy0}" width="${sx(c.gap[1]) - sx(c.gap[0])}" height="${gy1 - gy0}" fill="#fdeee6"/>`;
  s += `<line x1="${sx(c.gap[0])}" y1="${gy0}" x2="${sx(c.gap[0])}" y2="${gy1}" stroke="${C.accent}" stroke-width="2" stroke-dasharray="6 6"/>`;
  s += `<line x1="${sx(c.gap[1])}" y1="${gy0}" x2="${sx(c.gap[1])}" y2="${gy1}" stroke="${C.accent}" stroke-width="2" stroke-dasharray="6 6"/>`;
  s += `<text x="${(sx(c.gap[0]) + sx(c.gap[1])) / 2}" y="${top + (rowH * c.rows.length) / 2 + 8}" font-size="24" font-weight="bold" fill="${C.accent}" text-anchor="middle">${esc(c.gapLabel)}</text>`;
  c.rows.forEach((r, i) => {
    const cy = top + rowH * (i + 0.5);
    s += `<text x="${x0 - 20}" y="${cy + 6}" font-size="18" font-weight="bold" fill="${C.ink}" text-anchor="end">${esc(r.name)}</text>`;
    s += `<line x1="${x0}" y1="${cy}" x2="${x1}" y2="${cy}" stroke="${C.grid}"/>`;
    r.segs.forEach(([a, b]) => {
      s += `<rect x="${sx(a)}" y="${cy - 17}" width="${sx(b) - sx(a)}" height="34" rx="17" fill="${C.gray}"/>`;
      s += `<text x="${(sx(a) + sx(b)) / 2}" y="${cy + 6}" font-size="16" fill="#fff" font-weight="bold" text-anchor="middle">話す</text>`;
    });
  });
  const my = top + rowH * c.rows.length + 44;
  s += `<text x="${x0 - 20}" y="${my + 24}" font-size="18" font-weight="bold" fill="${C.accent}" text-anchor="end">${esc(c.music.name)}</text>`;
  s += `<rect x="${x0}" y="${my}" width="${x1 - x0}" height="40" rx="8" fill="${C.accent}" opacity="0.85"/>`;
  s += `<text x="${(x0 + x1) / 2}" y="${my + 27}" font-size="18" font-weight="bold" fill="#fff" text-anchor="middle">${esc(c.music.label)}</text>`;
  return s;
}

// cards: 横に並ぶ箱。cards [{head, main, sub:[行...], hl?}]
function cards(c) {
  const n = c.cards.length, gapW = 28, x0 = 60, x1 = W - 60, top = 150, bottom = 470;
  const w = (x1 - x0 - gapW * (n - 1)) / n;
  let s = '';
  c.cards.forEach((k, i) => {
    const x = x0 + i * (w + gapW), col = k.hl ? C.accent : C.gray;
    s += `<rect x="${x}" y="${top}" width="${w}" height="${bottom - top}" rx="12" fill="#fff" stroke="${col}" stroke-width="${k.hl ? 4 : 2}"/>`;
    s += `<rect x="${x}" y="${top}" width="${w}" height="64" rx="12" fill="${col}"/><rect x="${x}" y="${top + 40}" width="${w}" height="24" fill="${col}"/>`;
    s += `<text x="${x + w / 2}" y="${top + 41}" font-size="20" font-weight="bold" fill="#fff" text-anchor="middle">${esc(k.head)}</text>`;
    s += `<text x="${x + w / 2}" y="${top + 150}" font-size="34" font-weight="bold" fill="${k.hl ? C.accent : C.ink}" text-anchor="middle">${esc(k.main)}</text>`;
    (k.sub || []).forEach((t, j) => { s += `<text x="${x + w / 2}" y="${top + 222 + j * 32}" font-size="18" fill="${C.ink}" text-anchor="middle">${esc(t)}</text>`; });
  });
  return s;
}

// levels: 場面ごとの相対的な大きさ（数値なし）。items [{label, level, tag, ramp?, hl?}]、max、limit {level, label}
function levels(c) {
  const x0 = 140, x1 = 1110, top = 150, bottom = 470, max = c.max ?? 5;
  const sy = (v) => bottom - (bottom - top) * (v / max);
  const n = c.items.length, w = (x1 - x0) / n;
  let s = '';
  s += `<text x="${x0 - 30}" y="${(top + bottom) / 2}" font-size="16" fill="${C.sub}" text-anchor="middle" transform="rotate(-90 ${x0 - 30} ${(top + bottom) / 2})">音の大きさ（大きいほど上）</text>`;
  c.items.forEach((it, i) => {
    const x = x0 + i * w + 6, ww = w - 12, col = it.hl ? C.accent : C.gray;
    if (it.ramp) {
      const prev = c.items[i - 1]?.level ?? it.level;
      s += `<polygon points="${x},${bottom} ${x},${sy(prev)} ${x + ww},${sy(it.level)} ${x + ww},${bottom}" fill="${col}"/>`;
    } else {
      s += `<rect x="${x}" y="${sy(it.level)}" width="${ww}" height="${bottom - sy(it.level)}" rx="4" fill="${col}"/>`;
    }
    s += `<text x="${x + ww / 2}" y="${sy(it.level) - 14}" font-size="19" font-weight="bold" fill="${it.hl ? C.accent : C.ink}" text-anchor="middle">${esc(it.tag)}</text>`;
    String(it.label).split('\n').forEach((t, j) => { s += `<text x="${x + ww / 2}" y="${bottom + 28 + j * 22}" font-size="17" fill="${C.ink}" text-anchor="middle">${esc(t)}</text>`; });
  });
  s += `<line x1="${x0}" y1="${bottom}" x2="${x1}" y2="${bottom}" stroke="${C.axis}"/>`;
  if (c.limit) {
    s += `<line x1="${x0}" y1="${sy(c.limit.level)}" x2="${x1}" y2="${sy(c.limit.level)}" stroke="${C.accent}" stroke-width="2" stroke-dasharray="8 6"/>`;
    s += `<text x="${x1}" y="${sy(c.limit.level) - 10}" font-size="16" font-weight="bold" fill="${C.accent}" text-anchor="end">${esc(c.limit.label)}</text>`;
  }
  return s;
}

function page(c) {
  const body = { hbar, groupbar, gap, cards, levels }[c.type]?.(c) ?? line(c);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="IPAPGothic, IPAGothic, sans-serif">
<rect width="${W}" height="${H}" fill="#ffffff"/>
<text x="60" y="66" font-size="32" font-weight="bold" fill="${C.ink}">${esc(c.title)}</text>
<text x="60" y="102" font-size="17" fill="${C.sub}">${esc(c.subtitle)}</text>
${body}
<text x="60" y="${H - 108}" font-size="19" font-weight="bold" fill="${C.ink}">${esc(c.takeaway)}</text>
<text x="60" y="${H - 78}" font-size="15" fill="${C.sub}">${esc(c.note)}</text>
<text x="60" y="${H - 30}" font-size="12" fill="${C.axis}">${esc(c.source)}</text>
</svg>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}</style></head><body>${svg}</body></html>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }).catch(() => chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }));
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const pg = await ctx.newPage();
for (const [i, c] of spec.charts.entries()) {
  if (only && !only.has(i + 1)) continue;
  await pg.setContent(page(c));
  const out = resolve(outDir, `${spec.no}_img${i + 1}.png`);
  await pg.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });
  console.log(`wrote ${out}`);
}
await browser.close();
