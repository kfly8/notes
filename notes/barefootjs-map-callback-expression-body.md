---
created: 2026-09-07
updated: 2026-10-07
title: "BarefootJS: .map()コールバックはブロック本体で書けない(BF021)"
description: BarefootJSの.map()コールバックを式本体(item, i) => (<jsx/>)ではなくブロック本体{ const x = ...; return <jsx/> }で書くと、preambleがvalue declarationの並びとして認識されずBF021でコンパイルが落ちる。
tags: [barefootjs, jsx]
---
# BarefootJS: .map()コールバックはブロック本体で書けない(BF021)

[[barefootjs]] の `.map()` コールバックを式本体(`(item, i) => (<jsx/>)`)ではなく**ブロック本体**(`(item, i) => { const x = ...; return <jsx/> }`)で書くと、`BF021`(preamble が value declaration の並びとして認識されない)でコンパイルが落ちる。

## 回避策

ループの中で何かを事前計算したい場合は、`.map()` の**外**で `createMemo` を使って準備しておき、コールバック自体は式本体のまま保つ。

```tsx
const rowLabels = createMemo(() => items().map(item => computeLabel(item)))

return (
  <ul>
    {items().map((item, i) => (
      <li key={item.id}>{rowLabels()[i]}</li>
    ))}
  </ul>
)
```

## 理解度チェック

```quiz
`.map()` のコールバックを `(item, i) => { const x = ...; return <li/> }` と書くと何が起きるか。
---
`BF021`(preamble が value declaration の並びとして認識されない)でコンパイルが落ちる。
```

```quiz
`.map()` の行ごとに事前計算した値を使いたい。コールバックをブロック本体にせずにどう書くか。
---
`.map()` の外で `createMemo` を使って計算済みの配列を用意し、コールバックは式本体のまま `rowLabels()[i]` のように index で参照する。
```

## 出典

- 実際に BarefootJS アプリを実装中に踏んだ(`@barefootjs/jsx@0.33.6`)。

#barefootjs #jsx
