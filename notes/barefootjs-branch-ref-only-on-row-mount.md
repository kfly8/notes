---
created: 2026-10-08
updated: 2026-10-08
title: "BarefootJS: keyed .map() の行の分岐の中にある ref は、行のマウント時にしか走らなかった"
description: keyed .map() の行の分岐の中の ref は、行のマウント時にしか走らなかった（#3009、PR #3035 で修正）。同じキーで分岐を往復するとキャンバスが真っ白になった。
tags: [barefootjs, dom, reactivity]
---
# BarefootJS: keyed .map() の行の分岐の中にある ref は、行のマウント時にしか走らなかった

[[barefootjs|BarefootJS]] の keyed な `.map()` の行の中で `cond ? <div ref={...}/> : <other/>` と分岐すると、分岐側の `ref` は行が最初にマウントされたときの経路でしか呼ばれなかった。コンパイル結果を読むと、`ref` の呼び出しは分岐の `bindEvents` ではなく行のマウント経路に置かれていた。

2つの形で踏んだ。

- **同じキーのまま分岐を往復する**（piconic-ai/barefootjs#3009）。行が `rendered` → `placeholder` → `rendered` と、同じキーで分岐を一往復すると、3回目の `<div>` は DOM にあるのに `ref` が走らない。サムネイルのキャンバスが `mountSlideCanvas` されず、デッキを開き直すまで真っ白のままだった。Playwright で `outerHTML` を取り、`ref` の1行目が書くはずの `data-slide-canvas-key` が無いことで確認した。
- **最初の分岐入りでも走らない**。セクション見出しの名前入力を `ref={el => el.focus()}` で開いたときにフォーカスしようとしたが、見出しが編集モードに入っても `ref` が走らず、入力にフォーカスが当たらなかった。

#2927（分岐の `ref` の中の `createEffect` が漏れる件、[[barefootjs-ref-effect-leak-in-branch]]）の調査では「分岐の `bindEvents` は再入のたびに走る」と結論していたので、`ref` が走らないのは別の経路だと分かるまで時間がかかった。

## 修正と回避

本家は PR #3035 で、`collectLoopChildRefs` がリアクティブな条件分岐で止まるようにし、分岐の中の `ref` は行ではなく分岐自身の `insert()` の `bindEvents` に集めるようになった（2026-09-17 の Version Packages でリリース）。

修正前の回避は2つ。

- 分岐の両側でキーを共有しない。安定した identity が要らない側（短命のプレースホルダ）には `` `placeholder:${sourceIndex}` `` のような別の名前空間のキーを付け、往復のたびに `.map()` から見て新しいキーにする。すると本当のアンマウントと新規マウントになり、`ref` が走る。
- `ref` でやろうとした仕事を、分岐を切り替えるハンドラ側でやる（名前入力のフォーカスは、編集モードに入れる関数が `querySelector` して `focus()` する）。

## 理解度チェック

```quiz
分岐が `rendered` → `placeholder` → `rendered` と戻ったとき、`<div>` は DOM にあるのに `ref` が走らなかった。どう確かめたか。
---
Playwright で要素の `outerHTML` を取り、`ref` の1行目が書くはずの `data-slide-canvas-key` 属性が無いことを見た。`bf debug graph` ではなく実際の DOM で判断した。
```

```quiz
プレースホルダ側のキーに別の名前空間を使うと直るのはなぜか。
---
往復のたびに `.map()` から見て新しいキーになり、分岐の切り替えではなく行のアンマウントと新規マウントになるため。`ref` は行のマウント経路でなら走る。
```

## 出典

- [piconic-ai/barefootjs#3009](https://github.com/piconic-ai/barefootjs/issues/3009)
- [piconic-ai/barefootjs#3035](https://github.com/piconic-ai/barefootjs/pull/3035)

#barefootjs #dom #reactivity
