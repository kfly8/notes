---
created: 2026-10-08
updated: 2026-10-09
title: "pedit の中継サーバー: Worker と Room Durable Object"
description: pedit のサーバー側は packages/worker の2ファイルでできている。
tags: [pedit, cloudflare, durable-objects, websocket]
---
# pedit の中継サーバー: Worker と Room Durable Object

[[pedit]] のサーバー側は `packages/worker` の2ファイルでできている。`index.ts` が Hono のルーティングで入口の検査をし、`room.ts` の
`Room` Durable Object が部屋そのものになる。ここを読むと「サーバーは何を知っていて何を知らないか」がコードで確かめられる。
v0.1.0 を読んだ。

## 3つのルートだけ

`index.ts` が受けるのは次の3つで、他のパスは Workers Assets がブラウザ画面（`packages/web/dist`）を返す。

| ルート | 役割 |
| --- | --- |
| `POST /api/rooms` | 部屋を作る。`{id, hostToken}` を返す |
| `GET /api/rooms/:id/ws` | WebSocket の接続。検査して `Room` に渡す |
| `/api/rooms/:id/blobs/:blobId` | 画像の暗号文の GET / PUT。`Room` に渡す |

## 部屋の作成: 何も保存しない

```ts
const hostToken = base64url(crypto.getRandomValues(new Uint8Array(32)))
return c.json({ id: await roomIdFor(hostToken), hostToken }, 201)
```

`roomIdFor` は `hostToken` の SHA-256 を base64url にして先頭22文字を取る。部屋の id はトークンから一方向に決まるので、
サーバーは何も保存しなくても、後で `Authorization: Bearer <token>` を持ってきた相手の `roomIdFor(token)` が id と一致するかで
「この部屋を作った人か」を検証できる。この時点で Durable Object はまだ起きていない。

断る条件が2つ。`MAINTENANCE` 変数が `no-new-rooms` か `closed` なら 503 で、自前サーバーの案内つき。ネットワーク単位の
レート制限（`ROOM_CREATION_LIMIT`、1分に20回、IPv6 は /64 単位）に当たれば 429 と `Retry-After: 60`
（[[workers-rate-limiting-binding]]）。

## WebSocket の受け入れ: Worker での検査

```canvas
{
  "nodes": [
    {"id": "req", "type": "text", "x": 120, "y": 0, "width": 360, "height": 56, "text": "ブラウザ / CLI\nGET /api/rooms/<id>/ws（Upgrade: websocket）"},
    {"id": "worker", "type": "text", "x": 120, "y": 100, "width": 360, "height": 88, "text": "Worker（index.ts）\nid の形式、Upgrade、Origin、メンテナンス、\nレート制限、Bearer → X-Pedit-Host: 1"},
    {"id": "room", "type": "text", "x": 120, "y": 232, "width": 360, "height": 88, "text": "Room.fetch（room.ts）\nプロトコル版、入場トークン、ホストの在室、\n検証、定員 → acceptWebSocket", "color": "4"},
    {"id": "msg", "type": "text", "x": 120, "y": 364, "width": 360, "height": 72, "text": "webSocketMessage\nbinary で 1 MiB 以下、許容量の範囲なら\n送り主以外の全員にそのまま送る"}
  ],
  "edges": [
    {"id": "e1", "fromNode": "req", "toNode": "worker"},
    {"id": "e2", "fromNode": "worker", "toNode": "room", "label": "ROOM.idFromName(id) の DO へ"},
    {"id": "e3", "fromNode": "room", "toNode": "msg", "label": "101 Switching Protocols"}
  ]
}
```

Worker 側（`index.ts`）の検査は上から順にこう並ぶ。

1. id が22文字の base64url でなければ 400。
2. `Upgrade: websocket` でなければ 426。
3. `Origin` ヘッダーがあるのに自分のオリジンと違えば 403。WebSocket は同一オリジンポリシーの対象外なので、他のサイトの
   訪問者のブラウザに中継を使わせないための検査（[[websocket-same-origin-policy-exempt]]）。CLI は `Origin` を送らないので通る。
4. `MAINTENANCE=closed` なら 4006 で断る。
5. ネットワーク単位の接続制限（`CONNECTION_LIMIT`、1分に60回）に当たれば 4005 で断る。
6. 外から来た `X-Pedit-Host` ヘッダーは必ず消す。`Authorization: Bearer <token>` があれば `roomIdFor(token) === id` を確かめ、
   合えば `X-Pedit-Host: 1` を付け、合わなければ 403。
