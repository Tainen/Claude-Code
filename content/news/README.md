# ニュース（お知らせ）原稿

- `news-xxx_{スラッグ}.html` … 正本。本文は `<h2> <h3> <p> <ul><li>` のみ。H1 は入れない（Studio の記事タイトルが H1 になる）。
- 先頭の HTML コメントに「タイトル／メタディスクリプション／カテゴリ／H2 指定行／画像の位置／公開前に埋める箇所／出典と確認状況」を書く。
- お役立ち記事と違い、日付・固有名詞・実績値が本文に入る。`tools/article/check-article.mjs` は文字数・H2本数・「まとめ」の有無をお役立ち記事の基準で見るため、この3項目の NG は無視してよい。
  それ以外（H1 なし／段落150字以内／全角スペース・Markdown 記法・擬似ボタンなし）はニュースでも守る。
- 未確認の情報は `●●` のまま残し、先頭コメントの「公開前に埋める箇所」に列挙する。確認できない数値・戦績は書かない。

## Google ドキュメントでの納品（2026-11-09 から）

HTML の正本をそのまま渡すのではなく、お役立ち記事と同じように Google ドキュメントで渡す。

```
node tools/article/make-doc-html.mjs --file content/news/news-00X_xxx.html --no-img --out /tmp/doc.html
```

- `--file` … 任意の記事HTMLを指定する（お役立ち記事の `No.xxx` 以外に使うための追加オプション）
- `--no-img` … 【画像：…】行を `<img>` に置き換えず、「［ここに画像Nを入れる］」のプレースホルダーとして残す。ニュースの写真は部や取引先から受け取るため、Git に画像が無い

生成した HTML を `mcp__Google_Drive__create_file`（`contentMimeType: text/html`）で Drive にアップロードすると Google ドキュメントに変換される。

- 保存先：Drive「01_HP / ニュース」フォルダ（ID `1hAAAyqf4tiFePA6kGjUMI2xxIpVlJKJR`）
- ファイル名：`news-00X_{タイトル}`
- 冒頭と各 H2 直下の第1文が太字＋マーカーになり、H2 にオレンジの帯が付く。区切り線より下に「掲載用メタ情報」（タイトル・スラッグ・確認事項・出典）が入る
- Studio へ貼るのは区切り線より上だけ。貼り付け手順は `tools/aeo/studio-paste-prompt.md` と同じ要領
