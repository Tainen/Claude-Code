#!/usr/bin/env node
// 記事中のグラフ画像を作る（調査データの記事で、写真の代わりに入れる）。
// 見た目は片岡さんの記事の図（白地・太字の見出し・グレーとオレンジの棒・下に要点と出典）に合わせる。
// 使い方: node tools/article/make-chart.mjs --spec content/articles/out/No.046_charts.json [--only 1,3]
// spec: { "no": "No.046", "charts": [ { type, title, subtitle, takeaway, note, source, unit, max, ... } ] }
//   type "hbar"    : 横棒。items [{label, sub?, value, hl?}]。hl=true の棒をオレンジにする
//   type "line"    : 折れ線。categories [...]、series [{name, values [...], hl?}]（値が null の点は飛ばし、前後を点線でつなぐ）
//   type "groupbar": 横棒の2本組。categories [...]、series [{name, values [...], hl?}]
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

function page(c) {
  const body = c.type === 'hbar' ? hbar(c) : c.type === 'groupbar' ? groupbar(c) : line(c);
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
