---
created: 2026-09-06
updated: 2026-09-06
title: 半透明のborder色は要素自身の背景とブレンドされる
description: 半透明の色(rgbaやalphaチャンネル付きの色、UnoCSS/Tailwindならborder-foreground/40のような/N表記)をborder-colorに使うと、そのborderはページ全体の背景ではなく、要素自身のbackgroundに対してブレンドされる。
tags: [css]
---
# 半透明のborder色は要素自身の背景とブレンドされる

半透明の色(`rgba`やalphaチャンネル付きの色、UnoCSS/Tailwindなら`border-foreground/40`のような`/N`表記)を`border-color`に使うと、そのborderは**ページ全体の背景ではなく、要素自身の`background`**に対してブレンドされる。要素が不透明な背景(`background: black`など)を持っていると、期待していたページ背景色ではなく、その黒に対して混ざった色になる。

## 症状

灰色を意図して半透明のグレーをborderに設定したのに、要素が黒い背景を持っていたために、実際には黒く見える。

```css
.thumbnail {
  background: black;
  border: 4px solid rgba(120, 120, 120, 0.4); /* 意図: 薄い灰色の枠 */
}
```

`rgba(120, 120, 120, 0.4)`は「120,120,120の60%を透かして、下にあるものと混ぜる」という意味。下にあるのがページの明るい背景ではなく、この要素自身の黒い`background`なので、黒とグレーが混ざったほぼ黒に近い色になる。

## 原因

CSSの`background-clip`の既定値は`border-box`——つまり要素の`background`は、paddingやcontentの領域だけでなく、border自体が占める領域の下にも塗られる。半透明のborder色は、この「borderの下に塗られている自分自身の背景」に対して合成される。ページの背景に対して合成されるわけではない。

## 対処

意図した色をそのまま出したいなら、アルファ付きのトークンではなく不透明な(アルファ無しの)色を使う。

```css
.thumbnail {
  background: black;
  border: 4px solid #787878; /* 不透明なグレー — ブレンドされない */
}
```

半透明のborderを保ったまま解決したい場合は、`background-clip: padding-box`にして要素自身の背景をborder領域の下から追い出す(ただしこれは意匠が変わる)か、borderの下に見せたい色を明示的に用意する必要がある。

## 理解度チェック

```quiz
半透明のborder色を要素に指定したとき、その色は何に対してブレンドされるか?
---
ページ全体の背景ではなく、その要素自身の`background`。`background-clip`の既定値`border-box`により、要素の背景はborderの領域の下にも塗られているため。
```

## 出典

- Tauri + BarefootJS CSRのデスクトップアプリ(スライド編集GUI)のサムネイル一覧UIで、`bg-black`を持つ要素に半透明のborderトークン(UnoCSSの`border-foreground/40`)を指定したところ、意図した灰色ではなく黒に見える形で遭遇した。

#css
