---
created: 2026-09-12
updated: 2026-09-12
title: 日本語見出しの折り返しと字間
description: 英語のデッキを日本語化したとき、見出しで直したのは3つ。
tags: [css, typography, japanese]
---
# 日本語見出しの折り返しと字間

英語のデッキを日本語化したとき、見出しで直したのは3つ。字間、折り返し位置、そしてそれらを言語で上書きするときの詳細度。Chromium（Playwright の headless shell）で確認した範囲。

## 字間

英語の見出しに付けていた `letter-spacing: -0.03em` は日本語では詰まりすぎる。`html[lang="ja"]` では `letter-spacing: 0` にする。本文も同様で、行間は英語の 1.45 より広い 1.7 が読みやすかった。

## 折り返し位置

`word-break: auto-phrase` を付けると、文節の切れ目で折り返すようになった。「好きなバックエンドを、手放さない。」が「好きなバックエンドを、／手放さない。」で割れる。付けないと文字数で機械的に割れる。`text-wrap: pretty` も併用している。

それでも、**句点だけが次の行に落ちる**ケースが残った。`自分で実行できる<em>チェック</em>。` のように `<em>` の直後に「。」が来る見出しで、「チェック」までで行が埋まると「。」が1文字だけ次の行に出た。禁則で防がれると思っていたが、この形では防がれなかった（原因は追っていない）。対処はサイズを下げて1行に収めることで、13文字の見出しが幅 1136 単位に収まる 84px にした。

## 言語での上書きは詳細度で負ける

汎用の見出しサイズを `html[lang="ja"] .peitho-slide h1 { font-size: 72px }` で上書きすると、レイアウト個別の `.layout-showcase h1 { font-size: 42px }` より詳細度が高いため、**すべてのレイアウトの見出しが 72px** になる。ショーケースの見出しが膨らんで、下の構成を画面外に押し出した。

レイアウト個別のサイズは、言語セレクタ側でも同じ詳細度で言い直す必要がある。

```css
html[lang="ja"] .layout-showcase h1 { font-size: 38px; }
html[lang="ja"] .layout-showcase .lede { font-size: 15px; }
```

スマホ向けの `body.bf-compact` でも同じ構図になる（[[fixed-aspect-canvas-on-phones]]）。`body.bf-compact .peitho-slide h1` は `html[lang="ja"] .peitho-slide h1` と同じ詳細度なので、後に書いた方が勝つ。ファイル内の順序に依存するので、両方を満たす `html[lang="ja"] body.bf-compact …` を最後に置いた。

## 理解度チェック

```quiz
`html[lang="ja"] .peitho-slide h1 { font-size: 72px }` を足したら、ある1枚だけ見出しが巨大になった。なぜか?
---
その1枚はレイアウト個別の `.layout-x h1 { font-size: 42px }` で小さくしていたが、言語セレクタ付きの規則の方が詳細度が高いため上書きされたから。言語側でもレイアウト個別に言い直す必要がある。
```

```quiz
`word-break: auto-phrase` を付けると折り返しがどう変わるか?
---
文字数で機械的に割れるのではなく、文節の切れ目で折り返すようになる（Chromium で確認）。
```

## 出典

- [piconic-ai/barefootjs#2949](https://github.com/piconic-ai/barefootjs/pull/2949) — `deck.ja.md` と `css/base.css` の `html[lang="ja"]` ブロック。
- [piconic-ai/barefootjs#2956](https://github.com/piconic-ai/barefootjs/pull/2956) — スマホ向けの日本語見出しサイズ。

#css #typography #japanese
