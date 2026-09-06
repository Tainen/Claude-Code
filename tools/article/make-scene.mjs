#!/usr/bin/env node
// 記事中画像のフォールバック生成（AI画像 API が使えない環境向け）
// ビジネスシーンのフラットイラストを SVG で描き、Playwright で PNG 化する。
// 使い方: node tools/article/make-scene.mjs --scene interview --out No.001_img1.png [--variant light|dark]
// scene: meeting | briefing | interview | event | onboarding | desk
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = req('playwright')); } catch { ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright')); }

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']); return a; }, []));
const scene = args.scene || 'meeting';
const out = args.out || `${scene}.png`;
const variant = args.variant || 'light';

const W = 1600, H = 900;
const C = variant === 'dark'
  ? { bg: '#1f1f1f', wall: '#2a2a2a', floor: '#242424', line: '#3a3a3a', ink: '#e8e6df', mid: '#8a8a82', accent: '#f26f21', paper: '#f5f4ef', wood: '#4a4036', glass: '#33414a' }
  : { bg: '#f5f4ef', wall: '#ebe9e1', floor: '#dcd9cf', line: '#cfcbbf', ink: '#2a2a2a', mid: '#8a8a82', accent: '#f26f21', paper: '#ffffff', wood: '#b79b7a', glass: '#c9d6dc' };
const SKIN = ['#f1c9a5', '#e8b58b', '#d9a172', '#f3d3b5'];
const HAIR = ['#2b2118', '#3d2b1f', '#1e1e1e', '#4a3728', '#6b6b6b'];
const SUIT = ['#2f3542', '#3b3f4a', '#23272f', '#454b57', '#5a6070'];
let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// 人物（正面/横向き/後ろ向き）。x,y は足元中心。s はスケール。pose: stand|sit。face: front|left|right|back
function person({ x, y, s = 1, pose = 'stand', face = 'front', suit, skin, hair, tie = false, glasses = false, arm = 'down', shirt = '#ffffff' }) {
  suit = suit || pick(SUIT); skin = skin || pick(SKIN); hair = hair || pick(HAIR);
  const g = [];
  const headR = 34 * s, torsoH = (pose === 'sit' ? 120 : 150) * s, torsoW = 92 * s;
  const legH = pose === 'sit' ? 60 * s : 110 * s;
  const baseY = y;
  const torsoTop = baseY - legH - torsoH;
  const headCy = torsoTop - headR - 6 * s;
  // 脚
  if (pose === 'stand') {
    g.push(`<rect x="${x - 34 * s}" y="${baseY - legH}" width="30 * s" height="${legH}" fill="${suit}" rx="6"/>`.replace('30 * s', 30 * s));
    g.push(`<rect x="${x + 4 * s}" y="${baseY - legH}" width="${30 * s}" height="${legH}" fill="${suit}" rx="6"/>`);
    g.push(`<rect x="${x - 38 * s}" y="${baseY - 8 * s}" width="${36 * s}" height="${10 * s}" fill="#1a1a1a" rx="4"/>`);
    g.push(`<rect x="${x + 2 * s}" y="${baseY - 8 * s}" width="${36 * s}" height="${10 * s}" fill="#1a1a1a" rx="4"/>`);
  } else {
    // 座り：太もも→膝下
    const dir = face === 'left' ? -1 : 1;
    g.push(`<rect x="${face === 'left' ? x - 70 * s : x - 30 * s}" y="${baseY - legH - 18 * s}" width="${100 * s}" height="${34 * s}" fill="${suit}" rx="10"/>`);
    g.push(`<rect x="${x + dir * 40 * s - 15 * s}" y="${baseY - legH}" width="${30 * s}" height="${legH}" fill="${suit}" rx="6"/>`);
    g.push(`<rect x="${x + dir * 40 * s - 18 * s}" y="${baseY - 8 * s}" width="${36 * s}" height="${10 * s}" fill="#1a1a1a" rx="4"/>`);
  }
  // 胴体（ジャケット）
  g.push(`<path d="M${x - torsoW / 2},${torsoTop + 18 * s} q0,-18 ${18 * s},-18 h${torsoW - 36 * s} q${18 * s},0 ${18 * s},18 v${torsoH - 18 * s} h${-torsoW} z" fill="${suit}"/>`);
  if (face !== 'back') {
    // シャツ＋襟
    g.push(`<path d="M${x - 16 * s},${torsoTop} l${16 * s},${44 * s} l${16 * s},${-44 * s} z" fill="${shirt}"/>`);
    if (tie) g.push(`<path d="M${x - 6 * s},${torsoTop + 10 * s} h${12 * s} l${-4 * s},${52 * s} l${-2 * s},${6 * s} l${-2 * s},${-6 * s} z" fill="${C.accent}"/>`);
  }
  // 腕
  const armY = torsoTop + 12 * s;
  if (arm === 'down') {
    g.push(`<rect x="${x - torsoW / 2 - 14 * s}" y="${armY}" width="${22 * s}" height="${torsoH - 30 * s}" fill="${suit}" rx="10"/>`);
    g.push(`<rect x="${x + torsoW / 2 - 8 * s}" y="${armY}" width="${22 * s}" height="${torsoH - 30 * s}" fill="${suit}" rx="10"/>`);
    g.push(`<circle cx="${x - torsoW / 2 - 3 * s}" cy="${armY + torsoH - 28 * s}" r="${11 * s}" fill="${skin}"/>`);
    g.push(`<circle cx="${x + torsoW / 2 + 3 * s}" cy="${armY + torsoH - 28 * s}" r="${11 * s}" fill="${skin}"/>`);
  } else if (arm === 'table') {
    // 前に出してテーブルに置く
    g.push(`<rect x="${x - torsoW / 2 - 6 * s}" y="${armY + 40 * s}" width="${torsoW + 12 * s}" height="${20 * s}" fill="${suit}" rx="10"/>`);
    g.push(`<circle cx="${x - 30 * s}" cy="${armY + 52 * s}" r="${11 * s}" fill="${skin}"/>`);
    g.push(`<circle cx="${x + 30 * s}" cy="${armY + 52 * s}" r="${11 * s}" fill="${skin}"/>`);
  } else if (arm === 'raise') {
    // 片手を上げる（説明）
    g.push(`<rect x="${x - torsoW / 2 - 14 * s}" y="${armY}" width="${22 * s}" height="${torsoH - 30 * s}" fill="${suit}" rx="10"/>`);
    g.push(`<circle cx="${x - torsoW / 2 - 3 * s}" cy="${armY + torsoH - 28 * s}" r="${11 * s}" fill="${skin}"/>`);
    g.push(`<rect x="${x + torsoW / 2 - 8 * s}" y="${armY - 60 * s}" width="${22 * s}" height="${80 * s}" fill="${suit}" rx="10"/>`);
    g.push(`<circle cx="${x + torsoW / 2 + 3 * s}" cy="${armY - 66 * s}" r="${11 * s}" fill="${skin}"/>`);
  } else if (arm === 'point') {
    g.push(`<rect x="${x - torsoW / 2 - 14 * s}" y="${armY}" width="${22 * s}" height="${torsoH - 30 * s}" fill="${suit}" rx="10"/>`);
    g.push(`<circle cx="${x - torsoW / 2 - 3 * s}" cy="${armY + torsoH - 28 * s}" r="${11 * s}" fill="${skin}"/>`);
    g.push(`<rect x="${x + torsoW / 2 - 8 * s}" y="${armY + 10 * s}" width="${90 * s}" height="${22 * s}" fill="${suit}" rx="10"/>`);
    g.push(`<circle cx="${x + torsoW / 2 + 86 * s}" cy="${armY + 21 * s}" r="${11 * s}" fill="${skin}"/>`);
  }
  // 首・頭
  g.push(`<rect x="${x - 12 * s}" y="${headCy + headR - 6 * s}" width="${24 * s}" height="${16 * s}" fill="${skin}"/>`);
  g.push(`<circle cx="${x}" cy="${headCy}" r="${headR}" fill="${skin}"/>`);
  // 髪
  if (face === 'back') g.push(`<circle cx="${x}" cy="${headCy}" r="${headR}" fill="${hair}"/>`);
  else if (face === 'front') g.push(`<path d="M${x - headR},${headCy - 4 * s} a${headR},${headR} 0 0 1 ${headR * 2},0 v${-2 * s} q${-headR * 0.2},${-headR * 0.9} ${-headR},${-headR * 0.95} q${-headR * 0.8},${headR * 0.05} ${-headR},${headR * 0.95} z" fill="${hair}"/>`);
  else { const d = face === 'left' ? -1 : 1; g.push(`<path d="M${x - headR},${headCy} a${headR},${headR} 0 0 1 ${headR * 2},0 z" fill="${hair}"/>`); g.push(`<rect x="${d > 0 ? x - headR : x}" y="${headCy - 2 * s}" width="${headR}" height="${headR * 0.7}" fill="${hair}" rx="6"/>`); }
  // 目・眼鏡（正面/横のみ）
  if (face === 'front') { g.push(`<circle cx="${x - 12 * s}" cy="${headCy + 6 * s}" r="${3 * s}" fill="${C.ink}"/>`); g.push(`<circle cx="${x + 12 * s}" cy="${headCy + 6 * s}" r="${3 * s}" fill="${C.ink}"/>`); if (glasses) g.push(`<g fill="none" stroke="${C.ink}" stroke-width="${2 * s}"><circle cx="${x - 12 * s}" cy="${headCy + 6 * s}" r="${9 * s}"/><circle cx="${x + 12 * s}" cy="${headCy + 6 * s}" r="${9 * s}"/><path d="M${x - 3 * s},${headCy + 6 * s} h${6 * s}"/></g>`); }
  else if (face !== 'back') { const d = face === 'left' ? -1 : 1; g.push(`<circle cx="${x + d * 16 * s}" cy="${headCy + 6 * s}" r="${3 * s}" fill="${C.ink}"/>`); }
  return g.join('');
}
const table = (x, y, w, h = 18, legs = true) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.wood}" rx="6"/>` + (legs ? `<rect x="${x + 20}" y="${y + h}" width="16" height="110" fill="${C.wood}"/><rect x="${x + w - 36}" y="${y + h}" width="16" height="110" fill="${C.wood}"/>` : '');
const chair = (x, y, s = 1) => `<rect x="${x - 36 * s}" y="${y - 150 * s}" width="${72 * s}" height="${90 * s}" fill="${C.mid}" rx="12"/><rect x="${x - 40 * s}" y="${y - 70 * s}" width="${80 * s}" height="${14 * s}" fill="${C.mid}" rx="6"/><rect x="${x - 6 * s}" y="${y - 56 * s}" width="${12 * s}" height="${48 * s}" fill="${C.mid}"/><rect x="${x - 40 * s}" y="${y - 12 * s}" width="${80 * s}" height="${10 * s}" fill="${C.mid}" rx="5"/>`;
const laptop = (x, y, s = 1) => `<rect x="${x - 40 * s}" y="${y - 50 * s}" width="${80 * s}" height="${50 * s}" fill="#2a2a2a" rx="4"/><rect x="${x - 36 * s}" y="${y - 46 * s}" width="${72 * s}" height="${42 * s}" fill="${C.glass}"/><rect x="${x - 50 * s}" y="${y}" width="${100 * s}" height="${8 * s}" fill="#3a3a3a" rx="3"/>`;
const paper = (x, y, s = 1, rot = 0) => `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x - 30 * s}" y="${y - 40 * s}" width="${60 * s}" height="${80 * s}" fill="${C.paper}" stroke="${C.line}"/><g stroke="${C.line}" stroke-width="${3 * s}"><path d="M${x - 20 * s},${y - 24 * s} h${40 * s}"/><path d="M${x - 20 * s},${y - 10 * s} h${40 * s}"/><path d="M${x - 20 * s},${y + 4 * s} h${28 * s}"/></g></g>`;
const plant = (x, y, s = 1) => `<rect x="${x - 22 * s}" y="${y - 50 * s}" width="${44 * s}" height="${50 * s}" fill="${C.wood}" rx="6"/><ellipse cx="${x}" cy="${y - 80 * s}" rx="${40 * s}" ry="${34 * s}" fill="#5f8f6b"/><ellipse cx="${x - 26 * s}" cy="${y - 60 * s}" rx="${26 * s}" ry="${22 * s}" fill="#4f7d5b"/><ellipse cx="${x + 26 * s}" cy="${y - 62 * s}" rx="${26 * s}" ry="${22 * s}" fill="#6b9c76"/>`;
const board = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.paper}" stroke="${C.line}" stroke-width="6"/><g stroke="${C.mid}" stroke-width="6" stroke-linecap="round" fill="none"><path d="M${x + 40},${y + 50} h${w * 0.55}"/><path d="M${x + 40},${y + 95} h${w * 0.4}"/><path d="M${x + 40},${y + 140} h${w * 0.5}"/></g><rect x="${x + 40}" y="${y + h - 90}" width="${w * 0.3}" height="40" fill="${C.accent}" opacity=".85" rx="4"/>`;
const window_ = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.glass}" stroke="${C.line}" stroke-width="8"/><path d="M${x + w / 2},${y} v${h} M${x},${y + h / 2} h${w}" stroke="${C.line}" stroke-width="8"/>`;
const room = (floorY = 660) => `<rect width="${W}" height="${H}" fill="${C.wall}"/><rect y="${floorY}" width="${W}" height="${H - floorY}" fill="${C.floor}"/><rect y="${floorY - 6}" width="${W}" height="6" fill="${C.line}"/>`;

