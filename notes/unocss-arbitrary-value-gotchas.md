---
created: 2026-08-22
updated: 2026-09-06
title: UnoCSS の arbitrary value のハマりどころ
description: UnoCSS の presetWind4 は、text-[...]・border-[...] などの arbitrary value を見た目どおりに解釈しないことがある。
tags: [unocss, css]
---
# UnoCSS の arbitrary value のハマりどころ

UnoCSS の `presetWind4` は、見た目どおりには解釈されない arbitrary value にたびたび遭遇する。`text-[...]` 系で[[barefootjs-hono-scaffold|BarefootJS の Hono scaffold]]で使った際に3つ、`border-[...]`系で別のTauri + BarefootJS CSRプロジェクトで使った際に1つ、踏んだ。

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

## `border-[Npx]` はborder-**幅**ではなくborder-**色**として解釈される

`text-*` と同じ構造の罠が `border-*` にもある。`border-*` は border-width と border-color の両方を兼ねるユーティリティで、`border-[6px]` のように単位付きの数値を渡しても、幅ではなく**色**として解釈される。

```css
.border-\[6px\]{border-color:color-mix(in oklab, 6px var(--un-border-opacity), transparent);}
```

`6px` が色として `color-mix()` に渡された、意味をなさない宣言になる。border-widthには一切反映されず、DevToolsのcomputed styleを見ても既定の太さのまま（枠線自体は他のborder系ユーティリティ由来の値で表示されていることもあり、「太さが変わらない」ことに気づいても「クラスが効いていない」と誤解しやすい）。

**対処**: 数値スケールのユーティリティ（`border-2`、`border-4`、`border-8` など）を使う。これは正しく border-width として解釈される。

```css
.border-4{border-width:4px;}
```

任意のpx数を角括弧で指定したい場合の代替記法は確認できていない。今回は数値スケールに落とし込んで解決した。

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

いずれも「クラス名は書いた通りに解釈されている」と思い込みやすい。誤解釈（`text-[xx-large]`、`border-[6px]`）も無視（`text-[color:...]`）もビルドは黙って通るので、実際に UnoCSS が生成した CSS ファイル（`public/static/uno.css` など）を `grep` して、目的のセレクタとプロパティ（`font-size:` や `color:`、`border-width:`）が本当に出力されているか確認するのが最短の切り分け方だった。

#unocss #css
