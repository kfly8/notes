---
created: 2026-10-08
updated: 2026-10-08
title: innerHTML は script を実行しないが、onerror と srcdoc は動く
description: innerHTML は <script> を実行しないが、on* 属性は差し込んだ時点で動き、<iframe srcdoc> は親と同じ origin になる。DOMPurify で fragment 全体を無害化し、実行可能なものを取り除いたときだけ信頼を尋ねる。
tags: [security, dom, sanitizer]
---
# innerHTML は script を実行しないが、onerror と srcdoc は動く

他人の書いたデッキの HTML を Shadow DOM に `innerHTML` で差し込むアプリで、「`<script>` を実行しなければ安全」と考えていたが足りなかった。

- `innerHTML` で差し込んだ `<script>` は実行されない（だから明示的に実行し直すコードが別にあった）。
- `<img src=x onerror="...">` のようなイベントハンドラ属性は、差し込んだ時点で動く。まだ文書に接続していない `<div>` に `innerHTML` した場合も、メイン文書で作った要素なので画像の読み込みが始まり、`onerror` が発火する。
- `<iframe srcdoc="<script>...">` は親と同じ origin になり、`parent.__TAURI_INTERNALS__` に届く。Tauri アプリでは IPC がそのまま使える。

レイアウトの `<script>` だけでなく、Markdown 本文の生 HTML も同じ経路で fragment に入るので、無害化は fragment 全体に対して行う。

## 対処: DOMPurify で不活性な文書に通す

DOMPurify は不活性な文書でパースするので、処理中に何も動かない。既定で `<script>`・`on*`・`javascript:` URL は落ちる。設定で気をつけた点:

- `FORBID_TAGS` に `iframe`/`object`/`embed`/`base`/`meta` など、`FORBID_ATTR` に `srcdoc`。既定でも落ちるが、既定が変わっても意図が残るように明示する。
- `FORCE_BODY: true`。fragment が `<style>` で始まると、HTML パーサが先頭の `<style>` を `<head>` に動かし、DOMPurify が返さない。
- `SANITIZE_DOM: false`。既定では `document` のプロパティ名（`title`、`location`）と衝突する `id`/`name` を落とすが、shadow root の中の要素は `document` の名前付きプロパティにならないので、スライド自身の `#title { ... }` を壊すだけになる。

スタイル（`<style>`、`class`、`style`、`data-*`、SVG）は残すので、無害化したスライドの見た目は変わらない。

## 信頼は「実行可能なものを取り除いたとき」だけ尋ねる

VS Code の Workspace Trust と同じ構造で、デッキのフォルダ単位で信頼を保存する。帯は、DOMPurify の `removed` に `<script>`/`<iframe>` などの要素か `on*`・危険なスキームの URL 属性が含まれたときだけ出す。`<meta>` や未知の要素が落ちただけでは尋ねない。スクリプトの無いデッキでは帯が出ないので、信頼の確認が形式的にならない。

## 理解度チェック

```quiz
`innerHTML` は `<script>` を実行しないのに、無害化が要るのはなぜか。
---
`<img onerror>` のようなイベントハンドラ属性は差し込んだ時点で動き、`<iframe srcdoc>` は親と同じ origin で IPC に届くため。`<script>` を止めるだけでは足りない。
```

```quiz
DOMPurify に `FORCE_BODY: true` を付けた理由は。
---
fragment が `<style>` で始まると、HTML パーサがそれを `<head>` に動かし、DOMPurify が返さないため。スライドのスタイルが消える。
```

```quiz
shadow root の中の HTML に `SANITIZE_DOM` を切ったのはなぜか。
---
`SANITIZE_DOM` は `document` のプロパティと衝突する `id`/`name` を落とすが、shadow root の要素は `document` の名前付きプロパティにならない。残すのはスライドの `#title` のような id を壊すことだけ。
```

## 出典

- [DOMPurify README（設定項目）](https://github.com/cure53/DOMPurify)

#security #dom #sanitizer
