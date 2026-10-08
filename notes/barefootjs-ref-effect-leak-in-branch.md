---
created: 2026-10-08
updated: 2026-10-08
title: "BarefootJS: 条件分岐の ref の中の createEffect は再入のたびに1つ漏れた"
description: 分岐の ref の中で createEffect を呼ぶと、再入のたびに前回の effect が外れた要素に対して動き続けた（#2927、PR #2942 で修正）。
tags: [barefootjs, signals, reactivity]
---
# BarefootJS: 条件分岐の ref の中の createEffect は再入のたびに1つ漏れた

[[barefootjs|BarefootJS]] で `cond ? <div ref={el => createEffect(() => ...)}/> : <other/>` と書くと、`cond` が false → true に戻るたびに前回の effect が生き残り、もう DOM に無い `el` に対して動き続けた。往復1回につき1つずつ増え、止まらない。各 effect は本物の仕事（Shadow DOM のキャンバスを作り直すなど）を、誰も参照していない要素に対して続ける。

## 原因（コンパイル結果とランタイムを読んだ）

`@barefootjs/client` の `insert()` には分岐のための `branchCleanup` がある。`branch.bindEvents(...)` の戻り値を cleanup として保持し、次に条件が切り替わるときに呼ぶ。

```js
// runtime/index.js
const cleanup = branch.bindEvents(region.bindScope, { isFirstRun: false });
branchCleanup = typeof cleanup === "function" ? cleanup : null;
```

ところがコンパイラが分岐に対して出す `bindEvents` は、`ref` の中で `createEffect` を呼んでも何も返さない。`createEffect` の破棄が分岐の cleanup に繋がらないので、ランタイムの仕組みに呼ぶものが無かった。

```js
bindEvents: (scope, { isFirstRun }) => {
  const [hostEl] = find(scope, "s3")
  hostEl && (el => {
    createEffect(() => { /* ... */ }) // 戻り値を捨てている。bindEvents も何も返さない
  })(hostEl)
}
```

`npm create barefootjs@latest` の Hono テンプレート（`@barefootjs/client@0.35.5`）で、toggle と bump の2つのボタンを持つ最小再現を作り、Playwright で往復回数と effect の実行回数を数えて確かめた。

## 修正と回避

piconic-ai/barefootjs#2927 として報告し、2026-09-12 の PR #2942 で修正された。

修正前の回避は、分岐をやめて両側をマウントしたままにし、`hidden` クラスで表示を切り替えること。`ref` の中の `createEffect` 自体は問題ではなく、`ref` を持つ要素ごとアンマウントとマウントを繰り返す形だけが漏れる。`.map()` の行の中で無条件にマウントする `ref` はこの対象外。

同じ分岐の中の `ref` には、effect の漏れとは別に「`ref` が走らない」経路もあった — [[barefootjs-branch-ref-only-on-row-mount]]。

## 理解度チェック

```quiz
分岐を往復するたびに、キャンバスの再マウントが1回ずつ増えていった。どこが切れていたか。
---
コンパイラが出す分岐の `bindEvents` が、`ref` の中の `createEffect` の破棄関数を返していなかった。ランタイムの `branchCleanup` は戻り値を呼ぶ仕組みなので、何も呼べなかった。
```

```quiz
修正前に、`ref` の中で `createEffect` を使ったまま漏れを避けるには。
---
分岐をやめて両側をマウントしたままにし、`hidden` クラスで切り替える。アンマウントとマウントの往復が起きなければ漏れない。
```

## 出典

- [piconic-ai/barefootjs#2927](https://github.com/piconic-ai/barefootjs/issues/2927)
- [piconic-ai/barefootjs#2942](https://github.com/piconic-ai/barefootjs/pull/2942)

#barefootjs #signals #reactivity
