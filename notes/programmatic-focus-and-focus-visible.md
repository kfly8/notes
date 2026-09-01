---
created: 2026-08-24
updated: 2026-08-24
title: プログラム的な focus() の outline を消す
description: SPA ルーターがページ遷移後に JS で element.focus() を呼ぶと、その要素にブラウザ既定の focus outline が付く。
tags: [css, a11y, barefootjs, router, safari]
---
# プログラム的な focus() の outline を消す

SPA ルーターがページ遷移後に JS で `element.focus()` を呼ぶと、その要素にブラウザ既定の focus outline が付く。`:focus-visible` で除外できると思ったが、Safari には「クリック起点でスクリプトが focus を移した要素」を `:focus-visible` から正しく除外しない既知のバグがあり、あてにならなかった。確実に効いたのは `:focus-visible` ではなく `tabindex="-1"` を直接ねらう方法。

## SPA ルーターの定番パターン

遷移後に新しいコンテンツの見出しへフォーカスを移し、スクリーンリーダーに「ページが変わった」ことを伝える、というのは React Router を含む多くの SPA ルーターが採用する標準的な a11y パターン。[[barefootjs-router-region-contract|@barefootjs/router]] の実装もこれで、`tabindex="-1"` を付けてから `focus({ preventScroll: true })` を呼ぶ。

```js
// @barefootjs/router の a11y.ts（focusRegion 関数）
const target = region.querySelector('h1, h2, [role="heading"]') ?? region;
if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
target.focus({ preventScroll: true });
```

`tabindex="-1"` は「Tab キー操作では到達不可、プログラムからは focus 可能」を意味する。Tab の到達順を汚さずに、任意の要素へ狙って focus を移せる。

## サイト側で :focus にしか outline を当てていないと目立つ

ルーター自体は正しく実装されていても、サイト側の CSS が `:focus` にだけ outline を当てていると（あるいは何も上書きせずブラウザ既定のままだと）、この「プログラムによる focus」にもキーボード操作時と同じ outline が出る。実際に踏んだ症状: モバイルタップでページ遷移するたびに、何もタップしていない見出しに枠が付いて見える、というもの。

## `:focus-visible` だけでは足りなかった（Safari）

`:focus-visible` は「そのフォーカスがキーボード操作など、視覚的な合図が要ると判断できる操作で入ったか」をブラウザ自身が判定して当たる擬似クラス。

```css
:focus:not(:focus-visible) {
  outline: none;
}
```

Chromium (Playwright 経由) で `document.activeElement.matches(':focus-visible')` を直接呼んで確認したところ、ルーターが `.focus()` した直後は `false`（`:focus` は `true`）になり、この1行で解決したように見えた。ところが実機の iOS Safari では直っていなかった。

原因は WebKit の既知バグ（[bug 236782](https://bugs.webkit.org/show_bug.cgi?id=236782)）: クリックで別の要素からフォーカスが外れ、スクリプトが新しい要素に `.focus()` した場合、Safari はその新しい要素を `:focus-visible` から正しく除外しない。「タップ → ルーターが見出しに focus を移す」は、まさにこのパターンに一致する。Chromium/Firefox では起きない、Safari 固有の挙動差。

## 確実な対処: `tabindex="-1"` を直接ねらう

`:focus-visible` というブラウザの推測に頼るのをやめ、ルーターが実際に付けている属性を直接セレクタにする。

```css
[tabindex="-1"]:focus {
  outline: none;
}
```

`tabindex="-1"` の要素は定義上 Tab キーでは絶対に到達できないので、そこに乗る focus は常にプログラムによるものと断定できる——ブラウザの `:focus-visible` 判定がどうであれ関係ない。`:focus:not(:focus-visible)` と両方置いておけば、Chromium/Firefox は前者で、Safari は後者でカバーされる。実機 Safari で確認済み（直った）。真にキーボードで Tab 移動した要素（`tabindex` なし、または `0` 以上）の outline には影響しない。

## 検証したこと

- Chromium (Playwright): ルーター `.focus()` 直後は `:focus-visible` に `false`、Tab 移動後は `true`。`[tabindex="-1"]:focus` ルール追加後も Tab 移動した要素の outline (`outline: auto`) は変化なし。
- 実機 iOS Safari: `:focus-visible` ルールのみでは outline が残った。`[tabindex="-1"]:focus` ルールを足したところ解消（ユーザー報告ベース）。

## 出典

- `node_modules/@barefootjs/router/dist/index.js`（`focusRegion` 関数、`src/a11y.ts` 相当）— 一次情報
- [236782 – [macOS][selectors] :focus-visible matching on button focused via script](https://bugs.webkit.org/show_bug.cgi?id=236782) — WebKit Bugzilla

#css #a11y #barefootjs #router #safari
