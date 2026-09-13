# AEO 記事生成 引き継ぎ（HANDOFF）

対象：voco.co.jp（株式会社VOCO）の「お役立ち記事」を、AI検索（ChatGPT・Perplexity・Google AI Overviews／AIモード・Claude・Gemini）の回答で引用される形で作る。
このファイルは、別セッションのターミナルで作られた `tools/aeo/HANDOFF.md` がリポジトリに push されていなかったため、2026-09-13 に Drive の「VOCO AEO設計図」（2026-09-11）と先行ブランチ `claude/voco-homepage-articles-ys5zwk` の資産を統合して再作成したもの。

## 1. これは何か

- 記事の生成・チェック・画像・出力の仕組みは `content/articles/README.md` と `.claude/skills/voco-article/SKILL.md`。
- AEO の狙い（どの質問文を、どの記事で取るか）は `content/articles/prompt-map.md`。
- 成果物は Google ドキュメント（Drive「HP / お役立ち記事」フォルダ、ID `1klA79rJRmpGTfMJZUL5fUFr2ViNZ0Bfj`）にレビュー待ちで入るだけ。**自動公開はしない。** Studio への貼り付けと公開は堀本さんが行う。

## 2. 調査で判明している事実（再調査不要。出典は Drive「VOCO AEO設計図」）

1. **voco.co.jp の生HTMLには本文が入っていない。** どの User-Agent でも 17,175 バイトの同一HTML。本文0文字・h1〜h3 0個・meta description なし・JSON-LD 0個・og:url が相対値。AI のクローラー（GPTBot・ClaudeBot・PerplexityBot）は JavaScript を実行しないため、この状態では記事を何本書いても読まれない。
2. **STUDIO 自体は SSR できる。** studio.design の CMS 記事ページは 642KB の生HTMLに本文と見出しが入っている。voco.co.jp は古い描画方式（`__NUXT__` ペイロード）で出ているのが原因と見られる。対処は「CMS でテスト記事を1本公開 → curl で生HTMLに本文が入るか確認 → 入らなければ再パブリッシュ → 変わらなければ STUDIO サポートに照会」。
3. **「お役立ち記事」は公開サイト上にまだ1本もない。** ナビは /download のプレースホルダーに繋がり、TOP の NEWS 欄はダミー。sitemap は 13 URL（うち /1 /1-1 /1-2 /2 は未使用ページ）。robots.txt は全許可。
4. **「新卒の採用支援といえば」型（層A）は自社記事では取れない。** AI が引くのは比較メディアの一覧記事。「採用代行 おすすめ40社」系の多くは競合 RPO の自社ブログで、有償でも載れない。有償で載れるのは中立の BtoB 比較・資料請求メディア、PR TIMES、日本の人事部など。
5. **自社記事で取れるのは層B（課題解決）・C（比較）・D（定義）・E（ハウツー）。** 層D（「実働型採用コンサル」「プレゼン代行」など自社の言葉）は競合ゼロで定義権を取れる。
6. **AI が引用元を選ぶ条件は本数ではない。** 冒頭の定義・結論文、一次情報と独自データ（母数・時期・算出方法つき）、構造（見出し直下の結論・表・FAQ）、著者の固定。ただしこれらの統計値（定義文を置く記事の割合、ChatGPT と Perplexity の引用ドメイン重複が約1割 など）は SEO 事業者のブログが出どころで、第三者検証済みではない。方向性の根拠には使えるが、目標数値の根拠にはしない。
7. **エンジンごとに引用先が違う。** 1つのエンジンの結果で記事の良し悪しを判断しない。計測は月1回、固定20問 × 5エンジンで「VOCO への言及の有無／引用URL／競合社名」を記録する。
8. **llms.txt は優先しない。** 30万ドメイン規模の調査で引用頻度への効果が確認できなかったという報告がある。置いてもよいが本文の質・構造・信頼性より後。

補足（2026-09-13 の追加調査。上記と矛盾なし）：AI 引用の分析記事では、Perplexity は「事実＋出典」と数値・調査元の明記を好み、ChatGPT は権威ある情報源を深く・固有名詞が密な形で参照し、Gemini／AI Overviews は Google の検索評価（公式情報・ピラーページ）との親和性が高いと報告されている。いずれも SEO 事業者の公開分析。

## 3. 決定事項

