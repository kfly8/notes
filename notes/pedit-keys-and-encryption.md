---
created: 2026-10-08
updated: 2026-10-08
title: "pedit の鍵と暗号: URL の # 以降から何が導かれるか"
description: pedit の共有リンク https://edit.piconic.ai/r/<id>#<key> の <key> から、何が計算され、何がサーバーに渡り、何が渡らないかを、 internal/protocol（Go）と packages/protocol/src（TypeScript）のコードで確かめる。
tags: [pedit, e2ee, cryptography]
---
# pedit の鍵と暗号: URL の # 以降から何が導かれるか

[[pedit]] の共有リンク `https://edit.piconic.ai/r/<id>#<key>` の `<key>` から、何が計算され、何がサーバーに渡り、何が渡らないかを、
`internal/protocol`（Go）と `packages/protocol/src`（TypeScript）のコードで確かめる。暗号を「なんとなく」でしか知らない前提で、
使われている道具の説明を先に置く。v0.1.0。

## 使われている道具

- **AES-256-GCM** — 共通鍵暗号。同じ32バイトの鍵で暗号化も復号もする。メッセージごとに12バイトの乱数 **IV** を新しく作り、
  暗号文の末尾に16バイトの**認証タグ**が付く。鍵が違うか1ビットでも改ざんされていれば復号が失敗する（黙って変な平文が出る
  ことはない）。pedit のフレームと画像はこれ。
- **SHA-256** — ハッシュ。入力から32バイトの値を作る一方向関数。部屋の id、画像の名前、入場トークンの照合に使う。
- **HKDF-SHA256** — 1つの鍵から、ラベル（`info`）ごとに別の鍵を導く関数。ラベルが違えば導かれる鍵は無関係になり、片方から
  もう片方は分からない。部屋の鍵から用途別の鍵を作るのに使う。
- **HMAC-SHA256** — 鍵付きハッシュ。鍵を知らないと値を計算できず、照合もできない。画像の blob id に使う。

## 秘密の一覧

```canvas
{
  "nodes": [
    {"id": "key", "type": "text", "x": 190, "y": 0, "width": 240, "height": 56, "text": "部屋の鍵（32バイト）\nURL の # 以降。サーバーに渡らない", "color": "4"},
    {"id": "frame", "type": "text", "x": 0, "y": 140, "width": 190, "height": 72, "text": "フレームの暗号化\nAES-GCM の鍵として\nそのまま使う"},
    {"id": "adm", "type": "text", "x": 215, "y": 140, "width": 190, "height": 72, "text": "入場トークン\nHKDF\n\"pedit admission v1\""},
    {"id": "blob", "type": "text", "x": 430, "y": 140, "width": 190, "height": 72, "text": "画像の鍵2本\nHKDF \"pedit blob enc v1\"\nHKDF \"pedit blob id v1\""}
  ],
  "edges": [
    {"id": "e1", "fromNode": "key", "fromSide": "bottom", "toNode": "frame", "toSide": "top"},
    {"id": "e2", "fromNode": "key", "fromSide": "bottom", "toNode": "adm", "toSide": "top"},
    {"id": "e3", "fromNode": "key", "fromSide": "bottom", "toNode": "blob", "toSide": "top"}
  ]
}
```

| 名前 | 誰が作るか | 形 | どこにあるか | 何に使うか |
| --- | --- | --- | --- | --- |
| 部屋の鍵 | ホストの pedit（`GenerateKey`） | 32バイトの乱数 → base64url 43文字 | URL の fragment。各参加者のメモリ | フレームの AES-GCM。他の鍵の元 |
| 入場トークン | 鍵から導く（`AdmissionToken`） | HKDF、32バイト → 43文字 | WebSocket の subprotocol と `X-Pedit-Admission` ヘッダーでサーバーへ | 「この部屋の鍵を持っている」証明 |
| 画像の暗号鍵 | 鍵から導く（`DeriveBlobKeys`） | HKDF、32バイト | 各参加者のメモリ | 画像の AES-GCM |
| 画像の id 鍵 | 鍵から導く（`DeriveBlobKeys`） | HKDF、32バイト | 各参加者のメモリ | blob id の HMAC |
| ホストトークン | サーバー（`POST /api/rooms`） | 32バイトの乱数 → base64url | ホストの pedit。WebSocket の `Authorization` でサーバーへ | ホストである証明。部屋の id の元 |

部屋の id（22文字）はホストトークンの SHA-256 から作られ、URL のパスに出る。誰に見えてもよい経路情報で、サーバーのログにも残る。

## 部屋の鍵がサーバーに渡らない根拠

根拠は2つあり、どちらもコードで確かめられる。

1. **ブラウザは URL の fragment を送らない。** これは HTTP の仕様で、`#` 以降はリクエストに含まれない。ブラウザ画面は
   `location.hash` から鍵を読み（`parseRoomLocation`）、WebSocket の URL は `roomSocketUrl` が `/api/rooms/<id>/ws` として
   fragment なしで組む。
2. **Go のホストは URL を自分で組む。** `session.Start` は `wsURL := "ws" + ... + "/api/rooms/" + room.ID + "/ws"` と鍵を含めずに作り、
   共有 URL だけに `"#" + key` を足す。`TestShareURLKeyNeverReachesServer` が、偽のサーバーで受けた全リクエストに鍵の文字列が
   含まれないことを確かめている。

サーバー側の `wrangler.jsonc` は `observability` でパスとステータスをログに残すが、fragment はそもそも届かない。

## フレームの暗号化

Go の `Cipher`:

```go
func (c *Cipher) Encrypt(plaintext []byte) []byte {
	iv := make([]byte, ivBytes, ivBytes+len(plaintext)+c.aead.Overhead())
	_, _ = rand.Read(iv)
	return c.aead.Seal(iv, iv, plaintext, nil)
}
```