7. `ROOM.idFromName(id)` で Durable Object を引き、リクエストを渡す。

「断る」は HTTP のエラーではなく、`refuse()` が一度 WebSocket を受け入れてから close code 付きで閉じる形で行う。ブラウザは
失敗したアップグレードの HTTP 応答を読めないが、close code は読めるため（[[websocket-refuse-with-close-code]]）。
このとき応答する subprotocol は相手が申し出たものにする。そうしないとハンドシェイク自体が失敗して close が届かない。

## `Room.fetch`: 部屋での検査

`Room` に渡ってからも検査が続く。順序に意味がある。

1. `Sec-WebSocket-Protocol` に `pedit-v<N>` があり、N が自分の `PROTOCOL_VERSION`（1）と違えば 4002（相手が古い）か 4003（サーバーが
   古い）で断る。入場トークンの前に見るのは、更新が必要な相手に、通らない入場検査を繰り返させないため。
2. 同じヘッダーから `pedit-admission.<43文字>` を1つだけ取り出す。なければ 403。
3. ホストでない（`X-Pedit-Host` がない）のにホストが1人もいなければ 4001。ホストのいない部屋には入れない。
4. `authorize(token, isHost)`。トークンの SHA-256 を、`ctx.storage.kv` の `admissionHash` と `timingSafeEqual` で比べる。まだ
   なければ、ホストのときだけ登録する。ゲストは未登録の部屋にトークンを置けない。
5. 定員。接続は全部で `MAX_PEERS = 32` まで、ゲストは `limits().guests` まで（既定 31、公開サーバーは Worker の変数で 4）。
   超えたら 4004。
6. `ctx.acceptWebSocket(server, isHost ? ['host'] : [])` で Hibernation API に接続を預ける。`host` タグが後で効く。
   応答は 101 で、subprotocol は `pedit-v1` だけを返す（トークンは返さない）。

入場トークンは部屋の鍵から HKDF で導いた値で、持っていても復号はできない（[[pedit-keys-and-encryption]]）。部屋の id しか
知らない人が接続枠や画像の容量を使い潰すのを防ぐためのもので、`docs/contributing/room-admission.md` に設計がある。

## メッセージの転送: 解釈しない

```ts
override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
  if (typeof message === 'string') { ws.close(1003, 'binary frames only'); return }
  if (message.byteLength > MAX_MESSAGE_BYTES) { ws.close(1009, 'message too big'); return }
  // ... maintenance, allowance ...
  for (const peer of this.ctx.getWebSockets()) {
    if (peer === ws) continue
    try { peer.send(message) } catch {}
  }
}
```

テキストフレームは 1003、1 MiB を超えたら 1009。`MAINTENANCE=closed` になっていたら全員を 4006 で閉じる（変数だけの
デプロイでは動いている Durable Object が残るので、次のメッセージで閉じる。[[cloudflare-vars-only-deploy-keeps-running-durable-objects]]）。
接続ごとの許容量（メッセージ数は burst 1000・毎秒 200 補充、バイト数は burst 32 MiB・毎秒 1 MiB 補充）を超えたら 1008
（[[durable-object-per-connection-allowance]]）。残ったものを送り主以外の全員に、そのまま送る。中身は復号できないので
解釈も保存もしない。

## ホストが抜けたら部屋を閉じる

`webSocketClose` / `webSocketError` のあと `closeIfHostLeft` が、閉じた接続に `host` タグがあり、他にホストがいなければ:

1. 残りの全員を 4001 `the host left` で閉じる。
2. `generation` を1つ進める（進行中のアップロードが、終わった部屋のものだと分かるように）。
3. `blobUsage` と `admissionHash` を `kv` から消す。
4. `deleteBlobs()` で R2 の `rooms/<DO の id>/` 以下を全部消す。失敗は R2 の lifecycle ルール（1日）に任せる。

Hibernation API のおかげで、部屋はメッセージの合間に眠れる。起きたときは `ctx.getWebSockets()` が接続とタグを復元し、
`kv` の値も残る。メモリにしかない許容量は全員が満タンから始まる。

