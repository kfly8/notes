---
created: 2026-08-24
updated: 2026-08-24
---
# プログラム的な focus() は :focus-visible にマッチしない

SPA ルーターがページ遷移後に JS で `element.focus()` を呼んでも、CSS の `:focus-visible` はその要素にマッチしない（少なくとも Chromium では）。キーボード操作でフォーカスが移った場合だけマッチする。この区別を知らずに `:focus` にだけ outline を当てていると、遷移のたびに何もクリック・タップしていない見出しに枠が付いて見える。

## SPA ルーターの定番パターン

遷移後に新しいコンテンツの見出しへフォーカスを移し、スクリーンリーダーに「ページが変わった」ことを伝える、というのは React Router を含む多くの SPA ルーターが採用する標準的な a11y パターン。[[barefootjs-router-region-contract|@barefootjs/router]] の実装もこれで、`tabindex="-1"` を付けてから `focus({ preventScroll: true })` を呼ぶ。

```js
// @barefootjs/router の a11y.ts（focusRegion 関数）
const target = region.querySelector('h1, h2, [role="heading"]') ?? region;
if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
target.focus({ preventScroll: true });
```

`tabindex="-1"` は「Tab キー操作では到達不可、プログラムからは focus 可能」を意味する。Tab の到達順を汚さずに、任意の要素へ狙って focus を移せる。

## 問題になるのはサイト側の CSS

ルーター自体は正しく実装されていても、サイト側の CSS が `:focus` にだけ outline を当てていると（あるいは何も上書きせずブラウザ既定のままだと）、この「プログラムによる focus」にもキーボード操作時と同じ outline が出る。実際に踏んだ症状: ページ遷移のたびに、何もタップしていない見出しに青い枠が一瞬（実際には遷移が終わるまでずっと）付いて見える、というもの。

## `:focus-visible` で区別する

`:focus-visible` は「そのフォーカスがキーボード操作など、視覚的な合図が要ると判断できる操作で入ったか」をブラウザ自身が判定して当たる擬似クラス。マウスクリックやタップ、そして今回のようなプログラムによる `.focus()` では基本的にマッチしない。対処は次の1行で足りる。

```css
:focus:not(:focus-visible) {
  outline: none;
}
```

`:focus-visible` にマッチする方（Tab キーでの本物のキーボードフォーカス）にはブラウザ既定の outline がそのまま残るので、アクセシビリティは損なわれない。ルーター側を変更する必要はなかった。

## 検証したこと・していないこと

Chromium (Playwright 経由) で `document.activeElement.matches(':focus-visible')` を直接呼び、ルーターが `.focus()` した直後は `false`（`:focus` は `true`）、Tab キーで移した直後は `true` になることを確認した。iOS Safari の `:focus-visible` 実装は歴史的に他ブラウザと差異があった経緯があり、実機での確認はまだできていない。

## 出典

- `node_modules/@barefootjs/router/dist/index.js`（`focusRegion` 関数、`src/a11y.ts` 相当）— 一次情報
- 上記以外は Chromium での実機検証（`matches(':focus-visible')` の直接呼び出し）に基づく。仕様書（CSS Selectors 4）は未参照。

#css #a11y #barefootjs #router
