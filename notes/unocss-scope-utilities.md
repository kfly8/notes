---
created: 2026-09-12
updated: 2026-09-12
title: UnoCSS のユーティリティを親セレクタ配下に閉じる
description: 別のデザインシステムのコンポーネントを、既存ページの一角に「そのまま」載せたいとき、UnoCSS が生成する .flex や .border のような汎用クラス名がページ全体に効くと事故になる。
tags: [unocss, css]
---
# UnoCSS のユーティリティを親セレクタ配下に閉じる

別のデザインシステムのコンポーネントを、既存ページの一角に「そのまま」載せたいとき、UnoCSS が生成する `.flex` や `.border` のような汎用クラス名がページ全体に効くと事故になる。生成されるセレクタすべてに親セレクタを前置して、その一角に閉じ込める。

## `postprocess` でセレクタを書き換える

`uno.config.ts` の `postprocess` は生成された各ユーティリティを受け取り、`util.selector` を書き換えられる。

```ts
postprocess: (util) => {
  if (util.selector.startsWith('@')) return   // @property の登録は選択子ではない
  util.selector = splitTopLevel(util.selector).map((s) => `.showcase ${s}`).join(',')
},
```

- **セレクタリストは要素ごとに前置する。** `.a,.b` をそのまま前置すると `.showcase .a,.b` になり、`.b` が漏れる。カンマで割るとき `:is(...)` や `[...]` の中のカンマは無視する。
- **`@property --un-*` も通ってくる。** UnoCSS は `@property` の登録をユーティリティと同じ経路で出すので、無条件に前置すると `.showcase @property …` という壊れた規則になる。ボタンの背景色が `color-mix(… var(--un-bg-opacity) …)` で `--un-bg-opacity` を参照しているため、登録が壊れると背景が透明になった。`@` で始まるものは触らない。
- **入れ子の variant は `&` に前置される。** `.x{ &:has(...){…} }` のように出る規則では、内側の `&:has(...)` が `.showcase &:has(...)` になる。CSS のネストはこれを `.showcase .x:has(...)` に解決するので、結果は正しい。

生成物を見て `^\.[a-z]` で始まる規則が残っていないか確認する。

## リセットは `@layer base` に入れておく

閉じ込めたコンポーネント用のリセット（`button { background: transparent }` など）は `.showcase button` の形になり、詳細度 (0,1,1) が `.showcase .bg-primary` (0,2,0) に負けるので実は問題ない。ただしリセットを `@layer base` に入れておけば、詳細度に関係なくレイヤー外のユーティリティが勝つので、後から順序や詳細度で悩まない。

## 検証

閉じ込めた外側に `class="flex grid border bg-primary"` の要素を置き、`getComputedStyle` で `display: block`、`border-width: 0`、背景が透明のままなのを確認した。内側のボタンやスイッチの背景色も同時に確認する。前置を間違えたときは、こちらが先に壊れる。

同じ UnoCSS の別のハマりどころは [[unocss-arbitrary-value-gotchas]]。

## 理解度チェック

```quiz
`postprocess` で全ユーティリティのセレクタに親を前置したら、ボタンの背景色が消えた。原因は?
---
`@property --un-bg-opacity` の登録もユーティリティとして通ってくるため、`.showcase @property …` に書き換わって無効になり、`var(--un-bg-opacity)` を使う `color-mix()` が計算できなくなった。`@` で始まるセレクタは前置しない。
```

```quiz
生成物に `.x{ .showcase &:has(...){…} }` のような規則が出てきた。壊れているか?
---
壊れていない。CSS のネストは `.showcase &:has(...)` を `.showcase .x:has(...)` に解決するので、閉じ込めは効いている。
```

## 出典

- [piconic-ai/barefootjs#2949](https://github.com/piconic-ai/barefootjs/pull/2949) — `site/core/slides/overview/component/uno.config.ts` と `css/1-ui-kit.css`。unocss ^66。

#unocss #css