const scenes = {
  meeting: () => [room(), window_(1180, 120, 300, 260), board(120, 110, 520, 340), plant(1500, 660, 1.1),
    table(520, 520, 640), chair(640, 660), chair(900, 660),
    person({ x: 640, y: 640, s: 1, pose: 'sit', face: 'front', arm: 'table', tie: true, hair: '#6b6b6b', glasses: true }),
    person({ x: 900, y: 640, s: 1, pose: 'sit', face: 'front', arm: 'table', shirt: '#eef2f7' }),
    paper(700, 500, 1, -8), laptop(860, 520, 1),
    person({ x: 380, y: 660, s: 1.05, pose: 'stand', face: 'right', arm: 'point', tie: true })].join(''),
  briefing: () => [room(680), `<rect x="560" y="90" width="520" height="300" fill="${C.glass}" stroke="${C.line}" stroke-width="8"/><g stroke="${C.mid}" stroke-width="8" fill="none" stroke-linecap="round"><path d="M620,160 h300"/><path d="M620,220 h220"/><path d="M620,280 h260"/></g><rect x="620" y="330" width="120" height="30" fill="${C.accent}" rx="4"/>`,
    person({ x: 1200, y: 680, s: 1.05, pose: 'stand', face: 'left', arm: 'raise', tie: true }),
    // 学生（後ろ向き・着席）
    ...[300, 520, 740, 960].map((x, i) => table(x - 90, 700 + (i % 2) * 0, 180, 14, false) + person({ x, y: 860, s: 0.95, pose: 'sit', face: 'back', suit: '#1f232b', hair: HAIR[i % HAIR.length] })),
    plant(90, 680, 1)].join(''),
  interview: () => [room(), window_(1150, 110, 340, 280), plant(120, 660, 1.1),
    table(440, 520, 720), chair(560, 660), chair(760, 660), chair(1040, 660),
    person({ x: 560, y: 640, s: 1, pose: 'sit', face: 'right', arm: 'table', tie: true, hair: '#6b6b6b' }),
    person({ x: 760, y: 640, s: 1, pose: 'sit', face: 'right', arm: 'table', shirt: '#eef2f7', glasses: true }),
    paper(600, 500, 0.9, 6), paper(800, 500, 0.9, -5),
    person({ x: 1040, y: 640, s: 1, pose: 'sit', face: 'left', arm: 'table', suit: '#1f232b', shirt: '#ffffff' })].join(''),
  event: () => [room(690), `<rect x="380" y="110" width="840" height="120" fill="${C.accent}" rx="8"/><rect x="420" y="150" width="360" height="40" fill="${C.paper}" opacity=".9" rx="4"/>`,
    `<rect x="380" y="230" width="840" height="20" fill="${C.line}"/>`, `<rect x="420" y="260" width="200" height="260" fill="${C.paper}" stroke="${C.line}" stroke-width="6"/><g stroke="${C.mid}" stroke-width="6" stroke-linecap="round"><path d="M450,300 h140"/><path d="M450,340 h100"/><path d="M450,380 h120"/></g>`,
    table(640, 540, 560), chair(1120, 690, 1), chair(960, 690, 1),
    person({ x: 760, y: 690, s: 1.05, pose: 'stand', face: 'right', arm: 'point', tie: true }),
    person({ x: 1020, y: 690, s: 1, pose: 'stand', face: 'left', suit: '#1f232b' }),
    person({ x: 1160, y: 690, s: 1, pose: 'stand', face: 'left', suit: '#23272f', hair: '#3d2b1f' }),
    paper(700, 520, 0.9, -6), plant(220, 690, 1.1)].join(''),
  onboarding: () => [room(), window_(140, 120, 320, 260), plant(1480, 660, 1.1), board(1000, 120, 420, 300),
    table(480, 520, 640), chair(620, 660), chair(900, 660),
    person({ x: 620, y: 640, s: 1, pose: 'sit', face: 'right', arm: 'table', tie: true, hair: '#6b6b6b' }),
    person({ x: 900, y: 640, s: 1, pose: 'sit', face: 'left', arm: 'table', suit: '#3b3f4a', shirt: '#eef2f7' }),
    paper(760, 500, 1, 0), laptop(560, 520, 0.9)].join(''),
  desk: () => [room(), window_(1100, 120, 380, 280), `<rect x="180" y="130" width="300" height="220" fill="${C.paper}" stroke="${C.line}" stroke-width="6"/><g fill="${C.line}">${[0,1,2,3,4].map(r=>[0,1,2,3,4,5,6].map(c=>`<rect x="${205+c*38}" y="${180+r*32}" width="26" height="20" rx="3" ${r===2&&c===3?`fill="${C.accent}"`:''}/>`).join('')).join('')}</g>`,
    table(420, 520, 760), chair(760, 660),
    person({ x: 760, y: 640, s: 1, pose: 'sit', face: 'front', arm: 'table', shirt: '#eef2f7', glasses: true }),
    laptop(760, 520, 1.1), paper(560, 500, 0.9, -10), `<rect x="980" y="470" width="26" height="60" fill="#2a2a2a" rx="6"/>`, plant(1480, 660, 1.1)].join(''),
};
if (!scenes[scene]) { console.error(`unknown scene: ${scene}`); process.exit(2); }
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${scenes[scene]()}</svg>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${C.bg}}</style></head><body>${svg}</body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html);
writeFileSync(out, await page.screenshot({ type: 'png' }));
await browser.close();
console.log(`wrote ${out}`);
