---
created: 2026-09-21
updated: 2026-09-21
title: 非同期状態の「値の軸」と「決着の軸」
description: 非同期データを値として持つとき、「値があるか」と「最後のリクエストが決着したか」は独立した軸で、1 つの直和に押し込むと prev や idle が要る。TanStack Query v4 の status / fetchStatus と同じ分け方。
tags: [signals, async, types]
---
# 非同期状態の「値の軸」と「決着の軸」

非同期データを値として持つとき（[[async-state-as-value-vs-graph-node]]）、`pending | ready(T) | error(E)` という 1 つの直和で表そうとすると無理が出る。「値があるか」と「最後のリクエストが決着したか」は独立していて、4 通りの組み合わせが全部正当に存在するからだ。

| | 値あり | 値なし |
| --- | --- | --- |
| pending | 再取得中。前の値を見せる | 初回取得中 |
| error | 再取得に失敗。前の値を見せつつエラー表示 | 初回取得に失敗 |
| どちらでもない | 通常 | 初期値が無く、まだ何も送っていない |

右下の「error でも pending でもないのに値が無い」が要点で、サーバーがデータを描かなかったシェル状態や、まだ呼んでいない書き込みがこれにあたる。1 つの直和に押し込むと、この状態のために `idle` を足し、再取得中の前の値のために `prev` を足すことになる。

## 2 軸に分けると消えるもの

- **`prev` が要らない。** 値の軸は「最後に分かっている値」で、pending 中も error 後も書き換わらない。
- **`idle` が要らない。** 決着の軸が「どちらでもない」で、値の軸が「なし」。
- **値の型が seed だけで決まる。** 初期値が必須の prop から来るなら `T`、optional なら `T | undefined`。決着の軸は値の型に影響しない。

## 前例

- **TanStack Query v4** は `status`（データがあるか。`loading` / `error` / `success`）と `fetchStatus`（queryFn が走っているか。`fetching` / `paused` / `idle`）に分けた。v3 までの単一 `status` では「データ無しかつ fetch していない」状態が表せず、`idle` という不正な組み合わせを生む状態を持っていたのが理由。
- **Solid 2.0** は `<Loading>`（値が無いときだけ fallback）と `isPending`（再取得中。古い値は見えたまま）に分けている。
- **Angular の `resource()`** は 1 つの `status`（`idle` / `loading` / `reloading` / `resolved` / `error` / `local`）に押し込んでいて、`loading` 中は `value()` が `undefined` になる。前の値を残したい用途では `reloading` を使い分ける必要がある。

## 型による保証はできない

「決着の軸が error でなければ値がある」を型で保証することはできない。上の表の右下が正当な状態だからで、TypeScript の narrowing が別々の呼び出しをまたげないという技術的な理由より前に、意味として独立している。保証したいなら、初期値の型を必須にして値の軸そのものを型から消す。

## 理解度チェック

```quiz
`pending | ready(T) | error(E)` の 1 つの直和で表そうとすると、なぜ `prev` と `idle` を足すことになるか。
---
再取得中に前の値を残すには pending に `prev` が要り、「値が無く、送ってもいない」状態には `idle` が要る。値の有無と決着を別の軸にすれば、どちらも組み合わせとして自然に表せる。
```

```quiz
TanStack Query が v4 で `fetchStatus` を分けた理由は何か。
---
単一の `status` では「データが無く、fetch もしていない」（オフラインで mount した等）が表せず、`idle` という他の状態と矛盾する値を持つ必要があったから。`status` はデータの有無、`fetchStatus` は queryFn の実行状態を表す。
```

## 出典

- [TanStack Query v4: Queries（status と fetchStatus）](https://tanstack.com/query/v4/docs/framework/react/guides/queries)
- [Solid 2.0 v2.0.0-rc.0 リリースノート](https://github.com/solidjs/solid/releases/tag/v2.0.0-rc.0)
- Angular の `packages/core/src/resource/api.ts`（`ResourceStatus` の定義。GitHub の main ブランチ）

#signals #async #types