- 記事の置き場所：STUDIO CMS（生HTML検証は未了。これが唯一の技術リスク）。
- 著者：全記事「堀本 大然」名義で固定。著者ボックスから /member へリンク。
- 記事の型：1記事＝1質問。タイトルは質問文。冒頭80字で結論。H2直下に結論。比較は表。末尾に FAQ 3〜5問。CTA は HP 共通の固定文。文字数 2,500±10%。相対時制の語を使わない。
- 使える VOCO の数字：HP テキスト確定版のみ（`SKILL.md` 4 節）。年間200回以上登壇／30都道府県・20業種／クライアント総合計40名採用／契約更新率92%／採用業務90%以上／2名固定体制／3日〜1週間の業務体験インターン／週1定例・365日／最短半年／イベント 15万〜40万円・追加なし・20名以上・3〜5名グループ／一般イベント 50万〜90万円／資料作成 3〜4週間／公開事例4社。
- 頻度：週5本（第1週＝No.004〜008）。

## 4. 未対応（要判断・要作業）

1. **STUDIO の生HTML検証**（テスト記事1本の公開と curl 確認）。未了のまま記事を積むと空振りになる。
2. **「年間500回」と「年間200回以上」の不一致。** AEO設計図は 500 回、HP 確定版は 200 回以上。記事は HP 確定版に従い 200 回以上で書いた。500 を使うなら HP 側の数字を先に更新し、`SKILL.md` 4 節を書き換える。
3. **著者の肩書き**（代表／取締役 等）が未確定。記事の著者行は「堀本 大然（株式会社VOCO）」のみ。
4. **Studio の本文が表（table）に対応するかの確認。** 非対応なら HTML の表を箇条書きに置き換えて貼る（記事の先頭コメントに置換方法を記載）。
5. **構造化データ（Article／FAQPage／Organization）を貼れるプランか。** 各記事の先頭コメントに FAQPage JSON-LD を用意済み。
6. **層Aの予算枠**（月9〜10万円の配分案）と PR TIMES スタートアップチャレンジの対象可否。
7. **事例の実名掲載の許諾**（/case）。層Aに最も効く。
8. **記事中画像の質。** GEMINI_API_KEY が無い環境ではフラットイラスト（`make-scene.mjs`）で生成している。写実的な画像が必要なら API キーを環境に入れて `make-image-gemini.mjs` で再生成する。

## 5. ファイルの地図

- `content/articles/out/No.xxx_article.html` … 記事の正本（先頭コメントにタイトル／メタ／狙うプロンプト／H2 一覧／画像位置／表・FAQ・著者の注記／FAQPage JSON-LD）
- `content/articles/out/No.xxx_img1〜3.png` … 記事中画像（1600×900）
- `content/articles/themes.md` … テーマキュー。No.004 以降は AEO 方針
- `content/articles/prompt-map.md` … 狙う質問文 → 記事の台帳、層の考え方、第2週以降の候補
- `tools/article/check-article.mjs` … 出稿前チェック（合格が出るまで出力しない）
- `tools/article/make-scene.mjs` … 画像のフォールバック（scene: meeting / briefing / interview / event / onboarding / desk / group / report）
- `tools/article/make-image-gemini.mjs` … 写実画像（GEMINI_API_KEY が必要）

## 6. 実行の流れ（1本あたり）

1. `themes.md` の次の未消化行を取り、`prompt-map.md` で層と併せて拾う質問文を確認する。
2. 記事の型（3 節）で HTML を書く。VOCO の数字は 3 節の範囲のみ。**一次情報（VOCO の数字・事例・運用ルール）が1つも入らない記事は作らない。** 一般論だけの記事は AI 検索に引用されないため、不便でも意図的な仕様。
3. `node tools/article/check-article.mjs <html> --target 2500` で合格を出す。
4. 画像3枚を生成（`GEMINI_API_KEY` があれば Gemini、無ければ `make-scene.mjs`）。
5. Google ドキュメント `No.xxx_タイトル` を Drive フォルダに `text/html` で作成（先頭に掲載用メタ情報の段落を付ける）。
6. Git に commit & push。自動公開はしない。

## 7. 環境

- Node 22。Playwright は `/opt/node22/lib/node_modules/playwright` にあり、`make-scene.mjs` はそこにフォールバックする。
- この環境から voco.co.jp・多くの外部サイトは取得できない（egress 制限）。WebSearch の要約は使えるが本文取得は失敗することがある。
- API キー・.env はコミットしない。

## 8. 設計で外してはいけない点

- 一次情報がない記事は生成しない（緩めない）。
- 相対時制の語（今年・現在・最近・今後…）を本文に書かない。記事は数年残る。
- VOCO の数字は HP 確定版の範囲のみ。商談で聞いた個別企業の数字は使わない。
- 自動公開しない。Google ドキュメントにレビュー待ちで入るだけが正しい挙動。
- 層A（推薦型）を記事で取ろうとしない。記事は層B〜E、層Aはサイト外施策。
