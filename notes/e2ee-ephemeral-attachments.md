---
created: 2026-09-28
updated: 2026-10-03
title: E2E 暗号化した共同編集に画像添付を足す設計
description: "URL の fragment の鍵で E2E 暗号化した共同編集に、画像添付を足す設計。正本はローカルに置き、セッション中だけ暗号文を R2 に置く。blobId を HMAC にする理由。"
tags: [e2ee, cloudflare, r2, durable-objects, design]
---
# E2E 暗号化した共同編集に画像添付を足す設計

URL の fragment に置いた鍵でエンドツーエンド暗号化している共同編集ツールに、画像の貼り付けを足すときの設計。
ima（`ima <file>` でローカルファイルをブラウザと共同編集する CLI。現在の [[pedit]]）で実装した。前提は「ホストのローカル
ファイルが正」「サーバーは中身を知らない」の2つ。

## 検討して捨てた案

- **公開 URL の画像置き場（Signed URL で上げて URL を挿入）。** ima の外でも表示できるようにするには平文で
  置くしかなく、E2E が崩れる。Signed URL は期限付きなので Markdown に書くとリンク切れになり、恒久的な
  公開 URL にすると保存期間・削除要求・モデレーションを抱える。Signed URL が向いているのはアップロード側だけ。
- **WebSocket のリレーで画像の中身を流す。** リレーはブロードキャストなので転送量が参加人数に比例し、
  ima の Worker が課しているメッセージ上限（1 MiB/フレーム）のためにチャンク分割か強い縮小が要る。

## 採用した形: 正本はローカル、運搬は暗号文の一時置き場

- 貼った画像はホストのディスクに `assets/<hash>.<ext>` として保存し、文書には相対パスでリンクする。
  Markdown はそのまま commit でき、GitHub 上でも表示される。
- セッション中の運搬は R2 経由。ブラウザが暗号化して `PUT /api/rooms/:id/blobs/:blobId` し、リレーには
  数十バイトの制御メッセージ（announce / want / stored / rejected）だけを流す。
- R2 に置くのは暗号文だけで、ホストが接続している間だけ。ホストが抜けたら Durable Object が prefix ごと
  消し、漏れは R2 の lifecycle ルール（1日）で消す。
- 途中参加者は文書中のリンクから blobId を計算して直接 GET する。404 なら `want` を送り、ホストがディスク
  から読んで再アップロードする。正本がディスクにあるので、ホストのネットワークが一瞬切れて blob が消えても
  この経路で戻る。
- ホストは awareness に `attachments: {dir, maxBytes}` を載せ、ブラウザはそれが見えたときだけ貼り付けを
  有効にする。古い CLI には何も送らない。

## 鍵と名前

- 部屋の鍵から HKDF-SHA256 で2本導出する（info を `ima blob enc v1` と `ima blob id v1` に分ける）。
  フレーム用の鍵とも分けるのは、blob をフレームとして再生（replay）されないようにするため。
- ファイル名の `hash` は平文の SHA-256 の先頭 128bit。
- サーバー上の `blobId` は `HMAC(id 鍵, hash)` の先頭 128bit。平文の hash をそのまま ID にすると、
  サーバーが「既知のこの画像が上がった」と照合できてしまう（confirmation attack）。HMAC にすると部屋を
  またいだ同一性も見えない。一方で部屋のメンバーはリンクの hash から blobId を計算できる。
- 受け手は AES-GCM の認証に加えて、復号した中身の SHA-256 が hash と一致するかも確かめる。同じ blobId
  への PUT は最初の1回が勝つので、鍵を持つ誰かが別の中身を先に置く可能性があるため。

## 理解度チェック

```quiz
blobId を平文の SHA-256 ではなく HMAC にするのはなぜ?
---
平文の hash がサーバーに見えると、既知の画像と照合されてしまうため。部屋の鍵から導いた鍵で HMAC にすれば、サーバーには照合も部屋をまたいだ突き合わせもできない。
```

```quiz
ホストの一時的な切断で R2 の blob が消えても、画像が戻ってくるのはなぜ?
---
正本がホストのディスクにあるから。ゲストの GET が 404 になると `want` を送り、ホストが `assets/` から読んで再アップロードする。
```

## 出典

- [piconic-ai/ima#15](https://github.com/piconic-ai/ima/issues/15)（設計の議論）、
  [#39](https://github.com/piconic-ai/ima/pull/39)（protocol）、
  [#40](https://github.com/piconic-ai/ima/pull/40)（Worker と R2）、
  [#41](https://github.com/piconic-ai/ima/pull/41)（ホスト）、
  [#42](https://github.com/piconic-ai/ima/pull/42)・[#43](https://github.com/piconic-ai/ima/pull/43)（Web）

関連: [[durable-objects-await-gap]]、[[jpeg-lossless-metadata-stripping]]、[[cloudflare-workers]]

#e2ee #cloudflare #r2 #durable-objects #design
