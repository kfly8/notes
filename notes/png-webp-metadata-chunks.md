---
created: 2026-09-28
updated: 2026-10-07
title: PNG と WebP のメタデータを持つチャンク
description: PNG と WebP から、画素に触れずにメタデータだけを消すときにどのチャンクを落とせばよいか。
tags: [png, webp, image, privacy]
---
# PNG と WebP のメタデータを持つチャンク

PNG と WebP から、画素に触れずにメタデータだけを消すときにどのチャンクを落とせばよいか。
[[jpeg-lossless-metadata-stripping]] の姉妹ノート。

## PNG

8バイトのシグネチャのあと、チャンクが「長さ（4バイト、ビッグエンディアン）・型（4文字）・データ・CRC（4バイト）」
で並び、`IEND` で終わる。長さはデータ部分だけで、型と CRC を含まない。チャンク単位で落とすだけなので、
残るチャンクの CRC は直さなくてよい。

落とすもの:

- `eXIf`: EXIF（位置情報を含みうる）
- `tEXt`・`zTXt`・`iTXt`: テキスト。XMP は `iTXt`（キーワード `XML:com.adobe.xmp`）に入る
- `tIME`: 最終更新時刻

## WebP

RIFF コンテナ。`RIFF`・サイズ（4バイト、リトルエンディアン）・`WEBP` のあとにチャンクが並ぶ。各チャンクは
FourCC・サイズ（リトルエンディアン）・データで、奇数サイズなら1バイトのパディングが付く。

- `EXIF` と `XMP `（末尾は空白）のチャンクを落とす。
- 拡張形式では先頭の `VP8X` チャンクがフラグを持つ。EXIF（`0x08`）と XMP（`0x04`）のビットを落とさないと、
  無いチャンクがあると宣言したままになる。アルファ（`0x10`）などは残す。
- 最後に RIFF ヘッダのサイズ（全体 − 8）を書き直す。

GIF には EXIF の置き場がないので、そのままでよい。

## 理解度チェック

```quiz
WebP から `EXIF` チャンクを消すときに、チャンクの削除以外に直す場所は?
---
`VP8X` チャンクの EXIF フラグ（`0x08`）と、RIFF ヘッダの全体サイズ。
```

## 出典

- [PNG Specification (Third Edition)](https://www.w3.org/TR/png-3/)
- [WebP Container Specification](https://developers.google.com/speed/webp/docs/riff_container)
- 実装: [piconic-ai/ima#42](https://github.com/piconic-ai/ima/pull/42)

関連: [[pedit]]、[[pedit-development-notes]]

#png #webp #image #privacy
