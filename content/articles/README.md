# お役立ち記事 自動作成の仕組み

- `.claude/skills/voco-article/SKILL.md` … 記事の作り方（リサーチ→執筆→画像→出力）と品質ルール
- `content/articles/themes.md` … テーマキュー（上から順に消化。Drive に同じ No. の Doc があればスキップ）
- `tools/article/check-article.mjs` … 出稿前の機械チェック（文字数±10%、段落150字、相対時制、断定語、Studio 貼り付け事故の元 など）
- `tools/article/make-image-gemini.mjs` … 記事中画像（面接・会議・説明会などの写実的なビジネスシーン）。`GEMINI_API_KEY` がある環境でのみ動く
- `tools/article/make-scene.mjs` … 記事中画像のフォールバック（同じシーンのフラットイラスト。キーが無い環境で使う）
- `tools/article/make-cover.mjs` … カバー画像のタイトルカード（メイン画像は堀本さんが自作するので通常は使わない）
- 出力先 … 本文は Google Drive「HP / お役立ち記事」フォルダの Doc。カバー画像と保管用HTMLは `content/articles/out/`（このブランチに push）。HubSpot にブログがあれば下書きも作成。
- 実行 … claude.ai/code の Routine「VOCO お役立ち記事 毎朝作成」が火曜を除く毎日 6:00 JST に、Google Drive / HubSpot コネクタを持つ作業セッションを起こして上記スキルを実行する。
- 掲載 … 堀本さんが Doc を Studio CMS「お役立ち記事」に貼り、PNG をサムネイルに設定して公開する。

## 手動で1本作るとき
セッションで `/voco-article` と打つか、「今日のお役立ち記事を作って」と依頼する。
