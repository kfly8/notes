---
created: 2026-08-22
updated: 2026-08-22
title: UnoCSS の arbitrary value のハマりどころ
description: UnoCSS（BarefootJS の Hono scaffold で使った presetWind4）の text-[...] 系ユーティリティは、見た目どおりには解釈されないことがある。
tags: [unocss, css]
---
# UnoCSS の arbitrary value のハマりどころ

UnoCSS（[[barefootjs-hono-scaffold|BarefootJS の Hono scaffold]] で使った `presetWind4`）の `text-[...]` 系ユーティリティは、見た目どおりには解釈されないことがある。実際に3つ踏んだ。

## `text-[xx-large]` は文字色として解釈される

`text-*` ユーティリティは font-size と text-color の両方を兼ねる。`text-[value]` の `value` が単位なしのキーワードだと、UnoCSS はこれを**色**だと判断する。CSS の正当な font-size キーワードである `xx-large` を渡しても、生成されるのはこう:

```css
.text-\[xx-large\]{color:color-mix(in oklab, xx-large var(--un-text-opacity), transparent);}
```

`xx-large` が色として `color-mix()` に渡された、意味をなさない宣言になる。font-size には一切反映されない。ブラウザの DevTools で computed style を見ると `font-size: 16px`（既定値のまま）なので、原因がここだとすぐには気づきにくい。

**対処**: 単位付きの数値を渡す（`text-[32px]` など）。これなら font-size として解釈される:

```css
.text-\[32px\]{font-size:32px;}
```

CSS のキーワードサイズ（`xx-large` など）をそのまま持ち込みたい場合の代替記法は確認できていない。今回は元の見た目に近い px 値に落とし込んで解決した。

## `text-[color:...]` のヒント記法は presetWind4 では効かない

逆に「色として解釈させたい」場合の話。preset-mini / wind3 系で使えた data-type ヒント付きの arbitrary value（`text-[color:var(--color-text-sub)]`）は、presetWind4 では**マッチするルールがなく、静かに無視される**。エラーにも警告にもならず、単にそのクラスのCSSが生成されない。

presetWind4 の色ルールは正規表現で明示プレフィックスを持つ形になっている（`@unocss/preset-wind4/dist/rules.mjs`）:

```js
/^text-(?:color-)?(.+)$/     // text-color-[...] または text-<theme色>
/^(?:color|c)-(.+)$/          // color-[...] / c-[...]
```

**対処**: `text-color-[var(--color-text-sub)]` と書く（`color-[...]` / `c-[...]` も可）。これなら期待どおり生成される:

```css
.text-color-\[var\(--color-text-sub\)\]{color:color-mix(in oklab, var(--color-text-sub) var(--un-text-opacity), transparent);}
```

なお `decoration-[var(...)]` はプロパティが色で確定しているため、ヒントなしの裸記法で問題ない。ヒントが要りそうに見えるのは `text-*` のような多義的なユーティリティだけで、そこでは wind4 流の明示プレフィックスを使う。

## `font-mono` の既定スタックは `monospace` より幅が広い

`font-mono` ユーティリティは既定で次のスタックを使う:

```
ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace
```

`ui-monospace` は macOS では SF Mono 相当になり、素の総称キーワード `monospace`（ブラウザ・OS のデフォルト等幅フォントにフォールバックする、たとえば従来の実装が `font-family: monospace` とだけ書いていた場合）よりグリフの幅が広くなることがある。

これが罠になるのは、固定幅のカラム（日付表示など、`width: 80px` のような数値幅 + `white-space: nowrap`）を、旧実装の `monospace` の描画幅を前提にサイジングしていた場合。`font-mono` に置き換えると同じ文字数でもオーバーフローし、隣の要素と視覚的に重なる。

**対処**: `uno.config.ts` の `theme` でフォントスタックを上書きし、素の `monospace` に固定する。

```ts
export default defineConfig({
  theme: { font: { mono: 'monospace' } },
  // ...
})
```

## 気づきにくさの共通点

いずれも「クラス名は書いた通りに解釈されている」と思い込みやすい。誤解釈（`text-[xx-large]`）も無視（`text-[color:...]`）もビルドは黙って通るので、実際に UnoCSS が生成した CSS ファイル（`public/static/uno.css` など）を `grep` して、目的のセレクタとプロパティ（`font-size:` や `color:`）が本当に出力されているか確認するのが最短の切り分け方だった。

#unocss #css
