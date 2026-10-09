---
created: 2026-10-09
updated: 2026-10-09
title: celld
description: Cloudflare Workers のアプリケーションを、手元のマシンで動かすためのデーモン。
tags: [celld, durable-objects, cloudflare, workers, self-host]
---
# celld

Cloudflare Workers のアプリケーションを、手元のマシンで動かすためのデーモン。Deno（denoland/celld）が Apache-2.0 で公開している。
手持ちの `wrangler.json` をそのままデプロイ設定に使い、Workers、Durable Objects、KV、Queues、D1、R2、Workflows、Cron Triggers、
静的アセットを動かす。2026-10 時点の最新は v0.6.2 で、ドキュメントは beta と書いている。

## 仕組み

- **cell。** Durable Object 1つを cell と呼ぶ。名前で呼ばれるサーバーで、それぞれが自分の SQLite を持つ。KV の namespace、
  Queue、D1、Workflow も cell として実装されていて、Durable Object と同じリース・複製・フェイルオーバーに乗る。
- **node と fleet。** 1つの `celld` プロセスが node で、マシンごとに1つ立てる。各 node は V8 を組み込んで Wrangler の
  バンドルを実行する。同じバケットを共有する node の集まりが fleet。
- **協調はバケットだけで行う。** バケットにはデプロイ、cell の状態、所有権の小さなレコードが入る。cell の所有権は
  バケットへの条件付き書き込みで取るので、1つの cell を持つ node は常に1つ。メンバーシップ管理、故障検知、合意サービスを
  別に置かない。
- **永続化。** SQLite へのコミットを LTX（Litestream の複製形式）で拾う。node が1つならバケットへのアップロードで永続化を
  確定させるため、書き込みごとにバケットを待つ。2つ以上なら他の node のディスクに届いた時点で確定し、バケットへは後から上げる。
- **R2。** R2 バインディングは fleet のバケットに直接読み書きする。別の R2 を用意するのではなく、同じバケットに入る。

```canvas
{
  "nodes": [
    {"id": "client", "type": "text", "x": 120, "y": 0, "width": 360, "height": 56, "text": "ブラウザ / CLI"},
    {"id": "ingress", "type": "text", "x": 120, "y": 136, "width": 360, "height": 56, "text": "リバースプロキシ（TLS 終端）"},
    {"id": "fleet", "type": "group", "x": 80, "y": 272, "width": 440, "height": 136, "label": "fleet"},
    {"id": "a", "type": "text", "x": 120, "y": 312, "width": 160, "height": 64, "text": "celld node A\n(V8 + SQLite)"},
    {"id": "b", "type": "text", "x": 320, "y": 312, "width": 160, "height": 64, "text": "celld node B\n(V8 + SQLite)"},
    {"id": "bucket", "type": "text", "x": 120, "y": 488, "width": 360, "height": 72, "text": "バケット（S3 / R2 / GCS / Azure）\nデプロイ、cell の状態、所有権、R2 の中身", "color": "4"}
  ],
  "edges": [
    {"id": "e1", "fromNode": "client", "toNode": "ingress", "label": "HTTPS / WSS"},
    {"id": "e2", "fromNode": "ingress", "toNode": "fleet", "label": "平文 HTTP"},
    {"id": "e3", "fromNode": "fleet", "toNode": "bucket", "label": "条件付き書き込み、LTX"}
  ]
}
```

強調したバケットが fleet の唯一の共有点で、node どうしはこれ以外に合意の仕組みを持たない。

## バケットの条件

所有権を守るには、条件付きの作成と上書き、範囲読み出しが正しく効くストレージが要る。`celld diagnose` で確かめられる。

- 動作確認済み: Amazon S3、Cloudflare R2、Tigris、Google Cloud Storage、Azure Blob Storage。
- 条件付き書き込みを実装していないので使えない: Backblaze B2、Hetzner Object Storage、DigitalOcean Spaces。
  使うと1つの cell を2つの node が持ちうる。
- MinIO のコミュニティ版はストレージテストを通るが、本番向けとしては認定されていない。

## 運用上の制約

- **TLS を終端しない。** 公開する TLS は前段のプロキシで終端する。
- **node 間の通信は平文の HTTP。** HMAC で認証はするが暗号化はしないので、プライベートネットワークか暗号化された
  オーバーレイの上に置く。
- **1つの fleet で動かすアプリケーションは1つ。**
- **cell が別の node に移ると WebSocket は閉じる。** ハイバネーション中の WebSocket は 1012 で閉じられ、クライアントが
  新しい持ち主に再接続する。同じ node 上でのハイバネーションには耐える。
- **Cloudflare のネットワーク、GPU、ブラウザ群が要るものは対象外。** 対応の境界は `docs/cloudflare-compat.md` に並んでいる。
  rate limiting のバインディングはそこの対応表にない。

## 移植するときに引っかかる点

pedit の worker を載せてみて分かったこと（[[celld-pedit-experiment]]）。

- `wrangler.json` に celld の知らないキーがあると、無視せずにエラーで止まる。`routes`、`ratelimits`、`observability`、
  `previews`、`workers_dev`、`keep_vars` などは外す必要があり、Cloudflare 用とは別の設定ファイルを持つことになる。
- `main` と `assets.directory` はプロジェクトの中を指していなければならない。`../web/dist` のような外への参照は通らない。
- Worker のプロジェクトは `esbuild` が PATH にないとビルドできない。
- `celld dev` を使えば、バケットなしでローカルの1 node として動かせる。

## 理解度チェック

```quiz
celld の node どうしは、cell の持ち主が1つに決まることをどうやって保証しているか。
---
共有バケットへの条件付き書き込みで所有権を取る。合意サービスやメンバーシップ管理は持たないので、条件付き書き込みを正しく実装していないストレージ（B2 など）では保証が崩れる。
```

```quiz
celld で R2 バインディングに書いたオブジェクトはどこに入るか。
---
fleet のバケットに直接入る。cell の状態や所有権のレコードと同じバケットなので、lifecycle ルールを掛けるならプレフィックスで範囲を絞る必要がある。
```

```quiz
Cloudflare 用の `wrangler.jsonc` をそのまま `celld dev` に渡すと何が起きるか。
---
`routes` や `ratelimits` のような celld が対応していないキーがあると、無視されずにエラーで止まる。celld 用に対応キーだけの設定を別に用意する。
```

## 出典

- [denoland/celld](https://github.com/denoland/celld) v0.6.2 の README、[docs/guarantees.md](https://github.com/denoland/celld/blob/main/docs/guarantees.md)、[docs/limitations.md](https://github.com/denoland/celld/blob/main/docs/limitations.md)、[docs/cloudflare-compat.md](https://github.com/denoland/celld/blob/main/docs/cloudflare-compat.md)、[docs/services/durable-objects.md](https://github.com/denoland/celld/blob/main/docs/services/durable-objects.md)
- [celld.dev](https://celld.dev)

#celld #durable-objects #cloudflare #workers #self-host
