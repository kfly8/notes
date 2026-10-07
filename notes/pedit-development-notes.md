---
created: 2026-10-07
updated: 2026-10-07
title: pedit の開発で調べたことの見取り図
description: pedit の開発で調べたことを、設計・Cloudflare・WebSocket・配布・Go・Web の領域ごとに並べたハブノート。
tags: [pedit, cloudflare, moc]
---
# pedit の開発で調べたことの見取り図

[[pedit]]（手元のテキストファイルをその場でブラウザと共同編集する CLI。旧称 ima）の開発で調べたことの見取り図。
pedit そのものの使い方と信頼モデルは [[pedit]] に書いてあり、ここは調べて分かったことだけを領域ごとに並べる。

## 設計

- [[e2ee-ephemeral-attachments]] — E2E 暗号化した共同編集に画像添付を足す設計。正本はローカル、暗号文だけ
  R2 に一時的に置く。
- [[json-canvas-co-editing-text-or-structure]] — .canvas をテキストではなく構造として共有する判断。
- [[three-way-apply-not-idempotent]] — base→next の三方適用は二度当てると壊れる。
- [[json-layout-preserving-rewrite]] — 読んで書き戻しても byte で一致する JSON の扱い。

## Cloudflare の挙動

- [[durable-objects-await-gap]] — R2 や fetch を待つ間に別のリクエストが入る。
- [[cloudflare-vars-only-deploy-keeps-running-durable-objects]] — 変数だけのデプロイでは動いている Durable
  Object と WebSocket が残る。メンテナンスモードの設計。
- [[workers-rate-limiting-binding]] — ネットワーク単位のレート制限。namespace_id はアカウント内で共有される。
- [[durable-object-per-connection-allowance]] — 1本の接続が部屋の費用を膨らませないための、接続ごとの許容量。
- [[tagpr-workers-builds-release-flow]] — 本番とプレビューのデプロイ構成。
  [[cloudflare-worker-previews]] と [[cloudflare-workers-builds]] も。

## WebSocket

- [[websocket-refuse-with-close-code]] — 断る理由は受け入れてから close code で伝える。
- [[websocket-same-origin-policy-exempt]] — WebSocket は同一オリジンポリシーの対象外なので Origin を見る。

## 配布

- [[github-artifact-attestations]] — リリースアーカイブのビルド来歴の署名と検証。
- [[curl-sh-installer-hardening]] — `curl | sh` インストーラで踏んだ穴。
- [[github-repo-rename-residue]] — 改名でリダイレクトが救わないもの。
- [[github-readme-inline-video]] — README の動画。

## Go

- [[ygo-yjs-nested-types]] — ygo と Yjs で入れ子の型をやり取りする。
- [[go-http-server-client-disconnect]] — 本文を読み終えるまで切断に気づかない。
- [[go-select-ready-cases-random]] — select は同時 ready な case を無作為に選ぶ。

## Web

- [[barefootjs-xyflow-csr-gaps]] — キャンバスを描く xyflow の CSR での穴。
- [[dompurify-blob-url]] — 自分が発行した blob: URL だけをサニタイザに通す。
- [[lru-eviction-render-feedback-loop]] — 画面が参照する分を追い出さない LRU。
- [[jpeg-lossless-metadata-stripping]] と [[png-webp-metadata-chunks]] — 貼り付けた画像のメタデータを落とす。
- [[node-type-stripping-limits]] — 相互運用テストで踏んだ Node の型ストリップの限界。

## 進め方

- [[pullfrog]] — PR レビューに使っている。上の穴の多くはそのレビューで見つかった。

#pedit #cloudflare #moc
