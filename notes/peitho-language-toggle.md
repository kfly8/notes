---
created: 2026-09-12
updated: 2026-10-07
title: peitho のデッキを URL を変えずに言語切替する
description: peitho の frontmatter には lang があるだけで、1つのデッキに複数言語を持つ仕組みはない。
tags: [peitho, slides, i18n]
---
# peitho のデッキを URL を変えずに言語切替する

[[peitho]] の frontmatter には `lang` があるだけで、1つのデッキに複数言語を持つ仕組みはない。`/ja/` のような別 URL にせず、スライドの中のボタンで切り替えたかったので、ビルド側で足した。

## 仕組み

peitho のビューアは起動時に `manifest.json` と `slides/*.html` を `fetch` で全部読む。この経路だけ差し替えれば、ビューア本体と URL はそのままで別言語のスライドが出る。

1. `deck.md` の隣に `deck.ja.md` を置く（キーとレイアウトは同じ、本文だけ日本語、`lang: ja`）。
2. ビルドで `deck.<lang>.md` ごとに peitho を走らせ、`<out>/<lang>/` に `slides/` と `manifest.json` だけ残す（CSS やアセットは共有）。
3. `index.html` の `<head>` 先頭にシムを差し込む。`localStorage` の `bf-lang` が組んだ言語なら、`<html lang>` を書き換え、`window.fetch` を包んで `manifest.json` と `slides/…` の URL に `<lang>/` を前置する。

```js
var f = window.fetch
window.fetch = function (u, o) {
  var s = typeof u === 'string' ? u : (u && u.url) || ''
  if (s === 'manifest.json' || s.indexOf('slides/') === 0) u = l + '/' + s
  return f.call(this, u, o)
}
```

4. 切替ボタンは `localStorage` に書いて `location.reload()`。ビューアはスライドを起動時にしか読まないので、リロードが一番単純で確実。

`window.__BF_LANGS`（組んだ言語の一覧）と `window.__BF_LANG`（選択中）をシムが公開し、ボタン側はそれを見て描画する。

## `<head>` に置く理由

ビューアの JS はスライドを読む前に走る。`fetch` の差し替えはそれより前、つまり `<head>` の先頭でないと間に合わない。

### 1ファイルにまとめた配布物でも同じ形で動く

peitho 自体には1ファイルにまとめた配布物を作るコマンドはない（v1.34.0 の `peitho export` は `pdf` だけ。上流のリリースノートも v1.39.0 まで見たが該当する項目はない）。そこで v1.34.0 の `peitho build --out` で `deck.md` と `deck.ja.md` を別々に組み、`index.html` に `peitho.css` と両言語の `manifest.json`・`slides/*.html` を手で埋め込んだ単一ファイルを作って試した。シムは上と同じものを `<head>` 先頭に置き、`fetch` の包みだけを「URL が埋め込み表 `{lang: {url: 本文}}` にあれば `new Response(本文)` を返す」形に変えた。`file://` で開いた headless Chromium 153（Playwright 1.63.0）で、`localStorage` に `bf-lang` を書いてリロードすると `<html lang>`・`document.title`・スライド本文が切り替わり、`?slide=N` の位置も保たれた。`manifest.json` と `slides/` への要求は一件も飛ばない（埋め込まなかった `theme-fonts/*.woff2` だけが読まれる）。

## 日本語版で別に要ったこと

文字の折り返しと字間は言語で変える必要があった（[[japanese-headline-wrapping]]）。`html[lang="ja"]` を付けた上書き CSS で対応している。`<html lang>` をシムが書き換えるのはこのため。

## 理解度チェック

```quiz
ビューアの JS を変えずに別言語のスライドを出せるのはなぜか?
---
ビューアは起動時に `manifest.json` と `slides/*.html` を `fetch` で読むだけなので、`<head>` で `window.fetch` を包んでその URL に `<lang>/` を前置すれば、読み先だけが変わるから。
```

```quiz
言語切替に `location.reload()` を使うのはなぜか?
---
ビューアはスライドを起動時にしか読まないため、読み直させる一番単純で確実な方法がリロードだから。
```

## 出典

- [piconic-ai/barefootjs#2949](https://github.com/piconic-ai/barefootjs/pull/2949) — `site/core/scripts/build-slides.ts` のステップ 5 と `component/narration.ts` の言語ピル。

#peitho #slides #i18n
