---
created: 2026-09-23
updated: 2026-09-23
title: React の useDeferredValue / useTransition を値モデルで読み替える
description: React の useDeferredValue と useTransition は、更新を「緊急」と「後回しにしてよい」に分け、後者の間は古い画面を見せたままにする API。
tags: [react, signals, async, consistency]
---
# React の useDeferredValue / useTransition を値モデルで読み替える

React の `useDeferredValue` と `useTransition` は、更新を「緊急」と「後回しにしてよい」に分け、後者の間は古い画面を見せたままにする API。非同期の状態を値として持つ signal ベースのフレームワーク（[[async-state-as-value-vs-graph-node]] の値モデル）では、同じ体験のほとんどが別の形で得られ、API として選ばせる必要がない。[[barefootjs]] の設計を題材に、何が対応し何が残るかを整理した。

## React の 2 つの API がしていること

- **`useDeferredValue(value)`** は、更新時にまず古い値でレンダーし、新しい値でのレンダーを裏で予約する。裏のレンダーは中断でき、その間に `value` がまた変わると最初からやり直す。裏のレンダーが Suspense で止まっても fallback は出ず、古い値が見えたままになる。`query !== deferredQuery` で「古い」ことを表示に使える。
- **`useTransition()`** は、`startTransition` の中の状態更新を非ブロッキングで中断可能にし、`isPending` で進行中を知らせる。async 関数を渡すと、終わるまで `isPending` が true のまま。制御された text input の値は transition で更新できない。入力への反映は同期でなければならないから。

どちらも核にあるのは、**レンダーが中断できる**こと。長いレンダーの途中でも入力イベントを先に処理でき、古い画面を捨てずに次の画面を準備できる。

## 値モデルで対応するもの

| React | 値モデル（BarefootJS の `createQuery` / `createMutation`） |
| --- | --- |
| `useDeferredValue` で古い結果を残す | `posts()` は最後に分かっている値。依存が変わっても、次の結果が来るまで前の値のまま |
| `isStale = query !== deferredQuery` | `fetchPosts.isPending()` |
| Suspense で止まっても fallback を出さない | 値の軸と決着の軸が別なので、再取得中の fallback はそもそも起きない |
| `useTransition` の `isPending` | `saveComment.isPending()`（書き込みの action に付く） |
| 緊急更新（入力への反映） | signal の書き込み。常に同期 |

「値あり × pending」は React では 2 つの値を見比べて作る状態だが、値の軸と決着の軸を分けた設計（[[async-value-and-settlement-axes]]）では最初から正当な組み合わせとして表現される。

制御された input の問題も起きない。React では state の更新が次のレンダーまで反映されないので、`value={input}` のままでは入力した文字と state が一瞬ずれる。BarefootJS のコンパイル結果は、入力イベントで signal を書くと、同じ同期処理の中で `if (el.value !== v) el.value = v` が走る形になっていて、ずれる時間がない。

## 対応しないもの

- **重い同期計算の後回し。** signal は依存するスロットだけを更新するので、React のように木全体を再レンダーすることはなく、後回しにしたい計算は少ない。それでも欲しければ `createDeferred(source)` のような factory が要る。userland の helper では SSR の値を追えず、Go アダプタで黙って壊れた（[[barefootjs-reactive-consistency-experiment]]）ので、コンパイラが認識する factory にする必要がある。
- **レンダーの中断（time slicing）。** 同期伝播のランタイムには中断すべきレンダーがない代わりに、伝播の途中で入力を割り込ませる手段もない。ハンドラが走っている間は入力イベントが待たされるが、これは JavaScript が単一スレッドであることによるもので、どのフレームワークでも同じ。仕事量は影響を受けたスロットの数に比例する。体感できるほど止まるのは、memo の中の重い計算か、1 回の書き込みで巨大なリストの reconcile が走るときに限られると考えているが、実測はしていない。
- **複数の query の一斉切り替え。** A と B の 2 つの query が別々に決着すると、A だけ新しく B が古い画面が出る。Solid 2.0 が transition を削除して「下のものが全部揃うまで古い値を保つ」を既定にしたのは、この問題を扱うため。値モデルでは、揃うまで全部の古い値を保つ combinator を後から足すことになり、BarefootJS の `spec/async.md` では層 2 として保留している。

## 理解度チェック

```quiz
React で制御された text input を `startTransition` の中で更新できないのはなぜか。
---
入力への反映は同期でなければならないが、transition の更新は非ブロッキングで後回しにされるから。入力した文字と state がずれる。
```

```quiz
`useDeferredValue` の「古い結果を残しつつ新しい結果を準備中と示す」状態は、値の軸と決着の軸を分けた設計では何にあたるか。
---
値の軸が「前の値あり」、決着の軸が pending の組み合わせ。`posts()` が前の値を返し、`fetchPosts.isPending()` が true。
```

```quiz
値モデルに transition の API がなくても残る問題は何か。
---
複数の query が別々に決着して、一部だけ新しい画面が出ること。揃うまで古い値を保つ combinator が要る。
```

## 出典

- [useDeferredValue – React](https://react.dev/reference/react/useDeferredValue)
- [useTransition – React](https://react.dev/reference/react/useTransition)
- [Solid 2.0 v2.0.0-rc.0 リリースノート](https://github.com/solidjs/solid/releases/tag/v2.0.0-rc.0)
- [piconic-ai/barefootjs](https://github.com/piconic-ai/barefootjs) `spec/async.md`、`packages/jsx/src/ir-to-client-js/emit-reactive.ts`（`value` 属性の書き込み）

#react #signals #async #consistency
