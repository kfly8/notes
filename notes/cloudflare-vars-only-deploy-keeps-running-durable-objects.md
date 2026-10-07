---
created: 2026-10-07
updated: 2026-10-07
title: Workers の変数だけのデプロイでは、動いている Durable Object と WebSocket が残る
description: Cloudflare Workers で、コードを変えずに環境変数（vars）だけを変えてデプロイしたとき、何が切れて何が残るか。
tags: [cloudflare, workers, durable-objects, 運用]
---
# Workers の変数だけのデプロイでは、動いている Durable Object と WebSocket が残る

Cloudflare Workers で、コードを変えずに環境変数（`vars`）だけを変えてデプロイしたとき、何が切れて何が残るか。
pedit の公開リレーにメンテナンスモード（Worker 変数 `MAINTENANCE` をダッシュボードで設定して新規受付を止める）
を入れたとき、[[pullfrog]] のレビューが「変数だけのデプロイで既存の WebSocket が落ちる前提は保証されていない」
と指摘し、実際に Cloudflare 上で確かめた。

## 確かめたこと（2026-10-07）

ブランチからテスト用 Worker をデプロイし、ホストとゲストを WebSocket で接続して各々15秒ごとにフレームを
送らせた状態で、ダッシュボードから `MAINTENANCE=closed` を追加してデプロイした（12:43:15 頃）。

- `POST /api/rooms` は 12:43:20 から 503 を返し始めたが、12:43:40 までは 201 と交互に返った。新しい
  リクエストが新しい値を見るまでに約20秒かかり、その間は古い答えが混じる。
- 開いていた WebSocket は**切れなかった**。20秒後も開いたまま。
- 12:43:39、次の15秒フレームが届いたときに、Room（Durable Object）がホストとゲストを
  `4006 "closed for maintenance"` で閉じた。つまり、動き続けている Durable Object の `env` からも新しい
  変数の値は見えている。
- 閉じている間の再接続は、受け入れてすぐ 4006 で閉じられた。
- 変数を削除してデプロイすると、ホストとゲストは同じ部屋に再接続でき、その後のフレームも通った。

Cloudflare のドキュメントも、バインディングだけの変更は「コードを不必要に再読み込みせずに」適用され、既存の
isolate を再利用することがある、と書いている。Durable Object のライフサイクルで終了の原因として挙げられて
いるのは「コード更新を伴うデプロイ」であって、変数だけのデプロイではない。

## 設計への帰結

- 「デプロイすれば接続が落ちる」に頼らず、Durable Object 側で**メッセージごとに**フラグを読んで、自分で閉じる。
  pedit の Room は毎メッセージで `maintenance(env)` を見て、`closed` なら全員を 4006 で閉じる
  （[[websocket-refuse-with-close-code]]）。
- 静かな部屋も閉じるように、クライアントが最低15秒に一度は何か（awareness の更新）を送る前提を置く。これで
  「開いている部屋は約15秒以内に閉じる」と言える。
- ダッシュボードで設定した変数は、次のリリースデプロイで wrangler 設定の `vars` に上書きされて消える。
  `keep_vars: true` を wrangler 設定に書いておくと、設定ファイルにない変数が保持される。
- 新規リクエストの拒否は Worker 側（Durable Object を起こす前）で行う。

## デプロイなしでもっと速く止めるには

WAF のカスタムルールで `/api/*` や `POST /api/rooms` を Block すると、リクエストは Worker に届かず課金も
されない。ただしクライアントには 403 しか見えないので、CLI は理由を言えず、ブラウザは再接続を繰り返す。
理由を伝えたいなら変数の方、ただ止めたいなら WAF。

## 理解度チェック

```quiz
Worker の環境変数だけを変えてデプロイしたとき、開いている WebSocket は切れるか。
---
切れない（2026-10-07 に観測）。既存の isolate と Durable Object は動き続ける。ただし動き続けている Durable Object の `env` から新しい値は見えるので、メッセージごとにフラグを読めば自分で閉じられる。
```

```quiz
ダッシュボードで足した Worker 変数が、次のリリースデプロイで消えないようにするには。
---
wrangler 設定に `keep_vars: true` を書く。書かないと、デプロイのたびに設定ファイルの `vars` で置き換えられる。
```

```quiz
変数を変えたあと、新しいリクエストはすぐ新しい値を見るか。
---
約20秒の間は古い答えと新しい答えが交互に返った。全エッジに行き渡るまで混在する。
```

## 出典

- [Making changes to bindings · Cloudflare Workers docs](https://developers.cloudflare.com/workers/runtime-apis/bindings#making-changes-to-bindings)
- [Durable Object lifecycle · shutdown behavior](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle#shutdown-behavior)
- [Wrangler configuration（`keep_vars`）](https://developers.cloudflare.com/workers/wrangler/configuration/)
- 実装と検証: [piconic-ai/pedit#107](https://github.com/piconic-ai/pedit/pull/107)（レビューは [[pullfrog]]）

関連: [[pedit-development-notes]] [[durable-objects-await-gap]]

#cloudflare #workers #durable-objects #運用
