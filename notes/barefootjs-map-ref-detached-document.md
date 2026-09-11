---
created: 2026-09-11
updated: 2026-09-11
title: "BarefootJS: keyed .map()の新規行は、refが呼ばれる時点ではまだ本物のドキュメントに属していない"
description: BarefootJSのkeyedな.map()で新しいkeyの行が追加されると、その行のrefコールバックは、要素がまだ実ページのドキュメントに挿入される前、行のマークアップが解析された別の(detachedな)ドキュメントに属した状態で呼ばれる。
tags: [barefootjs, dom, shadow-dom]
---
# BarefootJS: keyed .map()の新規行は、refが呼ばれる時点ではまだ本物のドキュメントに属していない

[[barefootjs]]のkeyedな`.map()`で新しいkeyの行が追加されると、その行の`ref`コールバックは、要素が**まだ実ページのドキュメントに挿入される前**、行のマークアップが解析された別の(detachedな)ドキュメントに属した状態で呼ばれる。`ref`の中で`host.isConnected`は`false`、`host.ownerDocument`も実ページの`document`とは別物になっている。実際に挿入される処理(reparent)はこの`ref`が返った直後、同じ同期tick内で起きる——おそらくHTML5の`<template>`要素の"template contents owner document"の仕組み(`template.content`内のノードは、実際にツリーへ追加されるまでownerDocumentが本体のdocumentとは別になる)に類する挙動で、行のマークアップをそう解析しているものと推測される(BarefootJSのソースそのものでこの一点までは確認できていない)。

## 症状: 新規行でだけShadow DOMのマウントが失敗する

スライド編集GUIで、右クリック→「New Slide」を押しても新しいサムネイルが増えないというバグがあった。「New Slide」自体の処理(Markdownソースの更新)は正しく実行されているのに、サムネイル一覧が増えない。

原因は、新規行の`ref`内で`CSSStyleSheet`を`shadow.adoptedStyleSheets`に代入していた処理。`CSSStyleSheet`は自分の生成元ドキュメントと同じドキュメント(またはそのshadow root)にしかadoptできない——

```
DOMException: Sharing constructed stylesheets in multiple documents is not allowed
```

新規行の`ref`が呼ばれる時点で、行の要素はまだ実ドキュメントに属していないため、実ドキュメント上で生成した`CSSStyleSheet`をこの時点でadoptしようとすると必ず投げる。しかもこのエラーはどこにも表示されなかった——アプリ自身のエラー表示欄も、同じ理由で初回の条件分岐レンダリング時にdetached状態の問題を抱えていたため、投げられたエラー自体が画面に描画されなかった。

## 気づき方

自律的なPlaywright検証(`window.__TAURI_INTERNALS__.invoke`をモックして実フロントエンドを動かす手法。詳細は[[tauri-invoke-mock-testing]])で再現し、`mountSlideCanvas`関数の冒頭に段階的にログを仕込んで`host.isConnected`/`host.ownerDocument === document`を確認して特定した。

## 対処: `host.isConnected`をチェックし、未接続ならマイクロタスク1回分だけ遅延する

```ts
function mountSlideCanvas(host: HTMLElement, sheet: CSSStyleSheet, /* ... */): void {
  if (!host.isConnected) {
    queueMicrotask(() => mountSlideCanvas(host, sheet, /* ... */))
    return
  }
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
  shadow.adoptedStyleSheets = [sheet, /* ... */]
  // ...
}
```

挿入(reparent)は`ref`が返った直後の同期tick内で起きるため、マイクロタスク1回の遅延で十分——挿入を待つのに2回目のリトライが必要になったケースは観測されていない。

## 落とし穴: 行が同期tick内で追加後すぐ削除されると、無限リトライになる

上記の対処だけをレビューに出したところ、次の指摘を受けた: もし行が追加されてから、キューに積んだマイクロタスクが実行される**前**に同期的に削除されると、`host`は一度も接続されないまま終わる。すると`isConnected`は以後ずっと`false`のままなので、`queueMicrotask`による再帰的なリトライが**永遠に終わらず**、`host`・`sheet`・fragment文字列などクロージャが捕まえている参照を永久にリークし続ける。

対処: リトライ回数を`WeakMap<HTMLElement, number>`でホストごとに数え、上限(5回など)に達したら諦めて追跡を打ち切る。

```ts
const MAX_MOUNT_RETRIES = 5
const mountRetryCounts = new WeakMap<HTMLElement, number>()

function mountSlideCanvas(host: HTMLElement, /* ... */): void {
  if (!host.isConnected) {
    const attempt = mountRetryCounts.get(host) ?? 0
    if (attempt >= MAX_MOUNT_RETRIES) {
      mountRetryCounts.delete(host)
      return
    }
    mountRetryCounts.set(host, attempt + 1)
    queueMicrotask(() => mountSlideCanvas(host, /* ... */))
    return
  }
  mountRetryCounts.delete(host)
  // ...
}
```

「実際に挿入されるまで1回のマイクロタスクで足りる」という観測結果と、「一度も接続されないまま終わるケースが理論上ありうる」という指摘は両立する——前者は正常系の実測、後者は異常系(行の即時追加即時削除)の理論的な穴で、実測だけでは見えない。

## 理解度チェック

```quiz
BarefootJSのkeyedな.map()で新規行が追加されたとき、その行のrefコールバックが呼ばれる時点で、host.isConnectedとhost.ownerDocumentはどうなっているか?
---
host.isConnectedはfalse、host.ownerDocumentも実ページのdocumentとは別のドキュメント(行のマークアップが解析されたdetachedなドキュメント)になっている。実際の挿入(reparent)はrefが返った直後の同期tick内で起きる。
```

```quiz
新規行のref内でCSSStyleSheetをshadow.adoptedStyleSheetsに代入すると何が起きるか、なぜそれが画面上まったく見えなかったか?
---
「Sharing constructed stylesheets in multiple documents is not allowed」というDOMExceptionが投げられる。CSSStyleSheetは生成元ドキュメントと同じドキュメント(またはそのshadow root)にしかadoptできないため。このエラーは画面に表示されなかった——アプリ自身のエラー表示欄も、同じdetached-document問題を初回の条件分岐レンダリングで抱えていたため。
```

```quiz
「host.isConnectedがfalseならqueueMicrotaskで1回遅延する」という対処だけでは、どんな状況で無限ループになりうるか?
---
行が追加されてから、キューに積んだマイクロタスクが実行される前に同期的に削除された場合。hostは一度も接続されないままなのでisConnectedはずっとfalseになり、queueMicrotaskによる再帰的なリトライが永遠に終わらず、クロージャが捕まえている参照をリークし続ける。リトライ回数の上限を設けて対処する。
```

## 出典

- スライド編集GUI(Tauri + BarefootJS CSR)の「New Slide」機能で発生した実バグの調査・修正から。BarefootJSの`mapArray`/`createItemScope`/`insertScope`の実行順序をランタイムソースで確認し、自律的なPlaywright検証(詳細は[[tauri-invoke-mock-testing]])で`host.isConnected`/`host.ownerDocument`の値を実測して特定した。無限リトライの指摘はコードレビュー(Pullfrog)で受けた。

#barefootjs #dom #shadow-dom
