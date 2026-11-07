// system プロンプトの組み立て。
// prompts/system.md（人格・レビュー手順）+ knowledge/*.md（文字起こしから抽出した知識）を連結する。
// 変化しない内容だけを入れること（日時などを入れるとプロンプトキャッシュが効かなくなる）。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function buildSystemPrompt() {
  const base = fs.readFileSync(path.join(ROOT, 'prompts', 'system.md'), 'utf8');
  const dir = path.join(ROOT, 'knowledge');
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
    : [];
  const knowledge = files
    .map((f) => `<knowledge file="${f}">\n${fs.readFileSync(path.join(dir, f), 'utf8').trim()}\n</knowledge>`)
    .join('\n\n');
  return knowledge ? `${base.trim()}\n\n# 参考資料（過去の会議文字起こしから抽出）\n\n${knowledge}\n` : base;
}

const MODES = {
  review: {
    label: '事前レビュー',
    hint: '資料・企画・メール文面などを貼る／添付すると、小林さんに言われそうな指摘を出します',
    instruction:
      'モード: 事前レビュー。直前のユーザー入力（添付含む）を、小林さんが確認する前提でレビューしてください。system プロンプトの「レビューの出力形式」に従うこと。',
  },
  consult: {
    label: '相談・壁打ち',
    hint: '「これどう進めたらいい？」など、小林さんならどう考えるかを聞けます',
    instruction:
      'モード: 相談・壁打ち。小林さんならどう考え、どう返すかを、小林さんの口調で会話として返してください。形式ばったレビュー表は不要。必要なら逆質問で詰めること。',
  },
  final: {
    label: '最終チェック',
    hint: '修正後の最終版を貼ると「小林さんに出してOKか」を判定します',
    instruction:
      'モード: 最終チェック。小林さんにこのまま出して良いかを「出してOK / あと一歩 / まだ出さない方がいい」の3段階で判定し、理由と、残っている指摘を重要な順に最大3つだけ挙げてください。',
  },
};

module.exports = { buildSystemPrompt, MODES };
