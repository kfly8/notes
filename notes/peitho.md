---
created: 2026-09-12
updated: 2026-09-12
title: peitho
description: Markdown からスライドの静的サイトを組むツール。
tags: [peitho, slides]
---
# peitho

Markdown からスライドの静的サイトを組むツール。`deck.md` に `<!-- {"key":"…","layout":"…"} -->` で区切ったスライドを書き、`layouts/*.html` のレイアウトと `css/*.css` を当てて、`index.html` + `manifest.json` + `slides/*.html` を吐く。ここに書くのは v1.26.0 のリリースバイナリで BarefootJS の overview デッキを組んだときに観察した範囲。

## レイアウトとスロット

レイアウトは `<slot name="title" accepts="inline" arity="1">` のようにスロットを宣言した HTML。Markdown 側の見出し・段落・コードブロックがスロットに流し込まれる。`::: {slot=name}` のコンテナで名前付きスロットに本文を送れる。

名前付きのコードスロットは `pre.slot-code-left` のように**スロット名から付いたクラス**で出てくる。共通の `.slot-code` だけを当てていると名前付きの方に効かない。

ビルドは CSS のセレクタも見ていて、スロット由来のクラスを上書きセレクタに使うと止まる。

```
Error: line 148: showcase.css: unknown slot class '.slot-body-wrap' in override selector
```

スロットのラッパーではなく、自分のレイアウトが持つクラス（`.head` など）で当てる。

## ビューア

- 起動時に `manifest.json` と `slides/*.html` を `fetch` で全部読み、`?slide=N` と `popstate` で現在のスライドを決める。キーボードとキャンバスのクリックで送る
- キャンバスは 1280x720 固定で、`transform: translate() scale()` で画面に収める。`.peitho-slide` の高さは `var(--peitho-canvas-height, 720px)`
- `css/*.css` はファイル名順に連結される。上書きの優先順位はファイル名で決まる
- 自前の CSS があってもテーマフォント（`theme-fonts/`）はコピーされる。使っていなければ消す

## 足りなくて足したもの

- 言語切替 — [[peitho-language-toggle]]
- スマホ表示 — [[fixed-aspect-canvas-on-phones]]
- ページ送りボタンと進捗バー — ビューアはキーボードとクリックだけなので、スライドがキー入力やポインタを奪うとき（ゲーム、フォーム）に抜け道が要る。`?slide=N` を `history.pushState` で書いて `popstate` を発火させれば、ビューアの通常経路で遷移する

## 理解度チェック

```quiz
`.slot-code` に当てたスタイルが名前付きコードスロットに効かないのはなぜか?
---
名前付きスロットの `<pre>` はスロット名由来のクラス（`.slot-code-left` など）で出てくるから。
```

```quiz
ビューアの外から特定のスライドへ遷移させる、ビューアの実装に依存しない方法は?
---
`?slide=N` を `history.pushState` で書き、`popstate` イベントを発火させる。ビューアが URL を正とみなしてその経路で描画する。
```

## 出典

- [piconic-ai/barefootjs](https://github.com/piconic-ai/barefootjs) の `site/core/slides/overview/`（デッキ）と `site/core/scripts/build-slides.ts`（ビルド）。

#peitho #slides
