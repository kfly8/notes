---
created: 2026-08-24
updated: 2026-08-24
---
# Cloudflare AI Search

自分のデータに対する検索エンジンを、1コマンドで作れるマネージドサービス。2026年8月6日、[[cloudflare-agents-week-2026]] の中で発表された。エージェントが自分のデータの中から必要な情報を見つけ、より正確な回答を作れるようにする、という位置づけ。

## 何を解決するか

これまでは Workers AI・AI Gateway・Vectorize・R2・Browser Run(ブラウザ自動化サービス)といった Cloudflare の各プリミティブを自分で組み合わせて検索エンジンを構築する必要があった。AI Search はこの組み合わせを1つのサービスにまとめている。

## ハイブリッド検索

「semantic and keyword together in one query」、つまりセマンティック検索とキーワード検索を1つのクエリの中で同時に行う。曖昧な質問にも、正確な用語検索にも両方対応できる。

対応データ形式はテキスト・画像・ファイル・ウェブサイト。ウェブサイトはサイトマップなしでクロールする Discover オプションにも対応する。

## 使い方

```console
$ npx wrangler ai-search create my-search \
  --namespace my-namespace \
  --source https://my-website.com \
  --type web-crawler \
  --hybrid-search
```

Worker からは binding で使う。

```jsonc
{
  "ai_search_namespaces": [
    { "binding": "AI_SEARCH", "namespace": "cloudflare-stack" }
  ]
}
```

コード不要で `/search` と `/mcp` の公開エンドポイントが自動生成され、カスタムドメインも設定できる。MCP サーバーとしても呼び出せる。

## 料金

デフォルトモデル(または Workers AI カタログのモデル)を使う場合、埋め込みとリランキングは無料。サードパーティモデルを使う場合は別途課金される。プレビュー価格は以下の通り。

| 項目 | 価格 |
| --- | --- |
| 基本取り込み | $0.75 / 100万トークン |
| ストレージ | $2 / GB・月 |
| セマンティック検索 | $0.75 / 1000クエリ |

全 Workers プランで、月間 500万トークンの取り込み・10GB のストレージ・2000クエリまでは無料枠として使える。発表時点ではベータ扱いで、GA 移行前に別途料金が案内される予定。

## [[cloudflare-agents-week-2026]]の中での位置づけ

エージェントの検索を扱う。記憶は [[cloudflare-agent-memory]]、Webページの取得は [[kitesurf]] に分けた。

## 理解度チェック

```quiz
AI Search が登場する前、同じことをするには何を自分で組み合わせる必要があったか。
---
Workers AI・AI Gateway・Vectorize・R2・Browser Runといった複数のCloudflareプリミティブを、自分で組み合わせて検索エンジンを構築する必要があった。
```

```quiz
AI Search の「ハイブリッド検索」とは何を指すか。
---
セマンティック検索とキーワード検索を1つのクエリの中で同時に行うこと。曖昧な質問にも正確な用語検索にも対応できる。
```

## 出典

- [Cloudflare AI Search: give your agents a search engine for your data](https://blog.cloudflare.com/ai-search-easier/)
- [Everything we launched during Agents Week](https://blog.cloudflare.com/agents-week-review-august-2026/)

#cloudflare #agents-week-2026 #ai-agent #rag
