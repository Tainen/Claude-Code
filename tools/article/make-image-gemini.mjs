#!/usr/bin/env node
// Gemini API で記事用のAI画像を生成する（GEMINI_API_KEY が設定されている環境でのみ動作）
// 使い方: node tools/article/make-image-gemini.mjs --prompt "..." --out image.png [--model gemini-2.5-flash-image]
// 失敗時は非0終了。呼び出し側は make-cover.mjs（タイトルカード）にフォールバックすること。
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, [])
);
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('GEMINI_API_KEY が未設定です'); process.exit(2); }
const model = args.model || 'gemini-2.5-flash-image';
const out = args.out || 'image.png';
const basePrompt = args.prompt || 'Japanese small-company recruiting scene';
const prompt = `${basePrompt}. Style: clean editorial illustration, muted dark grey background with a single orange accent, no text, no logos, no readable faces, 16:9, suitable as a blog cover for a Japanese recruiting consultancy.`;

const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } }),
});
if (!res.ok) { console.error(`Gemini API error ${res.status}: ${await res.text()}`); process.exit(1); }
const json = await res.json();
const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
if (!part) { console.error('画像データが返りませんでした: ' + JSON.stringify(json).slice(0, 500)); process.exit(1); }
writeFileSync(out, Buffer.from(part.inlineData.data, 'base64'));
console.log(`wrote ${out}`);
