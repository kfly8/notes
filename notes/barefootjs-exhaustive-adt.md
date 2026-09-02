---
created: 2026-09-02
updated: 2026-09-02
title: BarefootJS の網羅性ピン留め
description: コンパイラの IR（ParsedExpr など）を discriminated union（タグ付きユニオン、ADT）で定義し、種類を 拡張したときに対応漏れがあればコンパイル時に検出されるようにする設計。
tags: [barefootjs, testing, typescript]
---
# BarefootJS の網羅性ピン留め

コンパイラの IR（`ParsedExpr` など）を discriminated union（タグ付きユニオン、ADT）で定義し、種類を
拡張したときに対応漏れがあれば**コンパイル時に**検出されるようにする設計。テストで壊れを見つけるのでは
なく、壊れた状態そのものを型で作れなくする——[[barefootjs-bug-finding]] の他の手法と違う予防的なレイヤー。

## `ParsedExpr`: kind で分岐するタグ付きユニオン

`packages/jsx/src/expression-parser.ts` の `ParsedExpr` は `identifier` / `literal` / `call` / `member` /
`binary` / `array-method` など数十種類のケースを持つ discriminated union。`array-method` はさらに
`method` フィールドで `join` / `slice` / `replace` など約20種類に分岐する、ネストしたタグ付きユニオン
になっている。ソースコード中のコメントに設計意図がそのまま書かれている:

> Extending the type adds a TS compile error in every exhaustive `ParsedExpr` switch, the same drift
> defence used for `array-literal` / `array-method`.

## 全アダプタに共通する `_exhaustive: never` パターン

`ParsedExpr.kind === 'array-method'` の `method` を分岐するコードは、Blade / ERB / Go / Jinja /
Mojolicious / Rust など全アダプタパッケージの `expr/array-method.ts` に同じ形で現れる:

```ts
switch (method) {
  case 'join': ...
  // ...約20ケース
  default: {
    // TS-level exhaustiveness guard.
    const _exhaustive: never = method
    throw new Error(`renderArrayMethod: unhandled ArrayMethod '${_exhaustive as string}'`)
  }
}
```

`method` の型に新しい配列メソッドを1件追加すると、この `switch` の `default` 節で `never` に代入
できなくなり、**このパターンを使っている全アダプタが同時にコンパイルエラーになる**。「新しい種類を
追加したのに、どこかのアダプタだけ対応を忘れる」という壊れ方が構造的に起きない。実行時のガード
（`throw`）はあくまで型チェックをすり抜けた場合の保険で、主眼はコンパイル時に落とすこと。

## [[coverage-floor]] との違い

coverage-floor は「IR の種類が**fixture でカバーされているか**」を計算で検査する仕組みで、種類自体が
増えたかどうかは `PARSED_EXPR_KINDS` という別の registry（同じく exhaustiveness-pinned）が受け持つ。
つまり両者は同じ「型で網羅性を強制する」語彙を共有しているが、担当する層が違う: `_exhaustive: never`
は「**アダプタの実装漏れ**」を防ぎ、coverage-floor は「**テストの網羅漏れ**」を防ぐ。前者はコンパイル
時、後者はテスト実行時に検出される。

## [[barefootjs-bug-finding]] の中での位置づけ

他の手法（[[pairwise-testing]]・[[barefootjs-mutation-sweep]]・[[barefootjs-adversarial-catalog]]）は
すべて「実行して壊れを観測する」テストだが、これは「壊れた状態を最初から作れなくする」設計そのもの。
テストが増える前段階の予防線にあたる。

## 出典

- `packages/jsx/src/expression-parser.ts`（piconic-ai/barefootjs, origin/main）
- `packages/adapter-{blade,erb,go-template,jinja,mojolicious,rust}/src/adapter/expr/array-method.ts`

## 理解度チェック

```quiz
`array-method` の `method` に新しい配列メソッドを1件追加すると何が起きるか。
---
`_exhaustive: never` パターンを使っている全アダプタパッケージの `switch` が同時にコンパイルエラーに
なる。実装漏れのあるアダプタを名指しでコンパイラが教えてくれる。
```

```quiz
`_exhaustive: never` パターンと coverage-floor は、どちらも「網羅性」を扱うが担当する層が違う。それぞれ何を防ぐか。
---
`_exhaustive: never` は IR の種類が増えたときのアダプタ側の実装漏れをコンパイル時に防ぎ、coverage-floor
は IR の種類がテストの fixture で実際にカバーされているかをテスト実行時に検査する。
```

#barefootjs #testing #typescript
