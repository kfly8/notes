---
created: 2026-10-09
updated: 2026-10-09
title: pedit の中継サーバーを celld で動かした記録
description: pedit の中継サーバーを Cloudflare ではなく celld の単一 node で動かし、同期・R2 の添付・ホスト退出時の後片付けが動くことを確かめた記録。
tags: [celld, pedit, durable-objects, self-host]
---
# pedit の中継サーバーを celld で動かした記録

[[pedit]] の中継サーバー（`packages/worker`、[[pedit-room-relay]]）を、Cloudflare ではなく [[celld]] で動かした記録。
単一 node の `celld dev` 上で、worker のコードを変えずに、CLI のホストとゲストの同期、R2 の暗号化添付、ホストが抜けたときの
後片付けまで動いた。

## 目的

celld のドキュメントには「ハイバネーション WebSocket」「R2 の読み書きと list」に対応とあるが、pedit が頼っている次の API に
ついての記載はない。

- `ctx.acceptWebSocket(ws, ['host'])` のタグ、`ctx.getWebSockets('host')`、`ctx.getTags(ws)`。ホストの判定と、ホストが
  抜けたら部屋を閉じる処理の要。
- `BLOBS.delete(keys[])` の配列での一括削除と、`list` の `cursor`。ホストが抜けたときに添付を消す処理で使う。

これらが動くかを、実際の CLI を繋いで確かめる。

## 材料

- celld v0.6.2（`celld-x86_64-unknown-linux-gnu.gz`、GitHub Releases から取得）。
- pedit の `main`（27ea1ee、2026-10-07）。`pnpm install && pnpm build` で `packages/web/dist` を作り、`go build ./cmd/pedit` で CLI を作る。
- `esbuild` 0.28.2（pnpm が入れたものを PATH に置いた）。
- 添付の確認には、リポジトリの `internal/interop/testdata/upload.mjs` を使った。ブラウザのエディタと同じ
  `packages/protocol` を使って、画像を暗号化してアップロードするゲスト。

## 躓いた点と対処

1. **Cloudflare 用の設定のままでは起動しない。**

   ```text
   Error: `celld deploy` does not support these config keys: env, keep_vars, observability, preview_urls, previews, ratelimits, routes, workers_dev.
   Deploy this project with Wrangler instead, or remove them.
   ```

   対応しているキーだけで celld 用の `wrangler.jsonc` を書いた。

2. **`main` と `assets.directory` はプロジェクトの中でないといけない。**
   ```text
   Error: config `main` must be a path inside the project
   Error: config `assets.directory` must be a path inside the project
   ```

   `packages/` をまるごと別の場所にコピーし、`web/dist` を `worker/public` に移して、次の設定にした。

   ```jsonc
   {
     "name": "edit",
     "main": "./src/index.ts",
     "compatibility_date": "2026-08-20",
     "assets": {
       "directory": "./public",
       "not_found_handling": "single-page-application",
       "run_worker_first": ["/api/*"]
     },
     "durable_objects": { "bindings": [{ "name": "ROOM", "class_name": "Room" }] },
     "migrations": [{ "tag": "v1", "new_sqlite_classes": ["Room"] }],
     "r2_buckets": [{ "binding": "BLOBS", "bucket_name": "edit-blobs" }]
   }
   ```

3. **画像の再アップロードがタイムアウトした。** celld の問題ではなかった。ホストは、文書中でリンクされている画像しか
   再アップロードしない（`internal/attach` の `allowedHash`）。ホストの文書に `![](assets/<hash>.png)` を足したら通った。

## 実行と結果

起動。

```sh
celld dev . --port 8787 --logs
```

```text
Your Worker has access to the following bindings:
Binding              Resource
env.ROOM (Room)      Durable Object (SQLite)
env.BLOBS (R2)       edit-blobs
...
  ready  http://127.0.0.1:8787
```

ホストは `.pedit/config.yaml` に `server: http://127.0.0.1:8787` を書いて `pedit notes.md`、ゲストは表示された共有 URL を
`pedit <URL> -d .` に渡して参加させた。

