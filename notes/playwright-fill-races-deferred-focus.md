---
created: 2026-10-08
updated: 2026-10-08
title: Playwright の fill() は、rAF で遅らせたフォーカス移動と競合する
description: rAF で遅らせたフォーカス移動が fill() の全選択と入力の間に挟まり、追記になる flake。すでにフォーカスがあるフィールドには触らない。
tags: [playwright, testing, flaky-test]
---
# Playwright の fill() は、rAF で遅らせたフォーカス移動と競合する

アプリ側で「クリックで編集を開き、次の `requestAnimationFrame` で textarea にフォーカスしてカーソルを末尾に置く」を実装していると、Playwright の `fill()` が約12% の CI 実行で失敗した。失敗時は新しい文字列が既存のテキストに追記されていた。

```
Expected: "Make it red"
Received: "Make it biggerMake it red"
```

`fill()` は、フォーカス → 全選択 → 入力、の順で動く。遅らせたフォーカス処理が全選択と入力の間に挟まると、`setSelectionRange(end, end)` が選択を潰し、入力が追記になる。アプリのバグでもある。フィールドをクリックして文字を選んでから打ち始めたユーザーが、同じフレームに当たれば同じ結果になる。

## 対処: すでにフォーカスがあれば触らない

```ts
export function focusUnsentEdit(): void {
  requestAnimationFrame(() => {
    const field = document.querySelector<HTMLTextAreaElement>('[data-review-editing="true"] textarea')
    if (field === null || field === document.activeElement) return
    field.focus()
    field.setSelectionRange(field.value.length, field.value.length)
  })
}
```

誰かが先にフォーカスしていたなら、その人が選択を作っている可能性があるので尊重する。

## 再現を決定的にする

フレームの発火を止めておき、`fill()` の全選択と入力のちょうど間で遅延処理を走らせる回帰テストを書いた。修正前は `"Make it biggerMake it red"` で落ち、修正後に通る。確率的な flake を決定的なテストに落とすには、競合している2つの処理を自分の手で順序づける。

CI では `trace: 'retain-on-failure'` にして `test-results/` を artifact に上げると、CI でしか起きない失敗を `playwright show-trace` で追える。

## 理解度チェック

```quiz
`fill()` の結果が既存テキストへの追記になった。何がどの間に挟まったか。
---
rAF で遅らせた「フォーカスしてカーソルを末尾に置く」処理が、`fill()` の全選択と入力の間に挟まり、選択を潰した。
```

```quiz
この flake はテスト側だけの問題か。
---
違う。フィールドをクリックして文字を選んでから打ち始めるユーザーも、同じフレームに当たれば同じ結果になる。すでにフォーカスがあるフィールドには触らないのが修正。
```

#playwright #testing #flaky-test
