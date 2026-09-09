---
created: 2026-09-09
updated: 2026-09-09
title: "BarefootJS: `bf debug graph`の「no tracked deps」は壊れている証拠にならない"
description: bf debug graph <Component>はコンポーネントのJSXバインディングごとに、追跡している依存(signal/memo)を一覧表示するCLIツール。
tags: [barefootjs, signals, reactivity, debugging]
---
# BarefootJS: `bf debug graph`の「no tracked deps」は壊れている証拠にならない

`bf debug graph <Component>`はコンポーネントのJSXバインディングごとに、追跡している依存(signal/memo)を一覧表示するCLIツール。ところが、実際には正しく動的更新されるバインディングでも、この出力では**「(no tracked deps)」**(追跡している依存なし)と表示されることが何度もあった。

## 症状

次のようなパターンで`bf debug graph`が「no tracked deps」を返すのに、実機のブラウザ(Playwrightで確認)では正しく再描画される、ということが繰り返し起きた。

- **ファクトリ関数越しのsignal/memo読み取り**: `createFooStore()`のようなファクトリ関数が`{ x, ... }`という形でsignal/memoを返し、呼び出し側で`store.x()`と読む。
- **props経由の読み取り**: `props.xxx`という形での読み取り([[barefootjs-props-reactivity]])。
- **ヘルパー関数越しの読み取り**: `function f() { return someMemo() }`のように、memoの呼び出しをヘルパー関数の中に隠し、JSX側からは`{f()}`と呼ぶ。

コンパイラのドキュメント(`bf guide advanced/compiler-internals`)には、reactivity検出が「TypeCheckerによる`Reactive<T>`ブランド型の判定」と「signal/memo名・`props.value`形式への正規表現フォールバック」の二段構えだと明記されている。`props.value`のようなパターンは名指しでこの検出対象に含まれているにもかかわらず、`bf debug graph`の出力にはそれが反映されないケースがある——つまり、コンパイラ自身の内部判定と、`bf debug graph`が可視化する内容にはズレがある。

## 対処: 「no tracked deps」だけで壊れていると断定しない

`bf debug graph`は静的解析ツールの1つの見え方に過ぎない。**「no tracked deps」は「深掘りすべき手がかり」であって「壊れている確定証拠」ではない。** 実際に壊れているかどうかは、疑わしければ次のいずれかで確かめる:

1. `@barefootjs/test`の`renderToTest()`でIRテストを書き、実際にどのsignalが依存として記録されているか確認する。
2. 実ブラウザ(Playwrightなど)で、signalを変化させて対象のDOMが実際に更新されるか確認する。

実際に、上記3パターン(ファクトリ関数・props・ヘルパー関数)はいずれも、最小限の再現コードを作って実ブラウザで動作確認したところ、**全て正しく動的に更新された**。`bf debug graph`の表示だけを根拠に「このパターンは壊れているので避けるべき」という設計判断をしたことがあったが、これは誤りだった。

唯一、静的解析の限界という以前に**実行時エラーになる**本物の制約として確認できたのは次の1点だけ:

```tsx
const { x } = createFooStore()  // ❌ ReferenceError: Can't find variable: x
```

コンパイラの識別子抽出が分割代入を素通りするため、`x`が「宣言されていない変数」として扱われ実行時に落ちる。`const store = createFooStore()`と受け取り、`store.x()`とプロパティ経由で呼ぶ分には問題ない。

## 理解度チェック

```quiz
`bf debug graph`があるJSXバインディングを「(no tracked deps)」と表示した。これは実行時に更新されないことを意味するか?
---
意味しない。`bf debug graph`は静的解析の結果を表示するツールで、コンパイラ自身のreactivity検出(TypeChecker + 正規表現フォールバック)と表示内容にズレがあることがある。実際に壊れているかは`@barefootjs/test`のIRテストか実ブラウザでの動作確認で判断する。
```

```quiz
`createFooStore()`が返すsignalを`const { x } = createFooStore()`のように分割代入で受け取ると何が起きるか?
---
`ReferenceError: Can't find variable: x`で実行時に落ちる。コンパイラの識別子抽出が分割代入を素通りするため。`const store = createFooStore()`と受け取り`store.x()`とプロパティ経由で呼ぶ必要がある。
```

## 出典

- `bf guide advanced/compiler-internals`(reactivity検出の二段構え) —— `@barefootjs/cli@0.35.1`
- Tauri v2 + BarefootJS CSRのデスクトップアプリ(スライド編集GUI)の実装中、ファクトリ関数パターンが「`bf debug graph`でno tracked depsだったから壊れている」と誤って判断し、後日Playwrightでの実機検証によって訂正した。

#barefootjs #signals #reactivity #debugging
