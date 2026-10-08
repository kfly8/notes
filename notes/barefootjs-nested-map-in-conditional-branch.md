---
created: 2026-10-08
updated: 2026-10-08
title: "BarefootJS: 条件分岐の中にネストした .map() の内側の行は更新されない"
description: 条件分岐の中で .map() を二重にすると、内側の行の属性とテキストが更新されない（#3274、PR #3287 で修正）。グループごとに一重の .map() を書く。
tags: [barefootjs, signals, reactivity]
---
# BarefootJS: 条件分岐の中にネストした .map() の内側の行は更新されない

[[barefootjs|BarefootJS]] で、`cond() ? <div>{outer.map(key => ... {inner(key).map(choice => <button aria-checked={...}/>)} ...)}</div> : null` のように、**条件分岐の中**で `.map()` を二重にすると、内側の行のリアクティブな属性やテキストが一度描かれたきり更新されない。クリックのハンドラは動いて signal は変わるのに、ボタンの `aria-checked` や `class` はそのまま。

- 外側の配列がモジュールレベルの `const` でも signal でも起きる。
- 同じ二重の `.map()` を分岐の外に置くと更新される。分岐の中でも一重の `.map()` なら更新される。
- コンパイル後の分岐の `bindEvents` を読むと、内側のループは外側の行のテンプレート文字列に焼き込まれているだけで、属性を更新する effect が無い。

piconic-ai/barefootjs#3274 として報告し、2026-10-01 の PR #3287 で修正された。@barefootjs/client 0.39.2（2026-10-02）以降に入っていると思われるが、0.39.1 のアプリ側は未確認。

## 0.39.1 までの回避

グループごとに `.map()` を1つずつ書く。

```tsx
{isOpen() ? (
  <div>
    <div role="radiogroup">{picks('aspect_ratio').map(pick => <button aria-checked={props.settings.aspect_ratio === pick.choice ? 'true' : 'false'} ...>{pick.label}</button>)}</div>
    <div role="radiogroup">{picks('language').map(pick => <button aria-checked={props.settings.language === pick.choice ? 'true' : 'false'} ...>{pick.label}</button>)}</div>
  </div>
) : null}
```

または分岐をやめ、両方をマウントしたまま `hidden` クラスで切り替える。

最初は「外側が `const` だから」と疑ったが、最小再現で外側を signal にしても変わらず、分岐の有無だけで結果が変わった。切り分けは Vite + `@barefootjs/vite` の CSR で組み、Playwright でクリック前後の属性を取って比べた。

## 理解度チェック

```quiz
分岐の中の二重 `.map()` で、クリックすると signal は変わるのにボタンの属性が変わらない。コンパイル結果には何が無いか。
---
内側の行の属性を更新する effect。内側のループは外側の行のテンプレート文字列に焼き込まれているだけになっていた。
```

```quiz
外側の配列を signal にすれば直るか。
---
直らない。原因は配列の種類ではなく、二重の `.map()` が条件分岐の中にあること。分岐の外に出すか、`.map()` をグループごとに一重で書く。
```

## 出典

- [piconic-ai/barefootjs#3274](https://github.com/piconic-ai/barefootjs/issues/3274)
- [piconic-ai/barefootjs#3287](https://github.com/piconic-ai/barefootjs/pull/3287)

#barefootjs #signals #reactivity