この `host` タグ、`getWebSockets('host')`、`getTags` と R2 の一括削除は、Cloudflare の外の [[celld]] でもそのまま動いた
（[[celld-pedit-experiment]]）。

## 画像の blob

`Room.blob` が `/blobs/<id>` を受ける。`X-Pedit-Admission` がなければ 403、進行中の後始末（`cleaning`）を待ち、ホストがいなければ
410、トークンを検証して、R2 のキー `rooms/<DO の id>/<blobId>` を触る。

- `GET` — あれば本文を `application/octet-stream` で、なければ 404。
- `PUT` — `Content-Length` 必須（411）。上限は `blobBytes + 28`（AES-GCM の IV とタグ）で超えたら 413。同じ id が進行中なら 409、
  同時アップロードが4つあれば 503 と `Retry-After: 1`。すでにあれば何もせず 200（最初の1回が勝つ）。容量の予約（`blobUsage`、
  既定 100 MiB・500個）を本文を読む前に取り、超えていれば 429。本文を読んで R2 に置き、その間に部屋が終わっていたら消して 410。

`await` の合間に別のリクエストが入る問題（[[durable-objects-await-gap]]）への対処が、`uploading` の Set と `generation` と
予約の順序に現れている。

## 上限の一覧

| 項目 | 既定（自前サーバー） | 公開サーバー `edit.piconic.ai` |
| --- | --- | --- |
| 1部屋の接続（ホスト含む） | 32 | 32 |
| ゲスト | 31 | 4 |
| フレーム | 1 MiB | 1 MiB |
| 画像1枚 | 10 MiB | 5 MiB |
| 画像の合計 / 個数 | 100 MiB / 500 | 50 MiB / 500 |
| 部屋の作成 | 1分に20回（ネットワーク単位） | 同じ |
| 接続 | 1分に60回（ネットワーク単位） | 同じ |

公開サーバーの値は `packages/worker/wrangler.jsonc` の `vars`。自前サーバー用の `packages/wrangler.json` は変数を置かず既定のまま。

## close code の一覧

| code | 意味 | クライアントの動き |
| --- | --- | --- |
| 1003 | テキストフレームを送った | — |
| 1008 | 許容量を超えた | 再接続して同期し直す |
| 1009 | 1 MiB を超えた | — |
| 4001 | ホストが抜けた、またはホストがいない | 止まる。セッション終了 |
| 4002 | クライアントが古い | 止まる。更新を促す |
| 4003 | サーバーが古い | 止まる |
| 4004 | 部屋が満員 | 止まる |
| 4005 | 同じネットワークからの接続が多すぎる | 10秒以上待って再接続 |
| 4006 | メンテナンスで閉じた | 止まる。人が Reconnect / Enter で再開 |

## 理解度チェック

```quiz
サーバーは部屋のホストを、何も保存せずにどう見分けるか。
---
部屋の id を `hostToken` の SHA-256（先頭22文字）から作っているので、`Authorization: Bearer <token>` の `roomIdFor(token)` が id と一致するかで検証できる。一致したときだけ Worker が `X-Pedit-Host: 1` を付けて Room に渡す。
```

```quiz
接続を断るとき、HTTP のエラーではなく一度受け入れてから close code で閉じるのはなぜか。
---
ブラウザは失敗したアップグレードの HTTP 応答を読めず、close code なら読めるから。subprotocol は相手が申し出たものを返す。そうしないとハンドシェイクが失敗して close 自体が届かない。
```

```quiz
`Room.fetch` でプロトコル版の検査を入場トークンの検査より先にするのはなぜか。
---
更新が必要な相手に、通るはずのない入場検査を繰り返させないため。先に 4002 / 4003 で「更新してほしい」と伝える。
```

## 出典

- [piconic-ai/pedit](https://github.com/piconic-ai/pedit) v0.1.0 の `packages/worker/src/index.ts`、`packages/worker/src/room.ts`、`packages/worker/wrangler.jsonc`、[docs/contributing/room-admission.md](https://github.com/piconic-ai/pedit/blob/main/docs/contributing/room-admission.md)、[docs/contributing/deployment.md](https://github.com/piconic-ai/pedit/blob/main/docs/contributing/deployment.md)
- [Cloudflare Durable Objects: WebSocket Hibernation API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

#pedit #cloudflare #durable-objects #websocket
