---
created: 2026-10-01
updated: 2026-10-01
title: 非同期 action の状態は SSR で同じ意味に描ける位置だけ読める
description: BarefootJS 0.39.1 の createQuery / createMutation は、通信状態のアクセサーを JSX のどこにでも書けるわけではない。
tags: [barefootjs, async, ssr, compiler]
---
# 非同期 action の状態は SSR で同じ意味に描ける位置だけ読める

BarefootJS 0.39.1 の `createQuery` / `createMutation` は、通信状態のアクセサーを JSX のどこにでも書けるわけではない。SSR の初期値を各アダプタで同じ意味に描ける位置に限ってコンパイラが認める。設計の背景は [[barefootjs-async-layer0-design]]。

## SSR では通信が走らない

`action.isPending()` の初期値は `false`、`action.error()` は `undefined`。公式コンパイラテストでは、Hono の SSR action にこの2つを返す stub が生成され、リクエスト関数自体は SSR 出力に含まれないことを確認している。

| 書く位置 | 0.39.1 の扱い |
| --- | --- |
| `{action.error() ? <p>失敗</p> : null}` | 認める |
| `{action.isPending() ? <p>通信中</p> : null}` | 認める |
| `disabled={action.isPending()}` | 認める |
| `aria-busy={action.isPending()}` | 認める |
| `<p>{action.error()}</p>` | BF117 |
| `title={action.isPending()}` | BF117 |
| `aria-label={action.isPending()}` | BF117 |

ARIA 属性なら何でもよいわけではない。boolean 状態を表す属性であることが条件。

## 関数や memo を挟めば自由になるわけではない

公式テストの説明は、許される読みを条件・属性の式全体に置く形として限定し、memo・定数・関数を経由する読みは引き続き BF117 としている。JavaScript の意味が同じでも、SSR 用の置換規則まで同じとは限らない。

状態の加工は event handler や effect の中で行うか、必要な読みを `/* @client */` でクライアントに遅らせる。SSR にも表示する情報なら、初期値を持つ別の signal などで表示の責務を分ける。

値の有無と通信状態の違いは [[async-value-and-settlement-axes]]、初期データの契約は [[barefootjs-query-initial-is-result]]、書き込みの呼び出し規則は [[barefootjs-mutation-call-time]]。

## 検証の根拠と範囲

公開された 0.39.1 の公式テストを読んだ。query のテストには拒否位置と許可位置の一覧、Hono / Go 出力の期待値があり、mutation のテストには SSR 値が undefined で action の stub が生成される期待値がある。これは公式テストに書かれた保証の整理で、このノート独自の実行結果ではない。

## 理解度チェック

```quiz
aria-busy に isPending() が書けるなら、aria-label にも書けるか。
---
書けない。認められるのは boolean 状態の属性で、文字列ラベルを表す aria-label は BF117 の対象。
```

```quiz
action.error() をそのままテキストに描く代わりに、SSR 対応のエラー表示はどう書くか。
---
アクセサーを条件全体に置き、失敗時に固定の文言を持つ要素を描く。詳細の加工が必要ならクライアント側の処理に分ける。
```

## 出典

- [0.39.1 createQuery ドキュメント](https://github.com/piconic-ai/barefootjs/blob/create-barefootjs%400.39.1/docs/core/reactivity/create-query.md)
- [0.39.1 createQuery コンパイラテスト](https://github.com/piconic-ai/barefootjs/blob/create-barefootjs%400.39.1/packages/jsx/src/__tests__/create-query.test.ts)
- [0.39.1 createMutation コンパイラテスト](https://github.com/piconic-ai/barefootjs/blob/create-barefootjs%400.39.1/packages/jsx/src/__tests__/create-mutation.test.ts)

#barefootjs #async #ssr #compiler
