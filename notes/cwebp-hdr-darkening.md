---
created: 2026-08-30
updated: 2026-08-30
description: HDR(Display P3 + PQ)なPNGをcwebpでWebP化すると、暗く沈んだ画像になる
---
# cwebpでHDR画像を変換すると暗くなる

`cwebp -q 85 in.png -o out.webp` で変換したら、色が全体的に暗く・くすんで見えた。単なる圧縮劣化(chroma subsamplingなど)ではなく、**元のPNGがHDR画像だったのが原因**だった。

## 診断

ImageMagickで埋め込みICCプロファイルを見ると分かる。

```sh
magick identify -verbose in.png | grep -iE "colorspace|profile"
magick in.png -format "%[icc:description]\n" info:
```

```
Display P3 Primaries; PQ (Adaptive Gain Curve ...)
```

`PQ`(Perceptual Quantizer)はHDR10などで使われるトランスファーカーブで、最大10,000nitまでを表現できるよう輝度を非線形に圧縮している。iPhoneの「Adaptive HDR」写真をスクリーンショット・書き出しした際にPNGへ埋め込まれることがある。

`cwebp` はこのHDR(PQ)プロファイルをトーンマッピングしてSDRに変換する機能を持たない。生のピクセル値をそのまま標準ガンマのsRGBとして書き出すため、PQで圧縮されていた輝度値が誤って解釈され、画像全体が暗く・彩度も低く見える。**cwebpのバグというより、そもそもHDR→SDR変換という工程が必要で、それをやっていない**という話。

## 対処: 先にSDRへトーンマップしてから変換する

macOS純正の `sips`(ColorSyncベース)は、Apple自身のHDRプロファイルを正しく解釈してSDRへ変換できる。

```sh
# 1. Apple純正のカラーマネジメントでSDR(sRGB)に変換
sips -s format png --matchTo "/System/Library/ColorSync/Profiles/sRGB Profile.icc" in.png --out in-srgb.png

# 2. それをWebPに変換
cwebp -q 85 in-srgb.png -o out.webp
```

副産物として、正しく変換した方がファイルサイズも小さくなった(219KB → 66KB)。HDRの生データはWebPの通常の圧縮モデルと相性が悪く、圧縮効率も落ちていたと見られる。

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
