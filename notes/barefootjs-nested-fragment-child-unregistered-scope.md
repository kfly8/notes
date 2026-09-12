---
created: 2026-09-12
updated: 2026-09-12
title: "BarefootJS: ネストしたfragmentRootの子コンポーネントの内部条件分岐がDOM更新されない"
description: BarefootJS で、祖先の三項演算子(cond ?
tags: [barefootjs, reactivity, hydration]
---
# BarefootJS: ネストしたfragmentRootの子コンポーネントの内部条件分岐がDOM更新されない

[[barefootjs]] で、祖先の三項演算子(`cond ? <A/> : <B/>`)がマウント後に`A`から`B`へ切り替わったとき、`B`の中にある`'use client'`な子コンポーネント(fragmentRoot、つまり単一のラップ要素を持たず`<>...</>`を返すもの)がさらに内部に持つ条件分岐(`{errorMessage ? <div>...</div> : null}`)が、シグナルは正しく変化しているのに一度もDOM更新されないことがある。エラーもワーニングも出ない(ただしランタイム自身が別の警告を出す場合がある。後述)。

peitho-studioの`StatusBar.tsx`で発生を確認し、その後 [[barefootjs-nested-fragment-child-unregistered-scope-experiment|独立した最小コード]] で`@barefootjs/client@0.35.1`・`0.35.6`(2026-09-12時点の最新)の両方に再現することを確認した。

## 原因: 子コンポーネント自身のcomment-scopeが登録されない

`@barefootjs/client`の`dist/runtime/index.js`の`insert()`(コンパイルされた三項演算子が降りる先)に`scope`引数をログする1行を仕込んで特定した。

問題の子(`StatusBar`相当)は`fragmentRoot: true`でコンパイルされ、SSR/CSRいずれでも自身の実体を`<!--bf-scope:Name_xxx-->...<!--bf-/scope:Name_xxx-->`という**コメントで囲む**ことで、単一のラップ要素なしに「自分の範囲はここからここまで」を表現する。この子が親の`bindEvents`から`t && initChild("Name", t, props)`という普通の経路でマウントされるとき、`t`(＝`insert()`に渡る`scope`)は親テンプレートの`bf="sN"`属性クエリで見つけた**フラグメント内の何らかの要素**になる——観測した実例では、子コンポーネント自身が持つ`<footer>`要素だった。

`t`(=`<footer>`)は`commentScopeRegistry`に登録されていない。`insert()`が呼ぶ`updateFragmentConditional`/`findCondTarget`は、`scope`が`commentScopeRegistry`に載っていない場合、`scope`自身のサブツリー内だけを`querySelectorAll`で探す(`candidatesInScope`)。ところが自分の内部条件分岐のコメントマーカー(`<!--bf-cond-start:s0-->`)は`<footer>`の**外側**、fragment全体の中の兄弟の位置にある。サブツリー限定の探索では絶対に見つからず、`updateFragmentConditional`は`startComment`も`condEl`も`null`のまま何もせず終わる。これが毎回無音で起きる。

`@barefootjs/client@0.35.6`には`commentScopeRegistry`まわりの関連する修正(`Register commentScopeRegistry for a comment wrapper's nested CSR mount`)が入っているが、これは`upsertChild`のslot経由でCSR-createされる別のマウント経路を対象にしたもので、`initChild`の素朴な呼び出し経路には効いていない。実際に0.35.6でも同じ症状を確認済み。

## 再現条件

[[barefootjs-nested-fragment-child-unregistered-scope-experiment]] に切り出した最小コードで、以下がすべて必要条件だと確認した。

1. 祖先の三項演算子の**両方の分岐**が子コンポーネントを描画すること(`Welcome`/`StatusBarCopy`相当)。片方の分岐が単一の生要素(`<div id="welcome">`のような)だと、コンパイラの`isFragmentCond`判定が変わり[[barefootjs-mismatched-branch-shape-drops-siblings|別の、もっと単純なバグ]]を踏んでしまい今回の条件を満たせない。
2. マウント後に現れる側の分岐が`<>...</>`で、問題の子コンポーネントの**前にも後にも**別の兄弟要素があること。子が分岐の最初か最後の要素だけだと再現しない——境界計算がたまたま親自身の境界と一致してしまうため。

## 回避策

祖先の分岐に依存して**マウント自体を切り替える**のをやめ、要素は常時マウントしたまま`hidden`属性で表示だけを切り替える。`insert()`のブランチ切り替え/スコープ解決の経路そのものを通らなくなるので、この種のバグの影響を受けない。peitho-studioの`SlideContextMenu.tsx`/`SlidePreview.tsx`が、全く別の原因(conditional `ref`の中で作った`createEffect`が分岐の再入のたびリークする問題)に対して既に採用していたのと同じ「常時マウント + hidden」パターンで回避できた。

子コンポーネントのhydration/初期化の所有権という意味では[[barefootjs-orphaned-child-hydration]]と隣接するが、あちらは「誰も`initChild`を呼ばない」ために永久にhydrateされない話で、こちらは「`initChild`は呼ばれるが、子自身の内部スコープが正しく登録されない」話。軸が近いが原因は別。

## 理解度チェック

```quiz
`errorMessage`のsignalへの`set()`は正しくエフェクトを再実行しているのに、なぜバナーのDOMは更新されないのか?
---
子コンポーネントの`insert()`に渡る`scope`(`t`)が、自分自身のfragment内の兄弟要素(`<footer>`)であり`commentScopeRegistry`に未登録のため、マーカー探索が`scope`のサブツリーだけに限定されて自分の内部条件分岐のコメントマーカーを見つけられず、DOM更新が毎回無音でno-opになる。
```

```quiz
再現に必要な、祖先の三項演算子の構造上の条件は何か?
---
両方の分岐が子コンポーネントを描画すること、かつマウント後に現れる側の分岐で問題の子が最初でも最後でもなく、前後どちらにも別の兄弟要素があること。
```

```quiz
この種のバグをアプリ側で回避する方法は?
---
条件付きマウント(`cond ? <div/> : null`)をやめ、要素を常時マウントしたまま`hidden`属性で表示だけを切り替える。`insert()`のブランチ切り替え経路自体を通らなくなる。
```

## 出典

- `piconic-ai/peitho-studio`(`components/StatusBar.tsx`・`components/Studio.tsx`、2026-09-12時点)での実地調査と、そこから切り出した [[barefootjs-nested-fragment-child-unregistered-scope-experiment|独立した最小再現]]。`@barefootjs/client`の`dist/runtime/index.js`を一時的に計装して確認した。
- [piconic-ai/barefootjs#2948](https://github.com/piconic-ai/barefootjs/issues/2948)(過去にこの症状の確認だと思っていたものが無関係な別バグだったと分かりclose——今回はそれとは独立に、実際に動く最小再現で確認している)

#barefootjs #reactivity #hydration
