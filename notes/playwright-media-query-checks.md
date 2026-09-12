---
created: 2026-09-12
updated: 2026-09-12
title: Playwright でメディアクエリ依存の UI を検証する
description: "スマホ向けの分岐は (max-width: …) だけでなく (hover: none) and (pointer: coarse) のような入力特性で切ることがある。"
tags: [playwright, testing, css]
---
# Playwright でメディアクエリ依存の UI を検証する

スマホ向けの分岐は `(max-width: …)` だけでなく `(hover: none) and (pointer: coarse)` のような入力特性で切ることがある。ビューポートを小さくするだけではこちらは真にならない。`playwright-core` + Chromium の headless shell で確認したこと。

## 端末を再現する

`newContext` に `isMobile: true, hasTouch: true` を渡すと、`(hover: none) and (pointer: coarse)` が真になる。タブレット相当（1024x768 + タッチ）を作るとき、幅の条件を満たさない端末でポインタ条件だけが効くことを確認できる。

```js
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
})
```

`deviceScaleFactor` を上げるとスクリーンショットで文字の可読性が判断しやすい。

## リサイズを伴わない切替を再現する

「タッチ端末にマウスを繋いだ」のような、`matchMedia` の `change` がリサイズなしで起きる経路は Playwright から直接は起こせない。代わりに、その経路と同じ関数が別の契機（`MutationObserver` など）でも呼ばれるなら、そちらを叩く。

```js
canvas.style.transform = 'translate(0px, 0px) scale(0.3)'   // 古い状態を仕込む
canvas.appendChild(document.createComment('poke'))            // MutationObserver 経由で再配置を走らせる
```

その後 transform が正しい値に戻っていれば、「切替の契機に依らず自前で状態を作り直している」ことが言える。

## はみ出しと重なりを数える

目視のスクリーンショットは、境界ぎりぎりの1行欠けや、操作系との数 px の重なりを見落とす。要素の矩形を全部取って判定する方が確実だった。

```js
let maxBottom = 0
for (const el of section.querySelectorAll('*')) {
  const r = el.getBoundingClientRect()
  if (r.width && r.height) maxBottom = Math.max(maxBottom, r.bottom)
}
// canvas の bottom と比べる。操作系との交差は矩形同士の重なり判定
```

背景の全面オーバーレイ（`inset: 0`）は必ず交差するので除外する。

## 静的サーバーの charset

Python の `http.server` で HTML を配ると `Content-Type` に charset が付かず、`<script>` に埋めた日本語 JSON が文字化けして見えた。配信物の問題ではなく検証環境の問題だったが、切り分けに時間を使った。検証用サーバーは `text/html; charset=utf-8` を返すものを使う。

## 理解度チェック

```quiz
ビューポートを 390px にしても `(hover: none) and (pointer: coarse)` の分岐に入らないのはなぜか?
---
これは入力特性の条件で、幅とは無関係だから。`newContext({ isMobile: true, hasTouch: true })` で端末を再現する必要がある。
```

```quiz
リサイズを伴わない `matchMedia` の切替経路を Playwright で検証するには?
---
その切替は直接起こせないので、同じ再配置関数が呼ばれる別の契機（`MutationObserver` に拾わせる DOM 変更など）を使い、古い状態を仕込んだ上で正しく作り直されるかを見る。
```

## 出典

- [piconic-ai/barefootjs#2954](https://github.com/piconic-ai/barefootjs/pull/2954)、[#2956](https://github.com/piconic-ai/barefootjs/pull/2956) — 検証手順は各 PR の Test plan。

#playwright #testing #css