| 確かめたこと | 結果 |
| --- | --- |
| `GET /`（Workers Assets）、`POST /api/rooms` | 200、201 |
| ホストの接続、ゲストの参加 | `● root is here` が両方に出た |
| ホストのファイルを書き換える → ゲストのファイルに反映 | 反映された |
| ゲストのファイルを書き換える → ホストのファイルに反映 | 反映された |
| ゲストが画像を暗号化して PUT → ホストが GET・復号して保存 | `stored assets/9877….png`、ホストに `Saved an image to assets/…` |
| ゲストが未アップロードの画像を GET | 404 |
| ゲストが `want` を送る → ホストがディスクから再アップロード → ゲストが復号 | `wanted 89504e470d0a1a0a6561726c69657220696d616765`（元の PNG のバイト列と一致） |
| ホストを Ctrl+C | ゲストに `The host closed the room.` |
| ホストが抜けた後の R2 | `rooms/<DO の id>/` 配下が 2件 → 0件 |

`celld dev` の R2 はプロジェクト内の `.celld/dev/objects.sqlite3` に入る。`objects` テーブルの `key` が
`r2/edit-blobs/rooms/<DO の id>/<blob id>` の形で、これを読んで削除前後を比べた。

## そこから読み取れること

- タグ付きの `acceptWebSocket` / `getWebSockets(tag)` / `getTags` は celld でも動く。ホストが抜けたらゲストを閉じる
  `closeIfHostLeft` が期待通りに働いたので、タグの取得も、閉じた接続の除外も効いている。
- R2 の `head` / `put` / `get` / `list` と、配列での一括 `delete` も動く。
- rate limiting のバインディングは設定から外したので、`overLimit()` はバインディングがない扱いで素通りする。落ちはしないが、
  セルフホストではレート制限が効かない（[[workers-rate-limiting-binding]]）。
- 移植に必要だったのは設定だけだった。Cloudflare 向けの設定と celld 向けの設定を2つ持ち、アセットをプロジェクト内に置く
  ビルド手順を足せば、pedit を Cloudflare の外で動かせる見込みが立つ。

## 確かめていないこと

- 複数 node と S3 互換バケットでの運用。cell が別の node に移るとホストの接続も 1012 で閉じる。そのとき
  `closeIfHostLeft` が走って添付が消えるのか、ホストの再接続で部屋が続くのかは未確認。
- ブラウザのエディタからの編集。今回は CLI と、テスト用の JS クライアントだけで確かめた。
- リバースプロキシの後ろでの動作。`allowedOrigin()` は `request.url` の origin と `Origin` ヘッダーを比べるので、
  Host ヘッダーを保ったまま渡す必要があるはず（推測）。

## 理解度チェック

```quiz
pedit の worker を celld で動かすのに、コードと設定のどちらを変える必要があったか。
---
設定だけ。Cloudflare 専用のキーを外し、`main` と `assets.directory` をプロジェクト内に収めた celld 用の `wrangler.jsonc` を用意すれば、worker のコードはそのまま動いた。
```

```quiz
celld でレート制限のバインディングを外しても pedit の worker が落ちないのはなぜか。
---
`overLimit()` がバインディングのないときに `false` を返して素通りするから。代わりにセルフホストではレート制限が効かなくなる。
```

```quiz
単一 node の `celld dev` での確認では足りず、複数 node で別に確かめるべき pedit 固有の挙動は何か。
---
cell の移動でホストの WebSocket が 1012 で閉じたときの挙動。`closeIfHostLeft` が走ってゲストを閉じ、添付を消してしまうかもしれない。
```

## 出典

- [denoland/celld](https://github.com/denoland/celld) v0.6.2 の [docs/cloudflare-compat.md](https://github.com/denoland/celld/blob/main/docs/cloudflare-compat.md)、[docs/services/durable-objects.md](https://github.com/denoland/celld/blob/main/docs/services/durable-objects.md)
- [piconic-ai/pedit](https://github.com/piconic-ai/pedit) の `packages/worker/src/index.ts`、`packages/worker/src/room.ts`、`packages/worker/wrangler.jsonc`、`internal/attach/attach.go`、`internal/interop/testdata/upload.mjs`

#celld #pedit #durable-objects #self-host
