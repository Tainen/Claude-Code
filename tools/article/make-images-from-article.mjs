#!/usr/bin/env node
// 記事HTMLの「【画像：シーン名 scene】キャプション」行を読み、記事中画像を一括生成する。
// GEMINI_API_KEY があれば make-image-gemini.mjs（写実）、無ければ make-scene.mjs（フラットイラスト）。
// 使い方: node tools/article/make-images-from-article.mjs No.004 [No.005 ...] [--only 1,3]   ※ --force で既存PNGも上書き
// 記事先頭コメントに「画像の場面指示（英語）：1枚目の英文／2枚目の英文／3枚目の英文」があれば、各画像の --detail として渡す（記事の内容に沿った場面にするため）。
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../content/articles/out');
const args = process.argv.slice(2);
const force = args.includes('--force');
const nos = args.filter((a) => /^No\.\d{3}$/.test(a));
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? new Set(String(args[onlyIdx + 1] || '').split(',').map((n) => Number(n))) : null;
if (!nos.length) { console.error('使い方: node tools/article/make-images-from-article.mjs No.004 [No.005 ...] [--force]'); process.exit(2); }
const useGemini = !!process.env.GEMINI_API_KEY;
console.log(useGemini ? '生成方式: Gemini（写実）' : '生成方式: フラットイラスト（GEMINI_API_KEY 未設定）');

let failed = 0;
for (const no of nos) {
  const file = resolve(OUT, `${no}_article.html`);
  if (!existsSync(file)) { console.error(`${no}: ${file} がありません`); failed++; continue; }
  const raw = readFileSync(file, 'utf8');
  const detailLine = (raw.match(/画像の場面指示（英語）：([^\n]*)/) || [])[1];
  const details = detailLine ? detailLine.split('／').map((d) => d.trim()) : [];
  const html = raw.replace(/<!--[\s\S]*?-->/g, '');
  const marks = [...html.matchAll(/<p>【画像：([^】]*?)\s+([a-z]+)】([^<]*)<\/p>/g)];
  if (!marks.length) { console.error(`${no}: 【画像：…】の行が見つかりません`); failed++; continue; }
  marks.forEach((m, i) => {
    const scene = m[2], caption = m[3].trim();
    if (only && !only.has(i + 1)) return;
    const out = resolve(OUT, `${no}_img${i + 1}.png`);
    const detail = details[i];
    if (existsSync(out) && !force && !useGemini) { console.log(`${no} img${i + 1}: 既存を維持（上書きは --force）`); return; }
    let r;
    if (useGemini) {
      r = spawnSync('node', [resolve(here, 'make-image-gemini.mjs'), '--scene', scene, '--caption', caption, '--out', out, ...(detail ? ['--detail', detail] : [])], { stdio: 'inherit' });
      if (r.status !== 0) {
        console.error(`${no} img${i + 1}: Gemini 失敗 → フラットイラストで代替`);
        r = spawnSync('node', [resolve(here, 'make-scene.mjs'), '--scene', scene, '--out', out], { stdio: 'inherit' });
      }
    } else {
      r = spawnSync('node', [resolve(here, 'make-scene.mjs'), '--scene', scene, '--out', out], { stdio: 'inherit' });
    }
    if (r.status !== 0) failed++;
    else console.log(`${no} img${i + 1}: ${scene} … ${caption}`);
  });
}
process.exit(failed ? 1 : 0);
