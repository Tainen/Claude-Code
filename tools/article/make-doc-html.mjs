#!/usr/bin/env node
// 記事HTML（content/articles/out/No.xxx_article.html）から Google ドキュメント用の HTML を作る。
//  - 冒頭の結論文と、各 H2 直下の第1文を太字（<strong>）にする（すでに <strong> がある段落は触らない）
//  - 【画像：…】行を、公開リポジトリの raw URL を指す <img> に置き換える（Docs 取り込み時に埋め込まれる）
//  - 確認用の装飾（インラインスタイル）：H2 はオレンジの帯、太字はマーカー、表ヘッダーは薄オレンジ背景
//    ※ Studio に貼ると装飾は消え、太字・見出し・リスト・表だけが残る。装飾はレビュー用のプレビュー。
// 使い方: node tools/article/make-doc-html.mjs No.004 [--with-meta] [--no-bold] [--plain] [--out path]
//   --with-meta : 先頭コメントのメタ情報（タイトル・ディスクリプション・FAQ JSON-LD 等）を Doc の冒頭に付ける
//   --no-bold   : 結論文の自動太字をしない
//   --plain     : 装飾（色・マーカー）を付けない
//   --branch    : 画像 URL のブランチ名（既定: 現在のブランチ）
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../content/articles/out');
const args = process.argv.slice(2);
const no = args.find((a) => /^No\.\d{3}$/.test(a));
if (!no) { console.error('使い方: node tools/article/make-doc-html.mjs No.004 [--with-meta] [--no-bold] [--plain] [--out path]'); process.exit(2); }
const withMeta = args.includes('--with-meta');
const noBold = args.includes('--no-bold');
const plain = args.includes('--plain');
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const outPath = opt('--out');
const branch = opt('--branch') || execSync('git rev-parse --abbrev-ref HEAD', { cwd: here }).toString().trim();
const RAW = `https://raw.githubusercontent.com/Tainen/Claude-Code/${branch}/content/articles/out`;

// 配色（Studio 側の指定と同じ。tools/aeo/studio-style-prompt.md 参照）
const C = { band: '#FFF4E8', marker: '#FFD9A8', text: '#333333', head: '#222222', sub: '#6B6B6B', line: '#E6E6E6' };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const src = readFileSync(resolve(OUT, `${no}_article.html`), 'utf8');
const m = src.match(/^\s*<!--([\s\S]*?)-->\s*([\s\S]*)$/);
if (!m) { console.error(`${no}: 先頭のメタ情報コメントが見つかりません`); process.exit(1); }
const metaLines = m[1].trim().split('\n').map((l) => l.trim()).filter(Boolean);
const title = metaLines[0];
let body = m[2].replace(/<!--[\s\S]*?-->\s*/g, '');

// 1) 結論文の太字化：冒頭の第1段落と、各 H2 直下の第1段落の第1文
const boldFirstSentence = (p) => {
  if (/<strong>/.test(p)) return p;
  return p.replace(/^<p>([^<]*?[。！？])/, (all, s) => `<p><strong>${s}</strong>`);
};
if (!noBold) {
  // H2 ごとの区間（冒頭〜最初の H2 も1区間）。区間内にすでに <strong> があれば手動指定を優先して自動太字はしない
  const lines = body.split('\n');
  const sections = [];
  let cur = { start: 0, auto: true };
  for (let i = 0; i < lines.length; i++) {
    if (/^<h2>/.test(lines[i])) {
      sections.push({ ...cur, end: i });
      cur = { start: i + 1, auto: !/<h2>(まとめ|よくある質問)<\/h2>/.test(lines[i]) };
    }
  }
  sections.push({ ...cur, end: lines.length });
  for (const sec of sections) {
    if (!sec.auto) continue;
    const seg = lines.slice(sec.start, sec.end);
    if (seg.some((l) => /<strong>/.test(l))) continue;
    for (let i = sec.start; i < sec.end; i++) {
      const l = lines[i];
      if (/^<h3>/.test(l) || /^<(ul|ol|table)/.test(l)) break;
      if (/^<p>/.test(l) && !/^<p>【画像/.test(l)) { lines[i] = boldFirstSentence(l); break; }
    }
  }
  body = lines.join('\n');
}

// 2) 画像の置き換え
let n = 0;
body = body.replace(/<p>【画像：([^<]*?)<\/p>/g, (all, cap) => {
  n++;
  const capStyle = plain ? '' : ` style="color:${C.sub};font-size:10pt;text-align:center"`;
  return `<img src="${RAW}/${no}_img${n}.png" width="600"><p${capStyle}>【画像${n}：${cap}（ファイル：${no}_img${n}.png）</p>`;
});

// 3) 確認用の装飾
if (!plain) {
  body = body
    .replace(/<strong>([\s\S]*?)<\/strong>/g, `<strong><span style="background-color:${C.marker}">$1</span></strong>`)
    .replace(/<h2>([\s\S]*?)<\/h2>/g, `<h2 style="color:${C.head}"><span style="background-color:${C.band}"><strong>\u3000$1\u3000</strong></span></h2>`)
    .replace(/<h3>([\s\S]*?)<\/h3>/g, `<h3 style="color:${C.head}"><strong>$1</strong></h3>`)
    .replace(/<th>([\s\S]*?)<\/th>/g, `<th style="background-color:${C.band};color:${C.head};font-weight:bold;text-align:left">$1</th>`)
    .replace(/<td>([\s\S]*?)<\/td>/g, `<td style="color:${C.text}">$1</td>`)
    .replace(/<p>(?!【)/g, `<p style="color:${C.text}">`)
    .replace(/<li>/g, `<li style="color:${C.text}">`);
} else {
  body = body.replace(/<h2>([\s\S]*?)<\/h2>/g, '<h2><strong>$1</strong></h2>').replace(/<h3>([\s\S]*?)<\/h3>/g, '<h3><strong>$1</strong></h3>');
}

// 4) 組み立て
const parts = [`<html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>`];
if (withMeta) {
  parts.push('<h2>掲載用メタ情報（この見出しから下の区切り線までは本文に貼らない）</h2>');
  parts.push(`<p>画像：本文中の${n}枚は Git（content/articles/out/${no}_img1〜${n}.png）と同一。Studio にはこの Doc の画像を右クリック保存して入れる</p>`);
  parts.push('<p>装飾について：H2 の帯・太字のマーカー・表ヘッダーの色は確認用。Studio に貼ると消え、太字・見出し・リスト・表だけが残る（見た目は Studio のテンプレート側で設定）</p>');
  for (const l of metaLines.slice(1)) parts.push(`<p>${esc(l)}</p>`);
  parts.push('<hr>');
}
parts.push(body.trim());
parts.push('</body></html>');
const html = parts.join('\n');
if (outPath) { writeFileSync(outPath, html); console.error(`${no}: ${outPath} に書き出し（画像 ${n} 枚、太字 ${(body.match(/<strong>/g) || []).length} 箇所）`); }
else process.stdout.write(html);
