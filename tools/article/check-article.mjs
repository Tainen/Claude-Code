#!/usr/bin/env node
// お役立ち記事 出稿前チェック（機械的に検算できる項目だけ）
// 使い方: node tools/article/check-article.mjs <article.html> [--target 2500] [--tolerance 0.10]
// 終了コード: 0 = 合格, 1 = NG あり（NG 行を出力）
import { readFileSync } from 'node:fs';

const [file, ...rest] = process.argv.slice(2);
if (!file) { console.error('usage: check-article.mjs <article.html> [--target N] [--tolerance 0.1]'); process.exit(2); }
const opt = Object.fromEntries(rest.reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1]]); return a; }, []));
const target = Number(opt.target || 2500);
const tol = Number(opt.tolerance || 0.10);

const html = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const text = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
const blocks = [...html.matchAll(/<(h1|h2|h3|p|li)[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => ({ tag: m[1], text: text(m[2]) }));

const ng = [];
const warn = [];

// 1. 文字数（本文のみ。空白・改行を除く）
const body = blocks.filter((b) => b.tag !== 'h1').map((b) => b.text).join('');
const chars = body.replace(/\s/g, '').length;
const lo = Math.round(target * (1 - tol)), hi = Math.round(target * (1 + tol));
if (chars < lo || chars > hi) ng.push(`文字数 ${chars} 字が想定 ${target}±${Math.round(tol * 100)}%（${lo}〜${hi}）の範囲外`);

// 2. H1 禁止（Studio 側の記事タイトルが H1 になる）
if (blocks.some((b) => b.tag === 'h1')) ng.push('本文に <h1> がある（タイトルは Studio 側で H1 になるので本文には入れない）');

// 3. H2 本数
const h2 = blocks.filter((b) => b.tag === 'h2');
if (h2.length < 3 || h2.length > 7) ng.push(`H2 が ${h2.length} 本（3〜7 本にする。まとめ含む）`);

// 4. 段落の長さ（150字超は NG、140字超は注意）
for (const b of blocks.filter((b) => b.tag === 'p')) {
  const n = b.text.replace(/\s/g, '').length;
  if (n > 150) ng.push(`段落が ${n} 字（150字以内に分割）: 「${b.text.slice(0, 30)}…」`);
  else if (n > 140) warn.push(`段落が ${n} 字（できれば 140 字以内）: 「${b.text.slice(0, 30)}…」`);
}

// 5. 相対時制の禁止語
const relTime = ['今年', '来年', '昨年', '去年', '今の時期', '最近', '現在', '今後', '今シーズン', '直近', '先月', '来月', '今月', '足元'];
for (const w of relTime) if (body.includes(w)) ng.push(`相対時制の語「${w}」が本文にある（卒業年次からの相対表現に置き換える）`);
if (/20\d\d年/.test(body)) warn.push('西暦年が本文にある（記事は数年残る。卒業年次相対で書けないか確認）');

// 6. 根拠のない最強断定・盛り表現
const strong = ['ほぼ例外なく', '必ず成功', '絶対に', '100%', '誰でも', '間違いなく', '劇的に', '圧倒的'];
for (const w of strong) if (body.includes(w)) ng.push(`強すぎる断定「${w}」（「私たちが見てきた範囲では」など射程を示す表現に）`);

// 7. Studio 貼り付け事故の元
if (/[［］]/.test(body)) ng.push('擬似ボタン「［ ］」がある（CTA はボタンコンポーネントで。本文には入れない）');
if (/　/.test(body)) ng.push('全角スペースがある（Studio で意図しない余白になる）');
if (/^#+\s/m.test(text(html))) ng.push('Markdown の見出し記法（#）が本文にある');
if (/\*\*/.test(body)) ng.push('Markdown の強調記法（**）が本文にある');

// 8. 列挙の明示（「N つ」と言ったら ①②③ か <li> で数える）
const enumSent = body.match(/この[3-5]つ|[3-5]つ(の|は|を)/g);
if (enumSent && !/[①②③④⑤]/.test(body) && blocks.filter((b) => b.tag === 'li').length === 0) warn.push('「N つ」と列挙しているが ①②③ も箇条書きも無い');

// 9. 造語・数式の初出定義（接触単価など）
if (body.includes('接触単価') && !/[÷\/]/.test(body)) ng.push('「接触単価」を使っているが式（÷）が本文にない（初出で完全な式を書く）');

// 10. まとめの存在と回収
const summaryIdx = h2.findIndex((b) => /まとめ/.test(b.text));
if (summaryIdx === -1) ng.push('「まとめ」の H2 がない');
else {
  const after = html.split(/<h2[^>]*>[^<]*まとめ[^<]*<\/h2>/)[1] || '';
  const items = [...after.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].length;
  if (items < 3) ng.push('まとめが箇条書き（<ul><li>）になっていない、または 3 項目未満');
  if (items < h2.length - 1) warn.push(`まとめ ${items} 項目 < 本文の H2 ${h2.length - 1} 本。回収漏れの節がないか確認`);
}

// 11. 初出の補足（読者に 50 代の社長を含む）
const jargon = { 'ナビサイト': /ナビサイト（/, 'RPO': /RPO（/, 'ペルソナ': /ペルソナ（/, 'オープンカンパニー': /オープンカンパニー（/, 'ダイレクトリクルーティング': /ダイレクトリクルーティング（/ };
for (const [w, re] of Object.entries(jargon)) if (body.includes(w) && !re.test(body)) warn.push(`「${w}」に初出の括弧補足がない`);

// 12. 画像プレースホルダー（記事中画像 2〜3 枚）
const imgs = (html.match(/【画像[:：]/g) || []).length + (html.match(/<img /g) || []).length;
if (imgs < 2) warn.push(`記事中画像の指定が ${imgs} 枚（H2 の区切りに 2〜3 枚入れる）`);

console.log(`文字数: ${chars} 字（想定 ${target}）／H2: ${h2.length} 本／段落最長: ${Math.max(...blocks.filter((b) => b.tag === 'p').map((b) => b.text.replace(/\s/g, '').length))} 字／画像指定: ${imgs} 枚`);
for (const w of warn) console.log(`注意: ${w}`);
for (const n of ng) console.log(`NG: ${n}`);
console.log(ng.length ? `結果: NG ${ng.length} 件` : '結果: 合格');
process.exit(ng.length ? 1 : 0);
