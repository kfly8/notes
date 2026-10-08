---
created: 2026-10-08
updated: 2026-10-08
title: "BarefootJS: const のローカル変数は、子に渡すと初期化式ごとインライン化され、属性に使うと凍結される"
description: const のローカル変数は、子の props に渡すと初期化式がインライン化され、ネイティブ要素の属性に使うと一度評価されたまま凍結される。dist を読んで確かめた。
tags: [barefootjs, signals, reactivity, props]
---
# BarefootJS: const のローカル変数は、子に渡すと初期化式ごとインライン化され、属性に使うと凍結される

[[barefootjs|BarefootJS]] のコンポーネント内で `const x = ...` と置いた値は、JSX のどこで使うかで正反対の扱いになる。どちらも `dist/assets/components/*.js` を読んで確かめた。

## 子コンポーネントの props に渡すと、初期化式がインライン化される

```tsx
const x = f(sig())
<Child p={x} />
// → get p() { return f(sig()) }
```

派生値ならこれが正しい（props がリアクティブであり続ける、[[barefootjs-props-reactivity]]）。困るのは初期化式が**何かを構築する**場合で、`props.p` を読むたびに新しいインスタンスができる。

`const sheet = createSlideStylesheet(css)` を `SlideList` に渡したら、サムネイルの行ごとの `ref` がそれぞれ別の `CSSStyleSheet` を adopt し、テーマ変更で `replaceSync` していた元のオブジェクトはどの shadow root にも採用されていなかった。テーマを変えてもサムネイルには届かない。

対処: 値をアクセサ関数の後ろに置き、その関数を渡す。関数の識別子は参照のまま渡される（`get p() { return getX }`）。

```tsx
function getSheet() { return sheet }
<SlideList sheet={getSheet} />
```

## ネイティブ要素の属性に使うと、一度評価されたまま凍結される

```tsx
const disabled = !props.deckPath || props.presentPending
<button disabled={disabled} />
```

こちらは逆に、`disabled` はコンポーネントの初期化で一度計算されるただの変数になり、属性の effect はその値を参照するだけで `props.deckPath` を読み直さない。上の props の場合のようなインライン化は起きない。

`bf debug graph` は両方の DOM バインディングが `props.deckPath` / `props.presentPending` を追跡していると報告した（この場合は誤り）。実行時には黙って更新が止まり、e2e で気づいた。

対処: 式を JSX に直接書く（使う箇所ごとに重複してよい）か、`createMemo` にして `disabled={isDisabled()}` と呼ぶ。

## 理解度チェック

```quiz
`const sheet = createSlideStylesheet(css)` を子に渡したら、テーマ変更がサムネイルに届かなかった。なぜか。
---
props への `const` はその初期化式がインライン化され、`props.sheet` を読むたびに新しい `CSSStyleSheet` ができたため。`replaceSync` していた元のオブジェクトはどこにも採用されていなかった。
```

```quiz
`const disabled = !props.a || props.b` を `<button disabled={disabled}/>` に使うと、何が起きるか。
---
初期化時に一度だけ計算された値のまま凍結され、`props.a` が変わっても更新されない。式を JSX に直接書くか、`createMemo` にして呼ぶ。
```

```quiz
2つの挙動を確かめた方法は。
---
`bf debug graph` ではなく、`dist/assets/components/*.js` のコンパイル結果を読んだ。前者は凍結の場合に誤った依存を報告していた。
```

#barefootjs #signals #reactivity #props
