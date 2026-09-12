---
created: 2026-09-12
updated: 2026-09-12
title: 固定比率キャンバスの UI はスマホで縮尺ごと縮む
description: "スライドのように「1280x720 の固定キャンバスを transform: scale() で画面に収める」作りは、デスクトップでは1つの座標系で全部が済んで楽だが、スマホではキャンバスごと約 0.3 倍になる。"
tags: [css, mobile, slides, peitho]
---
# 固定比率キャンバスの UI はスマホで縮尺ごと縮む

スライドのように「1280x720 の固定キャンバスを `transform: scale()` で画面に収める」作りは、デスクトップでは1つの座標系で全部が済んで楽だが、スマホではキャンバスごと約 0.3 倍になる。本文 24 単位が画面上で 7px、ボタンもその縮尺で潰れる。[[peitho]] のデッキで踏んで、3段階で直した。

## 1. 操作系はキャンバスの外に出す

ページ送りや言語切替のような操作系は、キャンバスの隅に置いていた（キャンバス座標で配置し、同じ倍率で `scale()`）。スマホではこれを**ビューポート下端に固定したバー**へ移す。DOM の要素は同じもので、親を付け替えるだけにすると、イベントハンドラや状態はそのまま使える。

```ts
const compactQuery = matchMedia('(max-width: 820px), (hover: none) and (pointer: coarse)')
function dockChrome(compact: boolean) {
  if (compact) { bar.append(langs, counter, nav); /* inline の left/top/transform を消す */ }
  else { document.body.append(counter, nav, langs); bar.remove() }
}
```

判定は幅だけでは足りない。横向きのスマホやタブレットは幅 820px を超えるが、キャンバス倍率は 0.45〜0.8 で、ボタンはまだ指で押せない。`(hover: none) and (pointer: coarse)` を OR で足す。

バーの分だけキャンバスの高さも縮める。ビューアが行う `min(innerWidth/W, innerHeight/H)` の fit を、`innerHeight - bar.offsetHeight` で自前でやり直す。**コンパクトでない側でも自前で fit する**こと。切替がリサイズを伴わずに起きる（タッチ端末にマウスを繋ぐなど）と、ビューアのリサイズ時の fit が走らず、前の縮小 transform が残る。これもレビューで指摘された。

## 2. 縦長のキャンバスにする

文字を大きくしても 16:9 のままでは収まらない。幅 820px 以下では、キャンバスの幅（1280 単位）は据え置いて、**高さを画面の比率まで伸ばす**。縦向きのスマホなら約 1280x2500。倍率は変わらず約 0.3 なので、48 単位の本文が画面上で約 15px になる。

```ts
const ch = narrow && !fixed ? Math.max(720, Math.round(1280 * avail / innerWidth)) : 720
canvas.style.height = `${ch}px`
document.documentElement.style.setProperty('--peitho-canvas-height', `${ch}px`)
```

高さは CSS 変数で渡す。peitho の `.peitho-slide` が `height: var(--peitho-canvas-height, 720px)` を読むので、スライド側の CSS を触らずに伸びる。

ゲーム盤のように座標が 1280x720 で書かれているスライドは伸ばせない。そのスライドの `<section>` に `data-canvas="fixed"` を付け、fit 側で見て 16:9 のままにする。

## 3. レイアウトを1カラムにし、文字を2倍にする

`body.bf-compact` を付け、CSS で各レイアウトを組み直す。数字はすべてキャンバス単位（画面上は約 0.3 倍）。

- 本文 24 → 48、見出し 76〜88 → 100（日本語は 84、[[japanese-headline-wrapping]]）、コード 15〜20 → 32〜34
- 横並びの grid（5fr 7fr など）→ `grid-template-columns: 1fr`
- コードパネルは `overflow-x: auto`。ただし grid アイテムの `min-width: auto` のせいで `white-space: pre` の中身が列を押し広げてキャンバスからはみ出す。`> * { min-width: 0 }` が要る（[[flex-item-text-overflow]] と同じ仕組み）
- flex コンテナ内の grid に `flex: none` を付けると、幅が中身に縮む。コンテナを `display: block` にするか `width: 100%` を付ける

## 検証

Playwright で 390x844（縦）、844x390（横）、1024x768（タッチ）、1920x1080 を回し、各スライドで「キャンバスより下にはみ出した要素」と「操作系と交差する要素」を `getBoundingClientRect()` で数えるスクリプトを書いた（[[playwright-media-query-checks]]）。目視のスクリーンショットでは、コンパイラのコードパネルの末尾1行が切れている、ショーケースの最終カードがキャンバス下端を越えている、といった「境界ぎりぎり」を見落としていた。

## 理解度チェック

```quiz
スマホ判定に `(max-width: 820px)` だけでなく `(hover: none) and (pointer: coarse)` を足すのはなぜか?
---
横向きスマホやタブレットは幅が 820px を超えるが、キャンバス倍率は 0.45〜0.8 で、キャンバス内のボタンはまだ指で押せる大きさにならないから。
```

```quiz
コンパクト表示でない側でもキャンバスの fit を自前でやり直すのはなぜか?
---
メディアクエリの切替はリサイズなしでも起きる（タッチ端末にマウスを繋ぐなど）。その経路ではビューアのリサイズ時 fit が走らず、コンパクト時に書いた縮小 transform が残ってしまうから。
```

```quiz
`white-space: pre` のコードパネルが grid の列を押し広げてキャンバスからはみ出すのを防ぐには?
---
grid アイテムに `min-width: 0` を付ける。既定の `min-width: auto` は中身の最小幅（折り返せない1行）まで縮まないため。
```

## 出典

- [piconic-ai/barefootjs#2954](https://github.com/piconic-ai/barefootjs/pull/2954) — 操作系をビューポート下端のバーへ
- [piconic-ai/barefootjs#2956](https://github.com/piconic-ai/barefootjs/pull/2956) — 縦長キャンバスと1カラムレイアウト

#css #mobile #slides #peitho
