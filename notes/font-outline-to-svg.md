---
created: 2026-09-12
updated: 2026-09-12
title: フォントの字形を SVG パスに起こす（fontTools + harfbuzz）
description: ロゴのワードマークのように「この文字列をこの書体で」固定したい図は、フォントを埋め込むのではなく字形をパス化した SVG にしておくと、フォントの有無に依存せず、fill="currentColor" で色も追従する。
tags: [fonts, svg, python, logo]
---
# フォントの字形を SVG パスに起こす（fontTools + harfbuzz）

ロゴのワードマークのように「この文字列をこの書体で」固定したい図は、フォントを埋め込むのではなく字形をパス化した SVG にしておくと、フォントの有無に依存せず、`fill="currentColor"` で色も追従する。Python の fontTools と uharfbuzz で、カーニング込みのアウトラインを得る手順。

## 手順

1. **フォントを TTF/OTF にする。** ブラウザ用に WOFF2 で持っているなら fontTools で展開する（brotli が要る）。
2. **harfbuzz で shaping する。** 文字列 → グリフ ID と位置（`x_advance`、`x_offset`）。GPOS のカーニングが効く。
3. **fontTools のペンでアウトラインを取る。** `SVGPathPen` を `TransformPen` で包み、フォント単位からキャンバス座標へ（y は反転）変換しながら描く。

```python
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

tt = TTFont('font.woff2'); tt.flavor = None; tt.save('font.ttf')   # 1
tt = TTFont('font.ttf')
upem = tt['head'].unitsPerEm
s = CAP_HEIGHT / tt['OS/2'].sCapHeight        # 目標のキャップハイト(キャンバス単位)に合わせる倍率

font = hb.Font(hb.Face(hb.Blob.from_file_path('font.ttf'))); font.scale = (upem, upem)
buf = hb.Buffer(); buf.add_str('BarefootJS'); buf.guess_segment_properties()
hb.shape(font, buf, {'kern': True, 'liga': True})                   # 2

gs = tt.getGlyphSet(); order = tt.getGlyphOrder(); x = X0; paths = []
for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
    pen = SVGPathPen(gs)
    gs[order[info.codepoint]].draw(TransformPen(pen, (s, 0, 0, -s, x + pos.x_offset * s, BASELINE - pos.y_offset * s)))  # 3
    paths.append(pen.getCommands())
    x += (pos.x_advance + TRACKING_EM * upem) * s   # 字間(em)はここで足す
```

`TransformPen` の行列 `(s, 0, 0, -s, tx, ty)` が「拡大して y を反転して平行移動」。SVG は y が下向きなので反転が要る。

## harfbuzz に WOFF2 を直接渡すと全部 .notdef になる

`hb.Blob.from_file_path('font.woff2')` は失敗せずに Face を作るが、shaping 結果のグリフ ID がすべて 0（`.notdef`）になる。エラーが出ないので気づきにくい。fontTools で `flavor = None` にして保存し直した TTF を渡すと正しく shaping される。

## 出力側の設計

- **viewBox の高さは元のロゴと揃える。** 利用側が高さでサイズ指定している（ヘッダーの `h-[1.65rem]` など）と、幅が変わっても崩れない。幅が変わるので、幅固定の箱で使っている箇所は別途直す（[[css-mask-image-box-aspect]]）。
- **同じアウトラインから全ファイルを生成する。** 色違い（`currentColor` / `#000` / `#fff`）、文字だけ版、React コンポーネントのインライン SVG を1つのスクリプトから書き出せば、位置ずれが起きない。実際、手で管理されていた light/dark 版だけアイコンの位置が 3.5 単位ずれていた。
- **文字だけ版は座標をずらさず描き直す。** 生成済みのパス文字列を正規表現で「x を引く」加工をしたら、`H`/`V` のような1値コマンドと数値ペアの対応が崩れて細い線が混じった。開始位置を変えてペンで描き直す方が確実。

使ったもの: fontTools 4.65.0、brotli、uharfbuzz 0.56.1、Instrument Serif Regular（SIL OFL）。

## 理解度チェック

```quiz
uharfbuzz に WOFF2 ファイルをそのまま渡すと何が起きるか?
---
エラーにならず Face は作れるが、shaping 結果のグリフがすべて `.notdef`（ID 0）になる。fontTools で TTF に展開してから渡す。
```

```quiz
`TransformPen` に渡す行列で y のスケールを負にするのはなぜか?
---
フォント座標は y が上向き、SVG は y が下向きなので、拡大と同時に上下を反転させる必要があるから。
```

## 出典

- [piconic-ai/barefootjs#2957](https://github.com/piconic-ai/barefootjs/pull/2957) — ロゴのワードマークを Instrument Serif で作り直した PR。生成手順はこの PR の作業そのもの。

#fonts #svg #python #logo
