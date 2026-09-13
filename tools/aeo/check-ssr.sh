#!/usr/bin/env bash
# STUDIO の公開ページが「生HTML」に本文を出しているかを確認する（AEO の前提検証）
# 使い方: bash tools/aeo/check-ssr.sh https://voco.co.jp/column/article-004
# 出力: User-Agent ごとの HTML サイズ／本文っぽい文字数／h1〜h3 の数／JSON-LD の数／指定語の有無
# 判定: 「本文文字数」が数百字以上あり、h2 が 3 本以上見えていれば SSR されている。
#       0 に近ければ JS 描画のみで、AI クローラー（GPTBot・ClaudeBot・PerplexityBot）には読まれない。
set -u
URL="${1:?URL を指定してください（例: https://voco.co.jp/column/article-004）}"
NEEDLE="${2:-接触単価}"   # 記事本文に必ず含まれる語（第2引数で変更可）
UAS=(
  "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)"
  "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)"
  "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)"
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36"
)
printf '%-14s %8s %10s %5s %5s %5s %7s %s\n' UA bytes 本文字数 h1 h2 h3 JSON-LD "「$NEEDLE」"
for ua in "${UAS[@]}"; do
  name=$(echo "$ua" | grep -oE 'GPTBot|PerplexityBot|ClaudeBot|Googlebot|Chrome')
  html=$(curl -sL --max-time 20 -A "$ua" "$URL")
  bytes=$(printf '%s' "$html" | wc -c | tr -d ' ')
  # script/style を除き、タグを剥がして空白を除いた文字数
  text=$(printf '%s' "$html" | perl -0pe 's/<script.*?<\/script>//gs; s/<style.*?<\/style>//gs; s/<[^>]+>//g; s/\s+//g')
  chars=$(printf '%s' "$text" | wc -m | tr -d ' ')
  h1=$(printf '%s' "$html" | grep -oi '<h1' | wc -l | tr -d ' ')
  h2=$(printf '%s' "$html" | grep -oi '<h2' | wc -l | tr -d ' ')
  h3=$(printf '%s' "$html" | grep -oi '<h3' | wc -l | tr -d ' ')
  ld=$(printf '%s' "$html" | grep -oi 'application/ld+json' | wc -l | tr -d ' ')
  hit=$(printf '%s' "$html" | grep -q -- "$NEEDLE" && echo あり || echo なし)
  printf '%-14s %8s %10s %5s %5s %5s %7s %s\n' "$name" "$bytes" "$chars" "$h1" "$h2" "$h3" "$ld" "$hit"
done
echo
echo "判定の目安: 本文字数が 1000 以上・h2 が 3 以上・指定語が「あり」→ SSR されている。全 UA で 0 付近 → JS 描画のみ（要対処）。"
