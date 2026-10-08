---
created: 2026-10-08
updated: 2026-10-08
title: "BarefootJS: input の value バインディングは、計算結果が変わったときしか DOM に書かない"
description: value={expr} は計算結果が変わったときしか DOM に書かないので、正規化すると同じ値になる入力は画面に残る。change で表示も書き直す。
tags: [barefootjs, signals, forms]
---
# BarefootJS: input の value バインディングは、計算結果が変わったときしか DOM に書かない

[[barefootjs|BarefootJS]] の `<input type="number" value={minutes()} />` のようなリアクティブな `value` は、式の結果が前回と違うときだけ DOM に書き込む。ユーザーが打った文字が、正規化すると今表示している値と同じになる場合、画面は打った文字のまま残る。

- フィールドが `0` を表示しているときに `000` や `-1` を打つ。`onChange` で `0` に正規化して signal に入れても、signal の値は `0` のまま変わらないので、effect は DOM に書かず `000` が残る。
- `0` を表示しているフィールドを空にした場合も同じ。

フレームワークのバグではなく、細粒度リアクティビティの「値が変わらなければ何もしない」が入力欄では裏目に出る形。SolidJS でも同じ。

## 対処: 正規化する onChange で、表示も書き直す

```ts
/** 表示が `text` と違うときだけ書き直す。`input` ではなく `change` から呼ぶ。 */
export function showCanonicalValue(input: HTMLInputElement, text: string): void {
  if (input.value !== text) input.value = text
}
```

`change` はユーザーが打ち終わったときに1回だけ発火するので、入力の途中で書き換えてしまうことがない。`input` イベントで呼ぶと、`-` を打った瞬間に消されるような体験になる。

## 理解度チェック

```quiz
`0` を表示している数値入力に `000` を打って確定しても、`000` のまま残った。なぜか。
---
正規化した値が `0` で signal の値が変わらず、`value` バインディングの effect が DOM に書き込まないため。バインディングは計算結果の変化にしか反応しない。
```

```quiz
表示の書き直しを `input` ではなく `change` でやるのはなぜか。
---
`change` は打ち終わったときに1回だけ発火し、入力の途中で書き換えないため。`input` だと `-` や空文字の途中状態を即座に消してしまう。
```

#barefootjs #signals #forms
