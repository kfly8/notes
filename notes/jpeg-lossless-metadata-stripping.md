---
created: 2026-09-28
updated: 2026-10-07
title: JPEG のメタデータを画質を落とさずに消す
description: 撮影位置などのメタデータを、再エンコードせずにバイト列の操作だけで JPEG から消すやり方。
tags: [jpeg, exif, image, privacy]
---
# JPEG のメタデータを画質を落とさずに消す

撮影位置などのメタデータを、再エンコードせずにバイト列の操作だけで JPEG から消すやり方。canvas で描き直せば
メタデータは消えるが画質が落ちるので、上限を超えて縮小するとき以外は使いたくない。
[[e2ee-ephemeral-attachments]] の貼り付けで実装した。

## 構造

JPEG は `FF D8`（SOI）で始まり、マーカー `FF xx` とその後ろの長さ付きセグメントが並ぶ。長さは2バイトの
ビッグエンディアンで、長さ自身の2バイトを含む。

- APP1（`FF E1`）に EXIF（`Exif\0\0` + TIFF）や XMP が入る。GPS はここ。
- SOS（`FF DA`）のセグメントの後ろに、長さを持たないエントロピー符号化データが続く。
- `FF D9`（EOI）で終わる。

## APP1 を全部消すと写真が横倒しになる

スマホの縦向き写真は、画素を横長のまま保存して EXIF の Orientation（IFD0 のタグ `0x0112`）に6や8を入れて
いることが多い。ブラウザはこのタグを見て回転して表示するので、APP1 を丸ごと消すと横倒しになる。
`createImageBitmap` で縮小する経路も、同じバイト列を読むので直らない。

対処として、Orientation が1以外なら、そのタグだけを持つ最小の APP1 を書き戻す。`Exif\0\0`、ビッグ
エンディアンの TIFF ヘッダ（`MM\0*` + IFD0 のオフセット8）、エントリ1つ（タグ `0x0112`、型 SHORT、個数1、
値）、次の IFD なし。合計26バイトの TIFF になる。元の EXIF は `II`（リトルエンディアン）のこともあるので、
読むときは両方に対応する。

## EOI の後ろにもデータがある

SOS 以降を「残りは全部画像データ」として丸ごと残すと、EOI の後ろに付いたものまで残る。

- Motion Photo は JPEG の末尾に動画（MP4）を付ける。動画側にも位置情報が入りうる。
- Ultra HDR は MPF で gain map（2枚目の JPEG）を後ろに付ける。

エントロピー符号化データの中の `FF` は、必ず `00`（stuffing）か RST0〜7（`D0`〜`D7`）が後に続く。それ以外の
`FF xx` は本物のマーカーなので、そこでスキャンの終わりが分かる。プログレッシブ JPEG はスキャンが複数あって
間に DHT などが挟まるので、スキャンの終わりでパースを打ち切らず、セグメントの読み取りに戻る。EOI に着いたら
そこで出力を打ち切る。

MPF 自体は APP2 なので残る。gain map を切り捨てたあとは、存在しない副画像を指したままになる（表示への影響は
確認していない）。

## 理解度チェック

```quiz
JPEG から APP1 を全部消すと、スマホの縦向き写真がどう表示されるか。それはなぜか。
---
横倒しで表示される。縦向きの写真は画素を横長で保存し、EXIF の Orientation で回転を指示しているため。
```

```quiz
エントロピー符号化データの中で、本物のマーカーをどう見分けるか。
---
データ中の `FF` の後には必ず `00` か RST（`D0`〜`D7`）が続く。それ以外の `FF xx` が本物のマーカー。
```

## 出典

- [ITU-T T.81（JPEG）](https://www.w3.org/Graphics/JPEG/itu-t81.pdf)
- [Motion Photo format 1.0](https://developer.android.com/media/platform/motion-photo-format)（"a secondary video file appended to it"）
- [Ultra HDR Image Format](https://developer.android.com/media/platform/hdr-image-format)（gain map は MPF で主画像の後ろに付く）
- 実装: [piconic-ai/ima#42](https://github.com/piconic-ai/ima/pull/42)（Orientation と EOI の件は pullfrog のレビューで指摘された）

関連: [[png-webp-metadata-chunks]]、[[pullfrog]]、[[pedit-development-notes]]

#jpeg #exif #image #privacy
