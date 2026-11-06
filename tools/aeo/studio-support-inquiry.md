# STUDIO サポート照会文（SSR／生HTMLに本文が出ない件）

用途：voco.co.jp の公開ページが生HTMLに本文・見出しを出力しない件を STUDIO サポートへ照会する。
実測日：2026-11-06。計測は `tools/aeo/check-ssr.sh` と curl のレスポンスヘッダー。
送付前に確認：プロジェクトID（`wQOVrw58OD`）と契約プラン名が合っているか。

---

（件名）

公開ページの生HTMLに本文が出力されない件について（voco.co.jp／プロジェクトID: wQOVrw58OD）

（本文）

お世話になっております。株式会社VOCOと申します。

STUDIO で制作・公開しているサイト voco.co.jp について、**公開ページの生HTML（JavaScript 実行前のHTML）に本文・見出しが出力されない**事象を確認しております。AI検索エンジンへの対応を進めるうえで支障となっているため、原因と対処方法をご教示いただけないでしょうか。

## 1. 事象

公開中のページを curl で取得すると、HTTPステータスは200で返るものの、`<body>` 内にはページ本文も見出しも含まれていません。本文はすべて `<script type="application/json" data-nuxt-data="nuxt-app" data-ssr="true" id="__NUXT_DATA__">` の中のJSONデータとしてのみ存在します。

対象URL（一例）：https://voco.co.jp/case/consulting/oyakudachi_01

| 項目 | 実測値 |
|---|---|
| HTTPステータス | 200 |
| HTMLサイズ | 55,077バイト |
| `<body>` 内の可視テキスト | 実質0字（STUDIOバナーのみ） |
| h1 / h2 / h3 の数 | 0 / 0 / 0 |
| 本文中の特徴語「接触単価」 | 10回出現。ただし全てJSONデータ内 |
| JSON-LD | 0件 |

User-Agent を Googlebot / GPTBot / ClaudeBot / PerplexityBot / 一般ブラウザの5種類で試しましたが、**いずれも同一の55,077バイト**で、出力に差はありませんでした。TOPページ（voco.co.jp/）、ニュース記事（/news/...）、CMS記事（/case/consulting/...）のいずれも同じ状態です。

ブラウザでは正常に表示されますので、表示上の不具合ではなく、サーバー側で出力されるHTMLの内容に関するご相談です。

## 2. 併せて確認している点

同一サイト内の全ページで、以下が共通していました。

- `<title>` が全ページ「株式会社VOCO」で固定され、ページごとの値になっていない
- `<meta name="description">` が出力されていない
- `<link rel="canonical">` が出力されていない
- `og:title` が全ページ「株式会社VOCO」で固定
- `og:url` が `/case/consulting/oyakudachi_01` のような**相対パス**で出力されている
- `og:image` が出力されていない

## 3. 描画方式の違いについて

弊社サイトと、御社サイト（studio.design）のレスポンスを比較したところ、描画の仕組みが異なるように見受けられました。

| | voco.co.jp | studio.design/ja/blog |
|---|---|---|
| `server` ヘッダー | Google Frontend | cloudflare |
| `x-powered-by` | Nuxt | （なし） |
| `server-timing` | （なし） | fetchSiteData / fetchSymbols / fetchNode / loadData / buildHtmlBundle / toHTMLString |
| Nuxtペイロード | あり（`__NUXT_DATA__`） | なし |
| `<body>` 内の可視テキスト | 1字 | 7,231字 |
| h1 / h2 | 0 / 0 | 1 / 4 |

御社サイト側では `buildHtmlBundle` `toHTMLString` といった処理を経て、本文と見出しが生HTMLに出力されています。一方、弊社サイトは Nuxt のペイロード方式で出力されており、`data-ssr="true"` と記載されているものの、実際にはSTUDIOバナー部分以外のコンテンツがHTMLに現れていません。

弊社サイトが旧来の描画方式のまま残っている可能性があるのではないかと考えておりますが、いかがでしょうか。

## 4. ご教示いただきたいこと

1. 上記の事象について、弊社サイトが旧来の描画方式で出力されているという理解で相違ないでしょうか。原因が別にある場合はご指摘ください。
2. 本文・見出しが生HTMLに出力される方式へ移行することは可能でしょうか。可能な場合、**弊社側の操作（再パブリッシュ・設定変更など）で完結するのか、御社側での作業が必要か**をご教示ください。
3. 移行にあたり、既存の公開URL・公開中のページ・CMSのデータに影響が生じるかどうかをご教示ください。影響がある場合は、事前に必要な準備も併せてお願いいたします。
4. ページごとの `<title>` `<meta name="description">` `<link rel="canonical">` `og:image` を、CMSのフィールド値から出力する設定方法をご教示ください。現在、契約プランの制約で設定できない項目があれば、その旨もお知らせください。
5. 各記事ページに構造化データ（JSON-LD。Article／FAQPage を想定）を挿入する方法と、必要な契約プランをご教示ください。
6. 2 の対応が可能な場合、おおよその所要期間をご教示ください。

## 5. 背景

弊社は現在、AI検索（ChatGPT・Perplexity・Google AI Overviews など）の回答で自社記事が参照されることを目的としたコンテンツ施策を進めております。これらのクローラーは JavaScript を実行しないとされており、現状では公開済みの記事21本が、いずれも本文のないページとして扱われる状態にあります。

お手数をおかけいたしますが、ご確認のほどよろしくお願いいたします。

株式会社VOCO
（担当者名・連絡先）

---

## 補足（堀本さん向け・送らない）

- 送る前に、プロジェクトIDと契約プラン名を実際の値に合わせてください。項目4でプランの制約を聞いているため、プラン名は書かずに質問だけ残しても構いません。
- 「2. 併せて確認している点」は本題（SSR）が解決すれば自然に直る可能性があります。先方が本題だけに回答してきた場合は、改めて項目4を単独で聞き直すのが確実です。
- 返信が来たら、対応後に `bash tools/aeo/check-ssr.sh https://voco.co.jp/case/consulting/oyakudachi_01 接触単価` を実行すれば、直ったかどうかが即座に判定できます。本文字数が1000以上・h2が3本以上になれば解決です。
- 再現手順を求められた場合に渡せるコマンド：
  `curl -sS -A "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)" https://voco.co.jp/case/consulting/oyakudachi_01 | wc -c`
