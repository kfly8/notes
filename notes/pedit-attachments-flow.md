---
created: 2026-10-08
updated: 2026-10-08
title: pedit で画像を貼ったときの処理の流れ
description: pedit のブラウザ画面に画像を貼ってから、ホストの assets/ に保存され、文書にリンクが入るまでのコードの手順。
tags: [pedit, e2ee, r2, go, typescript]
---
# pedit で画像を貼ったときの処理の流れ

[[pedit]] のブラウザ画面に画像を貼ってから、ホストの `assets/` に保存され、文書にリンクが入るまでのコードの手順。設計の
判断（なぜ R2 に暗号文を置くか、なぜ `blobId` が HMAC か）は [[e2ee-ephemeral-attachments]] にあり、ここでは
`packages/web/src/paste.ts`、`attachments.ts`、`internal/attach/attach.go` が実際に何をするかを追う。サーバー側の blob の扱いは
[[pedit-room-relay]]、鍵は [[pedit-keys-and-encryption]]。v0.1.0。

## 貼ってから保存されるまで

```canvas
{
  "nodes": [
    {"id": "b", "type": "group", "x": 0, "y": 0, "width": 190, "height": 640, "label": "ブラウザ"},
    {"id": "s", "type": "group", "x": 215, "y": 0, "width": 190, "height": 640, "label": "中継 + R2"},
    {"id": "h", "type": "group", "x": 430, "y": 0, "width": 190, "height": 640, "label": "ホストの pedit"},
    {"id": "b1", "type": "text", "x": 16, "y": 48, "width": 158, "height": 72, "text": "貼る\n形式判定、メタデータ除去、\nhash を計算、暗号化"},
    {"id": "s1", "type": "text", "x": 231, "y": 160, "width": 158, "height": 56, "text": "PUT /blobs/<blobId>\n暗号文を R2 に置く"},
    {"id": "b2", "type": "text", "x": 16, "y": 272, "width": 158, "height": 56, "text": "announce{hash, mime}\nを部屋に送る"},
    {"id": "h1", "type": "text", "x": 446, "y": 384, "width": 158, "height": 88, "text": "GET /blobs/<blobId>\n復号、hash を照合、\n中身から拡張子を決め、\nassets/<hash>.png に保存", "color": "4"},
    {"id": "b3", "type": "text", "x": 16, "y": 528, "width": 158, "height": 72, "text": "stored{hash, path}\nを受け、カーソル位置に\n![](assets/…) を挿入"}
  ],
  "edges": [
    {"id": "e1", "fromNode": "b1", "toNode": "s1", "fromSide": "right", "toSide": "top"},
    {"id": "e2", "fromNode": "s1", "toNode": "b2", "fromSide": "bottom", "toSide": "right", "style": "dashed", "label": "201"},
    {"id": "e3", "fromNode": "b2", "toNode": "h1", "fromSide": "right", "toSide": "top", "label": "暗号化したフレーム"},
    {"id": "e4", "fromNode": "h1", "toNode": "b3", "fromSide": "bottom", "toSide": "right", "label": "暗号化したフレーム"}
  ]
}
```

強調した箱が、ディスクに書く唯一の場所。ホストは相手の言い分を信用せず、中身を自分で確かめてから書く。

### ブラウザ側（`paste.ts`、`attachments.ts`）

1. `imagePaste` 拡張が貼り付けとドロップを受ける。まず `whyNoImages` で貼れない理由を確かめる。部屋が閉じている、接続中、
   ホストがまだ見えない、ホストの awareness に `attachments` がない（古い pedit）、のどれかなら通知を出して終わる。
2. 画像ごとにカーソル位置の**スロット**を `StateField` に置く。スロットの位置は、その後の自分や相手の編集に合わせて動く。
   保存を待つ間に文書が変わっても、リンクは貼った場所に入る。
3. `Attachments.upload(file)`。`prepareImage` が先頭のバイトから PNG / JPEG / GIF / WebP を判定し（SVG は不可）、メタデータを
   画素に触れずに落とし（[[jpeg-lossless-metadata-stripping]]、[[png-webp-metadata-chunks]]）、ホストの `maxBytes` を超えて
   いれば縮小する。
4. `contentHash`（SHA-256 の先頭16バイト）を計算。同じ `hash` の処理が進行中なら、その結果を待つだけ。
5. `encryptBlob` で暗号化し、`PUT /api/rooms/<id>/blobs/<blobId>` に `X-Pedit-Admission` 付きで送る。409（同じ id を誰かが
   上げている）と 503（同時アップロードが上限）は 500 ms 待って最大5回やり直す。410 は部屋が閉じた、413 は大きすぎる、
   429 は部屋の容量超え、として通知の文言に変わる。
6. `announce{hash, mime}` を部屋に送り、`stored` を30秒待つ。
7. `stored{hash, path}` が来たら、スロットの位置に `![](assets/<hash>.png)` を挿入する（パスに空白や括弧があれば `<...>` で囲む）。
   アップロードした画像はメモリに覚えるので、プレビューはすぐ出る。`rejected{hash, reason}` なら理由を通知に出し、
   スロットを消す。

切断中に送った `announce` は捨てられるので（[[pedit-wire-format-and-sync]]）、`reconnected()` が待っている `hash` を
送り直す。

### ホスト側（`attach.go`）

