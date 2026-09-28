---
created: 2026-09-28
updated: 2026-09-28
title: Durable Object は R2 や fetch を待つ間に別のリクエストを受ける
description: "Durable Object の input gate が止めるのはストレージ操作の間だけで、R2 や fetch() を待つ間は別のリクエストが入る。容量の予約と後片付けの競合をどう防いだか。"
tags: [cloudflare, durable-objects, concurrency]
---
# Durable Object は R2 や fetch を待つ間に別のリクエストを受ける

Durable Object は1つのインスタンスで処理が直列化されるが、`await` の間は別だ。input gate が止めるのは
ストレージ操作を待っている間だけで、`fetch()` や R2 の呼び出しを待っている間は、次のリクエストや WebSocket
のイベントが届く。「同じ部屋の処理はどうせ直列」と考えて書くと競合する。

[[e2ee-ephemeral-attachments]] で、部屋ごとの容量上限を Durable Object に持たせたときに踏んだ。

## 容量は await の前に予約する

「使用量を読む → R2 に書く → 使用量を足す」だと、R2 を待つ間に別の PUT が同じ使用量を読んで上限をすり抜ける。
読みと加算を await より前に同期的に済ませ（SQLite バックエンドの DO なら `ctx.storage.kv` が同期 API）、
失敗したら戻す。同じ ID のアップロードの排他も、最初の await（R2 の `head`）より前にメモリ上の Set で取る。
`head` の後で確かめると、`head` を待つ間に先行のアップロードが終わって Set から消え、すり抜ける。

## 後片付けと再接続を世代番号で区切る

ホストが抜けたら blob を消す、という後片付けも await を挟む（R2 の `list` と `delete`）。その間にホストが
自動で再接続すると、新しいセッションのリクエストが走り出し、後片付けがそれを消してしまう。

- ホストが抜けた時点で世代番号を進め、使用量をその場で消す。
- 後片付けの Promise を保持し、blob のリクエストは冒頭でそれを待つ。待っている間にさらに別のセッションが
  終わって Promise が差し替わることがあるので、変わらなくなるまで待ち直す。
- アップロードは開始時の世代を覚えておき、終わったときに世代が変わっていたら自分の blob を消して 410 を返す。
  予約の返却もしない（予約は終わったセッションと一緒に消えている）。

世代番号はメモリに持つだけでよい。hibernation 中は処理中のリクエストがないので、失っても困らない。

## 理解度チェック

```quiz
Durable Object で `await env.BUCKET.put(...)` を待っている間に、同じオブジェクトへの別のリクエストは処理されるか。
---
処理される。input gate が止めるのはストレージ操作の間だけで、R2 や `fetch()` のような外部 I/O の待ちは止めない。
```

```quiz
同じ ID の同時アップロードを弾く Set への登録を、R2 の `head` の後で行うと何が起きるか。
---
`head` を待つ間に先行のアップロードが終わって Set から外れると、後続は「まだない・処理中でもない」と見て二重に予約し、上書きしてしまう。
```

## 出典

- [Durable Objects: Easy, Fast, Correct — Choose three](https://blog.cloudflare.com/durable-objects-easy-fast-correct-choose-three/)（input gate の規則）
- 実装とレビュー: [piconic-ai/ima#40](https://github.com/piconic-ai/ima/pull/40)（競合はどれも [[pullfrog]] のレビューで指摘された）

関連: [[cloudflare-workers]]

#cloudflare #durable-objects #concurrency
