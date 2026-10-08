---
created: 2026-10-08
updated: 2026-10-08
title: pedit のワイヤーフォーマットと Yjs の同期手順
description: pedit の参加者どうしが、何を送り合って同じ文書に揃うか。
tags: [pedit, yjs, crdt, websocket]
---
# pedit のワイヤーフォーマットと Yjs の同期手順

[[pedit]] の参加者どうしが、何を送り合って同じ文書に揃うか。線の上を流れる1フレームの形と、繋いだ直後の手順、切れたときの
繋ぎ直しを、`internal/protocol/room.go`（Go）と `packages/protocol/src/room.ts`（TypeScript）で追う。両方とも同じ手順を
実装している（[[pedit-source-layout]]）。v0.1.0。

## 1フレームの形

WebSocket のバイナリフレーム1つが、暗号化したメッセージ1つ。

```text
iv (12 バイト) || AES-GCM(部屋の鍵, type (1 バイト) || payload)
```

`type` は 0 が sync、1 が awareness、2 が attachment（画像）、3 が canvas。知らない `type` は捨てる（エラーにしない）ので、
新しいメッセージ型を足しても古い相手は困らない。版を上げるのは、古い相手が無視できない変更のときだけで、その版は
WebSocket の subprotocol `pedit-v1` として申し出る（[[pedit-room-relay]]）。

暗号化は送る直前、復号は受けた直後に行い、中継サーバーはその間の暗号文だけを見る（[[pedit-keys-and-encryption]]）。

## Yjs の最低限

文書は CRDT で、参加者それぞれが完全な複製（Y.Doc）を持つ。編集は「どの参加者（`clientID`）の何番目の操作か」で識別される
操作の列になり、参加者はこの操作（**update**）を交換する。同じ操作を2回当てても結果は変わらず、順序が入れ替わっても最終的に
同じ状態に収束する。pedit は Y.Doc の中に `content` という名前の Y.Text を1つ置き（canvas の部屋は別、[[pedit-canvas-flow]]）、
ブラウザは Yjs、Go は ygo（[[ygo-yjs-nested-types]]）でそれを持つ。

**state vector** は「各参加者の操作を何番目まで知っているか」の表。これを相手に渡すと、相手は「自分が持っていて相手が持たない
操作」だけを選んで返せる。y-protocols の sync メッセージはこの3種類。

| 種別 | 中身 | 受けた側の動き |
| --- | --- | --- |
| SyncStep1（0） | 自分の state vector | 相手に足りない操作を SyncStep2 で返す |
| SyncStep2（1） | 操作の列（差分、または全状態） | 自分の Y.Doc に当てる |
| Update（2） | 操作の列（編集1回分） | 自分の Y.Doc に当てる |

## 繋いだ直後の手順

サーバーは誰にも返事をしない（暗号文を配るだけ）ので、参加者どうしで対称な手順を踏む。

```canvas
{
  "nodes": [
    {"id": "new", "type": "group", "x": 0, "y": 0, "width": 290, "height": 456, "label": "新しく繋いだ人"},
    {"id": "old", "type": "group", "x": 330, "y": 0, "width": 290, "height": 456, "label": "すでにいる人（全員）"},
    {"id": "n1", "type": "text", "x": 24, "y": 48, "width": 242, "height": 56, "text": "SyncStep1\n自分の state vector を送る"},
    {"id": "o1", "type": "text", "x": 354, "y": 152, "width": 242, "height": 56, "text": "足りないぶんを\nSyncStep2 で返す"},
    {"id": "n2", "type": "text", "x": 24, "y": 256, "width": 242, "height": 56, "text": "SyncStep2\n自分の全状態を送る"},
    {"id": "o2", "type": "text", "x": 354, "y": 360, "width": 242, "height": 72, "text": "届いた操作を当てる\n（持っているものは無視）\nawareness を送り返す"}
  ],
  "edges": [
    {"id": "e1", "fromNode": "n1", "toNode": "o1", "fromSide": "right", "toSide": "top", "label": "①"},
    {"id": "e2", "fromNode": "o1", "toNode": "n2", "fromSide": "bottom", "toSide": "right", "style": "dashed", "label": "② 差分"},
    {"id": "e3", "fromNode": "n2", "toNode": "o2", "fromSide": "right", "toSide": "top", "label": "③ 全状態 + 自分の awareness"}
  ]
}
```

接続が開くと、両実装とも同じ3つを続けて送る（Go は `Client.serve`、TypeScript は `socket.onopen`）。

1. **SyncStep1** に自分の state vector。相手全員が、こちらに足りない操作を SyncStep2 で返してくる。
2. **SyncStep2** に自分の全状態（`EncodeStateAsUpdate` / `writeSyncStep2` を state vector なしで）。相手はこれを当てるが、
   すでに持っている操作は無視されるので、重複は害にならない。これで「相手が持っていない自分の操作」も渡る。
3. **awareness** に自分の状態（名前、役割、カーソルなど）。

受信側は SyncStep1 を受けたら必ず SyncStep2 で答える（Go は `ysync.ApplySyncMessage` の戻り値、TypeScript は
`syncProtocol.readSyncMessage` が encoder に書いたもの）。部屋に3人いれば新しい人には3通の SyncStep2 が届く。
全員が文書全体で答えるので、満員の部屋が一斉に再接続すると量が膨らむ。サーバー側の接続ごとのバイト許容量が緩いのは
そのため（[[durable-object-per-connection-allowance]]）。

