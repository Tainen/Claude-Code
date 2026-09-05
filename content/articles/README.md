# お役立ち記事 自動作成の仕組み

- `.claude/skills/voco-article/SKILL.md` … 記事の作り方（リサーチ→執筆→画像→出力）と品質ルール
- `content/articles/themes.md` … テーマキュー（上から順に消化。Drive に同じ No. の Doc があればスキップ）
- `tools/article/make-cover.mjs` … カバー画像（ブランド準拠タイトルカード、1200×630）
- `tools/article/make-image-gemini.mjs` … `GEMINI_API_KEY` がある環境でのみ使う AI 画像生成（任意）
- 出力先 … Google Drive「HP / お役立ち記事」フォルダ（Doc + PNG）。HubSpot にブログがあれば下書きも作成。
- 実行 … claude.ai/code の Routine「VOCO お役立ち記事 毎朝作成」が月〜土 6:00 JST に新規セッションを起動し、上記スキルを実行する。
- 掲載 … 堀本さんが Doc を Studio CMS「お役立ち記事」に貼り、PNG をサムネイルに設定して公開する。

## 手動で1本作るとき
セッションで `/voco-article` と打つか、「今日のお役立ち記事を作って」と依頼する。
