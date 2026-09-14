---
created: 2026-09-14
updated: 2026-09-14
title: Anthropic の Claude クローラーは用途ごとに User-Agent が分かれている
description: Anthropic は Claude 関連の Web アクセスを、単一の bot ではなく用途別に3種類の User-Agent へ分けて公開している。
tags: [claude, crawler, robots-txt]
---
# Anthropic の Claude クローラーは用途ごとに User-Agent が分かれている

Anthropic は Claude 関連の Web アクセスを、単一の bot ではなく用途別に3種類の User-Agent へ分けて公開している。robots.txt で「Claude は許可したいが、それが具体的にどの経路を指すか」を考えるには、この区別が要る。

| User-Agent | 用途 |
| --- | --- |
| `ClaudeBot` | モデルの学習に使うための Web データ収集 |
| `Claude-User` | Claude Code / Claude.ai がユーザー自身の代わりにページを取得する経路(`WebFetch` ツールなど) |
| `Claude-SearchBot` | Claude AI アシスタントの検索機能用のインデックス作成 |

Anthropic はこの3つすべてが robots.txt を尊重すると明言している。

## `WebFetch` の実際の User-Agent は実測するしかなかった

公式ドキュメントには「Claude Code の `WebFetch` ツールがどの User-Agent を名乗るか」という粒度の記載がない。`https://httpbin.org/user-agent` を `WebFetch` で取得して実測したところ:

```
Claude-User (claude-code/2.1.270; +https://support.anthropic.com/)
```

`Claude-User` を名乗っていた。つまり Claude Code のスケジュールタスクや `WebFetch` ツール経由のアクセスは `Claude-User` として robots.txt から制御できる。

## robots.txt で用途を選んで許可する

「自分が使っている経路(Claude-User)だけ許可し、学習データ収集(ClaudeBot)やサイト内検索へのインデックス(Claude-SearchBot)には収集させたくない」という要求は、robots.txt の標準的な User-Agent 別ルールでそのまま書ける。より具体的な User-Agent 名のブロックが優先され、`*` はそれ以外の全 bot に適用される。

```
User-agent: Claude-User
Allow: /

User-agent: *
Disallow: /
```

これで notes.kobaken.co のような「検索結果には出したくないが、自分がスケジュールタスクや WebFetch で読みに行くのは許可したい」というサイトに、`Claude-User` だけの例外を開けられる。`X-Robots-Tag: noindex, nofollow`(検索エンジン向けのメタ指示)とは独立した設定で、両立できる。

## 理解度チェック

```quiz
Anthropic が公開している3種類の Claude クローラーの用途をそれぞれ一言で言うと。
---
ClaudeBot はモデル学習用データ収集、Claude-User はユーザー代理のページ取得(WebFetch など)、Claude-SearchBot は Claude 内検索機能のインデックス作成。
```

```quiz
Claude Code の WebFetch ツールが実際にどの User-Agent を名乗るかは、どうやって確認したか。
---
公式ドキュメントに記載がなかったため、httpbin.org/user-agent を WebFetch で取得して実測した。結果は "Claude-User (claude-code/2.1.270; +https://support.anthropic.com/)"。
```

## 出典

- [Anthropic Updates Its Crawler Documentation: ClaudeBot, Claude-User & Claude-SearchBot](https://www.seroundtable.com/anthropic-updates-its-crawler-docs-40978.html)
- [Anthropic's Claude Bots Make Robots.txt Decisions More Granular](https://www.searchenginejournal.com/anthropics-claude-bots-make-robots-txt-decisions-more-granular/568253/)
- 実測: `WebFetch` で `https://httpbin.org/user-agent` を取得(2026-09-14)

#claude #crawler #robots-txt
