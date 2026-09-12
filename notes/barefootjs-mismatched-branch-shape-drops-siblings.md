---
created: 2026-09-12
updated: 2026-09-12
title: "BarefootJS: 分岐の形が非対称な三項演算子はDOM更新で兄弟要素を静かに失う"
description: BarefootJS の三項演算子cond ?
tags: [barefootjs, reactivity]
---
# BarefootJS: 分岐の形が非対称な三項演算子はDOM更新で兄弟要素を静かに失う

[[barefootjs]] の三項演算子`cond ? A : B`で、`A`が単一の生要素(`<div id="x">...</div>`)、`B`が`<>...</>`で複数のトップレベル要素を返す形になっていると、`cond`が後から`false`(`B`側)に変わったときのDOM更新で、`B`の**最初の要素以外がすべて静かに失われる**。エラーもワーニングもなし。

[[barefootjs-nested-fragment-child-unregistered-scope-experiment|別バグの最小再現を作る過程]]で偶然踏んだ。`@barefootjs/client@0.35.6`で確認。

## 原因

コンパイルされた三項演算子は`insert()`(`dist/runtime/index.js`)に降りる。`insert()`は`whenTrue`/`whenFalse`それぞれのテンプレート文字列が`<!--bf-cond-start:${id}-->`で始まるかをサンプル評価し、**どちらか一方でも**該当すれば`isFragmentCond = true`とする。

```tsx
{cond ? (
  <div id="welcome">Welcome</div>          // 単一の生要素 → bf-c属性で表現、コメントマーカーなし
) : (
  <>
    <div id="before">before</div>          // 複数のトップレベル要素を持つfragment
    <SomeClientComponent />
    <div id="after">after</div>
  </>
)}
```

`A`(`welcome`)がただの生要素だとコンパイラは`bf-c="s2"`属性を要素に直接付ける方式でレンダーし、コメントマーカーを一切出さない。`B`もたまたま`bf-c`属性方式で判定されてしまうと(実測では両方の分岐で`bf-cond-start`コメントが出ないケースがあった)、`isFragmentCond`は`false`になる。

`isFragmentCond: false`のとき、DOM更新は`updateElementConditional`が担当する。

```js
function updateElementConditional(region, id, result) {
  const condEl = /* ... */
  if (!condEl) return
  const { html, slots } = result
  const fragment = spliceSlots(parseHTML(html, insertParent), slots)
  const newEl = fragment.firstChild   // ← ここ
  if (newEl) condEl.replaceWith(newEl)
}
```

`fragment.firstChild`だけを取り出して`condEl.replaceWith(newEl)`する——**単一要素の置き換えしか想定していない**。`B`側のHTMLが実際には複数のトップレベルノードを持っていても、2つ目以降は`fragment`ごと参照が失われて捨てられる。

## 再現条件

- 三項演算子の一方の分岐が単一の生要素であること(子コンポーネントではない、`bf-c`属性方式でコンパイルされるもの)。
- もう一方の分岐が`<>...</>`で複数のトップレベル要素を持つこと。

[[barefootjs-nested-fragment-child-unregistered-scope]]の再現では、`A`側も`'use client'`な子コンポーネントに変えることで`isFragmentCond: true`に倒れ、このバグを回避して**別の**(本命の)バグに到達できた。つまりこの2つのバグは分岐の形次第でどちらか片方にしか到達できない、排他的な関係にある。

## 回避策

[[barefootjs-nested-fragment-child-unregistered-scope]]と同様、条件付きマウントを`hidden`属性による表示切り替えに置き換える。あるいは、もし条件付きマウントを維持するなら、両方の分岐を同じ形(両方単一要素、または両方fragment)に揃えることで`isFragmentCond`判定のブレを避けられる可能性がある(未検証)。

## 理解度チェック

```quiz
どんな形の三項演算子でこのバグを踏むか?
---
一方の分岐が単一の生要素、もう一方の分岐が`<>...</>`で複数のトップレベル要素を返す、形が非対称な三項演算子。
```

```quiz
`updateElementConditional`が複数要素を捨ててしまう具体的な理由は?
---
新しいHTMLをパースした`DocumentFragment`から`fragment.firstChild`だけを取り出し、`condEl.replaceWith(newEl)`で単一要素として置き換えるから。2つ目以降のノードは`fragment`ごと参照を失って破棄される。
```

## 出典

- `piconic-ai/peitho-studio`の作業ディレクトリで作った独立サンドボックス(`@barefootjs/client@0.35.6`、2026-09-12時点)での実験。`dist/runtime/index.js`の`insert()`を計装して確認した。

#barefootjs #reactivity
