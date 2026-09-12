---
created: 2026-09-12
updated: 2026-09-12
title: "BarefootJS: スプライト1つに effect 1本で動かす"
description: DOM 要素1つをスプライト1つとして、transform を signal で書き換えるシューティングゲームを BarefootJS の CSR で作った。
tags: [barefootjs, signals, performance]
---
# BarefootJS: スプライト1つに effect 1本で動かす

DOM 要素1つをスプライト1つとして、`transform` を signal で書き換えるシューティングゲームを [[barefootjs]] の CSR で作った。フレームごとに数百の signal を書き、コンパイラが生成した effect がそれぞれ自分の要素の `style.transform` だけを書く。差分計算はしない。

## keyed `.map()` の行を子コンポーネントにする

弾や敵は keyed な `.map()` で描くが、**行の中に要素を直接書くと、その行の属性は追跡されない**。行ごとに `<Sprite>` コンポーネントを置くと、コンポーネント単位で effect が生成され、要素ごとに1本の effect になる。

```tsx
{sprites().map((s) => <Sprite key={s.id} sprite={s} />)}
```

`<Sprite>` の中で `style={{ transform: \`translate(${x()}px, ${y()}px)\` }}` のように signal を読めば、その要素だけが更新される。行の `.map()` は eager に評価されるので、行数分の effect が最初に揃う。

## フレーム切替は値が変わらないと effect が走らない

2コマのアニメーションで、フレーム番号の signal に同じ値を書いても effect は走らない。コマを進めるときは値を実際に変える（0→1→0）。「同じ値の set は無視される」のは通常は都合が良いが、アニメーションの「書けば再描画される」感覚とは違う。

## 計測

ヘッドレス Chromium で DEMO モードを回したときの値。

| 指標 | 値 |
| --- | --- |
| DOM ノード数（ピーク） | 約 238 |
| signal への書き込み / フレーム | 302〜500 |
| fps | 58〜60 |

fps・DOM ノード数・書き込み数は画面に出しているが、スコアとは別の場所（左下）に置き、計測値と演出を混ぜない。

## その他

- `document.hidden` でループを止める。止めないとタブを離れても signal を書き続ける
- `prefers-reduced-motion` ではタイトル画面だけ出してループを起動しない
- ゲームがキー入力を奪うので、ページ送りはビューア側に別経路（`?slide=N` + `popstate`）を用意した（[[peitho]]）

per-key の signal でコレクション全体の再レンダーを避ける話は [[barefootjs-per-key-signal-pattern]]。

## 理解度チェック

```quiz
keyed `.map()` の行の中に要素を直接書かず、行ごとに子コンポーネントを置くのはなぜか?
---
行の中に直接書いた要素の属性は追跡されないから。子コンポーネントにすると、コンポーネント単位で effect が生成され、要素ごとに自分の属性だけを書く effect になる。
```

```quiz
2コマのアニメーションで、フレーム番号の signal に同じ値を書き続けると何が起きるか?
---
同じ値の set は無視されるので effect が走らず、コマが切り替わらない。値を実際に変える必要がある。
```

## 出典

- [piconic-ai/barefootjs#2949](https://github.com/piconic-ai/barefootjs/pull/2949) — `site/core/slides/overview/component/components/Arcade.tsx`。計測値は PR 本文に記載。

#barefootjs #signals #performance
