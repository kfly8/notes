---
created: 2026-08-29
updated: 2026-09-02
title: Cloudflare Workers
description: Cloudflare Workers のプラットフォーム機能(配信・キャッシュ・デプロイなど)を扱うノートの見取り図
tags: [cloudflare, workers, moc]
---
# Cloudflare Workers

Cloudflare Workers のランタイム・プラットフォーム機能を扱うノートのハブ。[[cloudflare-agents-week-2026]] が AI エージェント関連の発表を時系列で追うハブなのに対し、こちらは「Workerを1つ運用する上で必要になる、プラットフォームの機能」という切り口でまとめる。

## 配信

- [[cloudflare-workers-assets]] — 静的ファイルの配信。`assets.directory` を指すだけで面倒を見てくれるが、既定のヘッダーに癖があり `_headers` で上書きすることになる

## Worker生成レスポンスのキャッシュ

- [[cloudflare-workers-cache]] — Worker自身が生成したレスポンスを、`Cache-Control` ヘッダーを見て自動でキャッシュする仕組み。[[cloudflare-workers-assets|静的アセット側のキャッシュ]]とは別レイヤー
- [[cloudflare-workers-og-image]] — satori + resvg-wasmで動的にOGP画像(PNG)を生成する具体例。生成結果を[[cloudflare-workers-cache|Workers Cache]]でキャッシュする、という実際の組み合わせ

## デプロイ

- [[cloudflare-workers-builds]] — リポジトリをpushしたときの自動ビルド・デプロイ。上3つとは違うレイヤー(実行時ではなくデプロイ時)の話

## 理解度チェック

```quiz
静的アセットのキャッシュ([[cloudflare-workers-assets]])と、Worker生成レスポンスのキャッシュ([[cloudflare-workers-cache]])は同じ仕組みか。
---
別の仕組み。静的アセット側は `_headers` で既定のCache-Controlなどを上書きするが、これはWorkerが生成したレスポンスには効かない。Worker生成レスポンスをキャッシュするにはWorkers Cacheが要る。
```

```quiz
[[cloudflare-workers-og-image|動的OGP画像生成]]と[[cloudflare-workers-cache|Workers Cache]]はどう組み合わさっているか。
---
satori+resvg-wasmで生成したPNGレスポンスに `Cache-Control` ヘッダーを付け、それをWorkers Cacheが自動でキャッシュする。生成コストの高い処理を、キャッシュヒット時はWorkerを実行させずに済ませる実例になっている。
```

#cloudflare #workers #moc
