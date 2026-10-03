---
created: 2026-09-29
updated: 2026-10-03
title: "@barefootjs/xyflow をブラウザだけで描画するときの抜け"
description: "@barefootjs/xyflow をブラウザだけで描画（CSR）したときに見つかった抜けと、ima での回避。"
tags: [barefootjs, xyflow, csr]
---
# @barefootjs/xyflow をブラウザだけで描画するときの抜け

`@barefootjs/xyflow` は、[[barefootjs]] で書いたノードエディタ部品。パンやズーム、ドラッグ、接続といったポインタ操作はパッケージ本体（`attachFlowSubsystems` など）が受け持ち、`<Flow>` / `<NodeWrapper>` / `<Handle>` / `<SimpleEdge>` などの JSX 部品はレジストリから `bf add xyflow` でアプリにコピーして使う。ima（現在の [[pedit]]）で [[json-canvas]] の編集画面をこれで作ったとき（0.39.0、サーバーを持たずブラウザだけで描画する CSR）、次の抜けがあった。いずれも upstream に報告している。

## 描画（CSR）

- **`<svg>` の中のループに、あとから追加された部品が見えない**（#3265）。ルートが `<g>` の部品を、最初の描画の後にループへ足すと、HTML の名前空間で作られる（`tagName` が大文字の `G`）。`<SimpleEdge>` がこれにあたり、エッジはたいてい描画の後に届くので、1本も表示されなかった。最初の描画からあった要素は SVG の名前空間で作られる。
- **`{props.children ?? ''}` の子が文字列になる**（#3264）。`<Flow>` の子にした `<Background>` や `<Controls>` が、エスケープされた HTML として画面に出た。`{props.children}` なら正しく描かれるので、`?? ''` が引き金になっている。
- **`renderNode` で描いた本体の中で、条件分岐の中のテキストと `hidden` が更新されない**（#3266）。同じ部品を単体で描いたときや、自作の render prop で描いたときは正しく更新されるので、`<Flow>` のループ・条件分岐・`<NodeWrapper>` の子という経路に固有のもの。

## 操作

- **クリックしてもノードが選択されない**（#3267）。`setupNodeSelection` は「node-wrapper から呼ばれる」と書かれているが、JSX の `<NodeWrapper>` は呼んでいない。
- **ハンドルの位置が計られず、ハンドル id 付きのエッジが下から上への既定の経路になる**（#3268）。`updateNodeInternals` を呼ぶのはリサイズの処理だけで、`handleBounds` が埋まらない。さらに `attachFlowSubsystems` のエフェクトが `path[data-id]` と `path[data-hit-id]` の `d` を、ハンドルを使わない計算で上書きする。
- **ノードを計る前に `fitView` を呼ぶと、表示が `NaN` になる**（#3269）。ビューポートが `translate(NaNpx, NaNpx) scale(NaN)` になり、戻らない。
- **ドラッグのコールバックが呼ばれない。** `onNodeDragStart` と `onNodeDragStop` は受け取って store に置かれるが、ドラッグの処理はどちらも呼んでいなかった。0.39.1 で直り、ドラッグ中に毎回呼ばれる `onNodeDrag` も加わった（#3272）。

## 配布物

- **レジストリの `FlowNodeTypeBridge` が、必須の `type` を渡していない**（#3270）。コピーした側で `tsc` を通すと型エラーになる。upstream の `ui` の型検査は別のエラーで先に止まるので、ここまで届かない。
- **ビルドが `@xyflow/system` と d3 を取り込んでいるのに、そのライセンス表記がない**（#3271）。バンドラが見るモジュールの中にこれらが現れないので、「バンドルしたパッケージのライセンスを並べる」仕組みで、黙って漏れる。ima では、依存を取り込むパッケージを列挙し、その依存をたどってライセンスを集めるようにした（型定義だけの `@types/*` は除く）。

## ima での回避

| 抜け | 回避 |
|---|---|
| エッジが見えない・経路が合わない | xyflow のエッジ層の `<svg>` に `createElementNS` で自前の線を描く。xyflow には選択と削除のためだけに `hidden: true` でエッジを渡す。`data-hit-id` は `<g>` に付け、パスには付けない |
| 子が文字列になる | `<Background>` と `<Controls>` を使わない |
| 条件分岐のテキストと `hidden` | 本体を1つの要素にして型ごとに中身を切り替え、見せ分けはカードの型のクラスと CSS で行う |
| クリックで選択されない | 各ノードの要素に自分で `setupNodeSelection` を呼ぶ |
| `fitView` が `NaN` | 表示範囲をデータの座標と大きさから計算して `store.panZoom().setViewport()` を呼ぶ |
| ドラッグのコールバック | 0.39.0 では `store.dragging()` の変化で終わりを検出していた。0.39.1 で `onNodeDragStop` に置き換えた |

もう1つ、`setPointerCapture` を使うドラッグ処理のせいで、ノードの上のダブルクリックの対象がカードではなくノードの外枠（`.bf-flow__node`）になる。カードに付けた `onDoubleClick` は呼ばれないので、ボード全体で1つのハンドラにして、対象から `data-id` を探す形にした。

## 理解度チェック

```quiz
ima で `<SimpleEdge>` を使わず、エッジを `createElementNS` で描いたのはなぜか。
---
CSR でループへあとから足した、ルートが `<g>` の部品が HTML の名前空間で作られて表示されず、しかも `attachFlowSubsystems` がハンドルを使わない計算で `d` を上書きするため。
```

```quiz
`<Flow>` の子の `<Controls>` がエスケープされた HTML として出たとき、何が引き金になっていたか。
---
`<Flow>` が子を `{props.children ?? ''}` で描いていたこと。`{props.children}` なら正しく描かれる。
```

```quiz
xyflow のノードの上でダブルクリックしても、カードに付けた `onDoubleClick` が呼ばれないのはなぜか。
---
ドラッグ処理がノードの外枠に `setPointerCapture` するので、イベントの対象が外枠になり、子であるカードを通らないから。
```

## 出典

- [piconic-ai/barefootjs#3264](https://github.com/piconic-ai/barefootjs/issues/3264)〜[#3271](https://github.com/piconic-ai/barefootjs/issues/3271)（報告した issue）
- [piconic-ai/barefootjs#3272](https://github.com/piconic-ai/barefootjs/pull/3272)（ドラッグのコールバック）
- [piconic-ai/ima#48](https://github.com/piconic-ai/ima/pull/48)（回避の一覧）

#barefootjs #xyflow #csr
