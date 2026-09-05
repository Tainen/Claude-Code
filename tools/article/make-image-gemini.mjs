#!/usr/bin/env node
// 記事中画像を Gemini API で生成する（GEMINI_API_KEY が設定されている環境でのみ動作）
// 使い方: node tools/article/make-image-gemini.mjs --scene interview --caption "..." --out No.001_img1.png [--model gemini-2.5-flash-image]
// scene: meeting | briefing | interview | event | onboarding | desk
// 失敗時は非0終了。呼び出し側はプレースホルダー（【画像：…】）を残して報告すること。
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, [])
);
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('GEMINI_API_KEY が未設定です'); process.exit(2); }

const SCENES = {
  meeting: 'a small Japanese company meeting room, a company president in his 50s and two staff members discussing a hiring plan at a table with printed documents and a laptop',
  briefing: 'a Japanese company information session for university students, a recruiter in a suit presenting to five or six students seated at desks in a small seminar room',
  interview: 'a first-round job interview at a Japanese small company, two interviewers in business attire facing one university student across a table in a bright meeting room',
  event: 'a booth at a Japanese joint company briefing (job fair) in a convention hall, a recruiter standing and speaking with two students in dark suits, other booths blurred behind',
  onboarding: 'a Japanese company office, a manager warmly talking with a newly hired young employee at a desk, welcoming atmosphere',
  desk: 'a Japanese office worker in charge of recruiting, working at a desk with a calendar, a phone and a laptop, organizing interview schedules',
};
const scene = SCENES[args.scene] || SCENES.meeting;
const caption = args.caption || '';
const model = args.model || 'gemini-2.5-flash-image';
const out = args.out || 'image.png';

const prompt = `Photorealistic editorial photograph for a Japanese recruiting consultancy blog. Scene: ${scene}. ${caption ? 'Context: ' + caption + '.' : ''} Natural window light, realistic Japanese business people in their 20s to 50s, candid working moment, shallow depth of field, 16:9 landscape. Rules: no text, no logos, no signage, no watermark, do not depict any real or famous person, clean modern office aesthetic with muted colors and one subtle orange accent (a folder, a lanyard or a chair).`;

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
