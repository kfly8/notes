---
created: 2026-09-28
updated: 2026-10-07
title: "DOMPurify で自分が発行した blob: URL だけを通す"
description: "DOMPurify は既定で blob: URL を落とす。ALLOWED_URI_REGEXP を広げず、uponSanitizeAttribute フックの forceKeepAttr で自分が発行した URL だけを残す。"
tags: [dompurify, security, frontend]
---
# DOMPurify で自分が発行した blob: URL だけを通す

DOMPurify は既定で `blob:` の URL を落とす。既定で許されるのは相対 URL と http・https・ftp・ftps・tel・mailto・
callto・sms・cid・xmpp・matrix だけ。メモリ上の画像を `URL.createObjectURL` で `<img src="blob:...">` に
しても、サニタイズを通すと `src` が消える。

`ALLOWED_URI_REGEXP` に `blob:` を足すと、文書に書かれた任意の `blob:` URL まで通ってしまう。Markdown の
プレビューのように文書を書くのが他人なら、自分が発行した URL だけを通したい。

## `uponSanitizeAttribute` で個別に残す

フックで属性ごとに判定し、自分の URL のときだけ `forceKeepAttr` を立てる。

```ts
purify.addHook('uponSanitizeAttribute', (node, data) => {
  if (node.nodeName === 'IMG' && data.attrName === 'src' && images?.owns(data.attrValue)) {
    data.forceKeepAttr = true
  }
})
```

`owns` は、`createObjectURL` で作った URL を入れておいた Set を引くだけ。発行元が知らない `blob:` URL
（文書に生の HTML や Markdown で書かれたもの）は、これまでどおり消える。フックはモジュール全体に1つなので、
描画の間だけ `images` をセットし、終わったら戻す。

## 理解度チェック

```quiz
Markdown のプレビューで `blob:` の画像を表示したいとき、`ALLOWED_URI_REGEXP` に `blob:` を足すのでは何がまずいか。
---
文書に書かれた任意の `blob:` URL まで通ってしまう。自分が発行した URL だけをフックの `forceKeepAttr` で残す方が狭い。
```

## 出典

- [DOMPurify README](https://github.com/cure53/DOMPurify/blob/main/README.md)（既定で許すプロトコルと、フックの `forceKeepAttr`）
- [piconic-ai/ima#43](https://github.com/piconic-ai/ima/pull/43)

関連: [[e2ee-ephemeral-attachments]]、[[pedit-development-notes]]

#dompurify #security #frontend
