---
created: 2026-09-12
updated: 2026-09-12
title: CSS mask で描くロゴは、枠の比率も画像に合わせる
description: "外部 SVG を mask-image で塗ると、ロゴが currentColor（background: var(--foreground)）に追従して、SVG 側に色を持たせずに済む。"
tags: [css, svg, logo]
---
# CSS mask で描くロゴは、枠の比率も画像に合わせる

外部 SVG を `mask-image` で塗ると、ロゴが `currentColor`（`background: var(--foreground)`）に追従して、SVG 側に色を持たせずに済む。ただし mask を受ける要素は中身が空の箱なので、**箱の寸法は SVG の比率を知らない**。

```css
.logo {
  display: block;
  width: 115px;   /* 旧ロゴ 200x46 (4.35:1) 向けに決め打ちされていた */
  height: 26px;
  background: var(--foreground);
  mask: url('./logo.svg') no-repeat center / contain;
}
```

`mask-size: contain` は画像の比率を保ったまま箱に収めるので、SVG の比率が箱より細長くなければ左右に余白が出る。ロゴを 175.64x46（3.82:1）に作り直したとき、この箱では約 14% 幅が余った状態で描かれていた。`<img>` なら `width: auto` で自然に追従するが、mask の箱は追従しない。

## 対処: 幅を viewBox から計算する

高さを固定し、幅を viewBox の比率から `calc()` で出す。ロゴを作り直したときに直す数字が1つになる。

```css
.logo {
  height: 26px;
  width: calc(26px * 175.64 / 46);   /* logo.svg の viewBox に追従 */
}
```

`aspect-ratio` でもよいが、`display: block` で `width: auto` の要素は親幅いっぱいに広がるので、高さから幅を導くには `width` を明示する方が確実だった。

Playwright で `getBoundingClientRect()` を測ると 99.27x26、比率 3.818 で SVG と一致し、mask が箱いっぱいに描かれる。

## レビューで見つかった経緯

ロゴ差し替えの PR では、サイトのヘッダー（インライン SVG、高さ指定のみ）だけ確認していて、18個のバックエンド統合デモが共通で使うこの CSS mask の箱は見ていなかった。レビューボットの指摘で気づいた。ロゴのように**複数の経路で描かれる資産**は、消費側の一覧を先に作ってから確認するべきだった。

## 理解度チェック

```quiz
`mask-size: contain` で塗るロゴの SVG の縦横比を変えたとき、何が起きるか?
---
mask を受ける箱は SVG の比率を知らないので、箱の寸法がそのままなら、画像は比率を保って収まり、余った側に余白が出る（今回は幅が約 14% 余った）。
```

## 出典

- [piconic-ai/barefootjs#2957](https://github.com/piconic-ai/barefootjs/pull/2957) — `integrations/shared/styles/layout.css` の `.bf-header-logo-img`。

#css #svg #logo