`Seal(dst, nonce, plaintext, additionalData)` の `dst` に IV 自身を渡しているので、戻り値は `iv || 暗号文 || タグ` の1つの
バイト列になる。復号は先頭12バイトを IV として `Open`。TypeScript の `encrypt` は WebCrypto の `subtle.encrypt` で同じ
形を手で組み立てる。平文は `type（1バイト） || payload`（[[pedit-wire-format-and-sync]]）。

鍵が違う相手のフレームは復号が失敗してエラーになるだけで、文書に影響しない（`TestIgnoresPeersWithDifferentKey`）。

## 入場トークン: 鍵を持つ証明を、鍵を渡さずに

```go
token, err := hkdf.Key(sha256.New, key, nil, "pedit admission v1", KeyBytes)
```

HKDF で導いた32バイトを base64url にした43文字を、WebSocket の subprotocol `pedit-admission.<token>` と、画像の
`X-Pedit-Admission` ヘッダーで送る。サーバーは最初のホストのトークンを SHA-256 にして保存し、以後は同じ SHA-256 かを
定数時間で比べる（[[pedit-room-relay]]）。

このトークンを知っても、HKDF は逆算できないので部屋の鍵は分からず、フレームも画像も復号できない。できるのは
「部屋の接続枠と画像の置き場を使う」ことだけ。鍵そのものを送らないのは、サーバーが鍵を知る経路を作らないため。

## 画像の鍵と名前

画像の中身はフレームに乗らず、暗号化して R2 に置く（[[e2ee-ephemeral-attachments]]）。鍵は部屋の鍵から2本導く。

- 暗号鍵（`info: "pedit blob enc v1"`）— 画像の AES-GCM。フレームの鍵と別にするのは、画像の暗号文をフレームとして
  再生（replay）されても復号できないようにするため。
- id 鍵（`info: "pedit blob id v1"`）— blob id の HMAC。

名前は2段階。

| 名前 | 計算 | 誰が知るか |
| --- | --- | --- |
| `hash` | 平文の SHA-256 の先頭16バイト、16進32文字 | 参加者。ファイル名 `assets/<hash>.png` として文書に残る |
| `blobId` | HMAC-SHA256(id 鍵, hash) の先頭16バイト、base64url 22文字 | 参加者が計算してサーバーに渡す。サーバーは `hash` との対応を知らない |

`hash` をそのまま id にすると、サーバーが既知の画像と照合できてしまう。HMAC にすれば部屋の鍵を持つ人だけが文書中の
リンクから id を計算でき、サーバーには照合も部屋をまたいだ突き合わせもできない。

受け取った側は復号したあと、中身の SHA-256 が `hash` と一致するかも確かめる（`BlobKeys.Decrypt`、`decryptBlob`）。
同じ `blobId` への PUT は最初の1回が勝つので、鍵を持つ誰かが別の中身を先に置けるため。

## 両実装が同じ値を出すことの確認

`packages/testdata/blob-vectors.json` に、ある鍵からの導出結果（入場トークン、暗号鍵、id 鍵、`hash`、`blobId`）が固定してある。
Go と TypeScript のテストがそれぞれこの値を再現するので、片方だけ実装を変えると落ちる。HKDF の独立計算によるベクタも
`docs/contributing/room-admission.md` に書いてある。

## サーバーが知るもの、知らないもの

- 知る: 部屋の id、ホストトークン（自分が発行）、入場トークンの SHA-256、接続元の IP、フレームと画像のサイズとタイミング、
  画像の `blobId` と個数と合計サイズ。
- 知らない: 部屋の鍵、文書の中身、参加者の名前（awareness も暗号化されている）、画像の中身と `hash`。

信頼しなければならない相手（配られる JavaScript、参加者の端末、リンクを知る人）は [[pedit]] の信頼モデルの節にある。

## 理解度チェック

```quiz
入場トークンをサーバーに送っても部屋の鍵が漏れないのはなぜか。
---
HKDF で導いた値なので、トークンから元の鍵は逆算できないから。トークンで証明できるのは「鍵を持っている」ことだけで、フレームも画像も復号できない。
```

```quiz
`hash` と `blobId` の2つの名前があるのはなぜか。
---
`hash` は平文の SHA-256 で、文書のリンクと保存ファイル名に使う。それをそのままサーバー上の名前にすると既知の画像と照合されるので、id 鍵で HMAC にした `blobId` をサーバーに渡す。鍵を持つ人は `hash` から `blobId` を計算できる。
```

```quiz
画像の復号に成功したあと、さらに SHA-256 を `hash` と比べるのはなぜか。
---
同じ `blobId` への PUT は最初の1回が勝つので、鍵を持つ別の参加者が先に別の中身を置けるから。認証タグは「鍵を持つ誰かが暗号化した」ことしか保証しない。
```

## 出典

- [piconic-ai/pedit](https://github.com/piconic-ai/pedit) v0.1.0 の `internal/protocol/key.go`、`cipher.go`、`admission.go`、`blob.go`、`packages/protocol/src/key.ts`、`cipher.ts`、`admission.ts`、`blob.ts`、`packages/testdata/blob-vectors.json`、[README の Privacy and security](https://github.com/piconic-ai/pedit#privacy-and-security)、[docs/contributing/room-admission.md](https://github.com/piconic-ai/pedit/blob/main/docs/contributing/room-admission.md)
- [RFC 5869: HKDF](https://www.rfc-editor.org/rfc/rfc5869)、[NIST SP 800-38D: GCM](https://csrc.nist.gov/pubs/sp/800/38/d/final)（道具の説明の裏取り）

#pedit #e2ee #cryptography
