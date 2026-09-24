---
created: 2026-09-23
updated: 2026-09-24
title: リアクティブグラフのグリッチ
description: signal を 1 つ書き換えたとき、それに依存する派生値の一部だけが新しい値になった中間状態を、別の購読者が観測してしまうこと。
tags: [signals, reactivity, consistency]
---
# リアクティブグラフのグリッチ

signal を 1 つ書き換えたとき、それに依存する派生値の一部だけが新しい値になった中間状態を、別の購読者が観測してしまうこと。典型はひし形（diamond）の依存で、1 つの signal `a` を 2 つの memo `b`、`c` が読み、その両方を 1 つの effect が読む形。

```canvas
{
  "nodes": [
    {"id": "a", "type": "text", "x": 200, "y": 0, "width": 160, "height": 40, "text": "signal a"},
    {"id": "b", "type": "text", "x": 0, "y": 100, "width": 160, "height": 40, "text": "memo b = a*10"},
    {"id": "c", "type": "text", "x": 400, "y": 100, "width": 160, "height": 40, "text": "memo c = a*100"},
    {"id": "e", "type": "text", "x": 200, "y": 200, "width": 160, "height": 40, "text": "effect"}
  ],
  "edges": [
    {"id": "e1", "fromNode": "a", "toNode": "b", "fromSide": "left", "toSide": "top"},
    {"id": "e2", "fromNode": "a", "toNode": "c", "fromSide": "right", "toSide": "top"},
    {"id": "e3", "fromNode": "a", "toNode": "e", "fromSide": "bottom", "toSide": "top"},
    {"id": "e4", "fromNode": "b", "toNode": "e", "fromSide": "bottom", "toSide": "left"},
    {"id": "e5", "fromNode": "c", "toNode": "e", "fromSide": "bottom", "toSide": "right"}
  ]
}
```

`a` を 1 → 2 に書き換えたとき、グリッチのない実装では effect は `a=2 b=20 c=200` を 1 回だけ見る。グリッチのある実装では、`b` だけが再計算された時点で effect が走り、`a=2 b=20 c=100` という、どの時点の正しい状態にも対応しない組み合わせを見る。

## なぜ起きるか

書き込みの中で購読者を**購読順に同期で**走らせ、しかも「誰が先に更新されるべきか」の順序を持たないと起きる。`b` が再計算されて自分の値を書くと、`b` の購読者（effect）がその場で走る。この時点で `c` はまだ再計算されていない。effect はさらに `c` の再計算で 1 回、`a` への直接の購読で 1 回走り、1 回の書き込みで 3 回実行される。

複数の書き込みをまとめる `batch` は、これを直さないことが多い。`batch` が重複除去するのは「batch の中で直接書いた signal」の購読者で、flush の時点で memo が再計算されると、その memo 自身の書き込みがまた同期で伝播するからだ。[[barefootjs]] ではこれを実測した（[[barefootjs-reactive-consistency-experiment]]）。

## 避け方

どれも「派生値が揃うまで副作用を走らせない」ための順序を持つ。

- **2 相に分ける（Solid 1.x）。** 書き込みはまず下流を `STALE`（再計算が必要）と `PENDING`（上流の更新待ち）でマークし、実行を 2 つのキューに振り分ける。純粋な計算（memo）は `Updates`、副作用（effect）は `Effects` に入り、`Updates` を先に流しきってから `Effects` を流す。memo が別の memo を読むときは、`lookUpstream` が `STALE` な上流を先に実行する。
- **push で印だけ付け、pull で値を取る（Preact Signals）。** signal の変更は依存先に通知を送るだけで、computed はその場では再計算しない。computed は読まれたときに初めて評価され（lazy）、依存のバージョン番号を確かめて、どれも変わっていなければキャッシュを返す。effect は通知を受けると自分の実行を予約する。値を取りに行くのは effect の実行時なので、その時点で依存はすべて最新になっている。
- **順序を持たず、症状を下流で吸収する。** グラフ自体は直さず、副作用の側を冪等にする。BarefootJS の非同期 API は、リクエストの記述を純粋にし、送信を tick の末尾に 1 回にまとめることで、中間状態で評価された記述を送らないようにした（[[barefootjs-async-layer0-design]]）。

## 画面には出ないが、副作用には出る

同期で伝播するランタイムでは、イベントハンドラが返るまでブラウザは描画しない。中間状態は DOM に一瞬書かれても、ユーザーの目に入る前に正しい値で上書きされる。画面だけ見ていると気づかない。

観測するのは副作用を持つ effect だけで、fetch、カウンタ、ログ、外部ストアへの書き込みがこれにあたる。中間状態のキーで余計なリクエストが 1 回飛ぶ、といった形で現れる。テストで捕まえるには、effect の実行回数と「実行時に読んだ値が整合していたか」を DOM に出して数えるのが確実だった。

## 理解度チェック

```quiz
ひし形依存（`a` → `b`、`a` → `c`、effect が 3 つとも読む）で、順序を持たない同期伝播のランタイムに `a` を 1 回書くと、effect は何回走り、最初の再実行で何を見るか。
---
3 回（`b` の再計算、`c` の再計算、`a` への直接の購読でそれぞれ 1 回）。最初の再実行は `b` だけ新しく `c` が古い組み合わせを見る。
```

```quiz
`batch(() => setA(2))` で包んでもグリッチが消えないのはなぜか。
---
`batch` がまとめるのは中で直接書いた signal の購読者だけで、flush 時に memo が再計算されると、その memo の書き込みが batch の外（深さ 0）でまた同期に伝播するから。
```

```quiz
グリッチが画面に出にくいのはなぜか。
---
同期伝播ではハンドラが返るまで描画されないので、中間状態の DOM は正しい値で上書きされてから描画される。観測するのは副作用を持つ effect だけ。
```

## 出典

- [solidjs/solid `packages/solid/src/reactive/signal.ts`（v1.9.0）](https://github.com/solidjs/solid/blob/v1.9.0/packages/solid/src/reactive/signal.ts) — `STALE` / `PENDING`、`markDownstream`、`Updates` と `Effects` の 2 キュー、`lookUpstream`
- [Signal Boosting（Preact ブログ、`preactjs/preact-www` の `content/en/blog/signal-boosting.md`）](https://github.com/preactjs/preact-www/blob/master/content/en/blog/signal-boosting.md) — computed の lazy 評価、通知の伝播、バージョン番号による判定
- [piconic-ai/barefootjs#3140](https://github.com/piconic-ai/barefootjs/pull/3140) — ひし形依存の fixture と `diamond-propagation-glitch` の登録

#signals #reactivity #consistency
