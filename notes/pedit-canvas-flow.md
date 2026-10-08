---
created: 2026-10-08
updated: 2026-10-08
title: pedit が .canvas をノードとエッジとして共有する流れ
description: pedit は .canvas（JSON Canvas）だけ、ファイルの文字列ではなくノードとエッジの構造で共有する。
tags: [pedit, json-canvas, yjs]
---
# pedit が .canvas をノードとエッジとして共有する流れ

[[pedit]] は `.canvas`（[[json-canvas]]）だけ、ファイルの文字列ではなくノードとエッジの構造で共有する。なぜそうしたかは
[[json-canvas-co-editing-text-or-structure]] にある。ここはコードがどう動くか。`internal/canvas`、`internal/session/content.go`、
`packages/web/src/board.ts`、`canvas.ts`、`jsonpane.ts`。v0.1.0。

## 共有される形

Y.Doc の中に3つの共有型を置く（`internal/canvas/doc.go` と `packages/web/src/canvas.ts` が同じ名前を使う）。

| 名前 | 型 | 中身 |
| --- | --- | --- |
| `nodes` | Y.Array of Y.Map | ノード1つが Y.Map。ファイルの順 |
| `edges` | Y.Array of Y.Map | エッジ1つが Y.Map |
| `extra` | Y.Map | ファイルの他のトップレベルのキー |

ノードの `text` だけは Y.Text にする。同じテキストノードに2人が同時に打っても、文字単位でマージされるため。それ以外の
フィールド（`x`、`y`、`width`、`color` など）は Y.Map の値で、同じキーを同時に変えれば後勝ちになる。

## ホスト側

`session.Start` は拡張子が `.canvas` なら `newCanvasContent` を呼ぶ。

1. `canvas.Parse` が JSON Canvas として検証する。不正なら行と列つきの理由を出して、部屋を作らずに終わる。
2. `canvas.Load` が `nodes` / `edges` / `extra` に展開する。
3. awareness の `format` を `"canvas"` にする。ブラウザはこれを見てキャンバスの画面を出し、CLI からの参加は断られる。

`content` インターフェースの2つのメソッドはこうなる。

- `render()` — `canvas.Read(doc)` で構造を読み、`canvas.Render(c, last)` で JSON にする。`last` は前回読んだか書いたファイルで、
  インデントや改行の流儀、変わっていないノードの文字列をそのまま保つ（[[json-layout-preserving-rewrite]]）。`Read` は
  ファイルに書けないもの（id の重複、消えたノードへのエッジ、欠けたフィールド）を落とすので、出力は必ず `Parse` を通る。
- `merge(base, next)` — 両方を `Parse` して `canvas.Apply(doc, base, next, fileOrigin)`。ノードとエッジを id で突き合わせ、
  変わったフィールドだけを書き、`text` は `merge.ExternalEdit` で文字単位にマージする。二度当てると壊れる
  （[[three-way-apply-not-idempotent]]）。

`Read` は `ToSlice()` ではなく `Get(i)` で Y.Map を取り、数値は Yjs が送ってくる `float32` を整数に戻す（`plain` と `whole`）。
このあたりの注意は [[ygo-yjs-nested-types]]。

## ブラウザ側: 2つの編集経路

**ボード**（`board.ts`、xyflow で描く）は共有型を直接変える。ノードを動かせば `moveNodes` が Y.Map の `x` と `y` を書き、
追加・削除は Y.Array に対して行う。ノードの本文は小さな CodeMirror で、`yCollab` でその Y.Text に繋ぐ。これは普通の Yjs の
共同編集で、ホストには `Client` 経由の更新として届き、`OnUpdate` が書き戻しを予約する。

**JSON ペイン**（`jsonpane.ts`）は、キャンバス全体を JSON の文字列として手で直す「裏口」。こちらは共有型を直接変えない。

1. ペインは普段、文書に追従して JSON を表示している（`base` として覚える）。
2. 人が打ち始めたら追従をやめ、入力が止まって JSON として正しくなるたびに `CanvasEdit{id, base, next}` をホストに送る。
   `id` は乱数。不正な JSON はペインの外に出ない。
3. ホストの `handleCanvas` が `canvasContent.edit(id, base, next)` を呼ぶ。両方を `Parse` し、`canvas.Apply(..., editOrigin)` で
   当てる。`origin` が `editOrigin` なので `Session.OnUpdate` が書き戻しを予約する（ファイルから来たものではないので書く）。
4. ホストは `CanvasApplied{id}` か `CanvasRejected{id, reason}` を返す。`reason` には JSON のどこが悪いかが入り、ペインの下に出る。
5. 同じ `id` の edit が再接続後にもう一度届いたら、当てずに `applied` だけ返す（直近256件を覚える）。`Apply` は二度当てると
   挿入が重複するため。
6. ペインは1つの edit の返事を待ってから次を送る。返事を待たずに送ると、同じ `base` から作った2つの差分が両方当たってしまう。

ブラウザ側の `read()` も Go の `Read` と同じ規則でファイルに書けないものを落とし、画面とファイルが同じキャンバスを示すように
している。

## CLI からは入れない

`session.Join` はホストの `format` が `canvas` なら、ブラウザで開くよう案内して終わる。テキストのコピーを作っても、構造の
変更をファイルに写す側の実装がないため。

## 理解度チェック

```quiz
JSON ペインの編集は、ボードの編集と違ってなぜホストを経由するか。
---
JSON の文字列全体を差し替える編集なので、他の人が同時に変えた部分を保ったまま構造に反映するには `canvas.Apply` の三方マージが要るから。ホストは外部編集と同じ経路で当て、結果（applied / rejected）を返す。
```

```quiz
ホストが canvas の edit の `id` を覚えておくのはなぜか。
---
再接続後に同じ edit がもう一度届いたとき、二度当てないため。`Apply` は冪等ではなく、二度当てると挿入が重複する。
```

## 出典

- [piconic-ai/pedit](https://github.com/piconic-ai/pedit) v0.1.0 の `internal/canvas/doc.go`、`apply.go`、`render.go`、`internal/session/content.go`、`internal/protocol/canvas.go`、`packages/web/src/board.ts`、`canvas.ts`、`jsonpane.ts`
- [JSON Canvas Spec 1.0](https://jsoncanvas.org/spec/1.0/)

#pedit #json-canvas #yjs
