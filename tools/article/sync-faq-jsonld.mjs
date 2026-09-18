#!/usr/bin/env node
// 本文「よくある質問」の H3/P を正として、先頭コメント内の FAQPage JSON-LD を作り直す。
// 使い方: node tools/article/sync-faq-jsonld.mjs No.001 [No.002 ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../content/articles/out');
const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
for (const no of process.argv.slice(2).filter((a) => /^No\.\d{3}$/.test(a))) {
  const p = resolve(OUT, `${no}_article.html`);
  const src = readFileSync(p, 'utf8');
  const faq = src.split(/<h2>よくある質問<\/h2>/)[1];
  if (!faq) { console.log(`${no}: FAQ なし（スキップ）`); continue; }
  const qa = [...faq.matchAll(/<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map((m) => [strip(m[1]), strip(m[2])]);
  if (!qa.length) { console.log(`${no}: FAQ の質問が見つからない`); continue; }
  const lines = ['{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[',
    ...qa.map(([q, a], i) => JSON.stringify({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }) + (i < qa.length - 1 ? ',' : ']}'))];
  const re = /(FAQPage JSON-LD：\n)\{"@context"[\s\S]*?\]\}\n/;
  if (!re.test(src)) { console.log(`${no}: メタに JSON-LD が無い`); continue; }
  const next = src.replace(re, `$1${lines.join('\n')}\n`);
  if (next !== src) { writeFileSync(p, next); console.log(`${no}: JSON-LD を本文 FAQ に同期（${qa.length} 問）`); }
  else console.log(`${no}: 変更なし`);
}
