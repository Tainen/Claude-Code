// サーバーを立てずに使う場合用：system プロンプト一式を1ファイルに書き出す。
// 出力を Claude の「プロジェクト」のカスタム指示（またはナレッジ）に貼れば、同じ小林botになる。
const fs = require('node:fs');
const path = require('node:path');
const { buildSystemPrompt } = require('../lib/prompt');

const out = path.join(__dirname, '..', 'dist', 'kobayashi-bot-instructions.md');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buildSystemPrompt());
console.log(`書き出しました: ${out}`);
