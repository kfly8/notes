---
created: 2026-08-30
updated: 2026-10-07
title: cwebp で HDR 画像を変換すると暗くなる
description: HDR(Display P3 + PQ)なPNGをcwebpでWebP化すると、暗く沈んだ画像になる
tags: [image, color, macos]
---
# cwebp で HDR 画像を変換すると暗くなる

`cwebp -q 85 in.png -o out.webp` で変換したら、色が全体的に暗く・くすんで見えた。単なる圧縮劣化(chroma subsampling など)ではなく、**元の PNG が HDR 画像だったのが原因**だった。

## 診断

ImageMagick で埋め込み ICC プロファイルを見ると分かる。

```sh
magick identify -verbose in.png | grep -iE "colorspace|profile"
magick in.png -format "%[icc:description]\n" info:
```

```
Display P3 Primaries; PQ (Adaptive Gain Curve ...)
```

`PQ`(Perceptual Quantizer)は HDR10などで使われるトランスファーカーブで、最大10,000nit までを表現できるよう輝度を非線形に圧縮している。iPhone の「Adaptive HDR」写真をスクリーンショット・書き出しした際に PNG へ埋め込まれることがある。

`cwebp` はこの HDR(PQ)プロファイルをトーンマッピングして SDR に変換する機能を持たない。生のピクセル値をそのまま標準ガンマの sRGB として書き出すため、PQ で圧縮されていた輝度値が誤って解釈され、画像全体が暗く・彩度も低く見える。**cwebp のバグというより、そもそも HDR→SDR 変換という工程が必要で、それをやっていない**という話。

## 対処: 先にSDRへトーンマップしてから変換する

macOS 純正の `sips`(ColorSync ベース)は、Apple 自身の HDR プロファイルを正しく解釈して SDR へ変換できる。

```sh
# 1. Apple純正のカラーマネジメントでSDR(sRGB)に変換
sips -s format png --matchTo "/System/Library/ColorSync/Profiles/sRGB Profile.icc" in.png --out in-srgb.png

# 2. それをWebPに変換
cwebp -q 85 in-srgb.png -o out.webp
```

副産物として、正しく変換した方がファイルサイズも小さくなった(219KB → 66KB)。HDR の生データは WebP の通常の圧縮モデルと相性が悪く、圧縮効率も落ちていたと見られる。

## 理解度チェック

```quiz
cwebpで変換した画像が暗く沈んで見える。何を疑うべきか。
---
元画像がHDR(Display P3 + PQなど)でエンコードされている可能性を疑う。cwebpはHDR→SDRのトーンマッピングをしないため、PQの輝度値がそのまま標準sRGBガンマとして解釈され、暗く見える。ImageMagickの `identify -verbose` や `-format "%[icc:description]"` で埋め込みICCプロファイルを確認する。
```

```quiz
HDR(PQ)なPNGを正しくWebP化するには、cwebpの前に何をすればよいか。
---
先にHDRを正しく解釈できるカラーマネジメントツール(macOSなら `sips --matchTo <sRGBプロファイル>`)でSDR(標準sRGB)のPNGにトーンマップしてから、そのSDR版をcwebpに渡す。
```

## 出典

- 手元で実際に `magick identify` / `sips` / `cwebp` を動かして確認(2026-08-30)

#image #color #macos