Go 側は最初の SyncStep2 を当てた時点で `OnSynced` を1回呼ぶ。CLI からの参加はこれを待ってからファイルを書く
（[[pedit-guest-join-flow]]）。`TestLateJoinerGetsFullDocument` と `TestReportsSyncedOnceWithTheDocument` がこの手順を確かめている。

## 編集が流れる経路

ローカルで文字を打つと Y.Doc が `update` イベントを出す。`origin` を見て、自分（`Client`）以外から来た更新なら
`Update` メッセージにして送る。

```go
func (c *Client) handleDocUpdate(update []byte, origin any) {
	if origin == c {
		return
	}
	c.send(MessageSync, ysync.EncodeUpdate(update))
}
```

逆に、受信した操作は `origin` を `Client` にして当てる。こうすると上の判定で送り返されない（エコーの防止）。ホストの
`Session` はこの `origin` を見て、リモートから来た更新だけをファイルに書き戻す（[[pedit-file-sync]]）。

Go 側は受信した操作を当てる間 `applying` ロックを取る。`Client.Do(fn)` は同じロックを取って `fn` を実行するので、
文書を「読んでから変える」処理をリモートの編集に割り込まれずにできる。

## awareness

y-protocols の awareness は、文書とは別に「今ここにいる人の状態」を配る仕組み。`clientID` ごとに `{clock, state}` を持ち、
`state` は JSON（pedit では `role`、`name`、`user`、`file`、`attachments`、`format`、カーソル位置など）。payload は
`varbytes(encodeAwarenessUpdate(...))`。

- 自分の状態が変わったら、その差分を送る（`handleAwarenessUpdate`）。
- 誰かが新しく現れたら（`change` の `added`）、自分の状態を即座に送り直す。次の定期更新まで待たせないため。
- 30秒黙った相手は消える。Go のホストは `keepAlive` が15秒ごとに `Heartbeat()` を打つ。ブラウザの `Awareness` は自分でやる。
- 切断したら、相手の状態をローカルから消す（`dropRemoteAwareness`）。
- 退室時は自分の状態を `nil` にして送る。これが「抜けた」の通知になる。

ホストの `file` と `attachments` と `format` がここに乗るので、ブラウザは awareness を見て初めてファイル名や画像の可否を知る。

## 切れたときと繋ぎ直し

`Client.run`（Go）と `scheduleReconnect`（TypeScript）は同じ方針。

- 切れたら指数バックオフで繋ぎ直す。最小 500 ms、2倍ずつ、最大 30秒、それに 0.5〜1.0 倍の揺らぎ。
- 4005（混雑）なら最低 10秒待つ。
- 4001 / 4002 / 4003 / 4004 / 4006 は最終状態で、繋ぎ直さない。Go は `finalStatus` の表、TypeScript は `FINAL_CLOSE`。
  4006 だけは人が `Resume()`（ブラウザは Reconnect ボタン、CLI は Enter）で同じ部屋に戻れる。
- **切れている間に送ろうとしたフレームは捨てる。** `send` は接続がなければ何もしない。文書と awareness は繋ぎ直したときの
  手順（上の①〜③）で全部揃うので、溜めておく必要がない。画像と canvas のメッセージはこの手順に乗らないので、
  `Attachments.reconnected()` や `JsonPane.reconnected()` が自分で送り直す（[[pedit-attachments-flow]]）。

送信の順序は、Go では `outbox` が1つのゴルーチンで順に書き、TypeScript では暗号化が非同期なので `sendChain` という Promise の
鎖で順序を守る。退室時、Go は `drain` で最大5秒、TypeScript は `await this.sendChain` で、キューを流し切ってから閉じる。

## 読む側の上限

Go のクライアントは1フレーム 64 MiB まで読む（`maxFrameBytes`）。サーバーが 1 MiB で切るので実際にはそこまで来ないが、
サーバーを信用しない前提で自分でも上限を持つ。

## 理解度チェック

```quiz
繋いだ直後に SyncStep1 だけでなく SyncStep2（全状態）も送るのはなぜか。
---
サーバーが返事をしないので、相手の state vector を聞いてから差分を作る往復ができないから。自分の全状態を先に送れば、相手が持っていない操作も渡り、持っているぶんは無視される。
```

```quiz
受信した操作を Y.Doc に当てるとき、`origin` に `Client` 自身を入れるのはなぜか。
---
`update` イベントの `origin` が `Client` なら送らない、という判定で、受けた操作をそのまま送り返すエコーを防ぐため。ホストはこの `origin` で「リモートから来た」更新だけをファイルに書き戻す。
```

```quiz
切れている間に送ろうとした文書の更新は、繋ぎ直したときどうなるか。
---
捨てられているが、繋ぎ直しの手順（SyncStep1 → 相手の SyncStep2、自分の SyncStep2）で差分が全部揃うので失われない。画像と canvas のメッセージだけは手順に乗らないので、それぞれが送り直す。
```

## 出典

- [piconic-ai/pedit](https://github.com/piconic-ai/pedit) v0.1.0 の `internal/protocol/room.go`、`internal/protocol/message.go`、`packages/protocol/src/room.ts`、`packages/protocol/src/message.ts`、[CONTRIBUTING.md](https://github.com/piconic-ai/pedit/blob/main/CONTRIBUTING.md) のワイヤーフォーマットの節
- [yjs/y-protocols](https://github.com/yjs/y-protocols) の `sync.js`、`awareness.js`（メッセージ種別と state vector の扱い）

#pedit #yjs #crdt #websocket