`Session` は受信ループから `attachments.Handle(m)` を呼ぶ。`Handle` は `announce` と `want` だけを64個のキューに入れ、
満杯なら捨てて報告する。受信ループを止めないため。別のゴルーチン（`run`）が1つずつ処理する。

`announce` を受けたら（`announced`）:

1. `mime` が4種類のどれでもなければ `rejected{type}`。
2. すでに保存済みで、ファイルがまだ通常ファイルとしてあれば `stored` を返すだけ。
3. `GET /api/rooms/<id>/blobs/<blobId>`（2分でタイムアウト、10 MiB + 28バイトまで読む）。404 なら「言ったのに無い」で
   `rejected{invalid}`、410 なら部屋が閉じたので終わり。
4. `BlobKeys.Decrypt(data, hash)`。復号に失敗、または中身の SHA-256 が `hash` と合わなければ `rejected{invalid}`。
5. 拡張子は `http.DetectContentType` で**中身から**決める。`mime` の申告は信用しない。4種類以外なら `rejected{type}`。
6. この セッションで保存した個数が500、合計が 100 MiB を超えるなら `rejected{quota}`。
7. `save`。`assets/` を作り（通常のディレクトリで、ファイルのディレクトリの外に出ていないことを確かめる）、同名のファイルが
   すでにあれば中身が `hash` と合うときだけ流用し、なければ一時ファイルに書いて rename。
8. `hash` を `stored` と `allowed` に登録し、`stored{hash, path}` を返す。端末には `Saved assets/<hash>.png` のように出る。

## 後から入った人が画像を見るまで

プレビューは `assets/<hash>.<ext>` へのリンクを見つけると `Attachments.lookup(src)` を呼ぶ。

1. メモリのキャッシュ（64 MiB、LRU）にあれば blob: URL を返す。画面に出ている分は追い出さない
   （[[lru-eviction-render-feedback-loop]]）。blob: URL は DOMPurify を通すときに自分が作ったものだけを許す
   （[[dompurify-blob-url]]）。
2. なければ `GET /blobs/<blobId>`。あれば復号して `hash` を照合し、キャッシュに入れて再描画。
3. 404 なら、200 ms の間に見つからなかった `hash` をまとめて `want{hashes}` を1通送り、10秒待つ。R2 の暗号文はホストが
   抜けると消えるし、ホストの一瞬の切断でも消えうるため。
4. ホストの `wanted` は、`hash` ごとに `allowedHash` を確かめる。許すのは、ホストのディスクから読んだ文書に参照があった
   `hash`、ホスト自身の外部編集で増えた参照、このセッションで保存した `hash` だけ。相手の編集で文書に書かれただけの
   参照は許さない（`assets/` にある無関係なファイルを `want` で吸い出されないため。`TestDoesNotUploadUnreferencedSiblingImage`）。
   同じ `hash` は5秒に1回しか上げ直さない。
5. ディスクから読み、中身の `hash` と形式を確かめ、暗号化して `PUT`（409 / 503 は 500 ms 間隔で5回まで）、`announce` を送る。
6. ブラウザは `announce` を受けると、待っていた `hash` なら改めて `GET` する。

`want` の `hashes` は1通256個まで（`MaxWantHashes`）。

## 外部編集と画像の参照

ホストの `syncFromDisk` は、取り込んだ外部編集について `AllowLocalChanges(base, next)` を呼び、**新しく増えた**参照だけを
`allowed` に足す。`base` にあった参照は、相手の編集で入ったものかもしれないので、ホストが別の場所を直しただけでは
許可にならない（`TestUnrelatedLocalEditDoesNotAuthorizePeerImageReference`）。

## 時間と上限の一覧

| 何 | 値 | どこ |
| --- | --- | --- |
| `stored` を待つ | 30秒 | `attachments.ts` |
| `want` をまとめる / 待つ | 200 ms / 10秒 | `attachments.ts` |
| PUT の再試行 | 5回、500 ms | 両側 |
| blob の GET / PUT のタイムアウト | 2分 | `attach.go` |
| 上げ直しの間隔 | 5秒 | `attach.go` |
| 1枚 / セッション合計 / 個数（ホスト側） | 10 MiB / 100 MiB / 500 | `attach.go` |
| ブラウザのキャッシュ | 64 MiB | `attachments.ts` |

## 理解度チェック

```quiz
ホストは画像の拡張子を何から決めるか。
---
復号した中身の先頭バイト（`http.DetectContentType`）。`announce` の `mime` は信用せず、4種類に当てはまらなければ `rejected{type}` を返す。
```

```quiz
`want` を受けたホストが、文書にリンクがあっても上げ直さない `hash` があるのはなぜか。
---
相手の編集で文書に書かれただけの参照を許すと、`assets/` にある無関係なファイルを `want` で吸い出せてしまうから。許すのはホストのディスクの文書にあった参照、ホスト自身の編集で増えた参照、このセッションで保存したものだけ。
```

```quiz
ブラウザは画像のリンクを、アップロードのどの時点で文書に入れるか。
---
ホストから `stored{hash, path}` が返ってきたとき。それまではカーソル位置のスロットだけを持ち、保存されていないファイルを指すリンクが文書に入らないようにする。
```

## 出典

- [piconic-ai/pedit](https://github.com/piconic-ai/pedit) v0.1.0 の `packages/web/src/paste.ts`、`packages/web/src/attachments.ts`、`packages/web/src/image.ts`、`internal/attach/attach.go`、`internal/protocol/attachment.go` と各テスト

#pedit #e2ee #r2 #go #typescript
